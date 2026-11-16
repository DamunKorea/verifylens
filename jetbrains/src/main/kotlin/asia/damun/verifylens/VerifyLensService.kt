package asia.damun.verifylens

import com.intellij.ide.trustedProjects.TrustedProjects
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.util.Alarm
import com.intellij.util.messages.Topic
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** 결과나 진행 상태가 바뀌면 화면 스레드에서 불린다. */
interface VerifyLensListener {
    fun changed()

    companion object {
        @JvmField
        val TOPIC: Topic<VerifyLensListener> = Topic.create("VerifyLens result", VerifyLensListener::class.java)
    }
}

/** 프로젝트 하나의 VerifyLens 상태: 마지막 결과, 다시 확인, 에디터 표시. */
@Service(Service.Level.PROJECT)
class VerifyLensService(private val project: Project) : Disposable {
    enum class Job { CHECK, DEMO }

    @Volatile
    var result: EngineResult? = null
        private set

    @Volatile
    var lastJob: Job? = null
        private set

    @Volatile
    var busy = false
        private set

    /** 마지막으로 직접 실행한 확인이 실패했을 때의 까닭. 성공하면 지운다. */
    @Volatile
    var lastProblem: String? = null
        private set

    val markers = Markers(project)

    private val running = AtomicBoolean(false)
    private val pending = AtomicReference<Job?>(null)
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)

    init {
        // 파일이 저장되거나(자동 저장 포함) 에디터 밖에서 바뀌면 다시 확인한다.
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun after(events: List<VFileEvent>) = onFilesChanged(events)
        })
    }

    /** 확인을 시작한다. silent 는 저장 뒤 스스로 다시 볼 때: 알림을 띄우지 않고, 실패하면 이전 결과를 그대로 둔다. */
    fun start(job: Job, silent: Boolean = false) {
        if (project.isDisposed) return
        if (job == Job.CHECK && !silent && !TrustedProjects.isProjectTrusted(project)) {
            problem("이 프로젝트는 아직 신뢰하지 않은 상태(안전 모드)입니다. 내 변경을 확인하려면 프로젝트를 신뢰해야 합니다. 샘플은 지금도 해 볼 수 있습니다.")
            return
        }
        val node = NodeLocator.find(project)
        if (node == null) {
            if (!silent) {
                lastProblem = NO_NODE
                Notify.noNode(project)
                publish()
            }
            return
        }
        if (!running.compareAndSet(false, true)) {
            pending.set(job) // 지금 도는 확인이 끝나면 한 번 더 본다
            return
        }
        busy = true
        publish()
        if (silent) {
            ApplicationManager.getApplication().executeOnPooledThread {
                val r = compute(job, node)
                ApplicationManager.getApplication().invokeLater({ finish(job, r, true) }, project.disposed)
            }
            return
        }
        val title = if (job == Job.DEMO) "VerifyLens: 샘플(로그인 잠금 가상 사례) 분석" else "VerifyLens: 내 변경 확인"
        object : Task.Backgroundable(project, title, false) {
            private var r: EngineResult? = null

            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                r = compute(job, node)
            }

            override fun onFinished() = finish(job, r ?: EngineResult.failure("engine-failed", "분석이 중단되었습니다."), false)
        }.queue()
    }

    /** 마지막에 한 것을 다시 한다. 아직 아무것도 안 했으면 내 변경을 확인한다. */
    fun rerun() = start(lastJob ?: Job.CHECK)

    private fun compute(job: Job, node: String): EngineResult = when (job) {
        Job.CHECK -> {
            val dir = project.basePath
            if (dir == null) EngineResult.failure("no-repo", "열린 프로젝트의 폴더를 알 수 없습니다.") else Engine.run(node, "check", "--repo", dir)
        }
        Job.DEMO -> {
            val samples = Engine.samples()
            if (samples == null) EngineResult.failure("no-engine", "샘플 파일을 찾지 못했습니다. 플러그인을 다시 설치해 주세요.")
            else Engine.run(node, "demo", "--samples", samples.toString())
        }
    }

    private fun finish(job: Job, r: EngineResult, silent: Boolean) {
        running.set(false)
        busy = false
        if (project.isDisposed) return
        if (r.ok) {
            result = r
            lastJob = job
            lastProblem = null
            markers.apply(r)
            if (!silent) {
                for (n in r.notes) Notify.warn(project, n)
                r.demoHeadline?.let { Notify.info(project, it) }
            }
        } else if (silent) {
            // 저장 도중처럼 잠깐 읽을 수 없는 상태일 수 있다. 기록만 하고 이전 결과를 둔다.
            LOG.info("VerifyLens re-check failed: ${r.code} ${r.error}")
        } else if (r.code == "no-requirements") {
            lastProblem = "${r.error} 이번 작업의 요구사항을 한 줄씩 적어 두면, 코드의 근거 줄과 이어서 확인합니다."
            Notify.warn(project, lastProblem!!, "요구사항 파일 만들기" to { createRequirements() })
        } else {
            lastProblem = r.error ?: "분석에 실패했습니다."
            Notify.error(project, lastProblem!!)
        }
        publish()
        pending.getAndSet(null)?.let { start(it, silent = true) }
    }

    private fun problem(text: String) {
        lastProblem = text
        Notify.warn(project, text)
        publish()
    }

    /** 요구사항 파일(.verifylens/requirements.md)을 예시와 함께 만들고 연다. 이미 있으면 열기만 한다. */
    fun createRequirements() {
        val dir = project.basePath ?: return
        val node = NodeLocator.find(project) ?: return Notify.noNode(project)
        ApplicationManager.getApplication().executeOnPooledThread {
            val r = Engine.run(node, "init-requirements", "--repo", dir)
            val file = r.requirements?.takeIf { r.ok }?.let { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(Path.of(it)) }
            ApplicationManager.getApplication().invokeLater({
                if (file != null) {
                    OpenFileDescriptor(project, file).navigate(true)
                    Notify.info(project, "요구사항을 한 줄씩 적은 뒤 「내 변경 확인」을 누르세요. 적혀 있는 두 줄은 예시입니다.")
                } else {
                    Notify.error(project, r.error ?: "요구사항 파일을 만들지 못했습니다.")
                }
            }, project.disposed)
        }
    }

    /** 근거가 된 파일의 그 줄을 연다. */
    fun open(setKey: String, file: String, line: Int) {
        val r = result ?: return
        val vf = markers.fileFor(r, setKey, file) ?: return Notify.warn(project, "파일을 찾지 못했습니다: $file")
        OpenFileDescriptor(project, vf, maxOf(0, line - 1), 0).navigate(true)
    }

    private fun onFilesChanged(events: List<VFileEvent>) {
        val r = result ?: return
        if (lastJob != Job.CHECK || r.kind != "repo" || alarm.isDisposed) return
        val repo = FileUtil.toSystemIndependentName(r.repo).trimEnd('/')
        val watch = r.watch.map { FileUtil.toSystemIndependentName(it) }
        if (events.none { relevant(it.path, repo, watch) }) return
        alarm.cancelAllRequests()
        alarm.addRequest({ start(Job.CHECK, silent = true) }, RECHECK_DELAY_MS)
    }

    private fun relevant(path: String, repo: String, watch: List<String>): Boolean {
        if (watch.any { FileUtil.pathsEqual(it, path) }) return true
        if (!FileUtil.isAncestor(repo, path, true)) return false
        val rel = path.substring(repo.length).trimStart('/')
        // 커밋 · 브랜치 이동
        if (rel.startsWith(".git/")) return rel == ".git/HEAD" || rel.startsWith(".git/refs/heads/")
        if (rel.startsWith("node_modules/") || rel.contains("/node_modules/")) return false
        return CODE_FILE.containsMatchIn(rel)
    }

    private fun publish() {
        val app = ApplicationManager.getApplication()
        val fire = Runnable { if (!project.isDisposed) project.messageBus.syncPublisher(VerifyLensListener.TOPIC).changed() }
        if (app.isDispatchThread) fire.run() else app.invokeLater(fire, project.disposed)
    }

    override fun dispose() = markers.clear()

    companion object {
        private val LOG = Logger.getInstance(VerifyLensService::class.java)
        private val CODE_FILE = Regex("""\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$""")
        private const val RECHECK_DELAY_MS = 800
        const val NO_NODE = "Node.js 를 찾지 못했습니다. VerifyLens 는 분석 엔진을 이 PC 의 Node.js 로 돌립니다. " +
            "nodejs.org 에서 Node.js(LTS, 18 이상)를 설치한 뒤 IDE 를 다시 시작하거나, 이미 설치돼 있다면 node 실행 파일의 위치를 알려 주세요."

        fun getInstance(project: Project): VerifyLensService = project.getService(VerifyLensService::class.java)
    }
}

package asia.damun.verifylens

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.editor.impl.DocumentMarkupModel
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowEP
import com.intellij.testFramework.HeavyPlatformTestCase
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.TestActionEvent
import java.awt.Component
import java.awt.Container
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import javax.swing.JComponent

/**
 * 머리 없는(headless) IDE 를 띄워 플러그인을 실제로 돌려 보는 시험.
 * 저장소를 프로젝트로 열고, 「내 변경 확인」 동작을 눌러, 도구 창의 줄 · 줄 번호 옆 아이콘 · 줄 끝 설명을 확인한다.
 *
 * 저장소는 -PpracticeRepo=폴더 로 주면 그 폴더의 사본(원본은 건드리지 않는다)이고,
 * 주지 않으면 samples/login-lockout 으로 같은 모양의 저장소를 만든다 (main ← feature/lockout-b, `failures > 5`).
 */
class VerifyLensPluginTest : HeavyPlatformTestCase() {
    private lateinit var repo: Path
    private val engineDir: Path get() = Path.of(System.getProperty("verifylens.engine.dir"))

    override fun isCreateDirectoryBasedProject() = true

    override fun getProjectDirOrFile(isDirectoryBasedProject: Boolean): Path {
        val dir = Files.createTempDirectory("verifylens-ide-test-").toRealPath().resolve("repo")
        val practice = System.getProperty("verifylens.practiceRepo")?.takeIf { it.isNotBlank() }
        when {
            // 이 시험은 검사를 고쳐서 통과시킨 저장소가 따로 필요하다
            name == "testChangedTestIsShownNextToTheVerdict" -> buildEditedTestRepo(dir)
            practice != null -> copyTree(Path.of(practice), dir)
            else -> buildSampleRepo(dir)
        }
        repo = dir
        return dir
    }

    override fun setUp() {
        super.setUp()
        // 아래 시험들은 한국어 화면을 본다. 영어 화면 시험은 저마다 언어를 바꾼다.
        System.setProperty("verifylens.lang", "ko")
    }

    override fun tearDown() {
        val temp = repo.parent.toFile() // super.tearDown() 이 시험 클래스의 필드를 비우므로 먼저 꺼내 둔다
        try {
            System.clearProperty("verifylens.node")
            System.clearProperty("verifylens.lang")
            I18n.setting = I18n.AUTO
        } finally {
            super.tearDown()
        }
        FileUtil.delete(temp)
    }

    // ---------------------------------------------------------------- 시험

    /** 저장소를 열어 「내 변경 확인」을 누르면 R2 가 「다름 · 6번째 시도에 동작」으로 나온다. */
    fun testCheckMyChangesShowsR2ActsOnSixthAttempt() {
        val service = VerifyLensService.getInstance(project)
        val r = press("VerifyLens.CheckChanges")
        println("[VerifyLens 시험] 저장소: ${System.getProperty("verifylens.practiceRepo") ?: "(샘플로 만든 저장소)"} → 사본 $repo")
        println("[VerifyLens 시험] ${r.headline} · ${r.context} · ${r.status}")

        // 1) 맨 위 한 줄 요약과 요구사항별 상태
        assertEquals("repo", r.kind)
        assertEquals("요구사항 3개 중 1개만 근거와 검사로 확인됨", r.headline)
        assertEquals("feature/lockout-b ← main", r.context)
        assertEquals(listOf("R1" to "확인됨", "R2" to "다름", "R3" to "미확인"), r.rows.map { it.id to it.overall })
        val r2 = r.rows.first { it.id == "R2" }
        assertEquals("6번째 시도에 동작 (요구사항 5회) — 검사는 통과", r2.summary)

        // 2) 도구 창에 그려지는 줄
        val panel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, panel)
        val rows = panel.rowTexts()
        rows.forEach { println("[VerifyLens 시험] 도구 창 | $it") }
        assertEquals("요구사항 3개 중 1개만 근거와 검사로 확인됨", panel.headlineText())
        assertEquals(6, rows.size)
        assertEquals("R2  다름   연속 5회 실패하면 계정을 잠근다", rows[2])
        assertEquals("auth.ts:21   6번째 시도에 동작 (요구사항 5회) · 검사는 통과", rows[3])
        assertEquals("R3  미확인 · 검사 없음   잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다", rows[4])
        shot(panel, 560, 300, "tool-window")

        // 3) 근거 줄: 줄 번호 옆 아이콘과 줄 끝 설명
        val auth = file("src/auth.ts")
        assertEquals(listOf(8 to "R1", 12 to "R3", 21 to "R2"), service.markers.lensesIn(auth).map { it.first to it.second.reqId }.sortedBy { it.first })
        val note = VerifyLensLinePainter().getLineExtensions(project, auth, 20)!!.single().text
        println("[VerifyLens 시험] 21번째 줄 끝 | ${note.trim()}")
        assertEquals("← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과", note.trim())
        val doc = FileDocumentManager.getInstance().getDocument(auth)!!
        val gutter = DocumentMarkupModel.forDocument(doc, project, false)!!.allHighlighters
            .filter { it.gutterIconRenderer != null && doc.getLineNumber(it.startOffset) == 20 }
        assertEquals(1, gutter.size)
        assertEquals(VerifyLensIcons.gutter("다름"), gutter[0].gutterIconRenderer!!.icon)
        assertTrue(gutter[0].gutterIconRenderer!!.tooltipText!!.startsWith("VerifyLens R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과"))
        assertNotNull("「다름」 줄은 배경을 칠한다", gutter[0].getTextAttributes(null)?.backgroundColor)

        // 4) 줄을 누르면 그 파일의 그 줄로 간다
        service.open("A", "src/auth.ts", 21)
        val editor = FileEditorManager.getInstance(project).selectedTextEditor!!
        assertEquals(auth, FileDocumentManager.getInstance().getFile(editor.document))
        assertEquals(20, editor.caretModel.logicalPosition.line)
        assertTrue(editor.document.getText().lines()[20].contains("user.failures > 5"))
        shot((editor as EditorEx).component, 980, 520, "editor")
    }

    /** 파일을 고쳐 저장하면 스스로 다시 확인하고, 고치기 전의 테스트 결과는 믿지 않는다. */
    fun testSavingAFileChecksAgain() {
        val service = VerifyLensService.getInstance(project)
        press("VerifyLens.CheckChanges")
        val auth = file("src/auth.ts")
        val doc = FileDocumentManager.getInstance().getDocument(auth)!!
        TimeUnit.MILLISECONDS.sleep(1600) // 테스트 결과 파일보다 분명히 뒤에 고친 것이 되게
        WriteCommandAction.runWriteCommandAction(project) {
            doc.setText(doc.text.replace("user.failures > 5", "user.failures >= 5"))
        }
        FileDocumentManager.getInstance().saveDocument(doc)
        PlatformTestUtil.waitWithEventsDispatching("저장 뒤 다시 확인되지 않았습니다", { row(service, "R2")?.overall != "다름" }, 60)

        val r2 = row(service, "R2")!!
        println("[VerifyLens 시험] 저장 뒤 | R2 ${r2.overall} · ${r2.reason} | ${service.result!!.notes}")
        assertEquals("미확인", r2.overall)
        assertEquals("검사 오래됨", r2.reason)
        assertTrue(service.result!!.notes.any { it.contains("테스트 결과가 코드보다 오래되어") })
        assertEquals("feature/lockout-b + 커밋 전 변경 ← main", service.result!!.context)
        val note = VerifyLensLinePainter().getLineExtensions(project, auth, 20)!!.single().text.trim()
        println("[VerifyLens 시험] 저장 뒤 21번째 줄 끝 | $note")
        assertEquals("← R2 · 미확인 · 5번째 시도에 동작 · 검사 미실행", note)
    }

    /** 「샘플로 해 보기」: 내 코드 없이 로그인 잠금 예(결과 A · B)를 보여 준다. */
    fun testSampleDemo() {
        val service = VerifyLensService.getInstance(project)
        val r = press("VerifyLens.RunDemo")
        assertEquals("demo", r.kind)
        assertEquals("요구사항 3개 중 1개만 근거와 검사로 확인됨", r.headline)
        assertEquals(listOf("A", "B"), r.sets.map { it.key })
        val r2 = r.rows.first { it.id == "R2" }
        assertEquals("다름", r2.overall)
        assertEquals("결과 B: 6번째 시도에 동작 (요구사항 5회) — 검사는 통과", r2.summary)

        val panel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, panel)
        panel.rowTexts().forEach { println("[VerifyLens 시험] 샘플 도구 창 | $it") }
        shot(panel, 560, 340, "tool-window-demo")

        // 결과 B 의 근거 줄을 누르면 읽기 전용 문서로 열리고, 같은 표시가 붙는다.
        val b = r2.children.first { it.setKey == "B" }
        service.open("B", b.file!!, b.line!!)
        val editor = FileEditorManager.getInstance(project).selectedTextEditor!!
        val vf = FileDocumentManager.getInstance().getFile(editor.document)!!
        assertEquals("결과 B · auth.ts", vf.name)
        assertFalse(vf.isWritable)
        assertEquals(b.line!! - 1, editor.caretModel.logicalPosition.line)
        val note = VerifyLensLinePainter().getLineExtensions(project, vf, b.line!! - 1)!!.single().text.trim()
        println("[VerifyLens 시험] 샘플 결과 B ${b.line}번째 줄 끝 | $note")
        assertEquals("← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과 · A와 조건 다름", note)
    }

    /** 요구사항 파일이 없으면 까닭을 알려 주고, 만들기를 누르면 예시가 든 파일을 만든다. */
    fun testMissingRequirementsFileIsExplained() {
        val service = VerifyLensService.getInstance(project)
        Files.delete(repo.resolve(".verifylens/requirements.md"))
        pressRaw("VerifyLens.CheckChanges")
        PlatformTestUtil.waitWithEventsDispatching("끝나지 않았습니다", { !service.busy && (service.result != null || service.lastProblem != null) }, 60)
        assertNull(service.result)
        assertTrue(service.lastProblem!!, service.lastProblem!!.startsWith("요구사항 파일(.verifylens/requirements.md)이 없습니다."))

        service.createRequirements()
        PlatformTestUtil.waitWithEventsDispatching("요구사항 파일이 열리지 않았습니다", { FileEditorManager.getInstance(project).selectedFiles.any { it.name == "requirements.md" } }, 60)
        val text = Files.readString(repo.resolve(".verifylens/requirements.md"))
        assertTrue(text.contains("- R2: 연속 5회 실패하면 계정을 잠근다"))
        assertFalse("VS Code 명령 안내는 넣지 않는다", text.contains("Import requirements"))
        assertEquals(listOf("R1", "R2"), press("VerifyLens.CheckChanges").rows.map { it.id })
    }

    /** 설치된 플러그인 폴더 안의 engine/ 에서 엔진과 샘플을 찾는다 (시험용 경로 지정 없이). */
    fun testEngineIsFoundInsideTheInstalledPlugin() {
        val override = System.getProperty("verifylens.engine.dir")
        System.clearProperty("verifylens.engine.dir")
        try {
            val plugin = PluginManagerCore.getPlugin(PluginId.getId(Engine.PLUGIN_ID))
            assertNotNull("플러그인이 IDE 에 올라와 있지 않습니다", plugin)
            val script = Engine.script()
            println("[VerifyLens 시험] 설치된 엔진 | $script")
            assertNotNull("플러그인 폴더에서 엔진을 찾지 못했습니다: ${plugin!!.pluginPath}", script)
            assertTrue(script!!.startsWith(plugin.pluginPath))
            assertNotNull(Engine.samples())
            assertEquals("demo", press("VerifyLens.RunDemo").kind)
        } finally {
            System.setProperty("verifylens.engine.dir", override)
        }
    }

    /** 도구 창 「VerifyLens」와 그 위의 단추들이 등록되어 있다. */
    fun testToolWindowAndToolbarAreRegistered() {
        val ep = ToolWindowEP.EP_NAME.extensionList.single { it.id == TOOL_WINDOW_ID }
        assertEquals(VerifyLensToolWindowFactory::class.java.name, ep.factoryClass)

        val group = ActionManager.getInstance().getAction("VerifyLens.Toolbar") as DefaultActionGroup
        val actions = group.getChildren(ActionManager.getInstance()).toList()
        // plugin.xml 의 이름은 영어 기본값이고, 화면에는 화면 언어의 이름이 나온다.
        assertEquals(listOf("Check My Changes", "Try the Sample", "Check Again"), actions.map { it.templatePresentation.text })
        assertEquals(listOf("내 변경 확인", "샘플로 해 보기", "다시 확인"), actions.map { shownText(it) })
        System.setProperty("verifylens.lang", "en")
        assertEquals(listOf("Check my changes", "Try the sample", "Check again"), actions.map { shownText(it) })
        assertNotNull(ActionManager.getInstance().getAction("VerifyLens.Menu"))
        assertNotNull(ActionManager.getInstance().getAction("VerifyLens.SetLanguage"))
    }

    /** Node.js 를 찾지 못하면 무엇을 설치해야 하는지 알려 준다. */
    fun testMissingNodeIsExplained() {
        val service = VerifyLensService.getInstance(project)
        System.setProperty("verifylens.node", repo.resolve("no-such-node.exe").toString())
        pressRaw("VerifyLens.RunDemo")
        PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
        assertNull(service.result)
        assertEquals(VerifyLensService.noNode(), service.lastProblem)
        assertTrue(service.lastProblem!!.startsWith("Node.js 를 찾지 못했습니다."))
    }

    // ---------------------------------------------------------------- 영어 화면

    /** 화면 언어: 정해 두지 않으면 IDE 언어를 따른다 (한국어 IDE 면 한국어, 그 밖에는 영어). */
    fun testLanguageFollowsTheIde() {
        assertEquals("ko", I18n.resolve(I18n.AUTO, Locale.KOREAN))
        assertEquals("ko", I18n.resolve(I18n.AUTO, Locale.KOREA))
        assertEquals("en", I18n.resolve(I18n.AUTO, Locale.ENGLISH))
        assertEquals("en", I18n.resolve(I18n.AUTO, Locale.JAPANESE))
        assertEquals("en", I18n.resolve(null, null))
        assertEquals("ko", I18n.resolve("ko", Locale.ENGLISH))
        assertEquals("en", I18n.resolve("en", Locale.KOREAN))
    }

    /** 영어 화면: 도구 창 · 줄 끝 설명 · 알림이 영어로 나오고, 판정은 한국어 화면과 같다. */
    fun testEnglishUi() {
        System.setProperty("verifylens.lang", "en")
        val service = VerifyLensService.getInstance(project)
        // 영어로 적은 요구사항 (샘플의 requirements.en.md 와 같다)
        Files.copy(engineDir.resolve("samples/login-lockout/requirements.en.md"), repo.resolve(".verifylens/requirements.md"), StandardCopyOption.REPLACE_EXISTING)
        val r = press("VerifyLens.CheckChanges")
        println("[VerifyLens 시험] 영어 | ${r.headline} · ${r.context} · ${r.status}")
        assertEquals("1 of 3 requirements verified by evidence and tests", r.headline)
        assertEquals("Verified 1 · Different 1 · Failed 0 · Not verified 1", r.status)
        assertEquals(listOf("R1" to "확인됨", "R2" to "다름", "R3" to "미확인"), r.rows.map { it.id to it.overall })
        assertEquals("acts on attempt 6 (requirement: 5) — but the test passes", r.rows.first { it.id == "R2" }.summary)

        val panel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, panel)
        val rows = panel.rowTexts()
        rows.forEach { println("[VerifyLens 시험] 영어 도구 창 | $it") }
        assertEquals("R2  Different   Lock the account after 5 consecutive failures", rows[2])
        assertEquals("auth.ts:21   acts on attempt 6 (requirement: 5) · but the test passes", rows[3])
        assertEquals("R3  Not verified · no test   A locked account cannot log in even with the right password", rows[4])
        assertNoKorean(panel.allTexts(), "tool window")
        shot(panel, 620, 300, "tool-window-en")
        shot(panel, 340, 300, "tool-window-en-narrow")

        val auth = file("src/auth.ts")
        val note = VerifyLensLinePainter().getLineExtensions(project, auth, 20)!!.single().text.trim()
        println("[VerifyLens 시험] 영어 21번째 줄 끝 | $note")
        assertEquals("← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes", note)
        val doc = FileDocumentManager.getInstance().getDocument(auth)!!
        val tips = DocumentMarkupModel.forDocument(doc, project, false)!!.allHighlighters.mapNotNull { it.gutterIconRenderer?.tooltipText }
        assertNoKorean(tips, "gutter tooltips")
        service.open("A", "src/auth.ts", 21)
        shot((FileEditorManager.getInstance(project).selectedTextEditor as EditorEx).component, 1100, 520, "editor-en")

        // 샘플도 영어 요구사항으로 나온다
        val d = press("VerifyLens.RunDemo")
        assertEquals("Lock the account after 5 consecutive failures", d.rows.first { it.id == "R2" }.text)
        assertEquals("Result B: acts on attempt 6 (requirement: 5) — but the test passes", d.rows.first { it.id == "R2" }.summary)
        assertEquals("The AI said \"all requirements implemented, done\" for both results, and every test passes. Yet only 1 of 3 requirements are verified by evidence and tests.", d.demoHeadline)
        val b = d.rows.first { it.id == "R2" }.children.first { it.setKey == "B" }
        service.open("B", b.file!!, b.line!!)
        assertEquals("Result B · auth.ts", FileDocumentManager.getInstance().getFile(FileEditorManager.getInstance(project).selectedTextEditor!!.document)!!.name)
        val demoPanel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, demoPanel)
        assertNoKorean(demoPanel.allTexts(), "demo tool window")
        assertTrue(VerifyLensService.noNode().startsWith("Node.js was not found."))
    }

    /** 화면 언어를 바꾸면 마지막 확인을 그 언어로 다시 한다. */
    fun testSwitchingLanguageRedoesTheResult() {
        System.clearProperty("verifylens.lang")
        I18n.setting = "ko"
        val service = VerifyLensService.getInstance(project)
        assertEquals("요구사항 3개 중 1개만 근거와 검사로 확인됨", press("VerifyLens.RunDemo").headline)
        applyLanguage(project, "en")
        PlatformTestUtil.waitWithEventsDispatching("언어를 바꾼 뒤 다시 만들어지지 않았습니다", { !service.busy && service.result?.headline?.startsWith("1 of 3") == true }, 120)
        assertEquals("Different", I18n.overall("다름"))
        applyLanguage(project, I18n.AUTO)
        assertEquals(I18n.AUTO, I18n.setting)
    }

    /**
     * 검사를 고쳐서 통과시킨 경우 (요구사항은 5회인데 검사의 반복을 6으로 바꿈).
     * 판정은 「확인됨」 그대로 두고, 그 옆과 아래에 「검사 바뀜」을 알린다. 검사를 되돌리면 알림이 사라진다.
     */
    fun testChangedTestIsShownNextToTheVerdict() {
        System.setProperty("verifylens.lang", "en")
        val service = VerifyLensService.getInstance(project)
        val r = press("VerifyLens.CheckChanges")
        println("[VerifyLens 시험] 바뀐 검사 | ${r.headline} · ${r.context} · ${r.status}")
        assertEquals(listOf("R1" to "확인됨"), r.rows.map { it.id to it.overall })
        assertEquals("feature/tidy + uncommitted changes ← main", r.context)
        val changed = r.changedTests["R1"]!!.single()
        assertEquals("test/auth.test.ts", changed.file)
        assertEquals(5, changed.line)
        assertEquals("\"locks the account after 5 consecutive failures\" (test/auth.test.ts:5) — test changed in this change: 5 → 6", changed.text)

        // 도구 창: 요구사항 줄에 「⚠ test changed」, 근거 줄 아래에 바뀐 검사 한 줄
        val panel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, panel)
        val rows = panel.rowTexts()
        rows.forEach { println("[VerifyLens 시험] 바뀐 검사 도구 창 | $it") }
        assertEquals(3, rows.size)
        assertEquals("R1  Verified · ⚠ test changed   Lock the account after 5 consecutive failures", rows[0])
        assertTrue(rows[1], rows[1].startsWith("auth.ts:3   "))
        assertEquals("auth.test.ts:5   test changed in this change: 5 → 6", rows[2])
        assertTrue(panel.allTexts().any { it.contains("⚠ \"locks the account after 5 consecutive failures\" (test/auth.test.ts:5) — test changed in this change: 5 → 6") })
        assertNoKorean(panel.allTexts(), "tool window")
        shot(panel, 620, 200, "tool-window-changed-test")

        // 바뀐 검사 줄을 누르면 검사 파일의 그 줄로 간다
        service.open(changed.setKey, changed.file, changed.line)
        val editor = FileEditorManager.getInstance(project).selectedTextEditor!!
        assertEquals(file("test/auth.test.ts"), FileDocumentManager.getInstance().getFile(editor.document))
        assertEquals(4, editor.caretModel.logicalPosition.line)
        assertTrue(editor.document.text.lines()[6].contains("i < 6"))

        // 한국어 화면
        System.setProperty("verifylens.lang", "ko")
        val ko = press("VerifyLens.CheckChanges")
        assertEquals("\"locks the account after 5 consecutive failures\" (test/auth.test.ts:5) — 이번 변경에서 검사가 바뀜: 5 → 6", ko.changedTests["R1"]!!.single().text)
        val koPanel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, koPanel)
        val koRows = koPanel.rowTexts()
        koRows.forEach { println("[VerifyLens 시험] 바뀐 검사 도구 창(한국어) | $it") }
        assertEquals("R1  확인됨 · ⚠ 검사 바뀜   Lock the account after 5 consecutive failures", koRows[0])
        assertEquals("auth.test.ts:5   이번 변경에서 검사가 바뀜: 5 → 6", koRows[2])

        // 검사를 되돌리면(반복 5) 알림이 사라진다. 판정은 그대로 「확인됨」.
        Files.writeString(repo.resolve("test/auth.test.ts"), lockoutTest(5))
        Files.writeString(repo.resolve(".verifylens/junit.xml"), LOCKOUT_JUNIT)
        LocalFileSystem.getInstance().refreshAndFindFileByNioFile(repo.resolve("test/auth.test.ts"))!!.refresh(false, false)
        val back = press("VerifyLens.CheckChanges")
        assertEquals(listOf("R1" to "확인됨"), back.rows.map { it.id to it.overall })
        assertTrue(back.changedTests.isEmpty())
        val backPanel = VerifyLensPanel(project)
        Disposer.register(testRootDisposable, backPanel)
        assertEquals("R1  확인됨   Lock the account after 5 consecutive failures", backPanel.rowTexts()[0])
        assertEquals(2, backPanel.rowTexts().size)
    }

    /** 샘플(로그인 잠금)에는 바뀐 검사가 없다: 새로 생긴 검사는 「바뀐 검사」가 아니다. */
    fun testSampleHasNoChangedTests() {
        assertTrue(press("VerifyLens.CheckChanges").changedTests.isEmpty())
        assertTrue(press("VerifyLens.RunDemo").changedTests.isEmpty())
    }

    // ---------------------------------------------------------------- 도우미

    /** 동작을 누르고 결과를 기다린다. */
    private fun press(id: String): EngineResult {
        val service = VerifyLensService.getInstance(project)
        val before = service.result
        pressRaw(id)
        PlatformTestUtil.waitWithEventsDispatching("「$id」 결과가 나오지 않았습니다", { !service.busy && (service.result !== before || service.lastProblem != null) }, 120)
        assertNull(service.lastProblem, service.lastProblem)
        return service.result!!
    }

    private fun pressRaw(id: String) {
        val action = ActionManager.getInstance().getAction(id)
        assertNotNull("동작 $id 이(가) 등록되어 있지 않습니다", action)
        val context = SimpleDataContext.getProjectContext(project)
        val event = TestActionEvent.createTestEvent(action, context)
        action.update(event)
        assertTrue(event.presentation.isEnabled)
        action.actionPerformed(event)
    }

    private fun row(service: VerifyLensService, id: String) = service.result?.rows?.firstOrNull { it.id == id }

    /** 동작이 화면에 보여 주는 이름 (update 를 거친 뒤의 이름) */
    private fun shownText(action: com.intellij.openapi.actionSystem.AnAction): String {
        val event = TestActionEvent.createTestEvent(action, SimpleDataContext.getProjectContext(project))
        action.update(event)
        return event.presentation.text
    }

    private fun assertNoKorean(texts: List<String>, what: String) {
        val hangul = Regex("[가-힣]")
        val bad = texts.filter { hangul.containsMatchIn(it) }
        assertTrue("$what still has Korean: $bad", bad.isEmpty())
    }

    private fun file(rel: String): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(repo.resolve(rel))!!

    /** 화면에 띄우지 않은 채로 그려서 PNG 로 남긴다 (build/shots). 그리기에 실패해도 시험은 계속한다. */
    private fun shot(c: JComponent, w: Int, h: Int, name: String) {
        val dir = System.getProperty("verifylens.shots") ?: return
        try {
            c.setSize(w, h)
            repeat(3) { layout(c) }
            val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
            val g = img.createGraphics()
            c.paint(g)
            g.dispose()
            val out = File(dir, "$name.png")
            out.parentFile.mkdirs()
            ImageIO.write(img, "png", out)
            println("[VerifyLens 시험] 그림 | $out")
        } catch (e: Throwable) {
            println("[VerifyLens 시험] 그림을 남기지 못했습니다 ($name): $e")
        }
    }

    private fun layout(c: Component) {
        c.doLayout()
        if (c is Container) c.components.forEach { layout(it) }
    }

    private fun copyTree(from: Path, to: Path) {
        Files.walk(from).use { all ->
            for (p in all) {
                val target = to.resolve(from.relativize(p).toString())
                if (Files.isDirectory(p)) Files.createDirectories(target)
                else Files.copy(p, target, StandardCopyOption.COPY_ATTRIBUTES, StandardCopyOption.REPLACE_EXISTING)
            }
        }
    }

    /**
     * 검사를 고쳐서 통과시킨 저장소: main 에 코드(5번째에 잠금)와 검사(5번 반복)를 커밋하고,
     * 브랜치에서 커밋하지 않은 채 코드를 조금 다듬고 검사의 반복을 6으로 바꾼다. 바꾼 검사를 돌린 결과(통과)도 넣는다.
     */
    private fun buildEditedTestRepo(dir: Path) {
        Files.createDirectories(dir.resolve("src"))
        Files.createDirectories(dir.resolve("test"))
        git(dir, "init", "-q", "-b", "main")
        Files.writeString(dir.resolve("src/auth.ts"), lockoutCode("user.failures += 1;"))
        Files.writeString(dir.resolve("test/auth.test.ts"), lockoutTest(5))
        git(dir, "add", "-A")
        git(dir, "commit", "-q", "-m", "base: lock after 5 failures")
        git(dir, "checkout", "-q", "-b", "feature/tidy")
        Files.createDirectories(dir.resolve(".verifylens"))
        Files.writeString(dir.resolve(".verifylens/requirements.md"), "- R1: Lock the account after 5 consecutive failures | keywords: failure, lock\n")
        Files.writeString(dir.resolve("src/auth.ts"), lockoutCode("user.failures = user.failures + 1;"))
        Files.writeString(dir.resolve("test/auth.test.ts"), lockoutTest(6))
        Files.writeString(dir.resolve(".verifylens/junit.xml"), LOCKOUT_JUNIT)
    }

    private fun lockoutCode(increment: String) = listOf(
        "export function onFailedLogin(user: { failures: number; locked: boolean }) {",
        "  $increment",
        "  if (user.failures >= 5) user.locked = true;",
        "}",
        "",
    ).joinToString("\n")

    private fun lockoutTest(times: Int) = listOf(
        "import { test } from 'node:test';",
        "import assert from 'node:assert';",
        "import { onFailedLogin } from '../src/auth.ts';",
        "",
        "test('locks the account after 5 consecutive failures', () => {",
        "  const user = { failures: 0, locked: false };",
        "  for (let i = 0; i < $times; i++) onFailedLogin(user);",
        "  assert.equal(user.locked, true);",
        "});",
        "",
    ).joinToString("\n")

    /** samples/login-lockout 으로 main ← feature/lockout-b 저장소를 만들고, 미리 만든 테스트 결과를 넣는다. */
    private fun buildSampleRepo(dir: Path) {
        val sample = engineDir.resolve("samples/login-lockout")
        Files.createDirectories(dir)
        git(dir, "init", "-q", "-b", "main")
        copyTree(sample.resolve("base"), dir)
        git(dir, "add", "-A")
        git(dir, "commit", "-q", "-m", "base: login without lockout")
        git(dir, "checkout", "-q", "-b", "feature/lockout-b")
        copyTree(sample.resolve("shared"), dir)
        copyTree(sample.resolve("b"), dir)
        git(dir, "add", "-A")
        git(dir, "commit", "-q", "-m", "feature: lockout (B)")
        Files.createDirectories(dir.resolve(".verifylens"))
        Files.copy(sample.resolve("requirements.md"), dir.resolve(".verifylens/requirements.md"))
        Files.copy(engineDir.resolve("samples/junit/junit-b.xml"), dir.resolve(".verifylens/junit.xml"))
    }

    private fun git(dir: Path, vararg args: String) {
        val cmd = listOf("git", "-c", "user.name=VerifyLens Test", "-c", "user.email=test@example.invalid", "-c", "core.autocrlf=false", "-C", dir.toString()) + args
        val p = ProcessBuilder(cmd).redirectErrorStream(true).start()
        val out = p.inputStream.bufferedReader().readText()
        check(p.waitFor() == 0) { "git ${args.joinToString(" ")} 실패: $out" }
    }
}

/** 바꾼 검사를 돌린 결과 (통과). 이름이 요구사항과 이어진다. */
private const val LOCKOUT_JUNIT =
    "<?xml version=\"1.0\"?>\n<testsuites><testsuite name=\"t\"><testcase name=\"locks the account after 5 consecutive failures\" classname=\"t\"/></testsuite></testsuites>\n"

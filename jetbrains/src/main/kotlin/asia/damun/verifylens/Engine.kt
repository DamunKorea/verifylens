package asia.damun.verifylens

import com.google.gson.Gson
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

/**
 * 분석 엔진은 VS Code 확장과 같은 TypeScript 코드다. 한 파일로 묶어 플러그인 폴더의 engine/ 에 두고,
 * 사용자 PC 의 Node.js 로 실행해 표준 출력의 JSON 을 읽는다. 네트워크는 쓰지 않는다.
 */
object Engine {
    const val PLUGIN_ID = "asia.damun.verifylens"
    private const val PROTOCOL = 1
    private val LOG = Logger.getInstance(Engine::class.java)

    /** 엔진과 샘플이 있는 폴더. 시험에서는 시스템 속성으로 바꿔 끼운다. */
    fun dir(): Path? {
        System.getProperty("verifylens.engine.dir")?.takeIf { it.isNotBlank() }?.let { return Path.of(it) }
        val plugin = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID)) ?: return null
        return plugin.pluginPath?.resolve("engine")
    }

    fun script(): Path? = dir()?.resolve("verifylens-engine.cjs")?.takeIf { Files.isRegularFile(it) }

    fun samples(): Path? = dir()?.resolve("samples")?.takeIf { Files.isDirectory(it) }

    /** 엔진 명령을 실행한다. 오래 걸릴 수 있으니 화면 스레드에서 부르지 않는다. 실패도 EngineResult(ok = false)로 돌려준다. */
    fun run(node: String, vararg args: String, timeoutMs: Int = 120_000): EngineResult {
        val script = script() ?: return EngineResult.failure("no-engine", I18n.t("분석 엔진 파일을 찾지 못했습니다. 플러그인을 다시 설치해 주세요.", "The analysis engine file was not found. Please reinstall the plugin."))
        return try {
            // 엔진이 만드는 글(요약 · 줄 끝 설명 · 알림)도 같은 언어로 나오게 언어를 넘긴다.
            val cmd = GeneralCommandLine(node, script.toString(), *args, "--lang", I18n.lang())
                .withCharset(StandardCharsets.UTF_8)
                .withWorkDirectory(script.parent.toString())
            val out = CapturingProcessHandler(cmd).runProcess(timeoutMs)
            if (out.isTimeout) return EngineResult.failure("timeout", I18n.t("분석이 ${timeoutMs / 1000}초 안에 끝나지 않아 중단했습니다.", "The analysis did not finish within ${timeoutMs / 1000} seconds and was stopped."))
            val text = out.stdout.trim()
            if (!text.startsWith("{")) {
                val why = out.stderr.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: I18n.t("종료 코드 ${out.exitCode}", "exit code ${out.exitCode}")
                LOG.warn("VerifyLens engine failed: exit=${out.exitCode} stderr=${out.stderr.take(2000)}")
                return EngineResult.failure("engine-failed", I18n.t("분석 엔진을 실행하지 못했습니다 ($why). Node.js 18 이상인지 확인해 주세요. 쓴 Node: $node", "Could not run the analysis engine ($why). Check that Node.js is 18 or newer. Node used: $node"))
            }
            val res = Gson().fromJson(text, EngineResult::class.java)
            if (res.protocol != PROTOCOL) EngineResult.failure("protocol", I18n.t("플러그인과 분석 엔진의 판이 맞지 않습니다. 플러그인을 다시 설치해 주세요.", "The plugin and the analysis engine do not match. Please reinstall the plugin.")) else res
        } catch (e: Exception) {
            LOG.warn("VerifyLens engine failed", e)
            EngineResult.failure("engine-failed", I18n.t("분석 엔진을 실행하지 못했습니다: ", "Could not run the analysis engine: ") + (e.message ?: e.javaClass.simpleName))
        }
    }
}

/** 엔진을 돌릴 Node.js 를 찾는다: 직접 지정한 경로 → IDE 의 Node 인터프리터 설정 → PATH → 흔한 설치 위치. */
object NodeLocator {
    private const val KEY = "verifylens.nodePath"

    var customPath: String?
        get() = PropertiesComponent.getInstance().getValue(KEY)?.takeIf { it.isNotBlank() }
        set(value) = PropertiesComponent.getInstance().setValue(KEY, value?.takeIf { it.isNotBlank() })

    fun find(project: Project?): String? {
        System.getProperty("verifylens.node")?.takeIf { it.isNotBlank() }?.let { return if (isFile(it)) it else null }
        customPath?.let { if (isFile(it)) return it }
        ideInterpreter(project)?.let { return it }
        val exe = if (SystemInfo.isWindows) "node.exe" else "node"
        PathEnvironmentVariableUtil.findInPath(exe)?.let { return it.absolutePath }
        val spots = if (SystemInfo.isWindows) {
            listOfNotNull(System.getenv("ProgramFiles"), System.getenv("ProgramFiles(x86)"), System.getenv("LOCALAPPDATA")?.let { "$it\\Programs" })
                .map { "$it\\nodejs\\node.exe" }
        } else {
            listOf("/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node")
        }
        return spots.firstOrNull { isFile(it) }
    }

    /**
     * WebStorm · IntelliJ IDEA Ultimate 의 「Node interpreter」 설정. 프로젝트의 workspace 속성에 저장된 경로를 읽는다.
     * 값이 "node" 처럼 경로가 아니면(PATH 에서 찾으라는 뜻) 다음 단계로 넘어간다.
     */
    private fun ideInterpreter(project: Project?): String? {
        if (project == null || project.isDisposed) return null
        return try {
            PropertiesComponent.getInstance(project).getValue("nodejs_interpreter_path")?.takeIf { isFile(it) }
        } catch (_: Exception) {
            null
        }
    }

    private fun isFile(path: String): Boolean = try {
        Path.of(path).let { it.isAbsolute && Files.isRegularFile(it) }
    } catch (_: Exception) {
        false
    }
}

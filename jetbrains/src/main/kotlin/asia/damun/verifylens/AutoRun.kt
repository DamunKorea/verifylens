package asia.damun.verifylens

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager

/**
 * 개발 · 시연용: IDE 를 -Dverifylens.autorun=check (또는 demo) 로 띄우면 프로젝트가 열린 뒤 그 동작을 한 번 실행한다.
 * 속성을 주지 않으면 아무것도 하지 않는다. (화면을 손으로 누르지 않고 실제 창에서 확인하려고 둔 것이다.)
 */
class AutoRun : ProjectActivity {
    override suspend fun execute(project: Project) {
        val job = when (System.getProperty("verifylens.autorun")) {
            "check" -> VerifyLensService.Job.CHECK
            "demo" -> VerifyLensService.Job.DEMO
            else -> return
        }
        ApplicationManager.getApplication().invokeLater({
            ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.activate(null)
            VerifyLensService.getInstance(project).start(job)
        }, project.disposed)
    }
}

package asia.damun.verifylens

import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager

internal object Notify {
    private fun show(project: Project, text: String, type: NotificationType, actions: Array<out Pair<String, () -> Unit>>) {
        val n = NotificationGroupManager.getInstance().getNotificationGroup("VerifyLens").createNotification("VerifyLens", text, type)
        for ((label, run) in actions) n.addAction(NotificationAction.createSimpleExpiring(label) { run() })
        n.notify(project)
    }

    fun info(project: Project, text: String, vararg actions: Pair<String, () -> Unit>) = show(project, text, NotificationType.INFORMATION, actions)

    fun warn(project: Project, text: String, vararg actions: Pair<String, () -> Unit>) = show(project, text, NotificationType.WARNING, actions)

    fun error(project: Project, text: String, vararg actions: Pair<String, () -> Unit>) = show(project, text, NotificationType.ERROR, actions)

    /** Node.js 가 없을 때: 무엇을 설치해야 하는지 알려 준다. */
    fun noNode(project: Project) = warn(
        project,
        VerifyLensService.NO_NODE,
        "Node 위치 지정…" to { chooseNode(project) },
        "nodejs.org 열기" to { BrowserUtil.browse("https://nodejs.org/") },
    )
}

internal fun chooseNode(project: Project) {
    val descriptor = FileChooserDescriptorFactory.createSingleFileNoJarsDescriptor().withTitle("Node.js 실행 파일 고르기")
    val file = FileChooser.chooseFile(descriptor, project, null) ?: return
    NodeLocator.customPath = file.path
    Notify.info(project, "Node 위치를 저장했습니다: ${file.presentableUrl}")
}

private fun showToolWindow(project: Project) {
    ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.activate(null)
}

abstract class VerifyLensAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    /** 도구 창의 위쪽 줄에서 아이콘 옆에 이름도 보여 줄지 */
    protected open val textInToolbar = true

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
        e.presentation.putClientProperty(ActionUtil.SHOW_TEXT_IN_TOOLBAR, textInToolbar)
    }
}

/** 내 변경 확인: 작업 폴더(커밋 전 변경 포함)를 기준 브랜치와 비교한다. */
class CheckChangesAction : VerifyLensAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        // 에디터에서 고치고 아직 디스크에 쓰지 않은 내용까지 보려면 먼저 저장한다.
        FileDocumentManager.getInstance().saveAllDocuments()
        showToolWindow(project)
        VerifyLensService.getInstance(project).start(VerifyLensService.Job.CHECK)
    }
}

/** 샘플로 해 보기: 내 코드 없이 로그인 잠금 예를 보여 준다. */
class RunDemoAction : VerifyLensAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        showToolWindow(project)
        VerifyLensService.getInstance(project).start(VerifyLensService.Job.DEMO)
    }
}

/** 다시 확인: 마지막에 한 것을 다시 한다. */
class RecheckAction : VerifyLensAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        FileDocumentManager.getInstance().saveAllDocuments()
        VerifyLensService.getInstance(project).rerun()
    }

    override val textInToolbar = false
}

class CreateRequirementsAction : VerifyLensAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        VerifyLensService.getInstance(project).createRequirements()
    }

    override val textInToolbar = false
}

class SetNodePathAction : VerifyLensAction() {
    override fun actionPerformed(e: AnActionEvent) {
        chooseNode(e.project ?: return)
    }

    override val textInToolbar = false
}

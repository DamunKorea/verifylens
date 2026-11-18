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
import com.intellij.openapi.ui.popup.JBPopupFactory
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
        VerifyLensService.noNode(),
        I18n.t("Node 위치 지정…", "Set Node.js path…") to { chooseNode(project) },
        I18n.t("nodejs.org 열기", "Open nodejs.org") to { BrowserUtil.browse("https://nodejs.org/") },
    )
}

internal fun chooseNode(project: Project) {
    val descriptor = FileChooserDescriptorFactory.createSingleFileNoJarsDescriptor().withTitle(I18n.t("Node.js 실행 파일 고르기", "Choose the Node.js executable"))
    val file = FileChooser.chooseFile(descriptor, project, null) ?: return
    NodeLocator.customPath = file.path
    Notify.info(project, I18n.t("Node 위치를 저장했습니다: ", "Node.js path saved: ") + file.presentableUrl)
}

private fun showToolWindow(project: Project) {
    ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.activate(null)
}

abstract class VerifyLensAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    /** 도구 창의 위쪽 줄에서 아이콘 옆에 이름도 보여 줄지 */
    protected open val textInToolbar = true

    /** 화면 언어에 맞춘 이름과 설명 (plugin.xml 의 이름은 영어 기본값이다) */
    protected abstract val names: Pair<Pair<String, String>, Pair<String, String>>

    fun label(): String = I18n.t(names.first.first, names.first.second)

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
        e.presentation.text = label()
        e.presentation.description = I18n.t(names.second.first, names.second.second)
        e.presentation.putClientProperty(ActionUtil.SHOW_TEXT_IN_TOOLBAR, textInToolbar)
    }
}

/** 내 변경 확인: 작업 폴더(커밋 전 변경 포함)를 기준 브랜치와 비교한다. */
class CheckChangesAction : VerifyLensAction() {
    override val names = ("내 변경 확인" to "Check my changes") to
        ("작업 폴더(커밋 전 변경 포함)를 기준 브랜치와 비교해 요구사항마다 확인합니다" to "Checks each requirement against your working tree (uncommitted changes included) and the base branch")

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
    override val names = ("샘플로 해 보기" to "Try the sample") to
        ("내 코드 없이 로그인 잠금 예로 VerifyLens 를 봅니다" to "Shows VerifyLens on a login-lockout example, without touching your code")

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        showToolWindow(project)
        VerifyLensService.getInstance(project).start(VerifyLensService.Job.DEMO)
    }
}

/** 다시 확인: 마지막에 한 것을 다시 한다. */
class RecheckAction : VerifyLensAction() {
    override val names = ("다시 확인" to "Check again") to ("마지막에 한 확인을 다시 합니다" to "Runs the last check again")

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        FileDocumentManager.getInstance().saveAllDocuments()
        VerifyLensService.getInstance(project).rerun()
    }

    override val textInToolbar = false
}

class CreateRequirementsAction : VerifyLensAction() {
    override val names = ("요구사항 파일 만들기" to "Create requirements file") to
        (".verifylens/requirements.md 를 예시와 함께 만들고 엽니다" to "Creates .verifylens/requirements.md with two example lines and opens it")

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        VerifyLensService.getInstance(project).createRequirements()
    }

    override val textInToolbar = false
}

class SetNodePathAction : VerifyLensAction() {
    override val names = ("Node 위치 지정…" to "Set Node.js path…") to ("분석 엔진을 돌릴 Node.js 실행 파일을 고릅니다" to "Chooses the Node.js executable that runs the analysis engine")

    override fun actionPerformed(e: AnActionEvent) {
        chooseNode(e.project ?: return)
    }

    override val textInToolbar = false
}

/** 화면 언어: IDE 를 따름 · 한국어 · English. 바꾸면 마지막 확인을 그 언어로 다시 한다. */
class SetLanguageAction : VerifyLensAction() {
    override val names = ("화면 언어…" to "Language…") to ("VerifyLens 의 화면 글 언어를 고릅니다" to "Chooses the language of VerifyLens")

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val values = listOf(I18n.AUTO, "ko", "en")
        val labels = listOf(I18n.t("IDE 언어를 따름", "Follow the IDE language"), "한국어", "English")
        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(labels)
            .setTitle(I18n.t("VerifyLens 화면 언어", "VerifyLens language"))
            .setSelectedValue(labels[values.indexOf(I18n.setting).coerceAtLeast(0)], true)
            .setItemChosenCallback { chosen -> applyLanguage(project, values[labels.indexOf(chosen)]) }
            .createPopup()
            .showCenteredInCurrentWindow(project)
    }

    override val textInToolbar = false
}

/** 언어를 바꾸고, 결과가 있으면 그 언어로 다시 만든다 (요약 · 줄 끝 설명은 엔진이 만든 글이라). */
internal fun applyLanguage(project: Project, value: String) {
    I18n.setting = value
    val service = VerifyLensService.getInstance(project)
    if (service.result != null) service.rerun(silent = true) else service.refreshView()
}

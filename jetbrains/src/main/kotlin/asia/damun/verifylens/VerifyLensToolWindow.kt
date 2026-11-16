package asia.damun.verifylens

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.ClickListener
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.tree.TreeUtil
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.ToolTipManager
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class VerifyLensToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = VerifyLensPanel(project)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        content.setDisposer(panel)
        toolWindow.contentManager.addContent(content)
    }
}

/** 근거 줄 하나 (요구사항 아래에 달린다) */
internal class EvidenceNode(val reqId: String, val row: EvidenceRow, val detail: String)

/**
 * 도구 창의 내용: 맨 위 한 줄 요약, 요구사항별 상태와 근거 줄. 줄을 누르면 그 파일의 그 줄로 간다.
 */
class VerifyLensPanel(private val project: Project) : SimpleToolWindowPanel(true, true), Disposable {
    private val service = VerifyLensService.getInstance(project)
    private val headline = JBLabel().apply { setAllowAutoWrapping(true) }
    private val context = JBLabel().apply {
        setAllowAutoWrapping(true)
        foreground = UIUtil.getContextHelpForeground()
    }
    private val notes = JBLabel().apply {
        setAllowAutoWrapping(true)
        icon = AllIcons.General.BalloonWarning
        verticalTextPosition = JBLabel.TOP
        isVisible = false
    }
    private val root = DefaultMutableTreeNode()
    private val model = DefaultTreeModel(root)
    val tree = Tree(model)

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.cellRenderer = Renderer()
        ToolTipManager.sharedInstance().registerComponent(tree)
        tree.emptyText.text = "아직 확인한 결과가 없습니다"
        tree.emptyText.appendLine("내 변경 확인", SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) { service.start(VerifyLensService.Job.CHECK) }
        tree.emptyText.appendLine("샘플로 해 보기", SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) { service.start(VerifyLensService.Job.DEMO) }
        object : ClickListener() {
            override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
                val path = tree.getPathForLocation(event.x, event.y) ?: return false
                return navigate(path.lastPathComponent)
            }
        }.installOn(tree)
        tree.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER && tree.selectionPath?.let { navigate(it.lastPathComponent) } == true) e.consume()
            }
        })

        val header = JPanel(VerticalLayout(JBUI.scale(4))).apply {
            border = JBUI.Borders.empty(8, 10, 6, 10)
            add(headline)
            add(context)
            add(notes)
        }
        setContent(JPanel(BorderLayout()).apply {
            add(header, BorderLayout.NORTH)
            add(ScrollPaneFactory.createScrollPane(tree, true), BorderLayout.CENTER)
        })
        (ActionManager.getInstance().getAction("VerifyLens.Toolbar") as? ActionGroup)?.let { group ->
            val bar = ActionManager.getInstance().createActionToolbar("VerifyLensToolbar", group, true)
            bar.targetComponent = this
            toolbar = bar.component
        }
        project.messageBus.connect(this).subscribe(VerifyLensListener.TOPIC, object : VerifyLensListener {
            override fun changed() = refresh()
        })
        refresh()
    }

    private fun refresh() {
        val r = service.result
        val problem = service.lastProblem
        if (r == null) {
            headline.text = html("<b>AI가 고친 코드가 요구사항대로 됐는지 확인합니다</b>")
            context.text = html("코드의 근거 줄과 실제로 돌린 테스트 결과로만 판정합니다. AI 추정은 없고, 코드는 이 PC 밖으로 나가지 않습니다." + busyText())
        } else {
            headline.text = html("<b>${esc(r.headline)}</b>")
            context.text = html(esc("${r.context} · ${r.status}") + busyText())
        }
        val lines = (if (problem != null) listOf(problem) else emptyList()) + (r?.notes ?: emptyList())
        notes.isVisible = lines.isNotEmpty()
        notes.text = html(lines.joinToString("<br>") { esc(it) })

        root.removeAllChildren()
        if (r != null) {
            for (row in r.rows) {
                val node = DefaultMutableTreeNode(row)
                for (ev in row.children) {
                    // 줄 끝 설명과 같은 글을 쓴다 (예: 6번째 시도에 동작 (요구사항 5회) · 검사 실패)
                    val lens = r.lenses.firstOrNull { it.reqId == row.id && it.setKey == ev.setKey && it.file == ev.file && it.line == ev.line }
                    node.add(DefaultMutableTreeNode(EvidenceNode(row.id, ev, lens?.note ?: ev.detail)))
                }
                root.add(node)
            }
        }
        model.reload()
        TreeUtil.expandAll(tree)
    }

    private fun busyText() = if (service.busy) " · 확인하는 중…" else ""

    private fun navigate(node: Any?): Boolean {
        val ev = when (val o = (node as? DefaultMutableTreeNode)?.userObject) {
            is EvidenceNode -> o.row
            is ReqRow -> o.children.firstOrNull { it.file != null && it.line != null }
            else -> null
        } ?: return false
        val file = ev.file ?: return false
        service.open(ev.setKey, file, ev.line ?: 1)
        return true
    }

    /** 화면에 보이는 줄들의 글 (시험용) */
    fun rowTexts(): List<String> = (0 until tree.rowCount).map { i ->
        val node = tree.getPathForRow(i).lastPathComponent
        val c = tree.cellRenderer.getTreeCellRendererComponent(tree, node, false, tree.isExpanded(i), model.isLeaf(node), i, false)
        (c as ColoredTreeCellRenderer).getCharSequence(false).toString()
    }

    fun headlineText(): String = StringUtil.removeHtmlTags(headline.text ?: "")

    override fun dispose() {
        ToolTipManager.sharedInstance().unregisterComponent(tree)
    }

    private inner class Renderer : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(tree: JTree, value: Any?, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
            when (val o = (value as? DefaultMutableTreeNode)?.userObject) {
                is ReqRow -> {
                    icon = VerifyLensIcons.status(o.overall)
                    append(o.id, SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
                    append("  ${o.text}")
                    val state = if (o.reason.isNotEmpty()) "${o.overall} · ${o.reason}" else o.overall
                    append("   $state", SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, Colors.text(o.overall)))
                    toolTipText = reqTooltip(o)
                }
                is EvidenceNode -> {
                    val name = o.row.file?.substringAfterLast('/')
                    icon = if (name == null) AllIcons.General.Warning
                    else FileTypeManager.getInstance().getFileTypeByFileName(name).takeIf { it !is UnknownFileType }?.icon ?: AllIcons.FileTypes.Text
                    append(o.row.label, if (name != null) SimpleTextAttributes.REGULAR_ATTRIBUTES else SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    append("   ${o.detail}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    toolTipText = html(esc(o.row.tooltip) + if (name != null) " — 눌러서 코드로 이동" else "")
                }
            }
        }
    }

    private fun reqTooltip(row: ReqRow): String {
        val strip = service.result?.strips?.get(row.id)
        val sb = StringBuilder("<b>VerifyLens · ${esc(row.id)} · ${esc(row.overall)}</b> — ${esc(row.text)}<br>${esc(row.summary)}")
        if (!strip.isNullOrEmpty()) sb.append("<pre>").append(strip.joinToString("\n") { esc(it) }).append("</pre>") else sb.append("<br>")
        sb.append("<i>출처: 조건식은 코드 분석 · 동작 시점은 계산 · 검사는 실행 기록(JUnit) — AI 추정 없음</i>")
        return html(sb.toString())
    }

    private fun esc(s: String) = StringUtil.escapeXmlEntities(s)

    private fun html(body: String) = "<html>$body</html>"
}

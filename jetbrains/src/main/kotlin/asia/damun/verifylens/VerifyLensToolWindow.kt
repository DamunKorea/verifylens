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
import com.intellij.ui.OnePixelSplitter
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
import javax.swing.tree.TreePath

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

/** 이번 변경에서 바뀐 검사 하나 (요구사항 아래, 근거 줄 다음에 달린다) */
internal class ChangedTestNode(val reqId: String, val test: ChangedTest)

/**
 * 도구 창의 내용: 맨 위 한 줄 요약, 요구사항별 상태와 근거 줄. 줄을 누르면 그 파일의 그 줄로 간다.
 * 아래쪽에는 고른 요구사항의 근거 사슬 그림(요구사항 → 코드 줄 → 검사 → 동작)이 나온다.
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

    /** 아래쪽 그림: 고른 요구사항의 근거 사슬. 고르지 않았으면 먼저 볼 것(확인됨이 아닌 첫 요구사항)을 보여 준다. */
    private val chain = ChainView { setKey, kind -> openFromChain(setKey, kind) }
    private val chainScroll = ScrollPaneFactory.createScrollPane(chain, true)
    private val splitter = OnePixelSplitter(true, 0.45f)
    private var pickedReq: String? = null
    private var shownRow: ReqRow? = null

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.cellRenderer = Renderer()
        ToolTipManager.sharedInstance().registerComponent(tree)
        setEmptyText()
        object : ClickListener() {
            override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
                val path = tree.getPathForLocation(event.x, event.y) ?: return false
                return navigate(path.lastPathComponent)
            }
        }.installOn(tree)
        tree.addTreeSelectionListener {
            // 요구사항 줄이나 그 아래 줄을 고르면 그 요구사항의 그림으로 바꾼다
            val id = reqIdOf(tree.selectionPath?.lastPathComponent)
            if (id != null && id != shownRow?.id) {
                pickedReq = id
                showChain()
            }
        }
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
            splitter.firstComponent = ScrollPaneFactory.createScrollPane(tree, true)
            add(splitter, BorderLayout.CENTER)
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

    /** 결과가 없을 때 목록 자리에 보이는 글과 링크 (화면 언어가 바뀌면 다시 만든다) */
    private fun setEmptyText() {
        tree.emptyText.clear()
        tree.emptyText.text = I18n.t("아직 확인한 결과가 없습니다", "Nothing checked yet")
        tree.emptyText.appendLine(I18n.t("내 변경 확인", "Check my changes"), SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) { service.start(VerifyLensService.Job.CHECK) }
        tree.emptyText.appendLine(I18n.t("샘플로 해 보기", "Try the sample"), SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) { service.start(VerifyLensService.Job.DEMO) }
    }

    private fun refresh() {
        val r = service.result
        val problem = service.lastProblem
        setEmptyText()
        if (r == null) {
            headline.text = html("<b>" + I18n.t("AI가 고친 코드가 요구사항대로 됐는지 확인합니다", "Checks whether the code the AI changed does what the requirements say") + "</b>")
            context.text = html(
                I18n.t(
                    "코드의 근거 줄과 실제로 돌린 테스트 결과로만 판정합니다. AI 추정은 없고, 코드는 이 PC 밖으로 나가지 않습니다.",
                    "Every verdict comes from a line of code and the tests that actually ran. No AI inference, and your code never leaves this machine.",
                ) + busyText(),
            )
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
                    // 줄 끝 설명과 같은 글을 쓴다 (예: 6번째 시도에 동작 (요구사항 5회) · 검사는 통과)
                    val lens = r.lenses.firstOrNull { it.reqId == row.id && it.setKey == ev.setKey && it.file == ev.file && it.line == ev.line }
                    node.add(DefaultMutableTreeNode(EvidenceNode(row.id, ev, lens?.note ?: ev.detail)))
                }
                // 이 요구사항에 이어진 검사를 이번 변경에서 바꿨으면, 판정은 그대로 두고 그 아래에 알린다.
                for (t in r.changedTests[row.id].orEmpty()) node.add(DefaultMutableTreeNode(ChangedTestNode(row.id, t)))
                root.add(node)
            }
        }
        model.reload()
        TreeUtil.expandAll(tree)
        showChain()
    }

    private fun reqIdOf(node: Any?): String? = when (val o = (node as? DefaultMutableTreeNode)?.userObject) {
        is ReqRow -> o.id
        is EvidenceNode -> o.reqId
        is ChangedTestNode -> o.reqId
        else -> null
    }

    private fun showChain() {
        val r = service.result
        val rows = r?.rows.orEmpty()
        val row = rows.firstOrNull { it.id == pickedReq } ?: rows.firstOrNull { it.overall != "확인됨" } ?: rows.firstOrNull()
        // 결과가 둘(샘플의 A · B)이면 어긋난 쪽을 먼저 보여 준다
        val lanes = row?.let { r?.chains?.get(it.id) }.orEmpty().sortedBy { l -> if (l.steps.any { it.tone == "diff" || it.tone == "fail" }) 0 else 1 }
        shownRow = if (lanes.isEmpty()) null else row
        if (r == null || row == null || lanes.isEmpty()) {
            chain.show(null, emptyList(), null, emptySet())
            if (splitter.secondComponent != null) splitter.secondComponent = null
            return
        }
        // 눌러서 갈 곳이 있는 칸: 근거 줄이 있는 코드 칸, 이번 변경에서 바뀐 검사가 있는 검사 칸
        val clickable = HashSet<String>()
        for (ev in row.children) if (ev.file != null && ev.line != null) clickable.add("${ev.setKey}/code")
        for (t in r.changedTests[row.id].orEmpty()) clickable.add("${t.setKey}/test")
        chain.show(row, lanes, r.dots[row.id], clickable)
        if (splitter.secondComponent == null) splitter.secondComponent = chainScroll
    }

    private fun openFromChain(setKey: String, kind: String) {
        val row = shownRow ?: return
        if (kind == "test") {
            val t = changedTestsOf(row.id).firstOrNull { it.setKey == setKey } ?: return
            service.open(t.setKey, t.file, maxOf(1, t.line))
        } else if (kind == "code") {
            val ev = row.children.firstOrNull { it.setKey == setKey && it.file != null && it.line != null } ?: return
            service.open(ev.setKey, ev.file ?: return, ev.line ?: 1)
        }
    }

    private fun busyText() = if (service.busy) I18n.t(" · 확인하는 중…", " · checking…") else ""

    private fun navigate(node: Any?): Boolean {
        val user = (node as? DefaultMutableTreeNode)?.userObject
        if (user is ChangedTestNode) {
            service.open(user.test.setKey, user.test.file, maxOf(1, user.test.line))
            return true
        }
        val ev = when (val o = user) {
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

    /** 아래쪽 근거 사슬 그림에 적힌 글 (시험용) */
    fun chainTexts(): List<String> = chain.lines()

    /** 그림의 요구사항 칸에 붙은 「읽은 것」 칩 (시험용) */
    fun chainPieces(): List<String> = chain.pieceLines()

    /** 요구사항 줄을 고른다 (시험용). 그림이 그 요구사항으로 바뀐다. */
    fun selectRequirement(id: String) {
        val node = (0 until root.childCount).map { root.getChildAt(it) as DefaultMutableTreeNode }.first { (it.userObject as ReqRow).id == id }
        tree.selectionPath = TreePath(node.path)
    }

    /** 그림의 칸을 누른다 (시험용). kind 는 code 또는 test. */
    fun clickChain(setKey: String, kind: String) = openFromChain(setKey, kind)

    fun headlineText(): String = StringUtil.removeHtmlTags(headline.text ?: "")

    /** 위쪽 글 전부와 각 줄의 말풍선 글 (시험용) */
    fun allTexts(): List<String> {
        val tips = (0 until tree.rowCount).mapNotNull { i ->
            val node = tree.getPathForRow(i).lastPathComponent
            (tree.cellRenderer.getTreeCellRendererComponent(tree, node, false, tree.isExpanded(i), model.isLeaf(node), i, false) as ColoredTreeCellRenderer).toolTipText
        }
        return listOf(headline.text, context.text, notes.text).map { StringUtil.removeHtmlTags(it ?: "") } + rowTexts() + tips.map { StringUtil.removeHtmlTags(it) } + chainTexts() + chainPieces()
    }

    override fun dispose() {
        ToolTipManager.sharedInstance().unregisterComponent(tree)
    }

    private inner class Renderer : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(tree: JTree, value: Any?, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
            when (val o = (value as? DefaultMutableTreeNode)?.userObject) {
                is ReqRow -> {
                    icon = VerifyLensIcons.status(o.overall)
                    // 상태를 요구사항 글 앞에 둔다. 글이 길거나 창이 좁아도 상태는 잘리지 않게 (11/18 실제 창에서 뒤쪽 상태가 잘렸다).
                    val word = I18n.overall(o.overall)
                    val state = if (o.reason.isNotEmpty()) "$word · ${o.reason}" else word
                    append(o.id, SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
                    append("  $state", SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, Colors.text(o.overall)))
                    // 검사를 바꿔서 통과시켰을 수 있다. 판정이 「확인됨」이어도 눈에 띄게 「다름」 색으로 알린다 (VS Code 와 같은 말).
                    if (changedTestsOf(o.id).isNotEmpty()) {
                        append(" · ⚠ " + I18n.t("검사 바뀜", "test changed"), SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, Colors.text("다름")))
                    }
                    append("   ${o.text}")
                    toolTipText = reqTooltip(o)
                }
                is EvidenceNode -> {
                    val name = o.row.file?.substringAfterLast('/')
                    icon = if (name == null) AllIcons.General.Warning
                    else FileTypeManager.getInstance().getFileTypeByFileName(name).takeIf { it !is UnknownFileType }?.icon ?: AllIcons.FileTypes.Text
                    append(o.row.label, if (name != null) SimpleTextAttributes.REGULAR_ATTRIBUTES else SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    append("   ${o.detail}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    toolTipText = html(esc(o.row.tooltip) + if (name != null) I18n.t(" — 눌러서 코드로 이동", " — click to go to the code") else "")
                }
                is ChangedTestNode -> {
                    // 예: ⚠ auth.test.ts:5   test changed in this change: 5 → 6
                    icon = AllIcons.General.Warning
                    val t = o.test
                    append("${t.file.substringAfterLast('/')}:${t.line}", SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, Colors.text("다름")))
                    append("   ${t.text.substringAfter(" — ", t.text)}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    toolTipText = html(esc(t.text) + I18n.t(" — 눌러서 검사로 이동", " — click to go to the test"))
                }
            }
        }
    }

    private fun reqTooltip(row: ReqRow): String {
        val strip = service.result?.strips?.get(row.id)
        val sb = StringBuilder("<b>VerifyLens · ${esc(row.id)} · ${esc(I18n.overall(row.overall))}</b> — ${esc(row.text)}<br>${esc(row.summary)}")
        if (!strip.isNullOrEmpty()) sb.append("<pre>").append(strip.joinToString("\n") { esc(it) }).append("</pre>") else sb.append("<br>")
        for (t in changedTestsOf(row.id)) sb.append("⚠ ").append(esc(t.text)).append("<br>")
        sb.append("<i>").append(I18n.t("출처: 조건식은 코드 분석 · 동작 시점은 계산 · 검사는 실행 기록(JUnit) — AI 추정 없음", "Source: the condition comes from code analysis · the attempt is computed · tests come from the executed report (JUnit) — no AI inference")).append("</i>")
        return html(sb.toString())
    }

    private fun changedTestsOf(reqId: String): List<ChangedTest> = service.result?.changedTests?.get(reqId).orEmpty()

    private fun esc(s: String) = StringUtil.escapeXmlEntities(s)

    private fun html(body: String) = "<html>$body</html>"
}

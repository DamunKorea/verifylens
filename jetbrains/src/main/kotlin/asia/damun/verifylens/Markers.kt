package asia.damun.verifylens

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.EditorLinePainter
import com.intellij.openapi.editor.LineExtensionInfo
import com.intellij.openapi.editor.impl.DocumentMarkupModel
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.MarkupModel
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.JBColor
import java.awt.Color
import java.awt.Font
import java.nio.file.Path
import javax.swing.Icon

internal object Colors {
    private val OK = JBColor(Color(0x1E8A5A), Color(0x34D399))
    private val DIFF = JBColor(Color(0xA16207), Color(0xFBBF24))
    private val FAIL = JBColor(Color(0xC62828), Color(0xF87171))
    private val UNKNOWN = JBColor(Color(0x6B7280), Color(0x94A3B8))
    val DIFF_BG = JBColor(Color(0xFFF3D1), Color(0x453A19))
    val FAIL_BG = JBColor(Color(0xFDE3E3), Color(0x4A2626))

    /** 글자색: 확인됨 · 다름 · 실패 · 미확인 */
    fun text(overall: String): Color = when (overall) {
        "확인됨" -> OK
        "다름" -> DIFF
        "실패" -> FAIL
        else -> UNKNOWN
    }
}

/**
 * 근거가 된 줄에 붙이는 표시: 줄 번호 옆 아이콘, 줄 끝 설명, 「다름 · 실패」의 줄 배경, 오른쪽 띠의 표시.
 * 화면 스레드에서만 부른다.
 */
class Markers(private val project: Project) {
    private val applied = ArrayList<Pair<MarkupModel, RangeHighlighter>>()
    private val demoFiles = HashMap<String, LightVirtualFile>()

    /**
     * 결과의 파일. 지금 작업 폴더에 있는 결과면 실제 파일(고칠 수 있음),
     * 샘플의 결과 A · B 면 엔진이 실어 보낸 내용으로 만든 읽기 전용 문서다.
     */
    fun fileFor(r: EngineResult, setKey: String, file: String): VirtualFile? {
        val set = r.sets.firstOrNull { it.key == setKey } ?: return null
        if (set.onDisk) return LocalFileSystem.getInstance().findFileByNioFile(Path.of(r.repo, file))
        val text = set.files[file] ?: return null
        val key = "$setKey/$file"
        demoFiles[key]?.let { if (it.content.toString() == text) return it }
        val name = "${set.label} · ${file.substringAfterLast('/')}"
        // 파일 종류는 IDE 가 이름으로 알아보게 둔다 (TypeScript 지원이나 TextMate 묶음이 있으면 색이 입혀진다).
        // 알아보지 못하는 IDE 에서는 「파일 종류를 고르세요」 창이 뜨지 않게 보통 글로 연다.
        var vf = LightVirtualFile(name, text)
        if (vf.fileType is UnknownFileType) vf = LightVirtualFile(name, PlainTextFileType.INSTANCE, text)
        vf.isWritable = false
        demoFiles[key] = vf
        return vf
    }

    fun apply(r: EngineResult) {
        clear()
        if (r.kind != "demo") demoFiles.clear()
        val docs = FileDocumentManager.getInstance()
        for (lens in r.lenses) {
            val vf = fileFor(r, lens.setKey, lens.file) ?: continue
            val doc = docs.getDocument(vf) ?: continue
            if (lens.line < 1 || lens.line > doc.lineCount) continue
            val first = lens.line - 1
            val last = (maxOf(lens.endLine, lens.line) - 1).coerceAtMost(doc.lineCount - 1)
            val model = DocumentMarkupModel.forDocument(doc, project, true)
            val h = model.addRangeHighlighter(
                doc.getLineStartOffset(first),
                doc.getLineEndOffset(last),
                HighlighterLayer.ADDITIONAL_SYNTAX,
                attributes(lens),
                HighlighterTargetArea.LINES_IN_RANGE,
            )
            h.gutterIconRenderer = LensGutterIcon(project, lens)
            h.errorStripeTooltip = "${lens.title} — ${lens.reqText}"
            h.putUserData(LENS, lens)
            applied += model to h
        }
    }

    fun clear() {
        for ((model, h) in applied) if (h.isValid) model.removeHighlighter(h)
        applied.clear()
    }

    /** 이 파일의 이 줄(0부터)에서 시작하는 근거 표시들 */
    fun notes(file: VirtualFile, line: Int): List<Lens> {
        if (applied.isEmpty()) return emptyList()
        val doc = FileDocumentManager.getInstance().getCachedDocument(file) ?: return emptyList()
        return applied.mapNotNull { (_, h) ->
            if (h.isValid && h.document === doc && h.startOffset <= doc.textLength && doc.getLineNumber(h.startOffset) == line) h.getUserData(LENS) else null
        }
    }

    /** 이 파일에 붙어 있는 표시 (시험과 진단용): 줄 번호(1부터) → 표시 */
    fun lensesIn(file: VirtualFile): List<Pair<Int, Lens>> {
        val doc = FileDocumentManager.getInstance().getCachedDocument(file) ?: return emptyList()
        return applied.mapNotNull { (_, h) ->
            val lens = h.getUserData(LENS)
            if (h.isValid && h.document === doc && lens != null && h.gutterIconRenderer != null) doc.getLineNumber(h.startOffset) + 1 to lens else null
        }
    }

    private fun attributes(lens: Lens): TextAttributes = TextAttributes().apply {
        errorStripeColor = Colors.text(lens.overall)
        // 확인됨 · 미확인은 아이콘만, 다름 · 실패는 줄 배경까지 칠해 눈에 띄게 한다.
        backgroundColor = when (lens.overall) {
            "다름" -> Colors.DIFF_BG
            "실패" -> Colors.FAIL_BG
            else -> null
        }
    }

    companion object {
        val LENS: Key<Lens> = Key.create("verifylens.lens")

        /** 줄 끝에 붙는 설명. VS Code 확장과 같은 글이다. */
        fun noteText(lens: Lens) = "← ${lens.head} · ${lens.note}"
    }
}

/** 줄 번호 옆 아이콘. 누르면 VerifyLens 도구 창을 연다. */
private class LensGutterIcon(private val project: Project, private val lens: Lens) : GutterIconRenderer(), DumbAware {
    override fun getIcon(): Icon = VerifyLensIcons.gutter(lens.overall)

    override fun getTooltipText(): String = "${lens.title} — ${lens.reqText}"

    override fun getAlignment(): Alignment = Alignment.LEFT

    override fun getClickAction(): AnAction = object : DumbAwareAction() {
        override fun actionPerformed(e: AnActionEvent) {
            ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.activate(null)
        }
    }

    override fun equals(other: Any?): Boolean =
        other is LensGutterIcon && other.lens.reqId == lens.reqId && other.lens.setKey == lens.setKey && other.lens.title == lens.title && other.lens.line == lens.line

    override fun hashCode(): Int = 31 * lens.reqId.hashCode() + lens.title.hashCode()
}

/** 근거 줄 끝에 설명을 그린다. 예: ← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과 */
class VerifyLensLinePainter : EditorLinePainter() {
    override fun getLineExtensions(project: Project, file: VirtualFile, lineNumber: Int): Collection<LineExtensionInfo>? {
        val service = project.getServiceIfCreated(VerifyLensService::class.java) ?: return null
        val lenses = service.markers.notes(file, lineNumber)
        if (lenses.isEmpty()) return null
        return lenses.map { LineExtensionInfo("   ${Markers.noteText(it)}", TextAttributes(Colors.text(it.overall), null, null, null, Font.ITALIC)) }
    }
}

const val TOOL_WINDOW_ID = "VerifyLens"

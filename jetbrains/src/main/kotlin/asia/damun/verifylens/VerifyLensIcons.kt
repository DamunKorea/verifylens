package asia.damun.verifylens

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

object VerifyLensIcons {
    private fun load(path: String): Icon = IconLoader.getIcon(path, VerifyLensIcons::class.java)

    @JvmField
    val ToolWindow: Icon = load("/icons/toolWindow.svg")
    private val ok = load("/icons/status-ok.svg")
    private val diff = load("/icons/status-diff.svg")
    private val fail = load("/icons/status-fail.svg")
    private val unknown = load("/icons/status-unk.svg")
    private val gutterOk = load("/icons/gutter-ok.svg")
    private val gutterDiff = load("/icons/gutter-diff.svg")
    private val gutterFail = load("/icons/gutter-fail.svg")
    private val gutterUnknown = load("/icons/gutter-unk.svg")

    /** 목록에 쓰는 16px 아이콘 */
    fun status(overall: String): Icon = when (overall) {
        "확인됨" -> ok
        "다름" -> diff
        "실패" -> fail
        else -> unknown
    }

    /** 줄 번호 옆에 쓰는 12px 아이콘 */
    fun gutter(overall: String): Icon = when (overall) {
        "확인됨" -> gutterOk
        "다름" -> gutterDiff
        "실패" -> gutterFail
        else -> gutterUnknown
    }
}

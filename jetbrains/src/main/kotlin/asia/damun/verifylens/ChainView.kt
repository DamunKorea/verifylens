package asia.damun.verifylens

import com.intellij.ide.ui.UISettings
import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Cursor
import java.awt.Dimension
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Rectangle
import java.awt.RenderingHints
import java.awt.event.MouseAdapter
import java.awt.image.BufferedImage
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.Scrollable
import javax.swing.SwingConstants
import javax.swing.ToolTipManager

/**
 * 판정 색. 리포트 · 체험 페이지 · VS Code 와 같은 값이다 (src/verdictStyle.ts 의 light · dark).
 * ink = 글자와 테두리, fill = 칸의 바탕.
 */
internal object Tones {
    private fun c(light: Int, dark: Int) = JBColor(Color(light), Color(dark))
    private val INK = mapOf(
        "ok" to c(0x176840, 0x62D6A0),
        "diff" to c(0x884600, 0xFFC26B),
        "fail" to c(0xA72B36, 0xFF9099),
        "miss" to c(0x536173, 0xAAB8CA),
        "plain" to c(0x275EAE, 0x94BBFF),
    )
    private val FILL = mapOf(
        "ok" to c(0xE4F4EC, 0x113229),
        "diff" to c(0xFFF1D9, 0x38291A),
        "fail" to c(0xFCE9EC, 0x3B202A),
        "miss" to c(0xEDF0F4, 0x202B3B),
        "plain" to c(0xEAF1FF, 0x192D49),
    )

    fun ink(tone: String): Color = INK[tone] ?: INK.getValue("miss")
    fun fill(tone: String): Color = FILL[tone] ?: FILL.getValue("miss")

    /** 색을 못 보는 사람도 읽게, 색과 함께 붙이는 표시 */
    fun symbol(tone: String) = when (tone) {
        "ok" -> "✓ "
        "diff" -> "⚠ "
        "fail" -> "✕ "
        "miss" -> "? "
        else -> ""
    }

    /** 판정 낱말(확인됨 · 다름 · 실패 · 미확인)의 색 이름 */
    fun of(overall: String) = when (overall) {
        "확인됨" -> "ok"
        "다름" -> "diff"
        "실패" -> "fail"
        else -> "miss"
    }

    /** 칸 테두리: 글자색을 바탕에 반쯤 섞는다 (리포트의 color-mix 52% 와 같다) */
    fun border(tone: String): Color {
        val a = ink(tone)
        val b = fill(tone)
        fun mix(x: Int, y: Int) = (x * 0.52 + y * 0.48).toInt()
        return Color(mix(a.red, b.red), mix(a.green, b.green), mix(a.blue, b.blue))
    }
}

/**
 * 근거 사슬 그림: 요구사항 → 코드 줄 → 검사 → 동작(판정) 네 칸과, 몇 번째 시도에 동작하는지 보여 주는 점 그림.
 * 자료는 엔진이 낸 것(chains · dots)을 그대로 쓴다. 리포트 · 체험 페이지 · PR 요약과 같은 모델이다.
 * 「미확인」은 비어 있는 칸(회색 점선)이 어디인지가 곧 까닭이다.
 * 도구 창은 좁으므로 칸을 위에서 아래로 쌓는다.
 */
internal class ChainView(private val onOpen: (setKey: String, kind: String) -> Unit) : JComponent(), Scrollable {
    private var row: ReqRow? = null
    private var lanes: List<ChainLane> = emptyList()
    private var dots: AttemptDots? = null
    private var clickable: Set<String> = emptySet()

    /** 그릴 것 하나하나 (배치한 결과) */
    /** follow = 앞 글 바로 뒤에 이어 그린다 (제목 줄처럼 색이 다른 글을 이을 때. 폭을 미리 재서 잇지 않는다) */
    private class Text(val s: String, val x: Int, val y: Int, val font: Font, val color: Color, val follow: Boolean = false)
    private class Box(val r: Rectangle, val tone: String)
    private class Dot(val x: Int, val y: Int, val d: Int, val n: Int, val tone: String, val active: Boolean, val after: Boolean)
    private class Hit(val r: Rectangle, val setKey: String, val kind: String, val tip: String, val open: Boolean)

    private val texts = ArrayList<Text>()
    private val boxes = ArrayList<Box>()
    private val dotList = ArrayList<Dot>()
    private val hits = ArrayList<Hit>()
    private var laidOutWidth = -1

    /** 글자 폭을 잴 때 쓴 화면 배율 (125% · 150% 화면에서는 글자 폭이 달라진다). 그릴 때 다르면 다시 배치한다. */
    private var deviceScale = 0.0
    private var laidOutHeight = 0

    init {
        isOpaque = true
        ToolTipManager.sharedInstance().registerComponent(this)
        val mouse = object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                val h = hitAt(e) ?: return
                if (h.open) onOpen(h.setKey, h.kind)
            }

            override fun mouseMoved(e: MouseEvent) {
                cursor = if (hitAt(e)?.open == true) Cursor.getPredefinedCursor(Cursor.HAND_CURSOR) else Cursor.getDefaultCursor()
            }
        }
        addMouseListener(mouse)
        addMouseMotionListener(mouse)
    }

    /**
     * 보여 줄 요구사항을 바꾼다. clickable 은 「setKey/kind」 꼴로, 눌러서 갈 곳이 있는 칸이다 (예: A/code).
     */
    fun show(row: ReqRow?, lanes: List<ChainLane>, dots: AttemptDots?, clickable: Set<String>) {
        this.row = row
        this.lanes = lanes
        this.dots = dots
        this.clickable = clickable
        laidOutWidth = -1
        revalidate()
        repaint()
    }

    fun isEmpty() = row == null || lanes.isEmpty()

    /** 그림에 적힌 글 (시험용): 제목, 칸마다 「표시 이름: 글」, 점 그림의 줄 */
    fun lines(): List<String> {
        val r = row ?: return emptyList()
        val out = ArrayList<String>()
        out.add(heading(r))
        if (hasMissing()) out.add(hint())
        for (lane in lanes) {
            if (lanes.size > 1) out.add(laneLabel(lane))
            for (s in lane.steps) out.add("${Tones.symbol(s.tone)}${s.title}: ${s.text}")
        }
        dots?.let { d ->
            out.add("${I18n.t("요구사항", "Required")}: ${d.required}")
            for (x in d.rows) out.add("${dotLabel(x)}: ${x.at} · ${delta(x.at - d.required)}")
        }
        return out
    }

    private fun heading(r: ReqRow) = "${r.id} · ${I18n.overall(r.overall)} · ${I18n.t("근거 사슬", "Evidence chain")}"
    private fun hint() = I18n.t("회색 점선 = 비어 있는 칸", "grey dashed = missing")
    private fun laneLabel(lane: ChainLane) = I18n.t("코드 · ${lane.label}", "Code · ${lane.label}")
    private fun hasMissing() = lanes.any { l -> l.steps.any { it.tone == "miss" } }
    private fun dotLabel(x: DotRow) = if ((dots?.rows?.size ?: 0) > 1) x.key else I18n.t("코드", "Code")
    private fun delta(d: Int) = when {
        d == 0 -> I18n.t("같은 시점", "same attempt")
        d > 0 -> I18n.t("${d}번 늦음", "$d late")
        else -> I18n.t("${-d}번 빠름", "${-d} early")
    }

    // ------------------------------------------------------------ 배치

    private fun s(v: Int) = JBUI.scale(v)

    private fun ensureLayout() {
        val w = maxOf(width, s(160))
        if (w == laidOutWidth) return
        laidOutWidth = w
        texts.clear()
        boxes.clear()
        dotList.clear()
        hits.clear()
        val r = row
        if (r == null || lanes.isEmpty()) {
            laidOutHeight = 0
            return
        }
        // 글자 폭은 그릴 때와 같은 설정(부드러운 글자)으로 잰다. 다르게 재면 이름 칸과 글이 붙는다.
        val scratch = BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
        try {
            if (deviceScale <= 0.0) deviceScale = JBUIScale.sysScale(this).toDouble()
            scratch.scale(deviceScale, deviceScale)
            scratch.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            UISettings.setupAntialiasing(scratch)
            layoutWith(r, w) { scratch.getFontMetrics(it) }
        } finally {
            scratch.dispose()
        }
    }

    private fun layoutWith(r: ReqRow, w: Int, getFontMetrics: (Font) -> FontMetrics) {
        val base = JBUI.Fonts.label()
        val bold = base.deriveFont(Font.BOLD)
        val small = JBUI.Fonts.smallFont()
        val smallBold = small.deriveFont(Font.BOLD)
        val mono = Font(Font.MONOSPACED, Font.PLAIN, base.size)
        val fg = UIUtil.getLabelForeground()
        val grey = UIUtil.getContextHelpForeground()
        val pad = s(10)
        var y = s(8)

        // 제목: R2 · 다름 · 근거 사슬
        val fmBold = getFontMetrics(bold)
        val idPart = "${r.id} · "
        val verdict = I18n.overall(r.overall)
        texts.add(Text(idPart, pad, y + fmBold.ascent, bold, fg))
        texts.add(Text(verdict, pad, y + fmBold.ascent, bold, Tones.ink(Tones.of(r.overall)), follow = true))
        texts.add(Text(" · " + I18n.t("근거 사슬", "Evidence chain"), pad, y + fmBold.ascent, bold, fg, follow = true))
        y += fmBold.height + s(2)
        if (hasMissing()) {
            val fm = getFontMetrics(small)
            texts.add(Text(hint(), pad, y + fm.ascent, small, grey))
            y += fm.height
        }
        y += s(6)

        val fmTitle = getFontMetrics(smallBold)
        val titleW = lanes.flatMap { it.steps }.maxOfOrNull { fmTitle.stringWidth(Tones.symbol(it.tone) + it.title) } ?: 0
        val inL = s(10)
        val inR = s(8)
        val gap = s(12)
        val textX = pad + inL + titleW + gap
        val textW = w - pad - inR - textX

        for (lane in lanes) {
            if (lanes.size > 1) {
                texts.add(Text(laneLabel(lane), pad, y + fmTitle.ascent, smallBold, grey))
                y += fmTitle.height + s(4)
            }
            lane.steps.forEachIndexed { i, step ->
                val font = if (step.kind == "code") mono else base
                val fm = getFontMetrics(font)
                val wrapped = wrap(step.text, fm, textW, 3)
                val lineH = fm.height
                val h = maxOf(wrapped.size * lineH, fmTitle.height) + s(10)
                val rect = Rectangle(pad, y, w - 2 * pad, h)
                boxes.add(Box(rect, step.tone))
                val firstBase = y + s(5) + fm.ascent
                texts.add(Text(Tones.symbol(step.tone) + step.title, pad + inL, firstBase, smallBold, Tones.ink(step.tone)))
                wrapped.forEachIndexed { k, line -> texts.add(Text(line, textX, firstBase + k * lineH, font, fg)) }
                val key = "${lane.setKey}/${step.kind}"
                val open = key in clickable
                val tip = "${step.title}: ${step.text}" + if (open) I18n.t(" — 눌러서 이동", " — click to go there") else ""
                hits.add(Hit(rect, lane.setKey, step.kind, tip, open))
                y += h
                if (i < lane.steps.size - 1) {
                    val fm2 = getFontMetrics(small)
                    texts.add(Text("↓", pad + inL + s(2), y + fm2.ascent - s(1), small, grey))
                    y += fm2.height - s(2)
                }
            }
            y += s(8)
        }

        // 점 그림: 요구사항은 몇 번째, 코드는 몇 번째에 동작하는가
        dots?.takeIf { it.max > 0 && it.rows.isNotEmpty() }?.let { d ->
            val fm = getFontMetrics(small)
            val labels = listOf(I18n.t("요구사항", "Required")) + d.rows.map { dotLabel(it) }
            val labelW = labels.maxOf { fm.stringWidth(it) } + s(8)
            val avail = w - 2 * pad - labelW
            val step = minOf(s(26), maxOf(s(15), avail / d.max))
            val dia = step - s(4)
            fun rowOf(label: String, at: Int, tone: String, note: String?) {
                texts.add(Text(label, pad, y + (dia + fm.ascent - fm.descent) / 2, small, if (tone == "plain") grey else Tones.ink(tone)))
                for (n in 1..d.max) dotList.add(Dot(pad + labelW + (n - 1) * step, y, dia, n, tone, n == at, n > at))
                y += dia + s(3)
                if (note != null) {
                    texts.add(Text(note, pad + labelW, y + fm.ascent, smallBold, Tones.ink(tone)))
                    y += fm.height + s(2)
                }
            }
            rowOf(labels[0], d.required, "plain", null)
            for (x in d.rows) {
                val off = x.at - d.required
                rowOf(dotLabel(x), x.at, if (off == 0) "ok" else "diff", Tones.symbol(if (off == 0) "ok" else "diff") + delta(off))
            }
            y += s(4)
        }
        laidOutHeight = y + s(4)
    }

    /** 폭에 맞춰 줄을 나눈다. 띄어쓰기에서 끊고, 긴 낱말은 글자에서 끊는다. maxLines 를 넘으면 … 으로 줄인다. */
    private fun wrap(text: String, fm: FontMetrics, width: Int, maxLines: Int): List<String> {
        if (width <= 0 || text.isEmpty()) return listOf(text)
        val out = ArrayList<String>()
        var start = 0
        while (start < text.length) {
            var end = start
            var lastSpace = -1
            while (end < text.length && fm.stringWidth(text.substring(start, end + 1)) <= width) {
                if (text[end] == ' ') lastSpace = end
                end++
            }
            if (end == text.length) {
                out.add(text.substring(start))
                break
            }
            if (end == start) end = start + 1
            val cut = if (lastSpace > start) lastSpace else end
            out.add(text.substring(start, cut).trimEnd())
            start = if (lastSpace > start) lastSpace + 1 else cut
        }
        if (out.size <= maxLines) return out
        var last = out[maxLines - 1]
        while (last.isNotEmpty() && fm.stringWidth("$last…") > width) last = last.dropLast(1)
        return out.take(maxLines - 1) + "$last…"
    }

    private fun hitAt(e: MouseEvent): Hit? {
        ensureLayout()
        return hits.firstOrNull { it.r.contains(e.point) }
    }

    override fun getToolTipText(event: MouseEvent): String? = hitAt(event)?.tip

    // ------------------------------------------------------------ 그리기

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            // 화면 배율이 배치할 때와 다르면(처음 그릴 때 · 다른 모니터로 옮겼을 때) 글자 폭을 다시 잰다
            val sc = g2.transform.scaleX
            if (sc > 0.0 && Math.abs(sc - deviceScale) > 0.01) {
                deviceScale = sc
                laidOutWidth = -1
                revalidate()
            }
            ensureLayout()
            g2.color = UIUtil.getTreeBackground()
            g2.fillRect(0, 0, width, height)
            if (isEmpty()) return
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            UISettings.setupAntialiasing(g2)
            val arc = s(8)
            for (b in boxes) {
                val r = b.r
                g2.color = Tones.fill(b.tone)
                g2.fillRoundRect(r.x, r.y, r.width - 1, r.height - 1, arc, arc)
                if (b.tone == "miss") {
                    // 비어 있는 칸: 회색 점선
                    g2.color = Tones.ink(b.tone)
                    g2.stroke = BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, floatArrayOf(s(4).toFloat(), s(3).toFloat()), 0f)
                } else {
                    g2.color = Tones.border(b.tone)
                    g2.stroke = BasicStroke(1f)
                }
                g2.drawRoundRect(r.x, r.y, r.width - 1, r.height - 1, arc, arc)
                g2.stroke = BasicStroke(1f)
                if (b.tone == "diff" || b.tone == "fail") {
                    // 어긋난 칸: 왼쪽에 굵은 띠
                    g2.color = Tones.ink(b.tone)
                    g2.fillRoundRect(r.x, r.y, s(3), r.height - 1, s(2), s(2))
                }
            }
            val smallBold = JBUI.Fonts.smallFont().deriveFont(Font.BOLD)
            val small = JBUI.Fonts.smallFont()
            for (d in dotList) {
                if (d.active) {
                    g2.color = Tones.ink(d.tone)
                    g2.fillOval(d.x, d.y, d.d, d.d)
                } else {
                    g2.color = Tones.ink("miss")
                    g2.stroke = if (d.after) BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, floatArrayOf(2f, 2f), 0f) else BasicStroke(1f)
                    g2.drawOval(d.x, d.y, d.d - 1, d.d - 1)
                    g2.stroke = BasicStroke(1f)
                }
                val font = if (d.active) smallBold else small
                val fm = g2.getFontMetrics(font)
                val label = d.n.toString()
                g2.font = font
                g2.color = if (d.active) Tones.fill(d.tone) else Tones.ink("miss")
                g2.drawString(label, d.x + (d.d - fm.stringWidth(label)) / 2, d.y + (d.d + fm.ascent - fm.descent) / 2)
            }
            var end = 0
            for (t in texts) {
                g2.font = t.font
                g2.color = t.color
                val x = if (t.follow) end else t.x
                g2.drawString(t.s, x, t.y)
                end = x + g2.fontMetrics.stringWidth(t.s)
            }
        } finally {
            g2.dispose()
        }
    }

    override fun getPreferredSize(): Dimension {
        ensureLayout()
        return Dimension(s(220), laidOutHeight)
    }

    override fun setBounds(x: Int, y: Int, width: Int, height: Int) {
        val changed = width != this.width
        super.setBounds(x, y, width, height)
        if (changed) {
            // 폭이 바뀌면 줄 나눔이 달라져 높이도 달라진다
            laidOutWidth = -1
            revalidate()
        }
    }

    override fun getPreferredScrollableViewportSize(): Dimension = preferredSize
    override fun getScrollableUnitIncrement(visibleRect: Rectangle, orientation: Int, direction: Int) = s(16)
    override fun getScrollableBlockIncrement(visibleRect: Rectangle, orientation: Int, direction: Int) =
        if (orientation == SwingConstants.VERTICAL) visibleRect.height else visibleRect.width

    override fun getScrollableTracksViewportWidth() = true
    override fun getScrollableTracksViewportHeight() = false
}

package asia.damun.verifylens

import com.intellij.DynamicBundle
import com.intellij.ide.util.PropertiesComponent
import java.util.Locale

/**
 * 화면 글의 언어. VS Code 확장과 같은 규칙: 정해 두지 않으면(auto) IDE 의 화면 언어를 따른다 —
 * 한국어 IDE 면 한국어, 그 밖에는 영어. 「VerifyLens: 화면 언어」에서 한국어 · 영어로 고정할 수 있다.
 *
 * 엔진이 보내는 값 가운데 상태(확인됨 · 다름 · 실패 · 미확인)는 언어와 상관없이 늘 한국어 값이다.
 * 아이콘 · 색은 그 값으로 고르고, 화면에 쓸 때만 [overall] 로 바꾼다.
 */
object I18n {
    private const val KEY = "verifylens.language"
    const val AUTO = "auto"

    /** auto | ko | en */
    var setting: String
        get() = PropertiesComponent.getInstance().getValue(KEY)?.takeIf { it == "ko" || it == "en" } ?: AUTO
        set(value) = PropertiesComponent.getInstance().setValue(KEY, value.takeIf { it == "ko" || it == "en" })

    /** 지금 쓸 언어: ko 또는 en. 시험에서는 시스템 속성 verifylens.lang 으로 정한다. */
    fun lang(): String {
        System.getProperty("verifylens.lang")?.takeIf { it == "ko" || it == "en" }?.let { return it }
        return resolve(setting, ideLocale())
    }

    /** 설정과 IDE 언어로 언어를 정한다. ko · en 이 아니면 IDE 언어를 따른다. */
    fun resolve(setting: String?, locale: Locale?): String = when (setting) {
        "ko", "en" -> setting
        else -> if (locale?.language == "ko") "ko" else "en"
    }

    /** IDE 의 화면 언어 (언어 팩을 따른다). 알 수 없으면 운영 체제의 언어. */
    private fun ideLocale(): Locale = try {
        DynamicBundle.getLocale()
    } catch (_: Throwable) {
        Locale.getDefault()
    }

    fun isEn() = lang() == "en"

    /** 지금 언어의 글을 고른다. */
    fun t(ko: String, en: String) = if (isEn()) en else ko

    /** 상태 이름: 확인됨 · 다름 · 실패 · 미확인 → Verified · Different · Failed · Not verified */
    fun overall(value: String): String = if (!isEn()) value else when (value) {
        "확인됨" -> "Verified"
        "다름" -> "Different"
        "실패" -> "Failed"
        "미확인" -> "Not verified"
        else -> value
    }
}

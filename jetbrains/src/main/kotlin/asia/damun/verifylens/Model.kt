package asia.damun.verifylens

// 엔진(engine/main.ts)이 내는 JSON 의 모양. rows 는 vscode/src/model.ts 의 treeModel, lenses 는 allLenses 와 같다.
// Gson 이 인자 없는 생성자로 만들고 값을 채우므로, 모든 필드에 기본값을 둔다.

class EvidenceRow {
    var setKey = "A"
    var label = ""
    var file: String? = null
    var line: Int? = null
    var detail = ""
    var tooltip = ""
}

class ReqRow {
    var id = ""
    var text = ""

    /** 확인됨 · 다름 · 실패 · 미확인 */
    var overall = ""
    var reason = ""
    var summary = ""
    var children: List<EvidenceRow> = emptyList()
}

/** 근거가 된 코드 줄 하나에 붙일 표시 */
class Lens {
    var setKey = "A"
    var file = ""
    var line = 0
    var endLine = 0
    var reqId = ""
    var reqText = ""
    var overall = ""
    var severity = ""
    var head = ""
    var note = ""
    var title = ""
}

class SetInfo {
    var key = ""
    var label = ""
    var ref = ""
    var sha = ""
    var wip: String? = null

    /** 지금 작업 폴더에 있는 결과인가. 아니면(샘플의 A · B) files 에 내용이 실려 온다. */
    var onDisk = false
    var files: Map<String, String> = emptyMap()
}

class EngineResult {
    var ok = false
    var protocol = 0
    var code: String? = null
    var error: String? = null

    /** demo | repo */
    var kind = ""
    var repo = ""
    var base = ""
    var workingRef: String? = null
    var headline = ""
    var context = ""
    var status = ""
    var counts: Map<String, Int> = emptyMap()
    var attention = 0
    var notes: List<String> = emptyList()
    var demoHeadline: String? = null
    var sets: List<SetInfo> = emptyList()
    var rows: List<ReqRow> = emptyList()
    var lenses: List<Lens> = emptyList()

    /** 요구사항별 「몇 번째 시도에 동작하는가」 그림 (글자로 그린 줄들) */
    var strips: Map<String, List<String>> = emptyMap()
    var requirements: String? = null

    /** 바뀌면 다시 확인할 파일들 (요구사항 파일 · 테스트 결과 후보) */
    var watch: List<String> = emptyList()
    var created = false

    companion object {
        fun failure(code: String, message: String) = EngineResult().apply {
            this.code = code
            this.error = message
        }
    }
}

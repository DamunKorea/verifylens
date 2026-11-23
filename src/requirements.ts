import type { Requirement } from './types.ts';
import { tokenize, clip } from './tokens.ts';
import { conceptsFor } from './glossary.ts';
import { L } from './i18n.ts';
import { numbersIn, parseConstraints } from './numeric.ts';

/** 「관리자만」 · only: 다른 경우를 빼는 요구사항 */
const ONLY_CUE = /[가-힣]만(?=\s|$)|\bonly\b/i;
// 「선물할 수 없다」 · 「로그인할 수 없다」도 막으라는 말이다 (0.17.0 전에는 영어 cannot 만 읽었다)
const GUARD_CUE = /(않|차단|거부|막|금지|불가|수\s*없|reject|deny|block|forbid|refuse|must not|cannot|can't)/i;
/** 무엇을 확인하거나 막는 조건이 코드에 있어야 하는 요구사항 (함수 이름만 겹쳐서는 근거가 되지 않는다) */
/** 「없으면 404」 · 「when the project does not exist」: 없는 경우를 걸러 내는 조건이 코드에 있어야 한다 (0.24.0, 맞는 코드 묶음에서 찾음) */
const MISSING_CUE = /\b(?:does not|doesn't|do not|don't)\s+exist|\bnot found\b|\bis missing\b|\bno such\b|없으면|존재하지\s*않|찾을\s*수\s*없/i;
/** 「Return 404 …」 · 「responds with 403」: HTTP 상태 번호는 숫자 조건이 아니라 코드에 그대로 나오는 낱말이다 */
const HTTP_STATUS = /\b(?:return|returns|respond|responds|response|status|http|with)\s+(?:an?\s+|the\s+|http\s+)?([1-5]\d\d)\b|\b([1-5]\d\d)\s+(?:error|status|response|not found|forbidden|unauthori[sz]ed|conflict)\b/gi;
const CHECK_CUE = /\bmust\b|\brequired?\b|\bneeds?\b|\bhave to\b|\bhas to\b|해야|여야|필요|만\s+\S+\s*수\s*있|\bonce\s+(?:per|a|each|for)\b|\bonly once\b|\bonly one\b|한\s*번(?:씩)?만|하나만|중복/i;

// ── 코드의 동작이 아닌 줄 (실제 공개 PR 17개에서 찾음, 0.26.0) ──
// 뽑은 82줄 가운데 절반이 요구사항이 아니었고, 그 가운데 셋이 「확인됨」이 됐다(「Add tests …」 · 고치기 전 버그를 설명한 문장).
/** PR 을 올린 사람이 할 일: 테스트 추가 · 실행, 서식 · 린트 명령, 문서 주석, 「같은 것을 다른 곳에도」 */
export const PROCESS_LINE =
  /^(?:(?:add|write|update|run|fix|ran|added|wrote|updated|include|included)\s+(?:(?:the|a|an|new|more|unit|e2e|integration|regression|missing|some)\s+){0,3}tests?\b|(?:the\s+)?(?:new|added|updated|existing)\s+tests?\b|`?(?:npm|pnpm|yarn|bun|npx|deno)\s|(?:add|update|write)\s+(?:the\s+)?(?:ts|js)?doc|(?:update|add)\s+(?:the\s+)?(?:docs?|documentation|readme|changelog|changeset)\b|(?:apply|do)\s+(?:it|this|that|the\s+same(?:\s+\w+)?)\s+(?:to|in|for)\b|테스트\s*(?:를|을)?\s*(?:추가|작성|실행|돌|보강)|문서\s*(?:를|을)?\s*(?:추가|갱신|업데이트))|\bto\s+(?:format|lint)\b/i;
/** 타입 수준 요구사항: VerifyLens 는 실행되는 조건만 읽고 TypeScript 타입은 읽지 못한다 */
export const TYPE_LEVEL = /\btype\s+errors?\b|\btype[-\s]?checks?\b|\bcompile[-\s]?time\b|\b(?:typescript|ts)\s+(?:errors?|types?)\b|타입\s*(?:오류|에러|검사)|컴파일\s*(?:오류|에러)/i;
/** 까닭 · 인용: 「According to RFC …」 · 「AWS documents that …」 · 「This matters for …」 · 「#12 covers …」 */
const CITE = /^(?:according\s+to|per\s+(?:rfc|the\s+spec)|rfc[\s-]?\d|this\s+(?:matters|is\s+(?:important|needed|why|because)|happens|breaks|causes)\b|#\d+\s|(?:actual|current)\s+(?:behaviou?r|result|output)?\s*(?:vs\.?|:))|\b(?:documents?|states?|specifies)\s+that\b|.{0,30}에\s*따르면/i;
/** 「반드시 · 해야」 · now 처럼 지금 · 앞으로의 동작을 말하는 낱말 (이것이 있으면 배경으로 보지 않는다) */
const DIRECTIVE = /\b(?:should|must|shall|will|now|no\s+longer|needs?\s+to|has\s+to|have\s+to)\b|해야|여야|되어야|하도록|않게|않아야/i;
/** 고치기 전의 동작: 「A cookie value … was turned into …」 · 「… made the constructor throw, so …」 */
const PAST = /\b(?:was|were|had|did|kept|made|returned|threw|caused|broke|failed|crashed|ignored|accepted|skipped|turned|became|got|leaked|lost|stripped|dropped|showed|let)\b/i;
const ALREADY = /\balready\s+(?:does|do|did|is|are|has|have|returns?|handles?|works?|exists?|supports?)\b/i;
// 「gets」는 작은 글자만 본다 (대소문자를 가리지 않으면 HTTP 의 GET 에 걸린다)
const BEFORE_PAST = /\b(?:is|are|be|been|being|does|do|can|cannot|that|which|who|when|if|unless|so|after|before|once|until|while)\b/i;
const BEFORE_GET = /\bgets?\b/;
function oldBehavior(t: string): boolean {
  if (DIRECTIVE.test(t)) return false;
  if (/^(?:예전|이전|기존|원래)(?:에는|엔)\s/.test(t)) return true;
  // 주어 + 동사로 시작하는 문장만 본다 (「Skip users who already voted」 · 「… that was not before」 · 「is kept」는 지금의 동작이다)
  const lead = (m: RegExpExecArray | null) => {
    if (!m) return false;
    const before = t.slice(0, m.index);
    // 「With overwrite: false, a header the response already has is kept」: 쉼표 뒤는 주어가 아니다.
    // 「`>= 400` — merge only errHeaders (fixes CORS on a returned 401)」: 괄호 · 줄표 · 쌍점 뒤의 낱말도 주어 + 동사가 아니다
    return before.trim().length > 0 && !/[,(—–→:;]/.test(before) && before.split(/\s+/).length <= 14 && !BEFORE_PAST.test(before) && !BEFORE_GET.test(before);
  };
  // 「The bodyless control already does so」 · 「The legacy router already returns 404」: 지금 이미 그렇다는 설명
  return lead(ALREADY.exec(t)) || lead(PAST.exec(t));
}
/** 요구사항이 아닌 줄인가 (절차 · 까닭 · 인용 · 고치기 전 버그 설명). 요구사항 뽑기에서 뺀다 */
export function notRequirement(t: string): boolean {
  return PROCESS_LINE.test(t) || CITE.test(t) || oldBehavior(t);
}

export function parseRequirements(md: string): Requirement[] {
  const reqs: Requirement[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s*(?:\[[ xX]\]\s*)?(R\d+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const [body, kw] = m[2].split(/\|\s*keywords?\s*:/i);
    const text = body.trim().replace(/\s*\|\s*$/, '');
    const keywords = (kw ?? '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const numbers = numbersIn(text);
    const constraints = parseConstraints(text);
    const auto = !keywords.length;
    // 키워드를 적어도 문장의 개념은 뽑아 둔다 (검사 이름과 이을 때 쓴다)
    // 「5 times」의 times 는 단위다. 무엇을 하는지 말하는 낱말이 아니므로 개념으로 세지 않는다
    const concepts = conceptsFor(text.replace(/(\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten))\s*times?\b/gi, '$1'));
    // 키워드는 「코드에 나오는 영어 낱말」이지만 한국어로 적는 사람도 있다(「| keywords: 실패, 잠금」).
    // 한국어 키워드는 용어집으로 영어 낱말을 함께 쓴다. 그대로면 코드의 failures · locked 와 이어지지 않아 모두 「미확인」이 됐다.
    const kwTokens = keywords.flatMap((k) => (/[가-힣]/.test(k) ? [...conceptsFor(k).flat(), ...tokenize(k)] : tokenize(k)));
    const statuses = [...text.matchAll(HTTP_STATUS)].map((x) => x[1] ?? x[2]);
    for (const s of statuses) if (!concepts.some((g) => g.includes(s))) concepts.push([s]);
    const tokens = auto ? concepts.flat() : [...kwTokens, ...statuses];
    const unreadable = PROCESS_LINE.test(text) ? 'process' : TYPE_LEVEL.test(text) ? 'type' : undefined;
    reqs.push({ id: m[1].toUpperCase(), text, keywords, auto, concepts, tokens: [...new Set(tokens)], numbers, guardCue: GUARD_CUE.test(text), constraints, only: ONLY_CUE.test(text), needsCheck: GUARD_CUE.test(text) || CHECK_CUE.test(text) || ONLY_CUE.test(text) || MISSING_CUE.test(text), ...(unreadable ? { unreadable } : {}) });
  }
  return reqs;
}

const SECTION = /(acceptance\s*criteria|requirements?|definition\s*of\s*done|expected\s*behaviou?r|요구\s*사항|인수\s*조건|완료\s*조건|수용\s*기준|기대\s*동작|해야\s*할\s*일|체크\s*리스트)/i;
const MODAL = /(해야|한다|하도록|할 수|않는다|않게|되어야|된다|must|should|shall|when |if |needs? to|able to|cannot|can't)/i;
// PR 양식의 절차 칸: 무엇을 만들지가 아니라 PR 을 올린 사람이 한 일이다 (공개 PR 「Task Checklist」에서 찾음, 11/22)
// 「The author should do the following, if applicable」(Hono 의 PR 양식, 실제 PR 시험에서 찾음 0.26.0)
const PROCESS_SECTION = /check\s*-?\s*list|before\s+(?:you\s+)?(?:submit|merg|open)|type\s+of\s+change|related\s+(?:issues?|tasks?|prs?)|how\s+(?:has\s+this\s+been|to)\s+test|^testing$|test\s+plan|screenshots?|notes?\s+(?:for|to)\s+review|\bauthor\s+should\b|should\s+do\s+the\s+following|\bif\s+applicable\b/i;
// 이슈 양식에서 지금(고치기 전)의 동작 · 재현 · 환경을 적는 칸: 요구사항이 아니다
const BACKGROUND_SECTION = /actual\s+(?:behaviou?r|result)|current\s+behaviou?r|what\s+do\s+you\s+see|what\s+happens|steps?\s+(?:to\s+)?reproduc|reproduc|use\s+case|motivation|^background$|^context$|environment|versions?\b|platform|runtime|root\s+cause|investigation|^logs?$|재현|현재\s*동작|^배경$|환경/i;
// 「I have created a task」 · 「I've added tests」: 올린 사람의 확인 문장
const AUTHOR_ITEM = /^(?:I(?:'ve|'m|'d)\b|I\s+(?:have|has|am|did|added|ran|tested|updated|created|confirm(?:ed)?|agree|read|followed|checked|made|wrote|signed|performed|reviewed|verified|included|linked)\b|we(?:'ve|\s+have)\s|저는\s|제가\s)/i;

/**
 * 이슈 · PR · 메신저에서 복사한 글에서 요구사항 후보 문장을 뽑는다 (규칙 기반, AI 없음).
 * 「요구사항 / Acceptance criteria」 같은 제목 아래의 목록 > 글 전체의 목록 > 「~해야 한다」 꼴 문장 순으로 고른다.
 */
export function extractRequirements(md: string, max = 12): string[] {
  const clean = (t: string) =>
    t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.。]+$/, '');
  const text = md.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const inSection: string[] = [];
  const bullets: string[] = [];
  const sentences: string[] = [];
  let section = false;
  let process = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('>') || /^notes?\s*:/i.test(line)) continue;
    const head = line.match(/^(#{1,6})\s+(.*)$/) ?? line.match(/^\*\*(.+?)\*\*:?$/) ?? line.match(/^([^-*\d].{0,40}):$/);
    if (head) {
      const title = (head[2] ?? head[1]).trim();
      section = SECTION.test(title);
      // 「체크리스트」는 한국어 요구사항 칸으로도 쓰므로, 요구사항 칸 이름이 함께 있으면 절차 칸으로 보지 않는다
      // 이슈 양식의 재현 · 환경 칸은 제목(# · **)일 때만 본다. 「Reproduced on current main, Node 24:」 같은 글 속 쌍점 줄은 칸이 아니다 (h3 이슈에서 찾음)
      const markedHead = !line.endsWith(':') || /^(#|\*\*)/.test(line);
      process = !section && (PROCESS_SECTION.test(title) || (markedHead && BACKGROUND_SECTION.test(title)));
      continue;
    }
    if (process) continue;
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
    if (item) {
      const t = clean(item[1]);
      // 「Enhanced feature detection in `constants.ts`:」처럼 쌍점으로 끝나는 짧은 목록 줄은 아래 목록의 작은 제목이다 (긴 줄은 요구사항일 수 있다)
      if (AUTHOR_ITEM.test(t) || notRequirement(t) || (/[:：]$/.test(t) && t.split(/\s+/).length <= 8)) continue;
      (section ? inSection : bullets).push(t);
    } else if (section || MODAL.test(line)) {
      // 「Expected behavior」 같은 요구사항 칸 안의 줄글은 「must」 같은 말이 없어도 한 문장씩 후보로 쓴다
      for (const part of line.split(/(?<=[.。!?])\s+/)) {
        if (/[:：]$/.test(part.trim()) || AUTHOR_ITEM.test(part.trim()) || notRequirement(clean(part))) continue;
        if (section) inSection.push(clean(part));
        else if (MODAL.test(part)) sentences.push(clean(part));
      }
    }
  }
  const pool = inSection.length ? inSection : bullets.length >= 2 ? bullets : [...bullets, ...sentences];
  const seen = new Set<string>();
  return pool
    .filter((t) => {
      const key = t.toLowerCase();
      if (t.length < 6 || seen.has(key) || /^https?:\S+$/.test(t)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map((t) => clip(t, 140));
}

/** 요구사항 후보를 requirements.md 글로 만든다. start 는 첫 번호. */
export function draftRequirements(cands: string[], source = '', start = 1): string {
  const out = [
    L(`# 요구사항 초안${source ? ` — ${source}에서 가져옴` : ''}. 읽어 보고 고친 뒤 저장하세요.`, `# Draft requirements${source ? ` — imported from ${source}` : ''}. Read them, fix them, then save.`),
    L('# 형식: - R번호: 요구사항 문장', '# Format: - R<number>: requirement sentence'),
    L('# 코드와 잘못 이어지면 뒤에 「| keywords: 코드에 나오는 영어 단어」를 붙여 직접 정할 수 있습니다.', '# If a requirement lands on the wrong code, append "| keywords: words, in, the, code" to pin it yourself.'),
  ];
  cands.forEach((c, i) => out.push(`- R${start + i}: ${c}`));
  return out.join('\n') + '\n';
}

/** PR 설명에서 요구사항 후보를 뽑아 requirements.md 초안으로 만든다. 사람이 고치고 확정한다. */
export function extractFromPrBody(md: string): string {
  return draftRequirements(extractRequirements(md));
}

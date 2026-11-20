// 요구사항 문장의 숫자 조건을 읽고, 코드의 비교와 맞는지 판정한다.
// AI 추정이 아니라 고정된 규칙이다. 문장이나 코드만으로 정할 수 없으면 「맞다」고 하지 않고 확정 불가(ok: null)로 둔다.
import type { Boundary, Constraint, NumPart, NumRelation, Text, UnitKind } from './types.ts';
import { getLang } from './i18n.ts';

const T = (ko: string, en: string): Text => ({ ko, en });
export const pick = (t: Text | undefined, lang = getLang()): string => (t ? t[lang] : '');

// ---------------------------------------------------------------- 문장 읽기
const NATIVE: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
const MAGNITUDE: Record<string, number> = { 억: 1e8, 천만: 1e7, 백만: 1e6, 십만: 1e5, 만: 1e4, 천: 1e3, 백: 100 };

const UNITS: [RegExp, UnitKind][] = [
  [/^(?:원|달러|dollars?|usd|krw|won)\b|^(?:원|달러)/i, 'money'],
  [/^(?:세|살)(?![가-힣]*(?:대))|^years?\s+old\b/i, 'age'],
  [/^(?:글자|자리|자)|^(?:characters?|chars?|letters?|digits?)\b/i, 'char'],
  [/^(?:개월|달)|^months?\b/i, 'month'],
  [/^(?:주일|주)(?!년|문)|^weeks?\b/i, 'week'],
  [/^일(?![가-힣]*(?:부|반|단|괄))|^days?\b/i, 'day'],
  [/^시간|^(?:hours?|hrs?)\b/i, 'hour'],
  [/^분|^(?:minutes?|mins?)\b/i, 'min'],
  [/^초|^(?:seconds?|secs?)\b/i, 'sec'],
  [/^(?:%|퍼센트|프로)|^percent\b/i, 'pct'],
  [/^(?:kb|킬로바이트)/i, 'kb'],
  [/^(?:mb|메가바이트|메가)/i, 'mb'],
  [/^(?:gb|기가바이트|기가)/i, 'gb'],
  [/^(?:회|번)(?!째)|^(?:times?|attempts?|tries|retries|failures?|failed)\b/i, 'cnt'],
  [/^(?:개|건|명|장|점|권|줄)|^(?:items?|members?|users?|people|entries|records|points?|rows?|products?)\b/i, 'qty'],
];

/** 코드에서 같은 값을 쓸 수 있는 단위 환산 (예: 30분 = 1800초 = 1800000ms) */
const SCALES: Partial<Record<UnitKind, number[]>> = {
  week: [1, 7, 168, 10080, 604800, 604800000],
  day: [1, 24, 1440, 86400, 86400000],
  hour: [1, 60, 3600, 3600000],
  min: [1, 60, 60000],
  sec: [1, 1000],
  pct: [1, 0.01],
  kb: [1, 1024, 1000],
  mb: [1, 1024, 1048576, 1000, 1000000],
  gb: [1, 1024, 1048576, 1073741824, 1000, 1000000, 1000000000],
};

const NUM = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(억|천만|백만|십만|만|천|백)(?![가-힣]*(?:약|명히)))?/g;
// 「한 번에」 · 「한 번도」 · 「두 번 다시」는 횟수 조건이 아니다
const NATIVE_RE = /(?<![가-힣])(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*(?=번(?!\s*(?:에|도|더|씩|쯤|다시))|회|개|명|살|시간|달)/g;
const WORD_RE = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundred)\b(?=\s+(?:times?|attempts?|tries|retries|failures?|failed|characters?|items?|days?|hours?|minutes?|seconds?|members?|users?|files?|consecutive))/gi;

const MORE = 'more|greater|larger|bigger|longer|higher';
const LESS = 'less|fewer|smaller|shorter|lower';
/** 숫자 앞에 오는 말. 긴 표현이 먼저다: no more than 이 more than 보다, up to but not including 이 up to 보다 먼저. */
const BEFORE: [RegExp, NumRelation][] = [
  [/(?:up to but (?:not including|excluding))\s*$/i, 'lt'],
  [new RegExp(`(?:(?:no|not)\\s+(?:${MORE})\\s+than|(?:${LESS})\\s+than\\s+or\\s+equal\\s+to)\\s*$`, 'i'), 'lte'],
  [new RegExp(`(?:(?:no|not)\\s+(?:${LESS})\\s+than|(?:${MORE})\\s+than\\s+or\\s+equal\\s+to)\\s*$`, 'i'), 'gte'],
  [/(?:(?:not|never|cannot|can't|can not|must not|may not|shall not|should not|does not|doesn't|do not|don't|won't|will not)\s+(?:be\s+)?(?:exceed(?:ing)?|over|above|beyond))\s*$/i, 'lte'],
  [/(?:최대|많아야|up to and including|up to|through|at most|maximum(?: of)?|max(?:imum)?:?|limited to|capped at|cap of|limit of|within)\s*$/i, 'lte'],
  [/(?:최소|적어도|at least|minimum(?: of)?|min(?:imum)?:?|starting (?:at|from)|from)\s*$/i, 'gte'],
  [new RegExp(`(?:(?:${MORE})\\s+than|over|above|beyond|exceed(?:s|ing)?)\\s*$`, 'i'), 'gt'],
  [new RegExp(`(?:(?:${LESS})\\s+than|under|below)\\s*$`, 'i'), 'lt'],
  // 「최소 주문 금액은 10,000원」 · 「the maximum size is 5」 · 「Max file size: 8mb」
  [/(?:최대|최고)[^,.]{0,14}(?:은|는|이|가)\s*$|\b(?:maximum|max)\b[^,.]{0,20}(?:\b(?:is|of)|:)\s*$/i, 'lte'],
  [/(?:최소|최저)[^,.]{0,14}(?:은|는|이|가)\s*$|\b(?:minimum|min)\b[^,.]{0,20}(?:\b(?:is|of)|:)\s*$/i, 'gte'],
];
/** 숫자(와 단위) 뒤에 오는 말 */
const AFTER: [RegExp, NumRelation][] = [
  [/^\s*[을를이가]?\s*넘(?:지\s*(?:않|말|못)|을\s*수\s*없|으면\s*안|어서는\s*안)/, 'lte'],
  [/^\s*(?:이상|부터|or more|or greater|or larger|or bigger|or longer|or higher|or over|or above|\+)/i, 'gte'],
  [/^\s*(?:초과|[을를이가]?\s*넘(?:으면|는|어|게|을|긴|기면)|보다\s*(?:크|커|많|높|길))/, 'gt'],
  [/^\s*(?:이하|이내|까지|안에|or less|or fewer|or smaller|or shorter|or lower|or under|or below)/i, 'lte'],
  [/^\s*(?:미만|보다\s*(?:작|적|낮|짧))/, 'lt'],
  [/^\s*(?:이|가)?\s*(?:지나|경과)|^\s*(?:뒤|후)(?![가-힣]*불)|^\s*(?:동안|마다)|^\s*(?:later|ago)\b/i, 'after'],
  [/^\s*(?:이면|면|일\s*때|인\s*경우)/, 'eq'],
];
/** 지켜야 하는 조건을 말하는 문장인가 (허용되는 쪽이 정해진다) */
const MUST = /(?:이어야|여야|해야|할 수 있|될 수 있|가능|must|should|shall|can\b|at least|at most|accepted|allowed|최대|최소|까지만?)/i;
const NEGATIVE = /(?:없다|없음|없어|불가|금지|안\s*된다|않는다|cannot|can't|can not|must not|may not|not allowed|rejected|denied|blocked|refused|declined|\bnot\s+(?:be\s+)?(?:accepted|allowed|permitted|possible|valid)\b|받지\s*않)/i;

const ABSORBED = new RegExp(`(?:not|never|cannot|can't|can not|must not|may not|shall not|should not|does not|doesn't|do not|don't|won't|will not)\\s+(?:be\\s+)?(?:exceed(?:ing)?|over|above|beyond|below|under|(?:${MORE}|${LESS})\\s+than)|넘지\\s*(?:않|말|못)[가-힣]*|넘을\\s*수\\s*없[가-힣]*|넘으면\\s*안[가-힣\\s]*|넘어서는\\s*안[가-힣\\s]*`, 'gi');

function readNumber(m: RegExpExecArray): number {
  return Number(m[1].replace(/,/g, '')) * (m[2] ? MAGNITUDE[m[2]] : 1);
}

function readUnit(text: string): { unit: UnitKind | null; unitText: string; rest: string; skip: number } {
  const trimmed = text.replace(/^\s+/, '');
  const skip = text.length - trimmed.length;
  for (const [re, kind] of UNITS) {
    const m = trimmed.match(re);
    if (m) return { unit: kind, unitText: m[0], rest: trimmed.slice(m[0].length), skip };
  }
  return { unit: null, unitText: '', rest: text, skip: 0 };
}

function finish(text: string, value: number, unit: UnitKind | null, unitText: string, rel: NumRelation, raw: string, soft = false): Constraint {
  const scales = (unit && SCALES[unit]) || [1];
  // 「must not exceed」 · 「넘을 수 없다」는 이미 「이하」로 읽었으므로 부정으로 다시 뒤집지 않는다
  const negative = NEGATIVE.test(text.replace(ABSORBED, ' '));
  let validSide: 'upper' | 'lower' | null = null;
  if (rel === 'gte' || rel === 'gt' || rel === 'lte' || rel === 'lt') {
    if (negative) validSide = rel === 'gte' || rel === 'gt' ? 'lower' : 'upper';
    else if (MUST.test(text)) validSide = rel === 'gte' || rel === 'gt' ? 'upper' : 'lower';
  }
  return { value, unit, unitText, rel, scales, validSide, raw, soft };
}

/** 뒤따르는 inclusive / exclusive 로 경계를 바로잡는다 */
function applyEdgeWord(rel: NumRelation, rest: string): NumRelation {
  if (/^[\s(,]*(?:exclusive|제외)/i.test(rest)) return rel === 'lte' ? 'lt' : rel === 'gte' ? 'gt' : rel;
  if (/^[\s(,]*(?:inclusive|포함)/i.test(rest)) return rel === 'lt' ? 'lte' : rel === 'gt' ? 'gte' : rel;
  return rel;
}

/** 기간 없이 「한 번만」이라고 하면 횟수 제한이 아니라 중복을 막으라는 뜻이다 (같은 이메일로는 한 번만 가입). 「하루에 한 번만」은 횟수다. */
const WINDOW = /(하루|매일|주|달|시간|분|초|일)\s*(?:에|마다|당)|\bper\s+(?:day|hour|minute|week|month)|\ba\s+(?:day|week|month)|\ban\s+hour/i;
function onlyOnce(text: string, m: RegExpMatchArray): boolean {
  return m[1] === '한' && /^\s*번만/.test(text.slice(m.index! + m[0].length)) && !WINDOW.test(text);
}

function makeConstraint(text: string, value: number, start: number, end: number): Constraint | null {
  const head = text.slice(Math.max(0, start - 30), start);
  const { unit, unitText, rest, skip } = readUnit(text.slice(end));
  let rel: NumRelation | null = null;
  // 「최대 3회」처럼 앞말이 있으면 그것을 먼저 쓰고, 없으면 뒷말을 본다.
  for (const [re, r] of BEFORE) if (re.test(head)) { rel = r; break; }
  if (!rel) for (const [re, r] of AFTER) if (re.test(rest)) { rel = r; break; }
  if (/\bafter\s*$/i.test(head)) rel = unit === 'cnt' ? 'count' : 'after';
  // 「6자리」 · 「6 digits」 · 「정확히 6」은 그 값과 같아야 한다
  if ((!rel || rel === 'value') && (/(?:정확히|exactly)\s*$/i.test(head) || /^\s*(?:자리|digits?\b)/i.test(text.slice(end)))) rel = 'eq';
  // 「시작 1시간 전까지」 · 「1 hour before」: 그만큼 앞서야 한다
  if (!rel && unit && /^\s*(?:전까지|전에|before\b|in advance\b|ahead\b)/i.test(rest)) rel = 'gte';
  // 「14 days after signup」: 그만큼 지난 뒤
  if ((!rel || rel === 'value') && unit && /^\s*after\b/i.test(rest)) rel = unit === 'cnt' ? 'count' : 'after';
  // 「1분에 5번」 · 「per 10 minutes」의 시간은 경계가 아니라 세는 창이다
  const window = !!unit && unit !== 'cnt' && unit !== 'qty' && (/^\s*(?:에|당)(?![가-힣])/.test(rest) || /\bper\s*$/i.test(head));
  // 「재고가 0이면」 · 「when the stock is 0」: 그 값일 때 조건이 걸려야 한다
  const trigger = !window && (!rel || rel === 'value' || rel === 'eq') && (/\b(?:when|if|once)\b[^.]*\b(?:is|are|has|have|contains|equals|reaches|hits|becomes)\s*$/i.test(head) || /^\s*(?:이면|일\s*때|이\s*되면|가\s*되면|이\s*될\s*때)/.test(rest));
  if (trigger) rel = 'eq';
  if (window) rel = 'value';
  if (!rel) {
    if (unit === 'cnt') rel = 'count';
    else if (unit) rel = 'value';
    else return null; // 단위도 관계도 없는 숫자(HTTP 400, 2단계 …)는 조건으로 보지 않는다
  }
  if (rel === 'after' && unit === 'cnt') rel = 'count';
  rel = applyEdgeWord(rel, rest);
  const c = finish(text, value, unit, unitText, rel, text.slice(start, end + skip + unitText.length).trim());
  if (window) c.window = true;
  if (trigger) c.trigger = true;
  return c;
}

const NUM_SRC = '(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)(?:\\s*(억|천만|백만|십만|만|천|백))?';
const RANGES: { re: RegExp; soft?: boolean }[] = [
  { re: new RegExp(`\\bbetween\\s+${NUM_SRC}\\s*[a-z%]*\\s+and\\s+${NUM_SRC}`, 'gi'), soft: true },
  { re: new RegExp(`\\bfrom\\s+${NUM_SRC}\\s*[a-z%]*\\s+(?:to|through)\\s+${NUM_SRC}`, 'gi') },
  { re: new RegExp(`\\b${NUM_SRC}\\s+(?:to|through)\\s+${NUM_SRC}`, 'gi') },
  { re: new RegExp(`${NUM_SRC}\\s*(?:~|〜|–|—)\\s*${NUM_SRC}`, 'g') },
  { re: new RegExp(`${NUM_SRC}[가-힣%]{0,3}\\s*(?:에서|부터)\\s*${NUM_SRC}`, 'g') },
];

/** 범위 표현(1~10개, between 1 and 10, 1부터 10까지)을 두 조건으로 읽는다. 읽은 자리는 돌려준다. */
function parseRanges(text: string): { found: Constraint[]; spans: [number, number][] } {
  const found: Constraint[] = [];
  const spans: [number, number][] = [];
  for (const { re, soft } of RANGES) {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (spans.some(([a, b]) => start < b && end > a)) continue;
      const lo = Number(m[1].replace(/,/g, '')) * (m[2] ? MAGNITUDE[m[2]] : 1);
      const hi = Number(m[3].replace(/,/g, '')) * (m[4] ? MAGNITUDE[m[4]] : 1);
      if (!(hi > lo)) continue;
      const { unit, unitText, rest } = readUnit(text.slice(end));
      const edge = /^[\s(,]*(?:inclusive|포함)/i.test(rest);
      const exclusive = /^[\s(,]*(?:exclusive|제외)/i.test(rest);
      const raw = text.slice(start, end).trim();
      found.push(finish(text, lo, unit, unitText, exclusive ? 'gt' : 'gte', raw, !!soft && !edge && !exclusive));
      found.push(finish(text, hi, unit, unitText, exclusive ? 'lt' : 'lte', raw, !!soft && !edge && !exclusive));
      spans.push([start, end]);
    }
  }
  return { found, spans };
}

/** 숫자 없이 말로 쓴 경계: 양수 → 0 초과, 음수가 아님 → 0 이상 */
function wordBoundaries(text: string): Constraint[] {
  const out: Constraint[] = [];
  if (/\bnon[-\s]?negative\b|\bzero or more\b|음수가\s*아니|음수\s*불가/i.test(text)) {
    out.push(finish(text, 0, null, '', 'gte', 'non-negative'));
  } else if (/\b(?:any|must be|should be|be|is|are|only)\s+(?:a\s+)?positive\b|\bpositive\s+(?:count|number|integer|value|amount|quantity|size)\b|양수/i.test(text) && !/\bnon[-\s]?positive\b/i.test(text)) {
    out.push(finish(text, 0, null, '', 'gt', 'positive'));
  }
  return out;
}

/** 요구사항 문장에서 숫자 조건을 뽑는다. */
export function parseConstraints(text: string): Constraint[] {
  const out: Constraint[] = [];
  const add = (c: Constraint | null) => {
    if (c && !out.some((x) => x.value === c.value && x.unit === c.unit && x.rel === c.rel)) out.push(c);
  };
  const { found, spans } = parseRanges(text);
  found.forEach(add);
  const inRange = (i: number) => spans.some(([a, b]) => i >= a && i < b);
  for (const m of text.matchAll(NUM)) {
    // R2 · v2 · 3D 처럼 낱말에 붙은 숫자는 건너뛴다
    if (/[A-Za-z]$/.test(text.slice(0, m.index)) || inRange(m.index!)) continue;
    add(makeConstraint(text, readNumber(m as RegExpExecArray), m.index!, m.index! + m[0].length));
  }
  for (const m of text.matchAll(NATIVE_RE)) if (!onlyOnce(text, m)) add(makeConstraint(text, NATIVE[m[1]], m.index!, m.index! + m[0].length));
  for (const m of text.matchAll(WORD_RE)) add(makeConstraint(text, WORDS[m[1].toLowerCase()], m.index!, m.index! + m[0].length));
  wordBoundaries(text).forEach(add);
  return onceEvery(text, out);
}

const GAP_UNIT = new Set<UnitKind>(['sec', 'min', 'hour', 'day', 'week', 'month']);
/**
 * 「닉네임은 30일에 한 번만 바꿀 수 있다」 · 「once every 30 days」는 「1번 · 30일 창」이 아니라
 * 「지난번부터 30일이 지나야 다시 할 수 있다」는 뜻이다. 횟수 1 을 빼고 시간을 그만큼 지나야 하는 경계로 바꾼다.
 */
function onceEvery(text: string, out: Constraint[]): Constraint[] {
  const ko = /(\d+)\s*(?:일|시간|분|주|개월|달)\s*(?:에|마다)\s*한\s*번/.exec(text);
  const en = /\bonce\s+(?:every|per|in|each)\s+(\d+)\s+(?:days?|hours?|minutes?|weeks?|months?)\b/i.exec(text);
  const m = ko ?? en;
  if (!m) return out;
  const value = Number(m[1]);
  const i = out.findIndex((c) => c.value === value && !!c.unit && GAP_UNIT.has(c.unit));
  if (i < 0) return out;
  const old = out[i];
  const gap: Constraint = { ...finish(text, value, old.unit, old.unitText, 'gte', old.raw), validSide: 'upper' };
  return out.flatMap((c, j) => (j === i ? [gap] : c.unit === 'cnt' && c.value === 1 ? [] : [c]));
}

/** 문장에 나온 숫자들 (쉼표 · 「만」을 풀어서). 단위가 없어도 낸다. */
export function numbersIn(text: string): number[] {
  const out = [...text.matchAll(NUM)].filter((m) => !/[A-Za-z]$/.test(text.slice(0, m.index))).map((m) => readNumber(m as RegExpExecArray));
  for (const m of text.matchAll(NATIVE_RE)) if (!onlyOnce(text, m)) out.push(NATIVE[m[1]]);
  for (const m of text.matchAll(WORD_RE)) out.push(WORDS[m[1].toLowerCase()]);
  return [...new Set(out)];
}

// ---------------------------------------------------------------- 맞는지 보기
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** 코드의 숫자가 요구사항의 값과 같은 단위 환산인가. 맞으면 배율, 없으면 null */
export function matchScale(c: Constraint, lit: number): number | null {
  for (const k of c.scales) {
    const v = c.value * k;
    // 하나 차이 허용은 정수 경계(>= 6 과 「5 초과」)에만 쓴다. 0.01 과 「1%」의 1 처럼 소수를 1 과 견주면 0.02 도 맞다고 하게 된다
    if (near(lit, v) || (Number.isInteger(v) && Number.isInteger(lit) && Math.abs(lit - v) <= 1)) return k;
  }
  return null;
}

/** 표시용: 가장 가까운 환산 */
function closestScale(c: Constraint, lit: number): number {
  if (!lit || !c.value) return 1;
  let best = 1;
  let gap = Infinity;
  for (const k of c.scales) {
    const g = Math.abs(Math.log(Math.abs(lit) / (c.value * k)));
    if (g < gap) [gap, best] = [g, k];
  }
  return best;
}

/** 시간 단위 하나가 몇 초인가 */
const SEC_PER: Partial<Record<UnitKind, number>> = { sec: 1, min: 60, hour: 3600, day: 86400, week: 604800, month: 2592000 };
/** 「로 · 으로」: 받침이 있으면(ㄹ 빼고) 「으로」. 숫자는 읽는 소리로 본다 (15분으로, 1일로, 3분으로) */
function ro(word: string): string {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  if (/[0-9]/.test(ch)) return '036'.includes(ch) ? '으로' : '로';
  return '로';
}

const round = (n: number) => String(Math.round(n * 1e6) / 1e6);
const withUnit = (n: number | string, c: Constraint) => {
  const u = c.unitText;
  return /^[A-Za-z]/.test(u) ? `${n} ${u}` : `${n}${u}`;
};

export function constraintText(c: Constraint): Text {
  const v = withUnit(round(c.value), c);
  switch (c.rel) {
    case 'gte': return T(`${v} 이상`, `at least ${v}`);
    case 'gt': return T(`${v} 초과`, `more than ${v}`);
    case 'lte': return T(`${v} 이하`, `at most ${v}`);
    case 'lt': return T(`${v} 미만`, `under ${v}`);
    case 'after': return T(`${v} 뒤`, `after ${v}`);
    default: return T(v, v);
  }
}

const isCountable = (c: Constraint) => c.unit === 'cnt' || c.unit === 'qty' || c.unit === null;
const isCapacity = (c: Constraint) => c.rel === 'lte' || c.rel === 'lt';

function base(c: Constraint, p: NumPart | null): Boundary {
  return { required: c.value, attempts: null, ok: null, before: p?.incBefore ?? null, kind: 'value', want: constraintText(c), line: p?.line };
}

/** 이 숫자 조건을 뒷받침할 비교를 코드에서 찾지 못했을 때 */
export function missingBoundary(c: Constraint): Boundary {
  const t = constraintText(c);
  return { ...base(c, null), why: 'missing', say: T(`요구사항의 숫자(${t.ko})를 코드에서 찾지 못함`, `could not find the number in the code (${t.en})`) };
}

/** 반복문이 몇 번 도는가. 반복문이 아니거나 모르면 null */
export function loopCount(p: NumPart): number | null {
  if (p.source !== 'loop' || p.loopStart === undefined || p.lit === undefined) return null;
  const s = p.loopStart;
  return p.op === '<' ? p.lit - s : p.op === '<=' ? p.lit - s + 1 : p.op === '>' ? s - p.lit : p.op === '>=' ? s - p.lit + 1 : null;
}
/** 요구사항의 값과 견줄 코드의 값: 반복문은 도는 횟수, 나머지는 숫자 */
export const partValue = (p: NumPart): number | undefined => loopCount(p) ?? p.lit;

/** 코드의 비교 하나가 요구사항의 숫자 조건과 맞는지 판정한다. */
export function judge(c: Constraint, p: NumPart): Boundary {
  const b = base(c, p);
  const v = c.value;
  if (p.lit === undefined) {
    return { ...b, why: 'unresolved', say: T(`코드의 값을 읽지 못함 (${p.ref ?? p.expr})`, `could not read the value in the code (${p.ref ?? p.expr})`) };
  }
  const lit = p.lit;
  const stopAt = p.op === '>' || p.op === '<=' ? lit + 1 : lit;
  const limitWanted = c.rel === 'lt' ? v - 1 : v;
  const limitResult = (total: number): Boundary => ({
    ...b,
    kind: 'limit',
    ok: total === limitWanted,
    got: total,
    say: T(`최대 ${withUnit(total, c)} 동작`, `runs at most ${withUnit(total, c)}`),
  });

  // 반복문: 몇 번 도는지 바로 계산한다
  if (isCountable(c)) {
    const n = loopCount(p);
    if (n !== null) return limitResult(n);
  }

  // 같은 변수를 1씩 올리는 코드가 있으면 「몇 번째에 동작하는가」로 본다
  if (p.incBefore !== null && p.source !== 'schema' && p.source !== 'cap' && isCountable(c) && c.rel !== 'eq' && c.rel !== 'value') {
    if (isCapacity(c)) {
      // 먼저 세고(count++) 넘으면 throw 로 거부하면, 거부된 그 번은 허용된 횟수가 아니다 (뒤에 다른 호출이 없어도)
      const rejectsThisOne = p.thenKind === 'reject' && !p.inCatch;
      const total = !p.incBefore || p.inCatch || (!p.actionAfter && !rejectsThisOne) ? stopAt : stopAt - 1;
      return limitResult(total);
    }
    if (p.op !== '!==') {
      const attempts = stopAt + (p.incBefore ? 0 : 1);
      const target = c.rel === 'gt' ? v + 1 : v;
      return { ...b, kind: 'attempt', firstTrue: stopAt, attempts, ok: attempts === target };
    }
  }
  // 횟수를 세는 요구사항인데 올리는 코드가 안 보이면 몇 번째인지 알 수 없다
  if (c.rel === 'count') {
    return { ...b, kind: 'attempt', firstTrue: stopAt, why: 'path', say: T('횟수를 올리는 코드를 찾지 못해 몇 번째에 동작하는지 확정 못함', 'the code that increments the counter was not found, so the attempt is undetermined') };
  }

  const k = matchScale(c, lit);
  // '1h' · '7d' 처럼 글로 쓴 기간은 초로 읽었으므로, 값이 다를 때도 초 단위로 환산해 보여 준다 (3600 을 「2.5일」로 보이지 않게)
  const secScale = p.secs && c.unit ? SEC_PER[c.unit] : undefined;
  // 「1%」인데 코드가 0.5 처럼 1 보다 작은 비율이면 소수로 쓴 비율(50%)이다
  const pctScale = c.unit === 'pct' && c.value >= 1 && Math.abs(lit) < 1 && c.scales.includes(0.01) ? 0.01 : undefined;
  const shown = k ?? secScale ?? pctScale ?? closestScale(c, lit);
  const n = round(lit / shown);
  // 설정값(windowMs: 60000, expiresIn: '1h', setTimeout(fn, 5000)): 값이 같은지만 본다
  if (p.source === 'config') {
    const what = withUnit(n, c);
    const set = T(`${what}${ro(what)} 설정됨`, `set to ${what}`);
    return { ...b, ok: k !== null, say: set };
  }
  const upperStyle = c.rel === 'gte' || c.rel === 'gt' || c.rel === 'after';
  const closedAtLit = p.op === '>=' || p.op === '<';
  let say = upperStyle
    ? closedAtLit ? T(`${withUnit(n, c)}부터 해당`, `applies from ${withUnit(n, c)}`) : T(`${withUnit(n, c)} 초과부터 해당`, `applies above ${withUnit(n, c)}`)
    : closedAtLit ? T(`${withUnit(n, c)} 미만까지 해당`, `applies below ${withUnit(n, c)}`) : T(`${withUnit(n, c)}까지 해당`, `applies up to ${withUnit(n, c)}`);
  if (p.op === '===' || p.op === '!==') say = T(`${withUnit(n, c)}일 때 해당`, `applies at ${withUnit(n, c)}`);

  // 「1분에 5번」의 1분: 경계가 아니라 세는 시간 창이다. 같은 길이의 창이 코드에 있으면 된다.
  if (c.window) {
    const win = T(`${withUnit(n, c)} 창`, `${withUnit(n, c)} window`);
    return k !== null ? { ...b, ok: true, say: win } : { ...b, why: 'missing', say: T(`요구사항의 시간 창(${withUnit(round(v), c)})을 코드에서 찾지 못함`, `could not find the ${withUnit(round(v), c)} window in the code`) };
  }
  // 「재고가 0이면 막는다」: 그 값일 때 조건이 걸려야 한다. stock < 0 은 0 을 막지 못한다.
  if (c.trigger) {
    const val = k ?? 1;
    const at = v * val;
    const hits = p.op === '<=' ? at <= lit : p.op === '<' ? at < lit : p.op === '>=' ? at >= lit : p.op === '>' ? at > lit : p.op === '===' ? at === lit : at !== lit;
    return hits
      ? { ...b, ok: true, say: T(`${withUnit(round(v), c)}일 때 해당`, `applies at ${withUnit(round(v), c)}`) }
      : { ...b, ok: false, say: T(`${withUnit(round(v), c)}일 때는 해당하지 않음`, `does not apply at ${withUnit(round(v), c)}`) };
  }
  // 여기까지 온 값은 요구사항과 같은 것을 재는 이름이다(엔진이 먼저 거른다). 값이 다르면 다른 것이다.
  if (c.rel === 'value') {
    const shownValue = T(`코드의 값 ${withUnit(n, c)}`, `${withUnit(n, c)} in the code`);
    if (k === null) return { ...b, ok: false, say: shownValue };
    if (p.source !== 'compare') return { ...b, ok: true, say: shownValue };
    // 값은 같아도 요구사항에 방향(이상 · 이하)이 없으면 >= 와 > 중 무엇이 맞는지 말할 수 없다
    return { ...b, why: 'wording', say: T(`${say.ko}. 요구사항에 「이상 · 이하」 같은 방향이 없어 경계를 확정할 수 없음`, `${say.en}. The requirement does not say which side of ${withUnit(round(v), c)} is meant`) };
  }
  if (c.rel === 'eq') {
    if (p.op === '===' || p.op === '!==') return lit === v ? { ...b, ok: true, say } : { ...b, ok: false, say };
    const cut = closedAtLit ? lit : lit + 1;
    if (cut === v + 1) return { ...b, ok: true, say };
    return Math.abs(lit - v) <= 1 ? { ...b, ok: false, say } : { ...b, why: 'missing', say };
  }
  // 넣기 전에 room.length === 10 을 막으면 10개에서 멈춘다: >= 10 과 같다
  if (p.op === '===' && p.preAdd && isCapacity(c)) {
    const total = lit;
    const allowed = c.rel === 'lt' ? v - 1 : v;
    return { ...b, ok: total === allowed, say: T(`최대 ${withUnit(total, c)}까지 들어감`, `allows up to ${withUnit(total, c)}`) };
  }
  // 「0 초과면 받는다」인데 === 1 만 받으면 범위를 좁힌 것이다
  if (p.op === '===' && (c.rel === 'gt' || c.rel === 'gte') && p.thenKind !== 'reject') return { ...b, ok: false, say: T(`${withUnit(n, c)}일 때만 해당`, `applies only at ${withUnit(n, c)}`) };
  if (p.op === '===' || p.op === '!==') return { ...b, why: 'missing', say };

  // 단위를 바꾼 값(분 → ms 등)은 연속된 값이라 경계 하나 차이는 따지지 않는다
  const scaled = k !== null && k !== 1;
  const timeUnit = c.unit === 'sec' || c.unit === 'min' || c.unit === 'hour' || c.unit === 'day' || c.unit === 'week';
  if (scaled && (timeUnit || c.rel === 'after')) return { ...b, ok: true, say };
  // 바이트 · 비율은 환산해도 경계가 그대로 뜻을 가진다: 8MB 를 포함하는지는 > 와 >= 로 갈린다
  if (scaled) {
    const base = v * k!;
    const wantClosed = c.rel === 'gte' || c.rel === 'lt';
    const same = near(lit, base) ? closedAtLit === wantClosed : (closedAtLit ? lit : lit + 1) === (wantClosed ? base : base + 1);
    return { ...b, ok: same, say };
  }

  const cut = closedAtLit ? lit : lit + 1;
  if (c.rel === 'after') {
    if (cut === v || cut === v + 1) {
      const exact = withUnit(round(v), c);
      return { ...b, why: 'edge', say: T(`${say.ko}. 요구사항 문장만으로는 정확히 ${exact}째가 포함되는지 정해지지 않음`, `${say.en}. The requirement does not say whether exactly ${exact} counts`) };
    }
    return { ...b, ok: false, say };
  }
  let wanted = c.rel === 'gte' || c.rel === 'lt' ? v : v + 1;
  if (p.preAdd && isCapacity(c)) {
    wanted -= 1;
    say = T(`최대 ${withUnit(cut, c)}까지 들어감`, `allows up to ${withUnit(cut, c)}`);
    if (c.rel === 'lt') say = T(`${withUnit(cut, c)}까지 들어감`, `allows up to ${withUnit(cut, c)}`);
  }
  // 「3번까지」인데 입력 변수만 보이면(entryCount >= 3) 그 값에 이번 것이 포함됐는지 알 수 없어 경계 하나 차이는 정할 수 없다.
  // 목록의 길이(.length)는 지금 개수가 분명하므로 그대로 판정한다.
  if (isCapacity(c) && (c.unit === 'cnt' || c.unit === 'qty') && p.source === 'compare' && !p.preAdd && /count|hits|used|entries|requests|sent/i.test(p.left) && !/\.(?:length|size)$/.test(p.left) && (cut === wanted || cut === wanted - 1)) {
    return { ...b, why: 'path', say: T(`${say.ko}. 이 값에 이번 요청이 포함되는지 코드만으로 정해지지 않음`, `${say.en}. The code does not show whether this count includes the current one`) };
  }
  if (p.thenKind === 'reject' && c.validSide) {
    const trueSide = p.op === '>' || p.op === '>=' ? 'upper' : 'lower';
    if (trueSide === c.validSide) return { ...b, ok: false, why: 'inverted', say: T(`${say.ko}: 허용해야 할 쪽을 막고 있음`, `${say.en}: it rejects the side that should be allowed`) };
  }
  // between 1 and 10 은 끝값 포함 여부가 문장에 없다
  if (c.soft && Math.abs(cut - wanted) === 1) return { ...b, why: 'edge', say: T(`${say.ko}. 「${c.raw}」의 끝값 포함 여부가 문장에 없음`, `${say.en}. "${c.raw}" does not say whether the end value counts`) };
  return { ...b, ok: cut === wanted, say };
}

// ---------------------------------------------------------------- 보여 줄 글
/** 긴 설명: 줄 끝 · 요약에 쓴다 */
export function boundaryLine(b: Boundary | undefined, lang = getLang()): string {
  if (!b) return '';
  const ko = lang === 'ko';
  if (b.kind === 'attempt' && b.attempts !== null) {
    return ko ? `${b.attempts}번째 시도에 동작${b.ok === false ? ` (요구사항 ${b.required}회)` : ''}` : `acts on attempt ${b.attempts}${b.ok === false ? ` (requirement: ${b.required})` : ''}`;
  }
  const say = pick(b.say, lang);
  if (b.ok !== false) return say;
  return ko ? `${say} (요구사항: ${pick(b.want, lang)})` : `${say} (requirement: ${pick(b.want, lang)})`;
}

/** 짧은 설명: 좁은 목록에 쓴다 */
export function boundaryShort(b: Boundary | undefined, lang = getLang()): string {
  if (!b) return '';
  const ko = lang === 'ko';
  if (b.kind === 'attempt' && b.attempts !== null) return ko ? `${b.attempts}번째 동작` : `attempt ${b.attempts}`;
  if (b.ok === null) return undecidedLabel(b.why && b.why !== 'inverted' ? b.why : 'missing', lang);
  return pick(b.say, lang);
}

/**
 * 「미확인」의 종류. 쓰는 사람이 왜 판단하지 못했는지와 무엇을 하면 되는지 바로 보이게 한다.
 * 숫자 조건에서 나오는 것(wording ~ conflict)과 요구사항 전체에서 나오는 것(no-evidence ~ stale)이 있다.
 */
export type UndecidedKind = 'wording' | 'edge' | 'path' | 'unresolved' | 'missing' | 'conflict' | 'no-check' | 'no-evidence' | 'extra-condition' | 'no-test' | 'stale';
const UNDECIDED: Record<UndecidedKind, { label: Text; action: Text }> = {
  wording: {
    label: { ko: '문장에 방향 없음', en: 'wording has no direction' },
    action: { ko: '요구사항에 「이상 · 이하 · 초과 · 미만」 가운데 하나를 적는다.', en: 'Say “at least”, “at most”, “over” or “under” in the requirement.' },
  },
  edge: {
    label: { ko: '끝값 포함 여부 애매', en: 'edge value unclear' },
    action: { ko: '끝값이 포함되는지 요구사항에 적는다 (예: 「7일째부터」, 「8MB 포함」).', en: 'Say in the requirement whether the edge value counts (for example “from day 7”, “8 MB included”).' },
  },
  path: {
    label: { ko: '실행 순서 확인 못함', en: 'execution order not visible' },
    action: { ko: '세는 코드와 비교가 어떤 순서로 도는지 확인하고, 경계 값을 직접 넣는 테스트를 더한다.', en: 'Check the order in which the counting code and the comparison run, and add a test that hits the edge value.' },
  },
  unresolved: {
    label: { ko: '값을 읽지 못함', en: 'value not readable' },
    action: { ko: '값이 환경 변수나 설정에서 오면 기본값을 코드에 두거나, 그 값을 확인하는 테스트를 더한다.', en: 'If the value comes from an environment variable or settings, keep a default in the code or add a test for it.' },
  },
  missing: {
    label: { ko: '코드에 숫자 없음', en: 'number not found' },
    action: { ko: '구현이 있는지 확인한다. 있으면 「| keywords: 코드에 나오는 영어 단어」를 요구사항에 붙인다.', en: 'Check that it is implemented. If it is, add “| keywords: words in the code” to the requirement.' },
  },
  conflict: {
    label: { ko: '다른 값이 함께 있음', en: 'conflicting values' },
    action: { ko: '같은 대상에 다른 값이 있다. 어느 값이 실제로 쓰이는지 확인하고 하나로 맞춘다.', en: 'The same thing has another value elsewhere. Check which one is used and make them agree.' },
  },
  'no-check': {
    label: { ko: '확인하는 조건 못 찾음', en: 'no deciding check' },
    action: {
      ko: '요구사항을 확인하거나 막는 if 문이 있는지 본다. 지금은 함수 이름에 낱말만 겹쳤다. 있으면 「| keywords: 코드에 나오는 영어 단어」를 붙인다.',
      en: 'Check that an if statement enforces the requirement. Only the function name matched. If there is one, add “| keywords: words in the code”.',
    },
  },
  'no-evidence': {
    label: { ko: '근거 없음', en: 'no evidence' },
    action: { ko: '구현이 있는지 확인한다. 있으면 「| keywords: 코드에 나오는 영어 단어」를 요구사항에 붙인다.', en: 'Check that it is implemented. If it is, add “| keywords: words in the code” to the requirement.' },
  },
  'extra-condition': {
    label: { ko: '조건이 더 있음', en: 'extra condition' },
    action: { ko: '함께 걸린 조건이 거짓일 때도 요구사항이 지켜지는지 확인한다.', en: 'Check that the requirement still holds when the attached condition is false.' },
  },
  'no-test': {
    label: { ko: '검사 없음', en: 'no test' },
    action: { ko: '이 요구사항을 확인하는 테스트를 돌린다. 테스트 이름에 요구사항의 낱말과 숫자를 넣으면 이어진다.', en: 'Run a test for this requirement. A test name with the requirement’s words and number gets linked.' },
  },
  stale: {
    label: { ko: '검사 오래됨', en: 'tests out of date' },
    action: { ko: '코드를 바꾼 뒤 테스트를 다시 돌린다.', en: 'Run the tests again after the code change.' },
  },
};
export const undecidedLabel = (k: UndecidedKind, lang = getLang()) => pick(UNDECIDED[k].label, lang);
export const undecidedAction = (k: UndecidedKind, lang = getLang()) => pick(UNDECIDED[k].action, lang);

/** 검사가 무엇을 확인해야 하는지 말할 때 쓰는 낱말 */
export function checkWord(b: Boundary | undefined, lang = getLang()): string {
  const counted = !b || b.kind === 'attempt' || b.kind === 'limit';
  return lang === 'ko' ? (counted ? '횟수' : '값') : counted ? 'count' : 'value';
}

/** 문제 목록의 주의 글 */
export function boundaryNote(b: Boundary, label: string, lang = getLang()): string {
  const ko = lang === 'ko';
  if (b.kind === 'attempt' && b.ok === false) return ko ? `${label}: 요구사항 ${b.required}회, 코드는 ${b.attempts}회째에 동작` : `${label}: the requirement says ${b.required}, the code acts on attempt ${b.attempts}`;
  return `${label}: ${boundaryLine(b, lang)}`;
}

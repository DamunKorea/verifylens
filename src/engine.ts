import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Boundary, Constraint, Evidence, NumPart, Overall, Relation, ReqResult, ReqSummary, Report, Requirement, ResultSet, SchemaField, TestCase, TestStatus, Unit, UnitKind } from './types.ts';
import { analyzeFile, resolveRefs } from './analyze.ts';
import { boundaryNote, calendarBoundary, judge, matchScale, missingBoundary, partValue, pick } from './numeric.ts';
import { changedFiles, changedLines, mergeBase, shortSha, showFile, trackedFiles, uncommittedFiles, worktreeChangedFiles, worktreeChangedLines } from './git.ts';
import { parseTestReport } from './tests.ts';
import { tokenize, stem } from './tokens.ts';
import { conceptsFor, normalizePhrases } from './glossary.ts';
import { L, setLabel } from './i18n.ts';

const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
const TEST_FILE = /(\.test\.|\.spec\.|__tests__\/|\/tests?\/)/;

/**
 * 한 결과(브랜치)를 분석한다.
 * worktree 가 true 면 ref 의 커밋이 아니라 지금 작업 폴더를 본다: 커밋한 것 + 커밋 전 수정 + 새 파일.
 * AI 가 방금 고친, 아직 커밋하지 않은 코드를 확인하려면 이쪽이어야 한다.
 */
export function analyzeResult(opts: { key: 'A' | 'B'; repo: string; base: string; ref: string; junit?: string; worktree?: boolean }): ResultSet {
  const { key, repo, base, ref } = opts;
  const from = opts.worktree ? mergeBase(repo, base) : '';
  const lines = opts.worktree ? worktreeChangedLines(repo, from) : changedLines(repo, base, ref);
  const read = (f: string) => {
    if (!opts.worktree) return showFile(repo, ref, f);
    const p = join(repo, f);
    return existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
  };
  const files: Record<string, string> = {};
  const analyses = [];
  for (const f of opts.worktree ? worktreeChangedFiles(repo, from) : changedFiles(repo, base, ref)) {
    if (!CODE_EXT.test(f)) continue;
    const text = read(f);
    if (text === null) continue;
    files[f] = text;
    if (TEST_FILE.test(f)) continue;
    analyses.push(analyzeFile(f, text, lines.get(f) ?? null));
  }
  // 다른 파일의 상수를 푼다. 바뀌지 않은 파일은 같은 시점의 내용을 읽는다.
  let allFiles: string[] = [];
  try {
    allFiles = trackedFiles(repo, opts.worktree ? 'HEAD' : ref);
  } catch {
    /* 파일 목록을 못 읽으면 상대 경로만 따라간다 */
  }
  resolveRefs(
    analyses,
    (f) => {
      try {
        return read(f);
      } catch {
        return null;
      }
    },
    allFiles,
  );
  const tests: TestCase[] = opts.junit ? parseTestReport(readFileSync(opts.junit, 'utf8')) : [];
  // 커밋 전 변경이 있으면 그 내용의 지문을 남긴다 (같은 커밋이어도 내용이 다르면 다른 결과다).
  let wip: string | undefined;
  if (opts.worktree) {
    const dirty = uncommittedFiles(repo).filter((f) => CODE_EXT.test(f)).sort();
    if (dirty.length) {
      const h = createHash('sha1');
      for (const f of dirty) h.update(f).update('\0').update(read(f) ?? '').update('\0');
      wip = h.digest('hex').slice(0, 7);
    }
  }
  return {
    key,
    label: setLabel(key),
    ref,
    sha: shortSha(repo, opts.worktree ? 'HEAD' : ref),
    wip,
    files,
    analyses,
    units: analyses.flatMap((a) => a.units),
    dyn: analyses.flatMap((a) => a.dyn),
    tests,
    perReq: {},
  };
}

/** 파일 내용만으로 결과 하나를 만든다 (git 없이). 시험과 사례 묶음에서 쓴다. */
export function analyzeFiles(o: { key: 'A' | 'B'; ref: string; sha: string; files: Record<string, string>; tests?: TestCase[] }): ResultSet {
  const analyses = Object.entries(o.files)
    .filter(([f]) => CODE_EXT.test(f) && !TEST_FILE.test(f))
    .map(([f, text]) => analyzeFile(f, text, null));
  resolveRefs(analyses, (f) => o.files[f] ?? null, Object.keys(o.files));
  return { key: o.key, label: setLabel(o.key), ref: o.ref, sha: o.sha, files: o.files, analyses, units: analyses.flatMap((a) => a.units), dyn: analyses.flatMap((a) => a.dyn), tests: o.tests ?? [], perReq: {} };
}

/** 숫자가 요구사항의 값과 같은가 (단위 환산 포함) */
const litMatches = (req: Requirement, lit: number | undefined) => lit !== undefined && (req.numbers.some((n) => Math.abs(n - lit) <= 1) || req.constraints.some((c) => matchScale(c, lit) !== null));
const leftHits = (req: Requirement, left: string) => {
  const set = new Set(req.tokens);
  return new Set(tokenize(left).filter((t) => set.has(t))).size;
};

/** 「하루에 3번」 · 「20개까지」는 횟수 · 개수다: 문자열의 길이(pw.length)와 견주지 않는다. 「30자까지」는 글자 수다: 목록의 길이(items.length)와 견주지 않는다. */
const COUNTED: (UnitKind | null)[] = ['cnt', 'qty'];
/** 목록의 개수(thisMonth.length · 넣기 전에 센 값)는 기간(「한 달에」의 1달)이 아니다 */
const COUNT_LEFT = /\.(?:length|size)\b/;
const PERIOD_UNITS: (UnitKind | null)[] = ['sec', 'min', 'hour', 'day', 'week', 'month'];
const fitsUnit = (c: Constraint, p: NumPart) =>
  !(p.strLen && COUNTED.includes(c.unit)) && !(p.listLen && c.unit === 'char') && !((p.listLen || p.preAdd || COUNT_LEFT.test(p.left)) && PERIOD_UNITS.includes(c.unit));
/** 요구사항의 숫자 조건 어느 것과도 단위가 맞지 않는 길이 비교(글자 수 ↔ 횟수 · 개수)는 숫자 근거로 치지 않는다 */
const numberPart = (req: Requirement, p: NumPart) => (!p.strLen && !p.listLen) || !req.constraints.length || req.constraints.some((c) => fitsUnit(c, p));

function scoreUnit(req: Requirement, u: Unit): { score: number; why: string[]; num: boolean } {
  const why: string[] = [];
  let num = false;
  const set = new Set(req.tokens);
  const shared = [...new Set(u.tokens.filter((t) => set.has(t)))];
  // 자동 연결(키워드 없음)은 같은 뜻의 낱말을 한 개념으로 센다. 한 개념의 동의어가 여러 번 겹쳐도 한 번이다.
  const hits = req.auto ? req.concepts.filter((c) => c.some((t) => u.tokens.includes(t))).length : shared.length;
  let s = u.kind === 'function' ? Math.min(hits, 1.5) : hits;
  if (shared.length) why.push(L(`겹치는 단어: ${shared.join(', ')}`, `shared words: ${shared.join(', ')}`));
  const parts = (u.cond?.parts ?? []).filter((p) => numberPart(req, p));
  const exact = parts.find((p) => litMatches(req, p.lit));
  const counted = req.numbers.length ? parts.find((p) => p.lit !== undefined && leftHits(req, p.left) > 0) : undefined;
  if (exact) {
    s += 2;
    num = true;
    why.push(L(`숫자 ${exact.lit} (요구사항 ${req.numbers.join('·')})`, `number ${exact.lit} (requirement: ${req.numbers.join(', ')})`));
  } else if (counted) {
    s += 2;
    num = true;
    why.push(L(`숫자 조건 ${counted.left} ↔ ${counted.lit} (요구사항 ${req.numbers.join('·')})`, `numeric condition ${counted.left} ↔ ${counted.lit} (requirement: ${req.numbers.join(', ')})`));
  }
  // 막거나 확인해야 하는 요구사항(「소유자만 지울 수 있다」 포함)은 throw/return 이 붙은 조건을 근거로 먼저 본다
  if (u.guard && (req.guardCue || (req.needsCheck && hits > 0))) {
    s += 1;
    why.push(L('거부 문장 ↔ 조건 뒤 throw/return', 'rejection wording ↔ throw/return after the condition'));
  }
  if (u.changed) s += 0.5;
  return { score: s, why, num };
}

/** 점수가 같을 때: 함수보다 조건, 숫자가 맞는 조건, 더 좁은 범위(안쪽 조건)를 고른다. */
function moreSpecific(u: Unit, num: boolean, best: { u: Unit; num: boolean }): boolean {
  if (u.kind !== best.u.kind) return u.kind === 'condition';
  if (num !== best.num) return num;
  return u.endLine - u.startLine < best.u.endLine - best.u.startLine;
}

/** 값이 달라도 「같은 것을 세는 조건」이라고 볼 수 있는 이름인가. 아니면 다른 조건을 잘못 짚어 「다름」이라고 하게 된다. */
const SAME_THING: Partial<Record<UnitKind, RegExp>> = {
  money: /total|price|amount|fee|cost|sum|subtotal|balance|pay|coupon|voucher|discount|credit/i,
  age: /age/i,
  char: /length|len\b|size|chars?/i,
  day: /day|date|expir|age|ttl|elapsed|since/i,
  week: /week|day|date|expir|age|ttl|elapsed/i,
  month: /month|date|expir|age/i,
  hour: /hour|ms$|sec|time|ttl|age|idle|elapsed|expir|duration/i,
  min: /min|ms$|sec|time|ttl|age|idle|elapsed|expir|duration/i,
  sec: /sec|ms$|time|ttl|age|idle|elapsed|expir|duration/i,
  pct: /rate|percent|ratio|discount|pct/i,
  cnt: /count|attempt|fail|retr|tries|times|limit|max|request|hits|length|size/i,
  qty: /length|size|count|qty|quantity|limit|max|num|total|items?|stock/i,
};
const sameThing = (c: Constraint, p: NumPart) => (p.source !== 'compare' && p.source !== 'config') || !c.unit || !SAME_THING[c.unit] || SAME_THING[c.unit]!.test(p.left);
/** 같은 값이 여러 곳에 있으면 실제로 판단하는 비교를 먼저 본다: 비교 > 스키마 > 설정값 */
const SOURCE_RANK: Record<NumPart['source'], number> = { compare: 200, loop: 200, schema: 100, cap: 100, config: 0 };

type Found = { u: Unit; p: NumPart; score: number };

/** 어느 코드에나 나오는 말. 이 낱말만 겹쳐서는 같은 대상을 말한다고 볼 수 없다 (part.length 와 「비밀번호 길이」). */
const GENERIC = new Set(['length', 'len', 'size', 'count', 'max', 'min', 'limit', 'value', 'number', 'num', 'id', 'item', 'data', 'rate', 'ratio', 'percent'].map(stem));
/** 무엇의 양인지는 말하지 않는 낱말 (배송비 · 반품비의 「비」). 설정값 이름에는 이것 말고 대상 낱말이 있어야 한다. */
const MEASURE = new Set(['fee', 'price', 'cost', 'amount', 'total', 'sum', 'charge', 'tax'].map(stem));
/** 영어 요구사항의 관계 낱말 (once per person 의 once · per) */
const FILLER = new Set(['once', 'per', 'each', 'every', 'only', 'time', 'twice'].map(stem));
/** 「한 번만 · 하나만 · 중복」이 들어간 요구사항의 개념 (unique exists duplicate taken) */
const UNIQUE = stem('unique');
/** 숫자 없이 말한 세는 기간: 「per day」 · 「daily」 · 「하루에」 · 「시간당」 */
const PER_PERIOD = /\b(?:per|a|an|each|every)\s+(?:day|hour|minute|week|month)\b|\b(?:daily|hourly|weekly|monthly)\b|하루|매일|일일|시간당|분당|주당|일주일|한\s*달|매달|매월/i;
/** 세는 값의 이름에 든 기간 (sentToday · MAX_RESET_PER_DAY · changesThisMonth) */
const PERIOD_NAME = /today|daily|per_?day|this_?(?:day|week|month|hour)|hourly|weekly|monthly|per_?(?:hour|minute|week|month)|recent|window|since/i;
/** 시간을 비교하는 코드 (now - t < 86400000 · Date.now() - at · isSameDay) */
const TIME_CMP = /\bnow\b\s*-|Date\.now\(\)\s*-|getTime\(\)|isSame(?:Day|Hour|Week|Month)|startOf|toDateString|86400|3600|60\s*\*\s*60|24\s*\*\s*60/;
/** 무엇인지 말하지 않는 낱말 (same · again) — 검사 잇기에서 개념 수에 넣지 않는다 */
const SAME_AGAIN = new Set(['same', 'again'].map(stem));
/** 정액 할인 · 쿠폰 요구사항 (「정액 쿠폰은 금액을 그대로 뺀다」 · 「a fixed discount subtracts its amount」) */
const FIXED_REQ = /정액|\bfixed\b|\bflat\b/i;
const FIXED_MONEY = /할인|쿠폰|금액|discount|coupon|voucher|amount|\boff\b/i;
/** 중복 막기 요구사항(한 번만 · 하나만)의 검사는 이름에도 두 번 · 중복을 말해야 한다. 한 번만 누르는 검사는 근거가 아니다 (X 에서 받은 버그) */
const TWICE_TEST = /twice|second|again|duplicat|already|only (?:one|once)|more than once|\bused\b|reus|re-us|redeemed|consumed|retr(?:y|ied|ies|ying)|resen[dt]|repeat|same key|두\s*번|중복|이미|다시|반복|한\s*번만|하나만|사용한|사용된|재사용/i;
const isUniqueReq = (req: Requirement) => !req.constraints.length && req.concepts.some((g) => g.includes(UNIQUE));
/** 「이미 있으면」을 보는 조건의 낱말: if (existing) · if (prev) return prev · if (seen.has(id)) */
const DUP_GUARD = new Set(['uniqu', 'exist', 'duplicat', 'taken', 'prev', 'previou', 'already', 'seen', 'done', 'processed', 'found', 'used', 'consumed', 'redeemed', 'claimed'].map(stem));
/**
 * 설정값은 이름이 전부다. 이름(또는 그 값을 정한 문장)에 요구사항의 대상 낱말이 있어야 한다.
 * 요구사항이 「배송」비를 말하면 RETURN_FEE(반품비)는 같은 대상이 아니고, 「포인트」 적립률이면 TAX_RATE 는 아니다.
 * 대상 낱말이 없으면(fee · rate 만 말하면) 양을 뜻하는 낱말로 본다.
 */
function configNamed(req: Requirement, f: Found): boolean {
  const said = (t: string) => tokenize(f.p.left).includes(t) || f.u.tokens.includes(t);
  const subject = req.tokens.filter((t) => !GENERIC.has(t) && !MEASURE.has(t));
  if (subject.length) return subject.some(said);
  return req.tokens.filter((t) => !GENERIC.has(t)).some(said) || req.tokens.some((t) => tokenize(f.p.left).includes(t));
}

/**
 * 무엇인지는 말하지 않는 이름 낱말: 시간 단위(day · minute)와 age(사람의 나이일 수도, maxAge 일 수도 있다).
 * 이름에서 이것만 겹치면, 그 줄이 든 함수 · 문장이 요구사항의 대상을 말할 때만 같은 대상으로 본다.
 * (LOCK_MINUTES = 15 와 「로그인 토큰은 15분 뒤 만료」, canRejoin 의 daysSinceLeft 와 「세션은 7일 뒤 만료」, 가입 양식의 age.min(14) 와 「무료 체험은 14일」)
 */
const ERROR_TEXT = /\b(?:Error|Exception|[A-Z]\w*(?:Error|Exception))\s*\(\s*('[^']*'|"[^"]*"|`[^`]*`)/g;
/** 오류 이름에서 「이미 있음」을 말하는 강한 낱말 (ALREADY_REFUNDED · EMAIL_TAKEN · DUPLICATE). found · done 처럼 약한 낱말은 세지 않는다 */
const STRONG_DUP = new Set(['already', 'duplicat', 'duplicate', 'taken', 'exist', 'exists', 'used', 'redeemed', 'consumed', 'claimed', 'uniqu', 'conflict'].map(stem));
/**
 * 조건이 「이미 있는지」를 보는가: 코드 낱말(오류 글 밖)이 중복 낱말이거나, 오류 이름이 강한 중복 낱말을 말한다.
 * throw new Error('NOT_FOUND') 의 found 는 「이미 찾았으면」이 아니다 (0.18.0 첫 결과에서 찾음). NOT_ · NO_ 뒤의 낱말도 세지 않는다.
 */
function dupSignal(text: string, dupWords: Set<string>): boolean {
  if (tokenize(text.replace(ERROR_TEXT, 'Error(')).some((t) => dupWords.has(t))) return true;
  for (const m of text.matchAll(ERROR_TEXT)) {
    const words = tokenize(m[1].replace(/['"`]/g, '').replace(/_/g, ' '));
    if (words.some((w, i) => STRONG_DUP.has(w) && !['not', 'no', 'non'].includes(words[i - 1] ?? ''))) return true;
  }
  return false;
}
/** 상태 · 역할 칸을 글자와 견주는 조건: order.status === 'delivered' · 'owner' !== member.role */
const STATE_LIT = /([A-Za-z_.]*(?:status|state|stage|phase|role|plan|tier))\s*[!=]==?\s*['"`]([\w-]+)['"`]|['"`]([\w-]+)['"`]\s*[!=]==?\s*([A-Za-z_.]*(?:status|state|stage|phase|role|plan|tier))\b/gi;
const IRREGULAR: Record<string, string> = { paid: 'pay', sent: 'send', sold: 'sell' };
/**
 * 조건이 견주는 상태(delivered)가 요구사항이 말하는 상태(배송 시작 = shipped)와 다르면 다른 상태를 보는 조건이다.
 * (0.17.0 뒤 새 업무 영역 사례: 「배송이 시작된 주문은 취소할 수 없다」에 delivered 만 막는 코드가 「확인됨」)
 */
function stateMismatch(req: Requirement, text: string): boolean {
  const lits: string[] = [];
  for (const m of text.matchAll(STATE_LIT)) lits.push(m[2] ?? m[3]);
  if (!lits.length) return false;
  const words = [...new Set([...req.tokens, ...req.concepts.flat()])].filter((w) => w.length >= 3);
  const near = (a: string, b: string) => {
    const k = Math.min(a.length, b.length, 5);
    return k >= 3 && a.slice(0, k) === b.slice(0, k);
  };
  const litWords = lits.flatMap((l) => tokenize(l)).map((w) => IRREGULAR[w] ?? w);
  return !litWords.some((w) => words.some((r) => near(w, r) || near(IRREGULAR[r] ?? r, w)));
}

/** 요구사항의 대상 낱말 (일반 낱말 · 시간 낱말 빼고). 키워드를 줬어도 문장의 낱말(「리뷰를 쓸 수 없다」의 write)을 함께 본다 */
const subjectOf = (req: Requirement) => new Set([...req.tokens, ...req.concepts.flat()].filter((t) => !GENERIC.has(t) && !FILLER.has(t) && !WEAK_NAME.has(t) && !TIME_WORDS.has(t)));
/** 이름(함수 · 파일)에 든 요구사항 낱말. 함수 이름에 든 낱말을 파일 이름에만 든 낱말보다 두 배로 친다 */
function nameScore(subject: Set<string>, u: Unit): number {
  const fn = new Set(tokenize(u.fn ?? '').filter((t) => subject.has(t)));
  const file = new Set(tokenize(u.file.split('/').pop()!.replace(/\.[^.]+$/, '')).filter((t) => subject.has(t) && !fn.has(t)));
  return fn.size * 2 + file.size;
}
const AGE = stem('age');
const WEAK_NAME = new Set(['day', 'minute', 'min', 'ms', 'sec', 'second', 'hour', 'week', 'month', 'age'].map(stem));

function sameTarget(req: Requirement, f: Found): boolean {
  const hits = leftHits(req, f.p.left);
  const said = new Set(req.tokens);
  const subjectAround = () => {
    const subject = req.tokens.filter((t) => !GENERIC.has(t) && !WEAK_NAME.has(t) && !TIME_WORDS.has(t));
    const around = new Set([...f.u.tokens, ...tokenize(f.u.fn ?? '')]);
    return subject.some((t) => around.has(t));
  };
  if (!hits) {
    // maxAge · max 처럼 이름 자체가 일반적인 설정값은, 그 값을 정한 문장이 대상을 말하면 같은 대상이다
    // (「Sessions expire after 7 days」 ↔ session({ cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } }))
    const toks = tokenize(f.p.left);
    if (f.p.source === 'config' && toks.length > 0 && toks.every((t) => GENERIC.has(t) || WEAK_NAME.has(t)) && subjectAround()) return true;
    // 더하기 전에 세고 막는 줄(week.length >= 2 뒤 history.push · count >= 10 뒤 db.comment.create)은 그 함수가 하는 일을 센다.
    // 이름(history · count)이 요구사항 낱말이 아니어도, 함수가 요구사항의 대상을 말하면(withdraw ↔ 출금) 같은 대상이다
    return f.p.source === 'compare' && f.p.thenKind === 'reject' && f.p.preAdd && subjectAround();
  }
  // age 는 maxAge(쿠키) · 「30 days」처럼 사람 나이가 아닐 때가 많아 약한 이름이다.
  // 요구사항이 나이를 직접 말하고(Age must be … · 나이) 이름이 그 낱말 하나(dto.age · age)면 바로 그것이다
  const bare = stem(f.p.left.split(/[.\s]/).pop()!.toLowerCase());
  const ownAge = (t: string) => t === AGE && bare === AGE && /\bages?\b|나이|연령/i.test(req.text);
  if (!tokenize(f.p.left).some((t) => said.has(t) && (!WEAK_NAME.has(t) || ownAge(t))) && !subjectAround()) return false;
  if (f.p.source === 'config' && !configNamed(req, f)) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t));
  const left = new Set(tokenize(f.p.left));
  // 일반적인 낱말이라도 둘 이상 겹치면(minLength ↔ min, length) 같은 대상으로 본다
  if (!specific.length || hits >= 2 || specific.some((t) => left.has(t))) return true;
  // max: 10 처럼 이름이 일반적이면, 그 값이 들어 있는 문장(loginLimit = rateLimit({ … }))이나 그 줄이 든 함수(createGroup 의 size)를 본다
  const fnWords = tokenize(f.u.fn ?? '');
  return specific.some((t) => f.u.tokens.includes(t) || (f.p.source === 'compare' && fnWords.includes(t)));
}

const TIME_UNIT = new Set<UnitKind>(['sec', 'min', 'hour', 'day', 'week', 'month']);
/** 시각을 담는 이름: now, Date.now(), sentAt, lastSeen, createdTime, t … */
const TIME_NAME = /\bDate\.now\(\)|\bnow\b|\b\w*(?:At|Time|time|Date|date|Seen|seen)\b|\bt\b/;
/**
 * Date.now() - sentAt > 24 * HOUR 처럼 두 시각의 차이를 비교하는 줄은 이름이 없다.
 * 요구사항이 시간을 말하고, 그 줄이 든 함수가 요구사항과 같은 대상을 말하면(linkExpired ↔ 링크 만료) 같은 대상으로 본다.
 */
function timeDiffTarget(req: Requirement, c: Constraint, f: Found): boolean {
  if (!c.unit || !TIME_UNIT.has(c.unit)) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t) && !TIME_WORDS.has(t));
  // setTimeout(retry, 5000) 도 이름이 없다: 그 줄이 든 함수가 요구사항의 대상을 말하면(scheduleRetry ↔ 다시 시도) 같은 대상이다
  if (f.p.source === 'config' && /^(?:setTimeout|setInterval|sleep|delay|wait)\b/.test(f.p.left)) return specific.some((t) => f.u.tokens.includes(t));
  if (f.p.source !== 'compare') return false;
  const left = f.p.left;
  if (!/[^-]-[^-=]/.test(left) || (left.match(new RegExp(TIME_NAME.source, 'g')) ?? []).length < 1) return false;
  return specific.some((t) => f.u.tokens.includes(t));
}
const TIME_WORDS = new Set(['day', 'minute', 'min', 'ms', 'sec', 'second', 'hour', 'week', 'month', 'duration', 'window', 'period', 'time'].map(stem));

/** 숫자 조건마다 코드의 비교를 고르고 판정한다. 값이 같은 비교를 먼저 짝짓고, 남은 조건만 값이 다른 비교와 견준다. */
function judgeConstraints(req: Requirement, units: Unit[]): { b: Boundary; u: Unit | null }[] {
  const all: Found[] = units.flatMap((u) => (u.cond?.parts ?? []).map((p) => ({ u, p, score: scoreUnit(req, u).score })));
  // 요구사항의 낱말이 더 많이 겹치는 비교가 먼저, 그다음 이번에 바뀐 줄, 그다음 실제로 판단하는 비교
  // 나머지가 같으면 요구사항의 기능 이름을 가진 함수의 줄이 먼저다 (uploadAvatar 와 uploadDocument 에 같은 크기 검사가 있으면 「문서 업로드」는 uploadDocument)
  const subject = subjectOf(req);
  const rank = (f: Found) => (leftHits(req, f.p.left) * 1000 + (f.u.changed ? 500 : 0) + SOURCE_RANK[f.p.source] + f.score) * 16 + Math.min(15, nameScore(subject, f.u));
  const used = new Set<NumPart>();
  const out = new Map<Constraint, { b: Boundary; u: Unit | null }>();
  const chosen = new Map<Constraint, NumPart>();
  const sameValue = (c: Constraint, f: Found) => {
    const v = partValue(f.p);
    return !used.has(f.p) && v !== undefined && matchScale(c, v) !== null;
  };
  // 설정값은 「얼마」만 말한다. 그 이름을 실제로 비교하는 줄이 있으면 경계(이하 · 미만)는 그 줄로 판정한다.
  const decidingLine = (c: Constraint, f: Found): Found => {
    if (f.p.source !== 'config') return f;
    const name = f.p.left.split('.').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const uses = new RegExp(`(^|[^\\w$])${name}($|[^\\w$])`);
    return all.filter((g) => (g.p.source === 'compare' || g.p.source === 'loop') && fitsUnit(c, g.p) && sameValue(c, g) && uses.test(g.p.expr)).sort((a, b) => rank(b) - rank(a))[0] ?? f;
  };
  const take = (c: Constraint, found: Found) => {
    const f = decidingLine(c, found);
    used.add(f.p);
    chosen.set(c, f.p);
    out.set(c, { b: judge(c, f.p), u: f.u });
  };
  // 1) 요구사항이 말하는 대상의 비교 가운데 값이 같은 것
  for (const c of req.constraints) {
    const exact = all.filter((f) => fitsUnit(c, f.p) && sameValue(c, f) && (sameTarget(req, f) || timeDiffTarget(req, c, f))).sort((a, b) => rank(b) - rank(a));
    if (exact[0]) take(c, exact[0]);
  }
  // 2) 같은 대상인데 값이 다른 비교. 값을 아는 비교를 먼저 본다.
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    const others = all
      .filter((f) => !used.has(f.p) && fitsUnit(c, f.p) && (sameTarget(req, f) || timeDiffTarget(req, c, f)) && (f.p.op !== '!==' || c.rel === 'eq') && (f.p.op !== '===' || c.rel === 'eq' || f.p.source === 'config'))
      // length > 0 처럼 비었는지 보는 조건은 이 숫자와 상관없다 (0.7 같은 비율은 빼지 않는다)
      // (「정확히 그날」을 말하는 요구사항의 daysLeft === 1 은 빈 값 검사가 아니라 다른 날이다)
      .filter((f) => f.p.lit === undefined || f.p.source === 'loop' || c.unit === 'pct' || (c.rel === 'eq' && f.p.op === '===') || !(Math.abs(f.p.lit) <= 1 && c.value >= 3))
      .filter((f) => f.p.lit === undefined || sameThing(c, f.p) || timeDiffTarget(req, c, f))
      .sort((a, b) => Number(b.p.lit !== undefined) - Number(a.p.lit !== undefined) || rank(b) - rank(a));
    if (others[0]) take(c, others[0]);
  }
  // 3) 대상 이름은 안 겹치지만 값이 같고, 줄 자체가 요구사항과 이어지는 비교 (마지막 수단)
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    // 「한 달에 두 번」의 1달: 횟수로 고른 줄이 센 목록을 달력으로 같은 달만 걸렀으면(getMonth() === now.getMonth()) 그 창이다
    if (c.window && c.value === 1) {
      const cal = all.find((g) => g.p.calendar === c.unit && [...chosen.values()].includes(g.p));
      if (cal) {
        out.set(c, { b: calendarBoundary(c, cal.p), u: cal.u });
        continue;
      }
    }
    // 설정값은 이름이 전부다: 이름에 요구사항의 대상이 없으면(TAX_RATE ↔ 포인트 적립률) 값이 같아도 쓰지 않는다
    // (이름이 limit 처럼 일반적이면 그 값을 정한 문장을 본다: const { limit = 20 } = query ↔ 조회)
    const named = (f: Found) => f.p.source !== 'config' || configNamed(req, f);
    // 이름으로 이어지지 않은 줄이므로 값이 정확히 같아야 한다 (「최대 99개」와 다른 파일의 items.length > 100 은 하나 차이라도 다른 규칙이다)
    const exactly = (f: Found) => {
      const v = partValue(f.p);
      return v !== undefined && c.scales.some((k) => Math.abs(v - c.value * k) < 1e-9);
    };
    const loose = all.filter((f) => fitsUnit(c, f.p) && sameValue(c, f) && exactly(f) && f.score >= 3 && named(f)).sort((a, b) => rank(b) - rank(a));
    if (loose[0]) take(c, loose[0]);
    else out.set(c, { b: missingBoundary(c), u: null });
  }
  // 4) 같은 것을 정하는 값이 코드에 하나 더 있고 값이 다르면, 맞는 쪽 하나만 보고 「맞다」고 하지 않는다.
  //    (nanoid: 기본 길이 21 이 두 함수에 따로 있고, 한쪽만 45 로 바뀌어도 남은 21 때문에 「확인됨」이었다)
  for (const c of req.constraints) {
    const got = out.get(c)!;
    const p = chosen.get(c);
    // 설정값 · 기본값만 본다. 호출마다 옵션 값이 다른 것(isByteLength({ max: 64 }) 와 { max: 30 })은 흔하고 정상이다.
    if (got.b.ok !== true || !p || p.source !== 'config') continue;
    const family = (x: NumPart) => x.source;
    const rival = all.find(
      (f) =>
        !used.has(f.p) && f.p !== p && family(f.p) === family(p) && f.p.lit !== undefined && f.p.op === p.op &&
        partValue(f.p) !== undefined && matchScale(c, partValue(f.p)!) === null && sameName(f.p.left, p.left) && sameThing(c, f.p) &&
        !(Math.abs(f.p.lit) <= 1 && c.value >= 3),
    );
    if (rival) out.set(c, { ...got, b: { ...got.b, ok: null, why: 'conflict', say: conflictSay(got.b, rival.u.file, rival.p) } });
  }
  return req.constraints.map((c) => out.get(c)!);
}

/** 이름의 뜻만 남긴다: options.defaultSize · size · DEFAULT_SIZE 는 모두 size 다. */
const QUALIFIER = new Set(['default', 'def', 'option', 'opt', 'config', 'cfg', 'setting', 'this', 'self', 'props', 'param', 'arg'].map(stem));
const nameCore = (left: string) => tokenize(left).filter((t) => !QUALIFIER.has(t)).sort().join(' ');
const sameName = (a: string, b: string) => nameCore(a) !== '' && nameCore(a) === nameCore(b);
const conflictSay = (b: Boundary, file: string, p: NumPart) => {
  const here = `${file.split('/').pop()}:${p.line}`;
  return {
    ko: `${b.say?.ko ?? ''}. 같은 이름의 다른 값 ${p.lit}이 ${here}에 있음`.replace(/^\. /, ''),
    en: `${b.say?.en ?? ''}. Another value for the same name, ${p.lit}, is at ${here}`.replace(/^\. /, ''),
  };
};

const severity = (b: Boundary) => (b.ok === false ? 0 : b.ok === null ? 1 : 2);

function findEvidence(req: Requirement, units: Unit[], fields: SchemaField[] = []): Evidence {
  let best: { u: Unit; score: number; why: string[]; num: boolean } | null = null;
  for (const u of units) {
    const { score, why, num } = scoreUnit(req, u);
    if (!best || score > best.score || (score === best.score && moreSpecific(u, num, best))) best = { u, score, why, num };
  }
  const judged = judgeConstraints(req, units);
  // 정액 할인 · 쿠폰: 「정액이면」 갈래가 비율(÷100)로 계산하면 다름, 금액을 빼면 그 줄이 근거다 (X 에서 받은 버그: 정액 쿠폰을 비율로 계산)
  if (!judged.length && FIXED_REQ.test(req.text) && FIXED_MONEY.test(req.text)) {
    const fixed = units.filter((u) => u.cond?.fixedBranch);
    const pick = fixed.find((u) => u.cond!.fixedBranch === 'percent') ?? fixed[0];
    if (pick) {
      const s0 = scoreUnit(req, pick);
      const ev: Evidence = { unit: pick, score: s0.score, status: '발견', why: [...s0.why, L('정액 갈래의 계산식', 'the fixed-amount branch')] };
      if (pick.cond!.fixedBranch === 'percent') {
        const b: Boundary = {
          required: 0,
          attempts: null,
          ok: false,
          before: null,
          kind: 'value',
          say: { ko: '정액인데 비율(÷100)로 계산함', en: 'computes the fixed amount as a percentage (÷100)' },
          want: { ko: '금액을 그대로 뺀다', en: 'subtract the amount itself' },
          line: pick.startLine,
        };
        ev.boundaries = [b];
        ev.boundary = b;
      }
      return ev;
    }
  }
  const worst = [...judged].sort((a, b) => severity(a.b) - severity(b.b))[0];
  if (!best || best.score < 1) {
    if (!worst?.u) return { unit: null, score: best?.score ?? 0, status: '미발견', why: [], boundaries: judged.length ? judged.map((j) => j.b) : undefined, boundary: worst?.b };
  }
  // 근거 줄은 판정한 숫자 조건이 있는 줄로 맞춘다
  let unit = worst?.u ?? best!.u;
  // 확인하는 조건이 있어야 하는 요구사항(만 · must · 거부)인데 근거가 함수 전체이면, 그 함수 안에서 요구사항 낱말을 말하는 막는 조건이 근거다
  // (키워드 「gallery, type」 ↔ uploadToGallery 안의 !['image/png', 'image/jpeg'].includes(file.type)). 아래 「다른 기능 함수」 규칙이 그 조건에도 그대로 걸린다
  if (!judged.length && unit.kind === 'function' && req.needsCheck && !isUniqueReq(req)) {
    const words = new Set([...req.tokens, ...req.concepts.flat()].filter((t) => !GENERIC.has(t) && !FILLER.has(t)));
    const fnWords = new Set(tokenize(unit.fn ?? ''));
    const host = unit;
    const inner = units
      .filter((u) => u.kind === 'condition' && u.guard && u.file === host.file && u.fn === host.fn && tokenize(u.text).some((t) => words.has(t) && !fnWords.has(t)))
      .map((u) => ({ u, score: scoreUnit(req, u).score }))
      .sort((a, b) => b.score - a.score)[0];
    if (inner) unit = inner.u;
  }
  // 막는 조건이 요구사항이 말하는 기능이 아닌 다른 함수에 있으면 근거가 아니다 (X 에서 받은 버그:
  // 「잘못된 이메일이면 가입 거부」 ↔ 가입은 검사하지 않고 newsletter 의 subscribe 만 이메일을 검사).
  // 요구사항의 낱말을 이름(함수 · 파일)에 가진 다른 함수가 있으면 그쪽을 근거로 두고 「일부 발견」으로 둔다.
  // 이름(함수 · 파일)에 요구사항 낱말을 더 많이 담은 다른 함수가 있으면 그쪽이 요구사항의 기능이다
  // (「잘못된 id 로 파일 삭제는 거부」 ↔ getFile 의 검사가 아니라 deleteFile). 함수 이름이 파일 이름보다 앞선다:
  // signup.ts 안의 subscribe 는 가입 함수가 아니다 (국내 홍보 세션이 체험 페이지에서 찾은 0.16.0 오판).
  // 숫자 조건은 같은 파일 안에서만 본다(설정값 · 도우미 함수는 다른 파일에 흔하다). 그 함수가 검사 함수를 부르면 그 검사도 그 기능의 것이다.
  let foreign = false;
  const isFn = (file: string, fn: string) => units.some((x) => x.kind === 'function' && x.file === file && x.fn === fn);
  // 함수 밖의 설정값(const MAX_VIDEO_BYTES = …)이면 그 이름
  const configName = unit.kind === 'condition' && !isFn(unit.file, unit.fn) ? (unit.cond?.parts ?? []).find((p) => p.source === 'config')?.left.split('.').pop() : undefined;
  // 막는 조건, 설정값, 그리고 숫자를 판정한 조건(삼항식 total >= FREE_SHIPPING_MIN ? 0 : 3000 도)은 그 주인 함수를 본다
  // (함수 밖의 스키마 · 객체는 주인 함수가 없으므로 숫자 판정만으로는 보지 않는다: signupSchema 의 age.min(14))
  if (unit.kind === 'condition' && (unit.guard || configName || (judged.length > 0 && isFn(unit.file, unit.fn)))) {
    const subject = subjectOf(req);
    // 검사의 주인은 그 검사를 쓰는 함수다: 검사 함수를 부르는 함수(assertValidEmail ← register), 같은 파일에서 설정값을 쓰는 함수(MAX_VIDEO_BYTES ← uploadImage).
    // 쓰는 함수가 없으면 검사가 든 함수 자신이다. 검사 함수 이름(assertValidEmail 의 email)은 기능 이름이 아니므로 부르는 함수가 있으면 그쪽 이름으로 본다
    const callee = unit.fn.split('.').pop()!;
    const users = units.filter((x) => x.kind === 'function' && (configName ? x.file === unit.file && !!x.refs?.includes(configName) : !!x.calls?.includes(callee)));
    if (configName && !users.length) {
      // 아무 함수도 쓰지 않는 설정값은 예전처럼 그대로 둔다
    } else {
    const owners = new Set(users.map((x) => `${x.file}#${x.fn}`));
    const mine = users.length ? Math.max(...users.map((x) => nameScore(subject, x))) : nameScore(subject, unit);
    const pool = units.filter((u) => u.fn !== unit.fn && !owners.has(`${u.file}#${u.fn}`) && nameScore(subject, u) > mine && (!judged.length || u.file === unit.file));
    if (pool.length) {
      const top = Math.max(...pool.map((u) => nameScore(subject, u)));
      const theirs = pool.filter((u) => nameScore(subject, u) === top);
      const words = new Set([...req.tokens, ...req.concepts.flat()]);
      // 그 함수 안의 막는 조건이 요구사항의 대상을 말하는가 (함수 이름 말고 조건 글에서), 또는 같은 검사인가
      const said = (u: Unit) => {
        const own = new Set(tokenize(u.fn ?? ''));
        return tokenize(u.text).some((t) => words.has(t) && !own.has(t) && !GENERIC.has(t));
      };
      const same = (u: Unit) => u.text.replace(/\s+/g, ' ') === unit.text.replace(/\s+/g, ' ');
      const check = theirs
        .filter((u) => u.kind === 'condition' && u.guard && (said(u) || same(u)))
        .map((u) => ({ u, score: scoreUnit(req, u).score }))
        .sort((a, b) => b.score - a.score)[0];
      if (check) {
        if (!judged.length) unit = check.u;
      } else {
        const own = theirs.map((u) => ({ u, score: scoreUnit(req, u).score })).sort((a, b) => b.score - a.score)[0];
        if (own && own.score >= 1) {
          unit = own.u;
          foreign = true;
        }
      }
    }
    }
  }
  let dupInner = false;
  // 중복 막기(한 번만 · 하나만)인데 근거가 함수 전체이면, 그 함수 안의 「이미 있으면」 조건(if (existing) return existing)이 근거다
  if (!judged.length && unit.kind === 'function' && isUniqueReq(req)) {
    const dupWords = new Set([...(req.concepts.find((g) => g.includes(UNIQUE)) ?? []), ...DUP_GUARD]);
    // 조건 글자만 본다. 줄 낱말에는 함수 이름(redeem)이 섞여 있어 if (!card) throw 도 「이미 썼으면」으로 읽혔다 (0.18.0 첫 결과에서 찾음)
    const inner = units.find((u) => u.kind === 'condition' && u.guard && u.file === unit.file && u.startLine >= unit.startLine && u.endLine <= unit.endLine && dupSignal(u.text, dupWords));
    if (inner) {
      unit = inner;
      dupInner = true;
    }
  }
  const s = unit === best?.u ? best : { ...scoreUnit(req, unit), u: unit };
  // 확인하는 조건이 있어야 하는 요구사항인데 근거가 함수 전체뿐이면(이름만 겹침) 구현을 찾았다고 하지 않는다
  const onlyName = req.needsCheck && !judged.length && unit.kind === 'function';
  // 키워드 없이 이은 함수 하나가 요구사항의 개념 절반도 담지 못하면(「이메일을 바꾸면 … 인증 메일을 보내야」 ↔ changeEmail 은 보내지 않는다) 구현을 찾았다고 하지 않는다
  // 조건 줄은 그 줄이 든 함수의 이름까지 본다 (postComment 안의 if (user.suspended) throw 는 「정지된 사용자는 댓글을 못 쓴다」를 모두 말한다)
  const around = new Set([...unit.tokens, ...tokenize(unit.fn ?? '')]);
  // once · per · number 처럼 무엇인지 말하지 않는 낱말은 개념 수에 넣지 않는다
  const ideas = req.concepts.filter((g) => !g.every((t) => GENERIC.has(t) || FILLER.has(t)));
  const covered = ideas.filter((g) => g.some((t) => around.has(t))).length;
  // 막지 않는 조건 줄도 같다. throw 로 막는 조건(if (!PHONE.test(phone)) throw)은 그 자체가 확인하는 코드라 그대로 둔다.
  const thin = req.auto && !judged.length && (unit.kind === 'function' || (unit.kind === 'condition' && !unit.guard)) && ideas.length >= 3 && covered * 2 < ideas.length;
  // 「한 번만 · 하나만」(중복 막기)인데 근거 줄이 다른 개수를 비교하면 중복을 보는 조건이 아니다
  // (「상품 리뷰는 한 사람당 하나만」 ↔ 다른 파일의 if (items.length > 100) return 400)
  const notDuplicateCheck =
    !req.constraints.length && req.concepts.some((g) => g.includes(UNIQUE)) && unit.kind === 'condition' && (unit.cond?.parts ?? []).some((p) => p.lit !== undefined && Math.abs(p.lit) > 1);
  // 상태 · 역할 글자를 견주는 조건이 요구사항이 말하는 상태와 다른 상태를 본다 (delivered ↔ 배송 시작 · viewer ↔ owner 만)
  const otherState = !judged.length && unit.kind === 'condition' && stateMismatch(req, unit.text);
  // 「한 번만 · 하나만」(중복 막기)인데 근거 조건이 이미 있는지를 보지 않으면(if (!t) throw) 중복 막기가 아니다
  // (0.18.0 을 만들던 중 「재설정 링크는 한 번만」에 usedAt 확인이 없는 코드가 「확인됨」이 될 뻔함)
  const dupWords = new Set([...(req.concepts.find((g) => g.includes(UNIQUE)) ?? []), ...DUP_GUARD]);
  const notDupGuard =
    isUniqueReq(req) && !dupInner && unit.kind === 'condition' && !dupSignal(unit.text, dupWords) && !/\.(?:some|includes|has|find|findFirst|findUnique|indexOf|exists?|count)\s*\(/.test(unit.text);
  const found = !onlyName && !thin && !notDuplicateCheck && !foreign && !otherState && !notDupGuard && (judged.some((j) => j.u) || s.score >= 2 || dupInner);
  // 「잘못된 이메일은 거부」인데 바뀐 스키마가 그 칸을 검사 없이 받으면(email: z.string()) 다른 곳의 검사로 확인됐다고 하지 않는다 (X 에서 받은 버그)
  const words = new Set(req.tokens);
  const unchecked =
    found && !judged.length && (req.guardCue || req.needsCheck)
      ? fields.find((f) => !f.checked && tokenize(f.name).some((t) => words.has(t)) && !(f.file === unit.file && f.line >= unit.startLine && f.line <= unit.endLine))
      : undefined;
  // 「하루에 3번까지」 · 「at most 3 invites per day」인데 세는 줄의 이름(sentToday · MAX_PER_DAY)에도, 같은 함수의 시간 비교(now - t < …)에도
  // 기간이 없으면(sent.length >= 3) 기간과 상관없이 전부 센다. 숫자만 맞는다고 확인됐다고 하지 않는다.
  const perPeriod =
    PER_PERIOD.test(req.text) && !req.constraints.some((c) => c.window) && req.constraints.some((c) => (c.rel === 'lte' || c.rel === 'lt') && (c.unit === 'cnt' || c.unit === 'qty' || c.unit === null));
  const noWindow =
    // 오류 글(throw new Error('DAILY_LIMIT'))의 「daily」는 세는 값이 아니므로 따옴표 안 글은 빼고 본다.
    found && perPeriod && judged.length > 0 && unit.kind === 'condition' && !unit.cond?.parts?.some((p) => p.timed) && !PERIOD_NAME.test(unit.text.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")) && !units.some((u) => u.file === unit.file && u.fn === unit.fn && u.kind === 'condition' && TIME_CMP.test(u.text));
  const status = found && !unchecked && !noWindow ? '발견' : '일부 발견';
  const ev: Evidence = { unit, score: s.score, status, why: s.why };
  if (noWindow) ev.noWindow = true;
  if (unchecked) {
    const at = `${unchecked.file.split('/').pop()}:${unchecked.line}`;
    ev.unchecked = { ko: `${unchecked.name} 을(를) 검사 없이 받는 곳이 있음 (${at})`, en: `${unchecked.name} is accepted without a check at ${at}` };
    ev.why = [...s.why, ev.unchecked.ko];
  }
  if (judged.length) {
    ev.boundaries = judged.map((j) => j.b);
    ev.boundary = worst.b;
  }
  // 「관리자만」인데 다른 조건이 함께 걸려 있으면, 그 조건이 거짓일 때는 막지 않는다
  const terms = unit.cond?.andTerms;
  if (req.only && unit.guard && terms) {
    const extra = terms.filter((t) => leftHits(req, t) === 0);
    if (extra.length) ev.caveat = { ko: `다른 조건(${extra.join(', ')})이 함께 걸려 있어 항상 적용되지 않을 수 있음`, en: `another condition (${extra.join(', ')}) is attached, so this may not always apply` };
  }
  return ev;
}

/** 검사 이름의 서수: a fourth invite · the 11th comment · 세 번째 출금 · 4번째 */
const ORD_EN: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fiftieth: 50, hundredth: 100 };
const ORD_KO: Record<string, number> = { 첫: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12, 열세: 13, 열네: 14, 열다섯: 15, 스무: 20 };
function ordinals(name: string): number[] {
  const out: number[] = [];
  for (const m of name.matchAll(/\b(\d+)(?:st|nd|rd|th)\b|(\d+)\s*(?:번째|회째)/gi)) out.push(Number(m[1] ?? m[2]));
  for (const m of name.matchAll(/\b([a-z]+)\b/gi)) {
    const w = m[1].toLowerCase();
    if (!ORD_EN[w]) continue;
    // 「1 second · per second · wait a second before …」의 second 는 시간이다. 「a second invite」처럼 뒤에 무엇이 오면 서수다
    if (w === 'second' && (/(?:\d|one|per|each|every|half a|a few)\s*$/i.test(name.slice(0, m.index)) || !/^\s+(?!(?:later|after|before|ago|delay|timeout|window|interval|passes|elapses)\b)[a-z]/i.test(name.slice(m.index! + w.length)))) continue;
    out.push(ORD_EN[w]);
  }
  for (const m of name.matchAll(/(?<![가-힣])(열다섯|열한|열두|열세|열네|다섯|여섯|일곱|여덟|아홉|스무|첫|두|세|네|열)\s*번째/g)) out.push(ORD_KO[m[1]]);
  return out;
}
/** 「하루에 3번까지」의 경계 검사인가: 검사 이름이 바로 다음 서수(네 번째 · a fourth)를 말한다 */
function boundaryTest(req: Requirement, name: string): boolean {
  const ords = ordinals(name);
  if (!ords.length) return false;
  return req.constraints.some((c) => (c.unit === 'cnt' || c.unit === 'qty' || c.unit === null) && !c.window && ((c.rel === 'lte' && ords.includes(c.value + 1)) || (c.rel === 'lt' && ords.includes(c.value))));
}
const NEGATIVE_TEST = /(reject|den(y|ies|ied)|block|refus|forbid|fail|error|throw|invalid|cannot|can't|does not|doesn't|should not|must not|unauthori|locked out|거부|차단|실패|막|않|수\s*없|불가|금지|못\s*(?:하|받|씀|써|보|넣|가))/i;

/** 검사 이름의 50,000 을 50000 으로 */
const plainNumbers = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1');

const WORD_NUMBER: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const ORDINAL: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10' };
/** 검사 이름에 나온 숫자 (one ~ ten, 「a sixth attempt」 같은 서수 포함. 「one second」의 second 는 시간이라 a · the 뒤만 본다) */
const namedNumbers = (name: string) =>
  [...plainNumbers(name)
    .replace(/\b(a|an|the)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (_w, a: string, o: string) => `${a} ${ORDINAL[o.toLowerCase()]}`)
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => WORD_NUMBER[w.toLowerCase()])
    .matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).concat(ordinals(name));
/** 「3번까지」 같은 개수 제한을 시험하는 검사 이름: 거부 · 한도를 말하거나 숫자 · 서수를 적는다 (「sends a reset mail」은 한도를 시험하지 않는다) */
const LIMIT_TEST = /limit|too many|exceed|\bmax|at most|up to|quota|throttl|rate|한도|초과|넘|최대|까지|제한/i;
/** 한도 · 단위를 말할 뿐 무엇의 한도인지는 말해 주지 않는 낱말 */
const BROAD = new Set([...GENERIC, ...['maximum', 'cap', 'minimum', 'counter', 'time', 'day', 'minute', 'hour', 'second', 'sec', 'ms', 'duration', 'window', 'period'].map(stem)]);

function mapTests(req: Requirement, tests: TestCase[], ev: Evidence): TestCase[] {
  // 코드에서 숫자 조건이 이미 맞다고 판정됐으면, 같은 숫자와 같은 대상을 말하는 검사는 이 규칙의 검사로 본다.
  const settled = !!ev.boundaries?.length && ev.boundaries.every((b) => b.ok === true);
  const sameRule = (t: TestCase) => {
    if (!settled) return false;
    // 검사 이름도 용어집으로 읽는다 (「3000원 정액 쿠폰은 …」의 쿠폰 · 정액)
    const names = new Set([...tokenize(normalizePhrases(plainNumbers(t.name))), ...conceptsFor(t.name).flat()]);
    const nums = namedNumbers(t.name);
    // 거부를 말하는 검사는 처음 막히는 번째를 적는다: 「최대 5번」 ↔ 「a sixth attempt is rejected」
    const firstRejected = (c: Constraint, n: number) => NEGATIVE_TEST.test(t.name) && ((c.rel === 'lte' && n === c.value + 1) || (c.rel === 'lt' && n === c.value));
    return req.constraints.some((c) => nums.some((n) => matchScale(c, n) !== null || firstRejected(c, n))) && req.concepts.some((g) => g.some((x) => !BROAD.has(x) && names.has(x)));
  };
  // 숫자가 없는 규칙(형식 · 중복 · 동의): 요구사항 · 판단하는 조건 줄 · 검사 이름이 같은 대상을 말하면 잇는다.
  // 검사 이름이 요구사항 개념의 절반 이상(둘 이상)을 담고, 그 가운데 하나가 조건 줄에도 나와야 한다. 막는 요구사항이면 검사 이름도 거부를 말해야 한다.
  // (절반 기준이 없으면 「잠긴 계정은 로그인되지 않는다」에 「5번 실패하면 잠근다」 검사가 이어졌다)
  const deciding = ev.status === '발견' && ev.unit?.kind === 'condition' && !req.constraints.length;
  // 검사 이름도 요구사항처럼 용어집으로 읽는다 (「only one」 → 중복 막기)
  const testWords = (name: string) => new Set([...tokenize(normalizePhrases(plainNumbers(name))), ...conceptsFor(name).flat()]);
  // 중복 막기 요구사항에는 두 번 · 중복을 말하는 검사만 잇는다 (한 번만 누르는 검사가 「두 번 눌러도 하나」의 근거가 되지 않게)
  const twiceOk = (t: TestCase) => !isUniqueReq(req) || TWICE_TEST.test(t.name);
  const agrees = (t: TestCase) => {
    if (!deciding || !twiceOk(t)) return false;
    const names = testWords(t.name);
    const code = new Set(ev.unit!.tokens);
    const words = new Set([...req.tokens, ...req.concepts.flat()]);
    const shared = [...names].some((x) => code.has(x) && words.has(x) && !BROAD.has(x));
    const covered = req.concepts.filter((g) => g.some((x) => names.has(x))).length;
    return shared && covered >= 2 && covered * 2 >= req.concepts.length && (!req.guardCue || NEGATIVE_TEST.test(t.name));
  };
  // 개수 제한(3번까지 · at most 10 per day)에는 한도를 시험하는 검사만 잇는다: 거부 · 한도를 말하거나 숫자 · 서수를 적는다.
  // 「sends a reset mail」처럼 한 번 하는 검사는 「1시간에 3번까지」의 근거가 아니다
  const capReq = req.constraints.some((c) => (c.rel === 'lte' || c.rel === 'lt') && !c.window && (c.unit === 'cnt' || c.unit === 'qty' || (c.unit === null && PER_PERIOD.test(req.text))));
  const limitOk = (t: TestCase) => !capReq || NEGATIVE_TEST.test(t.name) || LIMIT_TEST.test(t.name) || namedNumbers(t.name).length > 0;
  if (!req.auto) {
    const set = new Set([...req.tokens, ...req.numbers.map(String)]);
    // 키워드가 하나뿐이면 그 낱말 하나로 잇는다 (둘을 요구하면 영영 이어지지 않는다)
    const need = Math.min(2, set.size);
    // 막는 요구사항이면 키워드로 잇는 검사도 거부를 말해야 한다 (「저장한다」 검사는 「형식이 틀리면 저장하지 않는다」의 근거가 아니다)
    const negOk = (t: TestCase) => !req.guardCue || NEGATIVE_TEST.test(t.name);
    // 「3번까지」의 경계 검사(a fourth … is rejected)는 서수가 숫자 하나 몫을 한다
    const edge = (t: TestCase) => (boundaryTest(req, t.name) && NEGATIVE_TEST.test(t.name) ? 1 : 0);
    // (키워드 하나 + 요구사항 문장 낱말 하나로 잇는 것은 0.18.0 을 만들며 해 봤다가 되돌렸다:
    //  「잠긴 계정은 맞는 비밀번호로도 로그인할 수 없다」에 「5번 실패하면 잠근다」 검사가 이어져 「확인됨」이 됐다)
    return tests.filter((t) => sameRule(t) || agrees(t) || (twiceOk(t) && negOk(t) && limitOk(t) && new Set(tokenize(plainNumbers(t.name)).filter((x) => set.has(x))).size + edge(t) >= need));
  }
  // 자동 연결은 넓게 걸리므로 검사 연결은 좁게 잡는다. 잘못 이어서 「확인됨」이 되는 것보다 「미실행」으로 남는 쪽이 낫다.
  // 조건: 요구사항의 개념(숫자 포함) 가운데 3분의 2 이상을 검사 이름이 담고, 거부 요구사항이면 검사 이름도 거부·실패를 말해야 한다.
  const groups = [...req.concepts, ...req.numbers.map((n) => [String(n)])];
  const scope = new Set([...req.text.matchAll(/\b(?:per|each|every)\s+([a-z]+)/gi)].map((m) => stem(m[1].toLowerCase())).filter((s) => !TIME_WORDS.has(s) && !WEAK_NAME.has(s)));
  return tests.filter((t) => {
    if (sameRule(t) || agrees(t)) return true;
    const names = testWords(t.name);
    if (groups.length < 2 || !twiceOk(t) || !limitOk(t)) return false;
    if (req.guardCue && !NEGATIVE_TEST.test(t.name)) return false;
    // 중복 막기 요구사항이면 「두 번 · 다시 · 같은 키」를 말하는 검사 이름이 「한 번만」 개념을 담은 것으로 본다
    // (「같은 이벤트에는 한 번만 참여」 ↔ 「joining the same event twice is rejected」)
    const uniqueSaid = isUniqueReq(req) && TWICE_TEST.test(t.name);
    // 「same · again · once」처럼 무엇인지 말하지 않는 낱말 묶음과 「per account · each user」의 범위 낱말은 개념 수에 넣지 않는다
    const real = groups.filter((g) => !g.every((x) => FILLER.has(x) || SAME_AGAIN.has(x) || scope.has(x)));
    // 「하루에 3번까지」 ↔ 「a fourth invite on the same day is rejected」: 바로 다음 서수와 거부를 말하면 대상 하나만 겹쳐도 경계 검사다
    if (boundaryTest(req, t.name) && NEGATIVE_TEST.test(t.name) && real.some((g) => !/^\d/.test(g[0]) && g.some((x) => names.has(x)))) return true;
    const covered = real.filter((g) => g.some((x) => names.has(x)) || (uniqueSaid && g.includes(UNIQUE))).length;
    return covered >= 2 && covered / real.length >= 2 / 3;
  });
}

function testStatus(ts: TestCase[]): TestStatus {
  if (ts.some((t) => t.status === 'fail')) return '실패';
  if (ts.some((t) => t.status === 'pass')) return '통과';
  return '미실행';
}

export function evaluate(sets: ResultSet[], reqs: Requirement[], repo: string, base: string): Report {
  for (const s of sets) {
    for (const r of reqs) {
      const evidence = findEvidence(r, s.units, s.analyses.flatMap((a) => a.fields ?? []));
      const mapped = mapTests(r, s.tests, evidence);
      const rr: ReqResult = { evidence, tests: mapped, testStatus: testStatus(mapped) };
      s.perReq[r.id] = rr;
    }
  }
  const summaries: ReqSummary[] = reqs.map((r) => summarize(r, sets));
  return { generatedAt: new Date().toISOString(), repo, base, sets, reqs, summaries };
}

function summarize(req: Requirement, sets: ResultSet[]): ReqSummary {
  const notes: string[] = [];
  let relation: Relation = { kind: '단일 결과', detail: '' };
  if (sets.length === 2) {
    const [A, B] = sets;
    const a = A.perReq[req.id].evidence;
    const b = B.perReq[req.id].evidence;
    if (!a.unit || !b.unit) {
      relation = { kind: '비교 조건 다름', detail: L('한쪽에서 구현 근거를 찾지 못했다.', 'No implementation evidence was found on one side.') };
    } else if (a.unit.cond && b.unit.cond) {
      const sa = `${a.unit.cond.op ?? ''}${a.unit.cond.lit ?? a.unit.cond.expr}`;
      const sb = `${b.unit.cond.op ?? ''}${b.unit.cond.lit ?? b.unit.cond.expr}`;
      relation = sa === sb ? { kind: '일치', detail: L(`둘 다 ${a.unit.cond.expr}`, `both ${a.unit.cond.expr}`) } : { kind: '불일치', detail: `A ${a.unit.cond.expr} · B ${b.unit.cond.expr}` };
    } else {
      relation = { kind: '일치', detail: L('둘 다 같은 종류의 구현 근거를 찾았다.', 'Both sides have the same kind of implementation evidence.') };
    }
  }
  const evs = sets.map((s) => s.perReq[req.id]);
  for (const [i, s] of sets.entries()) {
    for (const b of evs[i].evidence.boundaries ?? []) if (b.ok !== true) notes.push(boundaryNote(b, s.label));
    const caveat = evs[i].evidence.caveat;
    if (caveat) notes.push(`${s.label}: ${pick(caveat)}`);
  }
  const anyFail = evs.some((e) => e.testStatus === '실패');
  const allPass = evs.every((e) => e.testStatus === '통과');
  const allFound = evs.every((e) => e.evidence.status === '발견');
  const boundaryBad = evs.some((e) => e.evidence.boundaries?.some((b) => b.ok === false));
  // 숫자를 확정하지 못했거나 단서가 붙은 요구사항은 검사가 통과해도 「확인됨」이라고 하지 않는다.
  const unsettled = evs.some((e) => e.evidence.caveat || e.evidence.boundaries?.some((b) => b.ok === null));
  let overall: Overall;
  if (relation.kind === '불일치' || boundaryBad || (anyFail && !allPass && evs.some((e) => e.testStatus === '통과'))) overall = '다름';
  else if (anyFail) overall = '실패';
  else if (allFound && allPass && !unsettled) overall = '확인됨';
  else overall = '미확인';
  return { req, relation, overall, notes };
}

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Boundary, Constraint, Evidence, NumPart, Overall, Relation, ReqResult, ReqSummary, Report, Requirement, ResultSet, TestCase, TestStatus, Unit, UnitKind } from './types.ts';
import { analyzeFile, resolveRefs } from './analyze.ts';
import { boundaryNote, judge, matchScale, missingBoundary, partValue, pick } from './numeric.ts';
import { changedFiles, changedLines, mergeBase, shortSha, showFile, trackedFiles, uncommittedFiles, worktreeChangedFiles, worktreeChangedLines } from './git.ts';
import { parseTestReport } from './tests.ts';
import { tokenize, stem } from './tokens.ts';
import { normalizePhrases } from './glossary.ts';
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
const fitsUnit = (c: Constraint, p: NumPart) => !(p.strLen && COUNTED.includes(c.unit)) && !(p.listLen && c.unit === 'char');
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
  money: /total|price|amount|fee|cost|sum|subtotal|balance|pay/i,
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
    return f.p.source === 'config' && toks.length > 0 && toks.every((t) => GENERIC.has(t) || WEAK_NAME.has(t)) && subjectAround();
  }
  if (!tokenize(f.p.left).some((t) => said.has(t) && !WEAK_NAME.has(t)) && !subjectAround()) return false;
  if (f.p.source === 'config' && !configNamed(req, f)) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t));
  const left = new Set(tokenize(f.p.left));
  // 일반적인 낱말이라도 둘 이상 겹치면(minLength ↔ min, length) 같은 대상으로 본다
  if (!specific.length || hits >= 2 || specific.some((t) => left.has(t))) return true;
  // max: 10 처럼 이름이 일반적이면, 그 값이 들어 있는 문장(loginLimit = rateLimit({ … }))을 본다
  return specific.some((t) => f.u.tokens.includes(t));
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
  const rank = (f: Found) => leftHits(req, f.p.left) * 1000 + (f.u.changed ? 500 : 0) + SOURCE_RANK[f.p.source] + f.score;
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
      .filter((f) => f.p.lit === undefined || f.p.source === 'loop' || c.unit === 'pct' || !(Math.abs(f.p.lit) <= 1 && c.value >= 3))
      .filter((f) => f.p.lit === undefined || sameThing(c, f.p) || timeDiffTarget(req, c, f))
      .sort((a, b) => Number(b.p.lit !== undefined) - Number(a.p.lit !== undefined) || rank(b) - rank(a));
    if (others[0]) take(c, others[0]);
  }
  // 3) 대상 이름은 안 겹치지만 값이 같고, 줄 자체가 요구사항과 이어지는 비교 (마지막 수단)
  for (const c of req.constraints) {
    if (out.has(c)) continue;
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

function findEvidence(req: Requirement, units: Unit[]): Evidence {
  let best: { u: Unit; score: number; why: string[]; num: boolean } | null = null;
  for (const u of units) {
    const { score, why, num } = scoreUnit(req, u);
    if (!best || score > best.score || (score === best.score && moreSpecific(u, num, best))) best = { u, score, why, num };
  }
  const judged = judgeConstraints(req, units);
  const worst = [...judged].sort((a, b) => severity(a.b) - severity(b.b))[0];
  if (!best || best.score < 1) {
    if (!worst?.u) return { unit: null, score: best?.score ?? 0, status: '미발견', why: [], boundaries: judged.length ? judged.map((j) => j.b) : undefined, boundary: worst?.b };
  }
  // 근거 줄은 판정한 숫자 조건이 있는 줄로 맞춘다
  const unit = worst?.u ?? best!.u;
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
  const status = !onlyName && !thin && !notDuplicateCheck && (judged.some((j) => j.u) || s.score >= 2) ? '발견' : '일부 발견';
  const ev: Evidence = { unit, score: s.score, status, why: s.why };
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

const NEGATIVE_TEST = /(reject|den(y|ies|ied)|block|refus|forbid|fail|error|throw|invalid|cannot|can't|does not|doesn't|should not|must not|unauthori|locked out|거부|차단|실패|막|않)/i;

/** 검사 이름의 50,000 을 50000 으로 */
const plainNumbers = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1');

const WORD_NUMBER: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const ORDINAL: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10' };
/** 검사 이름에 나온 숫자 (one ~ ten, 「a sixth attempt」 같은 서수 포함. 「one second」의 second 는 시간이라 a · the 뒤만 본다) */
const namedNumbers = (name: string) =>
  [...plainNumbers(name)
    .replace(/\b(a|an|the)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (_w, a: string, o: string) => `${a} ${ORDINAL[o.toLowerCase()]}`)
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => WORD_NUMBER[w.toLowerCase()])
    .matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** 한도 · 단위를 말할 뿐 무엇의 한도인지는 말해 주지 않는 낱말 */
const BROAD = new Set([...GENERIC, ...['maximum', 'cap', 'minimum', 'counter', 'time', 'day', 'minute', 'hour', 'second', 'sec', 'ms', 'duration', 'window', 'period'].map(stem)]);

function mapTests(req: Requirement, tests: TestCase[], ev: Evidence): TestCase[] {
  // 코드에서 숫자 조건이 이미 맞다고 판정됐으면, 같은 숫자와 같은 대상을 말하는 검사는 이 규칙의 검사로 본다.
  const settled = !!ev.boundaries?.length && ev.boundaries.every((b) => b.ok === true);
  const sameRule = (t: TestCase) => {
    if (!settled) return false;
    const names = new Set(tokenize(normalizePhrases(plainNumbers(t.name))));
    const nums = namedNumbers(t.name);
    // 거부를 말하는 검사는 처음 막히는 번째를 적는다: 「최대 5번」 ↔ 「a sixth attempt is rejected」
    const firstRejected = (c: Constraint, n: number) => NEGATIVE_TEST.test(t.name) && ((c.rel === 'lte' && n === c.value + 1) || (c.rel === 'lt' && n === c.value));
    return req.constraints.some((c) => nums.some((n) => matchScale(c, n) !== null || firstRejected(c, n))) && req.concepts.some((g) => g.some((x) => !BROAD.has(x) && names.has(x)));
  };
  // 숫자가 없는 규칙(형식 · 중복 · 동의): 요구사항 · 판단하는 조건 줄 · 검사 이름이 같은 대상을 말하면 잇는다.
  // 검사 이름이 요구사항 개념의 절반 이상(둘 이상)을 담고, 그 가운데 하나가 조건 줄에도 나와야 한다. 막는 요구사항이면 검사 이름도 거부를 말해야 한다.
  // (절반 기준이 없으면 「잠긴 계정은 로그인되지 않는다」에 「5번 실패하면 잠근다」 검사가 이어졌다)
  const deciding = ev.status === '발견' && ev.unit?.kind === 'condition' && !req.constraints.length;
  const agrees = (t: TestCase) => {
    if (!deciding) return false;
    const names = new Set(tokenize(normalizePhrases(plainNumbers(t.name))));
    const code = new Set(ev.unit!.tokens);
    const words = new Set([...req.tokens, ...req.concepts.flat()]);
    const shared = [...names].some((x) => code.has(x) && words.has(x) && !BROAD.has(x));
    const covered = req.concepts.filter((g) => g.some((x) => names.has(x))).length;
    return shared && covered >= 2 && covered * 2 >= req.concepts.length && (!req.guardCue || NEGATIVE_TEST.test(t.name));
  };
  if (!req.auto) {
    const set = new Set([...req.tokens, ...req.numbers.map(String)]);
    // 키워드가 하나뿐이면 그 낱말 하나로 잇는다 (둘을 요구하면 영영 이어지지 않는다)
    const need = Math.min(2, set.size);
    return tests.filter((t) => sameRule(t) || agrees(t) || new Set(tokenize(plainNumbers(t.name)).filter((x) => set.has(x))).size >= need);
  }
  // 자동 연결은 넓게 걸리므로 검사 연결은 좁게 잡는다. 잘못 이어서 「확인됨」이 되는 것보다 「미실행」으로 남는 쪽이 낫다.
  // 조건: 요구사항의 개념(숫자 포함) 가운데 3분의 2 이상을 검사 이름이 담고, 거부 요구사항이면 검사 이름도 거부·실패를 말해야 한다.
  const groups = [...req.concepts, ...req.numbers.map((n) => [String(n)])];
  return tests.filter((t) => {
    if (sameRule(t) || agrees(t)) return true;
    const names = new Set(tokenize(normalizePhrases(plainNumbers(t.name))));
    if (groups.length < 2) return false;
    if (req.guardCue && !NEGATIVE_TEST.test(t.name)) return false;
    const covered = groups.filter((g) => g.some((x) => names.has(x))).length;
    return covered >= 2 && covered / groups.length >= 2 / 3;
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
      const evidence = findEvidence(r, s.units);
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

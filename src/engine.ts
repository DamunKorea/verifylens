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

function scoreUnit(req: Requirement, u: Unit): { score: number; why: string[]; num: boolean } {
  const why: string[] = [];
  let num = false;
  const set = new Set(req.tokens);
  const shared = [...new Set(u.tokens.filter((t) => set.has(t)))];
  // 자동 연결(키워드 없음)은 같은 뜻의 낱말을 한 개념으로 센다. 한 개념의 동의어가 여러 번 겹쳐도 한 번이다.
  const hits = req.auto ? req.concepts.filter((c) => c.some((t) => u.tokens.includes(t))).length : shared.length;
  let s = u.kind === 'function' ? Math.min(hits, 1.5) : hits;
  if (shared.length) why.push(L(`겹치는 단어: ${shared.join(', ')}`, `shared words: ${shared.join(', ')}`));
  const parts = u.cond?.parts ?? [];
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
  if (req.guardCue && u.guard) {
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
const GENERIC = new Set(['length', 'len', 'size', 'count', 'max', 'min', 'limit', 'value', 'number', 'num', 'id', 'item', 'data'].map(stem));
function sameTarget(req: Requirement, f: Found): boolean {
  const hits = leftHits(req, f.p.left);
  if (!hits) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t));
  const left = new Set(tokenize(f.p.left));
  // 일반적인 낱말이라도 둘 이상 겹치면(minLength ↔ min, length) 같은 대상으로 본다
  if (!specific.length || hits >= 2 || specific.some((t) => left.has(t))) return true;
  // max: 10 처럼 이름이 일반적이면, 그 값이 들어 있는 문장(loginLimit = rateLimit({ … }))을 본다
  return specific.some((t) => f.u.tokens.includes(t));
}

/** 숫자 조건마다 코드의 비교를 고르고 판정한다. 값이 같은 비교를 먼저 짝짓고, 남은 조건만 값이 다른 비교와 견준다. */
function judgeConstraints(req: Requirement, units: Unit[]): { b: Boundary; u: Unit | null }[] {
  const all: Found[] = units.flatMap((u) => (u.cond?.parts ?? []).map((p) => ({ u, p, score: scoreUnit(req, u).score })));
  // 요구사항의 낱말이 더 많이 겹치는 비교가 먼저, 그다음 이번에 바뀐 줄, 그다음 실제로 판단하는 비교
  const rank = (f: Found) => leftHits(req, f.p.left) * 1000 + (f.u.changed ? 500 : 0) + SOURCE_RANK[f.p.source] + f.score;
  const used = new Set<NumPart>();
  const out = new Map<Constraint, { b: Boundary; u: Unit | null }>();
  const sameValue = (c: Constraint, f: Found) => {
    const v = partValue(f.p);
    return !used.has(f.p) && v !== undefined && matchScale(c, v) !== null;
  };
  // 설정값은 「얼마」만 말한다. 그 이름을 실제로 비교하는 줄이 있으면 경계(이하 · 미만)는 그 줄로 판정한다.
  const decidingLine = (c: Constraint, f: Found): Found => {
    if (f.p.source !== 'config') return f;
    const name = f.p.left.split('.').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const uses = new RegExp(`(^|[^\\w$])${name}($|[^\\w$])`);
    return all.filter((g) => (g.p.source === 'compare' || g.p.source === 'loop') && sameValue(c, g) && uses.test(g.p.expr)).sort((a, b) => rank(b) - rank(a))[0] ?? f;
  };
  const take = (c: Constraint, found: Found) => {
    const f = decidingLine(c, found);
    used.add(f.p);
    out.set(c, { b: judge(c, f.p), u: f.u });
  };
  // 1) 요구사항이 말하는 대상의 비교 가운데 값이 같은 것
  for (const c of req.constraints) {
    const exact = all.filter((f) => sameValue(c, f) && sameTarget(req, f)).sort((a, b) => rank(b) - rank(a));
    if (exact[0]) take(c, exact[0]);
  }
  // 2) 같은 대상인데 값이 다른 비교. 값을 아는 비교를 먼저 본다.
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    const others = all
      .filter((f) => !used.has(f.p) && sameTarget(req, f) && f.p.op !== '!==' && (f.p.op !== '===' || c.rel === 'eq' || f.p.source === 'config'))
      // length > 0 처럼 비었는지 보는 조건은 이 숫자와 상관없다
      .filter((f) => f.p.lit === undefined || f.p.source === 'loop' || !(Math.abs(f.p.lit) <= 1 && c.value >= 3))
      .filter((f) => f.p.lit === undefined || sameThing(c, f.p))
      .sort((a, b) => Number(b.p.lit !== undefined) - Number(a.p.lit !== undefined) || rank(b) - rank(a));
    if (others[0]) take(c, others[0]);
  }
  // 3) 대상 이름은 안 겹치지만 값이 같고, 줄 자체가 요구사항과 이어지는 비교 (마지막 수단)
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    const loose = all.filter((f) => sameValue(c, f) && f.score >= 3).sort((a, b) => rank(b) - rank(a));
    if (loose[0]) take(c, loose[0]);
    else out.set(c, { b: missingBoundary(c), u: null });
  }
  return req.constraints.map((c) => out.get(c)!);
}

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
  const status = judged.some((j) => j.u) || s.score >= 2 ? '발견' : '일부 발견';
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
/** 검사 이름에 나온 숫자 (one ~ ten 포함) */
const namedNumbers = (name: string) =>
  [...plainNumbers(name).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => WORD_NUMBER[w.toLowerCase()]).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** 한도 · 단위를 말할 뿐 무엇의 한도인지는 말해 주지 않는 낱말 */
const BROAD = new Set([...GENERIC, ...['maximum', 'cap', 'minimum', 'counter', 'time', 'day', 'minute', 'hour', 'second', 'sec', 'ms', 'duration', 'window', 'period'].map(stem)]);

function mapTests(req: Requirement, tests: TestCase[], ev: Evidence): TestCase[] {
  // 코드에서 숫자 조건이 이미 맞다고 판정됐으면, 같은 숫자와 같은 대상을 말하는 검사는 이 규칙의 검사로 본다.
  const settled = !!ev.boundaries?.length && ev.boundaries.every((b) => b.ok === true);
  const sameRule = (t: TestCase) => {
    if (!settled) return false;
    const names = new Set(tokenize(normalizePhrases(plainNumbers(t.name))));
    const nums = namedNumbers(t.name);
    return req.constraints.some((c) => nums.some((n) => matchScale(c, n) !== null)) && req.concepts.some((g) => g.some((x) => !BROAD.has(x) && names.has(x)));
  };
  if (!req.auto) {
    const set = new Set([...req.tokens, ...req.numbers.map(String)]);
    // 키워드가 하나뿐이면 그 낱말 하나로 잇는다 (둘을 요구하면 영영 이어지지 않는다)
    const need = Math.min(2, set.size);
    return tests.filter((t) => sameRule(t) || new Set(tokenize(plainNumbers(t.name)).filter((x) => set.has(x))).size >= need);
  }
  // 자동 연결은 넓게 걸리므로 검사 연결은 좁게 잡는다. 잘못 이어서 「확인됨」이 되는 것보다 「미실행」으로 남는 쪽이 낫다.
  // 조건: 요구사항의 개념(숫자 포함) 가운데 3분의 2 이상을 검사 이름이 담고, 거부 요구사항이면 검사 이름도 거부·실패를 말해야 한다.
  const groups = [...req.concepts, ...req.numbers.map((n) => [String(n)])];
  return tests.filter((t) => {
    if (sameRule(t)) return true;
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

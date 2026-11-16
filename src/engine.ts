import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Boundary, Evidence, Overall, Relation, ReqResult, ReqSummary, Report, Requirement, ResultSet, TestCase, TestStatus, Unit } from './types.ts';
import { analyzeFile } from './analyze.ts';
import { changedFiles, changedLines, mergeBase, shortSha, showFile, uncommittedFiles, worktreeChangedFiles, worktreeChangedLines } from './git.ts';
import { parseTestReport } from './tests.ts';
import { tokenize } from './tokens.ts';
import { normalizePhrases } from './glossary.ts';

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
    label: `결과 ${key}`,
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

/**
 * 요구사항이 세는 바로 그것을 숫자와 비교하는 조건인가.
 * 예: 요구사항 「5회 실패하면…」 과 조건 `user.failures > 3`. 숫자가 요구사항과 멀어도, 비교하는 변수 이름이 요구사항의 낱말이면 이 조건이 근거다.
 * (숫자가 한 칸 안일 때만 잇던 것으로는 `> 3` 같은 큰 어긋남을 놓쳤다.)
 */
function countsOnRequirement(req: Requirement, u: Unit): boolean {
  const c = u.cond;
  if (!c || c.lit === undefined || !c.left || !req.numbers.length) return false;
  const set = new Set(req.tokens);
  return tokenize(c.left).some((t) => set.has(t));
}

function scoreUnit(req: Requirement, u: Unit): { score: number; why: string[] } {
  const why: string[] = [];
  const set = new Set(req.tokens);
  const shared = [...new Set(u.tokens.filter((t) => set.has(t)))];
  // 자동 연결(키워드 없음)은 같은 뜻의 낱말을 한 개념으로 센다. 한 개념의 동의어가 여러 번 겹쳐도 한 번이다.
  const hits = req.auto ? req.concepts.filter((c) => c.some((t) => u.tokens.includes(t))).length : shared.length;
  let s = u.kind === 'function' ? Math.min(hits, 1.5) : hits;
  if (shared.length) why.push(`겹치는 단어: ${shared.join(', ')}`);
  if (u.cond && u.cond.lit !== undefined && req.numbers.some((n) => Math.abs(n - u.cond!.lit!) <= 1)) {
    s += 2;
    why.push(`숫자 ${u.cond.lit} (요구사항 ${req.numbers.join('·')})`);
  } else if (countsOnRequirement(req, u)) {
    s += 2;
    why.push(`숫자 조건 ${u.cond!.left} ↔ ${u.cond!.lit} (요구사항 ${req.numbers.join('·')})`);
  }
  if (req.guardCue && u.guard) {
    s += 1;
    why.push('거부 문장 ↔ 조건 뒤 throw/return');
  }
  if (u.changed) s += 0.5;
  return { score: s, why };
}

/** 점수가 같을 때: 함수보다 조건, 숫자가 맞는 조건, 더 좁은 범위(안쪽 조건)를 고른다. */
function moreSpecific(u: Unit, why: string[], best: { u: Unit; why: string[] }): boolean {
  if (u.kind !== best.u.kind) return u.kind === 'condition';
  const num = (w: string[]) => w.some((x) => x.startsWith('숫자 '));
  if (num(why) !== num(best.why)) return num(why);
  return u.endLine - u.startLine < best.u.endLine - best.u.startLine;
}

function findEvidence(req: Requirement, units: Unit[]): Evidence {
  let best: { u: Unit; score: number; why: string[] } | null = null;
  for (const u of units) {
    const { score, why } = scoreUnit(req, u);
    if (!best || score > best.score || (score === best.score && moreSpecific(u, why, best))) best = { u, score, why };
  }
  if (!best || best.score < 1) return { unit: null, score: best?.score ?? 0, status: '미발견', why: [] };
  const status = best.score >= 2 ? '발견' : '일부 발견';
  const ev: Evidence = { unit: best.u, score: best.score, status, why: best.why };
  const c = best.u.cond;
  if (c && c.lit !== undefined && req.numbers.length) {
    const required = req.numbers.reduce((a, b) => (Math.abs(b - c.lit!) < Math.abs(a - c.lit!) ? b : a));
    if (Math.abs(required - c.lit) <= 1 || countsOnRequirement(req, best.u)) {
      ev.boundary = {
        required,
        firstTrue: c.firstTrue,
        attempts: c.attempts ?? null,
        ok: c.attempts === undefined || c.attempts === null ? null : c.attempts === required,
        before: c.incrementBefore ?? null,
      } satisfies Boundary;
    }
  }
  return ev;
}

const NEGATIVE_TEST = /(reject|den(y|ies|ied)|block|refus|forbid|fail|error|throw|invalid|cannot|can't|does not|doesn't|should not|must not|unauthori|locked out|거부|차단|실패|막|않)/i;

function mapTests(req: Requirement, tests: TestCase[]): TestCase[] {
  if (!req.auto) {
    const set = new Set([...req.tokens, ...req.numbers.map(String)]);
    return tests.filter((t) => new Set(tokenize(t.name).filter((x) => set.has(x))).size >= 2);
  }
  // 자동 연결은 넓게 걸리므로 검사 연결은 좁게 잡는다. 잘못 이어서 「확인됨」이 되는 것보다 「미실행」으로 남는 쪽이 낫다.
  // 조건: 요구사항의 개념(숫자 포함) 가운데 3분의 2 이상을 검사 이름이 담고, 거부 요구사항이면 검사 이름도 거부·실패를 말해야 한다.
  const groups = [...req.concepts, ...req.numbers.map((n) => [String(n)])];
  if (groups.length < 2) return [];
  return tests.filter((t) => {
    if (req.guardCue && !NEGATIVE_TEST.test(t.name)) return false;
    const names = new Set(tokenize(normalizePhrases(t.name)));
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
      const mapped = mapTests(r, s.tests);
      const rr: ReqResult = { evidence: findEvidence(r, s.units), tests: mapped, testStatus: testStatus(mapped) };
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
      relation = { kind: '비교 조건 다름', detail: '한쪽에서 구현 근거를 찾지 못했다.' };
    } else if (a.unit.cond && b.unit.cond) {
      const sa = `${a.unit.cond.op ?? ''}${a.unit.cond.lit ?? a.unit.cond.expr}`;
      const sb = `${b.unit.cond.op ?? ''}${b.unit.cond.lit ?? b.unit.cond.expr}`;
      relation = sa === sb ? { kind: '일치', detail: `둘 다 ${a.unit.cond.expr}` } : { kind: '불일치', detail: `A ${a.unit.cond.expr} · B ${b.unit.cond.expr}` };
    } else {
      relation = { kind: '일치', detail: '둘 다 같은 종류의 구현 근거를 찾았다.' };
    }
  }
  const evs = sets.map((s) => s.perReq[req.id]);
  for (const [i, s] of sets.entries()) {
    const b = evs[i].evidence.boundary;
    if (b && b.ok === false) notes.push(`${s.label}: 요구사항 ${b.required}회, 코드는 ${b.attempts}회째에 동작`);
    if (b && b.ok === null) notes.push(`${s.label}: 카운터 증가 순서를 찾지 못해 경계값을 확정할 수 없음`);
  }
  const anyFail = evs.some((e) => e.testStatus === '실패');
  const allPass = evs.every((e) => e.testStatus === '통과');
  const allFound = evs.every((e) => e.evidence.status === '발견');
  const boundaryBad = evs.some((e) => e.evidence.boundary?.ok === false);
  let overall: Overall;
  if (relation.kind === '불일치' || boundaryBad || (anyFail && !allPass && evs.some((e) => e.testStatus === '통과'))) overall = '다름';
  else if (anyFail) overall = '실패';
  else if (allFound && allPass) overall = '확인됨';
  else overall = '미확인';
  return { req, relation, overall, notes };
}

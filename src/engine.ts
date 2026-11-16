import { readFileSync } from 'node:fs';
import type { Boundary, Evidence, Overall, Relation, ReqResult, ReqSummary, Report, Requirement, ResultSet, TestCase, TestStatus, Unit } from './types.ts';
import { analyzeFile } from './analyze.ts';
import { changedFiles, changedLines, shortSha, showFile } from './git.ts';
import { parseJunit } from './tests.ts';
import { tokenize } from './tokens.ts';

const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
const TEST_FILE = /(\.test\.|\.spec\.|__tests__\/|\/tests?\/)/;

export function analyzeResult(opts: { key: 'A' | 'B'; repo: string; base: string; ref: string; junit?: string }): ResultSet {
  const { key, repo, base, ref } = opts;
  const lines = changedLines(repo, base, ref);
  const files: Record<string, string> = {};
  const analyses = [];
  for (const f of changedFiles(repo, base, ref)) {
    if (!CODE_EXT.test(f)) continue;
    const text = showFile(repo, ref, f);
    if (text === null) continue;
    files[f] = text;
    if (TEST_FILE.test(f)) continue;
    analyses.push(analyzeFile(f, text, lines.get(f) ?? null));
  }
  const tests: TestCase[] = opts.junit ? parseJunit(readFileSync(opts.junit, 'utf8')) : [];
  return {
    key,
    label: `결과 ${key}`,
    ref,
    sha: shortSha(repo, ref),
    files,
    analyses,
    units: analyses.flatMap((a) => a.units),
    dyn: analyses.flatMap((a) => a.dyn),
    tests,
    perReq: {},
  };
}

function scoreUnit(req: Requirement, u: Unit): { score: number; why: string[] } {
  const why: string[] = [];
  const set = new Set(req.tokens);
  const shared = [...new Set(u.tokens.filter((t) => set.has(t)))];
  let s = u.kind === 'function' ? Math.min(shared.length, 1.5) : shared.length;
  if (shared.length) why.push(`겹치는 단어: ${shared.join(', ')}`);
  if (u.cond && u.cond.lit !== undefined && req.numbers.some((n) => Math.abs(n - u.cond!.lit!) <= 1)) {
    s += 2;
    why.push(`숫자 ${u.cond.lit} (요구사항 ${req.numbers.join('·')})`);
  }
  if (req.guardCue && u.guard) {
    s += 1;
    why.push('거부 문장 ↔ 조건 뒤 throw/return');
  }
  if (u.changed) s += 0.5;
  return { score: s, why };
}

function findEvidence(req: Requirement, units: Unit[]): Evidence {
  let best: { u: Unit; score: number; why: string[] } | null = null;
  for (const u of units) {
    const { score, why } = scoreUnit(req, u);
    if (!best || score > best.score || (score === best.score && u.kind === 'condition' && best.u.kind === 'function')) best = { u, score, why };
  }
  if (!best || best.score < 1) return { unit: null, score: best?.score ?? 0, status: '미발견', why: [] };
  const status = best.score >= 2 ? '발견' : '일부 발견';
  const ev: Evidence = { unit: best.u, score: best.score, status, why: best.why };
  const c = best.u.cond;
  if (c && c.lit !== undefined && req.numbers.length) {
    const required = req.numbers.reduce((a, b) => (Math.abs(b - c.lit!) < Math.abs(a - c.lit!) ? b : a));
    if (Math.abs(required - c.lit) <= 1) {
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

function mapTests(req: Requirement, tests: TestCase[]): TestCase[] {
  const set = new Set([...req.tokens, ...req.numbers.map(String)]);
  return tests.filter((t) => new Set(tokenize(t.name).filter((x) => set.has(x))).size >= 2);
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

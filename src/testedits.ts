// 이번 변경에서 바뀐 검사를 찾는다: 기준 커밋의 검사 파일과 지금 검사 파일을 검사(it · test) 단위로 견준다.
// 에이전트가 실패하던 검사의 숫자를 바꾸거나(5 → 6), 확인 줄을 지우거나, 검사를 지우거나 건너뛰게 해서
// 「모두 통과」를 만든 경우를 근거 옆에 보이려고 쓴다. 판정 낱말은 바꾸지 않는다.
import ts from 'typescript';
import type { AddedTest, TestEdit } from './types.ts';

type Block = { title: string; full: string; line: number; text: string; skipped: boolean };

const TEST_FN = new Set(['it', 'test', 'specify']);
const SKIP_TEST_FN = new Set(['xit', 'xtest', 'xspecify']);
const SUITE_FN = new Set(['describe', 'suite', 'context']);
const SKIP_SUITE_FN = new Set(['xdescribe', 'xcontext']);
const SKIP_MOD = new Set(['skip', 'todo']);

/** it(...) · test.skip(...) · describe.only(...) 의 이름을 읽는다. 검사를 부르는 꼴이 아니면 null */
function callee(e: ts.Expression): { suite: boolean; skip: boolean } | null {
  if (ts.isIdentifier(e)) {
    const n = e.text;
    if (TEST_FN.has(n)) return { suite: false, skip: false };
    if (SKIP_TEST_FN.has(n)) return { suite: false, skip: true };
    if (SUITE_FN.has(n)) return { suite: true, skip: false };
    if (SKIP_SUITE_FN.has(n)) return { suite: true, skip: true };
    return null;
  }
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
    const base = callee(e.expression);
    if (!base) return null;
    return { suite: base.suite, skip: base.skip || SKIP_MOD.has(e.name.text) };
  }
  return null;
}

/** 파일 안의 검사들 (describe 이름까지 붙인 이름 · 줄 · 글) */
export function testBlocks(file: string, text: string): Block[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Block[] = [];
  const visit = (node: ts.Node, parents: string[], skipped: boolean) => {
    if (ts.isCallExpression(node)) {
      const c = callee(node.expression);
      const first = node.arguments[0];
      const title = first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
      if (c && title !== null) {
        // node:test 의 test('…', { skip: true }, fn) · { todo: '…' }
        const opt = node.arguments.find((a) => ts.isObjectLiteralExpression(a));
        const optSkip = !!opt && /\b(skip|todo)\s*:\s*(true|['"`])/.test(opt.getText(sf));
        const skip = skipped || c.skip || optSkip;
        if (c.suite) {
          for (const a of node.arguments.slice(1)) visit(a, [...parents, title], skip);
          return;
        }
        out.push({ title, full: [...parents, title].join(' '), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: node.getText(sf), skipped: skip });
        return;
      }
    }
    ts.forEachChild(node, (n) => visit(n, parents, skipped));
  };
  visit(sf, [], false);
  return out;
}

/** 확인 줄: expect(…) · assert(…) · assert.equal(…) · t.is(…) · should */
const CHECK = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\bt\.(?:is|not|ok|notOk|equal|deepEqual|strictEqual|notEqual|true|false|throws|rejects|like|match|same)\s*\(|\.should\b/g;
const checks = (s: string) => (s.match(CHECK) ?? []).length;

/** 값 자리: 숫자와 짧은 글자 */
const VALUE = /(['"`])(?:(?!\1)[^\\\n]|\\.){0,40}\1|\b\d+(?:[._]\d+)*\b/g;
const shape = (line: string) => line.replace(VALUE, '#');
const valuesOf = (line: string) => line.match(VALUE) ?? [];

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('//'));

/** 두 줄 목록의 최장 공통 부분을 빼고 남은 줄 (지운 줄 · 더한 줄) */
function lineDiff(a: string[], b: string[]): { removed: string[]; added: string[] } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

/** expect(…) 줄을 확인 대상(expect(…) 까지)과 확인 방법(.toBe(5))으로 나눈다. expect 줄이 아니면 null */
function splitExpect(line: string): { subject: string; matcher: string } | null {
  const i = line.search(/\bexpect\s*\(/);
  if (i < 0) return null;
  let depth = 0;
  for (let j = line.indexOf('(', i); j < line.length; j++) {
    if (line[j] === '(') depth++;
    else if (line[j] === ')' && --depth === 0) return { subject: line.slice(0, j + 1), matcher: line.slice(j + 1).replace(/;\s*$/, '').trim() };
  }
  return null;
}

/**
 * 견준 두 글에서 바뀐 값과 확인 방법을 뽑는다.
 * - 모양이 같은 줄 짝: 바뀐 숫자는 어디서든 (반복 횟수 · 금액), 글자는 기대값 자리에서만
 *   ('LOCKED' → 'BAD_LOGIN' 은 적고, expect(add(cart, 'fig')) → 'jam' 같은 준비 값은 적지 않는다)
 * - 확인 대상이 같은 expect 줄 짝: 확인 방법이 바뀐 것 (toBe(0) → toBeGreaterThanOrEqual(0), toThrow(…) → not.toThrow())
 */
function changedValues(before: string, after: string, numbersOnly = false): { from: string; to: string }[] {
  const { removed, added } = lineDiff(lines(before), lines(after));
  const out: { from: string; to: string }[] = [];
  const push = (from: string, to: string) => {
    if (from !== to && !out.some((p) => p.from === from && p.to === to)) out.push({ from, to });
  };
  const used = new Set<number>();
  const left: string[] = [];
  for (const r of removed) {
    const k = added.findIndex((a, idx) => !used.has(idx) && shape(a) === shape(r));
    if (k < 0) {
      left.push(r);
      continue;
    }
    used.add(k);
    const a = added[k];
    const er = splitExpect(r);
    const ea = splitExpect(a);
    // expect 줄: 확인 대상 안에서는 숫자만, 확인 방법(기대값) 안에서는 글자도
    const parts: [string, string, boolean][] = er && ea ? [[er.subject, ea.subject, false], [er.matcher, ea.matcher, true]] : [[r, a, checks(r) > 0]];
    for (const [x, y, strings] of parts) {
      const vx = valuesOf(x);
      const vy = valuesOf(y);
      for (let i = 0; i < vx.length; i++) {
        if (vx[i] === vy[i]) continue;
        if (!/^\d/.test(vx[i]) && (!strings || numbersOnly)) continue;
        push(vx[i], vy[i]);
      }
    }
  }
  if (!numbersOnly) {
    // 확인 대상은 그대로인데 확인 방법이 바뀐 expect 줄
    for (const r of left) {
      const er = splitExpect(r);
      if (!er) continue;
      const k = added.findIndex((a, idx) => !used.has(idx) && splitExpect(a)?.subject === er.subject);
      if (k < 0) continue;
      used.add(k);
      push(er.matcher.replace(/^\./, ''), splitExpect(added[k])!.matcher.replace(/^\./, ''));
    }
  }
  return out.slice(0, 4);
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z_$][\w$]*|\d+|[가-힣]+/g) ?? []);
function similar(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.max(1, x.size + y.size - both);
}

/**
 * 검사 파일 하나의 기준 커밋 글과 지금 글을 견준다. 새로 더한 검사는 적지 않는다(새 기능의 검사는 바뀐 것이 아니다).
 * before 가 null 이면 새 파일, after 가 null 이면 지운 파일.
 */
export function diffTestFile(file: string, before: string | null, after: string | null): TestEdit[] {
  if (before === null) return [];
  const old = safeBlocks(file, before);
  const now = after === null ? [] : safeBlocks(file, after);
  const out: TestEdit[] = [];
  const left = [...old];
  const fresh: Block[] = [];
  for (const b of now) {
    const i = left.findIndex((a) => a.full === b.full);
    if (i < 0) {
      fresh.push(b);
      continue;
    }
    const [a] = left.splice(i, 1);
    const e = compare(file, a, b);
    if (e) out.push(e);
  }
  // 이름이 바뀐 검사: 글이 가장 비슷한 것끼리 짝짓는다
  for (const b of fresh) {
    let best = -1;
    let score = 0.5;
    for (let i = 0; i < left.length; i++) {
      const s = similar(left[i].text, b.text);
      if (s > score) {
        score = s;
        best = i;
      }
    }
    if (best < 0) continue;
    const [a] = left.splice(best, 1);
    const e = compare(file, a, b);
    if (e) out.push(e);
  }
  for (const a of left) out.push({ file, line: a.line, title: a.title, full: a.full, kind: 'removed', values: [], fewerChecks: checks(a.text) });
  return out;
}

function compare(file: string, a: Block, b: Block): TestEdit | null {
  if (a.text === b.text && a.skipped === b.skipped) return null;
  const base = { file, line: b.line, title: b.title, full: b.full, ...(a.full !== b.full ? { was: a.full } : {}) };
  if (b.skipped && !a.skipped) return { ...base, kind: 'skipped', values: [], fewerChecks: checks(a.text) };
  // 줄 바꿈 · 들여쓰기만 바뀐 것은 적지 않는다
  if (lines(a.text).join('\n') === lines(b.text).join('\n')) return null;
  return { ...base, kind: 'changed', values: changedValues(a.text, b.text), fewerChecks: Math.max(0, checks(a.text) - checks(b.text)) };
}

/** 가져오는 파일 경로 (./x · ../y) 를 저장소 경로로 푼다. 확장자는 붙여 본다 */
function importsOf(file: string, text: string, known: Set<string>): string[] {
  const dir = file.split('/').slice(0, -1);
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const parts = [...dir];
    for (const seg of m[1].split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    const base = parts.join('/').replace(/\.(js|mjs|cjs|jsx)$/, '');
    for (const ext of ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.js']) {
      if (known.has(base + ext)) {
        out.push(base + ext);
        break;
      }
    }
  }
  return out;
}

/**
 * 검사 쪽 파일 여럿을 한꺼번에 견준다. 검사(it · test)가 없는 도우미 · 준비 파일에서 숫자가 바뀌었으면
 * 그 파일을 가져오는 검사들에 「이 도우미가 바뀜」으로 붙인다 (LIMIT = 3 → 4).
 * others: 바뀌지 않은 검사 파일들 (도우미가 바뀌었을 때만 부른다)
 */
export function diffTestFiles(changed: { file: string; before: string | null; after: string | null }[], others: () => { file: string; text: string }[] = () => []): TestEdit[] {
  const out: TestEdit[] = [];
  const helpers = new Map<string, { from: string; to: string }[]>();
  for (const c of changed) {
    const edits = diffTestFile(c.file, c.before, c.after);
    out.push(...edits);
    if (c.before === null || c.after === null || c.before === c.after) continue;
    if (safeBlocks(c.file, c.before).length || safeBlocks(c.file, c.after).length) continue;
    const values = changedValues(c.before, c.after, true);
    if (values.length) helpers.set(c.file, values);
  }
  if (!helpers.size) return out;
  const known = new Set(helpers.keys());
  const texts = [...changed.filter((c) => c.after !== null).map((c) => ({ file: c.file, text: c.after as string })), ...others()];
  const seen = new Set<string>();
  for (const { file, text } of texts) {
    if (seen.has(file) || helpers.has(file)) continue;
    seen.add(file);
    const via = importsOf(file, text, known);
    if (!via.length) continue;
    for (const b of safeBlocks(file, text)) {
      if (out.some((e) => e.file === file && e.full === b.full)) continue;
      out.push({ file, line: b.line, title: b.title, full: b.full, kind: 'changed', values: via.flatMap((h) => helpers.get(h) ?? []).slice(0, 4), fewerChecks: 0, via: via[0] });
    }
  }
  return out;
}

/**
 * 이번 변경에서 새로 더한 검사: 기준 커밋의 같은 파일에 같은 이름(describe 포함)이 없는 것. 건너뛴 검사는 뺀다.
 * 새 검사 파일이면 그 안의 검사 모두. 판정에서 「이 PR 이 더한 검사」를 그 PR 의 요구사항에 이을 때 쓴다 (0.26.0, 실제 PR 시험).
 */
export function addedTests(changed: { file: string; before: string | null; after: string | null }[]): AddedTest[] {
  const out: AddedTest[] = [];
  for (const c of changed) {
    if (c.after === null) continue;
    const had = new Set((c.before === null ? [] : safeBlocks(c.file, c.before)).map((b) => b.full));
    const imports = [...c.after.matchAll(/(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*['"](\.{1,2}(?:\/[^'"]*)?)['"]/g)].map((m) => m[1]);
    for (const b of safeBlocks(c.file, c.after)) if (!b.skipped && !had.has(b.full)) out.push({ file: c.file, full: b.full, title: b.title, imports });
  }
  return out;
}

function safeBlocks(file: string, text: string): Block[] {
  try {
    return testBlocks(file, text);
  } catch {
    return [];
  }
}

/** 판단을 흔들 수 있는 변경: 지움 · 건너뜀 · 값이 바뀜 · 확인 줄이 줄어듦. (모양만 바뀐 것은 아니다) */
export const suspicious = (e: TestEdit) => e.kind !== 'changed' || e.values.length > 0 || e.fewerChecks > 0;

/** 「이번 변경에서 검사가 바뀜: 5 → 6 · 확인 줄 1개 줄어듦」 */
export function editText(e: TestEdit, lang: 'ko' | 'en'): string {
  const ko = lang === 'ko';
  const vals = e.values.map((v) => `${v.from} → ${v.to}`).join(', ');
  const fewer = e.fewerChecks > 0 ? (ko ? `확인 줄 ${e.fewerChecks}개 줄어듦` : `${e.fewerChecks} fewer check${e.fewerChecks > 1 ? 's' : ''}`) : '';
  if (e.kind === 'removed') return ko ? '이번 변경에서 검사를 지움' : 'test removed in this change';
  if (e.kind === 'skipped') return ko ? '이번 변경에서 검사를 건너뛰게 함' : 'test skipped in this change';
  const what = [vals, fewer].filter(Boolean).join(' · ');
  const via = e.via ? (ko ? ` (${e.via.split('/').pop()} 에서)` : ` (in ${e.via.split('/').pop()})`) : '';
  return ko ? `이번 변경에서 검사가 바뀜${via}${what ? `: ${what}` : ''}` : `test changed in this change${via}${what ? `: ${what}` : ''}`;
}

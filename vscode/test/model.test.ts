import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../src/model.ts';
import { parseRequirements } from '../../src/requirements.ts';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = (node: string | null) =>
  M.runDemo({
    sampleDir: join(ext, 'samples', 'login-lockout'),
    node,
    fallbackJunit: { a: join(ext, 'samples', 'junit', 'junit-a.xml'), b: join(ext, 'samples', 'junit', 'junit-b.xml') },
  });
const existsDir = (p: string) => statSync(p).isDirectory();
const status = (r: M.Run) => Object.fromEntries(r.report.summaries.map((s) => [s.req.id, s.overall]));

test('demo with real test run: R1 verified, R2 different, R3 not verified', () => {
  const r = demo(process.execPath);
  assert.deepEqual(status(r), { R1: '확인됨', R2: '다름', R3: '미확인' });
  assert.equal(r.notes.length, 0);
});

test('demo without Node uses bundled JUnit and gives the same result', () => {
  const r = demo(null);
  assert.deepEqual(status(r), { R1: '확인됨', R2: '다름', R3: '미확인' });
  assert.match(r.notes[0], /미리 만들어 둔/);
  const b = r.report.sets.find((s) => s.key === 'B')!;
  assert.equal(b.perReq.R2.testStatus, '실패');
});

test('lens on result B marks the > 5 line as 6th attempt', () => {
  const r = demo(null);
  const lenses = M.lensesFor(r.report, 'B', 'src/auth.ts');
  const r2 = lenses.find((l) => l.reqId === 'R2')!;
  assert.ok(r2, 'R2 lens exists');
  assert.equal(r2.overall, '다름');
  assert.match(r2.title, /6번째 시도에 동작 \(요구사항 5회\)/);
  assert.match(r2.title, /검사 실패/);
  assert.deepEqual(M.lensesFor(r.report, 'B', 'nope.ts'), []);
  assert.deepEqual(M.lensesFor(r.report, 'Z', 'src/auth.ts'), []);
});

test('tree model has one row per requirement with A and B children', () => {
  const r = demo(null);
  const rows = M.treeModel(r.report);
  assert.equal(rows.length, 3);
  const r2 = rows.find((x) => x.id === 'R2')!;
  assert.equal(r2.children.length, 2);
  assert.match(r2.summary, /결과 B: 6번째 시도에 동작/);
  assert.ok(r2.children.every((c) => c.file === 'src/auth.ts' && typeof c.line === 'number'));
  assert.equal(r2.children[1].label, 'B  auth.ts:21');
  assert.equal(r2.children[1].detail, '6번째 동작 · 검사 실패');
  assert.match(r2.children[1].tooltip, /결과 B \(feature\/lockout-b\) · src\/auth.ts:21 · 검사 실패 · 6번째 시도에 동작 \(요구사항 5회\)/);
  for (const row of rows) for (const c of row.children) assert.ok(c.label.length + c.detail.length <= 32, `short enough: ${c.label} ${c.detail}`);
  assert.match(M.statusText(r.report), /확인됨 1 · 다름 1 · 실패 0 · 미확인 1/);
});

test('webview html: every script has the nonce, CSP is set, interview bar hidden', () => {
  const r = demo(null);
  const html = M.webviewHtml(r.report, 'NONCE123', 'vscode-resource:');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-NONCE123'/);
  const scripts = html.match(/<script[^>]*>/g)!;
  assert.ok(scripts.length >= 3);
  for (const s of scripts) assert.match(s, /nonce="NONCE123"/);
  assert.match(html, /acquireVsCodeApi/);
  assert.match(html, /\.bar\{display:none!important\}/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'no external URLs');
});

test('single-branch check in a real repo marks the working branch', () => {
  const env = demo(null);
  const repo = env.repo;
  execFileSync('git', ['-C', repo, 'checkout', '-q', 'feature/lockout-b']);
  const reqFile = join(ext, 'samples', 'login-lockout', 'requirements.md');
  const r = M.runRepo({ repo, base: 'main', a: 'feature/lockout-b', reqFile, workingRef: 'feature/lockout-b' });
  assert.equal(r.report.sets.length, 1);
  assert.equal(r.workingRef, 'feature/lockout-b');
  assert.equal(r.report.summaries.find((s) => s.req.id === 'R2')!.overall, '다름');
  assert.ok(r.notes.some((n) => /미실행/.test(n)));
  assert.equal(M.currentBranch(repo), 'feature/lockout-b');
  assert.deepEqual(M.orderBases(M.localBranches(repo), 'feature/lockout-b')[0], 'main');
  assert.throws(() => M.runRepo({ repo, base: 'nope', a: 'feature/lockout-b', reqFile }), /기준 브랜치 「nope」/);
});

test('requirements template parses to two requirements', () => {
  const reqs = parseRequirements(M.REQ_TEMPLATE);
  assert.deepEqual(reqs.map((r) => r.id), ['R1', 'R2']);
  assert.deepEqual(reqs[1].numbers, [5]);
});

test('node version check', () => {
  assert.equal(M.nodeSupportsTs(process.execPath), true);
  assert.equal(M.nodeSupportsTs('definitely-not-a-node-binary'), false);
});

test('lens gives a head for above the line, a note for the end of the line, and a per-result severity', () => {
  const r = demo(null);
  const a = M.lensesFor(r.report, 'A', 'src/auth.ts').find((l) => l.reqId === 'R2')!;
  const b = M.lensesFor(r.report, 'B', 'src/auth.ts').find((l) => l.reqId === 'R2')!;
  assert.equal(b.head, 'R2 · 다름');
  assert.equal(b.note, '6번째 시도에 동작 (요구사항 5회) · 검사 실패 · A와 조건 다름');
  assert.equal(b.severity, 'warn');
  assert.equal(a.note, '5번째 시도에 동작 · 검사 통과 · B와 조건 다름');
  assert.equal(a.severity, 'info', 'A itself is right, so it is not a warning');
  const all = M.allLenses(r.report);
  assert.equal(all.find((l) => l.reqId === 'R1')!.severity, 'ok');
  assert.equal(all.find((l) => l.reqId === 'R3')!.severity, 'info');
  assert.equal(M.attentionCount(r.report), 2);
  assert.equal(M.statusIcons(r.report), '$(search) VerifyLens  $(pass) 1  $(diff) 1  $(question) 1');
  assert.equal(M.contextLine(r), '샘플 · 결과 A ↔ 결과 B (기준 main)');
});

test('hover shows the evidence table, the failing test and command links', () => {
  const r = demo(null);
  const md = M.hoverMarkdown(r.report, 'R2')!;
  assert.match(md, /\*\*VerifyLens · R2 · 다름\*\*/);
  assert.match(md, /\| A \| `auth\.ts:17` `user\.failures >= 5` \| 5번째 \| 통과 \|/);
  assert.match(md, /\| B \| `auth\.ts:21` `user\.failures > 5` \| 6번째 ⚠ \(요구 5회\) \| 실패 \|/);
  assert.match(md, /실패한 검사\n- B · `locks the account on the 5th consecutive failure` — Expected values to be strictly equal/);
  assert.match(md, /\[A ↔ B 비교\]\(command:verifylens\.openDiff\?%5B%22R2%22%5D\)/);
  assert.match(md, /\[판단 기록\]\(command:verifylens\.recordJudgment\?/);
  assert.ok(!/command:/.test(M.hoverMarkdown(r.report, 'R2', false)!), 'no links for the list tooltip');
  assert.equal(M.hoverMarkdown(r.report, 'R9'), null);
});

test('diff target: A vs B with two results, base vs branch with one', () => {
  const r = demo(null);
  const t = M.diffTarget(r.report, 'R2')!;
  assert.deepEqual([t.left.key, t.left.line, t.right.key, t.right.line], ['A', 17, 'B', 21]);
  assert.equal(t.title, 'R2 · A ↔ B · auth.ts');
  const reqFile = join(ext, 'samples', 'login-lockout', 'requirements.md');
  const one = M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-b', reqFile });
  const t1 = M.diffTarget(one.report, 'R2')!;
  assert.deepEqual([t1.left.key, t1.left.ref, t1.right.key, t1.right.ref], ['base', 'main', 'A', 'feature/lockout-b']);
  assert.equal(M.contextLine(one), 'feature/lockout-b ← main');
});

test('signature changes on a commit and when an input file changes', async () => {
  const r = demo(null);
  const { writeFileSync, readFileSync } = await import('node:fs');
  const junit = join(r.repo, 'junit.xml');
  const spec = { repo: r.repo, refs: ['main', 'feature/lockout-b'], files: [junit] };
  const s0 = M.signature(spec);
  assert.equal(M.signature(spec), s0, 'stable');
  writeFileSync(junit, '<testsuites/>');
  const s1 = M.signature(spec);
  assert.notEqual(s1, s0, 'new report file');
  execFileSync('git', ['-C', r.repo, 'checkout', '-q', 'feature/lockout-b']);
  const f = join(r.repo, 'src', 'auth.ts');
  writeFileSync(f, readFileSync(f, 'utf8').replace('user.failures > 5', 'user.failures >= 5'));
  execFileSync('git', ['-C', r.repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-am', 'fix']);
  assert.notEqual(M.signature(spec), s1, 'new commit');
  assert.ok(existsDir(M.gitDir(r.repo)));
});

test('webview html carries judgments and focus, and offers side-by-side', () => {
  const r = demo(null);
  const html = M.webviewHtml(r.report, 'N', 'vscode-resource:', { judgments: { R2: { judge: '수정', note: '</script><b>x' } }, focus: 'R3' });
  assert.match(html, /"R2":\{"judge":"수정"/);
  assert.match(html, /"focus":"R3"/);
  assert.ok(!html.includes('</script><b>x'), 'note cannot break out of the script');
  assert.match(html, /A ↔ B 나란히 비교/);
  assert.match(html, /body\.vscode-dark\{background:var\(--vscode-editor-background\)\}/);
  for (const s of html.match(/<script[^>]*>/g)!) assert.match(s, /nonce="N"/);
});

test('differentiators up front: verified ratio, reason for 미확인, attempt strip', () => {
  const r = demo(null);
  assert.equal(M.verifiedLine(r.report), '요구사항 3개 중 1개만 근거와 검사로 확인됨');
  assert.equal(M.verifiedLine(r.report, 'en'), '1 of 3 requirements verified by evidence and tests');
  assert.match(M.demoHeadline(r.report), /「요구사항 전부 반영, 완료」.*3개 중 1개/);
  const rows = M.treeModel(r.report);
  assert.deepEqual(rows.map((x) => x.reason), ['', '', '검사 없음']);
  assert.deepEqual(M.attemptLines(r.report, 'R2'), [
    '요구사항   1  2  3  4 [5] 6',
    '결과 A     1  2  3  4 [5] 6   ✓ 요구사항과 같음',
    '결과 B     1  2  3  4  5 [6]  ✗ 1회 늦음',
  ]);
  assert.deepEqual(M.attemptLines(r.report, 'R1'), [], 'nothing to compute for R1');
  const md = M.hoverMarkdown(r.report, 'R2')!;
  assert.match(md, /결과 B     1  2  3  4  5 \[6\]  ✗ 1회 늦음/);
  assert.match(md, /AI 추정 없음/);
  const html = M.webviewHtml(r.report, 'N', 'x', { demo: true });
  assert.match(html, /"line":"요구사항 3개 중 1개만 근거와 검사로 확인됨"/);
  assert.match(html, /"need":"다름 1 · 미확인 1"/);
  assert.match(html, /AI는 두 결과 모두 「요구사항 전부 반영, 완료」라고 답했습니다/);
  assert.match(html, /PR 요약 복사/);
});

test('PR summary: one table a reviewer can trust without redoing the check', () => {
  const r = demo(null);
  const ko = M.prSummary(r, { R2: { judge: '수정', note: 'a | b' } }, { lang: 'ko', version: '9.9.9' });
  const lines = ko.split('\n');
  assert.equal(lines[0], '## VerifyLens 검증 요약');
  assert.equal(lines[2], '**요구사항 3개 중 1개만 근거와 검사로 확인됨**');
  assert.match(lines[4], /^_AI가 쓴 의견이 아닙니다\./);
  assert.match(ko, /샘플\(가상 사례\) · A `feature\/lockout-a` \(`[0-9a-f]{7}`\) ↔ B `feature\/lockout-b` \(`[0-9a-f]{7}`\) · 기준 `main`/);
  assert.match(ko, /\| \*\*R2\*\* 연속 5회 실패하면 계정을 잠근다 \| ⚠️ 다름 \| A `src\/auth\.ts:17` `user\.failures >= 5` → 5번째 시도에 동작<br>B `src\/auth\.ts:21` `user\.failures > 5` → 6번째 시도에 동작 \(요구사항 5회\) \| A 통과<br>B 실패 \| \*\*수정\*\* — a \\\| b \|/);
  assert.match(ko, /\| \*\*R1\*\* [^|]+ \| ✅ 확인됨 \|[^|]+\|[^|]+\| — \|/);
  assert.match(ko, /\| \*\*R3\*\* [^|]+ \| ❔ 미확인 \|[^|]+\|[^|]+\| 미검토 \|/);
  assert.match(ko, /\*\*동작 시점 \(조건 값에서 계산, \[n\] = 동작하는 시도\)\*\*\n```\nR2\n요구사항 /);
  assert.match(ko, /\*\*실패한 검사\*\*\n- R2 · B · `locks the account on the 5th consecutive failure` — Expected values/);
  assert.match(ko, /\*\*확인되지 않은 것 \(통과로 치지 않음\)\*\*\n- R3: 연결된 검사가 실행되지 않음 \(A, B\)/);
  assert.match(ko, /해석하지 못한 호출 \(B\): `src\/auth\.ts:31`/);
  assert.match(ko, /<sub>VerifyLens 9\.9\.9 · 정적 분석과 실행된 검사 결과만 사용 \(AI 추정 없음\)/);
  // every table row has the same number of unescaped cell separators
  const rows = lines.filter((l) => l.startsWith('| '));
  for (const row of rows) assert.equal(row.replace(/\\\|/g, '').split('|').length, 7, row);
  assert.equal(M.pendingDecisions(r.report, { R2: { judge: '수정', note: '' } }), 1, 'R3 still has no decision');
  assert.equal(M.pendingDecisions(r.report, {}), 2);

  const reqFile = join(ext, 'samples', 'login-lockout', 'requirements.md');
  const one = M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-b', reqFile, junitA: join(ext, 'samples', 'junit', 'junit-b.xml') });
  const en = M.prSummary(one, {}, { lang: 'en' });
  assert.match(en, /^## VerifyLens verification summary\n\n\*\*1 of 3 requirements verified by evidence and tests\*\*/);
  assert.match(en, /`feature\/lockout-b` \(`[0-9a-f]{7}`\) ← `main`/);
  assert.match(en, /⚠️ Different \| `src\/auth\.ts:21` `user\.failures > 5` → acts on attempt 6 \(requirement: 5\) \| Failed \| Not reviewed \|/);
  assert.match(en, /code       1  2  3  4  5 \[6\]  ✗ 1 late/);
  assert.match(en, /- R3: no linked test was run\n/);
  assert.ok(!/[가-힣]/.test(en.replace(/\| \*\*R\d\*\* [^|]+\|/g, '')), 'English summary has no Korean outside the requirement text');
});

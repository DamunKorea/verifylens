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
  // 결과 B 는 AI 가 같은 오해로 쓴 테스트를 갖고 있어서 테스트는 통과한다. 그래도 조건 값 계산으로 「다름」이다.
  assert.equal(b.perReq.R2.testStatus, '통과');
  assert.equal(b.perReq.R2.evidence.boundary!.ok, false);
  assert.ok(M.passButOff(b.perReq.R2));
  assert.ok(r.report.sets.every((s) => s.tests.every((t) => t.status === 'pass')), 'every test in the sample passes');
});

test('lens on result B marks the > 5 line as 6th attempt', () => {
  const r = demo(null);
  const lenses = M.lensesFor(r.report, 'B', 'src/auth.ts');
  const r2 = lenses.find((l) => l.reqId === 'R2')!;
  assert.ok(r2, 'R2 lens exists');
  assert.equal(r2.overall, '다름');
  assert.match(r2.title, /6번째 시도에 동작 \(요구사항 5회\)/);
  assert.match(r2.title, /검사는 통과/);
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
  assert.equal(r2.children[1].detail, '6번째 동작 · 검사는 통과');
  assert.match(r2.children[1].tooltip, /결과 B \(feature\/lockout-b\) · src\/auth.ts:21 · 검사는 통과 · 6번째 시도에 동작 \(요구사항 5회\) — 검사는 통과했지만/);
  assert.equal(r2.summary, '결과 B: 6번째 시도에 동작 (요구사항 5회) — 검사는 통과');
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
  assert.equal(b.note, '6번째 시도에 동작 (요구사항 5회) · 검사는 통과 · A와 조건 다름');
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

test('hover shows the evidence table, the passing-but-different warning and command links', () => {
  const r = demo(null);
  const md = M.hoverMarkdown(r.report, 'R2')!;
  assert.match(md, /^\*\*VerifyLens · R2 · 다름\*\* — 연속 5회 실패하면 계정을 잠근다\n/);
  assert.ok(md.indexOf('  1  2  3  4  5 [6]') < md.indexOf('| 결과 | 근거 |'), 'the computed strip comes before the table so it is not cut off');
  assert.match(md, /\| A \| `auth\.ts:17` `user\.failures >= 5` \| 5번째 \| 통과 \|/);
  assert.match(md, /\| B \| `auth\.ts:21` `user\.failures > 5` \| 6번째 ⚠ \(요구 5회\) \| 통과 \|/);
  assert.match(md, /⚠ 결과 B: 검사는 통과했지만, 조건 값에서 계산한 동작 시점이 요구사항과 다릅니다\./);
  assert.ok(!/실패한 검사/.test(md), 'nothing failed in the sample');
  // 검사가 실패하는 경우: 같은 코드에 요구사항대로 쓴 검사 결과(5번째에 잠기는지 보는 검사)를 붙이면 실패 이유가 나온다
  const failing = M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-b', reqFile: join(ext, 'samples', 'login-lockout', 'requirements.md'), junitA: join(ext, 'test', 'fixtures', 'vitest-junit.xml') });
  const fmd = M.hoverMarkdown(failing.report, 'R2')!;
  assert.match(fmd, /\| `auth\.ts:21` `user\.failures > 5` \| 6번째 ⚠ \(요구 5회\) \| 실패 \|/);
  assert.match(fmd, /실패한 검사\n- `[^`]*locks the account on the 5th consecutive failure` — /);
  assert.ok(!/검사는 통과했지만/.test(fmd));
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
  // 브랜치 하나만 볼 때는 「결과 A」라고 하지 않는다
  const row = M.treeModel(one.report).find((x) => x.id === 'R2')!;
  assert.equal(row.children[0].label, 'auth.ts:21');
  assert.equal(row.summary, '6번째 시도에 동작 (요구사항 5회)');
  const h1 = M.hoverMarkdown(one.report, 'R2')!;
  assert.match(h1, /\| 근거 \| 동작 시점 \| 검사 \|\n\|---\|---\|---\|\n\| `auth\.ts:21` `user\.failures > 5` \| 6번째 ⚠ \(요구 5회\) \|/);
  assert.match(h1, /코드\s+1  2  3  4  5 \[6\]  ✗ 1회 늦음/);
  assert.ok(!/결과 A/.test(h1));
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
  assert.match(M.demoHeadline(r.report), /「요구사항 전부 반영, 완료」라고 답했고, 테스트도 전부 통과했습니다\. 그런데 .*3개 중 1개/);
  const rows = M.treeModel(r.report);
  assert.deepEqual(rows.map((x) => x.reason), ['', '', '검사 없음']);
  assert.deepEqual(M.attemptLines(r.report, 'R2'), [
    '요구사항     1  2  3  4 [5] 6',
    '결과 A　　   1  2  3  4 [5] 6   ✓ 요구사항과 같음',
    '결과 B　　   1  2  3  4  5 [6]  ✗ 1회 늦음',
  ]);
  assert.deepEqual(M.attemptLines(r.report, 'R1'), [], 'nothing to compute for R1');
  const md = M.hoverMarkdown(r.report, 'R2')!;
  assert.match(md, /결과 B\s+1  2  3  4  5 \[6\]  ✗ 1회 늦음/);
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
  assert.match(ko, /\| \*\*R2\*\* 연속 5회 실패하면 계정을 잠근다 \| ⚠️ 다름 \| A `src\/auth\.ts:17` `user\.failures >= 5` → 5번째 시도에 동작<br>B `src\/auth\.ts:21` `user\.failures > 5` → 6번째 시도에 동작 \(요구사항 5회\) \| A 통과<br>B 통과 \| \*\*수정\*\* — a \\\| b \|/);
  assert.match(ko, /\| \*\*R1\*\* [^|]+ \| ✅ 확인됨 \|[^|]+\|[^|]+\| — \|/);
  assert.match(ko, /\| \*\*R3\*\* [^|]+ \| ❔ 미확인 \|[^|]+\|[^|]+\| 미검토 \|/);
  assert.match(ko, /\*\*동작 시점 \(조건 값에서 계산, \[n\] = 동작하는 시도\)\*\*\n```\nR2\n요구사항 /);
  assert.match(ko, /\*\*검사는 통과했지만 계산과 다른 것\*\*\n- R2 · B: 검사가 통과했지만, 조건 값에서 계산한 동작 시점이 요구사항과 다름/);
  assert.ok(!/실패한 검사/.test(ko), 'nothing failed in the sample');
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
  assert.match(en, /⚠️ Different \| `src\/auth\.ts:21` `user\.failures > 5` → acts on attempt 6 \(requirement: 5\) \| Passed \| Not reviewed \|/);
  assert.match(en, /\*\*Tests pass, but the computed behavior differs\*\*\n- R2: the linked test passes, but the attempt computed from the condition differs/);
  // a failing test is still listed with its reason
  const failingRun = M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-b', reqFile, junitA: join(ext, 'test', 'fixtures', 'vitest-junit.xml') });
  const enFail = M.prSummary(failingRun, {}, { lang: 'en' });
  assert.match(enFail, /acts on attempt 6 \(requirement: 5\) \| Failed \| Not reviewed \|/);
  assert.match(enFail, /\*\*Failed tests\*\*\n- R2 · `[^`]*locks the account on the 5th consecutive failure`/);
  assert.match(en, /code       1  2  3  4  5 \[6\]  ✗ 1 late/);
  assert.match(en, /- R3: no linked test was run\n/);
  assert.ok(!/[가-힣]/.test(en.replace(/\| \*\*R\d\*\* [^|]+\|/g, '')), 'English summary has no Korean outside the requirement text');
});

// ---------------------------------------------------------------- 0.4.0: 키워드 없이 연결 · 요구사항 가져오기
import { mkdtempSync, writeFileSync as writeFile } from 'node:fs';
import { tmpdir } from 'node:os';
import { extractRequirements } from '../../src/requirements.ts';

function verdicts(r: M.Run, md: string) {
  const dir = mkdtempSync(join(tmpdir(), 'vl-req-'));
  const reqFile = join(dir, 'requirements.md');
  writeFile(reqFile, md);
  const a = join(ext, 'samples', 'junit', 'junit-a.xml');
  const b = join(ext, 'samples', 'junit', 'junit-b.xml');
  const run = M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-a', b: 'feature/lockout-b', reqFile, junitA: a, junitB: b });
  return run;
}

test('no keywords needed: Korean and English requirements link to code by the glossary', () => {
  const r = demo(null);
  for (const md of [
    '- R1: 올바른 비밀번호로 로그인할 수 있다\n- R2: 연속 5회 실패하면 계정을 잠근다\n- R3: 잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다\n',
    '- R1: Users can log in with the right password\n- R2: Lock the account after 5 consecutive failures\n- R3: A locked account cannot log in even with the right password\n',
    '- R1: 비밀번호가 맞으면 로그인에 성공해야 한다\n- R2: 로그인을 5번 연속으로 틀리면 계정이 잠겨야 한다\n- R3: 잠긴 계정의 로그인 시도는 거부해야 한다\n',
  ]) {
    const run = verdicts(r, md);
    assert.deepEqual(status(run), { R1: '확인됨', R2: '다름', R3: '미확인' }, md);
    const b = run.report.sets[1];
    assert.equal(b.perReq.R2.evidence.unit!.cond!.expr, 'user.failures > 5', 'the deciding condition, not its enclosing block');
    assert.equal(b.perReq.R2.evidence.boundary!.attempts, 6);
    assert.ok(run.report.reqs.every((q) => q.auto));
  }
});

test('automatic linking never turns a missing test into "verified"', () => {
  const r = demo(null);
  // R3 은 R1(로그인 · 비밀번호)과 R2(계정 · 잠금)의 낱말을 모두 담고 있어, 느슨하게 이으면 남의 검사가 붙는다.
  const run = verdicts(r, '- R1: 잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다\n- R2: 계정을 삭제할 수 있다\n');
  for (const set of run.report.sets) {
    assert.deepEqual(set.perReq.R1.tests, [], `${set.key}: no test claims to cover the locked-login rule`);
    assert.equal(set.perReq.R1.testStatus, '미실행');
  }
  assert.equal(status(run).R1, '미확인');
  assert.equal(status(run).R2, '미확인', 'a requirement with no code at all stays unverified');
  assert.match(M.hoverMarkdown(run.report, 'R1')!, /용어집으로 코드와 이었습니다\. 근거 줄이 맞는지 확인하세요/);
  assert.match(M.prSummary(run), /<sub>R1, R2: 키워드 없이 용어집으로 코드와 연결함 — 근거 줄은 작성자가 확인<br>VerifyLens/);
});

test('requirements are extracted from issue and PR text by rules', () => {
  assert.deepEqual(
    extractRequirements('## 배경\n무차별 대입을 막아야 합니다.\n\n## 요구사항\n- [ ] 연속 5회 실패하면 계정을 잠근다\n- [x] 잠긴 계정은 **로그인되지 않는다**.\n\n## 참고\n- 디자인: https://example.com/x\n- 스키마 변경 없음\n'),
    ['연속 5회 실패하면 계정을 잠근다', '잠긴 계정은 로그인되지 않는다'],
    'the section named 요구사항 wins over other lists',
  );
  assert.deepEqual(
    extractRequirements('<!-- template -->\n### Acceptance criteria\n1. Lock the account after 5 consecutive failures.\n2. A locked account cannot [log in](https://x.y).\n\n### Tasks\n- [ ] add tests\n```\n- not a requirement\n```\n'),
    ['Lock the account after 5 consecutive failures', 'A locked account cannot log in'],
  );
  assert.deepEqual(extractRequirements('로그인에 연속으로 5회 실패하면 계정을 잠가야 한다. 잠긴 계정은 로그인되지 않게 한다. 배경 설명입니다.'), ['로그인에 연속으로 5회 실패하면 계정을 잠가야 한다', '잠긴 계정은 로그인되지 않게 한다']);
  assert.deepEqual(extractRequirements('그냥 메모입니다.\nhttps://example.com'), []);
});

test('import from GitHub: linked issues first, then the PR, with readable errors', () => {
  const calls: string[][] = [];
  const run: M.GhRun = (args) => {
    calls.push(args);
    if (args[0] === 'pr') return JSON.stringify({ number: 7, title: 'Add lockout', url: 'https://github.com/o/r/pull/7', body: '- [ ] 연속 5회 실패하면 계정을 잠근다\n- [ ] 감사 로그를 남긴다\n', closingIssuesReferences: [{ number: 3, url: 'https://github.com/o/r/issues/3' }, { number: 4, url: 'https://github.com/o/r/issues/4' }] });
    if (args[2].endsWith('/4')) throw Object.assign(new Error('gh'), { stderr: 'GraphQL: Could not resolve to an Issue' });
    return JSON.stringify({ number: 3, title: 'Lockout', url: 'https://github.com/o/r/issues/3', body: '## Acceptance criteria\n- 연속 5회 실패하면 계정을 잠근다\n- 잠긴 계정은 로그인되지 않는다\n' });
  };
  const texts = M.fetchPr(run);
  assert.deepEqual(texts.map((t) => t.label), ['이슈 #3', 'PR #7'], 'the unreadable issue #4 is skipped');
  assert.deepEqual(calls[0], ['pr', 'view', '--json', 'number,title,body,url,closingIssuesReferences']);
  assert.deepEqual(calls[1], ['issue', 'view', 'https://github.com/o/r/issues/3', '--json', 'number,title,body,url']);
  const got = M.requirementsFrom(texts);
  assert.deepEqual(got.requirements, ['연속 5회 실패하면 계정을 잠근다', '잠긴 계정은 로그인되지 않는다', '감사 로그를 남긴다'], 'the duplicate from the PR body is dropped');
  assert.deepEqual(got.sources, ['이슈 #3', 'PR #7']);
  M.fetchIssue((args) => (assert.equal(args[2], '12'), JSON.stringify({ number: 12, body: '' })), ' #12 ');
  // 본문이 줄글뿐이면 제목을 후보로 쓴다
  const prose = M.requirementsFrom([
    { label: '이슈 #9', url: '', title: 'fix(auth): Lock the account after 5 failed logins (fixes #7771)', body: 'Fetches things. Background only.' },
    { label: '복사한 글', url: '', title: '', body: '회의록입니다.' },
  ]);
  assert.deepEqual(prose, { requirements: ['Lock the account after 5 failed logins'], sources: ['이슈 #9 제목'] });

  assert.match(M.ghError(Object.assign(new Error('x'), { code: 'ENOENT' })), /gh\)를 찾지 못했습니다/);
  assert.match(M.ghError({ stderr: 'no pull requests found for branch "feature/x"' }), /PR을 찾지 못했습니다/);
  assert.match(M.ghError({ stderr: 'To get started with GitHub CLI, please run:  gh auth login' }), /gh auth login/);
  assert.match(M.ghError({ stderr: 'GraphQL: Could not resolve to an Issue with the number of 99.' }), /찾지 못했습니다/);
  assert.equal(M.ghError({ stderr: '\nsomething odd\nmore' }), 'something odd');
});

test('requirements file: replace writes a draft, append continues the numbering and skips duplicates', () => {
  const fresh = M.mergeRequirementsFile(null, ['가', '나'], '이슈 #3', 'replace');
  assert.equal(fresh.added, 2);
  assert.match(fresh.text, /^# 요구사항 초안 — 이슈 #3에서 가져옴\./);
  assert.deepEqual(parseRequirements(fresh.text).map((q) => `${q.id}:${q.text}`), ['R1:가', 'R2:나']);
  const old = '# mine\n- R1: 가\n- R4: 라 | keywords: x\n';
  const more = M.mergeRequirementsFile(old, ['가', '다'], 'PR #7', 'append');
  assert.equal(more.added, 1);
  assert.ok(more.text.startsWith(old), 'existing lines are kept as they are');
  assert.match(more.text, /# ↓ PR #7에서 추가\n- R5: 다\n$/);
  assert.equal(M.mergeRequirementsFile(old, ['가'], 'x', 'append').added, 0);
  assert.equal(M.mergeRequirementsFile(old, ['마'], 'x', 'replace').added, 1);
  assert.equal(M.treeCount(old), 2);
});

// ---------------------------------------------------------------- 0.5.0: 커밋 전 변경 · 테스트 실행 · 오래된 결과
import { readFileSync as readText, mkdirSync as mkdir, utimesSync, rmSync } from 'node:fs';
import { parseTestReport } from '../../src/tests.ts';

/** feature/lockout-b 를 체크아웃한 저장소와, 그 브랜치의 테스트 결과 파일 */
function workRepo() {
  const r = demo(null);
  execFileSync('git', ['-C', r.repo, 'checkout', '-q', 'feature/lockout-b']);
  const dir = join(r.repo, '.verifylens');
  mkdir(dir, { recursive: true });
  const reqFile = join(dir, 'requirements.md');
  writeFile(reqFile, '- R1: 올바른 비밀번호로 로그인할 수 있다\n- R2: 연속 5회 실패하면 계정을 잠근다\n- R3: 잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다\n');
  const junit = join(dir, 'test-report.xml');
  writeFile(junit, readText(join(ext, 'samples', 'junit', 'junit-b.xml'), 'utf8'));
  const check = () => M.runRepo({ repo: r.repo, base: 'main', a: 'feature/lockout-b', reqFile, junitA: M.findReport(r.repo), workingRef: 'feature/lockout-b', worktree: true });
  const auth = join(r.repo, 'src', 'auth.ts');
  const touch = (f: string, secondsFromNow: number) => { const t = new Date(Date.now() + secondsFromNow * 1000); utimesSync(f, t, t); };
  return { repo: r.repo, reqFile, junit, check, auth, touch };
}

test('uncommitted changes are checked: an edit that is only saved changes the verdict', () => {
  const w = workRepo();
  w.touch(w.junit, 5);
  let run = w.check();
  assert.deepEqual(status(run), { R1: '확인됨', R2: '다름', R3: '미확인' });
  assert.equal(run.report.sets[0].wip, undefined, 'nothing uncommitted yet');
  const sig = M.reportSig(run.report);
  const spec = { repo: w.repo, refs: ['main', 'HEAD'], files: [w.reqFile], worktree: true };
  const s0 = M.signature(spec);

  writeFile(w.auth, readText(w.auth, 'utf8').replace('user.failures > 5', 'user.failures > 3'));
  w.touch(w.auth, -60);
  assert.notEqual(M.signature(spec), s0, 'a saved file changes the watch signature');
  run = w.check();
  const ev = run.report.sets[0].perReq.R2.evidence;
  assert.equal(ev.unit!.cond!.expr, 'user.failures > 3', 'reads the file on disk, not the commit');
  assert.equal(ev.boundary!.attempts, 4);
  assert.match(run.report.sets[0].wip!, /^[0-9a-f]{7}$/);
  assert.notEqual(M.reportSig(run.report), sig, 'a decision recorded before the edit no longer applies');
  assert.equal(M.contextLine(run), 'feature/lockout-b + 커밋 전 변경 ← main');
  assert.match(M.prSummary(run), /`feature\/lockout-b` \(`[0-9a-f]{7}`, 커밋 안 된 변경 포함\) ← `main`/);

  // 아직 git 이 모르는 새 파일도 본다
  writeFile(join(w.repo, 'src', 'extra.ts'), 'export function lockAccount(user: { failures: number; locked: boolean }) {\n  if (user.failures >= 5) user.locked = true;\n}\n');
  run = w.check();
  assert.ok(run.report.sets[0].files['src/extra.ts'], 'untracked file is analysed');

  // 커밋된 것만 보는 예전 방식은 그대로다
  const committed = M.runRepo({ repo: w.repo, base: 'main', a: 'feature/lockout-b', reqFile: w.reqFile });
  assert.equal(committed.report.sets[0].perReq.R2.evidence.unit!.cond!.expr, 'user.failures > 5');
});

test('test results older than the code are not used', () => {
  const w = workRepo();
  w.touch(w.junit, -120);
  writeFile(w.auth, readText(w.auth, 'utf8').replace('user.failures > 5', 'user.failures >= 5'));
  let run = w.check();
  assert.equal(run.report.testsStale, true);
  assert.deepEqual(status(run), { R1: '미확인', R2: '미확인', R3: '미확인' }, 'a pass or fail from before the edit proves nothing about this code');
  assert.deepEqual(M.treeModel(run.report).map((x) => x.reason), ['검사 오래됨', '검사 오래됨', '검사 오래됨']);
  assert.match(run.notes.join(' '), /테스트 결과가 코드보다 오래되어 쓰지 않았습니다/);
  assert.match(M.prSummary(run), /- 테스트 결과가 코드보다 오래되어 쓰지 않음 — 다시 실행 필요/);
  assert.equal(run.report.sets[0].perReq.R2.evidence.boundary!.attempts, 5, 'the code itself is still analysed');

  // 테스트를 다시 돌린 것처럼 통과한 결과를 새로 쓰면 반영된다
  writeFile(w.junit, readText(join(ext, 'samples', 'junit', 'junit-a.xml'), 'utf8'));
  w.touch(w.junit, 5);
  run = w.check();
  assert.equal(run.report.testsStale, false);
  assert.deepEqual(status(run), { R1: '확인됨', R2: '확인됨', R3: '미확인' });

  rmSync(w.junit);
  run = w.check();
  assert.match(run.notes.join(' '), /테스트 결과가 없어 검사는 모두 「미실행」/);
});

test('test reports from Vitest (JUnit) and Jest (JSON) are read', () => {
  const vt = parseTestReport(readText(join(ext, 'test', 'fixtures', 'vitest-junit.xml'), 'utf8'));
  assert.deepEqual(vt.map((t) => `${t.status}:${t.name}`), ['pass:login succeeds with the right password', 'fail:locks the account on the 5th consecutive failure']);
  assert.match(vt[1].message, /expected false to be true/);
  const jt = parseTestReport(readText(join(ext, 'test', 'fixtures', 'jest.json'), 'utf8'));
  assert.deepEqual(jt.map((t) => `${t.status}:${t.name}`), ['pass:lockout login succeeds with the right password', 'fail:lockout locks the account on the 5th consecutive failure']);
  assert.match(jt[1].message, /Expected: 5 · Received: 6/);
  assert.ok(!/\u001b\[/.test(jt[1].message), 'colour codes are stripped');
  assert.deepEqual(parseTestReport('{"testResults":[{"assertionResults":[{"ancestorTitles":["a"],"title":"b","status":"pending"}]}]}'), [{ name: 'a b', status: 'skip', message: '' }]);
});

test('the test command is detected from package.json, or taken from the setting', () => {
  const mk = (pkg: unknown, files: Record<string, string> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'vl-plan-'));
    execFileSync('git', ['-C', dir, 'init', '-q']);
    if (pkg) writeFile(join(dir, 'package.json'), JSON.stringify(pkg));
    for (const [f, c] of Object.entries(files)) { mkdir(join(dir, f, '..'), { recursive: true }); writeFile(join(dir, f), c); }
    return dir;
  };
  let d = mk({ devDependencies: { vitest: '^3' } });
  assert.deepEqual(M.detectTestPlan(d), { framework: 'Vitest', command: 'npx vitest run --reporter=junit --outputFile=.verifylens/test-report.xml', report: join(d, '.verifylens/test-report.xml') });
  d = mk({ scripts: { test: 'jest --coverage' } });
  assert.equal(M.detectTestPlan(d)!.command, 'npx jest --json --outputFile=.verifylens/test-report.json');
  d = mk({ scripts: { test: 'node --experimental-strip-types --test' } });
  assert.equal(M.detectTestPlan(d, '', '', 'C:\\Program Files\\nodejs\\node.exe')!.command, '"C:\\Program Files\\nodejs\\node.exe" --test --test-reporter=junit --test-reporter-destination=.verifylens/test-report.xml');
  d = mk(null, { 'test/a.test.ts': '' });
  assert.equal(M.detectTestPlan(d)!.framework, 'node:test', 'no package.json but test files exist');
  d = mk({ devDependencies: { mocha: '^10' } }, { 'test/a.test.js': '' });
  assert.equal(M.detectTestPlan(d), null, 'unknown runner: ask for the command instead of guessing');
  assert.deepEqual(M.detectTestPlan(d, 'npx mocha --reporter xunit --reporter-option output=${report}', 'out/r.xml'), {
    framework: '직접 지정',
    command: 'npx mocha --reporter xunit --reporter-option output=out/r.xml',
    report: join(d, 'out/r.xml'),
  });
  assert.equal(M.detectTestPlan(mk({})), null);
  assert.deepEqual(M.reportCandidates(d, 'out/r.xml'), [join(d, 'out/r.xml')]);
  assert.equal(M.reportCandidates(d).length, 3);
});

test('the base branch is chosen without asking when it is obvious', () => {
  const w = workRepo();
  assert.equal(M.defaultBase(w.repo, 'feature/lockout-b'), 'main');
  assert.equal(M.defaultBase(w.repo, 'main'), null, 'on main itself there is nothing obvious to compare with');
  execFileSync('git', ['-C', w.repo, 'branch', 'develop', 'main']);
  assert.equal(M.defaultBase(w.repo, 'main'), 'develop');
});

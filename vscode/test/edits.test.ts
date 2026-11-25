// 「이번 변경에서 바뀐 검사」: 에이전트가 검사의 숫자를 바꾸거나 지워서 「모두 통과」를 만든 경우를 보이는가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeFiles, evaluate } from '../../src/engine.ts';
import { parseRequirements } from '../../src/requirements.ts';
import { setLang } from '../../src/i18n.ts';
import { runCi, type CiIO } from '../../src/ci.ts';
import { chainMermaid, chainSteps, chainText, prSummary } from '../src/model.ts';
import { stepTone } from '../../src/evidenceView.ts';
import { EDITS } from './cases/edits.ts';
import { runEditCase } from './cases/edits-run.ts';

test('changed tests: every case in the first set shows the expected change', () => {
  for (const c of EDITS) {
    const { edits } = runEditCase(c);
    const e = edits[0];
    const values = (e?.values ?? []).map((v) => `${v.from} → ${v.to}`);
    if (c.expect.kind === null) assert.equal(edits.length, 0, c.id);
    else assert.equal(e?.kind, c.expect.kind, c.id);
    for (const v of c.expect.values ?? []) assert.ok(values.includes(v), `${c.id}: ${v} in ${values.join(', ')}`);
    if (c.expect.fewer !== undefined) assert.equal(e?.fewerChecks, c.expect.fewer, c.id);
  }
});

const LOCK = "export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures >= 5) user.locked = true;\n}\n";
const TEST = (n: number) => `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\ntest('locks the account after 5 consecutive failures', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < ${n}; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n});\n`;

test('changed tests: the chain, the PR summary and the hover-free text all say the test changed (5 → 6)', () => {
  setLang('en');
  const set = analyzeFiles({ key: 'A', ref: 'x', sha: 'x', files: { 'src/auth.ts': LOCK, 'test/auth.test.ts': TEST(6) }, baseFiles: { 'src/auth.ts': LOCK, 'test/auth.test.ts': TEST(5) }, tests: [{ name: 'locks the account after 5 consecutive failures', status: 'pass', message: '' }] });
  const report = evaluate([set], parseRequirements('- R1: Lock the account after 5 consecutive failures | keywords: failure, lock'), '.', 'main');
  // 판정 낱말은 그대로 (코드는 5번째에 잠근다)
  assert.equal(report.summaries[0].overall, '확인됨');
  const steps = chainSteps(report, 'R1', 'en');
  const testStep = steps.find((s) => s.kind === 'test')!;
  assert.match(testStep.text, /passes · locks the account after 5 consecutive failures · test changed in this change: 5 → 6/);
  assert.equal(testStep.tone, 'diff');
  // 통과했지만 바뀐 검사는 실패 색(빨강)이 아니라 다름 색(주황)
  assert.equal(testStep.changed, true);
  assert.equal(stepTone(testStep), 'diff');
  assert.equal(stepTone({ ...testStep, changed: undefined }), 'fail');
  assert.ok(chainMermaid('R1', steps, '확인됨').includes('  class R1_2 diff'));
  assert.match(chainText(steps), /tests: [^→]*test changed in this change: 5 → 6 ✗/);
  const md = prSummary({ kind: 'repo', repo: '.', report, notes: [] }, {}, { lang: 'en' });
  assert.match(md, /### ⚠️ Tests changed in this change: 1/);
  assert.match(md, /- \*\*R1\*\* `locks the account after 5 consecutive failures` \(`test\/auth\.test\.ts:5`\) — test changed in this change: 5 → 6/);
  assert.match(md, /✅ Verified<br>⚠️ test changed/);
  const ko = prSummary({ kind: 'repo', repo: '.', report, notes: [] }, {}, { lang: 'ko' });
  assert.match(ko, /이번 변경에서 바뀐 검사 1개/);
  assert.match(ko, /이번 변경에서 검사가 바뀜: 5 → 6/);
});

test('changed tests: the hook asks once when a linked test was changed, even if the requirement is Verified', () => {
  setLang('en');
  const root = mkdtempSync(join(tmpdir(), 'vl-edit-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'));
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', '-C', repo, ...a], { stdio: 'pipe', encoding: 'utf8' });
  const keep = { ...process.env };
  try {
    g('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'src/auth.ts'), LOCK);
    writeFileSync(join(repo, 'test/auth.test.ts'), TEST(5));
    const reqFile = join(root, 'requirements.md');
    writeFileSync(reqFile, '- R1: Lock the account after 5 consecutive failures | keywords: failure, lock\n');
    g('add', '-A');
    g('commit', '-q', '-m', 'base');
    // 에이전트가 코드를 다듬고, 검사의 반복 횟수를 6으로 바꿨다 (커밋 전)
    writeFileSync(join(repo, 'src/auth.ts'), LOCK.replace('user.failures += 1;', 'user.failures = user.failures + 1;'));
    writeFileSync(join(repo, 'test/auth.test.ts'), TEST(6));
    // 바꾼 검사를 돌린 결과 (통과)
    const junit = join(root, 'junit.xml');
    writeFileSync(junit, '<?xml version="1.0"?>\n<testsuites><testsuite name="t"><testcase name="locks the account after 5 consecutive failures" classname="t"/></testsuite></testsuites>\n');
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CURSOR_PROJECT_DIR;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_STEP_SUMMARY;
    const run = (opts: Record<string, string>, input?: unknown) => {
      const out: string[] = [];
      const err: string[] = [];
      const io: CiIO = { out: (s) => void out.push(s), err: (s) => void err.push(s) };
      const code = runCi(opts, input === undefined ? undefined : JSON.stringify(input), io);
      return { code, out: out.join('\n'), err: err.join('\n') };
    };
    const cli = run({ repo, base: 'main', worktree: 'true', requirements: reqFile, junit });
    assert.match(cli.out, /R1 · Verified/);
    assert.match(cli.out, /⚠ "locks the account after 5 consecutive failures" \(test\/auth\.test\.ts:5\) — test changed in this change: 5 → 6/);
    assert.equal(cli.code, 0); // 실패로 끝내지는 않는다 (판정은 확인됨)
    const first = run({ hook: 'claude', requirements: reqFile, junit }, { stop_hook_active: false, cwd: repo });
    const reason = JSON.parse(first.out).reason as string;
    assert.match(reason, /tests linked to requirements were changed or removed in this change/);
    assert.match(reason, /- R1 · Lock the account after 5 consecutive failures: "locks the account after 5 consecutive failures" \(test\/auth\.test\.ts:5\) — test changed in this change: 5 → 6/);
    assert.match(reason, /ask the user before changing the test/);
    // 두 번째에는 사람에게만 알린다 (막지 않는 경고 systemMessage, 종료 코드 0 — 0.27.2)
    const again = run({ hook: 'claude', requirements: reqFile, junit }, { stop_hook_active: true, cwd: repo });
    assert.equal(again.code, 0);
    const warn = JSON.parse(again.out);
    assert.equal(warn.decision, undefined);
    assert.match(warn.systemMessage, /tests linked to requirements were changed or removed in this change/);
    // 검사를 되돌리면 조용하다
    writeFileSync(join(repo, 'test/auth.test.ts'), TEST(5));
    writeFileSync(junit, '<?xml version="1.0"?>\n<testsuites><testsuite name="t"><testcase name="locks the account after 5 consecutive failures" classname="t"/></testsuite></testsuites>\n');
    const back = run({ hook: 'claude', requirements: reqFile, junit }, { stop_hook_active: false, cwd: repo });
    assert.equal(back.out, '');
    assert.equal(back.code, 0);
  } finally {
    process.env = keep;
    rmSync(root, { recursive: true, force: true });
  }
});

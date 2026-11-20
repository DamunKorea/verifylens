// CI 명령: 틀린 브랜치에서는 근거 줄에 표시를 남기고 실패로 끝나고, 맞는 브랜치에서는 통과한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSampleRepo } from '../../src/demo.ts';
import { parseFailOn, runCi } from '../../src/ci.ts';
import type { CiIO } from '../../src/ci.ts';
import { setLang } from '../../src/i18n.ts';

const env = buildSampleRepo();

function capture(fn: () => number): { code: number; out: string } {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    return { code: fn(), out: lines.join('\n') };
  } finally {
    console.log = log;
  }
}

test('ci: a Different requirement marks its line and fails; the right branch passes', () => {
  setLang('en');
  const dir = mkdtempSync(join(tmpdir(), 'vl-ci-'));
  const summary = join(dir, 'summary.md');
  const keep = { ...process.env };
  Object.assign(process.env, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: env.repo, GITHUB_STEP_SUMMARY: summary });
  try {
    const b = capture(() => runCi({ repo: env.repo, base: 'main', head: 'feature/lockout-b', requirements: env.reqFile, junit: env.junitB }));
    assert.equal(b.code, 1);
    assert.match(b.out, /::error file=src\/auth\.ts,line=\d+,title=VerifyLens R2 · Different::/);
    assert.match(b.out, /acts on attempt 6 \(requirement: 5\)/);
    assert.match(readFileSync(summary, 'utf8'), /## VerifyLens verification summary/);
    const a = capture(() => runCi({ repo: env.repo, base: 'main', head: 'feature/lockout-a', requirements: env.reqFile, junit: env.junitA }));
    assert.equal(a.code, 0);
    assert.doesNotMatch(a.out, /::error/);
  } finally {
    process.env = keep;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ci: missing requirements file is a usage error, and fail-on values are checked', () => {
  setLang('en');
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(runCi({ repo: env.repo, base: 'main', head: 'feature/lockout-a', requirements: 'nope.md' }), 2);
  } finally {
    console.error = err;
  }
  assert.deepEqual([...parseFailOn('different, unverified')], ['다름', '미확인']);
  assert.throws(() => parseFailOn('wrong'), /Unknown --fail-on value/);
});

// 커밋 전 변경(작업 폴더)과 에이전트 훅. 다른 시험이 쓰는 저장소를 건드리지 않게 따로 만든다.
const wt = buildSampleRepo();
const g = (...a: string[]) => execFileSync('git', ['-c', 'core.autocrlf=false', '-C', wt.repo, ...a], { stdio: 'pipe', encoding: 'utf8' });

function run(opts: Record<string, string>, input?: unknown): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const io: CiIO = { out: (s) => void out.push(s), err: (s) => void err.push(s) };
  // 이 시험을 Claude Code · Cursor 안에서 돌려도 그 프로젝트 폴더를 보지 않게 한다
  const keep = { ...process.env };
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CURSOR_PROJECT_DIR;
  delete process.env.GITHUB_ACTIONS;
  delete process.env.GITHUB_STEP_SUMMARY;
  try {
    const code = runCi(opts, input === undefined ? undefined : JSON.stringify(input), io);
    return { code, out: out.join('\n'), err: err.join('\n') };
  } finally {
    process.env = keep;
  }
}

/** main 위에서, 결과 A 나 B 의 코드를 커밋하지 않은 채로 둔다 (AI 가 방금 고친 상태). */
function uncommitted(v: 'a' | 'b' | null) {
  g('checkout', '-q', '-f', 'main');
  g('clean', '-q', '-fd');
  if (v) g('checkout', `feature/lockout-${v}`, '--', '.');
}

test('ci --worktree: checks uncommitted code against the base', () => {
  setLang('en');
  uncommitted('b');
  const b = run({ repo: wt.repo, base: 'main', worktree: 'true', requirements: wt.reqFile });
  assert.equal(b.code, 1);
  assert.match(b.out, /R2 · Different/);
  // 테스트 결과가 지금 코드보다 오래됐으면 쓰지 않는다
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(wt.junitB, old, old);
  const stale = run({ repo: wt.repo, base: 'main', worktree: 'true', requirements: wt.reqFile, junit: wt.junitB });
  assert.match(stale.out, /older than the code/);
  uncommitted('a');
  const a = run({ repo: wt.repo, base: 'main', worktree: 'true', requirements: wt.reqFile });
  assert.equal(a.code, 0);
  assert.doesNotMatch(a.out, /R\d · Different/);
  // 커밋만 보는 기본 방식은 커밋 전 변경을 보지 않는다
  const committed = run({ repo: wt.repo, base: 'main', head: 'HEAD', requirements: wt.reqFile });
  assert.match(committed.out, /No TypeScript or JavaScript files changed in HEAD/);
});

test('ci --hook claude: asks once to fix a Different requirement, then only tells the user', () => {
  setLang('en');
  uncommitted('b');
  // 기준을 주지 않으면 origin/main 이 없으니 main 과 비교한다. 폴더는 훅 입력의 cwd 를 쓴다.
  const first = run({ hook: 'claude', requirements: wt.reqFile }, { hook_event_name: 'Stop', stop_hook_active: false, cwd: wt.repo });
  assert.equal(first.code, 0);
  const json = JSON.parse(first.out);
  assert.equal(json.decision, 'block');
  assert.match(json.reason, /R2 · Different/);
  assert.match(json.reason, /src\/auth\.ts:\d+/);
  assert.match(json.reason, /ask the user instead of changing the requirements file/);
  assert.equal(first.err, ''); // 훅에서는 요구사항별 줄을 쓰지 않는다
  const again = run({ hook: 'claude', requirements: wt.reqFile }, { stop_hook_active: true, cwd: wt.repo });
  assert.equal(again.code, 1);
  assert.equal(again.out, '');
  assert.match(again.err, /R2 · Different/);
  uncommitted('a');
  const fixed = run({ hook: 'claude', requirements: wt.reqFile }, { stop_hook_active: true, cwd: wt.repo });
  assert.equal(fixed.code, 0);
  assert.equal(fixed.out, '');
});

test('ci --hook cursor: follow-up message once; stays quiet without code changes or requirements', () => {
  setLang('en');
  uncommitted('b');
  const first = run({ hook: 'cursor', requirements: wt.reqFile }, { status: 'completed', loop_count: 0, workspace_roots: [wt.repo] });
  assert.equal(first.code, 0);
  assert.match(JSON.parse(first.out).followup_message, /R2 · Different/);
  const again = run({ hook: 'cursor', requirements: wt.reqFile }, { status: 'completed', loop_count: 1, workspace_roots: [wt.repo] });
  assert.deepEqual([again.code, again.out], [1, '{}']);
  const aborted = run({ hook: 'cursor', requirements: wt.reqFile }, { status: 'aborted', loop_count: 0, workspace_roots: [wt.repo] });
  assert.deepEqual([aborted.code, aborted.out], [0, '{}']);
  const noReq = run({ hook: 'cursor', repo: wt.repo }, { status: 'completed', loop_count: 0 });
  assert.deepEqual([noReq.code, noReq.out], [0, '{}']);
  // 에이전트가 코드를 건드리지 않은 차례에는 검사하지 않는다
  uncommitted(null);
  const clean = run({ hook: 'cursor', requirements: wt.reqFile }, { status: 'completed', loop_count: 0, workspace_roots: [wt.repo] });
  assert.deepEqual([clean.code, clean.out], [0, '{}']);
});

test('ci: usage errors are 2 in CI and 1 in a hook (2 would tell Claude Code to keep going)', () => {
  setLang('en');
  uncommitted('b');
  const badBase = run({ repo: wt.repo, base: 'nope', worktree: 'true', requirements: wt.reqFile });
  assert.equal(badBase.code, 2);
  assert.match(badBase.err, /The base was not found: nope/);
  assert.equal(run({ hook: 'vim' }).code, 2);
  const hookBadBase = run({ hook: 'claude', base: 'nope', requirements: wt.reqFile }, { cwd: wt.repo });
  assert.equal(hookBadBase.code, 1);
  assert.equal(hookBadBase.out, '');
  uncommitted(null);
});

// CI 명령: 틀린 브랜치에서는 근거 줄에 표시를 남기고 실패로 끝나고, 맞는 브랜치에서는 통과한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSampleRepo } from '../../src/demo.ts';
import { parseFailOn, runCi } from '../../src/ci.ts';
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

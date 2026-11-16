import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

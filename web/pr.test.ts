// 체험 페이지의 「공개 GitHub PR 로 확인하기」. GitHub 는 가짜 응답으로 바꿔 끼운다 (시험이 실제 GitHub 를 부르지 않게).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closingIssues, loadPr, parsePrUrl, patchLines, PrError, type Fetch } from './pr.ts';
import { runCheck } from './check.ts';
import { extractRequirements } from '../src/requirements.ts';
import { setLang } from '../src/i18n.ts';

test('PR addresses: full URL with a tab, short form, and things that are not a PR', () => {
  assert.deepEqual(parsePrUrl('https://github.com/MrLesk/Backlog.md/pull/1205/files'), { owner: 'MrLesk', repo: 'Backlog.md', number: 1205 });
  assert.deepEqual(parsePrUrl(' github.com/o/r/pull/7?w=1 '), { owner: 'o', repo: 'r', number: 7 });
  assert.deepEqual(parsePrUrl('o/r#12'), { owner: 'o', repo: 'r', number: 12 });
  assert.equal(parsePrUrl('https://github.com/o/r/issues/7'), null);
  assert.equal(parsePrUrl('https://gitlab.com/o/r/-/merge_requests/7'), null);
  assert.equal(parsePrUrl(''), null);
});

test('changed lines come from the patch, closing issues from the PR text', () => {
  assert.deepEqual(patchLines('@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n c\n@@ -10,2 +11,2 @@\n x\n-y\n+Y\n\\ No newline at end of file'), [2, 3, 12]);
  assert.equal(patchLines(undefined), null);
  // 서식만 바뀐 줄 · 자리만 옮긴 import · 주석과 괄호뿐인 줄은 바뀐 줄이 아니다 (실제 PR 시험 Elysia, 0.28.0)
  const reformat = [
    '@@ -1,8 +1,9 @@',
    "-import { b } from './b'",
    "-import { a } from './a'",
    "+import { a } from './a'",
    "+import { b } from './b'",
    '-// @ts-ignore',
    '+// @ts-expect-error',
    "-  case 'x':",
    "+  case 'x': {",
    '+  }',
    '-  return new Response(msg, { headers })',
    '+  return mapResponse(msg, set)',
  ].join('\n');
  assert.deepEqual(patchLines(reformat), [6]);
  const ref = { owner: 'o', repo: 'r', number: 9 };
  assert.deepEqual(closingIssues('Closes #3, fixes other/lib#4 and resolves https://github.com/o/r/issues/5. Also closes #3. See #6.', ref), [
    { owner: 'o', repo: 'r', number: 3 },
    { owner: 'other', repo: 'lib', number: 4 },
    { owner: 'o', repo: 'r', number: 5 },
  ]);
});

test('PR templates: process checklists and "I have …" lines are not requirements; prose under Expected behavior is', () => {
  const pr = [
    '## Summary',
    'Unknown statuses now exit 1.',
    '## Related Issue or Task',
    'Closes #1181. Task: BACK-801',
    '## Task Checklist',
    '- [x] I have created a corresponding task',
    '- [x] The task has clear acceptance criteria',
    '## Testing',
    '- Added a CLI regression test',
  ].join('\n');
  assert.deepEqual(extractRequirements(pr), []);
  assert.deepEqual(extractRequirements('- [x] I have read the guide\n- [ ] I\'ve added tests\n- A locked account cannot log in\n- Lock the account after 5 failures'), ['A locked account cannot log in', 'Lock the account after 5 failures']);
  const issue = '**Describe the bug**\n\nIt exits 0.\n\n**Expected behavior**\n\nAn unknown status value exits non-zero with an error naming the valid statuses. An empty list must mean "no tasks in that status".\n\n**Environment**\n\n- OS: Linux';
  assert.deepEqual(extractRequirements(issue), ['An unknown status value exits non-zero with an error naming the valid statuses', 'An empty list must mean "no tasks in that status"']);
  // 한국어 「체크리스트」는 요구사항 칸으로 그대로 읽는다
  assert.deepEqual(extractRequirements('## 체크리스트\n- [ ] 연속 5회 실패하면 계정을 잠근다\n'), ['연속 5회 실패하면 계정을 잠근다']);
});

// 실제 공개 PR 17개에서 뽑은 82줄의 절반이 요구사항이 아니었다 (0.26.0). 같은 모양을 우리 말로 적었다.
test('real PR prose: process steps, reasons, quotes and the old bug are not requirements', () => {
  const pr = [
    'Fixes #12',
    '',
    '- A coupon code of a single space was accepted as a valid code.',
    '- Reject coupon codes shorter than 3 characters.',
    '- Add tests for a code with spaces.',
    '- Apply it to the web and mobile handlers.',
    '- The new tests check both cases.',
    '',
    '### The author should do the following, if applicable',
    '',
    '- [x] Add tests',
    '- [x] Run tests',
    '- [x] `pnpm run check:fix` to format and lint the code',
    '- [ ] Add TSDoc/JSDoc to document the code',
  ].join('\n');
  assert.deepEqual(extractRequirements(pr), ['Reject coupon codes shorter than 3 characters']);
  const bullets = [
    '- This matters for large exports: the body must fit within the limit.',
    '- The legacy router already returns 404 for those paths.',
    '- Overriding the method on a POST with a body made the request throw, so the response was 500.',
    '- #45 covers the case without headers.',
    '- RFC 9110 allows whitespace before the semicolon.',
    '- Now the body is dropped for GET and HEAD.',
    '- The rewritten request should drop the old length, as the form branch already does.',
    '- A 204 response now becomes a result with only status and headers.',
    '- Without it, nothing is accepted that was not before.',
    '- Decode the body so a leading BOM is kept.',
    '- With overwrite set to false, a header the response already has is kept.',
    '- Skip users who already voted.',
  ].join('\n');
  assert.deepEqual(extractRequirements(bullets), [
    'Now the body is dropped for GET and HEAD',
    'The rewritten request should drop the old length, as the form branch already does',
    'A 204 response now becomes a result with only status and headers',
    'Without it, nothing is accepted that was not before',
    'Decode the body so a leading BOM is kept',
    'With overwrite set to false, a header the response already has is kept',
    'Skip users who already voted',
  ]);
  const issue = [
    '### What version are you using?',
    '',
    '1.2.3',
    '',
    '### What is the expected behavior?',
    '',
    'A locked account should not log in. According to RFC 6749 section 5.2, the server must answer with 400. The docs state that a 204 with a body becomes a 502.',
    '',
    '### What do you see instead?',
    '',
    'The login should fail but it returned 200.',
  ].join('\n');
  assert.deepEqual(extractRequirements(issue), ['A locked account should not log in']);
});

const LOGIN = "export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures > 5) user.locked = true;\n}\n";
const LOGIN_TEST = (n: number) => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { onFailedLogin } from '../src/login.ts';\n\ntest('locks the account after 5 consecutive failures', () => {\n  const u = { failures: 0, locked: false };\n  for (let i = 0; i < ${n}; i++) onFailedLogin(u);\n  assert.equal(u.locked, true);\n});\n`;

/** 가짜 GitHub. 부른 주소를 모은다 */
function fakeGitHub(over: Record<string, () => Response> = {}) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
  const routes: Record<string, () => Response> = {
    'https://api.github.com/repos/o/r/pulls/9': () => json({
      title: 'Lock accounts', html_url: 'https://github.com/o/r/pull/9', state: 'open', merged_at: null,
      body: 'Adds the lockout. Closes #3.\n\n## Checklist\n- [x] I have added tests',
      head: { sha: 'h1', repo: { full_name: 'fork/r' } }, base: { sha: 'b1', repo: { full_name: 'o/r' } },
    }),
    'https://api.github.com/repos/o/r/issues/3': () => json({ number: 3, title: 'Lockout', html_url: 'https://github.com/o/r/issues/3', body: '## Acceptance criteria\n- Lock the account after 5 consecutive failures\n' }),
    'https://api.github.com/repos/o/r/pulls/9/files?per_page=100&page=1': () => json([
      { filename: 'src/login.ts', status: 'modified', patch: '@@ -1,3 +1,4 @@\n export function onFailedLogin(user: { failures: number; locked: boolean }) {\n   user.failures += 1;\n+  if (user.failures > 5) user.locked = true;\n }' },
      { filename: 'test/login.test.ts', status: 'renamed', previous_filename: 'test/auth.test.ts', patch: '@@ -1 +1 @@\n-a\n+b' },
      { filename: 'README.md', status: 'modified' },
      { filename: 'dist/login.js', status: 'modified' },
      { filename: 'src/old.ts', status: 'removed' },
      { filename: 'src/huge.ts', status: 'added' },
    ]),
    'https://api.github.com/repos/o/r/compare/b1...h1?per_page=1': () => json({ merge_base_commit: { sha: 'm1' } }),
    'https://raw.githubusercontent.com/fork/r/h1/src/login.ts': () => new Response(LOGIN),
    'https://raw.githubusercontent.com/fork/r/h1/test/login.test.ts': () => new Response(LOGIN_TEST(6)),
    'https://raw.githubusercontent.com/o/r/m1/test/auth.test.ts': () => new Response(LOGIN_TEST(5)),
    'https://raw.githubusercontent.com/fork/r/h1/src/huge.ts': () => new Response('x'.repeat(500_000)),
    ...over,
  };
  const fetchImpl: Fetch = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const r = routes[url];
    return r ? r() : new Response('not found', { status: 404 });
  };
  return { calls, fetchImpl };
}

test('a public PR is read from GitHub: requirements from the closed issue, changed code, and the test file before the change', async () => {
  setLang('en');
  const gh = fakeGitHub();
  const pr = await loadPr('https://github.com/o/r/pull/9', gh.fetchImpl);
  assert.equal(pr.title, 'Lock accounts');
  // 이슈의 목록이 먼저, PR 글에는 목록이 없어(체크리스트는 절차) 제목을 쓴다
  assert.deepEqual(pr.requirements, ['Lock the account after 5 consecutive failures', 'Lock accounts']);
  assert.deepEqual(pr.sources, ['issue #3', 'PR #9 title']);
  assert.deepEqual(Object.keys(pr.files).sort(), ['src/login.ts', 'test/login.test.ts']);
  assert.deepEqual(Object.keys(pr.baseFiles), ['test/login.test.ts'], 'the renamed test is read under its old name and kept under the new one');
  assert.deepEqual(pr.changed['src/login.ts'], [3]);
  assert.deepEqual(pr.skipped.map((s) => `${s.path}:${s.why}`), ['dist/login.js:generated', 'README.md:not-code', 'src/huge.ts:too-large', 'src/old.ts:removed']);
  assert.equal(pr.totalFiles, 6);
  // GitHub 공개 주소 두 곳만, 토큰 없이 부른다
  assert.ok(gh.calls.every((c) => /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//.test(c.url)));
  assert.ok(gh.calls.every((c) => !c.headers || !Object.keys(c.headers).some((k) => /authorization/i.test(k))));
  assert.ok(gh.calls.length <= 9, `${gh.calls.length} requests`);

  // 같은 엔진으로 판정: 6번째에 잠그는 코드는 「다름」, 검사의 5 → 6 바뀜도 보인다
  const res = runCheck({ requirements: '- R1: Lock the account after 5 consecutive failures', fileName: '', code: '', tests: [], lang: 'en', files: pr.files, baseFiles: pr.baseFiles, changed: pr.changed });
  assert.equal(res.rows[0].overall, '다름');
  assert.equal(res.rows[0].file, 'src/login.ts');
  assert.equal(res.rows[0].line, 3);
  assert.ok(res.notes.every((n) => n.file === 'src/login.ts'));
  assert.match(res.rows[0].chain.find((s) => s.kind === 'test')?.text ?? '', /5 → 6/);
});

test('readable failures: not found, rate limit, no code, bad address', async () => {
  const kind = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return e instanceof PrError ? e.kind : 'other';
    }
  };
  assert.equal(await kind(loadPr('https://github.com/o/private/pull/1', fakeGitHub().fetchImpl)), 'not-found');
  const limited = fakeGitHub({ 'https://api.github.com/repos/o/r/pulls/9': () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1795000000' } }) });
  try {
    await loadPr('o/r#9', limited.fetchImpl);
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof PrError && e.kind === 'rate-limit');
    assert.equal(e.resetAt?.getTime(), 1795000000 * 1000);
  }
  const docs = fakeGitHub({ 'https://api.github.com/repos/o/r/pulls/9/files?per_page=100&page=1': () => new Response(JSON.stringify([{ filename: 'README.md', status: 'modified' }])) });
  assert.equal(await kind(loadPr('o/r#9', docs.fetchImpl)), 'no-code');
  assert.equal(await kind(loadPr('not a pr', fakeGitHub().fetchImpl)), 'bad-url');
  const offline: Fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.equal(await kind(loadPr('o/r#9', offline)), 'network');
});

// 0.26.0 시험에서 남은 것: 리뷰 봇 요약의 갈래 이름 · 문서 · 테스트 갈래 아래 줄과 테스트 결과 줄 (우리 말로 적음)
test('review-bot summaries and test reports are not requirements', () => {
  const pr = [
    '## Summary by a review bot',
    '',
    '* **Bug Fixes**',
    '  * Blank coupon codes are now rejected with a 422 response.',
    '* **Documentation**',
    '  * Clarified how coupon codes are validated.',
    '* **Tests**',
    '  * Added coverage for blank and short codes.',
    '',
    '### Verification',
    '',
    '- Coupon tests: 75 passed',
    '- `pnpm build`: passed',
    '- Full test run: 3,055 passed, 51 skipped',
    '- New cases: 36 failures on main before the fix',
    '- Lock the account after 5 failed attempts',
  ].join('\n');
  assert.deepEqual(extractRequirements(pr), ['Blank coupon codes are now rejected with a 422 response', 'Lock the account after 5 failed attempts']);
});

// 관찰 결과 · 코드 위치 메모는 요구사항이 아니다 (실제 PR 시험 Elysia)
test('observed results and code locations are not requirements', () => {
  const issue = [
    '### What is the expected behavior?',
    '',
    '- The Set-Cookie header should be sent even when the handler throws',
    '- Response status: 500 ✓',
    '- Set-Cookie header: missing ✗',
    '- Error handler (`src/handle.ts:728-734`)',
    '- ✅ Setting a different value sends set-cookie',
  ].join('\n');
  assert.deepEqual(extractRequirements(issue), ['The Set-Cookie header should be sent even when the handler throws', '✅ Setting a different value sends set-cookie']);
});

// 이슈 · PR 글의 질문 · 제안 · 의견 · 조각 · 표는 요구사항이 아니다 (고치며 본 실제 PR 80개의 글에서 찾음, 0.28.0)
test('questions, offers, opinions, fragments and tables are not requirements', () => {
  const issue = [
    'Is it possible to retry only on network errors: https://example.com/x',
    'Should `0` be treated as OK for `no-cors` requests?',
    'Happy to open a PR if you would like.',
    'I think the headers object should be normalized.',
    'I came across this when I tried to refresh a token with `retry`.',
    'I expect the routes to be registered even behind a guard.',
    '',
    '- the `onError` handler is never called,',
    '- }`, and the middleware responds with 200',
    '- Headers should be merged without duplication',
    '',
    '| Server | Result |',
    '|--------|--------|',
    '| Node | 87 MB |',
  ].join('\n');
  assert.deepEqual(extractRequirements(issue), ['Headers should be merged without duplication']);
  const prose = issue.split('\n').slice(0, 6).join('\n');
  // 「I expect …」는 이슈의 기대 동작이다 (이슈 글에서만 읽는다)
  assert.deepEqual(extractRequirements(prose, 12, { issue: true }), ['I expect the routes to be registered even behind a guard']);
  // 고르지 않은 방법 · 쓴 AI 도구 · 이슈를 닫는 줄 · 검사 파일 메모 · 테스트 통과 보고 · 바뀐 기록 파일
  const pr = [
    '## Changes',
    '- Write an empty `data:` line for `undefined`',
    '- `test/sse.test.ts`: Added a regression test',
    '- All 4 new tests pass',
    '- Updated CHANGELOG.md',
    '- Fixes #857 (it does not fully fix this)',
    '## Alternatives considered',
    '- Skipping `undefined` yields: drops values the subscriber expects',
    '## AI model',
    '- Some Model 1.0',
  ].join('\n');
  assert.deepEqual(extractRequirements(pr), ['Write an empty `data:` line for `undefined`']);
});

// 이슈 글은 고치기 전 동작을 지금 시제로 적는다: 줄글은 바라는 동작(should · expect …)만, 버그 신고의 목록 줄은 버그 설명을 뺀다 (0.28.0)
test('an issue describes the bug in the present tense; only the wanted behavior is a requirement', () => {
  const body = [
    'When a response has an empty body, `onDownloadProgress` never fires.',
    'It throws `headers.get is not a function` if custom headers are set.',
    'Expected: the progress callback should fire once with 100%.',
    '',
    '- a raw `TypeError` leaks to the caller instead of a `TRPCError`',
    '- Check for duck-typed responses instead of `instanceof`',
  ].join('\n');
  // PR 글이면 「When …」 문장도 고친 뒤의 동작이다
  assert.deepEqual(extractRequirements(body), ['a raw `TypeError` leaks to the caller instead of a `TRPCError`', 'Check for duck-typed responses instead of `instanceof`']);
  assert.deepEqual(extractRequirements(body.split('\n').slice(0, 3).join('\n'), 12, { issue: true }), ['Expected: the progress callback should fire once with 100%']);
  assert.deepEqual(extractRequirements(body, 12, { issue: true, bug: true }), ['Check for duck-typed responses instead of `instanceof`', 'Expected: the progress callback should fire once with 100%']);
  // 기능 제안 이슈의 목록 줄은 제안한 동작이다
  assert.deepEqual(extractRequirements(body, 12, { issue: true }), ['a raw `TypeError` leaks to the caller instead of a `TRPCError`', 'Check for duck-typed responses instead of `instanceof`']);
});

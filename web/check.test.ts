// 해 보기 페이지의 예제가 확장과 같은 판정을 내는지 본다. 판정이 바뀌면 페이지 설명도 다시 봐야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFileName, normalizeRequirements, runCheck } from './check.ts';
import { EXAMPLES } from './examples.ts';

const verdicts = (id: string, lang: 'en' | 'ko') => {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  return runCheck({ requirements: ex.requirements[lang], fileName: ex.fileName, code: ex.code, tests: ex.tests[lang], lang }).rows.map((r) => r.overall);
};

test('examples give the same verdicts in both languages', () => {
  for (const lang of ['en', 'ko'] as const) {
    assert.deepEqual(verdicts('login', lang), ['다름', '확인됨']);
    assert.deepEqual(verdicts('shipping', lang), ['다름']);
    assert.deepEqual(verdicts('upload', lang), ['다름']);
    assert.deepEqual(verdicts('signup', lang), ['확인됨', '확인됨']);
  }
});

test('fixing the code in the page changes the verdict', () => {
  const ex = EXAMPLES[0];
  const r = runCheck({ requirements: ex.requirements.en, fileName: ex.fileName, code: ex.code.replace('failures > 5', 'failures >= 5'), tests: ex.tests.en, lang: 'en' });
  assert.deepEqual(r.rows.map((x) => x.overall), ['확인됨', '확인됨']);
  assert.ok(r.notes.some((n) => n.line === 10 && n.reqId === 'R1'));
});

test('plain lines become numbered requirements, and odd file names still get analyzed', () => {
  assert.deepEqual(normalizeRequirements('# note\nOrders over 10 ship free\n\n- R5: Age at least 14\n2. Retry at most 3 times'), [
    '- R1: Orders over 10 ship free',
    '- R5: Age at least 14',
    '- R6: Retry at most 3 times',
  ]);
  assert.equal(codeFileName(''), 'src/feature.ts');
  assert.equal(codeFileName('auth'), 'auth.ts');
  assert.equal(codeFileName('lib/a.js'), 'lib/a.js');
});

test('no requirement, no rows', () => {
  assert.equal(runCheck({ requirements: '\n# only a comment\n', fileName: 'a.ts', code: 'export const a = 1;', tests: [], lang: 'en' }).rows.length, 0);
});

// 0.23.0: PR 의 테스트는 이 페이지에서 돌리지 않는다. 「테스트 없음」이 아니라 「돌리지 않음」으로 보여야 한다 (국내외 반응 정리 11/22: PR 을 넣으면 거의 다 미확인)
const BAN = (guard: string) => `export class User {
  banned = false;
  ban() { this.banned = true; }
}

export function postComment(user: User, text: string, save: (text: string) => void) {
${guard}  if (/buy now/i.test(text)) {
    user.ban();
    throw new Error('SPAM');
  }
  save(text);
}
`;
const GUARD = "  if (user.banned) throw new Error('USER_BANNED');\n";

test('a linked test that was not run says so, apart from no test at all', () => {
  for (const lang of ['en', 'ko'] as const) {
    const base = { requirements: 'A banned user cannot post comments', fileName: 'src/comments.ts', code: BAN(GUARD), lang };
    const notRun = runCheck({ ...base, tests: [{ name: 'a banned user cannot post comments', status: 'notrun' }] }).rows[0];
    assert.equal(notRun.overall, '미확인');
    assert.equal(notRun.reason, lang === 'en' ? 'test not run' : '검사를 돌리지 않음');
    assert.deepEqual(notRun.tests, [lang === 'en' ? '○ a banned user cannot post comments (not run)' : '○ a banned user cannot post comments (안 돌림)']);
    assert.equal(notRun.line, 7, 'the evidence line is still the check');
    assert.doesNotMatch(notRun.summary, /no linked test|연결된 검사 없음/);
    assert.match(notRun.summary, lang === 'en' ? /not run/ : /돌리지 않/);
    assert.match(notRun.chain.find((s) => s.kind === 'test')!.text, lang === 'en' ? /^not run · / : /^돌리지 않음 · /);
    const none = runCheck({ ...base, tests: [] }).rows[0];
    assert.equal(none.reason, lang === 'en' ? 'no test' : '검사 없음');
    // 돌려서 통과했다고 바꾸면 확인됨
    assert.equal(runCheck({ ...base, tests: [{ name: 'a banned user cannot post comments', status: 'pass' }] }).rows[0].overall, '확인됨');
  }
});

test('a state that nothing reads gets its own reason', () => {
  for (const lang of ['en', 'ko'] as const) {
    const r = runCheck({ requirements: 'A banned user cannot post comments', fileName: 'src/comments.ts', code: BAN(''), tests: [{ name: 'a banned user cannot post comments', status: 'pass' }], lang }).rows[0];
    assert.equal(r.overall, '미확인');
    assert.equal(r.reason, lang === 'en' ? 'nothing reads that state' : '그 상태를 읽는 조건 없음');
    assert.match(r.todo[0].action, lang === 'en' ? /no condition reads it/ : /읽는 조건이 없다/);
  }
});

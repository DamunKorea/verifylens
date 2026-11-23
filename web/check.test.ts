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
    // 적은 테스트가 하나도 없으면 「검사 결과 없음」, 적었는데 이어지지 않으면 「검사 없음」 (0.25.2)
    const none = runCheck({ ...base, tests: [] }).rows[0];
    assert.equal(none.reason, lang === 'en' ? 'no test results' : '검사 결과 없음');
    const unlinked = runCheck({ ...base, tests: [{ name: 'exports a csv file', status: 'pass' }] }).rows[0];
    assert.equal(unlinked.reason, lang === 'en' ? 'no test' : '검사 없음');
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

// 0.25.0: 문장에서 읽은 조각을 근거 사슬의 요구사항 칸에 보인다 (X 에서 세 사람이 「LLM 없이 문장을 어떻게 검사로?」라고 물음)
import { sentencePieces } from '../src/readout.ts';
import { parseRequirements } from '../src/requirements.ts';

test('the requirement step shows what was read from the sentence', () => {
  const read = (line: string, lang: 'en' | 'ko') => sentencePieces(parseRequirements(`- R1: ${line}`)[0], lang);
  assert.deepEqual(read('Lock the account after 5 consecutive failed logins', 'en'), ['after 5 times', 'looks for: lock · account · consecutive · failed · logins']);
  assert.deepEqual(read('A banned user cannot post comments', 'en'), ['must block', 'state: banned', 'looks for: banned · post · comments']);
  assert.deepEqual(read('Return 404 when the project does not exist', 'en'), ['HTTP 404', 'needs a check', 'looks for: project · exist']);
  assert.deepEqual(read('A coupon can be used only once', 'ko'), ['한 번만', '찾는 낱말: unique · coupon · use']);
  assert.deepEqual(read('관리자만 공지를 올릴 수 있다', 'ko'), ['그것만 허용', '찾는 낱말: admin · notice']);
  // 키워드를 적으면 키워드 그대로
  assert.deepEqual(read('A locked account cannot log in | keywords: locked, login', 'en'), ['must block', 'state: locked', 'looks for: locked · login']);
  // 결과 카드의 근거 사슬에도 붙는다
  const ex = EXAMPLES.find((e) => e.id === 'login')!;
  const r = runCheck({ requirements: ex.requirements.en, fileName: ex.fileName, code: ex.code, tests: ex.tests.en, lang: 'en' });
  const step = r.rows.find((x) => x.overall === '확인됨')!.chain[0];
  assert.equal(step.kind, 'req');
  assert.ok(step.pieces?.includes('must block'), JSON.stringify(step.pieces));
});

// 0.25.1: 코드 줄 표시도 「검사 없음」(이어진 검사 없음)과 「검사 안 돌림」(이어졌지만 결과 없음)을 나눈다 (전에는 둘 다 「검사 미실행」)
test('line notes say "no test" or "test not run", like the card', () => {
  for (const lang of ['en', 'ko'] as const) {
    const none = runCheck({ requirements: 'A banned user cannot post comments', fileName: 'src/comments.ts', code: BAN(GUARD), tests: [], lang });
    assert.ok(none.notes.every((n) => !/미실행|no test run/.test(n.note)), JSON.stringify(none.notes));
    assert.match(none.notes[0].note, lang === 'en' ? /no test results/ : /검사 결과 없음/);
    const notRun = runCheck({ requirements: 'A banned user cannot post comments', fileName: 'src/comments.ts', code: BAN(GUARD), tests: [{ name: 'a banned user cannot post comments', status: 'notrun' }], lang });
    assert.match(notRun.notes[0].note, lang === 'en' ? /test not run/ : /검사 안 돌림/);
  }
  // 한국어 「5회 실패하면」: 그 횟수에 닿을 때
  assert.deepEqual(sentencePieces(parseRequirements('- R1: 연속 5회 실패하면 계정을 잠근다')[0], 'ko')[0], '5회째에');
  assert.deepEqual(sentencePieces(parseRequirements('- R1: 연속 5회 실패하면 계정을 잠근다')[0], 'en')[0], 'on the 5th time');
});

// 실제 공개 PR 에서 근거 줄은 실제로 고친 줄인데 PR 의 새 검사 이름이 문장과 달라 「검사 없음」으로 남았다 (0.26.0).
// 이번 변경이 새로 더한 검사 가운데, 근거 파일과 짝인 검사 파일의 것이고 요구사항 · 근거 줄과 낱말을 나누면 잇는다.
test('a change’s own new tests link to its requirement when the names differ', () => {
  const code = 'export function isValidCode(code: string): boolean {\n  if (code.trim().length < 3) return false;\n  return true;\n}\n';
  const spec = "import { isValidCode } from './coupon';\nit('rejects a code made of spaces', () => { expect(isValidCode('   ')).toBe(false); });\n";
  const tests = [{ name: 'rejects a code made of spaces', status: 'pass' as const }];
  const run = (files: Record<string, string>, baseFiles?: Record<string, string>) =>
    runCheck({ requirements: '- R1: Reject coupon codes shorter than 3 characters', fileName: '', code: '', tests, lang: 'en', files, baseFiles }).rows[0];
  // 바뀐 것을 모르면(직접 붙여 넣은 코드) 이름으로만 잇는다
  assert.equal(run({ 'src/coupon.ts': code, 'src/coupon.test.ts': spec }).overall, '미확인');
  // 이번 변경이 새로 더한 검사 (짝인 파일)
  const linked = run({ 'src/coupon.ts': code, 'src/coupon.test.ts': spec }, {});
  assert.equal(linked.overall, '확인됨');
  assert.deepEqual(linked.tests, ['✓ rejects a code made of spaces']);
  // 원래 있던 검사는 「새로 더한 검사」가 아니다
  assert.equal(run({ 'src/coupon.ts': code, 'src/coupon.test.ts': spec }, { 'src/coupon.test.ts': spec }).overall, '미확인');
  // 짝이 아닌 파일의 새 검사는 잇지 않는다
  assert.equal(run({ 'src/coupon.ts': code, 'src/cart.test.ts': spec }, {}).overall, '미확인');
  // 숫자 없는 요구사항은 새 검사를 잇되 「확인됨」이라 하지 않는다 (근거 줄이 엉뚱해도 검사가 통과하면 「확인됨」이 됐다 — 실제 PR 시험 h3)
  const add = 'export function addCoupon(code: string): void {\n  if (code.trim() === "") throw new Error("blank");\n  saved.push(code);\n}\nconst saved: string[] = [];\n';
  const addSpec = "import { addCoupon } from './coupon';\nit('throws for a code of spaces', () => { expect(() => addCoupon('  ')).toThrow(); });\n";
  const blank = runCheck({ requirements: '- R1: Blank coupon codes are refused', fileName: '', code: '', tests: [{ name: 'throws for a code of spaces', status: 'pass' }], lang: 'en', files: { 'src/coupon.ts': add, 'src/coupon.test.ts': addSpec }, baseFiles: {} }).rows[0];
  assert.equal(blank.overall, '미확인');
  assert.deepEqual(blank.tests, ['✓ throws for a code of spaces']);
  assert.deepEqual(blank.todo.map((t) => t.label), ['linked only by this change’s new tests']);
});

// 설정값 줄(timeout: options.timeout ?? 10_000)은 문장 전체의 낱말을 가져, 숫자 없는 요구사항의 근거로 엉뚱하게 뽑혔다 (실제 PR 시험 ky)
test('a settings line is not the evidence for a requirement without a number', () => {
  const code = 'export function createClient(options: { timeout?: number; hooks?: { init?: Array<() => void> } }) {\n  const settings = { ...options, hooks: { init: options.hooks?.init ?? [] }, timeout: options.timeout ?? 10_000 };\n  for (const hook of settings.hooks.init) hook();\n  return settings;\n}\n';
  const row = runCheck({ requirements: '- R1: Run the init hooks when a client is created', fileName: 'client.ts', code, tests: [{ name: 'runs init hooks when a client is created', status: 'pass' }], lang: 'en' }).rows[0];
  assert.notEqual(row.line, 2);
  // 숫자를 말하는 요구사항에는 그대로 근거다
  const timed = runCheck({ requirements: '- R1: Requests time out after 10 seconds', fileName: 'client.ts', code, tests: [], lang: 'en' }).rows[0];
  assert.equal(timed.line, 2);
});

// PR 주소로 볼 때(바뀐 줄을 앎): 근거 줄이 이번 변경 밖이면 「확인됨」이라 하지 않는다 (실제 PR 네 저장소: 그런 확인됨 12개 가운데 11개가 틀린 줄)
test('with a pull request, evidence outside the change is not Verified', () => {
  const code = 'export function login(user: { locked: boolean }) {\n  if (user.locked) throw new Error("LOCKED");\n  return true;\n}\n\nexport function logout(user: { id: string }) {\n  if (!user.id) throw new Error("NO_USER");\n  return true;\n}\n';
  const run = (changed?: Record<string, number[] | null>) =>
    runCheck({ requirements: '- R1: A locked account cannot log in', fileName: '', code: '', tests: [{ name: 'a locked account cannot log in', status: 'pass' }], lang: 'en', files: { 'src/auth.ts': code }, changed }).rows[0];
  // 바뀐 줄을 모르면(직접 붙여 넣은 코드) 그대로
  assert.equal(run().overall, '확인됨');
  // 근거 줄(2)이 바뀐 줄이면 그대로
  assert.equal(run({ 'src/auth.ts': [2] }).overall, '확인됨');
  // 이번 변경은 logout 만 바꿈 → 근거 줄이 변경 밖
  const outside = run({ 'src/auth.ts': [7] });
  assert.equal(outside.overall, '미확인');
  assert.deepEqual(outside.todo.map((t) => t.label), ['evidence line is outside this change']);
});

// 화면 글 (JetBrains 세션이 0.26.0 엔진에서 찾음): 판정하지 않는 줄은 찾지 않았다고 말하고, 통과인데 미확인이면 줄 끝에 까닭을 적는다
test('lines that are not judged say so, and a passing test that stays Not verified says why on the code line', () => {
  const add = 'export function addCoupon(code: string): void {\n  if (code.trim() === "") throw new Error("blank");\n  saved.push(code);\n}\nconst saved: string[] = [];\n';
  const proc = runCheck({ requirements: '- R1: Add tests for blank coupon codes', fileName: 'coupon.ts', code: add, tests: [], lang: 'en' }).rows[0];
  assert.equal(proc.summary, 'not a code behavior (a process step)');
  assert.deepEqual(proc.chain[0].pieces, ['process step — not judged']);
  assert.equal(proc.chain.find((s) => s.kind === 'code')?.text, 'not looked for (a line that is not judged)');
  const spec = "import { addCoupon } from './coupon';\nit('throws for a code of spaces', () => { expect(() => addCoupon('  ')).toThrow(); });\n";
  const own = runCheck({ requirements: '- R1: Blank coupon codes are refused', fileName: '', code: '', tests: [{ name: 'throws for a code of spaces', status: 'pass' }], lang: 'en', files: { 'src/coupon.ts': add, 'src/coupon.test.ts': spec }, baseFiles: {} });
  assert.match(own.notes.find((n) => n.reqId === 'R1')!.note, /tests pass · linked only by this change’s new tests/);
});

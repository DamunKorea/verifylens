// 여러 업무 영역의 사례 묶음. 틀린 코드를 「확인됨」이라고 하거나, 맞는 코드를 「다름」이라고 하면 실패한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, allRows, score } from './cases/run.ts';
import { numbersIn, parseConstraints, undecidedAction, undecidedLabel } from '../../src/numeric.ts';
import { analyzeFile } from '../../src/analyze.ts';
import { stem } from '../../src/tokens.ts';
import { analyzeFiles, evaluate } from '../../src/engine.ts';
import { parseRequirements } from '../../src/requirements.ts';
import { undecidedReasons } from '../../src/summary.ts';

const wrong = (rows: ReturnType<typeof allRows>) => rows.filter((r) => r.got !== r.v.expect).map((r) => `${r.c.id} / ${r.v.name}: 기대 ${r.v.expect}, 결과 ${r.got}`);

test('cases with keywords: every verdict is the expected one', () => {
  assert.deepEqual(wrong(allRows(true, CASES)), []);
});

test('unseen cases with keywords: every verdict is the expected one', () => {
  assert.deepEqual(wrong(allRows(true, HOLDOUT)), []);
  assert.deepEqual(wrong(allRows(true, HOLDOUT2)), []);
  assert.deepEqual(wrong(allRows(true, HOLDOUT3)), []);
  assert.deepEqual(wrong(allRows(true, HOLDOUT4)), []);
});

test('without keywords nothing wrong is called verified, and nothing right is called different', () => {
  for (const cases of [CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13]) {
    const s = score(allRows(false, cases));
    assert.equal(s.falseVerified, 0);
    assert.equal(s.falseAlarm, 0);
  }
});

// 이 두 묶음은 일부러 다 맞히게 고치지 않는다. 남은 「미확인」은 알려진 한계로 둔다.
test('the latest unseen batches never call wrong code verified when keywords are given', () => {
  for (const cases of [HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13]) {
    const s = score(allRows(true, cases));
    assert.equal(s.falseVerified, 0);
    assert.equal(s.falseAlarm, 0);
  }
});

test('a second default with the same name and another value keeps it unverified (nanoid)', () => {
  const code = 'export let customAlphabet = (alphabet, defaultSize = 45) => {\n  return (size = defaultSize) => size\n}\nexport let nanoid = (size = 21) => size\n';
  const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.js': code }, tests: [{ name: 'size id 21 rule', status: 'pass', message: '' }] });
  const r = evaluate([set], parseRequirements('- R1: 기본 ID 길이는 21자다 | keywords: size, id'), '.', 'main');
  assert.equal(r.summaries[0].overall, '미확인');
  assert.deepEqual(undecidedReasons(r, r.summaries[0]), ['conflict']);
  // 같은 값만 있으면 그대로 확인된다
  const same = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.js': code.replace('= 45', '= 21') }, tests: [{ name: 'size id 21 rule', status: 'pass', message: '' }] });
  assert.equal(evaluate([same], parseRequirements('- R1: 기본 ID 길이는 21자다 | keywords: size, id'), '.', 'main').summaries[0].overall, '확인됨');
});

test('an unverified requirement says which kind of reason stopped it', () => {
  const kinds = (req: string, code: string, tests: string[] = []) => {
    const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.ts': code }, tests: tests.map((name) => ({ name, status: 'pass' as const, message: '' })) });
    const r = evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main');
    return undecidedReasons(r, r.summaries[0]);
  };
  assert.deepEqual(kinds('Coupons expire after 7 days', 'export const expired = (daysSinceIssued: number) => daysSinceIssued >= 7;\n'), ['edge', 'no-test']);
  assert.deepEqual(kinds('The upload size limit is about 8mb', 'export const tooBig = (fileSize: number) => fileSize >= 8 * 1024 * 1024;\n', ['upload size 8 rule']), ['wording', 'no-test']);
  assert.deepEqual(kinds('Quantity must be between 1 and 10', 'export const ok = (quantity: number) => quantity > 1 && quantity < 10;\n', ['quantity 1 10']), ['edge']);
  assert.deepEqual(kinds('Admins can refund orders', 'export function refund(order: unknown) { return order; }\n'), ['no-test']);
  assert.equal(undecidedLabel('conflict', 'ko'), '다른 값이 함께 있음');
  assert.match(undecidedAction('wording', 'en'), /at least/);
});

test('sign-up rules: a check must exist, "only once" is not a count, "6 digits" is exact', () => {
  const run = (req: string, code: string, test: string) => {
    const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.ts': code }, tests: [{ name: test, status: 'pass', message: '' }] });
    const r = evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main');
    return { overall: r.summaries[0].overall, reasons: undecidedReasons(r, r.summaries[0]) };
  };
  // 약관 검사가 없는 코드: 함수 이름에 낱말이 겹쳐도 확인됨이 아니다
  const none = run('Users must accept the terms to sign up | keywords: terms, accepted', 'export function signup(input: { acceptedTerms: boolean }) {\n  return users.create(input);\n}\n', 'signup without accepting the terms is rejected');
  assert.equal(none.overall, '미확인');
  assert.ok(none.reasons.includes('no-check'));
  assert.deepEqual(parseConstraints('같은 이메일로는 한 번만 가입할 수 있다'), []);
  assert.deepEqual(parseConstraints('하루에 한 번만 응모할 수 있다').map((c) => c.value), [1]);
  assert.deepEqual(parseConstraints('The verification code has 6 digits').map((c) => `${c.value}:${c.rel}`), ['6:eq']);
  assert.deepEqual(parseConstraints('PIN 은 정확히 4자리 숫자다').map((c) => `${c.value}:${c.rel}`), ['4:eq']);
});

test('time wording: "N days after", "N hours before", "N per minute", "when it is 0"', () => {
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}:${c.rel}${c.window ? ':window' : ''}${c.trigger ? ':trigger' : ''}`);
  assert.deepEqual(rel('The trial ends 14 days after signup'), ['14:after']);
  assert.deepEqual(rel('예약은 시작 1시간 전까지만 할 수 있다'), ['1:gte']);
  assert.deepEqual(rel('같은 계정은 1분에 최대 5번까지 로그인을 시도할 수 있다'), ['1:value:window', '5:lte']);
  assert.deepEqual(rel('An order cannot be placed when the stock is 0'), ['0:eq:trigger']);
  assert.deepEqual(rel('재고가 0이면 주문할 수 없다'), ['0:eq:trigger']);
});

test('a time difference with no name is judged, and "0이면" needs the condition to cover 0', () => {
  const run = (req: string, code: string, test: string) => {
    const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.ts': code }, tests: [{ name: test, status: 'pass', message: '' }] });
    return evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main').summaries[0].overall;
  };
  const link = (h: number) => `export const linkExpired = (sentAt: number) => Date.now() - sentAt > ${h} * 60 * 60 * 1000;
`;
  assert.equal(run('인증 링크는 24시간 뒤 만료된다 | keywords: link, expired', link(12), 'verification link expires after 24 hours'), '다름');
  const stock = (op: string) => `export function placeOrder(stock: number) {
  if (stock ${op} 0) throw new Error('OUT');
}
`;
  assert.equal(run('An order cannot be placed when the stock is 0 | keywords: stock, order', stock('<='), 'an order with no stock is rejected'), '확인됨');
  assert.equal(run('An order cannot be placed when the stock is 0 | keywords: stock, order', stock('<'), 'an order with no stock is rejected'), '다름');
});

test('refusal wording, uniqueness and settings named for another thing', () => {
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}:${c.rel}:${c.validSide}`);
  assert.deepEqual(rel('Orders under 10,000 won are not accepted'), ['10000:lt:upper']);
  assert.deepEqual(parseConstraints('상품마다 리뷰는 한 번만 쓸 수 있다'), []);
  const run = (req: string, code: string, test: string) => {
    const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.ts': code }, tests: [{ name: test, status: 'pass', message: '' }] });
    return evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main').summaries[0].overall;
  };
  // 반품비 상수는 「배송비」 요구사항의 근거가 아니다
  assert.equal(run('배송비는 3,000원이다 | keywords: shipping, fee', 'export const RETURN_FEE = 3000;\n', 'shipping fee is 3000'), '미확인');
  assert.equal(run('부가세는 10%다 | keywords: vat, rate', 'export const VAT_RATE = 0.08;\n', 'vat is 10%'), '다름');
  // 한 사람당 한 번: 막는 코드가 없으면 확인됨이 아니다
  assert.equal(run('Each coupon can be used once per person | keywords: coupon, used', 'export function redeem(coupon: { usedBy: Set<string> }, userId: string) {\n  coupon.usedBy.add(userId);\n}\n', 'a coupon used twice by the same person is rejected'), '미확인');
});

test('word forms of the same word meet', () => {
  for (const group of [['retry', 'retries', 'retried', 'retrying'], ['reserve', 'reserves', 'reserved', 'reserving'], ['delete', 'deleted', 'deleting'], ['run', 'running'], ['stop', 'stopped']]) {
    assert.equal(new Set(group.map(stem)).size, 1, group.join(', '));
  }
});

test('range wording is read in both languages', () => {
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}:${c.rel}`);
  assert.deepEqual(rel('up to and including 8mb'), ['8:lte']);
  assert.deepEqual(rel('up to but not including 8mb'), ['8:lt']);
  assert.deepEqual(rel('must not exceed 8mb'), ['8:lte']);
  assert.deepEqual(rel('Nicknames must be 3 to 20 characters'), ['3:gte', '20:lte']);
  assert.deepEqual(rel('from 1 to 10 items'), ['1:gte', '10:lte']);
  assert.deepEqual(rel('수량은 1~10개다'), ['1:gte', '10:lte']);
  assert.deepEqual(rel('수량은 양수여야 한다'), ['0:gt']);
});

test('numbers in requirements are read the way people write them', () => {
  assert.deepEqual(numbersIn('주문 금액이 50,000원 이상'), [50000]);
  assert.deepEqual(numbersIn('5만 원 이상'), [50000]);
  assert.deepEqual(numbersIn('비밀번호를 다섯 번 틀리면'), [5]);
  assert.deepEqual(numbersIn('fails three times'), [3]);
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}:${c.rel}`);
  assert.deepEqual(rel('14세 미만'), ['14:lt']);
  assert.deepEqual(rel('8자 이상이어야 한다'), ['8:gte']);
  assert.deepEqual(rel('최대 20개까지'), ['20:lte']);
  assert.deepEqual(rel('10개 초과'), ['10:gt']);
  assert.deepEqual(rel('no more than 5 files'), ['5:lte']);
  assert.deepEqual(rel('more than 5 files'), ['5:gt']);
  assert.deepEqual(rel('연속 5회 실패하면'), ['5:count']);
  assert.deepEqual(rel('1개 이상 10개 이하'), ['1:gte', '10:lte']);
  assert.deepEqual(rel('최소 주문 금액은 10,000원이다'), ['10000:gte']);
  assert.deepEqual(rel('가입 후 30일이 넘으면'), ['30:gt']);
  assert.deepEqual(rel('한 번에 최대 20건까지'), ['20:lte']);
});

test('numbers that are not conditions are not treated as requirements on the code', () => {
  assert.deepEqual(parseConstraints('HTTP 400을 돌려준다'), []);
  assert.deepEqual(parseConstraints('2단계 인증을 켠 사용자'), []);
  assert.deepEqual(parseConstraints('OAuth 2.0 로그인'), []);
});

test('constants are read through arithmetic, objects and readonly fields, but not from changing fields', () => {
  const a = analyzeFile('a.ts', 'const MIN = 60;\nconst MS = MIN * 1000;\nconst L = { a: { b: 7 } } as const;\nclass C { readonly r = 3; n = 0; static s = 4; }\n', null);
  assert.equal(a.constants.MS, 60000);
  assert.equal(a.constants['L.a.b'], 7);
  assert.equal(a.constants['this.r'], 3);
  assert.equal(a.constants['C.s'], 4);
  assert.equal(a.constants['this.n'], undefined);
});

// 여러 업무 영역의 사례 묶음. 틀린 코드를 「확인됨」이라고 하거나, 맞는 코드를 「다름」이라고 하면 실패한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, HOLDOUT14, HOLDOUT15, HOLDOUT16, HOLDOUT17, HOLDOUT18, HOLDOUT19, HOLDOUT20, HOLDOUT21, HOLDOUT22, HOLDOUT23, HOLDOUT24, HOLDOUT25, HOLDOUT26, HOLDOUT27, HOLDOUT28, HOLDOUT29, HOLDOUT30, HOLDOUT31, HOLDOUT32, HOLDOUT33, HOLDOUT34, HOLDOUT35, allRows, score } from './cases/run.ts';
import type { EvVariant } from './cases/holdout33.ts';
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
  for (const cases of [CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, HOLDOUT14, HOLDOUT15, HOLDOUT16, HOLDOUT17, HOLDOUT18, HOLDOUT19, HOLDOUT20, HOLDOUT21, HOLDOUT22, HOLDOUT23, HOLDOUT24, HOLDOUT25, HOLDOUT26, HOLDOUT27, HOLDOUT28, HOLDOUT29, HOLDOUT30, HOLDOUT31, HOLDOUT32]) {
    const s = score(allRows(false, cases));
    assert.equal(s.falseVerified, 0);
    assert.equal(s.falseAlarm, 0);
  }
});

// 이 두 묶음은 일부러 다 맞히게 고치지 않는다. 남은 「미확인」은 알려진 한계로 둔다.
test('the latest unseen batches never call wrong code verified when keywords are given', () => {
  for (const cases of [HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, HOLDOUT14, HOLDOUT15, HOLDOUT16, HOLDOUT17, HOLDOUT18, HOLDOUT19, HOLDOUT20, HOLDOUT21, HOLDOUT22, HOLDOUT23, HOLDOUT24, HOLDOUT25, HOLDOUT26, HOLDOUT27, HOLDOUT28, HOLDOUT29, HOLDOUT30, HOLDOUT31, HOLDOUT32]) {
    const s = score(allRows(true, cases));
    assert.equal(s.falseVerified, 0);
    assert.equal(s.falseAlarm, 0);
  }
});

// 근거 줄(11/22, 데모 PR 에서 찾음): 막는 요구사항의 진짜 검사 줄 옆에, 블록 안에서 그 상태를 정하기만 하는 if 블록이 있는 코드.
// 서른네 번째 묶음은 고치면서 본 것이라 모두 맞아야 한다. 고친 뒤 처음 쓴 두 묶음은 남은 것이 알려진 한계 목록과 같아야 한다 (docs/known-mistakes.md).
test('evidence line: a block that only sets the state is not the check for it', () => {
  for (const kw of [true, false]) {
    assert.deepEqual(wrong(allRows(kw, HOLDOUT33)), []);
    assert.deepEqual(wrong(allRows(kw, HOLDOUT34)), ['ev2-lock-method / 잠금 검사 있음: 기대 확인됨, 결과 미확인', 'ev2-door / 잠금 검사 없음: 기대 미확인, 결과 확인됨']);
    assert.deepEqual(wrong(allRows(kw, HOLDOUT35)), ['ev3-enum / 취소 검사 없음: 기대 미확인, 결과 확인됨', 'ev3-helper / 도우미를 부르지 않음: 기대 미확인, 결과 확인됨']);
  }
  // 「확인됨」이 맞는 코드에서 근거 줄이 진짜 검사다 (메서드로 잠그는 사례는 한계)
  for (const set of [HOLDOUT33, HOLDOUT34, HOLDOUT35]) {
    for (const c of set) {
      for (const v of c.variants as EvVariant[]) {
        if (!v.ev || c.id === 'ev2-lock-method') continue;
        for (const kw of [true, false]) {
          const s = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { [c.file ?? 'src/feature.ts']: v.code }, tests: [{ name: c.test, status: 'pass', message: '' }] });
          const r = evaluate([s], parseRequirements(kw ? `- R1: ${c.req} | keywords: ${c.keywords}` : `- R1: ${c.req}`), '.', 'main');
          assert.ok(r.sets[0].perReq.R1.evidence.unit?.text.includes(v.ev), `${c.id} (${kw ? 'keywords' : 'auto'}): ${r.sets[0].perReq.R1.evidence.unit?.text}`);
        }
      }
    }
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

// 0.13.0: 홍보 세션 사용성 시험(11/20)에서 나온 거짓 경보와 그 둘레
const verdict = (req: string, code: string, test = '') => {
  const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/a.ts': code }, tests: test ? [{ name: test, status: 'pass', message: '' }] : [] });
  return evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main').summaries[0];
};

test('a string length is not compared with a count of times, and a list length is not compared with characters', () => {
  const pw = "export function validatePassword(pw: string) {\n  if (pw.length < 8 || pw.length >= 64) throw new Error('LEN');\n}\n";
  // 비밀번호 길이 줄은 「하루에 3번」과 상관없다: 횟수 검사가 없으면 「다름」이 아니라 「미확인」
  const none = verdict('비밀번호 재설정 메일은 하루에 3번까지만 보낼 수 있다', pw + "export function sendResetMail(u: { sentToday: number }) {\n  u.sentToday++;\n}\n");
  assert.equal(none.overall, '미확인');
  // 목록의 길이(cart.items.length > 30)는 「30자까지」의 근거가 아니다
  const chars = verdict('장바구니 상품 이름은 30자까지 보여 준다', "export function checkCart(cart: { items: string[] }) {\n  if (cart.items.length > 30) throw new Error('FULL');\n}\nexport const shortName = (name: string) => (name.length > 40 ? name.slice(0, 40) : name);\n", 'product names are cut at 30 characters');
  assert.notEqual(chars.overall, '확인됨');
});

test('counting first and then rejecting does not count the rejected call', () => {
  const code = (max: number) => `const MAX_RESET_PER_DAY = ${max};\nexport function sendResetMail(u: { sentToday: number }) {\n  u.sentToday++;\n  if (u.sentToday > MAX_RESET_PER_DAY) throw new Error('TOO_MANY');\n}\n`;
  const req = '비밀번호 재설정 메일은 하루에 3번까지만 보낼 수 있다 | keywords: reset, sentToday';
  assert.equal(verdict(req, code(3), 'reset mail is limited to 3 per day').overall, '확인됨');
  assert.equal(verdict(req, code(4), 'reset mail is limited to 3 per day').overall, '다름');
});

test('"once every N days" means N days must pass, not a count of one', () => {
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}${c.unit}:${c.rel}`);
  assert.deepEqual(rel('닉네임은 30일에 한 번만 바꿀 수 있다'), ['30day:gte']);
  assert.deepEqual(rel('A user can export their data once every 24 hours'), ['24hour:gte']);
});

test('a test that names the first rejected attempt is linked to the limit', () => {
  const code = "export function checkOtp(s: { attempts: number }) {\n  if (s.attempts >= 5) throw new Error('LOCKED');\n  s.attempts++;\n}\n";
  const s = verdict('An OTP code can be tried at most 5 times', code, 'a sixth otp attempt is rejected');
  assert.equal(s.overall, '확인됨');
  // 「one second」의 second 는 서수가 아니다
  assert.equal(verdict('An OTP code can be tried at most 5 times', code, 'otp check takes one second').overall, '미확인');
});

// 0.13.0: 홍보 세션 사용성 시험 2 · 3차(여러 파일 저장소)에서 나온 「확인됨」 오판
const many = (req: string, files: Record<string, string>, test = '') => {
  const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files, tests: test ? [{ name: test, status: 'pass', message: '' }] : [] });
  return evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main').summaries[0];
};

test('a line in another file that only shares the time unit or a person\'s age is not evidence', () => {
  const lock = { 'src/lock.ts': 'const LOCK_MINUTES = 15;\nexport function onLoginFailure(u: { failures: number }) {\n  u.failures += 1;\n}\n' };
  const token = "import jwt from 'jsonwebtoken';\nexport function issueAccessToken(id: string, secret: string) {\n  return jwt.sign({ sub: id }, secret, { expiresIn: '1h' });\n}\n";
  const s = many('로그인 토큰은 15분 뒤 만료된다', { 'src/token.ts': token, ...lock }, 'login token expires after 15 minutes');
  assert.notEqual(s.overall, '확인됨');
  // 가입 양식의 나이(age.min(14))는 「무료 체험은 14일」의 근거가 아니다: 체험 일수 설정(7)과 견준다
  const signup = { 'src/signup.ts': "import { z } from 'zod';\nexport const signupSchema = z.object({ age: z.number().int().min(14) });\n" };
  const trial = { 'src/trial.ts': 'export const TRIAL_DAYS = 7;\nexport const trialEndsAt = (start: number) => start + TRIAL_DAYS * 86400000;\n' };
  assert.equal(many('The free trial lasts 14 days', { ...signup, ...trial }, 'the free trial lasts 14 days').overall, '다름');
});

test('a setting with a generic name is linked through the statement that sets it', () => {
  const session = "import session from 'express-session';\nexport const sessionMiddleware = session({ secret: 'dev', cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } });\n";
  const rejoin = 'export function canRejoin(leftAt: number, now: number) {\n  const daysSinceLeft = (now - leftAt) / 86400000;\n  if (daysSinceLeft < 30) return false;\n  return true;\n}\n';
  assert.equal(many('Sessions expire after 7 days', { 'src/session.ts': session, 'src/rejoin.ts': rejoin }, 'sessions expire after 7 days').overall, '확인됨');
});

test('"only one per person" is not met by a condition that compares another count', () => {
  const bulk = "export function bulkUpdate(req: { body: { items: string[] } }, res: any) {\n  if (req.body.items.length > 100) return res.status(400).json({ error: 'TOO_MANY' });\n  return res.json({ ok: true });\n}\n";
  const review = 'export async function addReview(db: any, userId: string, productId: string) {\n  return db.review.create({ data: { userId, productId } });\n}\n';
  assert.notEqual(many('상품 리뷰는 한 사람당 하나만 쓸 수 있다', { 'src/bulk.ts': bulk, 'src/review.ts': review }, 'one review per user per product').overall, '확인됨');
});

test('a fraction is not within one of a whole percent, and the Korean particle follows the last sound', () => {
  const rate = (v: string) => many('포인트 적립률은 결제 금액의 1%다', { 'src/points.ts': `export const POINT_RATE = ${v};\nexport const points = (paid: number) => paid * POINT_RATE;\n` }, 'points are 1% of the payment');
  assert.equal(rate('0.01').overall, '확인됨');
  assert.equal(rate('0.02').overall, '다름');
  const lock = many('잠금 시간은 10분이다', { 'src/lock.ts': 'export const LOCK_MINUTES = 15;\n' }, 'lock lasts 10 minutes');
  assert.match(lock.notes.join(' '), /15분으로 설정됨/);
});

// ---------------------------------------------------------------- 0.15.0: X 에서 받은 실제 버그 세 가지 (잘못된 입력 · 두 번 제출 · 정액 쿠폰)
test('"even if pressed twice" is a scene, not a limit of two', () => {
  assert.deepEqual(parseConstraints('결제 버튼을 두 번 눌러도 주문은 하나만 생긴다'), []);
  assert.deepEqual(numbersIn('결제 버튼을 두 번 눌러도 주문은 하나만 생긴다'), []);
  assert.deepEqual(numbersIn('비밀번호를 5번 틀리면 잠근다'), [5]);
});

test('a check in a function for another feature is not evidence for this one', () => {
  const news = { 'src/newsletter.ts': "const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;\nexport function subscribe(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n}\n" };
  const noCheck = 'export function signup(email: string) {\n  return { email };\n}\n';
  const s = many('이메일 형식이 올바르지 않으면 가입을 거부한다 | keywords: email, signup', { 'src/signup.ts': noCheck, ...news }, 'signup rejects an invalid email');
  assert.equal(s.overall, '미확인');
});

test('a schema that takes the field without a check keeps a rejection rule unverified', () => {
  const news = { 'src/newsletter.ts': "export function subscribe(email: string) {\n  if (!email.includes('@')) throw new Error('INVALID_EMAIL');\n}\n" };
  const schema = (chain: string) => ({ 'src/schema.ts': `import { z } from 'zod';\nexport const signupSchema = z.object({ email: ${chain}, name: z.string() });\n`, ...news });
  const bare = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: schema('z.string()'), tests: [{ name: 'an invalid email address is rejected', status: 'pass', message: '' }] });
  const r = evaluate([bare], parseRequirements('- R1: Invalid email addresses are rejected'), '.', 'main');
  assert.equal(r.summaries[0].overall, '미확인');
  assert.deepEqual(undecidedReasons(r, r.summaries[0]), ['unchecked-input']);
  assert.equal(undecidedLabel('unchecked-input', 'en'), 'accepted unchecked elsewhere');
  assert.equal(many('Invalid email addresses are rejected', schema('z.string().email()'), 'an invalid email address is rejected').overall, '확인됨');
});

test('a test that only does it once is not evidence for "twice still makes one"', () => {
  const order = 'export async function placeOrder(db: any, paymentId: string) {\n  const existing = await db.order.findUnique({ where: { paymentId } });\n  if (existing) return existing;\n  return db.order.create({ data: { paymentId } });\n}\n';
  assert.equal(many('결제 버튼을 두 번 눌러도 주문은 하나만 생긴다', { 'src/order.ts': order }, 'paying twice creates only one order').overall, '확인됨');
  assert.equal(many('Submitting the same payment twice creates only one order', { 'src/order.ts': order }, 'creates an order after payment').overall, '미확인');
  // 「사용한 링크는 거부」도 다시 쓰는 것을 시험한다
  const link = "export function useResetLink(link: { used: boolean }) {\n  if (link.used) throw new Error('LINK_USED');\n  link.used = true;\n}\n";
  assert.equal(many('A password reset link can be used only once | keywords: reset, used', { 'src/reset.ts': link }, 'a used reset link is rejected').overall, '확인됨');
});

test('a coupon amount is a setting, and "checked out" is checkout', () => {
  const coupon = (v: number) => ({ 'src/coupon.ts': `export const FLAT_COUPON = ${v};\nexport const applyFlat = (total: number) => Math.max(0, total - FLAT_COUPON);\n` });
  assert.equal(many('5,000원 정액 쿠폰은 결제 금액에서 5,000원을 뺀다', coupon(5000), 'a 5000 won flat coupon takes 5000 off the total').overall, '확인됨');
  assert.equal(many('5,000원 정액 쿠폰은 결제 금액에서 5,000원을 뺀다', coupon(3000), 'a 5000 won flat coupon takes 5000 off the total').overall, '다름');
  const checkout = "export function checkout(cart: { checkedOutAt?: number }) {\n  if (cart.checkedOutAt) throw new Error('ALREADY_CHECKED_OUT');\n  cart.checkedOutAt = Date.now();\n}\n";
  assert.equal(many('Each cart can be checked out only once', { 'src/checkout.ts': checkout }, 'a second checkout of the same cart is rejected').overall, '확인됨');
});

// ---------------------------------------------------------------- 0.16.0: 스키마 검사 · 정액 계산식 · 키로 막는 중복
test('a format check in a schema is evidence for a rejection rule', () => {
  const schema = (chain: string) => ({ 'src/schemas/order.ts': `import { z } from 'zod';\nexport const orderSchema = z.object({ orderId: ${chain}, note: z.string() });\n` });
  assert.equal(many('Requests with an invalid order id are rejected | keywords: orderId, schema', schema('z.string().uuid()'), 'rejects an order id that is not a uuid').overall, '확인됨');
  assert.equal(many('Requests with an invalid order id are rejected | keywords: orderId, schema', schema('z.string()'), 'rejects an order id that is not a uuid').overall, '미확인');
  // regex(/^\d{11}$/) 는 글자 수 11 로 읽는다
  const phone = (n: number) => ({ 'src/schemas/signup.ts': `import { z } from 'zod';\nexport const signupSchema = z.object({ phone: z.string().regex(/^\\d{${n}}$/) });\n` });
  assert.equal(many('휴대폰 번호는 숫자 11자리여야 한다 | keywords: phone, signup', phone(11), 'rejects a phone number that is not 11 digits').overall, '확인됨');
  assert.equal(many('휴대폰 번호는 숫자 11자리여야 한다 | keywords: phone, signup', phone(10), 'rejects a phone number that is not 11 digits').overall, '다름');
});

test('a fixed amount computed as a percentage is different, in if, ternary, switch and object form', () => {
  const req = 'A fixed discount subtracts its amount, never a percentage of the total';
  const t = 'a fixed discount of 10 takes 10 off the total';
  const shapes = (right: boolean) => {
    const f = right ? 'Math.max(0, total - v)' : 'total * (1 - v / 100)';
    return [
      `export function a(total: number, d: { kind: string; v: number }) {\n  const v = d.v;\n  if (d.kind === 'fixed') return ${f};\n  return total;\n}\n`,
      `export const b = (total: number, d: { kind: string; v: number }, v = d.v) => (d.kind === 'fixed' ? ${f} : total);\n`,
      `export function c(total: number, d: { kind: string; v: number }) {\n  const v = d.v;\n  switch (d.kind) {\n    case 'fixed':\n      return ${f};\n    default:\n      return total;\n  }\n}\n`,
      `export const rules = {\n  fixed: (total: number, v: number) => ${f},\n};\n`,
    ];
  };
  for (const code of shapes(false)) assert.equal(many(`${req} | keywords: discount, fixed`, { 'src/discount.ts': code }, t).overall, '다름', code);
  for (const code of shapes(true)) assert.notEqual(many(`${req} | keywords: discount, fixed`, { 'src/discount.ts': code }, t).overall, '다름', code);
});

test('a key that returns the earlier result is a duplicate check, and a happy-path test is not linked to a rejection rule', () => {
  const pay = 'export async function pay(db: any, idempotencyKey: string, amount: number) {\n  const prev = await db.payment.findUnique({ where: { idempotencyKey } });\n  if (prev) return prev;\n  return db.payment.create({ data: { idempotencyKey, amount } });\n}\n';
  assert.equal(many('같은 결제 요청을 다시 보내도 결제는 한 번만 된다 | keywords: payment, idempotencyKey', { 'src/payment.ts': pay }, 'a retried payment request with the same key charges once').overall, '확인됨');
  const profile = { 'src/schemas/profile.ts': "import { z } from 'zod';\nexport const profileSchema = z.object({ homepage: z.string().url() });\n" };
  assert.equal(many('홈페이지 주소가 URL 형식이 아니면 저장하지 않는다 | keywords: homepage, profile', profile, 'saves a profile with a homepage').overall, '미확인');
});

test('class-validator decorators are checks: format, @Length, @Min / @Max', () => {
  const dto = (decos: string, prop: string, type = 'string') => `import { IsEmail, IsString, IsInt, Length, Matches, Max, Min } from 'class-validator';\nexport class Dto {\n  ${decos}\n  ${prop}!: ${type};\n}\n`;
  assert.equal(many('Sign-up rejects an invalid email address', { 'src/signup.dto.ts': dto('@IsEmail()', 'email') }, 'sign-up rejects an invalid email address').overall, '확인됨');
  assert.equal(many('Sign-up rejects an invalid email address', { 'src/signup.dto.ts': dto('@IsString()', 'email') }, 'sign-up rejects an invalid email address').overall, '미확인');
  assert.equal(many('휴대폰 번호는 숫자 11자리만 받는다 | keywords: phone, dto', { 'src/phone.dto.ts': dto('@Length(11, 11)', 'phone') }, 'rejects a phone number that is not 11 digits').overall, '확인됨');
  assert.equal(many('게시글 제목은 2자 이상 50자 이하다 | keywords: title, dto', { 'src/post.dto.ts': dto('@Length(2, 100)', 'title') }, 'rejects a title shorter than 2 or longer than 50 characters').overall, '다름');
  // between 14 and 120 에 @Min(13) 이면 14 를 넣든 빼든 틀렸다
  assert.equal(many('Age must be between 14 and 120', { 'src/age.dto.ts': dto('@IsInt()\n  @Min(13)\n  @Max(120)', 'age', 'number') }, 'rejects an age outside 14 to 120').overall, '다름');
  assert.equal(many('Age must be between 14 and 120', { 'src/age.dto.ts': dto('@IsInt()\n  @Min(14)\n  @Max(120)', 'age', 'number') }, 'rejects an age outside 14 to 120').overall, '확인됨');
});

test('a per-day limit that counts everything is not verified, and says there is no time window', () => {
  const req = 'Each user can send at most 3 invites per day';
  const t = 'a fourth invite on the same day is rejected';
  const all = "export function sendInvite(sent: number[], now: number) {\n  if (sent.length >= 3) throw new Error('DAILY_LIMIT');\n  sent.push(now);\n}\n";
  const today = "export function sendInvite(sent: number[], now: number) {\n  const today = sent.filter((t) => now - t < 24 * 60 * 60 * 1000);\n  if (today.length >= 3) throw new Error('DAILY_LIMIT');\n  sent.push(now);\n}\n";
  const set = analyzeFiles({ key: 'A', ref: 't', sha: 't', files: { 'src/invite.ts': all }, tests: [{ name: t, status: 'pass', message: '' }] });
  const r = evaluate([set], parseRequirements(`- R1: ${req}`), '.', 'main');
  assert.equal(r.summaries[0].overall, '미확인');
  assert.ok(undecidedReasons(r, r.summaries[0]).includes('no-window'));
  assert.equal(many(req, { 'src/invite.ts': today }, t).overall, '확인됨');
  // 오늘 0시부터 센 DB 개수, 달력으로 같은 달만 센 목록도 기간이다
  const db = "import { startOfDay } from 'date-fns';\nexport async function postComment(db: any, userId: string, body: string) {\n  const count = await db.comment.count({ where: { userId, createdAt: { gte: startOfDay(new Date()) } } });\n  if (count >= 10) throw new Error('LIMIT');\n  return db.comment.create({ data: { userId, body } });\n}\n";
  assert.equal(many('Each user can post at most 10 comments per day', { 'src/comment.ts': db }, 'an eleventh comment in one day is rejected').overall, '확인됨');
  const month = "export function claimCoupon(claims: Date[], now: Date) {\n  const thisMonth = claims.filter((c) => c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear());\n  if (thisMonth.length >= 2) throw new Error('MONTHLY_LIMIT');\n  claims.push(now);\n}\n";
  assert.equal(many('쿠폰은 한 달에 두 번까지만 받을 수 있다 | keywords: coupon, claim', { 'src/claim.ts': month }, '한 달에 세 번째 쿠폰은 받을 수 없다').overall, '확인됨');
});

test('a count kept in a variable before adding is the current count', () => {
  const ws = (op: string) => `export async function createWorkspace(db: any, userId: string, name: string) {\n  const owned = await db.workspace.count({ where: { ownerId: userId } });\n  if (owned ${op} 3) throw new Error('WORKSPACE_LIMIT');\n  return db.workspace.create({ data: { ownerId: userId, name } });\n}\n`;
  assert.equal(many('Each user can create at most 3 workspaces', { 'src/workspace.ts': ws('>=') }, 'creating a fourth workspace fails').overall, '확인됨');
  assert.equal(many('Each user can create at most 3 workspaces', { 'src/workspace.ts': ws('>') }, 'creating a fourth workspace fails').overall, '다름');
  const sms = "export function sendSms(log: number[]) {\n  const sentThisHour = log.filter((t) => Date.now() - t < 3600_000).length;\n  if (sentThisHour >= 5) throw new Error('TOO_MANY');\n  log.push(Date.now());\n}\n";
  assert.equal(many('인증 문자는 한 시간에 5번까지만 보낼 수 있다', { 'src/sms.ts': sms }, '한 시간 안에 여섯 번째 문자는 막는다').overall, '확인됨');
});

test('tests are linked to a count limit by the next ordinal, and a test that does it once is not', () => {
  const reset = "export function sendResetMail(sent: number[], now: number) {\n  const recent = sent.filter((t) => now - t < 60 * 60 * 1000);\n  if (recent.length >= 3) throw new Error('TOO_MANY');\n  sent.push(now);\n}\n";
  const req = '비밀번호 재설정 메일은 1시간에 3번까지 보낼 수 있다 | keywords: reset, mail';
  assert.equal(many(req, { 'src/reset.ts': reset }, 'sends a reset mail').overall, '미확인');
  assert.equal(many(req, { 'src/reset.ts': reset }, '1시간 안에 네 번째 재설정 메일은 막는다').overall, '확인됨');
  const refund = (op: string) => `export function requestRefund(order: { refunds: string[] }, reason: string) {\n  if (order.refunds.length ${op} 2) throw new Error('REFUND_LIMIT');\n  order.refunds.push(reason);\n}\n`;
  assert.equal(many('A customer can request a refund at most twice per order', { 'src/refund.ts': refund('>=') }, 'a third refund request for the same order is rejected').overall, '확인됨');
  assert.equal(many('A customer can request a refund at most twice per order', { 'src/refund.ts': refund('>') }, 'a third refund request for the same order is rejected').overall, '다름');
  assert.deepEqual(parseConstraints('Users can change their display name at most twice a month').map((c) => [c.value, c.unit, c.rel]), [[2, 'cnt', 'lte']]);
});

test('a check in another feature\'s function of the same file is not evidence, even when the file is named for the requirement', () => {
  // 국내 홍보 세션이 체험 페이지에서 찾은 0.16.0 오판: signup.ts 안 subscribe 의 검사로 「가입 거부」가 확인됨
  const re = 'const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n';
  const sub = "export function subscribe(email: string) { if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL'); return newsletter.add(email); }\n";
  const req = '이메일 형식이 올바르지 않으면 가입을 거부한다';
  const t = 'signup rejects an invalid email';
  for (const file of ['src/signup.ts', 'src/account.ts']) {
    assert.equal(many(req, { [file]: re + sub + 'export function signup(email: string, password: string) { return users.create({ email, password }); }\n' }, t).overall, '미확인', file);
  }
  const fixed = many(req, { 'src/signup.ts': re + sub + "export function signup(email: string, password: string) { if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL'); return users.create({ email, password }); }\n" }, t);
  assert.equal(fixed.overall, '확인됨');
  // 「~할 수 없다」도 막는 규칙이다
  const gift = (check: boolean) => `export function applyCoupon(c: { expiresAt: number }, now: number) {\n  if (c.expiresAt < now) throw new Error('EXPIRED');\n  return c;\n}\nexport function giftCoupon(c: { expiresAt: number }, now: number, to: string) {\n${check ? "  if (c.expiresAt < now) throw new Error('EXPIRED');\n" : ''}  return gifts.send(c, to);\n}\n`;
  assert.equal(many('만료된 쿠폰은 선물할 수 없다', { 'src/coupon.ts': gift(false) }, '만료된 쿠폰 선물은 거부한다').overall, '미확인');
  assert.equal(many('만료된 쿠폰은 선물할 수 없다', { 'src/coupon.ts': gift(true) }, '만료된 쿠폰 선물은 거부한다').overall, '확인됨');
});

test('a check belongs to the functions that call it or use its setting', () => {
  const helper = (caller: 'register' | 'subscribe') => `const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\nfunction assertValidEmail(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n}\nexport function register(email: string, password: string) {\n${caller === 'register' ? '  assertValidEmail(email);\n' : ''}  return users.create({ email, password });\n}\nexport function subscribe(email: string) {\n${caller === 'subscribe' ? '  assertValidEmail(email);\n' : ''}  return newsletter.add(email);\n}\n`;
  const req = 'Registration rejects an invalid email address';
  const t = 'registration with an invalid email is rejected';
  assert.equal(many(req, { 'src/register.ts': helper('register') }, t).overall, '확인됨');
  assert.equal(many(req, { 'src/register.ts': helper('subscribe') }, t).overall, '미확인');
  const ship = (owner: 'fee' | 'bonus') => `const FREE_SHIPPING_MIN = 50000;\nexport function shippingFee(total: number) {\n  return ${owner === 'fee' ? 'total >= FREE_SHIPPING_MIN ? 0 : 3000' : '3000'};\n}\nexport function pointsBonus(total: number) {\n  return total >= ${owner === 'bonus' ? 'FREE_SHIPPING_MIN' : '100000'} ? 100 : 0;\n}\n`;
  assert.equal(many('5만 원 이상 주문은 배송비가 무료다', { 'src/shipping.ts': ship('bonus') }, '5만 원 이상 주문의 배송비는 0원이다').overall, '미확인');
  // 두 클래스의 같은 이름 메서드는 클래스 이름으로 구별한다
  const svc = (inCart: boolean) => `export class CartService {\n  add(item: { stock: number }) {\n${inCart ? "    if (item.stock <= 0) throw new Error('OUT_OF_STOCK');\n" : ''}    return cart.push(item);\n  }\n}\nexport class WishlistService {\n  add(item: { stock: number }) {\n${inCart ? '' : "    if (item.stock <= 0) throw new Error('OUT_OF_STOCK');\n"}    return wishlist.push(item);\n  }\n}\n`;
  assert.equal(many('재고가 없는 상품은 장바구니에 담을 수 없다', { 'src/services.ts': svc(false) }, '재고가 없는 상품을 장바구니에 담으면 거부한다').overall, '미확인');
  assert.equal(many('재고가 없는 상품은 장바구니에 담을 수 없다', { 'src/services.ts': svc(true) }, '재고가 없는 상품을 장바구니에 담으면 거부한다').overall, '확인됨');
});

test('a check on another state or role is not evidence (shipped vs delivered, owner vs viewer)', () => {
  const cancel = (states: string[]) => `export function cancelOrder(order: { status: string }) {\n  if (${states.map((s) => `order.status === '${s}'`).join(' || ')}) throw new Error('ALREADY_SHIPPED');\n  order.status = 'canceled';\n}\n`;
  const t = '배송이 시작된 주문의 취소는 거부한다';
  assert.equal(many('배송이 시작된 주문은 취소할 수 없다', { 'src/order.ts': cancel(['shipped', 'delivered']) }, t).overall, '확인됨');
  assert.notEqual(many('배송이 시작된 주문은 취소할 수 없다', { 'src/order.ts': cancel(['delivered']) }, t).overall, '확인됨');
  const del = (cond: string) => `export function deleteProject(member: { role: string }, id: string) {\n  if (${cond}) throw new Error('FORBIDDEN');\n  return projects.remove(id);\n}\n`;
  assert.equal(many('Only the owner can delete a project', { 'src/project.ts': del("member.role !== 'owner'") }, 'a non-owner cannot delete a project').overall, '확인됨');
  assert.notEqual(many('Only the owner can delete a project', { 'src/project.ts': del("member.role === 'viewer'") }, 'a non-owner cannot delete a project').overall, '확인됨');
});

test('a reminder N days before or after is that day, and "cannot do twice" is a duplicate rule', () => {
  const remind = (n: number) => `export function needsReminder(daysLeft: number) {\n  return daysLeft === ${n};\n}\n`;
  const req = 'Trial users get a reminder 3 days before the trial ends';
  assert.deepEqual(parseConstraints(req).map((c) => [c.value, c.unit, c.rel]), [[3, 'day', 'eq']]);
  assert.equal(many(req, { 'src/trial.ts': remind(3) }, 'sends a reminder 3 days before the trial ends').overall, '확인됨');
  assert.equal(many(req, { 'src/trial.ts': remind(1) }, 'sends a reminder 3 days before the trial ends').overall, '다름');
  // 마감(「전까지」)과 보낸 뒤 만료는 그대로 기간이다
  assert.deepEqual(parseConstraints('모임 시작 2시간 전까지만 참가를 취소할 수 있다').map((c) => c.rel), ['gte']);
  assert.notEqual(parseConstraints('Email verification links expire 24 hours after they are sent')[0].rel, 'eq');
  // 「두 번 예약할 수 없다」는 2번까지가 아니다
  assert.deepEqual(parseConstraints('같은 회의실은 겹치는 시간에 두 번 예약할 수 없다'), []);
  const vote = (check: boolean) => `export function vote(poll: { voters: string[] }, userId: string) {\n${check ? "  if (poll.voters.includes(userId)) throw new Error('ALREADY_VOTED');\n" : ''}  poll.voters.push(userId);\n}\n`;
  assert.equal(many('같은 투표에 두 번 투표할 수 없다', { 'src/poll.ts': vote(true) }, '같은 투표에 두 번째 투표는 거부한다').overall, '확인됨');
  assert.equal(many('같은 투표에 두 번 투표할 수 없다', { 'src/poll.ts': vote(false) }, '같은 투표에 두 번째 투표는 거부한다').overall, '미확인');
});

test('"only once" needs a check that looks at whether it was already used; an error named NOT_FOUND is not one', () => {
  const card = (used: boolean) => `export function redeem(card: { redeemedAt: Date | null } | null) {\n  if (!card) throw new Error('NOT_FOUND');\n${used ? "  if (card.redeemedAt) throw new Error('ALREADY_REDEEMED');\n" : ''}  card.redeemedAt = new Date();\n}\n`;
  const req = 'A gift card code can be redeemed only once';
  const t = 'redeeming the same gift card twice is rejected';
  assert.equal(many(req, { 'src/giftcard.ts': card(true) }, t).overall, '확인됨');
  assert.equal(many(`${req} | keywords: gift, redeem`, { 'src/giftcard.ts': card(false) }, t).overall, '미확인');
  assert.equal(many(req, { 'src/giftcard.ts': card(false) }, t).overall, '미확인');
});

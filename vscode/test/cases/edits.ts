// 「이번 변경에서 바뀐 검사」 사례 (11/21, X 에서 여러 사람이 따로 말한 「에이전트가 검사를 고치거나 지워서 초록」).
// 사례마다 기준 커밋의 검사 파일(before)과 지금 검사 파일(after)을 견줘, 요구사항 R1 에 이어진 검사 변경을 본다.
// 첫 묶음(EDITS)은 만들면서 본 사례이고, 둘째 묶음(EDITS2)은 다 만든 뒤 처음 쓴 사례다.
import type { TestCase } from '../../../src/types.ts';

export type EditExpect = { kind: 'changed' | 'removed' | 'skipped' | null; values?: string[]; fewer?: number; suspicious: boolean };
export type EditCase = {
  id: string;
  area: string;
  req: string;
  keywords: string;
  file: string;
  code: string;
  testFile: string;
  before: string | null;
  after: string | null;
  tests: TestCase[];
  expect: EditExpect;
  /** 같이 바뀐 다른 검사 쪽 파일 (도우미 · 준비 값) */
  more?: { file: string; before: string | null; after: string | null }[];
};

const pass = (name: string): TestCase => ({ name, status: 'pass', message: '' });

const LOCK = "export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures > 5) user.locked = true;\n}\n";
const LOCK_OK = LOCK.replace('> 5', '>= 5');
const LOCK_TEST = (n: number, title = 'locks the account after 5 consecutive failures') =>
  `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\ntest('${title}', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < ${n}; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n});\n`;
const OTHER = "\ntest('resets the counter after a successful login', () => {\n  const user = { failures: 3, locked: false };\n  assert.equal(user.failures, 3);\n});\n";
const lockReq = { req: 'Lock the account after 5 consecutive failures', keywords: 'failure, lock', file: 'src/auth.ts', testFile: 'test/auth.test.ts' };
const LOCK_NAME = 'locks the account after 5 consecutive failures';

const FEE = 'export function shippingFee(total: number) {\n  return total >= 50000 ? 0 : 3000;\n}\n';
const FEE_TEST = (amount: number, fee: number) =>
  `import { describe, it, expect } from 'vitest';\nimport { shippingFee } from '../src/shipping';\n\ndescribe('shipping', () => {\n  it('is free from 50,000 won', () => {\n    expect(shippingFee(${amount})).toBe(${fee});\n  });\n});\n`;
const feeReq = { req: 'Shipping is free for orders of 50,000 won or more', keywords: 'shipping, free', file: 'src/shipping.ts', testFile: 'test/shipping.test.ts' };

export const EDITS: EditCase[] = [
  { id: 'e-loop-5-6', area: '숫자 바꿈', ...lockReq, code: LOCK, before: LOCK_TEST(5), after: LOCK_TEST(6), tests: [pass(LOCK_NAME)], expect: { kind: 'changed', values: ['5 → 6'], suspicious: true } },
  { id: 'e-expected-value', area: '기대값 바꿈', ...feeReq, code: FEE, before: FEE_TEST(50000, 0), after: FEE_TEST(50001, 0), tests: [pass('shipping > is free from 50,000 won')], expect: { kind: 'changed', values: ['50000 → 50001'], suspicious: true } },
  {
    id: 'e-assert-removed', area: '확인 줄 지움', ...lockReq, code: LOCK,
    before: LOCK_TEST(5).replace('  assert.equal(user.locked, true);\n', '  assert.equal(user.failures, 5);\n  assert.equal(user.locked, true);\n'),
    after: LOCK_TEST(5).replace('  assert.equal(user.locked, true);\n', '  assert.equal(user.failures, 5);\n'),
    tests: [pass(LOCK_NAME)], expect: { kind: 'changed', fewer: 1, suspicious: true },
  },
  { id: 'e-test-removed', area: '검사 지움', ...lockReq, code: LOCK, before: LOCK_TEST(5) + OTHER, after: LOCK_TEST(5).replace(/test\('locks[\s\S]*$/, '') + OTHER.trimStart(), tests: [pass('resets the counter after a successful login')], expect: { kind: 'removed', suspicious: true } },
  { id: 'e-skip', area: '건너뜀', ...lockReq, code: LOCK, before: LOCK_TEST(5), after: LOCK_TEST(5).replace("test('locks", "test.skip('locks"), tests: [], expect: { kind: 'skipped', suspicious: true } },
  { id: 'e-file-deleted', area: '검사 파일 지움', ...lockReq, code: LOCK, before: LOCK_TEST(5), after: null, tests: [], expect: { kind: 'removed', suspicious: true } },
  { id: 'e-other-test', area: '다른 검사만 바뀜', ...lockReq, code: LOCK_OK, before: LOCK_TEST(5) + OTHER, after: LOCK_TEST(5) + OTHER.replace('failures: 3', 'failures: 4').replace('failures, 3', 'failures, 4'), tests: [pass(LOCK_NAME), pass('resets the counter after a successful login')], expect: { kind: null, suspicious: false } },
  { id: 'e-new-test', area: '새 검사 더함', ...lockReq, code: LOCK_OK, before: LOCK_TEST(5), after: LOCK_TEST(5) + OTHER, tests: [pass(LOCK_NAME), pass('resets the counter after a successful login')], expect: { kind: null, suspicious: false } },
  { id: 'e-format-only', area: '줄 모양만', ...lockReq, code: LOCK_OK, before: LOCK_TEST(5), after: LOCK_TEST(5).replace('  for (let i', '\n  for (let i'), tests: [pass(LOCK_NAME)], expect: { kind: null, suspicious: false } },
  { id: 'e-rename-var', area: '이름만 바꿈', ...lockReq, code: LOCK_OK, before: LOCK_TEST(5), after: LOCK_TEST(5).replace(/\buser\b/g, 'account'), tests: [pass(LOCK_NAME)], expect: { kind: 'changed', suspicious: false } },
  {
    id: 'e-describe-junit', area: 'describe 이름이 붙은 실행 결과', ...lockReq, code: LOCK,
    before: `import { describe, it, expect } from 'vitest';\nimport { onFailedLogin } from '../src/auth';\n\ndescribe('auth', () => {\n  it('${LOCK_NAME}', () => {\n    const user = { failures: 0, locked: false };\n    for (let i = 0; i < 5; i++) onFailedLogin(user);\n    expect(user.locked).toBe(true);\n  });\n});\n`,
    after: `import { describe, it, expect } from 'vitest';\nimport { onFailedLogin } from '../src/auth';\n\ndescribe('auth', () => {\n  it('${LOCK_NAME}', () => {\n    const user = { failures: 0, locked: false };\n    for (let i = 0; i < 6; i++) onFailedLogin(user);\n    expect(user.locked).toBe(true);\n  });\n});\n`,
    tests: [pass(`auth > ${LOCK_NAME}`)], expect: { kind: 'changed', values: ['5 → 6'], suspicious: true },
  },
  { id: 'e-node-skip-option', area: '건너뜀(옵션)', ...lockReq, code: LOCK, before: LOCK_TEST(5), after: LOCK_TEST(5).replace("consecutive failures', () =>", "consecutive failures', { skip: 'flaky' }, () =>"), tests: [], expect: { kind: 'skipped', suspicious: true } },
  {
    id: 'e-error-code', area: '기대 오류 바꿈', req: 'A locked account cannot log in even with the right password', keywords: 'locked, password', file: 'src/login.ts',
    code: "export async function login(user: { locked: boolean; hash: string }, password: string) {\n  if (user.locked) throw new Error('LOCKED');\n  return check(password, user.hash);\n}\n", testFile: 'test/login.test.ts',
    before: "import { it, expect } from 'vitest';\nimport { login } from '../src/login';\n\nit('a locked account cannot log in with the right password', async () => {\n  await expect(login({ locked: true, hash: 'h' }, 'right')).rejects.toThrow('LOCKED');\n});\n",
    after: "import { it, expect } from 'vitest';\nimport { login } from '../src/login';\n\nit('a locked account cannot log in with the right password', async () => {\n  await expect(login({ locked: true, hash: 'h' }, 'right')).rejects.toThrow('BAD_LOGIN');\n});\n",
    tests: [pass('a locked account cannot log in with the right password')], expect: { kind: 'changed', values: ["'LOCKED' → 'BAD_LOGIN'"], suspicious: true },
  },
  { id: 'e-title-and-number', area: '이름 · 숫자 함께 바꿈', ...lockReq, code: LOCK, before: LOCK_TEST(5), after: LOCK_TEST(6, 'locks the account after 6 consecutive failures'), tests: [pass('locks the account after 6 consecutive failures')], expect: { kind: 'changed', values: ['5 → 6'], suspicious: true } },
];

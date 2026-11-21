// 「바뀐 검사」 셋째 묶음: 둘째 묶음으로 고친 뒤 처음 쓴 사례 (11/21 밤). 이 묶음의 첫 결과가 점수다.
import type { TestCase } from '../../../src/types.ts';
import type { EditCase } from './edits.ts';

const pass = (name: string): TestCase => ({ name, status: 'pass', message: '' });

const RATE = "export function handle(req: { ip: string }, hits: Map<string, number>) {\n  const n = (hits.get(req.ip) ?? 0) + 1;\n  hits.set(req.ip, n);\n  if (n > 100) return { status: 429 };\n  return { status: 200 };\n}\n";
const rateReq = { req: 'Return 429 after 100 requests per minute from the same IP', keywords: 'requests, ip', file: 'src/rate.ts', testFile: 'test/rate.test.ts' };
const RATE_TEST = (status: number) => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { handle } from '../src/rate.ts';\n\ntest('the 101st request from the same ip gets 429', () => {\n  const hits = new Map<string, number>();\n  for (let i = 0; i < 100; i++) handle({ ip: '1.2.3.4' }, hits);\n  assert.strictEqual(handle({ ip: '1.2.3.4' }, hits).status, ${status});\n});\n`;

const POINTS = "export function earnPoints(amount: number) {\n  return { points: Math.floor(amount * 0.01), tier: amount >= 100000 ? 'gold' : 'basic' };\n}\n";
const pointsReq = { req: 'Customers earn 1% of the order amount as points', keywords: 'points, amount', file: 'src/points.ts', testFile: 'src/points.test.ts' };
const POINTS_TEST = (body: string) => `import { it, expect } from 'vitest';\nimport { earnPoints } from './points';\n\nit('earns 1% of the amount as points', () => {\n${body}\n});\n`;

const VAT = 'export const withVat = (price: number) => price * 1.1;\n';
const vatReq = { req: 'Prices include 10% VAT', keywords: 'vat, price', file: 'src/vat.ts', testFile: 'src/vat.test.ts' };

const LOCK = "export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures >= 5) user.locked = true;\n}\n";
const lockReq = { req: 'Lock the account after 5 consecutive failures', keywords: 'failure, lock', file: 'src/auth.ts', testFile: 'test/auth.test.ts' };
const LOCK_NAME = 'locks the account after 5 consecutive failures';

export const EDITS3: EditCase[] = [
  { id: 'g-toequal-object', area: '객체 기대값의 숫자', ...pointsReq, code: POINTS, before: POINTS_TEST("  expect(earnPoints(50000)).toEqual({ points: 500, tier: 'basic' });"), after: POINTS_TEST("  expect(earnPoints(50000)).toEqual({ points: 5000, tier: 'basic' });"), tests: [pass('earns 1% of the amount as points')], expect: { kind: 'changed', values: ['500 → 5000'], suspicious: true } },
  { id: 'g-status-429-200', area: '상태 코드 바꿈', ...rateReq, code: RATE, before: RATE_TEST(429), after: RATE_TEST(200), tests: [pass('the 101st request from the same ip gets 429')], expect: { kind: 'changed', values: ['429 → 200'], suspicious: true } },
  { id: 'g-removed-todo-comment', area: '지우고 주석만 남김', ...rateReq, code: RATE, before: RATE_TEST(429), after: "import { test } from 'node:test';\n// TODO: rate limit test is flaky, re-add later\n", tests: [], expect: { kind: 'removed', suspicious: true } },
  { id: 'g-it-todo', area: 'it.todo 로 바꿈', ...pointsReq, code: POINTS, before: POINTS_TEST("  expect(earnPoints(50000).points).toBe(500);"), after: "import { it } from 'vitest';\n\nit.todo('earns 1% of the amount as points');\n", tests: [], expect: { kind: 'skipped', suspicious: true } },
  {
    id: 'g-helper-refactor', area: '확인을 도우미 함수로 옮김(대조)', ...lockReq, code: LOCK,
    before: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\ntest('${LOCK_NAME}', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < 5; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n});\n`,
    after: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\nfunction expectLockedAfter(n: number) {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < n; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n}\n\ntest('${LOCK_NAME}', () => {\n  expectLockedAfter(5);\n});\n`,
    tests: [pass(LOCK_NAME)], expect: { kind: 'changed', suspicious: false },
  },
  { id: 'g-new-req-test', area: '다른 요구사항 검사만 더함(대조)', ...lockReq, code: LOCK, before: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\ntest('${LOCK_NAME}', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < 5; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n});\n`, after: `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFailedLogin } from '../src/auth.ts';\n\ntest('${LOCK_NAME}', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < 5; i++) onFailedLogin(user);\n  assert.equal(user.locked, true);\n});\n\ntest('a successful login resets the failure count', () => {\n  assert.ok(true);\n});\n`, tests: [pass(LOCK_NAME), pass('a successful login resets the failure count')], expect: { kind: null, suspicious: false } },
  { id: 'g-closeto-precision', area: '소수 비교를 느슨하게', ...vatReq, code: VAT, before: "import { it, expect } from 'vitest';\nimport { withVat } from './vat';\n\nit('adds 10% vat to the price', () => {\n  expect(withVat(1000)).toBeCloseTo(1100, 2);\n});\n", after: "import { it, expect } from 'vitest';\nimport { withVat } from './vat';\n\nit('adds 10% vat to the price', () => {\n  expect(withVat(1000)).toBeCloseTo(1100, -3);\n});\n", tests: [pass('adds 10% vat to the price')], expect: { kind: 'changed', suspicious: true } },
  {
    id: 'g-other-describe', area: '같은 파일 다른 describe 만 바뀜(대조)', ...lockReq, code: LOCK,
    before: `import { describe, it, expect } from 'vitest';\nimport { onFailedLogin } from '../src/auth';\n\ndescribe('lockout', () => {\n  it('${LOCK_NAME}', () => {\n    const user = { failures: 0, locked: false };\n    for (let i = 0; i < 5; i++) onFailedLogin(user);\n    expect(user.locked).toBe(true);\n  });\n});\n\ndescribe('sessions', () => {\n  it('a session expires after 30 minutes', () => {\n    expect(30).toBe(30);\n  });\n});\n`,
    after: `import { describe, it, expect } from 'vitest';\nimport { onFailedLogin } from '../src/auth';\n\ndescribe('lockout', () => {\n  it('${LOCK_NAME}', () => {\n    const user = { failures: 0, locked: false };\n    for (let i = 0; i < 5; i++) onFailedLogin(user);\n    expect(user.locked).toBe(true);\n  });\n});\n\ndescribe('sessions', () => {\n  it('a session expires after 60 minutes', () => {\n    expect(60).toBe(60);\n  });\n});\n`,
    tests: [pass(`lockout > ${LOCK_NAME}`), pass('sessions > a session expires after 60 minutes')], expect: { kind: null, suspicious: false },
  },
];

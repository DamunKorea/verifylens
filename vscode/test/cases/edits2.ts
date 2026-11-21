// 「바뀐 검사」 둘째 묶음: 기능을 다 만든 뒤 처음 쓴 사례 (11/21 밤). 고칠 때 보지 않았다.
// 기대값은 「리뷰어라면 알고 싶은 것」이다. 지금 판이 못 잡는 꼴도 그대로 넣었다.
import type { TestCase } from '../../../src/types.ts';
import type { EditCase } from './edits.ts';

const pass = (name: string): TestCase => ({ name, status: 'pass', message: '' });

const CART = "const MAX_ITEMS = 3;\nexport function addToCart(cart: string[], item: string) {\n  if (cart.length >= MAX_ITEMS) throw new Error('CART_FULL');\n  cart.push(item);\n}\n";
const cartReq = { req: 'A cart holds at most 3 items', keywords: 'cart, items', file: 'src/cart.ts', testFile: 'src/cart.test.ts' };
const CART_TEST = (body: string) => `import { it, expect } from 'vitest';\nimport { addToCart } from './cart';\n\nit('a cart holds at most 3 items', () => {\n${body}\n});\n`;

const FEE = 'export function shippingFee(total: number) {\n  return total >= 50000 ? 0 : 3000;\n}\n';
const feeReq = { req: 'Shipping is free for orders of 50,000 won or more', keywords: 'shipping, free', file: 'src/shipping.ts', testFile: 'src/shipping.spec.ts' };
const FEE_TEST = (line: string) => `import { it, expect } from 'vitest';\nimport { shippingFee } from './shipping';\n\nit('shipping is free from 50,000 won', () => {\n  ${line}\n});\n`;

const LOCK_MIN = "const LOCK_MINUTES = 15;\nexport function isLocked(lockedAt: number, now: number) {\n  return now - lockedAt < LOCK_MINUTES * 60 * 1000;\n}\n";
const LOCK_MIN_TEST = (n: number) => `import { it, expect, vi } from 'vitest';\nimport { isLocked } from '../src/lock';\n\nit('the account stays locked for 15 minutes', () => {\n  const t0 = Date.now();\n  expect(isLocked(t0, t0 + ${n} * 60 * 1000 - 1)).toBe(true);\n});\n`;

const KO_LOCK = "export function onFail(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures >= 5) user.locked = true;\n}\n";
const KO_TEST = (n: number) => `import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { onFail } from '../src/login.ts';\n\ntest('5번 연속 실패하면 계정을 잠근다', () => {\n  const user = { failures: 0, locked: false };\n  for (let i = 0; i < ${n}; i++) onFail(user);\n  assert.ok(user.locked);\n});\n`;

const MOCHA = "export function canInvite(sentToday: number) {\n  return sentToday < 10;\n}\n";
const MOCHA_TEST = (n: number) => `const { expect } = require('chai');\nconst { canInvite } = require('../src/invite');\n\ndescribe('invites', () => {\n  context('daily limit', () => {\n    specify('a user can send at most 10 invites per day', () => {\n      expect(canInvite(${n})).to.equal(false);\n    });\n  });\n});\n`;

export const EDITS2: EditCase[] = [
  { id: 'f-length-3-4', area: '개수 단언 바꿈', ...cartReq, code: CART, before: CART_TEST("  const cart = ['a', 'b', 'c'];\n  expect(() => addToCart(cart, 'd')).toThrow('CART_FULL');\n  expect(cart).toHaveLength(3);"), after: CART_TEST("  const cart = ['a', 'b', 'c'];\n  addToCart(cart, 'd');\n  expect(cart).toHaveLength(4);"), tests: [pass('a cart holds at most 3 items')], expect: { kind: 'changed', values: ['3 → 4'], suspicious: true } },
  { id: 'f-weaker-matcher', area: '단언을 느슨하게', ...feeReq, code: FEE, before: FEE_TEST('expect(shippingFee(50000)).toBe(0);'), after: FEE_TEST('expect(shippingFee(50000)).toBeGreaterThanOrEqual(0);'), tests: [pass('shipping is free from 50,000 won')], expect: { kind: 'changed', suspicious: true } },
  { id: 'f-not-flipped', area: '단언을 뒤집음', ...cartReq, code: CART, before: CART_TEST("  const cart = ['a', 'b', 'c'];\n  expect(() => addToCart(cart, 'd')).toThrow('CART_FULL');"), after: CART_TEST("  const cart = ['a', 'b', 'c'];\n  expect(() => addToCart(cart, 'd')).not.toThrow();"), tests: [pass('a cart holds at most 3 items')], expect: { kind: 'changed', suspicious: true } },
  { id: 'f-describe-skip', area: 'describe 를 건너뜀', ...cartReq, code: CART, before: `import { describe, it, expect } from 'vitest';\nimport { addToCart } from './cart';\n\ndescribe('cart', () => {\n  it('a cart holds at most 3 items', () => {\n    expect(() => addToCart(['a', 'b', 'c'], 'd')).toThrow();\n  });\n});\n`, after: `import { describe, it, expect } from 'vitest';\nimport { addToCart } from './cart';\n\ndescribe.skip('cart', () => {\n  it('a cart holds at most 3 items', () => {\n    expect(() => addToCart(['a', 'b', 'c'], 'd')).toThrow();\n  });\n});\n`, tests: [], expect: { kind: 'skipped', suspicious: true } },
  {
    id: 'f-moved-weaker', area: '다른 파일로 옮기며 약하게', ...cartReq, code: CART,
    before: CART_TEST("  expect(() => addToCart(['a', 'b', 'c'], 'd')).toThrow('CART_FULL');"), after: null,
    more: [{ file: 'test/cart.test.ts', before: null, after: "import { it, expect } from 'vitest';\nimport { addToCart } from '../src/cart';\n\nit('a cart holds at most 3 items', () => {\n  expect(addToCart).toBeDefined();\n});\n" }],
    tests: [pass('a cart holds at most 3 items')], expect: { kind: 'removed', suspicious: true },
  },
  { id: 'f-fixture-names', area: '준비 값 이름만(대조)', ...cartReq, code: CART, before: CART_TEST("  const cart = ['apple', 'pear', 'plum'];\n  expect(() => addToCart(cart, 'fig')).toThrow('CART_FULL');"), after: CART_TEST("  const cart = ['milk', 'egg', 'tea'];\n  expect(() => addToCart(cart, 'jam')).toThrow('CART_FULL');"), tests: [pass('a cart holds at most 3 items')], expect: { kind: 'changed', suspicious: false } },
  {
    id: 'f-helper-constant', area: '도우미 파일의 숫자만 바꿈', ...cartReq, code: CART,
    before: CART_TEST("  const cart = fill(LIMIT);\n  expect(() => addToCart(cart, 'x')).toThrow('CART_FULL');").replace("import { addToCart } from './cart';", "import { addToCart } from './cart';\nimport { fill, LIMIT } from './cart.fixtures.test';"),
    after: CART_TEST("  const cart = fill(LIMIT);\n  expect(() => addToCart(cart, 'x')).toThrow('CART_FULL');").replace("import { addToCart } from './cart';", "import { addToCart } from './cart';\nimport { fill, LIMIT } from './cart.fixtures.test';"),
    more: [{ file: 'src/cart.fixtures.test.ts', before: "export const LIMIT = 3;\nexport const fill = (n: number) => Array.from({ length: n }, (_, i) => `item${i}`);\n", after: "export const LIMIT = 4;\nexport const fill = (n: number) => Array.from({ length: n }, (_, i) => `item${i}`);\n" }],
    tests: [pass('a cart holds at most 3 items')], expect: { kind: 'changed', values: ['3 → 4'], suspicious: true },
  },
  { id: 'f-minutes-15-16', area: '시간 값 바꿈', req: 'A locked account stays locked for 15 minutes', keywords: 'locked, minutes', file: 'src/lock.ts', code: LOCK_MIN, testFile: 'test/lock.test.ts', before: LOCK_MIN_TEST(15), after: LOCK_MIN_TEST(16), tests: [pass('the account stays locked for 15 minutes')], expect: { kind: 'changed', values: ['15 → 16'], suspicious: true } },
  { id: 'f-korean-name', area: '한국어 검사 이름', req: '5번 연속 실패하면 계정을 잠근다', keywords: '실패, 잠금', file: 'src/login.ts', code: KO_LOCK, testFile: 'test/login.test.ts', before: KO_TEST(5), after: KO_TEST(4), tests: [pass('5번 연속 실패하면 계정을 잠근다')], expect: { kind: 'changed', values: ['5 → 4'], suspicious: true } },
  { id: 'f-mocha-context', area: 'Mocha context · specify', req: 'A user can send at most 10 invites per day', keywords: 'invite, day', file: 'src/invite.js', code: MOCHA, testFile: 'test/invite.test.js', before: MOCHA_TEST(10), after: MOCHA_TEST(11), tests: [pass('invites daily limit a user can send at most 10 invites per day')], expect: { kind: 'changed', values: ['10 → 11'], suspicious: true } },
  { id: 'f-comment-only', area: '주석만(대조)', req: 'A cart holds at most 3 items', keywords: 'cart, items', file: 'src/cart.ts', code: CART, testFile: 'src/cart.test.ts', before: CART_TEST("  expect(() => addToCart(['a', 'b', 'c'], 'd')).toThrow('CART_FULL');"), after: CART_TEST("  // a fourth item is rejected\n  expect(() => addToCart(['a', 'b', 'c'], 'd')).toThrow('CART_FULL');"), tests: [pass('a cart holds at most 3 items')], expect: { kind: null, suspicious: false } },
];

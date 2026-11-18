// 여러 업무 영역의 요구사항과, 맞게 짠 코드 · 일부러 틀리게 짠 코드 묶음.
// 모든 검사는 통과한 상태로 둔다: 「테스트는 다 통과하는데 요구사항과 다른」 경우를 잡는지 보는 것이 목적이다.
export type Expect = '확인됨' | '다름' | '미확인';
export type Variant = { name: string; code: string; expect: Expect; extra?: Record<string, string> };
export type Case = { id: string; area: string; req: string; keywords: string; test: string; file?: string; variants: Variant[] };

const fn = (args: string, body: string) => `export function run(${args}) {\n${body}\n}\n`;
const ok = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const retry = (head: string, body: string) => `export async function run(charge: () => Promise<string>) {\n${head}\n${body}\n}\n`;
const user = 'user: { failures: number; locked: boolean }';

export const CASES: Case[] = [
  // ---------------------------------------------------------------- 금액
  { id: 'ship-gte', area: '금액', req: '주문 금액이 50000원 이상이면 배송비는 무료다', keywords: 'shipping, fee, total', test: 'shipping fee is free when total is 50000', variants: [
    ok('>=', fn('total: number', '  const shippingFee = 3000;\n  if (total >= 50000) return 0;\n  return shippingFee;')),
    ok('> 49999', fn('total: number', '  const shippingFee = 3000;\n  if (total > 49999) return 0;\n  return shippingFee;')),
    bad('> (경계 빠짐)', fn('total: number', '  const shippingFee = 3000;\n  if (total > 50000) return 0;\n  return shippingFee;')),
    bad('다른 금액', fn('total: number', '  const shippingFee = 3000;\n  if (total >= 30000) return 0;\n  return shippingFee;')),
  ] },
  { id: 'ship-comma-const', area: '금액', req: '주문 금액이 50,000원 이상이면 배송비는 무료다', keywords: 'shipping, fee, total', test: 'shipping fee is free when total is 50000', variants: [
    ok('상수', 'const FREE_SHIPPING_MIN = 50_000;\n' + fn('total: number', '  const shippingFee = 3000;\n  if (total >= FREE_SHIPPING_MIN) return 0;\n  return shippingFee;')),
    bad('상수 >', 'const FREE_SHIPPING_MIN = 50_000;\n' + fn('total: number', '  const shippingFee = 3000;\n  if (total > FREE_SHIPPING_MIN) return 0;\n  return shippingFee;')),
    bad('상수 값이 다름', 'const FREE_SHIPPING_MIN = 30_000;\n' + fn('total: number', '  const shippingFee = 3000;\n  if (total >= FREE_SHIPPING_MIN) return 0;\n  return shippingFee;')),
  ] },
  { id: 'ship-man', area: '금액', req: '5만 원 이상 구매하면 배송비는 무료다', keywords: 'shipping, fee, total', test: 'shipping fee is free when total is 50000', variants: [
    ok('삼항', fn('total: number, shippingFee: number', '  return total >= 50000 ? 0 : shippingFee;')),
    bad('삼항 >', fn('total: number, shippingFee: number', '  return total > 50000 ? 0 : shippingFee;')),
  ] },
  { id: 'en-at-least', area: '금액', req: 'Orders of at least 100 dollars ship for free', keywords: 'order, total, shipping', test: 'order total of 100 gets free shipping', variants: [
    ok('>=', fn('order: { total: number }', '  const shipping = order.total >= 100 ? 0 : 7;\n  return shipping;')),
    bad('>', fn('order: { total: number }', '  const shipping = order.total > 100 ? 0 : 7;\n  return shipping;')),
  ] },
  { id: 'points', area: '금액', req: '포인트는 1000점 이상부터 사용할 수 있다', keywords: 'points, use', test: 'points can use from 1000', variants: [
    ok('숫자가 왼쪽', fn('points: number', '  if (1000 <= points) return true;\n  return false;')),
    bad('숫자가 왼쪽 <', fn('points: number', '  if (1000 < points) return true;\n  return false;')),
  ] },
  // ---------------------------------------------------------------- 나이
  { id: 'age-under', area: '나이', req: '14세 미만은 보호자 동의가 필요하다', keywords: 'guardian, consent, age', test: 'guardian consent is needed by age under 14', variants: [
    ok('<', fn('age: number', '  if (age < 14) return true; // guardian consent\n  return false;')),
    ok('변수에 담기', fn('age: number', '  const needsGuardianConsent = age < 14;\n  return needsGuardianConsent;')),
    bad('<=', fn('age: number', '  if (age <= 14) return true; // guardian consent\n  return false;')),
    bad('변수에 담기 <=', fn('age: number', '  const needsGuardianConsent = age <= 14;\n  return needsGuardianConsent;')),
  ] },
  { id: 'age-adult', area: '나이', req: '만 19세 이상만 구매할 수 있다', keywords: 'age, purchase', test: 'purchase is allowed from age 19', variants: [
    ok('화살표 함수', 'export const canPurchase = (age: number) => age >= 19;\n'),
    ok('막는 조건', fn('age: number', "  if (age < 19) throw new Error('purchase not allowed');\n  return true;")),
    bad('화살표 함수 >', 'export const canPurchase = (age: number) => age > 19;\n'),
    bad('막는 조건 <=', fn('age: number', "  if (age <= 19) throw new Error('purchase not allowed');\n  return true;")),
  ] },
  { id: 'en-under', area: '나이', req: 'Users under 13 cannot sign up', keywords: 'age, signup', test: 'signup is rejected for age under 13', variants: [
    ok('<', fn('age: number', "  if (age < 13) throw new Error('signup rejected');")),
    bad('<=', fn('age: number', "  if (age <= 13) throw new Error('signup rejected');")),
  ] },
  // ---------------------------------------------------------------- 글자 수 · 형식
  { id: 'pw-min', area: '길이', req: '비밀번호는 8자 이상이어야 한다', keywords: 'password, length', test: 'password length must be at least 8', variants: [
    ok('return', fn('password: string', '  return password.length >= 8;')),
    ok('막는 조건', fn('password: string', "  if (password.length < 8) throw new Error('short');")),
    bad('>', fn('password: string', '  if (password.length > 8) return true;\n  return false;')),
    bad('막는 조건 <=', fn('password: string', "  if (password.length <= 8) throw new Error('short');")),
    bad('방향이 반대', fn('password: string', "  if (password.length >= 8) throw new Error('short');")),
  ] },
  { id: 'pw-zod', area: '길이', req: 'Password must be at least 8 characters', keywords: 'password, length', test: 'password length must be at least 8', variants: [
    ok('zod', "import { z } from 'zod';\nexport const schema = z.object({ password: z.string().min(8) });\n"),
    bad('zod 다른 값', "import { z } from 'zod';\nexport const schema = z.object({ password: z.string().min(6) });\n"),
  ] },
  { id: 'nick-max', area: '길이', req: '닉네임은 20자 이하여야 한다', keywords: 'nickname, length', test: 'nickname length must be 20 or less', variants: [
    ok('막는 조건', fn('nickname: string', "  if (nickname.length > 20) throw new Error('long');")),
    ok('zod', "import { z } from 'zod';\nexport const schema = z.object({ nickname: z.string().max(20) });\n"),
    bad('막는 조건 >=', fn('nickname: string', "  if (nickname.length >= 20) throw new Error('long');")),
    bad('zod 다른 값', "import { z } from 'zod';\nexport const schema = z.object({ nickname: z.string().max(30) });\n"),
  ] },
  { id: 'qty-range', area: '길이', req: '주문 수량은 1개 이상 10개 이하여야 한다', keywords: 'quantity, order', test: 'order quantity must be between 1 and 10', variants: [
    ok('둘 다', fn('quantity: number', "  if (quantity < 1 || quantity > 10) throw new Error('order');")),
    bad('위쪽 경계', fn('quantity: number', "  if (quantity < 1 || quantity >= 10) throw new Error('order');")),
    unk('한쪽만', fn('quantity: number', "  if (quantity > 10) throw new Error('order');")),
  ] },
  // ---------------------------------------------------------------- 담기 · 개수
  { id: 'cart-max', area: '개수', req: '장바구니에는 최대 20개까지 담을 수 있다', keywords: 'cart, length', test: 'cart length holds at most 20', variants: [
    ok('넣기 전에 검사', fn('cart: string[], item: string', "  if (cart.length >= 20) throw new Error('full');\n  cart.push(item);")),
    ok('검사만', fn('cart: string[]', "  if (cart.length > 20) throw new Error('full');")),
    bad('넣기 전 >', fn('cart: string[], item: string', "  if (cart.length > 20) throw new Error('full');\n  cart.push(item);")),
    ok('상수 객체', 'const LIMITS = { cartMax: 20 };\n' + fn('cart: string[], item: string', "  if (cart.length >= LIMITS.cartMax) throw new Error('full');\n  cart.push(item);")),
    bad('상수 객체 값이 다름', 'const LIMITS = { cartMax: 30 };\n' + fn('cart: string[], item: string', "  if (cart.length >= LIMITS.cartMax) throw new Error('full');\n  cart.push(item);")),
    ok('다른 파일 상수', "import { CART_MAX } from './limits.ts';\n" + fn('cart: string[], item: string', "  if (cart.length >= CART_MAX) throw new Error('full');\n  cart.push(item);"), { 'src/limits.ts': 'export const CART_MAX = 20;\n' }),
    bad('다른 파일 상수 값이 다름', "import { CART_MAX } from './limits.ts';\n" + fn('cart: string[], item: string', "  if (cart.length >= CART_MAX) throw new Error('full');\n  cart.push(item);"), { 'src/limits.ts': 'export const CART_MAX = 25;\n' }),
    unk('환경 변수', fn('cart: string[], item: string', "  if (cart.length >= Number(process.env.CART_MAX)) throw new Error('full');\n  cart.push(item);")),
  ] },
  { id: 'en-team', area: '개수', req: 'A team can have at most 5 members', keywords: 'team, members', test: 'team members are at most 5', variants: [
    ok('넣기 전에 검사', fn('team: { members: string[] }, m: string', "  if (team.members.length >= 5) throw new Error('full');\n  team.members.push(m);")),
    bad('넣기 전 >', fn('team: { members: string[] }, m: string', "  if (team.members.length > 5) throw new Error('full');\n  team.members.push(m);")),
  ] },
  { id: 'page-size', area: '개수', req: '한 페이지에 최대 50건만 보여 준다', keywords: 'page, items', test: 'page items are at most 50', variants: [
    ok('slice', fn('items: string[]', '  const page = items.slice(0, 50);\n  return page;')),
    ok('Math.min', fn('pageSize: number', '  const items = Math.min(pageSize, 50);\n  return items;')),
    bad('slice 다른 값', fn('items: string[]', '  const page = items.slice(0, 100);\n  return page;')),
  ] },
  { id: 'stock-zero', area: '개수', req: '재고가 0이면 주문할 수 없다', keywords: 'stock, order', test: 'order is rejected when stock is 0', variants: [
    ok('=== 0', fn('stock: number', "  if (stock === 0) throw new Error('order');")),
    ok('<= 0', fn('stock: number', "  if (stock <= 0) throw new Error('order');")),
    ok('< 1', fn('stock: number', "  if (stock < 1) throw new Error('order');")),
    bad('< 0', fn('stock: number', "  if (stock < 0) throw new Error('order');")),
  ] },
  // ---------------------------------------------------------------- 횟수
  { id: 'lockout', area: '횟수', req: '연속 5회 실패하면 계정을 잠근다', keywords: 'failures, lock', test: 'lock account after 5 failures', variants: [
    ok('올린 뒤 >=', fn(user, '  user.failures += 1;\n  if (user.failures >= 5) user.locked = true;')),
    ok('상수', 'const MAX_FAILURES = 5;\n' + fn(user, '  user.failures += 1;\n  if (user.failures >= MAX_FAILURES) user.locked = true;')),
    bad('올린 뒤 >', fn(user, '  user.failures += 1;\n  if (user.failures > 5) user.locked = true;')),
    bad('올리기 전 >=', fn(user, '  if (user.failures >= 5) user.locked = true;\n  user.failures += 1;')),
    ok('올리기 전 >= 4', fn(user, '  if (user.failures >= 4) user.locked = true;\n  user.failures += 1;')),
    unk('올리는 곳이 없음', fn(user, '  if (user.failures >= 5) user.locked = true;')),
  ] },
  { id: 'lockout-word', area: '횟수', req: '비밀번호를 다섯 번 틀리면 계정을 잠근다', keywords: 'failures, lock', test: 'lock account after 5 failures', variants: [
    ok('>=', fn(user, '  user.failures++;\n  if (user.failures >= 5) user.locked = true;')),
    bad('>', fn(user, '  user.failures++;\n  if (user.failures > 5) user.locked = true;')),
  ] },
  { id: 'en-lockout', area: '횟수', req: 'Lock the account after 3 failed attempts', keywords: 'attempts, lock', test: 'lock account after 3 attempts', variants: [
    ok('>=', fn('s: { attempts: number; locked: boolean }', '  s.attempts += 1;\n  if (s.attempts >= 3) s.locked = true;')),
    bad('>', fn('s: { attempts: number; locked: boolean }', '  s.attempts += 1;\n  if (s.attempts > 3) s.locked = true;')),
  ] },
  { id: 'retry', area: '횟수', req: '결제는 최대 3회까지만 시도한다', keywords: 'charge, attempts', test: 'charge attempts are at most 3', variants: [
    ok('catch 안 >=', retry('  let attempts = 0;', '  while (true) {\n    attempts += 1;\n    try {\n      return await charge();\n    } catch (e) {\n      if (attempts >= 3) throw e;\n    }\n  }')),
    bad('catch 안 >', retry('  let attempts = 0;', '  while (true) {\n    attempts += 1;\n    try {\n      return await charge();\n    } catch (e) {\n      if (attempts > 3) throw e;\n    }\n  }')),
    ok('for 1..3', retry('', '  for (let attempts = 1; attempts <= 3; attempts++) {\n    try {\n      return await charge();\n    } catch {}\n  }')),
    ok('for 0..<3', retry('', '  for (let attempts = 0; attempts < 3; attempts++) {\n    try {\n      return await charge();\n    } catch {}\n  }')),
    bad('for 0..<=3', retry('', '  for (let attempts = 0; attempts <= 3; attempts++) {\n    try {\n      return await charge();\n    } catch {}\n  }')),
    ok('while <', retry('  let attempts = 0;', '  while (attempts < 3) {\n    attempts += 1;\n    try {\n      return await charge();\n    } catch {}\n  }')),
    bad('while <=', retry('  let attempts = 0;', '  while (attempts <= 3) {\n    attempts += 1;\n    try {\n      return await charge();\n    } catch {}\n  }')),
    ok('시도 전에 막기', "export async function run(s: { attempts: number }, charge: () => Promise<string>) {\n  if (s.attempts >= 3) throw new Error('charge');\n  s.attempts += 1;\n  return charge();\n}\n"),
    bad('시도 전에 막기 >', "export async function run(s: { attempts: number }, charge: () => Promise<string>) {\n  if (s.attempts > 3) throw new Error('charge');\n  s.attempts += 1;\n  return charge();\n}\n"),
  ] },
  { id: 'rate-limit', area: '횟수', req: '요청은 100회까지만 허용한다', keywords: 'requests, count', test: 'requests count is limited to 100', variants: [
    // 이 값에 이번 요청이 포함됐는지 코드만으로는 알 수 없다: 둘 다 맞을 수 있다
    unk('막는 조건', fn('requestCount: number', "  if (requestCount > 100) throw new Error('requests');")),
    unk('막는 조건 >=', fn('requestCount: number', "  if (requestCount >= 100) throw new Error('requests');")),
    bad('다른 값', fn('requestCount: number', "  if (requestCount > 1000) throw new Error('requests');")),
  ] },
  // ---------------------------------------------------------------- 시간
  { id: 'session-idle', area: '시간', req: '세션은 30분이 지나면 만료된다', keywords: 'session, expired, idle', test: 'session is expired when idle for 30 minutes', variants: [
    ok('ms >=', fn('idleMs: number', '  const expired = idleMs >= 30 * 60 * 1000;\n  return expired; // session')),
    ok('ms >', fn('idleMs: number', '  const expired = idleMs > 30 * 60 * 1000;\n  return expired; // session')),
    ok('상수 ms', 'const SESSION_IDLE_MS = 1_800_000;\n' + fn('idleMs: number', '  return idleMs > SESSION_IDLE_MS; // expired')),
    bad('다른 시간', fn('idleMs: number', '  const expired = idleMs >= 20 * 60 * 1000;\n  return expired; // session')),
  ] },
  { id: 'otp', area: '시간', req: '인증 코드는 5분 후 만료된다', keywords: 'code, expired, age', test: 'code is expired after 5 minutes', variants: [
    ok('초 단위', fn('codeAgeSec: number', '  const expired = codeAgeSec >= 300;\n  return expired;')),
    bad('다른 시간', fn('codeAgeSec: number', '  const expired = codeAgeSec >= 600;\n  return expired;')),
  ] },
  { id: 'coupon', area: '시간', req: '쿠폰은 발급 후 7일이 지나면 만료된다', keywords: 'coupon, expired, days', test: 'coupon is expired after 7 days', variants: [
    unk('일 >= (문장만으로 경계가 안 정해짐)', fn('daysSinceIssued: number', '  const couponExpired = daysSinceIssued >= 7;\n  return couponExpired;')),
    unk('일 >', fn('daysSinceIssued: number', '  const couponExpired = daysSinceIssued > 7;\n  return couponExpired;')),
    ok('ms', fn('couponAgeMs: number', '  const couponExpired = couponAgeMs > 7 * 24 * 60 * 60 * 1000;\n  return couponExpired;')),
    bad('다른 일수', fn('daysSinceIssued: number', '  const couponExpired = daysSinceIssued >= 30;\n  return couponExpired;')),
  ] },
  { id: 'recent', area: '시간', req: '최근 7일 이내 주문만 보여 준다', keywords: 'order, days', test: 'orders within 7 days are shown', variants: [
    ok('<=', 'export const run = (orders: { days: number }[]) => orders.filter((o) => o.days <= 7);\n'),
    bad('<', 'export const run = (orders: { days: number }[]) => orders.filter((o) => o.days < 7);\n'),
  ] },
  // ---------------------------------------------------------------- 비율
  { id: 'discount-cap', area: '비율', req: '할인율은 최대 30%다', keywords: 'discount, rate', test: 'discount rate is at most 30', variants: [
    ok('Math.min 소수', fn('discountRate: number', '  return Math.min(discountRate, 0.3);')),
    ok('막는 조건', fn('discountRate: number', "  if (discountRate > 30) throw new Error('discount');")),
    bad('다른 값', fn('discountRate: number', "  if (discountRate > 50) throw new Error('discount');")),
  ] },
  // ---------------------------------------------------------------- 권한 (숫자 아님)
  { id: 'admin-only', area: '권한', req: '관리자만 환불할 수 있다', keywords: 'refund, admin, role', test: 'only admin role can refund', variants: [
    ok('막는 조건', fn('role: string', "  // refund\n  if (role !== 'admin') throw new Error('refund');")),
    unk('다른 조건이 함께 있음', fn('role: string, amount: number', "  // refund\n  if (role !== 'admin' && amount >= 100000) throw new Error('refund');")),
  ] },
  // ---------------------------------------------------------------- 숫자처럼 보이지만 조건이 아닌 것
  { id: 'not-a-limit', area: '오탐 방지', req: '잘못된 요청에는 HTTP 400을 돌려준다', keywords: 'request, invalid, status', test: 'invalid request gets status 400', variants: [
    ok('상태 코드', fn('invalid: boolean, res: { status(n: number): void }', '  if (invalid) res.status(400); // request')),
  ] },
  { id: 'two-factor', area: '오탐 방지', req: '2단계 인증을 켠 사용자는 코드를 입력해야 한다', keywords: 'twoFactor, code, enabled', test: 'twoFactor enabled user needs code', variants: [
    ok('플래그', fn('user: { twoFactorEnabled: boolean }, code?: string', "  if (user.twoFactorEnabled && !code) throw new Error('code');")),
  ] },
];

// 열아홉 번째 묶음: X 에서 받은 실제 버그 세 가지(11/20, 해커톤에서 검증 에이전트를 시험한 개발자의 답)를 요구사항으로 바꿨다.
//   1) 잘못된 이메일이 통과됨 — 테스트는 늘 올바른 이메일만 넣음
//   2) 결제 버튼을 두 번 누르면 주문이 두 개 — 테스트는 한 번만 누름
//   3) 정액 쿠폰이 잘못 적용됨 — 테스트는 정률 쿠폰만 씀
// 「테스트가 거기로 안 갔다」를 그대로 옮겨, 테스트 이름이 다른 경우(올바른 이메일 · 한 번 · 정률)만 다루면
// 그 테스트를 요구사항의 근거로 쓰지 않아야 한다(「확인됨」이면 안 된다). 0.14.0 으로 첫 점수를 먼저 잰다(고치기 전).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

// 다른 파일 함정: 같은 낱말 · 같은 값이 다른 기능에 있다
const NEWS = { 'src/newsletter.ts': "const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\nexport function subscribe(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n}\n" };
const REFUND = { 'src/refund.ts': "export async function refund(db: any, paymentId: string) {\n  const done = await db.refund.findUnique({ where: { paymentId } });\n  if (done) throw new Error('ALREADY_REFUNDED');\n  return db.refund.create({ data: { paymentId } });\n}\n" };
const SHIP5000 = { 'src/shipping.ts': 'export const SHIPPING_FEE = 5000;\nexport const shippingFee = (total: number) => (total >= 50000 ? 0 : SHIPPING_FEE);\n' };
const PERCENT = { 'src/percent.ts': 'export const applyPercent = (total: number, rate: number) => total - (total * rate) / 100;\n' };
const FREESHIP = { 'src/free.ts': 'export const FREE_SHIPPING_MIN = 10000;\nexport const isFreeShipping = (total: number) => total >= FREE_SHIPPING_MIN;\n' };
const BIO = { 'src/bio.ts': "export function setBio(bio: string) {\n  if (bio.length > 256) throw new Error('BIO_TOO_LONG');\n}\n" };
const CART_LOCK = { 'src/session.ts': "export function startSession(s: { startedAt?: number }) {\n  if (s.startedAt) throw new Error('ALREADY_STARTED');\n  s.startedAt = Date.now();\n}\n" };

const EMAIL_OK = "const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\nexport function signup(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return { email };\n}\n";
const EMAIL_NONE = 'export function signup(email: string) {\n  return { email };\n}\n';
const ORDER_OK = 'export async function placeOrder(db: any, paymentId: string) {\n  const existing = await db.order.findUnique({ where: { paymentId } });\n  if (existing) return existing;\n  return db.order.create({ data: { paymentId } });\n}\n';
const ORDER_NONE = 'export async function placeOrder(db: any, paymentId: string) {\n  return db.order.create({ data: { paymentId } });\n}\n';
const FLAT_RIGHT = "export function applyCoupon(total: number, coupon: { kind: 'flat' | 'percent'; value: number }) {\n  if (coupon.kind === 'flat') return Math.max(0, total - coupon.value);\n  return total - (total * coupon.value) / 100;\n}\n";
const FLAT_AS_PERCENT = "export function applyCoupon(total: number, coupon: { kind: 'flat' | 'percent'; value: number }) {\n  if (coupon.kind === 'flat') return total - (total * coupon.value) / 100;\n  return total - (total * coupon.value) / 100;\n}\n";

export const HOLDOUT18: Case[] = [
  // 1) 이메일 — 거부하는 테스트가 있을 때와, 올바른 이메일 테스트뿐일 때
  { id: 'r-email-reject', area: '잘못된 입력 거부', req: '이메일 형식이 올바르지 않으면 가입을 거부한다', keywords: 'email, signup', test: 'signup rejects an invalid email', file: 'src/signup.ts', variants: [
    ok('정규식 검사', EMAIL_OK, NEWS),
    unk('검사 없음 · 다른 파일에만 검사', EMAIL_NONE, NEWS),
  ] },
  { id: 'r-email-happy', area: '테스트가 다른 경우만', req: 'Sign-up rejects an email address that is not valid', keywords: 'email, signup', test: 'signs up with a valid email', file: 'src/signup.ts', variants: [
    unk('검사 있음 · 올바른 이메일 테스트뿐', EMAIL_OK, NEWS),
    unk('검사 없음 · 올바른 이메일 테스트뿐', EMAIL_NONE, NEWS),
  ] },
  { id: 'r-email-schema', area: '잘못된 입력 거부', req: 'Invalid email addresses are rejected', keywords: 'email, schema', test: 'an invalid email address is rejected', file: 'src/schema.ts', variants: [
    ok('z.string().email()', "import { z } from 'zod';\nexport const signupSchema = z.object({ email: z.string().email(), name: z.string() });\n", NEWS),
    unk('z.string() 만', "import { z } from 'zod';\nexport const signupSchema = z.object({ email: z.string(), name: z.string() });\n", NEWS),
  ] },
  { id: 'r-email-length', area: '잘못된 입력 거부', req: 'Email addresses longer than 254 characters are rejected', keywords: 'email, length', test: 'a 255 character email address is rejected', file: 'src/email.ts', variants: [
    ok('> 254', "export function checkEmail(email: string) {\n  if (email.length > 254) throw new Error('EMAIL_TOO_LONG');\n}\n", BIO),
    bad('> 256', "export function checkEmail(email: string) {\n  if (email.length > 256) throw new Error('EMAIL_TOO_LONG');\n}\n", BIO),
  ] },
  // 2) 두 번 결제 — 같은 결제로 주문이 하나만
  { id: 'r-double-pay', area: '두 번 눌러도 하나', req: '결제 버튼을 두 번 눌러도 주문은 하나만 생긴다', keywords: 'order, paymentId', test: 'paying twice creates only one order', file: 'src/order.ts', variants: [
    ok('이미 있으면 그 주문', ORDER_OK, REFUND),
    unk('검사 없음 · 환불에만 검사', ORDER_NONE, REFUND),
  ] },
  { id: 'r-double-happy', area: '테스트가 다른 경우만', req: 'Submitting the same payment twice creates only one order', keywords: 'order, payment', test: 'creates an order after payment', file: 'src/order.ts', variants: [
    unk('검사 있음 · 한 번 누르는 테스트뿐', ORDER_OK, REFUND),
    unk('검사 없음 · 한 번 누르는 테스트뿐', ORDER_NONE, REFUND),
  ] },
  { id: 'r-checkout-once', area: '두 번 눌러도 하나', req: 'Each cart can be checked out only once', keywords: 'checkout, cart', test: 'a second checkout of the same cart is rejected', file: 'src/checkout.ts', variants: [
    ok('이미 결제했으면 막기', "export function checkout(cart: { checkedOutAt?: number }) {\n  if (cart.checkedOutAt) throw new Error('ALREADY_CHECKED_OUT');\n  cart.checkedOutAt = Date.now();\n}\n", CART_LOCK),
    unk('검사 없음', 'export function checkout(cart: { checkedOutAt?: number }) {\n  cart.checkedOutAt = Date.now();\n}\n', CART_LOCK),
  ] },
  // 3) 정액 쿠폰 — 금액이 있으면 숫자로, 없으면 테스트가 다루는 경우로
  { id: 'r-flat-amount', area: '정액 쿠폰', req: '5,000원 정액 쿠폰은 결제 금액에서 5,000원을 뺀다', keywords: 'coupon, FLAT_COUPON', test: 'a 5000 won flat coupon takes 5000 off the total', file: 'src/coupon.ts', variants: [
    ok('5000', 'export const FLAT_COUPON = 5000;\nexport const applyFlat = (total: number) => Math.max(0, total - FLAT_COUPON);\n', SHIP5000),
    bad('3000', 'export const FLAT_COUPON = 3000;\nexport const applyFlat = (total: number) => Math.max(0, total - FLAT_COUPON);\n', SHIP5000),
  ] },
  { id: 'r-flat-happy', area: '테스트가 다른 경우만', req: 'A flat coupon takes its fixed amount off the total, not a percentage', keywords: 'coupon, flat', test: 'applies a 10% coupon', file: 'src/coupon.ts', variants: [
    unk('정액을 정률로 계산 · 정률 테스트뿐', FLAT_AS_PERCENT, PERCENT),
    unk('맞게 계산 · 정률 테스트뿐', FLAT_RIGHT, PERCENT),
  ] },
  { id: 'r-flat-minimum', area: '정액 쿠폰', req: '정액 쿠폰은 1만 원 이상 주문에만 쓸 수 있다', keywords: 'coupon, total', test: 'a flat coupon needs an order of at least 10000 won', file: 'src/coupon.ts', variants: [
    ok('< 10000 막기', "export function useFlatCoupon(total: number) {\n  if (total < 10000) throw new Error('MIN_ORDER');\n}\n", FREESHIP),
    bad('<= 10000 막기', "export function useFlatCoupon(total: number) {\n  if (total <= 10000) throw new Error('MIN_ORDER');\n}\n", FREESHIP),
  ] },
];

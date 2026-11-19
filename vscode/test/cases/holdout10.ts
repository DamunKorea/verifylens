// 열한 번째 묶음: 시간 차이 · 시간 창 · 「0이면」 규칙을 고친 뒤 처음 썼다. 0.10.0 과 고친 판을 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT10: Case[] = [
  { id: 'w-reset-1h', area: '시간 차이', req: 'Password reset links expire after 1 hour', keywords: 'reset, expired', test: 'reset link expires after 1 hour', variants: [
    ok('Date.now', "export const resetExpired = (issuedAt: number) => Date.now() - issuedAt > 60 * 60 * 1000;\n"),
    bad('2시간', "export const resetExpired = (issuedAt: number) => Date.now() - issuedAt > 2 * 60 * 60 * 1000;\n"),
  ] },
  { id: 'w-cart-7d', area: '시간 차이', req: '장바구니에 담은 상품은 7일이 지나면 비워진다', keywords: 'cart, expired', test: 'cart items older than 7 days are removed', variants: [
    ok('DAY', "const DAY = 86400000;\nexport const cartItemExpired = (addedAt: number, now: number) => now - addedAt > 7 * DAY;\n"),
    bad('3일', "const DAY = 86400000;\nexport const cartItemExpired = (addedAt: number, now: number) => now - addedAt > 3 * DAY;\n"),
  ] },
  { id: 'w-api-rate', area: '시간 창', req: 'API 는 1분에 최대 60번까지 부를 수 있다', keywords: 'calls, api', test: 'the 61st api call within a minute is rejected', variants: [
    ok('창 안에서 세기', "const WINDOW_MS = 60 * 1000;\nexport function callApi(calls: number[], now: number) {\n  const recent = calls.filter((t) => now - t < WINDOW_MS);\n  if (recent.length >= 60) throw new Error('RATE_LIMIT');\n  calls.push(now);\n}\n"),
    bad('창 안에서 > 60', "const WINDOW_MS = 60 * 1000;\nexport function callApi(calls: number[], now: number) {\n  const recent = calls.filter((t) => now - t < WINDOW_MS);\n  if (recent.length > 60) throw new Error('RATE_LIMIT');\n  calls.push(now);\n}\n"),
  ] },
  { id: 'w-seats-zero', area: '0이면', req: '남은 좌석이 0이면 예약할 수 없다', keywords: 'seats, booking', test: 'booking with no seats left is rejected', variants: [
    ok('<=', "export function book(seatsLeft: number) {\n  if (seatsLeft <= 0) throw new Error('SOLD_OUT');\n}\n"),
    bad('<', "export function book(seatsLeft: number) {\n  if (seatsLeft < 0) throw new Error('SOLD_OUT');\n}\n"),
  ] },
  { id: 'w-balance-zero', area: '0이면', req: 'Withdrawals are blocked when the balance is 0', keywords: 'balance, withdraw', test: 'withdrawal with a balance of 0 is blocked', variants: [
    ok('===', "export function withdraw(balance: number, amount: number) {\n  if (balance === 0) throw new Error('EMPTY');\n  return balance - amount;\n}\n"),
    bad('< 0', "export function withdraw(balance: number, amount: number) {\n  if (balance < 0) throw new Error('EMPTY');\n  return balance - amount;\n}\n"),
  ] },
  { id: 'w-cancel-24h', area: '시간 차이', req: '예약 취소는 시작 24시간 전까지만 할 수 있다', keywords: 'cancel, start', test: 'cancelling less than 24 hours before the start is rejected', variants: [
    ok('막기', "const HOUR = 3600000;\nexport function cancel(startsAt: number, now: number) {\n  if (startsAt - now < 24 * HOUR) throw new Error('TOO_LATE');\n}\n"),
    bad('12시간', "const HOUR = 3600000;\nexport function cancel(startsAt: number, now: number) {\n  if (startsAt - now < 12 * HOUR) throw new Error('TOO_LATE');\n}\n"),
  ] },
  { id: 'w-tax-rate', area: '비율', req: '부가세는 10%다', keywords: 'vat, rate', test: 'vat is 10%', variants: [
    ok('0.1', "export const VAT_RATE = 0.1;\nexport const withVat = (price: number) => price * (1 + VAT_RATE);\n"),
    bad('0.08', "export const VAT_RATE = 0.08;\nexport const withVat = (price: number) => price * (1 + VAT_RATE);\n"),
  ] },
  { id: 'w-admin-only', area: '권한', req: 'Only admins can change prices', keywords: 'admin, price', test: 'a non-admin cannot change a price', variants: [
    ok('막기', "export function setPrice(user: { isAdmin: boolean }, price: number) {\n  if (!user.isAdmin) throw new Error('FORBIDDEN');\n  return db.setPrice(price);\n}\n"),
    unk('검사 없음', "export function setPrice(user: { isAdmin: boolean }, price: number) {\n  return db.setPrice(price);\n}\n"),
  ] },
  { id: 'w-review-once', area: '중복', req: '상품마다 리뷰는 한 번만 쓸 수 있다', keywords: 'review, exists', test: 'a second review on the same product is rejected', variants: [
    ok('막기', "export async function writeReview(userId: string, productId: string) {\n  if (await reviews.exists(userId, productId)) throw new Error('ALREADY_REVIEWED');\n  return reviews.create(userId, productId);\n}\n"),
    unk('검사 없음', "export async function writeReview(userId: string, productId: string) {\n  return reviews.create(userId, productId);\n}\n"),
  ] },
  { id: 'w-trap-time', area: '함정', req: '인증 코드는 5분 뒤 만료된다', keywords: 'code, expired', test: 'verification code expires after 5 minutes', variants: [
    unk('다른 대상의 시간 차이', "export const sessionIdle = (lastSeen: number, now: number) => now - lastSeen > 5 * 60 * 1000;\n"),
  ] },
];

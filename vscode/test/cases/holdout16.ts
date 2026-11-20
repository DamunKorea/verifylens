// 열일곱 번째 묶음: 홍보 세션 사용성 시험 2 · 3차(11/20, 여러 파일 저장소)를 보고 고치기 전에 썼다.
// 다른 파일에 숫자 · 단위만 같은 줄(나이 · 잠금 시간 · 목록 개수)이 있을 때, 그 줄을 근거로 「확인됨 · 다름」이라 하지 않는지 본다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const AGE = { 'src/profile.ts': "export function canBuyAlcohol(user: { age: number }) {\n  if (user.age < 30) return false;\n  return true;\n}\n" };
const LOCK30 = { 'src/lock.ts': "const LOCK_MINUTES = 30;\nexport function lockUntil(now: number) {\n  return now + LOCK_MINUTES * 60 * 1000;\n}\n" };
const BULK = { 'src/bulk.ts': "export function bulkUpdate(req: { body: { items: string[] } }, res: any) {\n  if (req.body.items.length > 100) return res.status(400).json({ error: 'TOO_MANY_ITEMS' });\n  return res.json({ ok: true });\n}\n" };
const REJOIN = { 'src/rejoin.ts': "export function canRejoin(leftAt: number, now: number) {\n  const daysSinceLeft = (now - leftAt) / 86400000;\n  if (daysSinceLeft < 60) return false;\n  return true;\n}\n" };
const BULK51 = { 'src/bulk.ts': "export function bulkUpdate(req: { body: { items: string[] } }, res: any) {\n  if (req.body.items.length > 51) return res.status(400).json({ error: 'TOO_MANY_ITEMS' });\n  return res.json({ ok: true });\n}\n" };
const LOCK5 = { 'src/lock.ts': "const LOCK_MINUTES = 5;\nexport function lockUntil(now: number) {\n  return now + LOCK_MINUTES * 60 * 1000;\n}\n" };
const KEEP19 = { 'src/retention.ts': "export const KEEP_LOG_DAYS = 19;\nexport const expired = (ageDays: number) => ageDays > KEEP_LOG_DAYS;\n" };
const KEEP7 = { 'src/logs.ts': "export const KEEP_LOG_DAYS = 7;\nexport const purge = (ageDays: number) => ageDays > KEEP_LOG_DAYS;\n" };

export const HOLDOUT16: Case[] = [
  { id: 'm-trial-days', area: '나이 함정', req: 'The free trial lasts 30 days', keywords: 'trial, TRIAL_DAYS', test: 'the free trial lasts 30 days', file: 'src/plan.ts', variants: [
    ok('30일', "export const TRIAL_DAYS = 30;\nexport const trialEndsAt = (start: number) => start + TRIAL_DAYS * 86400000;\n", AGE),
    bad('7일', "export const TRIAL_DAYS = 7;\nexport const trialEndsAt = (start: number) => start + TRIAL_DAYS * 86400000;\n", AGE),
  ] },
  { id: 'm-token-expiry', area: '시간 낱말 함정', req: '접근 토큰은 30분 뒤 만료된다', keywords: 'token, TTL', test: 'access token expires after 30 minutes', file: 'src/token.ts', variants: [
    ok('30분', "export const ACCESS_TOKEN_TTL_MINUTES = 30;\nexport const tokenExpiresAt = (now: number) => now + ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;\n", LOCK30),
    bad('60분', "export const ACCESS_TOKEN_TTL_MINUTES = 60;\nexport const tokenExpiresAt = (now: number) => now + ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;\n", LOCK30),
  ] },
  { id: 'm-question-one', area: '하나만', req: '상품 문의는 한 사람당 하나만 남길 수 있다', keywords: 'question, exists', test: 'a second question from the same person is rejected', file: 'src/question.ts', variants: [
    ok('막기', "export async function askQuestion(db: any, userId: string, productId: string, text: string) {\n  const exists = await db.question.findFirst({ where: { userId, productId } });\n  if (exists) throw new Error('ALREADY_ASKED');\n  return db.question.create({ data: { userId, productId, text } });\n}\n", BULK),
    unk('검사 없음', "export async function askQuestion(db: any, userId: string, productId: string, text: string) {\n  return db.question.create({ data: { userId, productId, text } });\n}\n", BULK),
  ] },
  { id: 'm-session-days', area: '시간 낱말 함정', req: 'Sessions expire after 14 days', keywords: 'session, maxAge', test: 'sessions expire after 14 days', file: 'src/session.ts', variants: [
    ok('maxAge', "import session from 'express-session';\nexport const sessionMiddleware = session({ secret: 'dev', cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 } });\n", REJOIN),
    bad('30일', "import session from 'express-session';\nexport const sessionMiddleware = session({ secret: 'dev', cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } });\n", REJOIN),
  ] },
  { id: 'm-cart-max', area: '하나 차이 함정', req: '장바구니에는 상품을 최대 50개까지 담을 수 있다', keywords: 'quantity, cart', test: 'cart quantity is capped at 50', file: 'src/cart.ts', variants: [
    ok('50개', "export function setQuantity(item: { quantity: number }, quantity: number) {\n  item.quantity = quantity > 50 ? 50 : quantity;\n}\n", BULK51),
    bad('60개', "export function setQuantity(item: { quantity: number }, quantity: number) {\n  item.quantity = quantity > 60 ? 60 : quantity;\n}\n", BULK51),
  ] },
  { id: 'm-otp-minutes', area: '시간 낱말 함정', req: '인증 코드는 5분 동안 유효하다', keywords: 'code, issuedAt', test: 'verification code is valid for 5 minutes', file: 'src/otp.ts', variants: [
    ok('5분', "export const codeValid = (issuedAt: number, now: number) => now - issuedAt <= 5 * 60 * 1000;\n", LOCK5),
    bad('10분', "export const codeValid = (issuedAt: number, now: number) => now - issuedAt <= 10 * 60 * 1000;\n", LOCK5),
  ] },
  { id: 'm-coupon-one', area: '하나만', req: '쿠폰은 한 사람당 하나만 받을 수 있다', keywords: 'coupon, issued', test: 'a second coupon for the same person is rejected', file: 'src/coupon.ts', variants: [
    ok('막기', "export function issueCoupon(issued: Set<string>, userId: string) {\n  if (issued.has(userId)) throw new Error('ALREADY_ISSUED');\n  issued.add(userId);\n}\n", BULK),
    unk('검사 없음', "export function issueCoupon(issued: Set<string>, userId: string) {\n  issued.add(userId);\n}\n", BULK),
  ] },
  { id: 'm-adult-order', area: '나이 함정', req: '만 19세 미만은 주문할 수 없다', keywords: 'age, order', test: 'a buyer under 19 cannot order', file: 'src/order.ts', variants: [
    ok('19세', "export function placeOrder(user: { age: number }) {\n  if (user.age < 19) throw new Error('UNDERAGE');\n}\n", KEEP19),
    bad('20세', "export function placeOrder(user: { age: number }) {\n  if (user.age < 20) throw new Error('UNDERAGE');\n}\n", KEEP19),
  ] },
  { id: 'm-invite-expiry', area: '같은 값 함정', req: 'Invitations expire after 7 days', keywords: 'invite, INVITE_TTL_DAYS', test: 'invitations expire after 7 days', file: 'src/invite.ts', variants: [
    ok('7일', "export const INVITE_TTL_DAYS = 7;\nexport const inviteExpired = (ageDays: number) => ageDays > INVITE_TTL_DAYS;\n", KEEP7),
    bad('3일', "export const INVITE_TTL_DAYS = 3;\nexport const inviteExpired = (ageDays: number) => ageDays > INVITE_TTL_DAYS;\n", KEEP7),
  ] },
];

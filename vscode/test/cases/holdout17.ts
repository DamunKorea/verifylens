// 열여덟 번째 묶음: 여러 파일 함정(시간 단위만 같은 이름 · 나이 · 목록 개수 · 하나 차이)을 고친 뒤 처음 썼다. 0.12.0 과 고친 판을 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const LOCK5 = { 'src/lock.ts': 'const LOCK_MINUTES = 5;\nexport const lockUntil = (now: number) => now + LOCK_MINUTES * 60 * 1000;\n' };
const PURGE30 = { 'src/retention.ts': 'export function purgeOld(rows: { daysOld: number }[]) {\n  return rows.filter((r) => r.daysOld > 30);\n}\n' };
const TRIAL14 = { 'src/trial.ts': 'export const TRIAL_DAYS = 14;\nexport const trialEndsAt = (start: number) => start + TRIAL_DAYS * 86400000;\n' };
const COMMENT = { 'src/comments.ts': "export function addComment(text: string, res: any) {\n  if (text.length > 500) return res.status(400).json({ error: 'TOO_LONG' });\n  return res.json({ ok: true });\n}\n" };
const UPLOAD21 = { 'src/upload.ts': "export function uploadAll(files: string[]) {\n  if (files.length > 21) throw new Error('TOO_MANY_FILES');\n}\n" };
const REMIND14 = { 'src/password.ts': 'export function shouldRemind(daysSinceChange: number) {\n  return daysSinceChange > 14;\n}\n' };
const VAT = { 'src/tax.ts': 'export const VAT_RATE = 0.1;\nexport const vat = (price: number) => price * VAT_RATE;\n' };
const RETRY5 = { 'src/retry.ts': 'export async function withRetry(fn: () => Promise<void>) {\n  for (let attempt = 1; attempt <= 5; attempt++) {\n    try { return await fn(); } catch { /* try again */ }\n  }\n}\n' };
const BULK = { 'src/bulk.ts': "export function bulkDelete(ids: string[], res: any) {\n  if (ids.length > 100) return res.status(400).json({ error: 'TOO_MANY' });\n  return res.json({ ok: true });\n}\n" };
const CART30 = { 'src/cart.ts': "export function addItem(cart: { items: string[] }, id: string) {\n  if (cart.items.length > 30) throw new Error('CART_FULL');\n  cart.items.push(id);\n}\n" };

export const HOLDOUT17: Case[] = [
  { id: 'q-otp-ttl', area: '시간 단위 함정', req: 'OTP codes expire after 5 minutes', keywords: 'otp, OTP_TTL_SECONDS', test: 'otp codes expire after 5 minutes', file: 'src/otp.ts', variants: [
    ok('300초', 'export const OTP_TTL_SECONDS = 300;\nexport const otpExpired = (issuedSec: number, nowSec: number) => nowSec - issuedSec > OTP_TTL_SECONDS;\n', LOCK5),
    bad('600초', 'export const OTP_TTL_SECONDS = 600;\nexport const otpExpired = (issuedSec: number, nowSec: number) => nowSec - issuedSec > OTP_TTL_SECONDS;\n', LOCK5),
  ] },
  { id: 'q-cookie-days', area: '시간 단위 함정', req: '로그인 쿠키는 30일 동안 유지된다', keywords: 'cookie, maxAge', test: 'login cookie lasts 30 days', file: 'src/cookie.ts', variants: [
    ok('30일', "export function setLoginCookie(res: any, id: string) {\n  res.cookie('sid', id, { maxAge: 30 * 24 * 60 * 60 * 1000 });\n}\n", PURGE30),
    bad('14일', "export function setLoginCookie(res: any, id: string) {\n  res.cookie('sid', id, { maxAge: 14 * 24 * 60 * 60 * 1000 });\n}\n", PURGE30),
  ] },
  { id: 'q-age-limit', area: '나이 반대 함정', req: '만 14세 미만은 가입할 수 없다', keywords: 'age, signup', test: 'a user under 14 cannot sign up', file: 'src/signup.ts', variants: [
    ok('min(14)', "import { z } from 'zod';\nexport const signupSchema = z.object({ email: z.string().email(), age: z.number().int().min(14) });\n", TRIAL14),
    bad('min(12)', "import { z } from 'zod';\nexport const signupSchema = z.object({ email: z.string().email(), age: z.number().int().min(12) });\n", TRIAL14),
  ] },
  { id: 'q-like-one', area: '하나만', req: '게시글 좋아요는 한 사람당 하나만 누를 수 있다', keywords: 'like, likes', test: 'a second like from the same person is rejected', file: 'src/like.ts', variants: [
    ok('막기', "export function like(post: { likes: Set<string> }, userId: string) {\n  if (post.likes.has(userId)) throw new Error('ALREADY_LIKED');\n  post.likes.add(userId);\n}\n", COMMENT),
    unk('검사 없음', "export function like(post: { likes: Set<string> }, userId: string) {\n  post.likes.add(userId);\n}\n", COMMENT),
  ] },
  { id: 'q-first-page', area: '하나 차이 함정', req: '목록은 한 번에 최대 20개까지 보여 준다', keywords: 'items, firstPage', test: 'the list shows at most 20 items', file: 'src/list.ts', variants: [
    ok('slice 20', 'export const firstPage = (items: string[]) => items.slice(0, 20);\n', UPLOAD21),
    bad('slice 50', 'export const firstPage = (items: string[]) => items.slice(0, 50);\n', UPLOAD21),
  ] },
  { id: 'q-refresh-days', area: '기간 글', req: 'Refresh tokens are valid for 14 days', keywords: 'refresh, expiresIn', test: 'refresh tokens are valid for 14 days', file: 'src/refresh.ts', variants: [
    ok("'14d'", "import jwt from 'jsonwebtoken';\nexport function issueRefreshToken(id: string, secret: string) {\n  return jwt.sign({ sub: id }, secret, { expiresIn: '14d' });\n}\n", REMIND14),
    bad("'30d'", "import jwt from 'jsonwebtoken';\nexport function issueRefreshToken(id: string, secret: string) {\n  return jwt.sign({ sub: id }, secret, { expiresIn: '30d' });\n}\n", REMIND14),
  ] },
  { id: 'q-coupon-rate', area: '같은 값 함정', req: '쿠폰 할인율은 10%다', keywords: 'coupon, COUPON_RATE', test: 'coupon discount is 10%', file: 'src/coupon.ts', variants: [
    ok('0.1', 'export const COUPON_RATE = 0.1;\nexport const discount = (price: number) => price * COUPON_RATE;\n', VAT),
    bad('0.15', 'export const COUPON_RATE = 0.15;\nexport const discount = (price: number) => price * COUPON_RATE;\n', VAT),
  ] },
  { id: 'q-signup-limit', area: '일반 이름 설정값', req: '같은 IP 에서는 1시간에 5번까지만 가입할 수 있다', keywords: 'signupLimiter, max', test: 'signup is limited to 5 per hour per ip', file: 'src/limit.ts', variants: [
    ok('max 5', "import rateLimit from 'express-rate-limit';\nexport const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });\n", RETRY5),
    bad('max 10', "import rateLimit from 'express-rate-limit';\nexport const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });\n", RETRY5),
  ] },
  { id: 'q-delete-admin', area: '권한', req: 'Only admins can delete users', keywords: 'admin, delete', test: 'a non-admin cannot delete a user', file: 'src/admin.ts', variants: [
    ok('막기', "export function deleteUser(actor: { role: string }, id: string) {\n  if (actor.role !== 'admin') throw new Error('FORBIDDEN');\n  return db.user.delete({ where: { id } });\n}\n", BULK),
    unk('검사 없음', "export function deleteUser(actor: { role: string }, id: string) {\n  return db.user.delete({ where: { id } });\n}\n", BULK),
  ] },
  { id: 'q-display-name', area: '목록 개수 함정', req: 'Display names must be at most 30 characters', keywords: 'displayName, max', test: 'display names are at most 30 characters', file: 'src/profile.ts', variants: [
    ok('max(30)', "import { z } from 'zod';\nexport const profileSchema = z.object({ displayName: z.string().max(30) });\n", CART30),
    bad('max(50)', "import { z } from 'zod';\nexport const profileSchema = z.object({ displayName: z.string().max(50) });\n", CART30),
  ] },
];

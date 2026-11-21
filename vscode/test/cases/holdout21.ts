// 스물두 번째 묶음: 스키마 검사 · 중복 막기 · 정액 계산식을 고친 뒤 처음 썼다(고칠 때 보지 않음). 0.15.0 과 고친 판을 나란히 잰다.
// 다른 라이브러리(Joi · yup) · 다른 모양(Map · findFirst · 삼항식 · switch)과 다른 파일 함정을 넣었다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const LOGIN_ZOD = { 'src/schemas/login.ts': "import { z } from 'zod';\nexport const loginSchema = z.object({ email: z.string().email(), password: z.string() });\n" };
const OTP_SCHEMA = { 'src/schemas/otp.ts': "import { z } from 'zod';\nexport const otpSchema = z.object({ code: z.string().regex(/^\\d{6}$/) });\n" };
const BOOKMARK_YUP = { 'src/bookmark.ts': "import * as yup from 'yup';\nexport const bookmarkSchema = yup.object({ href: yup.string().url() });\n" };
const CACHE = { 'src/cache.ts': 'export function cached(cache: Map<string, string>, key: string, load: () => string) {\n  if (cache.has(key)) return cache.get(key);\n  const v = load();\n  cache.set(key, v);\n  return v;\n}\n' };
const CART_QTY = { 'src/cart.ts': 'export function addToCart(items: { productId: string; qty: number }[], productId: string) {\n  const existing = items.find((i) => i.productId === productId);\n  if (existing) existing.qty += 1;\n  else items.push({ productId, qty: 1 });\n}\n' };
const PROFILE = { 'src/profile.ts': 'export function rename(user: { name: string }, name: string) {\n  user.name = name;\n}\n' };
const PERCENT = { 'src/percent.ts': 'export const percentOff = (price: number, pct: number) => price * (1 - pct / 100);\n' };
const SHIP3000 = { 'src/shipping.ts': 'export const SHIPPING_FEE = 3000;\nexport const shippingFee = (total: number) => (total >= 30000 ? 0 : SHIPPING_FEE);\n' };
const GET_FILE = { 'src/getFile.ts': "import { isUuid } from './ids';\nexport function getFile(db: any, fileId: string) {\n  if (!isUuid(fileId)) throw new Error('BAD_ID');\n  return db.file.findUnique({ where: { id: fileId } });\n}\n" };

const SWITCH = (fixed: string) => `export function applyCoupon(total: number, c: { type: 'fixed' | 'rate'; value: number }) {\n  switch (c.type) {\n    case 'fixed':\n      return ${fixed};\n    case 'rate':\n      return total * (1 - c.value / 100);\n  }\n}\n`;

export const HOLDOUT21: Case[] = [
  { id: 'v-joi-email', area: '스키마 검사', req: 'An invitation with an invalid email address is rejected', keywords: 'invite, email', test: 'rejects an invite with an invalid email', file: 'src/invite.ts', variants: [
    ok('Joi email()', "import Joi from 'joi';\nexport const inviteSchema = Joi.object({ email: Joi.string().email().required(), role: Joi.string() });\n", LOGIN_ZOD),
    unk('required() 만 · 로그인에만 email()', "import Joi from 'joi';\nexport const inviteSchema = Joi.object({ email: Joi.string().required(), role: Joi.string() });\n", LOGIN_ZOD),
  ] },
  { id: 'v-phone-digits', area: '스키마 검사', req: '휴대폰 번호는 숫자 11자리여야 한다', keywords: 'phone, signup', test: 'rejects a phone number that is not 11 digits', file: 'src/schemas/signup.ts', variants: [
    ok('11자리', "import { z } from 'zod';\nexport const signupSchema = z.object({ phone: z.string().regex(/^\\d{11}$/), name: z.string() });\n", OTP_SCHEMA),
    bad('10자리', "import { z } from 'zod';\nexport const signupSchema = z.object({ phone: z.string().regex(/^\\d{10}$/), name: z.string() });\n", OTP_SCHEMA),
  ] },
  { id: 'v-url-happy', area: '테스트가 다른 경우만', req: 'Saving a link with an invalid URL is refused', keywords: 'link, url', test: 'saves a link', file: 'src/link.ts', variants: [
    unk('url() 있음 · 저장 테스트뿐', "import * as yup from 'yup';\nexport const linkSchema = yup.object({ url: yup.string().url().required() });\n", BOOKMARK_YUP),
    unk('검사 없음 · 저장 테스트뿐', "import * as yup from 'yup';\nexport const linkSchema = yup.object({ url: yup.string().required() });\n", BOOKMARK_YUP),
  ] },
  { id: 'v-map-dup', area: '중복 막기', req: 'Each webhook event is processed only once', keywords: 'webhook, event, processed', test: 'a webhook event delivered twice is processed once', file: 'src/webhook.ts', variants: [
    ok('processed.has', 'export async function onWebhook(processed: Map<string, boolean>, evt: { id: string }, handle: (e: unknown) => Promise<void>) {\n  if (processed.has(evt.id)) return;\n  processed.set(evt.id, true);\n  await handle(evt);\n}\n', CACHE),
    unk('검사 없음 · 캐시에만 has', 'export async function onWebhook(processed: Map<string, boolean>, evt: { id: string }, handle: (e: unknown) => Promise<void>) {\n  await handle(evt);\n}\n', CACHE),
  ] },
  { id: 'v-wish-dup', area: '중복 막기', req: '같은 상품은 위시리스트에 한 번만 담긴다', keywords: 'wishlist, product', test: 'adding the same product to the wishlist twice keeps one', file: 'src/wishlist.ts', variants: [
    ok('findFirst 로 막기', 'export async function addToWishlist(db: any, userId: string, productId: string) {\n  const found = await db.wishlist.findFirst({ where: { userId, productId } });\n  if (found) return found;\n  return db.wishlist.create({ data: { userId, productId } });\n}\n', CART_QTY),
    unk('검사 없음 · 장바구니에만 existing', 'export async function addToWishlist(db: any, userId: string, productId: string) {\n  return db.wishlist.create({ data: { userId, productId } });\n}\n', CART_QTY),
  ] },
  { id: 'v-sub-happy', area: '테스트가 다른 경우만', req: '같은 이메일로 두 번 구독해도 구독은 하나만 남는다', keywords: 'subscribe, email', test: 'subscribes an email', file: 'src/subscribe.ts', variants: [
    unk('막기 있음 · 한 번 구독 테스트뿐', 'export function subscribe(subs: Set<string>, email: string) {\n  if (subs.has(email)) return;\n  subs.add(email);\n}\n', PROFILE),
    unk('검사 없음 · 한 번 구독 테스트뿐', 'export function subscribe(subs: Set<string>, email: string) {\n  subs.add(email);\n}\n', PROFILE),
  ] },
  { id: 'v-flat-ternary', area: '정액 계산식', req: 'A flat discount takes the discount amount off the price, not a percentage', keywords: 'discount, flat', test: 'a flat 5 discount takes 5 off the price', file: 'src/price.ts', variants: [
    ok('삼항식 · 금액을 뺌', "export const finalPrice = (price: number, d: { kind: 'flat' | 'pct'; amount: number }) =>\n  d.kind === 'flat' ? Math.max(0, price - d.amount) : price * (1 - d.amount / 100);\n", PERCENT),
    bad('삼항식 · 비율로 계산', "export const finalPrice = (price: number, d: { kind: 'flat' | 'pct'; amount: number }) =>\n  d.kind === 'flat' ? price * (1 - d.amount / 100) : price * (1 - d.amount / 100);\n", PERCENT),
  ] },
  { id: 'v-fixed-switch', area: '정액 계산식', req: '정액 쿠폰은 결제 금액에서 쿠폰 금액만큼 뺀다', keywords: 'coupon, fixed', test: '정액 쿠폰 3000원이면 결제 금액에서 3000원을 뺀다', file: 'src/coupon.ts', variants: [
    ok('switch · 금액을 뺌', SWITCH('Math.max(0, total - c.value)'), PERCENT),
    bad('switch · 비율로 계산', SWITCH('total * (1 - c.value / 100)'), PERCENT),
  ] },
  { id: 'v-coupon-3000', area: '정액 금액', req: '3,000원 정액 쿠폰은 결제 금액에서 3,000원을 뺀다', keywords: 'coupon, FIXED_COUPON', test: '3000원 정액 쿠폰은 3000원을 뺀다', file: 'src/coupon.ts', variants: [
    ok('3000', 'export const FIXED_COUPON = 3000;\nexport const withCoupon = (total: number) => Math.max(0, total - FIXED_COUPON);\n', SHIP3000),
    bad('300', 'export const FIXED_COUPON = 300;\nexport const withCoupon = (total: number) => Math.max(0, total - FIXED_COUPON);\n', SHIP3000),
  ] },
  { id: 'v-file-uuid', area: '잘못된 입력 거부', req: 'Deleting a file with an invalid file id is rejected', keywords: 'fileId, delete', test: 'rejects deleting a file with an id that is not a uuid', file: 'src/deleteFile.ts', variants: [
    ok('isUuid 검사', "import { isUuid } from './ids';\nexport function deleteFile(db: any, fileId: string) {\n  if (!isUuid(fileId)) throw new Error('BAD_ID');\n  return db.file.delete({ where: { id: fileId } });\n}\n", GET_FILE),
    unk('검사 없음 · 조회에만 검사', 'export function deleteFile(db: any, fileId: string) {\n  return db.file.delete({ where: { id: fileId } });\n}\n', GET_FILE),
  ] },
];

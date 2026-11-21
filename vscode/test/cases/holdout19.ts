// 스무 번째 묶음: X 버그 세 가지(잘못된 입력 · 두 번 제출 · 정액 할인)를 고친 뒤 처음 썼다. 고칠 때 보지 않은 문장 · 코드로,
// 0.14.0 과 고친 판을 나란히 잰다(이 묶음으로는 고치지 않는다). 다른 파일 함정과 「테스트가 다른 경우만 다룸」을 같이 넣었다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const PROFILE_PHONE = { 'src/profile.ts': "export function updateProfile(p: { phone: string }) {\n  if (!/^01[016789]\\d{7,8}$/.test(p.phone)) throw new Error('INVALID_PHONE');\n}\n" };
const BOOKMARK = { 'src/bookmark.ts': "import { z } from 'zod';\nexport const bookmarkSchema = z.object({ url: z.string().url(), title: z.string() });\n" };
const CANCEL = { 'src/cancel.ts': "export function cancel(order: { cancelledAt?: number }) {\n  if (order.cancelledAt) throw new Error('ALREADY_CANCELLED');\n  order.cancelledAt = Date.now();\n}\n" };
const DRAFTS = { 'src/drafts.ts': 'export function saveDraft(drafts: Map<string, string>, id: string, text: string) {\n  drafts.set(id, text);\n}\n' };
const TAX = { 'src/tax.ts': 'export const TAX_RATE = 0.3;\nexport const tax = (price: number) => price * TAX_RATE;\n' };
const SHIP10 = { 'src/shipping.ts': 'export function shipping(total: number) {\n  if (total >= 100) return 0;\n  return 10;\n}\n' };
const PERCENT = { 'src/percent.ts': 'export const percentOff = (total: number, pct: number) => total * (1 - pct / 100);\n' };
const PW12 = { 'src/password.ts': "export function checkPassword(pw: string) {\n  if (pw.length < 12) throw new Error('TOO_SHORT');\n}\n" };
const NEWS_DUP = { 'src/newsletter.ts': 'export function subscribe(subs: Set<string>, email: string) {\n  if (subs.has(email)) return;\n  subs.add(email);\n}\n' };

const FIXED_OK = "export function applyDiscount(total: number, d: { type: 'fixed' | 'rate'; value: number }) {\n  if (d.type === 'fixed') return Math.max(0, total - d.value);\n  return total * (1 - d.value / 100);\n}\n";
const FIXED_AS_RATE = "export function applyDiscount(total: number, d: { type: 'fixed' | 'rate'; value: number }) {\n  if (d.type === 'fixed') return total * (1 - d.value / 100);\n  return total * (1 - d.value / 100);\n}\n";

export const HOLDOUT19: Case[] = [
  { id: 's-phone-format', area: '잘못된 입력 거부', req: '휴대폰 번호 형식이 틀리면 인증 문자를 보내지 않는다', keywords: 'phone, sendCode', test: 'does not send a code to an invalid phone number', file: 'src/verify.ts', variants: [
    ok('번호 검사', "export async function sendCode(phone: string, sms: { send(to: string): Promise<void> }) {\n  if (!/^01[016789]\\d{7,8}$/.test(phone)) throw new Error('INVALID_PHONE');\n  await sms.send(phone);\n}\n", PROFILE_PHONE),
    unk('검사 없음 · 프로필에만 검사', 'export async function sendCode(phone: string, sms: { send(to: string): Promise<void> }) {\n  await sms.send(phone);\n}\n', PROFILE_PHONE),
  ] },
  { id: 's-website-url', area: '잘못된 입력 거부', req: 'An invalid profile website URL is rejected', keywords: 'website, profile', test: 'rejects a profile website that is not a url', file: 'src/profileSchema.ts', variants: [
    ok('url()', "import { z } from 'zod';\nexport const profileSchema = z.object({ website: z.string().url(), bio: z.string() });\n", BOOKMARK),
    unk('z.string() 만 · 북마크에만 url()', "import { z } from 'zod';\nexport const profileSchema = z.object({ website: z.string(), bio: z.string() });\n", BOOKMARK),
  ] },
  { id: 's-refund-once', area: '두 번 해도 하나', req: '같은 주문은 한 번만 환불할 수 있다', keywords: 'refund, order', test: 'a second refund of the same order is rejected', file: 'src/refund.ts', variants: [
    ok('이미 환불했으면 막기', "export function refund(order: { refundedAt?: number }) {\n  if (order.refundedAt) throw new Error('ALREADY_REFUNDED');\n  order.refundedAt = Date.now();\n}\n", CANCEL),
    unk('검사 없음 · 취소에만 검사', 'export function refund(order: { refundedAt?: number }) {\n  order.refundedAt = Date.now();\n}\n', CANCEL),
  ] },
  { id: 's-refund-happy', area: '테스트가 다른 경우만', req: 'An order can be refunded only once', keywords: 'refund, order', test: 'refunds a paid order', file: 'src/refund.ts', variants: [
    unk('막기 있음 · 한 번 환불 테스트뿐', "export function refund(order: { refundedAt?: number }) {\n  if (order.refundedAt) throw new Error('ALREADY_REFUNDED');\n  order.refundedAt = Date.now();\n}\n", CANCEL),
    unk('검사 없음 · 한 번 환불 테스트뿐', 'export function refund(order: { refundedAt?: number }) {\n  order.refundedAt = Date.now();\n}\n', CANCEL),
  ] },
  { id: 's-send-twice', area: '두 번 해도 하나', req: 'Clicking send twice delivers the message only once', keywords: 'send, message', test: 'sending the same message twice delivers it once', file: 'src/send.ts', variants: [
    ok('보낸 id 막기', 'export async function sendMessage(sent: Set<string>, msg: { id: string }, deliver: (m: unknown) => Promise<void>) {\n  if (sent.has(msg.id)) return;\n  sent.add(msg.id);\n  await deliver(msg);\n}\n', DRAFTS),
    unk('검사 없음', 'export async function sendMessage(sent: Set<string>, msg: { id: string }, deliver: (m: unknown) => Promise<void>) {\n  await deliver(msg);\n}\n', DRAFTS),
  ] },
  { id: 's-discount-cap', area: '할인', req: '할인 쿠폰은 최대 30%까지 적용된다', keywords: 'coupon, MAX_COUPON_RATE', test: 'a coupon discount is capped at 30%', file: 'src/discount.ts', variants: [
    ok('0.3', 'export const MAX_COUPON_RATE = 0.3;\nexport const couponRate = (rate: number) => Math.min(rate, MAX_COUPON_RATE);\n', TAX),
    bad('0.5', 'export const MAX_COUPON_RATE = 0.5;\nexport const couponRate = (rate: number) => Math.min(rate, MAX_COUPON_RATE);\n', TAX),
  ] },
  { id: 's-ten-off', area: '정액 할인', req: 'A 10 dollar coupon takes 10 dollars off the order total', keywords: 'coupon, COUPON_AMOUNT', test: 'a 10 dollar coupon takes 10 off the total', file: 'src/coupon.ts', variants: [
    ok('10', 'export const COUPON_AMOUNT = 10;\nexport const withCoupon = (total: number) => Math.max(0, total - COUPON_AMOUNT);\n', SHIP10),
    bad('5', 'export const COUPON_AMOUNT = 5;\nexport const withCoupon = (total: number) => Math.max(0, total - COUPON_AMOUNT);\n', SHIP10),
  ] },
  { id: 's-fixed-happy', area: '테스트가 다른 경우만', req: '정액 할인은 금액을 그대로 빼고 비율로 계산하지 않는다', keywords: 'discount, fixed', test: '10% 할인이 적용된다', file: 'src/discount.ts', variants: [
    // 0.16.0 에서 바로잡음: 틀린 계산식이라 원래 「다름」이 맞다. 0.15.0 까지는 계산식을 판단하지 못해 「미확인」을 기대값으로 적었었다.
    bad('정액을 비율로 계산 · 비율 테스트뿐', FIXED_AS_RATE, PERCENT),
    unk('맞게 계산 · 비율 테스트뿐', FIXED_OK, PERCENT),
  ] },
  { id: 's-nickname', area: '길이', req: '닉네임은 2자 이상 12자 이하다', keywords: 'nickname, length', test: 'nickname must be 2 to 12 characters', file: 'src/nickname.ts', variants: [
    ok('2~12', "export function checkNickname(nickname: string) {\n  if (nickname.length < 2 || nickname.length > 12) throw new Error('BAD_NICKNAME');\n}\n", PW12),
    bad('2~20', "export function checkNickname(nickname: string) {\n  if (nickname.length < 2 || nickname.length > 20) throw new Error('BAD_NICKNAME');\n}\n", PW12),
  ] },
  { id: 's-email-taken', area: '두 번 해도 하나', req: '같은 이메일로는 한 번만 가입할 수 있다', keywords: 'email, signup', test: 'signing up twice with the same email is rejected', file: 'src/signup.ts', variants: [
    ok('이미 있으면 막기', "export async function signup(db: any, email: string) {\n  if (await db.user.findUnique({ where: { email } })) throw new Error('EMAIL_TAKEN');\n  return db.user.create({ data: { email } });\n}\n", NEWS_DUP),
    unk('검사 없음 · 뉴스레터에만 중복 검사', 'export async function signup(db: any, email: string) {\n  return db.user.create({ data: { email } });\n}\n', NEWS_DUP),
  ] },
];

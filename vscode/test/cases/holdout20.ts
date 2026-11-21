// 스물한 번째 묶음: 0.15.0 에서 「미확인」으로 남은 세 갈래(스키마의 검사 · Set 같은 중복 막기 · 정액을 비율로 계산)를
// 고치기 전에 먼저 썼다. 0.15.0 으로 첫 점수를 잰 뒤 고친다. 다른 파일 함정과 「테스트가 다른 경우만 다룸」을 같이 넣었다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const USER_SCHEMA = { 'src/schemas/user.ts': "import { z } from 'zod';\nexport const userSchema = z.object({ userId: z.string().uuid(), name: z.string() });\n" };
const NEWS_JOI = { 'src/newsletter.ts': "import Joi from 'joi';\nexport const newsletterSchema = Joi.object({ email: Joi.string().email().required() });\n" };
const SHIPPING_SCHEMA = { 'src/schemas/shipping.ts': "import { z } from 'zod';\nexport const shippingSchema = z.object({ phone: z.string().regex(/^01\\d{8,9}$/) });\n" };
const INBOX = { 'src/inbox.ts': 'export function markRead(seen: Set<string>, id: string) {\n  if (seen.has(id)) return;\n  seen.add(id);\n}\n' };
const INVITES = { 'src/invites.ts': "export function invite(invites: { email: string }[], email: string) {\n  if (invites.some((i) => i.email === email)) throw new Error('ALREADY_INVITED');\n  invites.push({ email });\n}\n" };
const REFUND_KEY = { 'src/refund.ts': 'export async function refund(db: any, key: string) {\n  const prev = await db.refund.findUnique({ where: { key } });\n  if (prev) return prev;\n  return db.refund.create({ data: { key } });\n}\n' };
const POINTS = { 'src/points.ts': 'export function addPoints(user: { points: number }, amount: number) {\n  user.points += amount;\n}\n' };
const RATE = { 'src/rate.ts': 'export const rateOff = (total: number, rate: number) => total - (total * rate) / 100;\n' };
const PROFILE_URL = { 'src/bookmarks.ts': "import { z } from 'zod';\nexport const bookmarkSchema = z.object({ link: z.string().url() });\n" };

const FIXED_KO_OK = "export function applyDiscount(total: number, d: { kind: 'fixed' | 'rate'; amount: number }) {\n  if (d.kind === 'fixed') return Math.max(0, total - d.amount);\n  return total - (total * d.amount) / 100;\n}\n";
const FIXED_KO_BAD = "export function applyDiscount(total: number, d: { kind: 'fixed' | 'rate'; amount: number }) {\n  if (d.kind === 'fixed') return total - (total * d.amount) / 100;\n  return total - (total * d.amount) / 100;\n}\n";
const FIXED_EN_OK = "export function discounted(total: number, discount: { type: 'FIXED' | 'PERCENT'; value: number }) {\n  if (discount.type === 'FIXED') return Math.max(0, total - discount.value);\n  return total * (1 - discount.value / 100);\n}\n";
const FIXED_EN_BAD = "export function discounted(total: number, discount: { type: 'FIXED' | 'PERCENT'; value: number }) {\n  if (discount.type === 'FIXED') return total * (1 - discount.value / 100);\n  return total * (1 - discount.value / 100);\n}\n";

export const HOLDOUT20: Case[] = [
  // 스키마의 검사가 근거
  { id: 't-uuid-schema', area: '스키마 검사', req: 'Requests with an invalid order id are rejected', keywords: 'orderId, schema', test: 'rejects an order id that is not a uuid', file: 'src/schemas/order.ts', variants: [
    ok('uuid()', "import { z } from 'zod';\nexport const orderSchema = z.object({ orderId: z.string().uuid(), note: z.string() });\n", USER_SCHEMA),
    unk('z.string() 만 · 사용자 스키마에만 uuid()', "import { z } from 'zod';\nexport const orderSchema = z.object({ orderId: z.string(), note: z.string() });\n", USER_SCHEMA),
  ] },
  { id: 't-yup-email', area: '스키마 검사', req: '이메일 주소가 올바르지 않으면 문의를 받지 않는다', keywords: 'email, contact', test: 'rejects a contact form with an invalid email', file: 'src/contact.ts', variants: [
    ok('yup email()', "import * as yup from 'yup';\nexport const contactSchema = yup.object({ email: yup.string().email().required(), message: yup.string() });\n", NEWS_JOI),
    unk('required() 만 · 뉴스레터에만 email()', "import * as yup from 'yup';\nexport const contactSchema = yup.object({ email: yup.string().required(), message: yup.string() });\n", NEWS_JOI),
  ] },
  { id: 't-postal-regex', area: '스키마 검사', req: 'Postal codes that are not 5 digits are rejected', keywords: 'postalCode, address', test: 'rejects a postal code that is not 5 digits', file: 'src/schemas/address.ts', variants: [
    ok('regex 5자리', "import { z } from 'zod';\nexport const addressSchema = z.object({ postalCode: z.string().regex(/^\\d{5}$/), city: z.string() });\n", SHIPPING_SCHEMA),
    unk('z.string() 만', "import { z } from 'zod';\nexport const addressSchema = z.object({ postalCode: z.string(), city: z.string() });\n", SHIPPING_SCHEMA),
  ] },
  { id: 't-url-happy', area: '테스트가 다른 경우만', req: '홈페이지 주소가 URL 형식이 아니면 저장하지 않는다', keywords: 'homepage, profile', test: 'saves a profile with a homepage', file: 'src/schemas/profile.ts', variants: [
    unk('url() 있음 · 저장 테스트뿐', "import { z } from 'zod';\nexport const profileSchema = z.object({ homepage: z.string().url() });\n", PROFILE_URL),
    unk('검사 없음 · 저장 테스트뿐', "import { z } from 'zod';\nexport const profileSchema = z.object({ homepage: z.string() });\n", PROFILE_URL),
  ] },
  // Set · includes · 키로 막는 중복
  { id: 't-set-dup', area: '중복 막기', req: '같은 알림은 한 번만 보낸다', keywords: 'notification, sent', test: 'the same notification is sent only once', file: 'src/notify.ts', variants: [
    ok('sent.has', 'export async function sendNotification(sent: Set<string>, n: { id: string }, push: (n: unknown) => Promise<void>) {\n  if (sent.has(n.id)) return;\n  sent.add(n.id);\n  await push(n);\n}\n', INBOX),
    unk('검사 없음 · 받은편지함에만 has', 'export async function sendNotification(sent: Set<string>, n: { id: string }, push: (n: unknown) => Promise<void>) {\n  await push(n);\n}\n', INBOX),
  ] },
  { id: 't-includes-dup', area: '중복 막기', req: 'A user can join the same group only once', keywords: 'join, group, members', test: 'joining the same group twice is rejected', file: 'src/groups.ts', variants: [
    ok('includes 막기', "export function joinGroup(group: { members: string[] }, userId: string) {\n  if (group.members.includes(userId)) throw new Error('ALREADY_MEMBER');\n  group.members.push(userId);\n}\n", INVITES),
    unk('검사 없음 · 초대에만 some', 'export function joinGroup(group: { members: string[] }, userId: string) {\n  group.members.push(userId);\n}\n', INVITES),
  ] },
  { id: 't-idem-key', area: '중복 막기', req: '같은 결제 요청을 다시 보내도 결제는 한 번만 된다', keywords: 'payment, idempotencyKey', test: 'a retried payment request with the same key charges once', file: 'src/payment.ts', variants: [
    ok('키로 이전 결제 돌려줌', 'export async function pay(db: any, idempotencyKey: string, amount: number) {\n  const prev = await db.payment.findUnique({ where: { idempotencyKey } });\n  if (prev) return prev;\n  return db.payment.create({ data: { idempotencyKey, amount } });\n}\n', REFUND_KEY),
    unk('검사 없음 · 환불에만 키', 'export async function pay(db: any, idempotencyKey: string, amount: number) {\n  return db.payment.create({ data: { idempotencyKey, amount } });\n}\n', REFUND_KEY),
  ] },
  { id: 't-redeem-happy', area: '테스트가 다른 경우만', req: 'A coupon code can be redeemed only once per account', keywords: 'coupon, redeem', test: 'redeems a valid coupon code', file: 'src/redeem.ts', variants: [
    unk('막기 있음 · 한 번 쓰는 테스트뿐', "export function redeem(used: Set<string>, account: string, code: string) {\n  const key = account + ':' + code;\n  if (used.has(key)) throw new Error('ALREADY_REDEEMED');\n  used.add(key);\n}\n", POINTS),
    unk('검사 없음 · 한 번 쓰는 테스트뿐', 'export function redeem(used: Set<string>, account: string, code: string) {\n  used.add(account + \':\' + code);\n}\n', POINTS),
  ] },
  // 정액을 비율로 계산
  { id: 't-fixed-branch', area: '정액 계산식', req: '정액 할인은 결제 금액에서 할인 금액을 그대로 뺀다', keywords: 'discount, fixed', test: '정액 할인 5000원이면 결제 금액에서 5000원을 뺀다', file: 'src/discount.ts', variants: [
    ok('금액을 뺌', FIXED_KO_OK, RATE),
    bad('비율로 계산', FIXED_KO_BAD, RATE),
  ] },
  { id: 't-fixed-en', area: '정액 계산식', req: 'A fixed discount subtracts its amount, never a percentage of the total', keywords: 'discount, fixed', test: 'a fixed discount of 10 takes 10 off the total', file: 'src/discount.ts', variants: [
    ok('value 를 뺌', FIXED_EN_OK, RATE),
    bad('비율로 계산', FIXED_EN_BAD, RATE),
  ] },
];

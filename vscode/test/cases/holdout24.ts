// 스물다섯 번째 묶음: 데코레이터 · 중복 막기 검사 잇기 · 시간 창을 고친 뒤 처음 썼다(고칠 때 안 본 사례).
// 0.16.0 과 고친 코드로 한 번씩만 잰다. 이 묶음으로 다시 고치면 그 다음 점수는 새 묶음으로 잰다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const PIN_DTO = { 'src/pin.dto.ts': "import { Matches } from 'class-validator';\nexport class PinDto {\n  @Matches(/^\\d{6}$/)\n  pin!: string;\n}\n" };
const BIO_DTO = { 'src/bio.dto.ts': "import { MaxLength } from 'class-validator';\nexport class BioDto {\n  @MaxLength(12)\n  headline!: string;\n}\n" };
const LOGIN_DTO = { 'src/login.dto.ts': "import { IsEmail } from 'class-validator';\nexport class LoginDto {\n  @IsEmail()\n  email!: string;\n}\n" };
const FOLLOW = { 'src/follow.ts': 'export async function follow(db: any, userId: string, targetId: string) {\n  const f = await db.follow.findFirst({ where: { userId, targetId } });\n  if (f) return f;\n  return db.follow.create({ data: { userId, targetId } });\n}\n' };
const CART = { 'src/cart.ts': 'export function addToCart(items: string[], id: string) {\n  if (items.includes(id)) return;\n  items.push(id);\n}\n' };
const RETRY3 = { 'src/retry.ts': 'export async function withRetry(fn: () => Promise<void>) {\n  for (let i = 0; i < 3; i++) {\n    try { return await fn(); } catch { /* again */ }\n  }\n}\n' };
const PAGE5 = { 'src/page.ts': 'export const firstFive = (rows: string[]) => rows.slice(0, 5);\n' };

export const HOLDOUT24: Case[] = [
  // 데코레이터
  { id: 'y-dto-phone', area: '데코레이터 길이', req: '휴대폰 번호는 숫자 11자리만 받는다', keywords: 'phone, dto', test: 'rejects a phone number that is not 11 digits', file: 'src/phone.dto.ts', variants: [
    ok('@IsNumberString + @Length(11, 11)', "import { IsNumberString, Length } from 'class-validator';\nexport class PhoneDto {\n  @IsNumberString()\n  @Length(11, 11)\n  phone!: string;\n}\n", PIN_DTO),
    unk('@IsNumberString 만', "import { IsNumberString } from 'class-validator';\nexport class PhoneDto {\n  @IsNumberString()\n  phone!: string;\n}\n", PIN_DTO),
  ] },
  { id: 'y-dto-age', area: '데코레이터 범위', req: 'Age must be between 14 and 120', keywords: 'age, dto', test: 'rejects an age outside 14 to 120', file: 'src/age.dto.ts', variants: [
    ok('@Min(14) @Max(120)', "import { IsInt, Max, Min } from 'class-validator';\nexport class AgeDto {\n  @IsInt()\n  @Min(14)\n  @Max(120)\n  age!: number;\n}\n", BIO_DTO),
    bad('@Min(13) @Max(120)', "import { IsInt, Max, Min } from 'class-validator';\nexport class AgeDto {\n  @IsInt()\n  @Min(13)\n  @Max(120)\n  age!: number;\n}\n", BIO_DTO),
  ] },
  { id: 'y-dto-invite', area: '데코레이터 검사', req: '초대할 이메일 주소 형식이 틀리면 초대를 거부한다', keywords: 'invite, email', test: 'rejects an invite to an invalid email address', file: 'src/invite.dto.ts', variants: [
    ok('@IsEmail(메시지 있음)', "import { IsEmail } from 'class-validator';\nexport class InviteDto {\n  @IsEmail({}, { message: 'invalid email' })\n  email!: string;\n}\n", LOGIN_DTO),
    unk('@IsNotEmpty 만 · 로그인에만 @IsEmail', "import { IsNotEmpty } from 'class-validator';\nexport class InviteDto {\n  @IsNotEmpty()\n  email!: string;\n}\n", LOGIN_DTO),
  ] },
  // 중복 막기 검사 잇기
  { id: 'y-coupon-again', area: '중복 막기', req: 'A coupon code can be redeemed only once per account', keywords: 'coupon, redeem', test: 'redeeming the same coupon again fails', file: 'src/coupon.ts', variants: [
    ok('findFirst 로 막기', "export async function redeem(db: any, userId: string, couponId: string) {\n  const used = await db.redemption.findFirst({ where: { userId, couponId } });\n  if (used) throw new Error('ALREADY_REDEEMED');\n  return db.redemption.create({ data: { userId, couponId } });\n}\n", FOLLOW),
    unk('검사 없음 · 팔로우에만 findFirst', 'export async function redeem(db: any, userId: string, couponId: string) {\n  return db.redemption.create({ data: { userId, couponId } });\n}\n', FOLLOW),
  ] },
  { id: 'y-review-once', area: '중복 막기', req: '한 주문에는 리뷰를 한 번만 쓸 수 있다', keywords: 'review, order', test: '같은 주문에 리뷰를 두 번 쓰면 거부한다', file: 'src/review.ts', variants: [
    ok('some 막기', "export function writeReview(reviews: { orderId: string; text: string }[], orderId: string, text: string) {\n  if (reviews.some((r) => r.orderId === orderId)) throw new Error('ALREADY_REVIEWED');\n  reviews.push({ orderId, text });\n}\n", CART),
    unk('빈 글만 막음', "export function writeReview(reviews: { orderId: string; text: string }[], orderId: string, text: string) {\n  if (!text.trim()) throw new Error('EMPTY');\n  reviews.push({ orderId, text });\n}\n", CART),
  ] },
  // 「기간에 N번」
  { id: 'y-weekly-withdraw', area: '시간 창', req: '포인트 출금은 일주일에 2번까지만 할 수 있다', keywords: 'withdraw, points', test: '일주일 안에 세 번째 출금은 거부한다', file: 'src/withdraw.ts', variants: [
    ok('7일 안만 셈', "export function withdraw(history: number[], now: number) {\n  const week = history.filter((t) => now - t < 7 * 24 * 60 * 60 * 1000);\n  if (week.length >= 2) throw new Error('WEEKLY_LIMIT');\n  history.push(now);\n}\n", RETRY3),
    unk('시간 창 없음 · 전부 셈', "export function withdraw(history: number[], now: number) {\n  if (history.length >= 2) throw new Error('WEEKLY_LIMIT');\n  history.push(now);\n}\n", RETRY3),
  ] },
  { id: 'y-daily-comments', area: '시간 창', req: 'Each user can post at most 10 comments per day', keywords: 'comment, post', test: 'an eleventh comment in one day is rejected', file: 'src/comment.ts', variants: [
    ok('오늘 0시부터 셈(DB)', "import { startOfDay } from 'date-fns';\nexport async function postComment(db: any, userId: string, body: string) {\n  const count = await db.comment.count({ where: { userId, createdAt: { gte: startOfDay(new Date()) } } });\n  if (count >= 10) throw new Error('LIMIT');\n  return db.comment.create({ data: { userId, body } });\n}\n", PAGE5),
    unk('시간 창 없음 · 전부 셈(DB)', "export async function postComment(db: any, userId: string, body: string) {\n  const count = await db.comment.count({ where: { userId } });\n  if (count >= 10) throw new Error('LIMIT');\n  return db.comment.create({ data: { userId, body } });\n}\n", PAGE5),
  ] },
  { id: 'y-hourly-sms', area: '시간 창', req: '인증 문자는 한 시간에 5번까지만 보낼 수 있다', keywords: 'sms, send', test: '한 시간 안에 여섯 번째 문자는 막는다', file: 'src/sms.ts', variants: [
    ok('한 시간 안만 셈', "export function sendSms(log: number[]) {\n  const sentThisHour = log.filter((t) => Date.now() - t < 3600_000).length;\n  if (sentThisHour >= 5) throw new Error('TOO_MANY');\n  log.push(Date.now());\n}\n", RETRY3),
    unk('시간 창 없음 · 전부 셈', "export function sendSms(log: number[]) {\n  if (log.length >= 5) throw new Error('TOO_MANY');\n  log.push(Date.now());\n}\n", RETRY3),
  ] },
  { id: 'y-monthly-rename', area: '시간 창', req: 'Users can change their display name at most twice a month', keywords: 'name, change', test: 'a third name change in the same month is rejected', file: 'src/rename.ts', variants: [
    ok('이번 달만 셈', "export function rename(changes: Date[], now: Date) {\n  const thisMonth = changes.filter((c) => c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear());\n  if (thisMonth.length >= 2) throw new Error('MONTHLY_LIMIT');\n  changes.push(now);\n}\n", PAGE5),
    unk('시간 창 없음 · 전부 셈', "export function rename(changes: Date[], now: Date) {\n  if (changes.length >= 2) throw new Error('MONTHLY_LIMIT');\n  changes.push(now);\n}\n", PAGE5),
  ] },
  // 기간 없는 개수 제한은 그대로 확인돼야 한다
  { id: 'y-plan-projects', area: '개수 제한', req: 'Free plan users can create at most 3 projects', keywords: 'project, plan', test: 'a fourth project on the free plan is rejected', file: 'src/project.ts', variants: [
    ok('>= 3 막기', "export function createProject(projects: string[], plan: string, name: string) {\n  if (plan === 'free' && projects.length >= 3) throw new Error('PLAN_LIMIT');\n  projects.push(name);\n}\n", PAGE5),
    bad('> 3 막기(4개까지 됨)', "export function createProject(projects: string[], plan: string, name: string) {\n  if (plan === 'free' && projects.length > 3) throw new Error('PLAN_LIMIT');\n  projects.push(name);\n}\n", PAGE5),
  ] },
];

// 스물세 번째 묶음: 0.16.0 의 고침(스키마 검사 · 중복 막기 · 정액 계산식 · switch · 다른 동작의 검사)을 모두 마친 뒤 처음 썼다.
// 고칠 때 보지 않은 모양(데코레이터 · 중복 오류 잡기 · some · 객체에 담은 계산식)과 다른 파일 함정으로, 0.15.0 과 고친 판을 나란히 잰다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const LOGIN_DTO = { 'src/login.dto.ts': "import { IsEmail } from 'class-validator';\nexport class LoginDto {\n  @IsEmail()\n  email!: string;\n}\n" };
const CREATE_POST = { 'src/createPost.ts': "export function createPost(title: string) {\n  if (!title.trim()) throw new Error('EMPTY_TITLE');\n  return { title };\n}\n" };
const SIGNUP_SCHEMA = { 'src/schemas/signup.ts': "import { z } from 'zod';\nexport const signupSchema = z.object({ email: z.string().email() });\n" };
const AUDIT = { 'src/audit.ts': 'export async function audit(db: any, action: string) {\n  return db.audit.create({ data: { action } });\n}\n' };
const VOTES = { 'src/votes.ts': "export function vote(votes: { userId: string }[], userId: string) {\n  if (votes.some((v) => v.userId === userId)) throw new Error('ALREADY_VOTED');\n  votes.push({ userId });\n}\n" };
const SEQ = { 'src/seq.ts': 'export function nextNumber(last: number) {\n  return last + 1;\n}\n' };
const RATE = { 'src/rate.ts': 'export const rateOff = (t: number, v: number) => t * (1 - v / 100);\n' };
const MIN_ORDER = { 'src/minOrder.ts': "export const MIN_ORDER = 2000;\nexport function checkMin(total: number) {\n  if (total < MIN_ORDER) throw new Error('TOO_SMALL');\n}\n" };

const SWITCH_POINTS = (flat: string) => `export function usePoints(balance: number, p: { mode: 'FLAT' | 'RATE'; value: number }) {\n  switch (p.mode) {\n    case 'FLAT':\n      return ${flat};\n    default:\n      return balance - (balance * p.value) / 100;\n  }\n}\n`;

export const HOLDOUT22: Case[] = [
  { id: 'w-dto-email', area: '데코레이터 검사', req: 'Sign-up rejects an invalid email address', keywords: 'email, signup', test: 'sign-up rejects an invalid email address', file: 'src/signup.dto.ts', variants: [
    ok('@IsEmail', "import { IsEmail } from 'class-validator';\nexport class SignupDto {\n  @IsEmail()\n  email!: string;\n}\n", LOGIN_DTO),
    unk('@IsString 만 · 로그인에만 @IsEmail', "import { IsString } from 'class-validator';\nexport class SignupDto {\n  @IsString()\n  email!: string;\n}\n", LOGIN_DTO),
  ] },
  { id: 'w-update-title', area: '다른 동작의 검사', req: 'Updating a post with an empty title is rejected', keywords: 'updatePost, title', test: 'rejects updating a post with an empty title', file: 'src/updatePost.ts', variants: [
    ok('빈 제목 막기', "export function updatePost(post: { title: string }, title: string) {\n  if (!title.trim()) throw new Error('EMPTY_TITLE');\n  post.title = title;\n}\n", CREATE_POST),
    unk('검사 없음 · 만들기에만 검사', 'export function updatePost(post: { title: string }, title: string) {\n  post.title = title;\n}\n', CREATE_POST),
  ] },
  { id: 'w-profile-email', area: '스키마 검사', req: '잘못된 이메일 형식이면 회원 정보 수정을 거부한다', keywords: 'email, profile', test: 'rejects a profile update with an invalid email', file: 'src/schemas/profile.ts', variants: [
    ok('email()', "import { z } from 'zod';\nexport const profileSchema = z.object({ email: z.string().email(), nickname: z.string() });\n", SIGNUP_SCHEMA),
    unk('z.string() 만 · 가입에만 email()', "import { z } from 'zod';\nexport const profileSchema = z.object({ email: z.string(), nickname: z.string() });\n", SIGNUP_SCHEMA),
  ] },
  { id: 'w-catch-unique', area: '중복 막기', req: 'An email can be registered only once', keywords: 'register, email', test: 'registering the same email twice is rejected', file: 'src/register.ts', variants: [
    ok('중복 오류 잡기', "export async function register(db: any, email: string) {\n  try {\n    return await db.user.create({ data: { email } });\n  } catch (e: any) {\n    if (e.code === 'P2002') throw new Error('EMAIL_TAKEN');\n    throw e;\n  }\n}\n", AUDIT),
    unk('검사 없음', 'export async function register(db: any, email: string) {\n  return db.user.create({ data: { email } });\n}\n', AUDIT),
  ] },
  { id: 'w-survey-some', area: '중복 막기', req: '한 사람은 같은 설문에 한 번만 응답할 수 있다', keywords: 'survey, answer', test: 'answering the same survey twice is rejected', file: 'src/survey.ts', variants: [
    ok('some 막기', "export function answerSurvey(answers: { userId: string }[], userId: string) {\n  if (answers.some((a) => a.userId === userId)) throw new Error('ALREADY_ANSWERED');\n  answers.push({ userId });\n}\n", VOTES),
    unk('검사 없음 · 투표에만 some', 'export function answerSurvey(answers: { userId: string }[], userId: string) {\n  answers.push({ userId });\n}\n', VOTES),
  ] },
  { id: 'w-order-happy', area: '테스트가 다른 경우만', req: 'Each order number is used only once', keywords: 'orderNumber, order', test: 'creates an order with a number', file: 'src/orderNumber.ts', variants: [
    unk('막기 있음 · 한 번 만드는 테스트뿐', "export function useOrderNumber(used: Set<number>, orderNumber: number) {\n  if (used.has(orderNumber)) throw new Error('DUPLICATE_ORDER_NUMBER');\n  used.add(orderNumber);\n}\n", SEQ),
    unk('검사 없음 · 한 번 만드는 테스트뿐', 'export function useOrderNumber(used: Set<number>, orderNumber: number) {\n  used.add(orderNumber);\n}\n', SEQ),
  ] },
  { id: 'w-fixed-map', area: '정액 계산식', req: '정액 할인은 결제 금액에서 할인 금액을 그대로 뺀다', keywords: 'discount, fixed', test: '정액 할인 1000원이면 1000원을 뺀다', file: 'src/discountRules.ts', variants: [
    ok('객체 · 금액을 뺌', 'export const discountRules = {\n  fixed: (total: number, v: number) => Math.max(0, total - v),\n  rate: (total: number, v: number) => total * (1 - v / 100),\n};\n', RATE),
    bad('객체 · 비율로 계산', 'export const discountRules = {\n  fixed: (total: number, v: number) => total * (1 - v / 100),\n  rate: (total: number, v: number) => total * (1 - v / 100),\n};\n', RATE),
  ] },
  { id: 'w-flat-credit', area: '정액 계산식', req: 'A flat credit takes the credit amount off the bill', keywords: 'credit, flat', test: 'a flat credit of 20 takes 20 off the bill', file: 'src/bill.ts', variants: [
    ok('금액을 뺌', "export function applyCredit(bill: number, credit: { kind: 'flat' | 'percent'; amount: number }) {\n  if (credit.kind === 'flat') return Math.max(0, bill - credit.amount);\n  return bill - (bill * credit.amount) / 100;\n}\n", RATE),
    bad('비율로 계산', "export function applyCredit(bill: number, credit: { kind: 'flat' | 'percent'; amount: number }) {\n  if (credit.kind === 'flat') return bill - (bill * credit.amount) / 100;\n  return bill - (bill * credit.amount) / 100;\n}\n", RATE),
  ] },
  { id: 'w-points-switch', area: '정액 계산식', req: '정액 포인트 할인은 포인트 금액을 그대로 뺀다', keywords: 'points, flat', test: '정액 포인트 500이면 500을 뺀다', file: 'src/points.ts', variants: [
    ok('switch FLAT · 금액을 뺌', SWITCH_POINTS('Math.max(0, balance - p.value)'), RATE),
    bad('switch FLAT · 비율로 계산', SWITCH_POINTS('balance - (balance * p.value) / 100'), RATE),
  ] },
  { id: 'w-coupon-2000', area: '정액 금액', req: '2,000원 정액 쿠폰은 결제 금액에서 2,000원을 뺀다', keywords: 'coupon, FIXED_COUPON', test: '2000원 정액 쿠폰은 2000원을 뺀다', file: 'src/coupon.ts', variants: [
    ok('2000', 'export const FIXED_COUPON = 2000;\nexport const withCoupon = (total: number) => Math.max(0, total - FIXED_COUPON);\n', MIN_ORDER),
    bad('200', 'export const FIXED_COUPON = 200;\nexport const withCoupon = (total: number) => Math.max(0, total - FIXED_COUPON);\n', MIN_ORDER),
  ] },
];

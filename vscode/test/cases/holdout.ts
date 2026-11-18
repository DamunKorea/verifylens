// 엔진을 고칠 때 보지 않은 사례. 다른 말투 · 다른 코드 습관으로 일부러 새로 썼다.
// 처음 돌린 점수를 기록해 두고(README 의 숫자가 아니라 정직한 기준선), 찾은 문제는 고친 뒤 회귀 시험으로 남긴다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

export const HOLDOUT: Case[] = [
  { id: 'h-class-retry', area: '횟수', req: 'Webhook delivery is retried at most 5 times', keywords: 'webhook, retries', test: 'webhook retries are at most 5', variants: [
    ok('클래스 필드', "export class Sender {\n  private readonly maxRetries = 5;\n  private retries = 0;\n  async send(webhook: () => Promise<void>) {\n    while (this.retries < this.maxRetries) {\n      this.retries += 1;\n      try { return await webhook(); } catch {}\n    }\n  }\n}\n"),
    bad('클래스 필드 값이 다름', "export class Sender {\n  private readonly maxRetries = 8;\n  private retries = 0;\n  async send(webhook: () => Promise<void>) {\n    while (this.retries < this.maxRetries) {\n      this.retries += 1;\n      try { return await webhook(); } catch {}\n    }\n  }\n}\n"),
    ok('줄여 가며 세기', "export async function send(webhook: () => Promise<void>) {\n  let retries = 5;\n  while (retries > 0) {\n    retries--;\n    try { return await webhook(); } catch {}\n  }\n}\n"),
    bad('줄여 가며 세기 >=', "export async function send(webhook: () => Promise<void>) {\n  let retries = 5;\n  while (retries >= 0) {\n    retries--;\n    try { return await webhook(); } catch {}\n  }\n}\n"),
  ] },
  { id: 'h-rate-config', area: '설정값', req: '로그인 요청은 1분에 최대 10번까지 허용한다', keywords: 'login, limit, max, window', test: 'login limit is 10 per window', variants: [
    ok('rateLimit 설정', "import rateLimit from 'express-rate-limit';\nexport const loginLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });\n"),
    bad('max 값이 다름', "import rateLimit from 'express-rate-limit';\nexport const loginLimit = rateLimit({ windowMs: 60 * 1000, max: 100 });\n"),
    bad('시간 창이 다름', "import rateLimit from 'express-rate-limit';\nexport const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });\n"),
  ] },
  { id: 'h-cookie', area: '시간', req: 'The session cookie lasts 7 days', keywords: 'session, cookie, maxAge', test: 'session cookie maxAge is 7 days', variants: [
    ok('maxAge ms', 'export const cookie = { name: "session", maxAge: 7 * 24 * 60 * 60 * 1000 };\n'),
    bad('maxAge 하루', 'export const cookie = { name: "session", maxAge: 24 * 60 * 60 * 1000 };\n'),
  ] },
  { id: 'h-jwt', area: '시간', req: '액세스 토큰은 1시간 뒤 만료된다', keywords: 'token, expires', test: 'token expires in 1 hour', variants: [
    ok('expiresIn 초', "import jwt from 'jsonwebtoken';\nexport const sign = (u: object) => jwt.sign(u, 's', { expiresIn: 3600 });\n"),
    ok("expiresIn '1h'", "import jwt from 'jsonwebtoken';\nexport const sign = (u: object) => jwt.sign(u, 's', { expiresIn: '1h' });\n"),
    bad("expiresIn '7d'", "import jwt from 'jsonwebtoken';\nexport const sign = (u: object) => jwt.sign(u, 's', { expiresIn: '7d' });\n"),
  ] },
  { id: 'h-upload', area: '크기', req: '업로드 파일은 10MB를 넘을 수 없다', keywords: 'upload, file, size', test: 'upload file size is limited to 10MB', variants: [
    ok('바이트', "export function check(file: { size: number }) {\n  if (file.size > 10 * 1024 * 1024) throw new Error('upload');\n}\n"),
    bad('5MB', "export function check(file: { size: number }) {\n  if (file.size > 5 * 1024 * 1024) throw new Error('upload');\n}\n"),
  ] },
  { id: 'h-yup-joi', area: '길이', req: '이름은 2글자 이상 30글자 이하', keywords: 'name, length', test: 'name length is between 2 and 30', variants: [
    ok('joi 체인', "import Joi from 'joi';\nexport const schema = Joi.object({ name: Joi.string().min(2).max(30) });\n"),
    bad('joi 위쪽 값', "import Joi from 'joi';\nexport const schema = Joi.object({ name: Joi.string().min(2).max(50) });\n"),
    ok('trim 뒤 길이', "export function check(name: string) {\n  const n = name.trim().length;\n  if (n < 2 || n > 30) throw new Error('name');\n}\n"),
  ] },
  { id: 'h-decorator', area: '길이', req: 'Username must be at most 15 characters', keywords: 'username, length', test: 'username length is at most 15', variants: [
    ok('데코레이터', "import { MaxLength } from 'class-validator';\nexport class Dto {\n  @MaxLength(15)\n  username!: string;\n}\n"),
    bad('데코레이터 값', "import { MaxLength } from 'class-validator';\nexport class Dto {\n  @MaxLength(20)\n  username!: string;\n}\n"),
  ] },
  { id: 'h-refine', area: '길이', req: '비밀번호는 최소 10자리여야 한다', keywords: 'password, length', test: 'password length is at least 10', variants: [
    ok('refine', "import { z } from 'zod';\nexport const password = z.string().refine((v) => v.length >= 10);\n"),
    bad('refine >', "import { z } from 'zod';\nexport const password = z.string().refine((v) => v.length > 10);\n"),
  ] },
  { id: 'h-not', area: '나이', req: '18세 이상만 가입할 수 있다', keywords: 'age, signup', test: 'signup needs age 18', variants: [
    ok('! 로 막기', "export function signup(age: number) {\n  if (!(age >= 18)) throw new Error('signup');\n}\n"),
    bad('! 로 막기 >', "export function signup(age: number) {\n  if (!(age > 18)) throw new Error('signup');\n}\n"),
    ok('이른 return false', "export function signup(age: number) {\n  if (age < 18) return false;\n  return true;\n}\n"),
    ok('헬퍼 상수 객체', "export const RULES = { signup: { minAge: 18 } } as const;\nexport function signup(age: number) {\n  return age >= RULES.signup.minAge;\n}\n"),
    bad('헬퍼 상수 객체 값', "export const RULES = { signup: { minAge: 20 } } as const;\nexport function signup(age: number) {\n  return age >= RULES.signup.minAge;\n}\n"),
  ] },
  { id: 'h-refund-window', area: '시간', req: '구매 후 30일 이내에만 환불할 수 있다', keywords: 'refund, days', test: 'refund within 30 days', variants: [
    ok('막는 조건', "export function refund(days: number) {\n  if (days > 30) throw new Error('refund');\n}\n"),
    bad('막는 조건 >=', "export function refund(days: number) {\n  if (days >= 30) throw new Error('refund');\n}\n"),
    ok('ms 계산', "const DAY = 24 * 60 * 60 * 1000;\nexport function refund(elapsedMs: number) {\n  if (elapsedMs > 30 * DAY) throw new Error('refund');\n}\n"),
  ] },
  { id: 'h-word-units', area: '말투', req: '하루에 3번까지 응모할 수 있다', keywords: 'entry, count', test: 'entry count is limited to 3', variants: [
    // 이번 응모가 entryCount 에 포함됐는지 코드만으로는 알 수 없다
    unk('>=', "export function enter(entryCount: number) {\n  if (entryCount >= 3) throw new Error('entry');\n}\n"),
    unk('>', "export function enter(entryCount: number) {\n  if (entryCount > 3) throw new Error('entry');\n}\n"),
    bad('다른 값', "export function enter(entryCount: number) {\n  if (entryCount > 10) throw new Error('entry');\n}\n"),
  ] },
  { id: 'h-no-more', area: '말투', req: 'A user can upload no more than 5 files', keywords: 'upload, files', test: 'upload files are limited to 5', variants: [
    ok('>', "export function upload(files: string[]) {\n  if (files.length > 5) throw new Error('upload');\n}\n"),
    bad('>=', "export function upload(files: string[]) {\n  if (files.length >= 5) throw new Error('upload');\n}\n"),
  ] },
  { id: 'h-exceed', area: '말투', req: 'The message must not exceed 280 characters', keywords: 'message, length', test: 'message length does not exceed 280', variants: [
    ok('>', "export function post(message: string) {\n  if (message.length > 280) throw new Error('message');\n}\n"),
    bad('>=', "export function post(message: string) {\n  if (message.length >= 280) throw new Error('message');\n}\n"),
    bad('다른 값', "export function post(message: string) {\n  if (message.length > 140) throw new Error('message');\n}\n"),
  ] },
  { id: 'h-or-more', area: '말투', req: 'Orders with 5 or more items get a discount', keywords: 'items, discount', test: 'discount for 5 items', variants: [
    ok('>=', "export const discount = (items: string[]) => (items.length >= 5 ? 0.1 : 0);\n"),
    bad('>', "export const discount = (items: string[]) => (items.length > 5 ? 0.1 : 0);\n"),
  ] },
  { id: 'h-won-under', area: '말투', req: '1,000원 미만은 결제할 수 없다', keywords: 'amount, payment', test: 'payment amount below 1000 is rejected', variants: [
    ok('<', "export function payment(amount: number) {\n  if (amount < 1000) throw new Error('payment');\n}\n"),
    bad('<=', "export function payment(amount: number) {\n  if (amount <= 1000) throw new Error('payment');\n}\n"),
  ] },
  { id: 'h-over-limit', area: '말투', req: '재고가 10개 초과일 때만 할인한다', keywords: 'stock, discount', test: 'discount when stock is over 10', variants: [
    ok('>', "export const discount = (stock: number) => (stock > 10 ? 0.2 : 0);\n"),
    bad('>=', "export const discount = (stock: number) => (stock >= 10 ? 0.2 : 0);\n"),
  ] },
  { id: 'h-week', area: '시간', req: '비밀번호는 2주마다 바꿔야 한다', keywords: 'password, age, days', test: 'password age is limited to 14 days', variants: [
    ok('14일', "export const mustChange = (passwordAgeDays: number) => passwordAgeDays >= 14;\n"),
    bad('30일', "export const mustChange = (passwordAgeDays: number) => passwordAgeDays >= 30;\n"),
  ] },
  { id: 'h-timeout', area: '시간', req: '결제 요청은 30초가 지나면 중단한다', keywords: 'payment, timeout', test: 'payment timeout is 30 seconds', variants: [
    ok('setTimeout', "export function payment(abort: () => void) {\n  const paymentTimeout = setTimeout(abort, 30000);\n  return paymentTimeout;\n}\n"),
    bad('setTimeout 다른 값', "export function payment(abort: () => void) {\n  const paymentTimeout = setTimeout(abort, 5000);\n  return paymentTimeout;\n}\n"),
  ] },
  { id: 'h-unrelated', area: '오탐 방지', req: '비밀번호는 8자 이상이어야 한다', keywords: 'password, length', test: 'password length must be at least 8', variants: [
    ok('다른 숫자가 함께 있음', "const MAX_LOGIN = 3;\nexport function check(password: string, tries: number) {\n  if (tries > MAX_LOGIN) throw new Error('tries');\n  if (password.length < 8) throw new Error('short');\n}\n"),
    unk('비었는지만 봄', "export function check(password: string) {\n  if (password.length === 0) throw new Error('empty');\n}\n"),
    unk('숫자가 함수 밖 설정', "import { config } from './config.ts';\nexport function check(password: string) {\n  if (password.length < config.passwordMin) throw new Error('short');\n}\n"),
  ] },
  { id: 'h-version', area: '오탐 방지', req: 'Node 22 이상에서 동작한다', keywords: 'node, version', test: 'node version check', variants: [
    ok('버전 비교', "export const supported = (nodeVersion: number) => nodeVersion >= 22;\n"),
    bad('버전 비교 다른 값', "export const supported = (nodeVersion: number) => nodeVersion >= 18;\n"),
  ] },
  { id: 'h-no-number-code', area: '구현 없음', req: '장바구니에는 최대 100개까지 담을 수 있다', keywords: 'cart, add', test: 'cart add works', variants: [
    unk('제한 코드가 아예 없음', "export function add(cart: string[], item: string) {\n  cart.push(item);\n}\n"),
  ] },
];

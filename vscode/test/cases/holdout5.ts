// 여섯 번째 묶음: 키워드 없이 판단하는 규칙을 고친 뒤에 쓴 사례. 이 묶음의 첫 점수가 그 규칙의 정직한 성적이다.
// 함정: 숫자는 같은데 다른 대상을 보는 코드, 상관없는 검사, 아예 없는 구현은 「확인됨」이면 안 된다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT5: Case[] = [
  { id: 't-coupon', area: '개수', req: '쿠폰은 주문 하나에 2장까지 쓸 수 있다', keywords: 'coupons', test: 'order accepts up to 2 coupons', variants: [
    ok('>', "export function apply(coupons: string[]) {\n  if (coupons.length > 2) throw new Error('coupon');\n}\n"),
    bad('>=', "export function apply(coupons: string[]) {\n  if (coupons.length >= 2) throw new Error('coupon');\n}\n"),
  ] },
  { id: 't-nick', area: '길이', req: 'Nicknames must be 3 to 20 characters', keywords: 'nickname', test: 'nickname length between 3 and 20', variants: [
    ok('범위', "export const valid = (nickname: string) => nickname.length >= 3 && nickname.length <= 20;\n"),
    bad('위쪽 미만', "export const valid = (nickname: string) => nickname.length >= 3 && nickname.length < 20;\n"),
  ] },
  { id: 't-idle', area: '시간', req: '30분 동안 활동이 없으면 로그아웃한다', keywords: 'idle, logout', test: 'logs out after 30 minutes idle', variants: [
    ok('ms', "export const shouldLogout = (idleMs: number) => idleMs >= 30 * 60 * 1000;\n"),
    bad('60분', "export const shouldLogout = (idleMs: number) => idleMs >= 60 * 60 * 1000;\n"),
  ] },
  { id: 't-results', area: '개수', req: 'A page shows at most 50 results', keywords: 'results, page', test: 'page returns at most 50 results', variants: [
    ok('slice', "export const page = (results: string[]) => results.slice(0, 50);\n"),
    bad('slice 100', "export const page = (results: string[]) => results.slice(0, 100);\n"),
  ] },
  { id: 't-refund', area: '기간', req: '구매 후 7일 이내에만 환불할 수 있다', keywords: 'refund, days', test: 'refund within 7 days', variants: [
    ok('<=', "export const canRefund = (daysSincePurchase: number) => daysSincePurchase <= 7;\n"),
    bad('<', "export const canRefund = (daysSincePurchase: number) => daysSincePurchase < 7;\n"),
  ] },
  { id: 't-trial', area: '기간', req: 'The free trial lasts 14 days', keywords: 'trial, days', test: 'trial ends after 14 days', variants: [
    ok('상수', "export const TRIAL_DAYS = 14;\n"),
    bad('다른 값', "export const TRIAL_DAYS = 30;\n"),
  ] },
  { id: 't-lock', area: '횟수', req: 'Accounts lock after 5 failed logins', keywords: 'failed, lock', test: 'account locks after 5 failed logins', variants: [
    ok('>=', "export const locked = (failedLogins: number) => failedLogins >= 5;\n"),
    bad('>', "export const locked = (failedLogins: number) => failedLogins > 5;\n"),
  ] },
  { id: 't-photos', area: '개수', req: '한 게시글에 사진은 10장까지 올릴 수 있다', keywords: 'photos', test: 'post accepts 10 photos', variants: [
    ok('>', "export function attach(photos: string[]) {\n  if (photos.length > 10) throw new Error('photos');\n}\n"),
    bad('>=', "export function attach(photos: string[]) {\n  if (photos.length >= 10) throw new Error('photos');\n}\n"),
  ] },
  { id: 't-password', area: '길이', req: '비밀번호는 8자 이상 64자 이하', keywords: 'password', test: 'password length 8 to 64', variants: [
    ok('막기', "export function check(password: string) {\n  if (password.length < 8 || password.length > 64) throw new Error('password');\n}\n"),
    bad('아래쪽 <=', "export function check(password: string) {\n  if (password.length <= 8 || password.length > 64) throw new Error('password');\n}\n"),
  ] },
  { id: 't-ship', area: '금액', req: 'Orders over 50 dollars ship free', keywords: 'order, total', test: 'free shipping over 50', variants: [
    ok('>', "export const freeShipping = (orderTotal: number) => orderTotal > 50;\n"),
    bad('>=', "export const freeShipping = (orderTotal: number) => orderTotal >= 50;\n"),
  ] },
  { id: 't-age', area: '나이', req: '만 14세 미만은 가입할 수 없다', keywords: 'age', test: 'under 14 cannot sign up', variants: [
    ok('<', "export function signup(age: number) {\n  if (age < 14) throw new Error('age');\n}\n"),
    bad('<=', "export function signup(age: number) {\n  if (age <= 14) throw new Error('age');\n}\n"),
  ] },
  { id: 't-download', area: '동시', req: 'At most 3 downloads run at the same time', keywords: 'downloads', test: 'downloads run 3 at a time', variants: [
    ok('넣기 전', "export function start(activeDownloads: string[], next: string) {\n  if (activeDownloads.length >= 3) return false;\n  activeDownloads.push(next);\n  return true;\n}\n"),
    bad('넣기 전 >', "export function start(activeDownloads: string[], next: string) {\n  if (activeDownloads.length > 3) return false;\n  activeDownloads.push(next);\n  return true;\n}\n"),
  ] },
  { id: 't-otp', area: '시간', req: '인증번호는 3분 동안만 유효하다', keywords: 'code, expires', test: 'verification code expires in 3 minutes', variants: [
    ok('초', "export const codeExpired = (elapsedSec: number) => elapsedSec > 180;\n"),
    bad('5분', "export const codeExpired = (elapsedSec: number) => elapsedSec > 300;\n"),
  ] },
  // 함정: 숫자만 같고 다른 대상
  { id: 't-trap-target', area: '함정', req: '태그는 최대 5개까지 붙일 수 있다', keywords: 'tags', test: 'items are limited to 5', variants: [
    unk('다른 대상', "export function add(items: string[]) {\n  if (items.length > 5) throw new Error('items');\n}\n"),
  ] },
  // 함정: 코드는 맞지만 검사가 상관없다
  { id: 't-trap-test', area: '함정', req: 'Comments are limited to 300 characters', keywords: 'comment', test: 'homepage renders', variants: [
    unk('상관없는 검사', "export const check = (comment: string) => {\n  if (comment.length > 300) throw new Error('long');\n};\n"),
  ] },
  // 함정: 검사 이름은 맞지만 구현이 없다
  { id: 't-trap-none', area: '함정', req: '장바구니에는 최대 20개까지 담을 수 있다', keywords: 'cart', test: 'cart holds 20 items', variants: [
    unk('구현 없음', "export const add = (cart: string[], item: string) => cart.push(item);\n"),
  ] },
  // 함정: 같은 숫자를 쓰지만 다른 규칙의 검사
  { id: 't-trap-number', area: '함정', req: '비밀번호는 12자 이상이어야 한다', keywords: 'password', test: 'password reset link expires in 12 hours', variants: [
    bad('값이 다름', "export const valid = (password: string) => password.length >= 8;\n"),
  ] },
];

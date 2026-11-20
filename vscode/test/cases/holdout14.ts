// 열다섯 번째 묶음: 0.12.0 을 고치기 전에 썼다 (11/20 홍보 세션 사용성 시험에서 나온 거짓 경보).
// 요구사항의 꾸밈말(「비밀번호」 재설정 메일)이 같은 파일의 다른 숫자 줄(비밀번호 길이)과 겹치는 경우.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

const PW = "export function validatePassword(pw: string) {\n  if (pw.length < 8 || pw.length >= 64) throw new Error('PASSWORD_LENGTH');\n}\n";

export const HOLDOUT14: Case[] = [
  { id: 'n-reset-mail', area: '이웃 줄', req: '비밀번호 재설정 메일은 하루에 3번까지만 보낼 수 있다', keywords: 'reset, sentToday', test: 'reset mail is limited to 3 per day', variants: [
    ok('보낸 뒤 세기', "const MAX_RESET_PER_DAY = 3;\n" + PW + "export function sendResetMail(user: { sentToday: number }) {\n  if (user.sentToday >= MAX_RESET_PER_DAY) throw new Error('TOO_MANY');\n  user.sentToday++;\n}\n"),
    ok('먼저 세기', "const MAX_RESET_PER_DAY = 3;\n" + PW + "export function sendResetMail(user: { sentToday: number }) {\n  user.sentToday++;\n  if (user.sentToday > MAX_RESET_PER_DAY) throw new Error('TOO_MANY');\n}\n"),
    bad('5번', "const MAX_RESET_PER_DAY = 5;\n" + PW + "export function sendResetMail(user: { sentToday: number }) {\n  if (user.sentToday >= MAX_RESET_PER_DAY) throw new Error('TOO_MANY');\n  user.sentToday++;\n}\n"),
    unk('제한 없음', PW + "export function sendResetMail(user: { sentToday: number }) {\n  user.sentToday++;\n}\n"),
  ] },
  { id: 'n-otp-tries', area: '이웃 줄', req: 'An OTP code can be tried at most 5 times', keywords: 'otp, attempts', test: 'a sixth otp attempt is rejected', variants: [
    ok('보낸 뒤 세기', "export function checkOtp(s: { attempts: number; code: string }, otp: string) {\n  if (otp.length !== 6) throw new Error('FORMAT');\n  if (s.attempts >= 5) throw new Error('LOCKED');\n  s.attempts++;\n  return s.code === otp;\n}\n"),
    bad('3번', "export function checkOtp(s: { attempts: number; code: string }, otp: string) {\n  if (otp.length !== 6) throw new Error('FORMAT');\n  if (s.attempts >= 3) throw new Error('LOCKED');\n  s.attempts++;\n  return s.code === otp;\n}\n"),
    unk('횟수 검사 없음', "export function checkOtp(s: { attempts: number; code: string }, otp: string) {\n  if (otp.length !== 6) throw new Error('FORMAT');\n  s.attempts++;\n  return s.code === otp;\n}\n"),
  ] },
  { id: 'n-coupon-entry', area: '이웃 줄', req: '쿠폰 코드는 하루에 5번까지만 입력할 수 있다', keywords: 'coupon, triesToday', test: 'coupon entry is limited to 5 per day', variants: [
    ok('보낸 뒤 세기', "export function enterCoupon(u: { triesToday: number }, code: string) {\n  if (code.length !== 12) throw new Error('FORMAT');\n  if (u.triesToday >= 5) throw new Error('TOO_MANY');\n  u.triesToday++;\n}\n"),
    bad('10번', "export function enterCoupon(u: { triesToday: number }, code: string) {\n  if (code.length !== 12) throw new Error('FORMAT');\n  if (u.triesToday >= 10) throw new Error('TOO_MANY');\n  u.triesToday++;\n}\n"),
  ] },
  { id: 'n-username-change', area: '이웃 줄', req: 'A user can change their username at most 2 times a month', keywords: 'username, changesThisMonth', test: 'a third username change in a month is rejected', variants: [
    ok('보낸 뒤 세기', "export function renameUser(u: { changesThisMonth: number; username: string }, next: string) {\n  if (next.length < 3 || next.length > 20) throw new Error('USERNAME_LENGTH');\n  if (u.changesThisMonth >= 2) throw new Error('TOO_MANY');\n  u.changesThisMonth++;\n  u.username = next;\n}\n"),
    bad('3번', "export function renameUser(u: { changesThisMonth: number; username: string }, next: string) {\n  if (next.length < 3 || next.length > 20) throw new Error('USERNAME_LENGTH');\n  if (u.changesThisMonth >= 3) throw new Error('TOO_MANY');\n  u.changesThisMonth++;\n  u.username = next;\n}\n"),
  ] },
  { id: 'n-cart-items', area: '이웃 줄', req: '장바구니에는 상품을 20개까지 담을 수 있다', keywords: 'cart, items', test: 'the 21st cart item is rejected', variants: [
    ok('담기 전', "export function validateProduct(p: { name: string }) {\n  if (p.name.length > 50) throw new Error('NAME');\n}\nexport function addToCart(cart: { items: string[] }, id: string) {\n  if (cart.items.length >= 20) throw new Error('CART_FULL');\n  cart.items.push(id);\n}\n"),
    bad('30개', "export function validateProduct(p: { name: string }) {\n  if (p.name.length > 50) throw new Error('NAME');\n}\nexport function addToCart(cart: { items: string[] }, id: string) {\n  if (cart.items.length >= 30) throw new Error('CART_FULL');\n  cart.items.push(id);\n}\n"),
  ] },
  { id: 'n-nickname-30d', area: '이웃 줄', req: '닉네임은 30일에 한 번만 바꿀 수 있다', keywords: 'nickname, changedAt', test: 'nickname cannot be changed again within 30 days', variants: [
    ok('Date.now', "const DAY = 24 * 60 * 60 * 1000;\nexport function changeNickname(u: { changedAt: number; nickname: string }, next: string) {\n  if (next.length > 12) throw new Error('NICKNAME_LENGTH');\n  if (Date.now() - u.changedAt < 30 * DAY) throw new Error('TOO_SOON');\n  u.nickname = next;\n  u.changedAt = Date.now();\n}\n"),
    bad('7일', "const DAY = 24 * 60 * 60 * 1000;\nexport function changeNickname(u: { changedAt: number; nickname: string }, next: string) {\n  if (next.length > 12) throw new Error('NICKNAME_LENGTH');\n  if (Date.now() - u.changedAt < 7 * DAY) throw new Error('TOO_SOON');\n  u.nickname = next;\n  u.changedAt = Date.now();\n}\n"),
  ] },
  { id: 'n-comment-edit', area: '이웃 줄', req: 'Comments can be edited for 10 minutes after posting', keywords: 'comment, postedAt', test: 'a comment cannot be edited after 10 minutes', variants: [
    ok('Date.now', "const MINUTE = 60 * 1000;\nexport function editComment(c: { postedAt: number; text: string }, text: string) {\n  if (text.length > 500) throw new Error('TOO_LONG');\n  if (Date.now() - c.postedAt > 10 * MINUTE) throw new Error('TOO_LATE');\n  c.text = text;\n}\n"),
    bad('60분', "const MINUTE = 60 * 1000;\nexport function editComment(c: { postedAt: number; text: string }, text: string) {\n  if (text.length > 500) throw new Error('TOO_LONG');\n  if (Date.now() - c.postedAt > 60 * MINUTE) throw new Error('TOO_LATE');\n  c.text = text;\n}\n"),
  ] },
  { id: 'n-invite-trap', area: '함정', req: '팀 초대 메일은 하루에 10번까지만 보낼 수 있다', keywords: 'invite, sentToday', test: 'invite mail is limited to 10 per day', variants: [
    unk('제한 없음, 이웃 줄만', "export function validateTeamName(name: string) {\n  if (name.length > 10) throw new Error('TEAM_NAME');\n}\nexport function sendInvite(team: { sentToday: number }) {\n  team.sentToday++;\n}\n"),
  ] },
];

// 서른두 번째 묶음: 한국어 키워드(11/21 밤). 요구사항 · 키워드 · 검사 이름은 한국어, 코드는 영어.
// 「| keywords: 실패, 잠금」처럼 키워드를 한국어로 적으면 코드의 영어 이름과 이어지지 않던 문제(0.19.0 바뀐 검사 둘째 묶음에서 찾음)를 보려고, 고치기 전에 썼다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

export const HOLDOUT31: Case[] = [
  { id: 'k-lock', area: '한국어 키워드 · 잠금', req: '연속 5회 실패하면 계정을 잠근다', keywords: '실패, 잠금', test: '5번 연속 실패하면 계정을 잠근다', file: 'src/login.ts', variants: [
    ok('5번째에 잠금', 'export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures >= 5) user.locked = true;\n}\n'),
    bad('6번째에 잠금', 'export function onFailedLogin(user: { failures: number; locked: boolean }) {\n  user.failures += 1;\n  if (user.failures > 5) user.locked = true;\n}\n'),
  ] },
  { id: 'k-free-ship', area: '한국어 키워드 · 금액', req: '5만원 이상 주문은 배송비가 무료다', keywords: '배송비, 무료', test: '5만원 이상 주문은 배송비가 무료다', file: 'src/shipping.ts', variants: [
    ok('5만원부터 무료', 'export function shippingFee(total: number) {\n  return total >= 50000 ? 0 : 3000;\n}\n'),
    bad('5만원 초과부터 무료', 'export function shippingFee(total: number) {\n  return total > 50000 ? 0 : 3000;\n}\n'),
  ] },
  { id: 'k-password', area: '한국어 키워드 · 길이', req: '비밀번호는 8자 이상이어야 한다', keywords: '비밀번호, 길이', test: '8자보다 짧은 비밀번호는 거부한다', file: 'src/password.ts', variants: [
    ok('8자', "export function setPassword(user: { hash: string }, password: string) {\n  if (password.length < 8) throw new Error('TOO_SHORT');\n  user.hash = hash(password);\n}\n"),
    bad('6자', "export function setPassword(user: { hash: string }, password: string) {\n  if (password.length < 6) throw new Error('TOO_SHORT');\n  user.hash = hash(password);\n}\n"),
  ] },
  { id: 'k-invite', area: '한국어 키워드 · 하루 횟수', req: '초대는 하루에 최대 3번까지 보낼 수 있다', keywords: '초대', test: '하루에 네 번째 초대는 거부한다', file: 'src/invite.ts', variants: [
    ok('오늘 보낸 것 3번', "const DAY = 24 * 60 * 60 * 1000;\nexport function sendInvite(user: { invites: number[] }, to: string, now: number) {\n  const sentToday = user.invites.filter((t) => now - t < DAY);\n  if (sentToday.length >= 3) throw new Error('LIMIT');\n  user.invites.push(now);\n  return mail.send(to);\n}\n"),
    bad('오늘 보낸 것 4번', "const DAY = 24 * 60 * 60 * 1000;\nexport function sendInvite(user: { invites: number[] }, to: string, now: number) {\n  const sentToday = user.invites.filter((t) => now - t < DAY);\n  if (sentToday.length >= 4) throw new Error('LIMIT');\n  user.invites.push(now);\n  return mail.send(to);\n}\n"),
  ] },
  { id: 'k-file', area: '한국어 키워드 · 크기', req: '파일은 10MB 이하만 올릴 수 있다', keywords: '파일, 크기', test: '10MB 를 넘는 파일은 거부한다', file: 'src/upload.ts', variants: [
    ok('10MB', "export function upload(file: { size: number }) {\n  if (file.size > 10 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return storage.put(file);\n}\n"),
    bad('20MB', "export function upload(file: { size: number }) {\n  if (file.size > 20 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return storage.put(file);\n}\n"),
  ] },
  { id: 'k-age', area: '한국어 키워드 · 나이', req: '14세 이상만 가입할 수 있다', keywords: '나이, 가입', test: '14세 미만은 가입을 거부한다', file: 'src/signup.ts', variants: [
    ok('14세', "export function signup(form: { age: number; email: string }) {\n  if (form.age < 14) throw new Error('TOO_YOUNG');\n  return users.create(form);\n}\n"),
    bad('12세', "export function signup(form: { age: number; email: string }) {\n  if (form.age < 12) throw new Error('TOO_YOUNG');\n  return users.create(form);\n}\n"),
  ] },
  { id: 'k-cart', area: '한국어 키워드 · 개수', req: '장바구니에는 상품을 최대 20개까지 담을 수 있다', keywords: '장바구니, 상품', test: '장바구니에 21번째 상품은 담을 수 없다', file: 'src/cart.ts', variants: [
    ok('20개', "export function addItem(cart: { items: string[] }, item: string) {\n  if (cart.items.length >= 20) throw new Error('CART_FULL');\n  cart.items.push(item);\n}\n"),
    bad('30개', "export function addItem(cart: { items: string[] }, item: string) {\n  if (cart.items.length >= 30) throw new Error('CART_FULL');\n  cart.items.push(item);\n}\n"),
  ] },
  { id: 'k-locked-login', area: '한국어 키워드 · 잠긴 계정', req: '잠긴 계정은 비밀번호가 맞아도 로그인할 수 없다', keywords: '잠금, 로그인', test: '잠긴 계정은 맞는 비밀번호로도 로그인을 거부한다', file: 'src/auth.ts', variants: [
    ok('locked 막기', "export async function login(user: { locked: boolean; hash: string }, password: string) {\n  if (user.locked) throw new Error('LOCKED');\n  return check(password, user.hash);\n}\n"),
    unk('검사 없음', 'export async function login(user: { locked: boolean; hash: string }, password: string) {\n  return check(password, user.hash);\n}\n'),
  ] },
  { id: 'k-coupon-once', area: '한국어 키워드 · 한 번만', req: '쿠폰은 한 번만 쓸 수 있다', keywords: '쿠폰, 사용', test: '이미 쓴 쿠폰을 다시 쓰면 거부한다', file: 'src/coupon.ts', variants: [
    ok('usedAt 확인', "export function redeem(coupon: { usedAt: Date | null } | null) {\n  if (!coupon) throw new Error('NOT_FOUND');\n  if (coupon.usedAt) throw new Error('ALREADY_USED');\n  coupon.usedAt = new Date();\n}\n"),
    unk('없는 쿠폰만 막기', "export function redeem(coupon: { usedAt: Date | null } | null) {\n  if (!coupon) throw new Error('NOT_FOUND');\n  coupon.usedAt = new Date();\n}\n"),
  ] },
  { id: 'k-comment', area: '한국어 키워드 · 글자 수', req: '댓글은 500자를 넘을 수 없다', keywords: '댓글, 길이', test: '500자를 넘는 댓글은 거부한다', file: 'src/comment.ts', variants: [
    ok('500자', "export function addComment(text: string) {\n  if (text.length > 500) throw new Error('TOO_LONG');\n  return comments.add(text);\n}\n"),
    bad('1000자', "export function addComment(text: string) {\n  if (text.length > 1000) throw new Error('TOO_LONG');\n  return comments.add(text);\n}\n"),
  ] },
];

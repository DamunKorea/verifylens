// 스물아홉 번째 묶음: 검사의 주인(부르는 함수 · 설정값을 쓰는 함수)과 낱말(쓰다 · registration)을 고친 뒤 처음 썼다(고칠 때 안 본 사례).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

const ADMIN = { 'src/admin.ts': "export function deleteUser(actor: { isAdmin: boolean }, id: string) {\n  if (!actor.isAdmin) throw new Error('FORBIDDEN');\n  return users.remove(id);\n}\n" };

export const HOLDOUT28: Case[] = [
  { id: 's-transfer-max', area: '같은 파일 다른 기능 · 숫자', req: 'Transfers over 1,000,000 won are rejected', keywords: 'transfer, amount', test: 'a transfer over 1,000,000 won is rejected', file: 'src/payments.ts', variants: [
    ok('sendTransfer 에 검사', "export function payInvoice(amount: number) {\n  if (amount > 1_000_000) throw new Error('TOO_MUCH');\n  return ledger.pay(amount);\n}\nexport function sendTransfer(amount: number, to: string) {\n  if (amount > 1_000_000) throw new Error('TOO_MUCH');\n  return ledger.transfer(to, amount);\n}\n"),
    unk('payInvoice 에만 검사', "export function payInvoice(amount: number) {\n  if (amount > 1_000_000) throw new Error('TOO_MUCH');\n  return ledger.pay(amount);\n}\nexport function sendTransfer(amount: number, to: string) {\n  return ledger.transfer(to, amount);\n}\n"),
  ] },
  { id: 's-adult-helper', area: '검사 함수 부르기', req: '미성년자는 주류를 살 수 없다', keywords: 'alcohol, adult', test: '미성년자의 주류 구매는 거부한다', file: 'src/shop.ts', variants: [
    ok('buyAlcohol 이 ensureAdult 를 부름', "const ensureAdult = (age: number) => {\n  if (age < 19) throw new Error('MINOR');\n};\nexport const buyAlcohol = (u: { age: number }, item: string) => {\n  ensureAdult(u.age);\n  return orders.add(item);\n};\nexport const buyTicket = (u: { age: number }, item: string) => {\n  return orders.add(item);\n};\n"),
    unk('buyTicket 만 ensureAdult 를 부름', "const ensureAdult = (age: number) => {\n  if (age < 19) throw new Error('MINOR');\n};\nexport const buyAlcohol = (u: { age: number }, item: string) => {\n  return orders.add(item);\n};\nexport const buyTicket = (u: { age: number }, item: string) => {\n  ensureAdult(u.age);\n  return orders.add(item);\n};\n"),
  ] },
  { id: 's-free-ship-config', area: '설정값을 쓰는 함수', req: '5만 원 이상 주문은 배송비가 무료다', keywords: 'shipping, free', test: '5만 원 이상 주문의 배송비는 0원이다', file: 'src/shipping.ts', variants: [
    ok('shippingFee 가 설정값을 씀', "const FREE_SHIPPING_MIN = 50000;\nexport function shippingFee(total: number) {\n  return total >= FREE_SHIPPING_MIN ? 0 : 3000;\n}\nexport function pointsBonus(total: number) {\n  return total >= 100000 ? 100 : 0;\n}\n"),
    unk('pointsBonus 만 설정값을 씀', "const FREE_SHIPPING_MIN = 50000;\nexport function shippingFee(total: number) {\n  return 3000;\n}\nexport function pointsBonus(total: number) {\n  return total >= FREE_SHIPPING_MIN ? 100 : 0;\n}\n"),
  ] },
  { id: 's-two-classes', area: '두 클래스 같은 메서드 이름', req: '재고가 없는 상품은 장바구니에 담을 수 없다', keywords: 'cart, stock', test: '재고가 없는 상품을 장바구니에 담으면 거부한다', file: 'src/services.ts', variants: [
    ok('CartService.add 에 검사', "export class CartService {\n  add(item: { stock: number }) {\n    if (item.stock <= 0) throw new Error('OUT_OF_STOCK');\n    return cart.push(item);\n  }\n}\nexport class WishlistService {\n  add(item: { stock: number }) {\n    return wishlist.push(item);\n  }\n}\n"),
    unk('WishlistService.add 에만 검사', "export class CartService {\n  add(item: { stock: number }) {\n    return cart.push(item);\n  }\n}\nexport class WishlistService {\n  add(item: { stock: number }) {\n    if (item.stock <= 0) throw new Error('OUT_OF_STOCK');\n    return wishlist.push(item);\n  }\n}\n"),
  ] },
  { id: 's-ban-admin', area: '다른 파일 다른 기능', req: 'Only admins can ban users', keywords: 'ban, admin', test: 'a non-admin cannot ban a user', file: 'src/user.ts', variants: [
    ok('banUser 에 검사', "export function banUser(actor: { isAdmin: boolean }, id: string) {\n  if (!actor.isAdmin) throw new Error('FORBIDDEN');\n  return users.ban(id);\n}\n", ADMIN),
    unk('deleteUser 에만 검사', 'export function banUser(actor: { isAdmin: boolean }, id: string) {\n  return users.ban(id);\n}\n', ADMIN),
  ] },
  { id: 's-can-buy', area: 'return false 로 막기', req: '18세 미만은 구매할 수 없다', keywords: 'buy, age', test: '18세 미만의 구매는 거부한다', file: 'src/access.ts', variants: [
    ok('canBuy 에 검사', "export function canEnter(user: { age: number }) {\n  if (user.age < 18) return false;\n  return true;\n}\nexport function canBuy(user: { age: number }) {\n  if (user.age < 18) return false;\n  return true;\n}\n"),
    unk('canEnter 에만 검사', "export function canEnter(user: { age: number }) {\n  if (user.age < 18) return false;\n  return true;\n}\nexport function canBuy(user: { age: number }) {\n  return true;\n}\n"),
  ] },
  { id: 's-pw-digit', area: '같은 함수 다른 검사', req: 'Passwords must contain at least one digit', keywords: 'password, digit', test: 'a password without a digit is rejected', file: 'src/password.ts', variants: [
    ok('setPassword 에 숫자 검사', "export function validatePin(pin: string) {\n  if (!/\\d/.test(pin)) throw new Error('NO_DIGIT');\n}\nexport function setPassword(user: { pw: string }, pw: string) {\n  if (pw.length < 8) throw new Error('TOO_SHORT');\n  if (!/\\d/.test(pw)) throw new Error('NO_DIGIT');\n  user.pw = pw;\n}\n"),
    unk('setPassword 는 길이만', "export function validatePin(pin: string) {\n  if (!/\\d/.test(pin)) throw new Error('NO_DIGIT');\n}\nexport function setPassword(user: { pw: string }, pw: string) {\n  if (pw.length < 8) throw new Error('TOO_SHORT');\n  user.pw = pw;\n}\n"),
  ] },
  { id: 's-cart-dup', area: '같은 파일 중복 막기', req: '같은 상품은 장바구니에 한 번만 담긴다', keywords: 'cart, product', test: '같은 상품을 장바구니에 다시 담아도 하나만 남는다', file: 'src/lists.ts', variants: [
    ok('addToCart 에 중복 검사', "export function addToWishlist(list: string[], id: string) {\n  if (list.includes(id)) return list;\n  return [...list, id];\n}\nexport function addToCart(cart: string[], id: string) {\n  if (cart.includes(id)) return cart;\n  return [...cart, id];\n}\n"),
    unk('addToWishlist 에만 중복 검사', "export function addToWishlist(list: string[], id: string) {\n  if (list.includes(id)) return list;\n  return [...list, id];\n}\nexport function addToCart(cart: string[], id: string) {\n  return [...cart, id];\n}\n"),
  ] },
  { id: 's-daily-checkin', area: '하루에 한 번', req: '출석 체크는 하루에 한 번만 할 수 있다', keywords: 'checkin, attendance', test: '같은 날 두 번째 출석 체크는 거부한다', file: 'src/attendance.ts', variants: [
    ok('같은 날만 막기', "import { isSameDay } from 'date-fns';\nexport function checkin(log: Date[], now: Date) {\n  const today = log.filter((d) => isSameDay(d, now));\n  if (today.length >= 1) throw new Error('ALREADY_CHECKED_IN');\n  log.push(now);\n}\n"),
    unk('시간 창 없음 · 한 번 하면 끝', "export function checkin(log: Date[], now: Date) {\n  if (log.length >= 1) throw new Error('ALREADY_CHECKED_IN');\n  log.push(now);\n}\n"),
  ] },
  { id: 's-comment-len', area: '한 함수 · 숫자', req: 'Comments longer than 500 characters are rejected', keywords: 'comment, length', test: 'rejects a comment longer than 500 characters', file: 'src/comment.ts', variants: [
    ok('> 500', "export function postComment(text: string) {\n  if (text.length > 500) throw new Error('TOO_LONG');\n  return comments.add(text);\n}\n"),
    bad('> 5000', "export function postComment(text: string) {\n  if (text.length > 5000) throw new Error('TOO_LONG');\n  return comments.add(text);\n}\n"),
  ] },
];

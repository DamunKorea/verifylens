// 스물일곱 번째 묶음: 같은 파일 안 다른 기능 함수의 검사(국내 홍보 세션이 체험 페이지에서 찾은 0.16.0 「확인됨」 오판:
// signup.ts 안 subscribe 의 이메일 검사가 「가입 거부」의 근거가 됨). 고치기 전에 먼저 썼다. 실제 사용자 의견은 아니다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

const EMAIL = "const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n";

export const HOLDOUT26: Case[] = [
  { id: 'v-signup-file', area: '같은 파일 다른 기능', req: '이메일 형식이 올바르지 않으면 가입을 거부한다', keywords: 'email, signup', test: 'signup rejects an invalid email', file: 'src/signup.ts', variants: [
    ok('signup 에도 검사', EMAIL + "export function subscribe(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return newsletter.add(email);\n}\nexport function signup(email: string, password: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return users.create({ email, password });\n}\n"),
    unk('subscribe 에만 검사', EMAIL + "export function subscribe(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return newsletter.add(email);\n}\nexport function signup(email: string, password: string) {\n  return users.create({ email, password });\n}\n"),
  ] },
  { id: 'v-refund-file', area: '같은 파일 다른 기능', req: '환불은 결제가 끝난 주문만 할 수 있다', keywords: 'refund, paid', test: '결제 전 주문의 환불은 거부한다', file: 'src/refund.ts', variants: [
    ok('refund 에 검사', "export function cancelOrder(order: { status: string }) {\n  if (order.status !== 'paid') throw new Error('NOT_PAID');\n  order.status = 'canceled';\n}\nexport function refundOrder(order: { status: string }) {\n  if (order.status !== 'paid') throw new Error('NOT_PAID');\n  order.status = 'refunded';\n}\n"),
    unk('cancel 에만 검사', "export function cancelOrder(order: { status: string }) {\n  if (order.status !== 'paid') throw new Error('NOT_PAID');\n  order.status = 'canceled';\n}\nexport function refundOrder(order: { status: string }) {\n  order.status = 'refunded';\n}\n"),
  ] },
  { id: 'v-upload-file', area: '같은 파일 다른 기능 · 숫자', req: 'Document uploads larger than 5MB are rejected', keywords: 'document, upload', test: 'rejects a document upload larger than 5MB', file: 'src/upload.ts', variants: [
    ok('document 에 검사', "export function uploadAvatar(file: { size: number }) {\n  if (file.size > 5 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return store.put(file);\n}\nexport function uploadDocument(file: { size: number }) {\n  if (file.size > 5 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return docs.put(file);\n}\n"),
    unk('avatar 에만 검사', "export function uploadAvatar(file: { size: number }) {\n  if (file.size > 5 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return store.put(file);\n}\nexport function uploadDocument(file: { size: number }) {\n  return docs.put(file);\n}\n"),
  ] },
  { id: 'v-comment-file', area: '같은 파일 다른 기능', req: 'Only the author can delete a comment', keywords: 'comment, author', test: 'deleting another user\'s comment is rejected', file: 'src/comment.ts', variants: [
    ok('delete 에 검사', "export function editComment(c: { authorId: string }, userId: string, text: string) {\n  if (c.authorId !== userId) throw new Error('FORBIDDEN');\n  return { ...c, text };\n}\nexport function deleteComment(c: { authorId: string }, userId: string) {\n  if (c.authorId !== userId) throw new Error('FORBIDDEN');\n  return comments.remove(c);\n}\n"),
    unk('edit 에만 검사', "export function editComment(c: { authorId: string }, userId: string, text: string) {\n  if (c.authorId !== userId) throw new Error('FORBIDDEN');\n  return { ...c, text };\n}\nexport function deleteComment(c: { authorId: string }, userId: string) {\n  return comments.remove(c);\n}\n"),
  ] },
  { id: 'v-gift-file', area: '같은 파일 다른 기능', req: '만료된 쿠폰은 선물할 수 없다', keywords: 'coupon, gift', test: '만료된 쿠폰 선물은 거부한다', file: 'src/coupon.ts', variants: [
    ok('gift 에 검사', "export function applyCoupon(c: { expiresAt: number }, now: number) {\n  if (c.expiresAt < now) throw new Error('EXPIRED');\n  return c;\n}\nexport function giftCoupon(c: { expiresAt: number }, now: number, to: string) {\n  if (c.expiresAt < now) throw new Error('EXPIRED');\n  return gifts.send(c, to);\n}\n"),
    unk('apply 에만 검사', "export function applyCoupon(c: { expiresAt: number }, now: number) {\n  if (c.expiresAt < now) throw new Error('EXPIRED');\n  return c;\n}\nexport function giftCoupon(c: { expiresAt: number }, now: number, to: string) {\n  return gifts.send(c, to);\n}\n"),
  ] },
  { id: 'v-password-file', area: '같은 파일 다른 기능 · 숫자', req: '비밀번호를 바꿀 때 새 비밀번호는 8자 이상이어야 한다', keywords: 'password, change', test: '8자보다 짧은 새 비밀번호로 변경은 거부한다', file: 'src/password.ts', variants: [
    ok('change 에 검사', "export function resetPassword(user: { pw: string }, next: string) {\n  if (next.length < 8) throw new Error('TOO_SHORT');\n  user.pw = next;\n}\nexport function changePassword(user: { pw: string }, next: string) {\n  if (next.length < 8) throw new Error('TOO_SHORT');\n  user.pw = next;\n}\n"),
    unk('reset 에만 검사', "export function resetPassword(user: { pw: string }, next: string) {\n  if (next.length < 8) throw new Error('TOO_SHORT');\n  user.pw = next;\n}\nexport function changePassword(user: { pw: string }, next: string) {\n  user.pw = next;\n}\n"),
  ] },
  { id: 'v-guest-file', area: '같은 파일 다른 기능', req: 'Guest invites to an invalid email address are rejected', keywords: 'guest, invite', test: 'a guest invite to an invalid email is rejected', file: 'src/invite.ts', variants: [
    ok('guest 에 검사', EMAIL + "export function inviteMember(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return members.invite(email);\n}\nexport function inviteGuest(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return guests.invite(email);\n}\n"),
    unk('member 에만 검사', EMAIL + "export function inviteMember(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n  return members.invite(email);\n}\nexport function inviteGuest(email: string) {\n  return guests.invite(email);\n}\n"),
  ] },
  { id: 'v-bio-file', area: '같은 파일 다른 기능 · 숫자', req: '자기소개는 200자까지만 저장한다', keywords: 'bio, profile', test: '200자를 넘는 자기소개 저장은 거부한다', file: 'src/profile.ts', variants: [
    ok('bio 에 검사', "export function updateNickname(p: { nickname: string }, v: string) {\n  if (v.length > 200) throw new Error('TOO_LONG');\n  p.nickname = v;\n}\nexport function updateBio(p: { bio: string }, v: string) {\n  if (v.length > 200) throw new Error('TOO_LONG');\n  p.bio = v;\n}\n"),
    unk('nickname 에만 검사', "export function updateNickname(p: { nickname: string }, v: string) {\n  if (v.length > 200) throw new Error('TOO_LONG');\n  p.nickname = v;\n}\nexport function updateBio(p: { bio: string }, v: string) {\n  p.bio = v;\n}\n"),
  ] },
  { id: 'v-draft-file', area: '같은 파일 다른 기능', req: 'An empty cart cannot be saved as a draft', keywords: 'cart, draft', test: 'saving an empty cart as a draft is rejected', file: 'src/cart.ts', variants: [
    ok('draft 에 검사', "export function placeOrder(cart: { items: string[] }) {\n  if (cart.items.length === 0) throw new Error('EMPTY_CART');\n  return orders.create(cart);\n}\nexport function saveDraft(cart: { items: string[] }) {\n  if (cart.items.length === 0) throw new Error('EMPTY_CART');\n  return drafts.save(cart);\n}\n"),
    unk('order 에만 검사', "export function placeOrder(cart: { items: string[] }) {\n  if (cart.items.length === 0) throw new Error('EMPTY_CART');\n  return orders.create(cart);\n}\nexport function saveDraft(cart: { items: string[] }) {\n  return drafts.save(cart);\n}\n"),
  ] },
  { id: 'v-otp-file', area: '같은 파일 다른 기능', req: '잠긴 계정은 OTP 로도 로그인할 수 없다', keywords: 'otp, locked', test: '잠긴 계정의 OTP 로그인은 거부한다', file: 'src/login.ts', variants: [
    ok('otp 에 검사', "export function loginWithPassword(user: { locked: boolean }) {\n  if (user.locked) throw new Error('LOCKED');\n  return session.start(user);\n}\nexport function loginWithOtp(user: { locked: boolean }) {\n  if (user.locked) throw new Error('LOCKED');\n  return session.start(user);\n}\n"),
    unk('password 로그인에만 검사', "export function loginWithPassword(user: { locked: boolean }) {\n  if (user.locked) throw new Error('LOCKED');\n  return session.start(user);\n}\nexport function loginWithOtp(user: { locked: boolean }) {\n  return session.start(user);\n}\n"),
  ] },
];

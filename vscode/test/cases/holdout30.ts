// 서른한 번째 묶음: 다른 상태 · 알림 날짜 · 「두 번 ~할 수 없다」 · 한 번 쓰는 코드 · 키워드 일부를 고친 뒤 처음 썼다(고칠 때 안 본 사례).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

const TITLE = { 'src/title.ts': "const BANNED = ['spam', 'scam'];\nexport function setTitle(post: { title: string }, title: string) {\n  if (BANNED.some((w) => title.includes(w))) throw new Error('BANNED_WORD');\n  post.title = title;\n}\n" };

export const HOLDOUT30: Case[] = [
  { id: 'q-publish-approved', area: '다른 상태', req: 'Only approved posts can be published', keywords: 'publish, approved', test: 'publishing a post that is not approved is rejected', file: 'src/publish.ts', variants: [
    ok('approved 가 아니면 막기', "export function publish(post: { status: string }) {\n  if (post.status !== 'approved') throw new Error('NOT_APPROVED');\n  post.status = 'published';\n}\n"),
    bad('rejected 만 막기(대기 중도 공개됨)', "export function publish(post: { status: string }) {\n  if (post.status === 'rejected') throw new Error('NOT_APPROVED');\n  post.status = 'published';\n}\n"),
  ] },
  { id: 'q-paid-delete', area: '다른 상태', req: '결제가 끝난 주문은 삭제할 수 없다', keywords: 'delete, paid', test: '결제가 끝난 주문의 삭제는 거부한다', file: 'src/order.ts', variants: [
    ok('paid 막기', "export function deleteOrder(order: { status: string }) {\n  if (order.status === 'paid') throw new Error('PAID');\n  return orders.remove(order);\n}\n"),
    bad('refunded 만 막기(결제된 주문도 지워짐)', "export function deleteOrder(order: { status: string }) {\n  if (order.status === 'refunded') throw new Error('PAID');\n  return orders.remove(order);\n}\n"),
  ] },
  { id: 'q-review-mail', area: '알림 날짜', req: 'Send a review request email 7 days after delivery', keywords: 'review, email', test: 'sends the review request 7 days after delivery', file: 'src/review-mail.ts', variants: [
    ok('7일째', 'export function shouldAskForReview(daysSinceDelivery: number) {\n  return daysSinceDelivery === 7;\n}\n'),
    bad('3일째', 'export function shouldAskForReview(daysSinceDelivery: number) {\n  return daysSinceDelivery === 3;\n}\n'),
  ] },
  { id: 'q-booking-sms', area: '알림 날짜', req: '예약 24시간 전에 안내 문자를 보낸다', keywords: 'booking, sms', test: '예약 24시간 전에 안내 문자를 보낸다', file: 'src/booking-sms.ts', variants: [
    ok('24시간 전', 'export function shouldSendReminder(hoursLeft: number) {\n  return hoursLeft === 24;\n}\n'),
    bad('12시간 전', 'export function shouldSendReminder(hoursLeft: number) {\n  return hoursLeft === 12;\n}\n'),
  ] },
  { id: 'q-vote-twice', area: '두 번 ~할 수 없다', req: '같은 투표에 두 번 투표할 수 없다', keywords: 'vote, poll', test: '같은 투표에 두 번째 투표는 거부한다', file: 'src/poll.ts', variants: [
    ok('includes 로 막기', "export function vote(poll: { voters: string[] }, userId: string) {\n  if (poll.voters.includes(userId)) throw new Error('ALREADY_VOTED');\n  poll.voters.push(userId);\n}\n"),
    unk('검사 없음', 'export function vote(poll: { voters: string[] }, userId: string) {\n  poll.voters.push(userId);\n}\n'),
  ] },
  { id: 'q-giftcard-once', area: '한 번 쓰는 코드', req: 'A gift card code can be redeemed only once', keywords: 'gift, redeem', test: 'redeeming the same gift card twice is rejected', file: 'src/giftcard.ts', variants: [
    ok('redeemedAt 확인', "export function redeem(card: { redeemedAt: Date | null } | null) {\n  if (!card) throw new Error('NOT_FOUND');\n  if (card.redeemedAt) throw new Error('ALREADY_REDEEMED');\n  card.redeemedAt = new Date();\n}\n"),
    unk('없는 카드만 막기', "export function redeem(card: { redeemedAt: Date | null } | null) {\n  if (!card) throw new Error('NOT_FOUND');\n  card.redeemedAt = new Date();\n}\n"),
  ] },
  { id: 'q-cancel-deadline', area: '마감(알림 아님)', req: '모임 시작 2시간 전까지만 참가를 취소할 수 있다', keywords: 'cancel, start', test: '시작 2시간 전이 지나면 취소를 거부한다', file: 'src/meetup.ts', variants: [
    ok('2시간', "const HOUR = 60 * 60 * 1000;\nexport function cancelJoin(meetup: { startsAt: number }, now: number) {\n  if (meetup.startsAt - now < 2 * HOUR) throw new Error('TOO_LATE');\n  return 'canceled';\n}\n"),
    bad('1시간', "const HOUR = 60 * 60 * 1000;\nexport function cancelJoin(meetup: { startsAt: number }, now: number) {\n  if (meetup.startsAt - now < 1 * HOUR) throw new Error('TOO_LATE');\n  return 'canceled';\n}\n"),
  ] },
  { id: 'q-verify-expire', area: '유효 기간(보낸 뒤)', req: 'Email verification links expire 24 hours after they are sent', keywords: 'verification, expire', test: 'a verification link older than 24 hours is expired', file: 'src/verify-link.ts', variants: [
    ok('24시간', 'const HOUR = 60 * 60 * 1000;\nexport function isExpired(sentAt: number, now: number) {\n  return now - sentAt > 24 * HOUR;\n}\n'),
    bad('48시간', 'const HOUR = 60 * 60 * 1000;\nexport function isExpired(sentAt: number, now: number) {\n  return now - sentAt > 48 * HOUR;\n}\n'),
  ] },
  { id: 'q-billing-admin', area: '다른 역할', req: 'Only admins can change billing settings', keywords: 'billing, admin', test: 'a non-admin cannot change billing settings', file: 'src/billing.ts', variants: [
    ok('admin 이 아니면 막기', "export function updateBilling(user: { role: string }, settings: object) {\n  if (user.role !== 'admin') throw new Error('FORBIDDEN');\n  return billing.save(settings);\n}\n"),
    bad('guest 만 막기(일반 회원도 바꿈)', "export function updateBilling(user: { role: string }, settings: object) {\n  if (user.role === 'guest') throw new Error('FORBIDDEN');\n  return billing.save(settings);\n}\n"),
  ] },
  { id: 'q-banned-word', area: '키워드 일부', req: 'Comments containing a banned word are rejected', keywords: 'comment, banned', test: 'rejects a comment with a blocked word', file: 'src/comment.ts', variants: [
    ok('금지어 검사', "const BANNED = ['spam', 'scam'];\nexport function addComment(text: string) {\n  if (BANNED.some((w) => text.includes(w))) throw new Error('BANNED_WORD');\n  return comments.add(text);\n}\n", TITLE),
    unk('검사 없음 · 제목에만 금지어 검사', 'export function addComment(text: string) {\n  return comments.add(text);\n}\n', TITLE),
  ] },
];

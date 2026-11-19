// 열네 번째 묶음: 설정값 이름 규칙까지 고친 뒤 처음 썼다. 0.11.0 과 고친 판을 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT13: Case[] = [
  { id: 'z-gift-wrap-fee', area: '금액', req: '선물 포장비는 2,000원이다', keywords: 'gift, wrap, fee', test: 'gift wrap fee is 2000', variants: [
    ok('상수', "export const GIFT_WRAP_FEE = 2000;\nexport const wrapFee = () => GIFT_WRAP_FEE;\n"),
    bad('다른 값', "export const GIFT_WRAP_FEE = 2500;\nexport const wrapFee = () => GIFT_WRAP_FEE;\n"),
  ] },
  { id: 'z-late-fee-trap', area: '함정', req: 'The late fee is 5,000 won', keywords: 'late, fee', test: 'late fee is 5000', variants: [
    unk('다른 대상의 5000', "export const CANCEL_FEE = 5000;\n"),
  ] },
  { id: 'z-small-orders', area: '금액', req: '5천 원보다 적은 주문은 받지 않는다', keywords: 'order, total', test: 'an order of 4999 is rejected', variants: [
    ok('<', "export function placeOrder(total: number) {\n  if (total < 5000) throw new Error('MIN');\n}\n"),
    bad('<=', "export function placeOrder(total: number) {\n  if (total <= 5000) throw new Error('MIN');\n}\n"),
  ] },
  { id: 'z-heartbeat', area: '시간', req: 'A heartbeat is sent every 10 seconds', keywords: 'heartbeat, send', test: 'heartbeat is sent every 10 seconds', variants: [
    ok('setInterval', "export function startHeartbeat(send: () => void) {\n  return setInterval(send, 10_000);\n}\n"),
    bad('15초', "export function startHeartbeat(send: () => void) {\n  return setInterval(send, 15_000);\n}\n"),
  ] },
  { id: 'z-like-once', area: '중복', req: 'A user can like a post only once', keywords: 'like, liked', test: 'liking the same post twice is rejected', variants: [
    ok('막기', "export function like(post: { likedBy: Set<string> }, userId: string) {\n  if (post.likedBy.has(userId)) throw new Error('ALREADY_LIKED');\n  post.likedBy.add(userId);\n}\n"),
    unk('검사 없음', "export function like(post: { likedBy: Set<string> }, userId: string) {\n  post.likedBy.add(userId);\n}\n"),
  ] },
  { id: 'z-token-15m', area: '시간 차이', req: '접근 토큰은 15분 뒤 만료된다', keywords: 'token, expired', test: 'access token expires after 15 minutes', variants: [
    ok('Date.now', "export const tokenExpired = (issuedAt: number) => Date.now() - issuedAt > 15 * 60 * 1000;\n"),
    bad('30분', "export const tokenExpired = (issuedAt: number) => Date.now() - issuedAt > 30 * 60 * 1000;\n"),
  ] },
  { id: 'z-commission', area: '비율', req: 'Sellers pay a 12% commission', keywords: 'commission, rate', test: 'commission is 12%', variants: [
    ok('0.12', "export const COMMISSION_RATE = 0.12;\nexport const commission = (sale: number) => sale * COMMISSION_RATE;\n"),
    bad('0.15', "export const COMMISSION_RATE = 0.15;\nexport const commission = (sale: number) => sale * COMMISSION_RATE;\n"),
  ] },
  { id: 'z-no-seats', area: '0이면', req: 'Booking is refused when there are 0 seats left', keywords: 'seats, booking', test: 'booking with 0 seats left is refused', variants: [
    ok('<= 0', "export function book(seatsLeft: number) {\n  if (seatsLeft <= 0) throw new Error('FULL');\n}\n"),
    bad('< 0', "export function book(seatsLeft: number) {\n  if (seatsLeft < 0) throw new Error('FULL');\n}\n"),
  ] },
];

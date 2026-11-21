// 서른세 번째 묶음: 한국어 키워드, 고친 뒤 처음 쓴 사례(11/21 밤). 다른 업무 영역. 이 묶음의 첫 결과가 점수다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '다름', extra });

export const HOLDOUT32: Case[] = [
  { id: 'm-booking-cancel', area: '한국어 키워드 · 마감', req: '예약은 시작 24시간 전까지만 취소할 수 있다', keywords: '예약, 취소', test: '시작 24시간 전이 지나면 예약 취소를 거부한다', file: 'src/booking.ts', variants: [
    ok('24시간', "export function cancelBooking(booking: { startsAt: number }, now: number) {\n  const hoursLeft = (booking.startsAt - now) / 3600000;\n  if (hoursLeft < 24) throw new Error('TOO_LATE');\n  return 'canceled';\n}\n"),
    bad('12시간', "export function cancelBooking(booking: { startsAt: number }, now: number) {\n  const hoursLeft = (booking.startsAt - now) / 3600000;\n  if (hoursLeft < 12) throw new Error('TOO_LATE');\n  return 'canceled';\n}\n"),
  ] },
  { id: 'm-rating', area: '한국어 키워드 · 범위', req: '리뷰 평점은 5점 이하여야 한다', keywords: '리뷰, 평점', test: '5점을 넘는 리뷰 평점은 거부한다', file: 'src/review.ts', variants: [
    ok('5점', "export function addReview(review: { rating: number; text: string }) {\n  if (review.rating > 5) throw new Error('BAD_RATING');\n  return reviews.add(review);\n}\n"),
    bad('10점', "export function addReview(review: { rating: number; text: string }) {\n  if (review.rating > 10) throw new Error('BAD_RATING');\n  return reviews.add(review);\n}\n"),
  ] },
  { id: 'm-nickname', area: '한국어 키워드 · 글자 수', req: '닉네임은 12자를 넘을 수 없다', keywords: '닉네임, 길이', test: '12자를 넘는 닉네임은 거부한다', file: 'src/profile.ts', variants: [
    ok('12자', "export function setNickname(user: { nickname: string }, nickname: string) {\n  if (nickname.length > 12) throw new Error('TOO_LONG');\n  user.nickname = nickname;\n}\n"),
    bad('20자', "export function setNickname(user: { nickname: string }, nickname: string) {\n  if (nickname.length > 20) throw new Error('TOO_LONG');\n  user.nickname = nickname;\n}\n"),
  ] },
  { id: 'm-refund', area: '한국어 키워드 · 기간', req: '환불은 구매 후 7일 이내에만 할 수 있다', keywords: '환불, 구매', test: '구매 후 7일이 지나면 환불을 거부한다', file: 'src/refund.ts', variants: [
    ok('7일', "const DAY = 24 * 60 * 60 * 1000;\nexport function refund(order: { paidAt: number }, now: number) {\n  if (now - order.paidAt > 7 * DAY) throw new Error('TOO_LATE');\n  return payments.refund(order);\n}\n"),
    bad('14일', "const DAY = 24 * 60 * 60 * 1000;\nexport function refund(order: { paidAt: number }, now: number) {\n  if (now - order.paidAt > 14 * DAY) throw new Error('TOO_LATE');\n  return payments.refund(order);\n}\n"),
  ] },
  { id: 'm-chat-room', area: '한국어 키워드 · 인원', req: '채팅방에는 최대 100명까지 들어갈 수 있다', keywords: '채팅방, 인원', test: '채팅방에 101번째 사람은 들어갈 수 없다', file: 'src/chat.ts', variants: [
    ok('100명', "export function join(room: { members: string[] }, userId: string) {\n  if (room.members.length >= 100) throw new Error('ROOM_FULL');\n  room.members.push(userId);\n}\n"),
    bad('200명', "export function join(room: { members: string[] }, userId: string) {\n  if (room.members.length >= 200) throw new Error('ROOM_FULL');\n  room.members.push(userId);\n}\n"),
  ] },
];

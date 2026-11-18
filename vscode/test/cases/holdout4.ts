// 다섯 번째 묶음: 키워드를 적지 않는 사용을 보려고 쓴 사례. 요구사항 문장과 평범한 코드 · 검사 이름만 있다.
// 판단을 못 내리는 것(미확인)은 안전하지만 쓸모가 적고, 틀린 코드를 「확인됨」이라 하면 안 된다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });

export const HOLDOUT4: Case[] = [
  { id: 'k-seats', area: '개수', req: '좌석은 한 사람당 4개까지 예약할 수 있다', keywords: 'seats', test: 'reserves up to 4 seats', variants: [
    ok('>', "export function reserve(seats: string[]) {\n  if (seats.length > 4) throw new Error('too many');\n}\n"),
    bad('>=', "export function reserve(seats: string[]) {\n  if (seats.length >= 4) throw new Error('too many');\n}\n"),
  ] },
  { id: 'k-comment', area: '길이', req: '댓글은 500자 이하여야 한다', keywords: 'comment', test: 'comment of 500 characters is accepted', variants: [
    ok('>', "export function addComment(comment: string) {\n  if (comment.length > 500) throw new Error('long');\n}\n"),
    bad('>=', "export function addComment(comment: string) {\n  if (comment.length >= 500) throw new Error('long');\n}\n"),
  ] },
  { id: 'k-title', area: '길이', req: 'Titles are limited to 80 characters', keywords: 'title', test: 'title of 80 characters is accepted', variants: [
    ok('>', "export const check = (title: string) => {\n  if (title.length > 80) throw new Error('long');\n};\n"),
    bad('>=', "export const check = (title: string) => {\n  if (title.length >= 80) throw new Error('long');\n};\n"),
  ] },
  { id: 'k-attendees', area: '개수', req: 'A meeting can have at most 12 attendees', keywords: 'attendees', test: 'meeting accepts 12 attendees', variants: [
    ok('>=', "export function invite(attendees: string[], who: string) {\n  if (attendees.length >= 12) throw new Error('full');\n  attendees.push(who);\n}\n"),
    bad('>', "export function invite(attendees: string[], who: string) {\n  if (attendees.length > 12) throw new Error('full');\n  attendees.push(who);\n}\n"),
  ] },
  { id: 'k-delivery', area: '금액', req: '3만 원 이상 주문하면 배달비가 무료다', keywords: 'order, delivery', test: 'delivery is free for an order of 30000', variants: [
    ok('>=', "export const deliveryFee = (orderTotal: number) => (orderTotal >= 30000 ? 0 : 3000);\n"),
    bad('>', "export const deliveryFee = (orderTotal: number) => (orderTotal > 30000 ? 0 : 3000);\n"),
  ] },
  { id: 'k-senior', area: '나이', req: '65세 이상은 경로 할인을 받는다', keywords: 'age, discount', test: 'discount from age 65', variants: [
    ok('>=', "export const seniorDiscount = (age: number) => (age >= 65 ? 0.3 : 0);\n"),
    bad('>', "export const seniorDiscount = (age: number) => (age > 65 ? 0.3 : 0);\n"),
  ] },
  { id: 'k-token', area: '시간', req: 'Refresh tokens expire after 30 days', keywords: 'token, expire', test: 'refresh token expires after 30 days', variants: [
    ok('ms', "const DAY = 86400000;\nexport const expired = (tokenAgeMs: number) => tokenAgeMs > 30 * DAY;\n"),
    bad('다른 값', "const DAY = 86400000;\nexport const expired = (tokenAgeMs: number) => tokenAgeMs > 90 * DAY;\n"),
  ] },
  { id: 'k-retry', area: '횟수', req: 'Failed emails are retried at most 3 times', keywords: 'email, retries', test: 'email is retried 3 times', variants: [
    ok('for', "export async function send(email: () => Promise<void>) {\n  for (let retries = 0; retries < 3; retries++) {\n    try { return await email(); } catch {}\n  }\n}\n"),
    bad('for <=', "export async function send(email: () => Promise<void>) {\n  for (let retries = 0; retries <= 3; retries++) {\n    try { return await email(); } catch {}\n  }\n}\n"),
  ] },
  { id: 'k-image', area: '크기', req: '프로필 사진은 5MB 이하만 올릴 수 있다', keywords: 'photo, size', test: 'profile photo of 5MB can be uploaded', variants: [
    ok('>', "export function uploadPhoto(photo: { size: number }) {\n  if (photo.size > 5 * 1024 * 1024) throw new Error('large');\n}\n"),
    bad('>=', "export function uploadPhoto(photo: { size: number }) {\n  if (photo.size >= 5 * 1024 * 1024) throw new Error('large');\n}\n"),
  ] },
  { id: 'k-members', area: '개수', req: '그룹 인원은 최소 2명이다', keywords: 'group, members', test: 'group needs 2 members', variants: [
    ok('<', "export function create(members: string[]) {\n  if (members.length < 2) throw new Error('group');\n}\n"),
    bad('<=', "export function create(members: string[]) {\n  if (members.length <= 2) throw new Error('group');\n}\n"),
  ] },
];

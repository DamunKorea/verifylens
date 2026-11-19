// 열 번째 묶음: 0.10.0 을 고치기 전에 썼다. 알려진 약점(이름 없는 시간 차이 · 「N분에 M번」)과 여러 업무 규칙을 섞었다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

const H = 'const HOUR = 60 * 60 * 1000;\n';
const M = 'const MINUTE = 60 * 1000;\n';
const D = 'const DAY = 24 * 60 * 60 * 1000;\n';

export const HOLDOUT9: Case[] = [
  { id: 'v-link-24h', area: '시간 차이', req: '인증 링크는 24시간 뒤 만료된다', keywords: 'link, expired', test: 'verification link expires after 24 hours', variants: [
    ok('Date.now', "export const linkExpired = (sentAt: number) => Date.now() - sentAt > 24 * 60 * 60 * 1000;\n"),
    bad('12시간', "export const linkExpired = (sentAt: number) => Date.now() - sentAt > 12 * 60 * 60 * 1000;\n"),
  ] },
  { id: 'v-trial-days', area: '시간 차이', req: 'The trial ends 14 days after signup', keywords: 'trial, days', test: 'trial ends 14 days after signup', variants: [
    ok('나누기', D + "export const trialOver = (signedUpAt: number, now: number) => (now - signedUpAt) / DAY >= 14;\n"),
    bad('7일', D + "export const trialOver = (signedUpAt: number, now: number) => (now - signedUpAt) / DAY >= 7;\n"),
  ] },
  { id: 'v-idle-30m', area: '시간 차이', req: 'Sessions expire after 30 minutes of inactivity', keywords: 'session, idle', test: 'session expires after 30 minutes idle', variants: [
    ok('상수', M + "export const sessionExpired = (lastSeen: number, now: number) => now - lastSeen > 30 * MINUTE;\n"),
    bad('60분', M + "export const sessionExpired = (lastSeen: number, now: number) => now - lastSeen > 60 * MINUTE;\n"),
  ] },
  { id: 'v-book-ahead', area: '시간 차이', req: '예약은 시작 1시간 전까지만 할 수 있다', keywords: 'booking, start', test: 'booking less than an hour before the start is rejected', variants: [
    ok('막기', H + "export function book(startsAt: number, now: number) {\n  if (startsAt - now < HOUR) throw new Error('TOO_LATE');\n}\n"),
    bad('30분', H + "export function book(startsAt: number, now: number) {\n  if (startsAt - now < HOUR / 2) throw new Error('TOO_LATE');\n}\n"),
  ] },
  { id: 'v-login-rate', area: '시간 창', req: '같은 계정은 1분에 최대 5번까지 로그인을 시도할 수 있다', keywords: 'attempts, login', test: 'a sixth login attempt within a minute is rejected', variants: [
    ok('창 안에서 세기', "const WINDOW_MS = 60 * 1000;\nexport function tryLogin(attempts: number[], now: number) {\n  const recent = attempts.filter((t) => now - t < WINDOW_MS);\n  if (recent.length >= 5) throw new Error('RATE_LIMIT');\n  attempts.push(now);\n}\n"),
    bad('창 안에서 > 5', "const WINDOW_MS = 60 * 1000;\nexport function tryLogin(attempts: number[], now: number) {\n  const recent = attempts.filter((t) => now - t < WINDOW_MS);\n  if (recent.length > 5) throw new Error('RATE_LIMIT');\n  attempts.push(now);\n}\n"),
  ] },
  { id: 'v-suspended', area: '막기', req: 'A suspended user cannot post comments', keywords: 'suspended, comment', test: 'a suspended user cannot post a comment', variants: [
    ok('막기', "export function postComment(user: { suspended: boolean }, text: string) {\n  if (user.suspended) throw new Error('SUSPENDED');\n  return comments.add(text);\n}\n"),
    unk('검사 없음', "export function postComment(user: { suspended: boolean }, text: string) {\n  return comments.add(text);\n}\n"),
  ] },
  { id: 'v-owner-delete', area: '권한', req: 'Only the owner can delete a project', keywords: 'owner, delete', test: 'a non-owner cannot delete a project', variants: [
    ok('막기', "export function deleteProject(project: { ownerId: string }, userId: string) {\n  if (project.ownerId !== userId) throw new Error('FORBIDDEN');\n  return projects.remove(project);\n}\n"),
    unk('검사 없음', "export function deleteProject(project: { ownerId: string }, userId: string) {\n  return projects.remove(project);\n}\n"),
  ] },
  { id: 'v-refund-approval', area: '금액', req: '10만 원을 넘는 환불은 관리자 승인이 필요하다', keywords: 'refund, amount', test: 'a refund of 100001 needs manager approval', variants: [
    ok('>', "export function refund(amount: number, approvedByManager: boolean) {\n  if (amount > 100000 && !approvedByManager) throw new Error('APPROVAL_REQUIRED');\n}\n"),
    bad('>=', "export function refund(amount: number, approvedByManager: boolean) {\n  if (amount >= 100000 && !approvedByManager) throw new Error('APPROVAL_REQUIRED');\n}\n"),
  ] },
  { id: 'v-stock-zero', area: '개수', req: 'An order cannot be placed when the stock is 0', keywords: 'stock, order', test: 'an order with no stock is rejected', variants: [
    ok('<=', "export function placeOrder(stock: number) {\n  if (stock <= 0) throw new Error('OUT_OF_STOCK');\n}\n"),
    bad('<', "export function placeOrder(stock: number) {\n  if (stock < 0) throw new Error('OUT_OF_STOCK');\n}\n"),
  ] },
  { id: 'v-discount-cap', area: '비율', req: '쿠폰 할인율은 최대 50%다', keywords: 'discount, rate', test: 'discount rate is capped at 50%', variants: [
    ok('Math.min', "export const discountRate = (rate: number) => Math.min(rate, 0.5);\n"),
    bad('70%', "export const discountRate = (rate: number) => Math.min(rate, 0.7);\n"),
  ] },
  { id: 'v-trap-number', area: '함정', req: '게시글 제목은 최대 50자다', keywords: 'title', test: 'title of 50 characters is accepted', variants: [
    unk('다른 대상', "export function savePost(tags: string[]) {\n  if (tags.length > 50) throw new Error('TAGS');\n}\n"),
  ] },
];

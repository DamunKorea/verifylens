// 일곱 번째 묶음: 규칙을 다 고친 뒤 처음 쓴 사례. 고치기 전 판(0.7.0)과 고친 판을 이 묶음으로 나란히 잰다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT6: Case[] = [
  { id: 'p-title', area: '길이', req: '게시글 제목은 100자를 넘을 수 없다', keywords: 'title', test: 'post title over 100 chars is rejected', variants: [
    ok('>', "export function save(title: string) {\n  if (title.length > 100) throw new Error('title');\n}\n"),
    bad('>=', "export function save(title: string) {\n  if (title.length >= 100) throw new Error('title');\n}\n"),
  ] },
  { id: 'p-attach', area: '개수', req: '첨부파일은 한 번에 3개까지 보낼 수 있다', keywords: 'attachments', test: 'sends up to 3 attachments', variants: [
    ok('>', "export function send(attachments: string[]) {\n  if (attachments.length > 3) throw new Error('attachments');\n}\n"),
    bad('>=', "export function send(attachments: string[]) {\n  if (attachments.length >= 3) throw new Error('attachments');\n}\n"),
  ] },
  { id: 'p-points', area: '금액', req: '포인트는 1000점부터 사용할 수 있다', keywords: 'points', test: 'points usable from 1000', variants: [
    ok('<', "export function use(points: number) {\n  if (points < 1000) throw new Error('points');\n}\n"),
    bad('<=', "export function use(points: number) {\n  if (points <= 1000) throw new Error('points');\n}\n"),
  ] },
  { id: 'p-fee', area: '금액', req: '배송비는 2만 원 미만 주문에만 붙는다', keywords: 'total, fee', test: 'shipping fee applies under 20000', variants: [
    ok('<', "export const shippingFee = (total: number) => (total < 20000 ? 2500 : 0);\n"),
    bad('<=', "export const shippingFee = (total: number) => (total <= 20000 ? 2500 : 0);\n"),
  ] },
  { id: 'p-invite', area: '시간', req: '초대 링크는 48시간 뒤 만료된다', keywords: 'invite, expired', test: 'invite link expires after 48 hours', variants: [
    ok('ms', "export const inviteExpired = (ageMs: number) => ageMs > 48 * 60 * 60 * 1000;\n"),
    bad('24시간', "export const inviteExpired = (ageMs: number) => ageMs > 24 * 60 * 60 * 1000;\n"),
  ] },
  { id: 'p-rotate', area: '기간', req: '비밀번호는 90일마다 바꿔야 한다', keywords: 'password, days', test: 'password must change every 90 days', variants: [
    ok('>=', "export const mustChangePassword = (daysSinceChange: number) => daysSinceChange >= 90;\n"),
    bad('30일', "export const mustChangePassword = (daysSinceChange: number) => daysSinceChange >= 30;\n"),
  ] },
  { id: 'p-search', area: '길이', req: '검색어는 2글자 이상이어야 한다', keywords: 'query', test: 'search query needs 2 characters', variants: [
    ok('<', "export function search(query: string) {\n  if (query.length < 2) throw new Error('short');\n}\n"),
    bad('<=', "export function search(query: string) {\n  if (query.length <= 2) throw new Error('short');\n}\n"),
  ] },
  { id: 'p-stock', area: '개수', req: '재고가 5개 이하이면 품절 임박으로 표시한다', keywords: 'stock', test: 'low stock at 5 or fewer', variants: [
    ok('<=', "export const lowStock = (stock: number) => stock <= 5;\n"),
    bad('<', "export const lowStock = (stock: number) => stock < 5;\n"),
  ] },
  { id: 'p-username', area: '길이', req: 'Usernames are at least 4 characters long', keywords: 'username', test: 'username needs 4 characters', variants: [
    ok('>=', "export const valid = (username: string) => username.length >= 4;\n"),
    bad('>', "export const valid = (username: string) => username.length > 4;\n"),
  ] },
  { id: 'p-invoice', area: '기간', req: 'Invoices are due within 30 days', keywords: 'invoice, days', test: 'invoice due in 30 days', variants: [
    ok('<=', "export const invoiceOnTime = (days: number) => days <= 30;\n"),
    bad('<', "export const invoiceOnTime = (days: number) => days < 30;\n"),
  ] },
  { id: 'p-lobby', area: '개수', req: 'No more than 8 players can join a lobby', keywords: 'players', test: 'lobby holds 8 players', variants: [
    ok('넣기 전', "export function join(players: string[], who: string) {\n  if (players.length >= 8) throw new Error('full');\n  players.push(who);\n}\n"),
    bad('넣기 전 >', "export function join(players: string[], who: string) {\n  if (players.length > 8) throw new Error('full');\n  players.push(who);\n}\n"),
  ] },
  { id: 'p-apikey', area: '기간', req: 'API keys rotate every 90 days', keywords: 'key, rotation', test: 'api key rotated after 90 days', variants: [
    ok('상수', "export const KEY_ROTATION_DAYS = 90;\n"),
    bad('다른 값', "export const KEY_ROTATION_DAYS = 180;\n"),
  ] },
  { id: 'p-message', area: '길이', req: 'Messages longer than 2000 characters are rejected', keywords: 'message', test: 'rejects message over 2000 characters', variants: [
    ok('>', "export function post(message: string) {\n  if (message.length > 2000) throw new Error('long');\n}\n"),
    bad('>=', "export function post(message: string) {\n  if (message.length >= 2000) throw new Error('long');\n}\n"),
  ] },
  { id: 'p-upload', area: '크기', req: 'Uploads larger than 25 MB are refused', keywords: 'upload, size', test: 'refuses uploads over 25MB', variants: [
    ok('>', "export function upload(file: { size: number }) {\n  if (file.size > 25 * 1024 * 1024) throw new Error('large');\n}\n"),
    bad('>=', "export function upload(file: { size: number }) {\n  if (file.size >= 25 * 1024 * 1024) throw new Error('large');\n}\n"),
  ] },
  { id: 'p-sms', area: '횟수', req: '인증 문자는 하루 최대 5회까지 보낼 수 있다', keywords: 'sms, sent', test: 'sms is limited to 5 per day', variants: [
    ok('보내기 전', "export function sendSms(sentToday: string[], to: string) {\n  if (sentToday.length >= 5) throw new Error('limit');\n  sentToday.push(to);\n}\n"),
    bad('보내기 전 >', "export function sendSms(sentToday: string[], to: string) {\n  if (sentToday.length > 5) throw new Error('limit');\n  sentToday.push(to);\n}\n"),
  ] },
  { id: 'p-refund-value', area: '기간', req: '환불은 14일 이내만 가능하다', keywords: 'refund, days', test: 'refund within 14 days', variants: [
    bad('값이 다름', "export const canRefund = (days: number) => days <= 30;\n"),
  ] },
  // 함정: 숫자는 같지만 다른 대상
  { id: 'p-trap-bio', area: '함정', req: 'Bio is limited to 160 characters', keywords: 'bio', test: 'profile name limited to 160', variants: [
    unk('다른 대상', "export function save(name: string) {\n  if (name.length > 160) throw new Error('name');\n}\n"),
  ] },
  { id: 'p-trap-room', area: '함정', req: '회의실은 최대 10명까지 들어간다', keywords: 'room', test: 'retry up to 10 times', variants: [
    unk('다른 대상', "export function run(retries: number) {\n  if (retries > 10) throw new Error('retries');\n}\n"),
  ] },
];

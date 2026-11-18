// 세 번째 묶음: 앞의 두 묶음을 다 고친 뒤에 새로 쓴 사례. 처음 돌린 점수가 지금 실력에 가장 가깝다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT2: Case[] = [
  { id: 'n-room', area: '개수', req: '채팅방에는 10명까지 들어올 수 있다', keywords: 'room, members', test: 'room members are limited to 10', variants: [
    ok('넣기 전', "export function join(room: { members: string[] }, id: string) {\n  if (room.members.length === 10) throw new Error('full');\n  room.members.push(id);\n}\n"),
    bad('넣기 전 11', "export function join(room: { members: string[] }, id: string) {\n  if (room.members.length === 11) throw new Error('full');\n  room.members.push(id);\n}\n"),
    ok('Set 크기', "export function join(room: { members: Set<string> }, id: string) {\n  if (room.members.size >= 10) throw new Error('full');\n  room.members.add(id);\n}\n"),
  ] },
  { id: 'n-review', area: '개수', req: 'A pull request needs at least 2 approvals', keywords: 'approvals, merge', test: 'merge needs 2 approvals', variants: [
    ok('filter 길이', "export const canMerge = (reviews: { ok: boolean }[]) => {\n  const approvals = reviews.filter((r) => r.ok).length;\n  return approvals >= 2;\n};\n"),
    bad('filter 길이 >', "export const canMerge = (reviews: { ok: boolean }[]) => {\n  const approvals = reviews.filter((r) => r.ok).length;\n  return approvals > 2;\n};\n"),
  ] },
  { id: 'n-keys', area: '개수', req: '태그는 최대 5개까지 붙일 수 있다', keywords: 'tags', test: 'tags are limited to 5', variants: [
    ok('Object.keys', "export function check(tags: Record<string, string>) {\n  if (Object.keys(tags).length > 5) throw new Error('tags');\n}\n"),
    bad('Object.keys >=', "export function check(tags: Record<string, string>) {\n  if (Object.keys(tags).length >= 5) throw new Error('tags');\n}\n"),
  ] },
  { id: 'n-destructure', area: '설정값', req: '한 번에 최대 20건까지 조회한다', keywords: 'limit, query', test: 'query limit is 20', variants: [
    ok('구조 분해 기본값', "export function query({ limit = 20 }: { limit?: number }) {\n  return limit;\n}\n"),
    bad('구조 분해 기본값 다름', "export function query({ limit = 50 }: { limit?: number }) {\n  return limit;\n}\n"),
  ] },
  { id: 'n-assert', area: '길이', req: '상품명은 최소 2자 이상이어야 한다', keywords: 'productName, length', test: 'product name length is at least 2', variants: [
    ok('assert', "import assert from 'node:assert';\nexport function save(productName: string) {\n  assert(productName.length >= 2);\n}\n"),
    bad('assert >', "import assert from 'node:assert';\nexport function save(productName: string) {\n  assert(productName.length > 2);\n}\n"),
  ] },
  { id: 'n-date-diff', area: '시간', req: '가입 후 30일이 넘으면 체험이 끝난다', keywords: 'trial, days', test: 'trial ends after 30 days', variants: [
    ok('date-fns', "import { differenceInDays } from 'date-fns';\nexport const trialEnded = (start: Date) => differenceInDays(new Date(), start) > 30; // days\n"),
    bad('date-fns 다른 값', "import { differenceInDays } from 'date-fns';\nexport const trialEnded = (start: Date) => differenceInDays(new Date(), start) > 14; // days\n"),
    bad('date-fns >=', "import { differenceInDays } from 'date-fns';\nexport const trialEnded = (start: Date) => differenceInDays(new Date(), start) >= 30; // days\n"),
  ] },
  { id: 'n-getTime', area: '시간', req: 'The reset link expires after 1 hour', keywords: 'reset, expired', test: 'reset link is expired after 1 hour', variants: [
    ok('getTime', "const HOUR = 60 * 60 * 1000;\nexport const expired = (resetAt: Date) => Date.now() - resetAt.getTime() > HOUR;\n"),
    bad('getTime 값', "const HOUR = 60 * 60 * 1000;\nexport const expired = (resetAt: Date) => Date.now() - resetAt.getTime() > 24 * HOUR;\n"),
  ] },
  { id: 'n-size-gb', area: '크기', req: '동영상은 1GB 이하만 올릴 수 있다', keywords: 'video, size', test: 'video size is at most 1GB', variants: [
    ok('상수 계산', "const GB = 1024 ** 3;\nexport function upload(video: { size: number }) {\n  if (video.size > GB) throw new Error('video');\n}\n"),
    bad('2GB', "export function upload(video: { size: number }) {\n  if (video.size > 2 * 1024 * 1024 * 1024) throw new Error('video');\n}\n"),
  ] },
  { id: 'n-min-order', area: '금액', req: '최소 주문 금액은 10,000원이다', keywords: 'order, amount', test: 'order amount is at least 10000', variants: [
    ok('막는 조건', "export function order(amount: number) {\n  if (amount < 10_000) throw new Error('order');\n}\n"),
    bad('막는 조건 <=', "export function order(amount: number) {\n  if (amount <= 10_000) throw new Error('order');\n}\n"),
  ] },
  { id: 'n-fewer', area: '말투', req: 'Accounts with fewer than 3 posts cannot comment', keywords: 'posts, comment', test: 'comment needs 3 posts', variants: [
    ok('<', "export function comment(posts: number) {\n  if (posts < 3) throw new Error('comment');\n}\n"),
    bad('<=', "export function comment(posts: number) {\n  if (posts <= 3) throw new Error('comment');\n}\n"),
  ] },
  { id: 'n-minimum-of', area: '말투', req: 'Passwords need a minimum of 12 characters', keywords: 'password, length', test: 'password length is at least 12', variants: [
    ok('상수', "const MIN_PASSWORD_LENGTH = 12;\nexport const valid = (password: string) => password.length >= MIN_PASSWORD_LENGTH;\n"),
    bad('상수 값', "const MIN_PASSWORD_LENGTH = 10;\nexport const valid = (password: string) => password.length >= MIN_PASSWORD_LENGTH;\n"),
  ] },
  { id: 'n-over-18', area: '말투', req: 'You must be over 18 to enter', keywords: 'age, enter', test: 'enter needs age over 18', variants: [
    ok('>', "export const canEnter = (age: number) => age > 18;\n"),
    bad('>=', "export const canEnter = (age: number) => age >= 18;\n"),
  ] },
  { id: 'n-enum', area: '상수', req: '작업은 최대 4개까지 동시에 실행한다', keywords: 'jobs, running', test: 'running jobs are at most 4', variants: [
    ok('enum', "enum Limits { Jobs = 4 }\nexport function start(running: string[], job: string) {\n  if (running.length >= Limits.Jobs) return false;\n  running.push(job);\n  return true;\n}\n"),
    bad('enum 값', "enum Limits { Jobs = 8 }\nexport function start(running: string[], job: string) {\n  if (running.length >= Limits.Jobs) return false;\n  running.push(job);\n  return true;\n}\n"),
  ] },
  { id: 'n-config-file', area: '상수', req: '업로드는 하루 5회까지다', keywords: 'upload, daily', test: 'daily upload is limited to 5', variants: [
    unk('외부 설정', "import config from './config.json';\nexport function upload(dailyUploads: string[]) {\n  if (dailyUploads.length >= config.dailyMax) throw new Error('upload');\n}\n"),
    bad('길이 값이 다름', "export function upload(dailyUploads: string[]) {\n  if (dailyUploads.length > 50) throw new Error('upload');\n}\n"),
  ] },
];

// 스물여섯 번째 묶음: 스물다섯 번째 묶음으로 고친 뒤(데코레이터 숫자 · twice · 서수 검사 · 변수에 담은 개수 · 한 번 하는 검사) 처음 썼다.
// 0.16.0 과 고친 코드로 한 번씩만 잰다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const BIO_DTO = { 'src/bio.dto.ts': "import { MaxLength } from 'class-validator';\nexport class BioDto {\n  @MaxLength(12)\n  headline!: string;\n}\n" };
const PAGE5 = { 'src/page.ts': 'export const firstFive = (rows: string[]) => rows.slice(0, 5);\n' };
const RETRY3 = { 'src/retry.ts': 'export async function withRetry(fn: () => Promise<void>) {\n  for (let i = 0; i < 3; i++) {\n    try { return await fn(); } catch { /* again */ }\n  }\n}\n' };
const CART = { 'src/cart.ts': 'export function addToCart(items: string[], id: string) {\n  if (items.includes(id)) return items;\n  return [...items, id];\n}\n' };

export const HOLDOUT25: Case[] = [
  // 데코레이터의 숫자
  { id: 'z-dto-title', area: '데코레이터 길이', req: '게시글 제목은 2자 이상 50자 이하다', keywords: 'title, dto', test: 'rejects a title shorter than 2 or longer than 50 characters', file: 'src/post.dto.ts', variants: [
    ok('@Length(2, 50)', "import { IsString, Length } from 'class-validator';\nexport class PostDto {\n  @IsString()\n  @Length(2, 50)\n  title!: string;\n}\n", BIO_DTO),
    bad('@Length(2, 100)', "import { IsString, Length } from 'class-validator';\nexport class PostDto {\n  @IsString()\n  @Length(2, 100)\n  title!: string;\n}\n", BIO_DTO),
  ] },
  { id: 'z-dto-quantity', area: '데코레이터 범위', req: '주문 수량은 1개 이상 99개 이하다', keywords: 'quantity, order', test: 'rejects an order quantity outside 1 to 99', file: 'src/order.dto.ts', variants: [
    ok('@Min(1) @Max(99)', "import { IsInt, Max, Min } from 'class-validator';\nexport class OrderDto {\n  @IsInt()\n  @Min(1)\n  @Max(99)\n  quantity!: number;\n}\n", PAGE5),
    bad('@Min(1) @Max(100)', "import { IsInt, Max, Min } from 'class-validator';\nexport class OrderDto {\n  @IsInt()\n  @Min(1)\n  @Max(100)\n  quantity!: number;\n}\n", PAGE5),
  ] },
  // twice · 범위 낱말(per order)
  { id: 'z-refund-twice', area: '횟수 낱말', req: 'A customer can request a refund at most twice per order', keywords: 'refund, order', test: 'a third refund request for the same order is rejected', file: 'src/refund.ts', variants: [
    ok('>= 2 막기', "export function requestRefund(order: { refunds: string[] }, reason: string) {\n  if (order.refunds.length >= 2) throw new Error('REFUND_LIMIT');\n  order.refunds.push(reason);\n}\n", RETRY3),
    bad('> 2 막기(세 번까지 됨)', "export function requestRefund(order: { refunds: string[] }, reason: string) {\n  if (order.refunds.length > 2) throw new Error('REFUND_LIMIT');\n  order.refunds.push(reason);\n}\n", RETRY3),
  ] },
  // 기간에 N번
  { id: 'z-monthly-coupon', area: '시간 창', req: '쿠폰은 한 달에 두 번까지만 받을 수 있다', keywords: 'coupon, claim', test: '한 달에 세 번째 쿠폰은 받을 수 없다', file: 'src/claim.ts', variants: [
    ok('이번 달만 셈', "export function claimCoupon(claims: Date[], now: Date) {\n  const thisMonth = claims.filter((c) => c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear());\n  if (thisMonth.length >= 2) throw new Error('MONTHLY_LIMIT');\n  claims.push(now);\n}\n", PAGE5),
    unk('시간 창 없음 · 전부 셈', "export function claimCoupon(claims: Date[], now: Date) {\n  if (claims.length >= 2) throw new Error('MONTHLY_LIMIT');\n  claims.push(now);\n}\n", PAGE5),
  ] },
  { id: 'z-hourly-upload', area: '시간 창', req: 'Each user can upload at most 5 files per hour', keywords: 'upload, file', test: 'the 6th upload within an hour is rejected', file: 'src/upload.ts', variants: [
    ok('최근 한 시간 DB 개수', "import { subHours } from 'date-fns';\nexport async function upload(prisma: any, userId: string, name: string) {\n  const recent = await prisma.upload.count({ where: { userId, createdAt: { gte: subHours(new Date(), 1) } } });\n  if (recent >= 5) throw new Error('RATE_LIMIT');\n  return prisma.upload.create({ data: { userId, name } });\n}\n", PAGE5),
    unk('전체 DB 개수', "export async function upload(prisma: any, userId: string, name: string) {\n  const total = await prisma.upload.count({ where: { userId } });\n  if (total >= 5) throw new Error('RATE_LIMIT');\n  return prisma.upload.create({ data: { userId, name } });\n}\n", PAGE5),
  ] },
  { id: 'z-daily-report', area: '시간 창', req: 'Users can submit at most 3 reports per day', keywords: 'report, submit', test: 'rejects the 4th report submitted on the same day', file: 'src/report.ts', variants: [
    ok('같은 날만 셈', "import { isSameDay } from 'date-fns';\nexport function submitReport(reports: { at: Date }[], now: Date) {\n  const today = reports.filter((r) => isSameDay(r.at, now));\n  if (today.length >= 3) throw new Error('DAILY_LIMIT');\n  reports.push({ at: now });\n}\n", RETRY3),
    unk('시간 창 없음 · 전부 셈', "export function submitReport(reports: { at: Date }[], now: Date) {\n  if (reports.length >= 3) throw new Error('DAILY_LIMIT');\n  reports.push({ at: now });\n}\n", RETRY3),
  ] },
  // 한도를 시험하지 않는 검사
  { id: 'z-team-happy', area: '테스트가 한도를 안 봄', req: 'A team can have at most 10 members', keywords: 'team, member', test: 'adds a member to the team', file: 'src/team.ts', variants: [
    unk('>= 10 막기 · 넣는 검사뿐', "export function addMember(team: { members: string[] }, userId: string) {\n  if (team.members.length >= 10) throw new Error('TEAM_FULL');\n  team.members.push(userId);\n}\n", PAGE5),
    bad('> 10 막기(11명까지 됨)', "export function addMember(team: { members: string[] }, userId: string) {\n  if (team.members.length > 10) throw new Error('TEAM_FULL');\n  team.members.push(userId);\n}\n", PAGE5),
  ] },
  // between 의 끝값
  { id: 'z-group-size', area: '범위 끝값', req: 'Group size must be between 2 and 8', keywords: 'group, size', test: 'rejects a group size outside 2 to 8', file: 'src/group.ts', variants: [
    ok('2 ~ 8', "export function createGroup(size: number) {\n  if (size < 2 || size > 8) throw new Error('INVALID_SIZE');\n  return { size };\n}\n", PAGE5),
    bad('2 ~ 10', "export function createGroup(size: number) {\n  if (size < 2 || size > 10) throw new Error('INVALID_SIZE');\n  return { size };\n}\n", PAGE5),
  ] },
  // 중복 막기(다시 담아도 하나)
  { id: 'z-wishlist-again', area: '중복 막기', req: '같은 상품은 위시리스트에 한 번만 담긴다', keywords: 'wishlist, product', test: '같은 상품을 다시 담아도 하나만 남는다', file: 'src/wishlist.ts', variants: [
    ok('includes 로 막기', 'export function addToWishlist(list: string[], productId: string) {\n  if (list.includes(productId)) return list;\n  return [...list, productId];\n}\n', CART),
    unk('검사 없음 · 장바구니에만 includes', 'export function addToWishlist(list: string[], productId: string) {\n  return [...list, productId];\n}\n', CART),
  ] },
  // DB 개수를 변수에 담고 만들기 전에 막기
  { id: 'z-workspace-count', area: '변수에 담은 개수', req: 'Each user can create at most 3 workspaces', keywords: 'workspace, create', test: 'creating a fourth workspace fails', file: 'src/workspace.ts', variants: [
    ok('>= 3 막기', "export async function createWorkspace(db: any, userId: string, name: string) {\n  const owned = await db.workspace.count({ where: { ownerId: userId } });\n  if (owned >= 3) throw new Error('WORKSPACE_LIMIT');\n  return db.workspace.create({ data: { ownerId: userId, name } });\n}\n", PAGE5),
    bad('> 3 막기(네 개까지 됨)', "export async function createWorkspace(db: any, userId: string, name: string) {\n  const owned = await db.workspace.count({ where: { ownerId: userId } });\n  if (owned > 3) throw new Error('WORKSPACE_LIMIT');\n  return db.workspace.create({ data: { ownerId: userId, name } });\n}\n", PAGE5),
  ] },
];

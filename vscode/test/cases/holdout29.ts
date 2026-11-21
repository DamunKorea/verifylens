// 서른 번째 묶음: 아직 다루지 않은 업무 영역(상태 바꾸기 · 쪽 나누기 · 한 번 쓰는 링크 · 보관 기간 · 반올림 · 권한 · 예약 겹침 · 방해 금지 시간 · 만료 알림 · 파일 형식).
// 0.17.0 공개 뒤, 고치기 전에 먼저 썼다. 우리가 쓴 사례다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

const AVATAR = { 'src/avatar.ts': "export function uploadAvatar(file: { type: string }) {\n  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('BAD_TYPE');\n  return avatars.put(file);\n}\n" };
const PAGE = { 'src/search.ts': 'export function search(q: string, limit: number) {\n  return index.find(q).slice(0, Math.min(limit, 20));\n}\n' };

export const HOLDOUT29: Case[] = [
  { id: 't-cancel-shipped', area: '상태 바꾸기', req: '배송이 시작된 주문은 취소할 수 없다', keywords: 'cancel, shipped', test: '배송이 시작된 주문의 취소는 거부한다', file: 'src/order.ts', variants: [
    ok('shipped · delivered 막기', "export function cancelOrder(order: { status: string }) {\n  if (order.status === 'shipped' || order.status === 'delivered') throw new Error('ALREADY_SHIPPED');\n  order.status = 'canceled';\n}\n"),
    bad('delivered 만 막기(배송 중엔 취소됨)', "export function cancelOrder(order: { status: string }) {\n  if (order.status === 'delivered') throw new Error('ALREADY_SHIPPED');\n  order.status = 'canceled';\n}\n"),
  ] },
  { id: 't-page-size', area: '쪽 나누기', req: '목록은 한 페이지에 최대 50개까지 보여 준다', keywords: 'list, limit', test: '한 페이지에 50개를 넘게 보여 주지 않는다', file: 'src/list.ts', variants: [
    ok('Math.min(limit, 50)', 'export function listPosts(limit: number) {\n  return db.post.findMany({ take: Math.min(limit, 50) });\n}\n', PAGE),
    bad('Math.min(limit, 100)', 'export function listPosts(limit: number) {\n  return db.post.findMany({ take: Math.min(limit, 100) });\n}\n', PAGE),
  ] },
  { id: 't-reset-once', area: '한 번 쓰는 링크', req: 'A password reset link can be used only once', keywords: 'reset, token', test: 'using the same reset link twice is rejected', file: 'src/reset.ts', variants: [
    ok('usedAt 확인', "export async function resetPassword(db: any, token: string, pw: string) {\n  const t = await db.resetToken.findUnique({ where: { token } });\n  if (!t || t.usedAt) throw new Error('INVALID_TOKEN');\n  await db.resetToken.update({ where: { token }, data: { usedAt: new Date() } });\n  return db.user.update({ where: { id: t.userId }, data: { pw } });\n}\n"),
    unk('usedAt 확인 없음', "export async function resetPassword(db: any, token: string, pw: string) {\n  const t = await db.resetToken.findUnique({ where: { token } });\n  if (!t) throw new Error('INVALID_TOKEN');\n  return db.user.update({ where: { id: t.userId }, data: { pw } });\n}\n"),
  ] },
  { id: 't-erase-30', area: '보관 기간', req: 'Deleted accounts are erased 30 days after deletion', keywords: 'erase, deleted', test: 'erases an account deleted more than 30 days ago', file: 'src/retention.ts', variants: [
    ok('30일', 'const DAY = 24 * 60 * 60 * 1000;\nexport function shouldErase(acc: { deletedAt: number }, now: number) {\n  return now - acc.deletedAt >= 30 * DAY;\n}\n'),
    bad('90일', 'const DAY = 24 * 60 * 60 * 1000;\nexport function shouldErase(acc: { deletedAt: number }, now: number) {\n  return now - acc.deletedAt >= 90 * DAY;\n}\n'),
  ] },
  { id: 't-points-floor', area: '반올림', req: '포인트는 결제 금액의 1%이고 소수점 아래는 버린다', keywords: 'points, total', test: '포인트는 1%에서 소수점 아래를 버린다', file: 'src/points.ts', variants: [
    ok('Math.floor', 'export const earnPoints = (total: number) => Math.floor(total * 0.01);\n'),
    bad('Math.round(올림도 됨)', 'export const earnPoints = (total: number) => Math.round(total * 0.01);\n'),
  ] },
  { id: 't-owner-delete', area: '권한', req: 'Only the owner can delete a project', keywords: 'owner, delete', test: 'a non-owner cannot delete a project', file: 'src/project.ts', variants: [
    ok('owner 가 아니면 막기', "export function deleteProject(member: { role: string }, id: string) {\n  if (member.role !== 'owner') throw new Error('FORBIDDEN');\n  return projects.remove(id);\n}\n"),
    bad('viewer 만 막기(editor 도 지움)', "export function deleteProject(member: { role: string }, id: string) {\n  if (member.role === 'viewer') throw new Error('FORBIDDEN');\n  return projects.remove(id);\n}\n"),
  ] },
  { id: 't-room-overlap', area: '예약 겹침', req: '같은 회의실은 겹치는 시간에 두 번 예약할 수 없다', keywords: 'room, booking', test: '겹치는 시간의 두 번째 예약은 거부한다', file: 'src/booking.ts', variants: [
    ok('겹치면 막기', "export function book(bookings: { start: number; end: number }[], start: number, end: number) {\n  if (bookings.some((b) => b.start < end && start < b.end)) throw new Error('OVERLAP');\n  bookings.push({ start, end });\n}\n"),
    unk('검사 없음', 'export function book(bookings: { start: number; end: number }[], start: number, end: number) {\n  bookings.push({ start, end });\n}\n'),
  ] },
  { id: 't-quiet-hours', area: '방해 금지 시간', req: '밤 10시부터 아침 8시 전까지는 알림을 보내지 않는다', keywords: 'notify, hour', test: '밤 10시에는 알림을 보내지 않는다', file: 'src/notify.ts', variants: [
    ok('hour >= 22 || hour < 8', 'export function shouldNotify(hour: number) {\n  if (hour >= 22 || hour < 8) return false;\n  return true;\n}\n'),
    bad('hour > 22 (10시대엔 보냄)', 'export function shouldNotify(hour: number) {\n  if (hour > 22 || hour < 8) return false;\n  return true;\n}\n'),
  ] },
  { id: 't-trial-reminder', area: '만료 알림', req: 'Trial users get a reminder 3 days before the trial ends', keywords: 'trial, reminder', test: 'sends a reminder 3 days before the trial ends', file: 'src/trial.ts', variants: [
    ok('daysLeft === 3', 'export function needsReminder(daysLeft: number) {\n  return daysLeft === 3;\n}\n'),
    bad('daysLeft === 1', 'export function needsReminder(daysLeft: number) {\n  return daysLeft === 1;\n}\n'),
  ] },
  { id: 't-image-type', area: '파일 형식', req: 'Only PNG and JPEG images can be uploaded to a gallery', keywords: 'gallery, type', test: 'rejects a gallery upload that is not png or jpeg', file: 'src/gallery.ts', variants: [
    ok('형식 검사', "export function uploadToGallery(file: { type: string }) {\n  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('BAD_TYPE');\n  return gallery.put(file);\n}\n", AVATAR),
    unk('검사 없음 · 아바타에만 형식 검사', 'export function uploadToGallery(file: { type: string }) {\n  return gallery.put(file);\n}\n', AVATAR),
  ] },
];

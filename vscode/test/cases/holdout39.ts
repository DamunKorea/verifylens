// 마흔 번째 묶음: 맞는 코드가 「미확인」으로 남는 것을 고친 뒤 처음 쓴 사례(11/23). 이 묶음의 첫 결과가 점수다.
// 앞 묶음과 다른 업무 · 모양: 403 · 409, 목록에서 숨기기, 보내기 · 기록하기(부르지 않는 것 포함), 정렬 · 소문자, 비활성 시간 · 용량 · 길이,
// 한국어 문장(탈퇴 · 24시간 안 취소), 기본값, 다른 파일의 관리자 검사, 「누가 바꿨는지」처럼 기록은 하지만 빠진 것이 있는 코드.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const MEMBER = (guard: string) => `type Workspace = { id: string; members: string[]; docs: string[] };

export function listDocs(workspace: Workspace, userId: string, res: any) {
${guard}  return res.json(workspace.docs);
}
`;
const USERNAME = (guard: string) => `type Repo = { exists(name: string): Promise<boolean>; create(name: string): Promise<{ id: string }> };

export async function createUser(body: { username: string }, repo: Repo, reply: any) {
${guard}  const user = await repo.create(body.username);
  return reply.code(201).send(user);
}
`;
const PROJECTS = (body: string) => `type Project = { id: string; name: string; archived: boolean };

export function projectList(projects: Project[]) {
${body}}
`;
const RESET_MAIL = (send: string) => `type Mail = { send(to: string, template: string, data: object): Promise<void> };

export async function requestPasswordReset(user: { id: string; email: string }, mail: Mail, makeToken: () => string) {
  const token = makeToken();
${send}  return token;
}
`;
const FAILED_LOGIN = (record: string) => `type SecurityLog = { write(entry: object): void };

export function onLoginFailed(account: { id: string; failures: number }, ip: string, securityLog: SecurityLog) {
  account.failures += 1;
${record}}
`;
const SEARCH = `export type Hit = { id: string; score: number };

export function rankResults(hits: Hit[]) {
  return [...hits].sort((a, b) => b.score - a.score);
}
`;
const USERNAME_CASE = `export function saveUsername(user: { username: string }, input: { username: string }) {
  user.username = input.username.trim().toLowerCase();
  return user;
}
`;
const SESSION = (minutes: number) => `type Session = { id: string; lastSeenAt: number };

export function activeSession(session: Session, now: number) {
  if (now - session.lastSeenAt > ${minutes} * 60_000) return null;
  return session;
}
`;
const UPLOAD = (mb: number) => `export function acceptUpload(file: { name: string; size: number }) {
  if (file.size > ${mb} * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  return file.name;
}
`;
const COUPON = (max: number) => `export function isValidCouponCode(code: string) {
  if (code.length > ${max}) return false;
  return /^[A-Z0-9]+$/.test(code);
}
`;
const WITHDRAWN = (guard: string) => `type Member = { id: string; withdrawnAt: Date | null; passwordHash: string };

export function login(member: Member, ok: boolean) {
${guard}  if (!ok) throw new Error('BAD_PASSWORD');
  return { memberId: member.id };
}
`;
const CANCEL = (hours: number) => `const HOUR = 60 * 60 * 1000;

export function cancelOrder(order: { paidAt: number; status: string }, now: number) {
  if (now - order.paidAt > ${hours} * HOUR) throw new Error('TOO_LATE_TO_CANCEL');
  order.status = 'cancelled';
}
`;
const NEW_PROJECT = `export function newProject(input: { name: string; visibility?: 'public' | 'private' }) {
  return { name: input.name, visibility: input.visibility ?? 'private', createdAt: Date.now() };
}
`;
const DELETE_WS = (call: string) => `import { assertAdmin, type User } from './auth';

export async function deleteWorkspace(user: User, id: string, remove: (id: string) => Promise<void>) {
${call}  await remove(id);
}
`;
const AUTH = `export type User = { id: string; role: 'admin' | 'member' };
export class ForbiddenError extends Error {}

export function assertAdmin(user: User) {
  if (user.role !== 'admin') throw new ForbiddenError('ADMIN_ONLY');
}
`;
const DEACTIVATE = (days: number) => `const DAY = 24 * 60 * 60 * 1000;

export function deactivateDormant(accounts: { lastLoginAt: number; active: boolean }[], now: number) {
  for (const a of accounts) {
    if (now - a.lastLoginAt >= ${days} * DAY) a.active = false;
  }
}
`;
const SETTING = (entry: string) => `type Audit = { write(entry: object): void };

export function changeSetting(settings: Record<string, string>, key: string, value: string, user: { id: string }, audit: Audit) {
  settings[key] = value;
  audit.write(${entry});
}
`;

export const HOLDOUT39: Case[] = [
  { id: 'd1-403', area: '403 · 멤버만', req: 'Return 403 when the user is not a member of the workspace', keywords: 'member, workspace, 403', test: 'returns 403 for a user who is not a member', file: 'src/docs.ts', variants: [
    ok('멤버 검사', MEMBER("  if (!workspace.members.includes(userId)) return res.status(403).json({ error: 'NOT_A_MEMBER' });\n")),
    unk('검사 없음', MEMBER('')),
  ] },
  { id: 'd2-409', area: '409 · 이미 있는 이름', req: 'Respond with 409 when the username is already taken', keywords: 'username, taken, 409', test: 'responds with 409 when the username is taken', file: 'src/users.ts', variants: [
    ok('있으면 409', USERNAME("  if (await repo.exists(body.username)) return reply.code(409).send({ error: 'USERNAME_TAKEN' });\n")),
    unk('검사 없음', USERNAME('')),
  ] },
  { id: 'd3-archived', area: '목록에서 숨기기', req: 'Archived projects are hidden from the project list', keywords: 'archived, project, list', test: 'does not list archived projects', file: 'src/projectList.ts', variants: [
    ok('걸러 냄', PROJECTS('  return projects.filter((p) => !p.archived);\n')),
    unk('거르지 않음', PROJECTS('  return projects;\n')),
  ] },
  { id: 'd4-reset-mail', area: '메일 보내기', req: 'A password reset email is sent when the user asks for a reset', keywords: 'reset, email, send', test: 'sends a password reset email', file: 'src/reset.ts', variants: [
    ok('보냄', RESET_MAIL("  await mail.send(user.email, 'password-reset', { token });\n")),
    unk('토큰만 만듦', RESET_MAIL('')),
  ] },
  { id: 'd5-security-log', area: '기록하기', req: 'Every failed login is recorded in the security log', keywords: 'failed, login, security, log', test: 'records a failed login in the security log', file: 'src/security.ts', variants: [
    ok('기록함', FAILED_LOGIN("  securityLog.write({ type: 'LOGIN_FAILED', accountId: account.id, ip });\n")),
    unk('세기만 함', FAILED_LOGIN('')),
  ] },
  { id: 'd6-relevance', area: '정렬', req: 'Search results are sorted by relevance, highest first', keywords: 'sort, score, results', test: 'sorts search results by relevance, highest first', file: 'src/search.ts', variants: [
    ok('높은 순', SEARCH),
  ] },
  { id: 'd7-lowercase', area: '소문자로 저장', req: 'Usernames are stored in lowercase', keywords: 'username, lowercase', test: 'stores the username in lowercase', file: 'src/username.ts', variants: [
    ok('toLowerCase', USERNAME_CASE),
  ] },
  { id: 'd8-session', area: '비활성 시간', req: 'Sessions expire after 30 minutes of inactivity', keywords: 'session, minutes, lastSeenAt', test: 'a session idle for more than 30 minutes is expired', file: 'src/session.ts', variants: [
    ok('30분', SESSION(30)),
    bad('60분', SESSION(60)),
  ] },
  { id: 'd9-upload', area: '용량', req: 'Uploads larger than 5 MB are rejected', keywords: 'upload, size', test: 'rejects an upload larger than 5 MB', file: 'src/upload.ts', variants: [
    ok('5MB', UPLOAD(5)),
    bad('10MB', UPLOAD(10)),
  ] },
  { id: 'd10-coupon', area: '길이 상한', req: 'A coupon code is at most 16 characters long', keywords: 'coupon, code, length', test: 'rejects a coupon code longer than 16 characters', file: 'src/coupon.ts', variants: [
    ok('16자', COUPON(16)),
    bad('20자', COUPON(20)),
  ] },
  { id: 'd11-withdrawn-ko', area: '한국어 · 탈퇴', req: '탈퇴한 회원은 로그인할 수 없다', keywords: 'withdrawn, login', test: '탈퇴한 회원은 로그인할 수 없다', file: 'src/login.ts', variants: [
    ok('탈퇴 검사', WITHDRAWN("  if (member.withdrawnAt) throw new Error('WITHDRAWN');\n")),
    unk('검사 없음', WITHDRAWN('')),
  ] },
  { id: 'd12-cancel-ko', area: '한국어 · 24시간 안', req: '주문 취소는 결제 후 24시간 안에만 할 수 있다', keywords: 'cancel, paidAt, hours', test: '결제 후 24시간이 지나면 취소할 수 없다', file: 'src/cancel.ts', variants: [
    ok('24시간', CANCEL(24)),
    bad('48시간', CANCEL(48)),
  ] },
  { id: 'd13-private', area: '기본값(??)', req: 'New projects are private by default', keywords: 'visibility, private', test: 'creates a private project when no visibility is given', file: 'src/newProject.ts', variants: [
    ok('private', NEW_PROJECT),
  ] },
  { id: 'd14-admin-file', area: '다른 파일의 관리자 검사', req: 'Only admins can delete a workspace', keywords: 'admin, delete, workspace', test: 'a member cannot delete a workspace', file: 'src/workspaces.ts', variants: [
    ok('assertAdmin 부름', DELETE_WS('  assertAdmin(user);\n'), { 'src/auth.ts': AUTH }),
    unk('부르지 않음', DELETE_WS(''), { 'src/auth.ts': AUTH }),
  ] },
  { id: 'd15-dormant', area: '오래 안 쓴 계정', req: 'Accounts with no login for 180 days are deactivated', keywords: 'login, days, active', test: 'deactivates an account after 180 days without login', file: 'src/dormant.ts', variants: [
    ok('180일', DEACTIVATE(180)),
    bad('90일', DEACTIVATE(90)),
  ] },
  { id: 'd16-changed-by', area: '기록은 하지만 빠진 것(어려움)', req: 'The audit log keeps the id of the user who changed a setting', keywords: 'audit, changedBy, setting', test: 'the audit entry has the id of the user who changed the setting', file: 'src/settings.ts', variants: [
    ok('changedBy 남김', SETTING('{ key, value, changedBy: user.id }')),
    unk('누가 바꿨는지 빠짐', SETTING('{ key, value }')),
  ] },
];

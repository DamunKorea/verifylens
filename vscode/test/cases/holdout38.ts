// 서른아홉 번째 묶음: 맞는 코드가 「미확인」으로 남는 것(11/23). 고치기 전에 썼다.
// 국내외 반응 정리(11/22)의 ④: 새 모양의 규칙에서는 맞는 코드도 절반이 미확인 (X Kai 「그 숫자를 보겠다」).
// 지금까지 묶음에 적던 모양 말고, PR 에 흔히 나오는 요구사항을 맞는 코드 위주로 쓴다. 틀린 코드도 섞어 헛경보 · 틀린 확인됨을 함께 본다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const PAGE = (size: number) => `export type Order = { id: string };

export function listOrders(orders: Order[], page = 1, pageSize = ${size}) {
  const start = (page - 1) * pageSize;
  return orders.slice(start, start + pageSize);
}
`;
const PASSWORD = (min: number) => `export function validatePassword(pw: string): string | null {
  if (pw.length < ${min}) return 'PASSWORD_TOO_SHORT';
  if (!/[0-9]/.test(pw)) return 'PASSWORD_NEEDS_DIGIT';
  return null;
}
`;
const COMMENT = (guard: string) => `export class ForbiddenError extends Error {}
type Comment = { id: string; authorId: string; text: string; editedAt?: Date };

export function editComment(comment: Comment, userId: string, text: string) {
${guard}  comment.text = text;
  comment.editedAt = new Date();
  return comment;
}
`;
const PROJECT = (guard: string) => `type Db = { project: { findUnique(q: { where: { id: string } }): Promise<{ id: string } | null> } };

export async function getProject(req: { params: { id: string } }, res: any, db: Db) {
  const project = await db.project.findUnique({ where: { id: req.params.id } });
${guard}  return res.json(project);
}
`;
const RESET = (hours: number) => `const TOKEN_TTL_MS = ${hours} * 60 * 60 * 1000;

export function isResetTokenValid(token: { createdAt: number }, now: number) {
  return now - token.createdAt < TOKEN_TTL_MS;
}
`;
const REGISTER = `export async function register(email: string, users: { findByEmail(e: string): Promise<unknown> }) {
  const normalized = email.trim().toLowerCase();
  if (await users.findByEmail(normalized)) throw new Error('EMAIL_TAKEN');
  return { email: normalized };
}
`;
const WEBHOOK = (max: number) => `export async function deliver(send: () => Promise<boolean>) {
  for (let attempt = 1; attempt <= ${max}; attempt++) {
    if (await send()) return true;
  }
  return false;
}
`;
const NOTIFY = `export type Notification = { id: string; createdAt: number };

export function listNotifications(items: Notification[]) {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}
`;
const PROFILE = `export function updateProfile(profile: { displayName: string }, input: { displayName: string }) {
  profile.displayName = input.displayName.trim();
  return profile;
}
`;
const SOFT_DELETE = `export type Document = { id: string; deletedAt: Date | null };

export function deleteDocument(doc: Document, now: Date) {
  doc.deletedAt = now;
  return doc;
}
`;
const ROLE = (audit: string) => `export function changeRole(user: { id: string; role: string }, role: string, audit: (e: object) => void) {
  const before = user.role;
  user.role = role;
${audit}}
`;
const SIGNUP = (mail: string) => `export async function signup(input: { email: string }, mailer: { send(to: string, template: string): Promise<void> }) {
  const user = { id: crypto.randomUUID(), email: input.email };
${mail}  return user;
}
`;
const RATE = (limit: number) => `const WINDOW_MS = 60_000;
const LIMIT = ${limit};

export function allowRequest(key: string, now: number, hits: Map<string, number[]>) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}
`;
const TRIAL = (days: number) => `const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndsAt(signedUpAt: number) {
  return signedUpAt + ${days} * DAY_MS;
}
`;
const CART = (cond: string) => `export function addToCart(cart: { items: string[] }, productId: string) {
  if (${cond}) throw new Error('CART_FULL');
  cart.items.push(productId);
}
`;
const NOTICE = (guard: string) => `export function postNotice(user: { role: 'admin' | 'member' }, text: string, save: (t: string) => void) {
${guard}  save(text);
}
`;
const PRICE = `export function formatPrice(amount: number, currency?: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency ?? 'USD' }).format(amount);
}
`;
const ARCHIVE = (days: number) => `const DAY = 86_400_000;

export function archiveStaleTickets(tickets: { lastActivityAt: number; archived: boolean }[], now: number) {
  for (const t of tickets) {
    if (now - t.lastActivityAt >= ${days} * DAY) t.archived = true;
  }
}
`;
const BUTTON = `export function SubmitButton({ saving, onSubmit }: { saving: boolean; onSubmit: () => void }) {
  return (
    <button type="submit" disabled={saving} onClick={onSubmit}>
      Save
    </button>
  );
}
`;
const UPLOAD = `const ALLOWED_TYPES = ['image/png', 'image/jpeg'];

export function checkUpload(file: { type: string; size: number }) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('UNSUPPORTED_TYPE');
  return true;
}
`;
const ORDER = (call: string) => `import { assertStoreOpen, type Store } from './store';

export function placeOrder(store: Store, items: string[]) {
${call}  return { items, placedAt: Date.now() };
}
`;
const STORE = `export type Store = { id: string; closed: boolean };

export function assertStoreOpen(store: Store) {
  if (store.closed) throw new Error('STORE_CLOSED');
}
`;
const PAY = (guard: string) => `export async function pay(req: { idempotencyKey: string; amount: number }, seen: Set<string>, charge: (a: number) => Promise<void>) {
${guard}  await charge(req.amount);
  return 'OK';
}
`;

export const HOLDOUT38: Case[] = [
  { id: 'c1-page', area: '맞는 코드 · 기본값(매개변수)', req: 'List endpoints return 20 items per page by default', keywords: 'page, size, default', test: 'returns 20 items per page by default', file: 'src/orders.ts', variants: [
    ok('기본 20', PAGE(20)),
    bad('기본 25', PAGE(25)),
  ] },
  { id: 'c2-password', area: '맞는 코드 · 길이', req: 'Passwords must be at least 12 characters', keywords: 'password, length', test: 'rejects passwords shorter than 12 characters', file: 'src/password.ts', variants: [
    ok('12자', PASSWORD(12)),
    bad('10자', PASSWORD(10)),
  ] },
  { id: 'c3-author', area: '맞는 코드 · 작성자만', req: 'Only the author can edit a comment', keywords: 'author, edit, comment', test: 'only the author can edit a comment', file: 'src/comments.ts', variants: [
    ok('작성자 검사', COMMENT("  if (comment.authorId !== userId) throw new ForbiddenError('NOT_AUTHOR');\n")),
    unk('검사 없음', COMMENT('')),
  ] },
  { id: 'c4-404', area: '맞는 코드 · 없으면 404', req: 'Return 404 when the project does not exist', keywords: 'project, not found, 404', test: 'returns 404 when the project does not exist', file: 'src/projects.ts', variants: [
    ok('404', PROJECT("  if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });\n")),
    unk('검사 없음', PROJECT('')),
  ] },
  { id: 'c5-reset', area: '맞는 코드 · 만료 시간(상수 곱)', req: 'Password reset tokens expire after 1 hour', keywords: 'reset, token, expire', test: 'rejects a reset token older than 1 hour', file: 'src/reset.ts', variants: [
    ok('1시간', RESET(1)),
    bad('2시간', RESET(2)),
  ] },
  { id: 'c6-email-case', area: '맞는 코드 · 대소문자 무시', req: 'Email addresses are unique regardless of letter case', keywords: 'email, unique, lowercase', test: 'rejects an email that differs only in letter case', file: 'src/register.ts', variants: [
    ok('소문자로 맞춤', REGISTER),
  ] },
  { id: 'c7-webhook', area: '맞는 코드 · 시도 횟수(for)', req: 'A webhook delivery is attempted at most 3 times', keywords: 'webhook, attempt', test: 'stops after 3 failed webhook attempts', file: 'src/webhooks.ts', variants: [
    ok('3번', WEBHOOK(3)),
    bad('5번', WEBHOOK(5)),
  ] },
  { id: 'c8-sort', area: '맞는 코드 · 정렬', req: 'Notifications are listed newest first', keywords: 'notifications, sort, createdAt', test: 'lists notifications newest first', file: 'src/notifications.ts', variants: [
    ok('최신 먼저', NOTIFY),
  ] },
  { id: 'c9-trim', area: '맞는 코드 · 다듬기', req: 'Display names are trimmed before they are saved', keywords: 'display name, trim', test: 'trims the display name before saving', file: 'src/profile.ts', variants: [
    ok('trim', PROFILE),
  ] },
  { id: 'c10-soft-delete', area: '맞는 코드 · 지운 표시', req: 'Deleting a document keeps it and marks it as deleted', keywords: 'delete, deletedAt', test: 'deleting a document sets deletedAt instead of removing it', file: 'src/documents.ts', variants: [
    ok('deletedAt', SOFT_DELETE),
  ] },
  { id: 'c11-audit', area: '맞는 코드 · 감사 기록', req: 'Every role change is written to the audit log', keywords: 'role, audit', test: 'writes an audit entry when a role changes', file: 'src/roles.ts', variants: [
    ok('기록함', ROLE("  audit({ type: 'ROLE_CHANGED', userId: user.id, before, after: role });\n")),
    unk('기록 안 함', ROLE('')),
  ] },
  { id: 'c12-welcome', area: '맞는 코드 · 메일 보내기', req: 'A welcome email is sent after signup', keywords: 'welcome, email, signup', test: 'sends a welcome email after signup', file: 'src/signup.ts', variants: [
    ok('보냄', SIGNUP("  await mailer.send(user.email, 'welcome');\n")),
    unk('안 보냄', SIGNUP('')),
  ] },
  { id: 'c13-rate', area: '맞는 코드 · 분당 요청 수', req: 'An API key can make at most 100 requests per minute', keywords: 'requests, minute, limit', test: 'blocks the 101st request within a minute', file: 'src/rateLimit.ts', variants: [
    ok('100', RATE(100)),
    bad('120', RATE(120)),
  ] },
  { id: 'c14-trial', area: '맞는 코드 · 기간 더하기', req: 'The free trial lasts 14 days', keywords: 'trial, days', test: 'the trial ends 14 days after signup', file: 'src/trial.ts', variants: [
    ok('14일', TRIAL(14)),
    bad('30일', TRIAL(30)),
  ] },
  { id: 'c15-cart-ko', area: '맞는 코드 · 한국어 최대 개수', req: '장바구니에는 상품을 최대 50개까지 담을 수 있다', keywords: 'cart, items', test: '장바구니에 51번째 상품은 담을 수 없다', file: 'src/cart.ts', variants: [
    ok('50개까지', CART('cart.items.length >= 50')),
    bad('51개까지', CART('cart.items.length > 50')),
  ] },
  { id: 'c16-notice-ko', area: '맞는 코드 · 한국어 관리자만', req: '관리자만 공지를 올릴 수 있다', keywords: 'admin, notice', test: '관리자가 아니면 공지를 올릴 수 없다', file: 'src/notices.ts', variants: [
    ok('관리자 검사', NOTICE("  if (user.role !== 'admin') throw new Error('FORBIDDEN');\n")),
    unk('검사 없음', NOTICE('')),
  ] },
  { id: 'c17-currency', area: '맞는 코드 · 기본 통화(??)', req: 'Prices are shown in USD when no currency is set', keywords: 'currency, USD', test: 'uses USD when no currency is set', file: 'src/price.ts', variants: [
    ok('USD', PRICE),
  ] },
  { id: 'c18-archive', area: '맞는 코드 · 오래된 것 보관', req: 'Tickets with no activity for 90 days are archived', keywords: 'archive, activity, days', test: 'archives a ticket after 90 days without activity', file: 'src/tickets.ts', variants: [
    ok('90일', ARCHIVE(90)),
    bad('60일', ARCHIVE(60)),
  ] },
  { id: 'c19-jsx', area: '맞는 코드 · JSX 속성', req: 'The submit button is disabled while the form is saving', keywords: 'submit, disabled, saving', test: 'disables the submit button while saving', file: 'src/SubmitButton.tsx', variants: [
    ok('disabled={saving}', BUTTON),
  ] },
  { id: 'c20-upload', area: '맞는 코드 · 허용 목록', req: 'Only PNG and JPEG images can be uploaded', keywords: 'upload, type, png, jpeg', test: 'rejects a GIF upload', file: 'src/upload.ts', variants: [
    ok('png · jpeg', UPLOAD),
  ] },
  { id: 'c21-other-file', area: '맞는 코드 · 다른 파일 도우미', req: 'An order cannot be placed while the store is closed', keywords: 'store, closed, order', test: 'cannot place an order while the store is closed', file: 'src/orders.ts', variants: [
    ok('도우미로 막기', ORDER('  assertStoreOpen(store);\n'), { 'src/store.ts': STORE }),
    unk('부르지 않음', ORDER(''), { 'src/store.ts': STORE }),
  ] },
  { id: 'c22-idempotent', area: '맞는 코드 · 같은 요청 한 번만', req: 'The same payment request is processed only once', keywords: 'payment, idempotency', test: 'processes the same payment request only once', file: 'src/pay.ts', variants: [
    ok('키로 막기', PAY("  if (seen.has(req.idempotencyKey)) return 'DUPLICATE';\n  seen.add(req.idempotencyKey);\n")),
    unk('막지 않음', PAY('')),
  ] },
];

// 서른다섯 번째 묶음: 근거 줄, 고친 뒤 처음 쓴 사례(11/22). 이 묶음의 첫 결과가 점수다.
// 서른네 번째 묶음과 다른 모양: return 으로 막기 · 상태 글자 비교 · 날짜 비교 · 한국어 요구사항 · 그리고 아직 못 읽을 것 같은 모양 둘
// (상태를 메서드로 정함 `account.lock()` · 상태 낱말이 오류 글에만 있음).
import type { Case } from './corpus.ts';
import type { EvVariant } from './holdout33.ts';

const ok = (name: string, code: string, ev: string): EvVariant => ({ name, code, expect: '확인됨', ev });
const unk = (name: string, code: string): EvVariant => ({ name, code, expect: '미확인' });

const MESSAGES = (guard: string) => `type User = { id: string; banned: boolean; reports: number };

export function sendMessage(user: User, to: string, text: string, outbox: { push(m: object): void }) {
${guard}  if (user.reports >= 3) {
    user.banned = true;
    notifyAdmins(user.id);
    return false;
  }
  outbox.push({ from: user.id, to, text });
  return true;
}

function notifyAdmins(id: string) {
  console.log('review', id);
}
`;
const TICKET = (guard: string) => `type Ticket = { status: 'open' | 'closed'; replies: string[] };

export function addReply(ticket: Ticket, text: string) {
${guard}  if (ticket.replies.length >= 500) {
    ticket.status = 'closed';
    throw new Error('TOO_MANY_REPLIES');
  }
  ticket.replies.push(text);
}
`;
const INVITE = (guard: string) => `type Invite = { expiresAt: number; expired: boolean; acceptedAt: number | null };

export function acceptInvite(invite: Invite, now: number) {
${guard}  if (invite.acceptedAt !== null) {
    invite.expired = true;
    throw new Error('ALREADY_ACCEPTED');
  }
  invite.acceptedAt = now;
}
`;
const POST = (guard: string) => `type Post = { text: string; deleted: boolean; deletedAt: number | null };

export function editPost(post: Post, text: string, now: number) {
${guard}  if (/spam|casino/i.test(text)) {
    post.deleted = true;
    post.deletedAt = now;
    throw new Error('REMOVED_BY_FILTER');
  }
  post.text = text;
}
`;
const ORDER_KO = (guard: string) => `type Customer = { active: boolean; unpaid: number };

export function placeOrder(customer: Customer, items: string[]) {
${guard}  if (customer.unpaid > 3) {
    customer.active = false;
    throw new Error('UNPAID_ORDERS');
  }
  return { items, status: 'placed' };
}
`;
// 아직 못 읽을 것 같은 모양 1: 상태를 메서드로 정한다 (값을 정하는 곳이 = 가 아니다)
const LOCK_METHOD = (guard: string) => `export class Account {
  locked = false;
  failures = 0;
  lock() { this.locked = true; }
}

export function login(account: Account, ok: boolean) {
${guard}  if (!ok) {
    account.failures += 1;
    if (account.failures >= 5) account.lock();
    throw new Error('BAD_LOGIN');
  }
  account.failures = 0;
  return 'session';
}
`;
// 아직 못 읽을 것 같은 모양 2: 상태 낱말이 오류 글에만 있다
const DOOR = (guard: string) => `type Door = { locked: boolean; open: boolean };

export function openDoor(door: Door, key: string | null) {
${guard}  if (!key) throw new Error('DOOR_LOCKED_NO_KEY');
  door.open = true;
  return true;
}
`;

export const HOLDOUT34: (Omit<Case, 'variants'> & { variants: EvVariant[] })[] = [
  { id: 'ev2-banned', area: '근거 줄 · 차단(return)', req: 'A banned user cannot send messages', keywords: 'banned, message', test: 'a banned user cannot send messages', file: 'src/messages.ts', variants: [
    ok('차단 검사 있음', MESSAGES('  if (user.banned) return false;\n'), 'user.banned'),
    unk('차단 검사 없음', MESSAGES('')),
  ] },
  { id: 'ev2-closed', area: '근거 줄 · 닫힘(글자 비교)', req: 'A closed ticket cannot receive new replies', keywords: 'closed, reply', test: 'a closed ticket cannot receive new replies', file: 'src/tickets.ts', variants: [
    ok('닫힘 검사 있음', TICKET("  if (ticket.status === 'closed') throw new Error('TICKET_CLOSED');\n"), "ticket.status === 'closed'"),
    unk('닫힘 검사 없음', TICKET('')),
  ] },
  { id: 'ev2-expired', area: '근거 줄 · 만료(날짜 비교)', req: 'An expired invite cannot be accepted', keywords: 'expired, accept', test: 'an expired invite cannot be accepted', file: 'src/invites.ts', variants: [
    ok('만료 검사 있음', INVITE("  if (invite.expiresAt < now) throw new Error('INVITE_EXPIRED');\n"), 'invite.expiresAt < now'),
    unk('만료 검사 없음', INVITE('')),
  ] },
  { id: 'ev2-deleted', area: '근거 줄 · 지움', req: 'A deleted post cannot be edited', keywords: 'deleted, edit', test: 'a deleted post cannot be edited', file: 'src/posts.ts', variants: [
    ok('지움 검사 있음', POST("  if (post.deleted) throw new Error('POST_DELETED');\n"), 'post.deleted'),
    unk('지움 검사 없음', POST('')),
  ] },
  { id: 'ev2-inactive-ko', area: '근거 줄 · 비활성(한국어)', req: '비활성 고객은 주문할 수 없다', keywords: 'active, order', test: '비활성 고객은 주문할 수 없다', file: 'src/orders.ts', variants: [
    ok('활성 검사 있음', ORDER_KO("  if (!customer.active) throw new Error('INACTIVE');\n"), 'customer.active'),
    unk('활성 검사 없음', ORDER_KO('')),
  ] },
  { id: 'ev2-lock-method', area: '근거 줄 · 메서드로 잠금(한계 예상)', req: 'A locked account cannot log in', keywords: 'locked, login', test: 'a locked account cannot log in', file: 'src/login.ts', variants: [
    ok('잠금 검사 있음', LOCK_METHOD("  if (account.locked) throw new Error('LOCKED');\n"), 'account.locked'),
    unk('잠금 검사 없음', LOCK_METHOD('')),
  ] },
  { id: 'ev2-door', area: '근거 줄 · 오류 글에만(한계 예상)', req: 'A locked door cannot be opened', keywords: 'locked, open', test: 'a locked door cannot be opened', file: 'src/doors.ts', variants: [
    ok('잠금 검사 있음', DOOR('  if (door.locked) return false;\n'), 'door.locked'),
    unk('잠금 검사 없음', DOOR('')),
  ] },
];

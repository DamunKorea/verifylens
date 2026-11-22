// 서른여덟 번째 묶음: 근거 줄의 남은 한계를 고친 뒤 처음 쓴 사례(11/22). 이 묶음의 첫 결과가 점수다.
// 앞 묶음과 다른 업무 · 모양: 메서드 · 열거형 · 상수로 정하기, 오류 글 · 돌려주는 글에만 있는 상태, 부르지 않는 도우미(함수 · 클래스 메서드 · 내보낸 함수),
// 「who are」 문장, enabled 로 보는 disabled, 글자로만 있는 상태, 삼항식, 배열에 넣어 부르는 도우미, 메서드로 정지하는 동작 요구사항.
import type { Case } from './corpus.ts';
import type { EvVariant } from './holdout33.ts';

const ok = (name: string, code: string, ev: string): EvVariant => ({ name, code, expect: '확인됨', ev });
const unk = (name: string, code: string): EvVariant => ({ name, code, expect: '미확인' });
const diff = (name: string, code: string): EvVariant => ({ name, code, expect: '다름' });

const TENANT = (guard: string) => `export class Tenant {
  suspended = false;
  creditLimit = 1000;
  suspend() { this.suspended = true; }
}

export function createInvoice(tenant: Tenant, amount: number, store: (amount: number) => void) {
${guard}  if (amount > tenant.creditLimit) {
    tenant.suspend();
    throw new Error('OVER_LIMIT');
  }
  store(amount);
}
`;
const TICKET = (guard: string) => `export enum TicketState { Open = 'open', Resolved = 'resolved' }
type Ticket = { state: TicketState; agentId: string; reopenCount: number };

export function reassign(ticket: Ticket, agentId: string) {
${guard}  if (ticket.reopenCount > 3) {
    ticket.state = TicketState.Resolved;
    return false;
  }
  ticket.agentId = agentId;
  return true;
}
`;
const CONTACT = (guard: string) => `const BLOCKED = 'blocked';
type Contact = { id: string; status: string; spamReports: number };

export function startCall(contact: Contact, dial: (id: string) => string) {
${guard}  if (contact.spamReports >= 10) {
    contact.status = BLOCKED;
    return null;
  }
  return dial(contact.id);
}
`;
const API_KEY = (guard: string) => `type ApiKey = { id: string; secret: string | null; disabled: boolean };

export function authenticate(key: ApiKey, given: string) {
  if (!key.secret) throw new Error('KEY_DISABLED_OR_MISSING');
${guard}  return key.secret === given;
}
`;
const API_KEY_ENABLED = (guard: string) => `type ApiKey = { id: string; secret: string; enabled: boolean };

export function authenticate(key: ApiKey, given: string) {
${guard}  return key.secret === given;
}
`;
const WITHDRAW = (guard: string) => `type Account = { id: string; balance: number; frozen: boolean };

export function withdraw(account: Account, amount: number) {
${guard}  if (amount > account.balance) return { ok: false, reason: 'insufficient funds or account frozen' };
  account.balance -= amount;
  return { ok: true };
}
`;
const PUBLISH = (call: string) => `type Seller = { id: string; verified: boolean };

function requireVerified(seller: Seller) {
  if (!seller.verified) throw new Error('SELLER_NOT_VERIFIED');
}

export function publishListing(seller: Seller, listing: { title: string }, save: (sellerId: string, title: string) => void) {
${call}  save(seller.id, listing.title);
}
`;
const STORE = (call: string) => `export class Store {
  closed = false;
  items: string[] = [];

  private ensureOpen() {
    if (this.closed) throw new Error('STORE_CLOSED');
  }

  addItem(item: string) {
${call}    this.items.push(item);
  }
}
`;
const EXPORTED_HELPER = (call: string) => `type Member = { id: string; active: boolean };

export function assertActive(member: Member) {
  if (!member.active) throw new Error('MEMBER_INACTIVE');
}

export function bookClass(member: Member, classId: string, book: (memberId: string, classId: string) => void) {
${call}  book(member.id, classId);
}
`;
const BILLING = (body: string) => `type Subscription = { id: string; status: 'active' | 'paused'; price: number };

export function billAmount(sub: Subscription) {
${body}}
`;
const LIKES = (body: string) => `type Post = { id: string; hidden: boolean; likes: number };

export function like(post: Post) {
${body}}
`;
const REDEEM = (guard: string) => `type Coupon = { code: string; active: boolean; uses: number };

export function redeem(coupon: Coupon) {
${guard}  coupon.uses += 1;
  return true;
}
`;
const DOC = (guard: string) => `type Doc = { id: string; locked: boolean; text: string };

export function isLocked(doc: Doc) {
  return doc.locked;
}

export function editDoc(doc: Doc, text: string) {
${guard}  doc.text = text;
}
`;
const VOTE = (guard: string) => `type User = { id: string; isBanned: boolean };
type Poll = { id: string; closed: boolean; votes: string[] };

export function vote(user: User, poll: Poll) {
${guard}  poll.votes.push(user.id);
  return true;
}
`;
const VIOLATIONS = (body: string) => `export class Seller {
  suspended = false;
  violations = 0;
  suspend() { this.suspended = true; }
}

export function recordViolation(seller: Seller) {
  seller.violations += 1;
${body}}
`;
const INVITE = (checks: string) => `type Invite = { id: string; expired: boolean; acceptedAt: number | null };

const ensureNotExpired = (invite: Invite) => {
  if (invite.expired) throw new Error('INVITE_EXPIRED');
};

export function acceptInvite(invite: Invite, now: number) {
${checks}  invite.acceptedAt = now;
}
`;

export const HOLDOUT37: (Omit<Case, 'variants'> & { variants: EvVariant[] })[] = [
  { id: 'ev5-tenant', area: '근거 줄 · 메서드로 정지', req: 'A suspended tenant cannot create invoices', keywords: 'suspended, invoice', test: 'a suspended tenant cannot create invoices', file: 'src/invoices.ts', variants: [
    ok('정지 검사 있음', TENANT("  if (tenant.suspended) throw new Error('TENANT_SUSPENDED');\n"), 'tenant.suspended'),
    unk('정지 검사 없음', TENANT('')),
  ] },
  { id: 'ev5-ticket', area: '근거 줄 · 열거형 값으로 정함', req: 'A resolved ticket cannot be reassigned', keywords: 'resolved, reassign', test: 'a resolved ticket cannot be reassigned', file: 'src/tickets.ts', variants: [
    ok('해결 검사 있음', TICKET('  if (ticket.state === TicketState.Resolved) return false;\n'), 'TicketState.Resolved'),
    unk('해결 검사 없음', TICKET('')),
  ] },
  { id: 'ev5-contact', area: '근거 줄 · 상수로 정함', req: 'A blocked contact cannot be called', keywords: 'blocked, call', test: 'a blocked contact cannot be called', file: 'src/calls.ts', variants: [
    ok('차단 검사 있음', CONTACT('  if (contact.status === BLOCKED) return null;\n'), 'contact.status === BLOCKED'),
    unk('차단 검사 없음', CONTACT('')),
  ] },
  { id: 'ev5-api-key', area: '근거 줄 · 오류 글에만', req: 'A disabled API key cannot be used', keywords: 'disabled, authenticate', test: 'a disabled API key cannot be used', file: 'src/keys.ts', variants: [
    ok('사용 중지 검사 있음', API_KEY("  if (key.disabled) throw new Error('KEY_DISABLED');\n"), 'key.disabled'),
    unk('사용 중지 검사 없음', API_KEY('')),
  ] },
  { id: 'ev5-api-key-enabled', area: '근거 줄 · enabled 로 보는 disabled', req: 'A disabled API key cannot be used', keywords: 'enabled, authenticate', test: 'a disabled API key cannot be used', file: 'src/keys.ts', variants: [
    ok('enabled 검사 있음', API_KEY_ENABLED("  if (!key.enabled) throw new Error('KEY_DISABLED');\n"), 'key.enabled'),
    unk('검사 없음', API_KEY_ENABLED('')),
  ] },
  { id: 'ev5-withdraw', area: '근거 줄 · 돌려주는 글에만', req: 'A frozen account cannot withdraw money', keywords: 'frozen, withdraw', test: 'a frozen account cannot withdraw money', file: 'src/withdraw.ts', variants: [
    ok('동결 검사 있음', WITHDRAW("  if (account.frozen) return { ok: false, reason: 'frozen' };\n"), 'account.frozen'),
    unk('동결 검사 없음', WITHDRAW('')),
  ] },
  { id: 'ev5-publish', area: '근거 줄 · 부르지 않는 도우미 함수', req: 'An unverified seller cannot publish listings', keywords: 'verified, publish', test: 'an unverified seller cannot publish listings', file: 'src/listings.ts', variants: [
    ok('도우미로 막기', PUBLISH('  requireVerified(seller);\n'), 'seller.verified'),
    unk('도우미를 부르지 않음', PUBLISH('')),
  ] },
  { id: 'ev5-store-method', area: '근거 줄 · 부르지 않는 클래스 메서드(한계 예상)', req: 'A closed store cannot add items', keywords: 'closed, item', test: 'a closed store cannot add items', file: 'src/store.ts', variants: [
    ok('메서드로 막기', STORE('    this.ensureOpen();\n'), 'this.closed'),
    unk('메서드를 부르지 않음', STORE('')),
  ] },
  { id: 'ev5-exported-helper', area: '근거 줄 · 내보냈지만 부르지 않는 도우미(한계 예상)', req: 'An inactive member cannot book classes', keywords: 'active, book', test: 'an inactive member cannot book classes', file: 'src/classes.ts', variants: [
    ok('도우미로 막기', EXPORTED_HELPER('  assertActive(member);\n'), 'member.active'),
    unk('도우미를 부르지 않음', EXPORTED_HELPER('')),
  ] },
  { id: 'ev5-billing', area: '근거 줄 · 글자로만 있는 상태(깨지면 안 됨)', req: 'A paused subscription cannot be billed', keywords: 'paused, bill', test: 'a paused subscription cannot be billed', file: 'src/billing.ts', variants: [
    ok('멈춤 검사 있음', BILLING("  if (sub.status === 'paused') return 0;\n  return sub.price;\n"), "sub.status === 'paused'"),
    unk('멈춤 검사 없음', BILLING('  return sub.price;\n')),
  ] },
  { id: 'ev5-likes', area: '근거 줄 · 삼항식(깨지면 안 됨)', req: 'A hidden post cannot be liked', keywords: 'hidden, like', test: 'a hidden post cannot be liked', file: 'src/likes.ts', variants: [
    ok('삼항식으로 막기', LIKES('  post.likes = post.hidden ? post.likes : post.likes + 1;\n  return post.likes;\n'), 'post.hidden'),
    unk('막지 않음', LIKES('  post.likes += 1;\n  return post.likes;\n')),
  ] },
  { id: 'ev5-redeem', area: '근거 줄 · 부정꼴 상태(깨지면 안 됨)', req: 'An inactive coupon cannot be redeemed', keywords: 'active, redeem', test: 'an inactive coupon cannot be redeemed', file: 'src/redeem.ts', variants: [
    ok('활성 검사 있음', REDEEM("  if (!coupon.active) throw new Error('COUPON_INACTIVE');\n"), 'coupon.active'),
    unk('활성 검사 없음', REDEEM('')),
  ] },
  { id: 'ev5-doc', area: '근거 줄 · 검사 함수를 조건에서 부름(깨지면 안 됨)', req: 'A locked document cannot be edited', keywords: 'locked, edit', test: 'a locked document cannot be edited', file: 'src/docs.ts', variants: [
    ok('isLocked 로 막기', DOC("  if (isLocked(doc)) throw new Error('DOC_LOCKED');\n"), 'isLocked(doc)'),
    unk('막지 않음', DOC('')),
  ] },
  { id: 'ev5-vote', area: '근거 줄 · 「who are」 문장', req: 'Users who are banned cannot vote', keywords: 'banned, vote', test: 'users who are banned cannot vote', file: 'src/votes.ts', variants: [
    ok('차단 검사 있음', VOTE('  if (user.isBanned) return false;\n'), 'user.isBanned'),
    unk('다른 것만 검사', VOTE('  if (poll.closed) return false;\n')),
  ] },
  { id: 'ev5-violations', area: '근거 줄 · 메서드로 정지하는 동작(깨지면 안 됨)', req: 'Suspend the seller after 3 violations', keywords: 'violations, suspend', test: 'suspends the seller after 3 violations', file: 'src/violations.ts', variants: [
    ok('3번째에 정지', VIOLATIONS('  if (seller.violations >= 3) seller.suspend();\n'), 'seller.violations >= 3'),
    diff('4번째에 정지', VIOLATIONS('  if (seller.violations >= 4) seller.suspend();\n')),
  ] },
  { id: 'ev5-invite-list', area: '근거 줄 · 배열에 넣어 부르는 도우미(깨지면 안 됨)', req: 'An expired invite cannot be accepted', keywords: 'expired, accept', test: 'an expired invite cannot be accepted', file: 'src/invites.ts', variants: [
    ok('배열로 부르기', INVITE('  for (const check of [ensureNotExpired]) check(invite);\n'), 'invite.expired'),
    unk('부르지 않음', INVITE('')),
  ] },
];

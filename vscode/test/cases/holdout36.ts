// 서른일곱 번째 묶음: 근거 줄의 남은 한계(11/22). 고치기 전에 썼다.
// 메서드(user.ban()) · 열거형 값(CardState.Frozen) · 상수(SUSPENDED)로 상태를 정하기만 하는 블록, 상태 낱말이 오류 글 · 기록 글에만 있는 막기,
// 아무도 부르지 않는 검사 도우미 함수. 그리고 고치다가 깨지면 안 되는 것: isLocked() 로 막기 · 도우미를 거쳐 부르기 · 메서드로 잠그는 동작 요구사항.
import type { Case } from './corpus.ts';
import type { EvVariant } from './holdout33.ts';

const ok = (name: string, code: string, ev: string): EvVariant => ({ name, code, expect: '확인됨', ev });
const unk = (name: string, code: string): EvVariant => ({ name, code, expect: '미확인' });
const diff = (name: string, code: string): EvVariant => ({ name, code, expect: '다름' });

const BAN = (guard: string) => `export class User {
  banned = false;
  reports = 0;
  ban() { this.banned = true; }
}

export function postComment(user: User, text: string, save: (text: string) => void) {
${guard}  if (/buy now|free coins/i.test(text)) {
    user.reports += 1;
    if (user.reports >= 3) user.ban();
    throw new Error('SPAM');
  }
  save(text);
}
`;
const PROJECT = (guard: string) => `export class Project {
  closed = false;
  tasks: string[] = [];
  close() { this.closed = true; }

  addTask(title: string) {
${guard}    if (this.tasks.length >= 200) {
      this.close();
      throw new Error('PROJECT_FULL');
    }
    this.tasks.push(title);
  }
}
`;
const CARD = (guard: string) => `export enum CardState { Active = 'active', Frozen = 'frozen' }
type Card = { state: CardState; balance: number };

export function charge(card: Card, amount: number, risk: number) {
${guard}  if (risk > 0.9) {
    card.state = CardState.Frozen;
    throw new Error('HIGH_RISK');
  }
  card.balance -= amount;
}
`;
const DRIVER = (guard: string) => `const ACTIVE = 'active';
const SUSPENDED = 'suspended';
type Driver = { status: string; rating: number };

export function acceptRide(driver: Driver, rideId: string, assign: (rideId: string) => void) {
${guard}  if (driver.rating < 4) {
    driver.status = SUSPENDED;
    return false;
  }
  assign(rideId);
  driver.status = ACTIVE;
  return true;
}
`;
const BOARD = (guard: string) => `type Board = { id: string; archived: boolean; title: string };

export function editBoard(board: Board, title: string, canEdit: boolean) {
${guard}  if (!canEdit) throw new Error('NO_PERMISSION_OR_ARCHIVED');
  board.title = title;
}
`;
const COUPON = (guard: string) => `type Coupon = { code: string; expired: boolean; percent: number };

export function applyCoupon(total: number, coupon: Coupon | null, log: (msg: string) => void) {
  if (!coupon) {
    log('coupon missing or expired');
    return total;
  }
${guard}  return Math.round((total * (100 - coupon.percent)) / 100);
}
`;
const RESET = (call: string) => `type User = { id: string; active: boolean; email: string };

function ensureActive(user: User) {
  if (!user.active) throw new Error('USER_INACTIVE');
}

export function resetPassword(user: User, send: (email: string, token: string) => void) {
${call}  send(user.email, Math.random().toString(36).slice(2));
}
`;
const CHAT = (call: string) => `type Member = { id: string; muted: boolean };

const assertCanSpeak = (member: Member) => {
  if (member.muted) throw new Error('MEMBER_MUTED');
};

export function sendMessage(member: Member, text: string, post: (id: string, text: string) => void) {
${call}  post(member.id, text);
}
`;
const IS_LOCKED = (guard: string) => `export class Account {
  private locked = false;
  failures = 0;
  lock() { this.locked = true; }
  isLocked() { return this.locked; }
}

export function login(account: Account, ok: boolean) {
${guard}  if (!ok) {
    account.failures += 1;
    if (account.failures >= 5) account.lock();
    throw new Error('BAD_LOGIN');
  }
  return 'session';
}
`;
const LISTING = (call: string) => `type Seller = { id: string; suspended: boolean };

function assertNotSuspended(seller: Seller) {
  if (seller.suspended) throw new Error('SELLER_SUSPENDED');
}

function checkSeller(seller: Seller) {
  assertNotSuspended(seller);
}

export function listProduct(seller: Seller, title: string, add: (id: string, title: string) => void) {
${call}  add(seller.id, title);
}
`;
const LOCKOUT = (body: string) => `export class Account {
  locked = false;
  failures = 0;
  lock() { this.locked = true; }
}

export function recordFailure(account: Account) {
  account.failures += 1;
${body}}
`;
const SHIP = (guard: string) => `enum OrderStatus { Paid = 'paid', Refunded = 'refunded', Shipped = 'shipped' }
type Order = { id: string; status: OrderStatus };

export function ship(order: Order, send: (id: string) => void) {
${guard}  send(order.id);
  order.status = OrderStatus.Shipped;
  return true;
}
`;

export const HOLDOUT36: (Omit<Case, 'variants'> & { variants: EvVariant[] })[] = [
  { id: 'ev4-ban-method', area: '근거 줄 · 메서드로 정지', req: 'A banned user cannot post comments', keywords: 'banned, comment', test: 'a banned user cannot post comments', file: 'src/comments.ts', variants: [
    ok('정지 검사 있음', BAN("  if (user.banned) throw new Error('USER_BANNED');\n"), 'user.banned'),
    unk('정지 검사 없음', BAN('')),
  ] },
  { id: 'ev4-close-method', area: '근거 줄 · this 메서드로 닫음', req: 'A closed project cannot accept new tasks', keywords: 'closed, task', test: 'a closed project cannot accept new tasks', file: 'src/projects.ts', variants: [
    ok('닫힘 검사 있음', PROJECT("    if (this.closed) throw new Error('PROJECT_CLOSED');\n"), 'this.closed'),
    unk('닫힘 검사 없음', PROJECT('')),
  ] },
  { id: 'ev4-enum-card', area: '근거 줄 · 열거형 값으로 정함', req: 'A frozen card cannot be charged', keywords: 'frozen, charge', test: 'a frozen card cannot be charged', file: 'src/cards.ts', variants: [
    ok('동결 검사 있음', CARD("  if (card.state === CardState.Frozen) throw new Error('CARD_FROZEN');\n"), 'CardState.Frozen'),
    unk('동결 검사 없음', CARD('')),
  ] },
  { id: 'ev4-const-driver', area: '근거 줄 · 상수로 정함', req: 'A suspended driver cannot accept rides', keywords: 'suspended, accept', test: 'a suspended driver cannot accept rides', file: 'src/rides.ts', variants: [
    ok('정지 검사 있음', DRIVER('  if (driver.status === SUSPENDED) return false;\n'), 'driver.status === SUSPENDED'),
    unk('정지 검사 없음', DRIVER('')),
  ] },
  { id: 'ev4-msg-board', area: '근거 줄 · 오류 글에만', req: 'An archived board cannot be edited', keywords: 'archived, edit', test: 'an archived board cannot be edited', file: 'src/boards.ts', variants: [
    ok('보관 검사 있음', BOARD("  if (board.archived) throw new Error('BOARD_ARCHIVED');\n"), 'board.archived'),
    unk('보관 검사 없음', BOARD('')),
  ] },
  { id: 'ev4-msg-log', area: '근거 줄 · 기록 글에만', req: 'An expired coupon cannot be applied', keywords: 'expired, apply', test: 'an expired coupon cannot be applied', file: 'src/coupons.ts', variants: [
    ok('만료 검사 있음', COUPON('  if (coupon.expired) return total;\n'), 'coupon.expired'),
    unk('만료 검사 없음', COUPON('')),
  ] },
  { id: 'ev4-helper-unused', area: '근거 줄 · 부르지 않는 도우미', req: 'An inactive user cannot reset the password', keywords: 'active, reset', test: 'an inactive user cannot reset the password', file: 'src/password.ts', variants: [
    ok('도우미로 막기', RESET('  ensureActive(user);\n'), 'user.active'),
    unk('도우미를 부르지 않음', RESET('')),
  ] },
  { id: 'ev4-arrow-helper', area: '근거 줄 · 화살표 도우미', req: 'A muted member cannot send messages', keywords: 'muted, send', test: 'a muted member cannot send messages', file: 'src/chat.ts', variants: [
    ok('도우미로 막기', CHAT('  assertCanSpeak(member);\n'), 'member.muted'),
    unk('도우미를 부르지 않음', CHAT('')),
  ] },
  { id: 'ev4-is-method', area: '근거 줄 · isLocked() 로 막기(깨지면 안 됨)', req: 'A locked account cannot log in', keywords: 'locked, login', test: 'a locked account cannot log in', file: 'src/auth.ts', variants: [
    ok('isLocked 검사 있음', IS_LOCKED("  if (account.isLocked()) throw new Error('LOCKED');\n"), 'account.isLocked()'),
    unk('검사 없음', IS_LOCKED('')),
  ] },
  { id: 'ev4-helper-chain', area: '근거 줄 · 도우미를 거쳐 부름(깨지면 안 됨)', req: 'A suspended seller cannot list products', keywords: 'suspended, list', test: 'a suspended seller cannot list products', file: 'src/listings.ts', variants: [
    ok('도우미 둘을 거쳐 막기', LISTING('  checkSeller(seller);\n'), 'seller.suspended'),
    unk('부르지 않음', LISTING('')),
  ] },
  { id: 'ev4-lock-after', area: '근거 줄 · 메서드로 잠그는 동작(깨지면 안 됨)', req: 'Lock the account after 5 failed logins', keywords: 'failures, lock', test: 'locks the account after 5 failed logins', file: 'src/lockout.ts', variants: [
    ok('5번째에 잠금', LOCKOUT('  if (account.failures >= 5) account.lock();\n'), 'account.failures >= 5'),
    diff('6번째에 잠금', LOCKOUT('  if (account.failures >= 6) account.lock();\n')),
    unk('잠그지 않음', LOCKOUT('  return account.failures;\n')),
  ] },
  { id: 'ev4-ship', area: '근거 줄 · 열거형 값을 보며 막기', req: 'A refunded order cannot be shipped', keywords: 'refunded, ship', test: 'a refunded order cannot be shipped', file: 'src/shipping.ts', variants: [
    ok('환불 검사 있음', SHIP('  if (order.status === OrderStatus.Refunded) return false;\n'), 'OrderStatus.Refunded'),
    unk('환불 검사 없음', SHIP('')),
  ] },
];

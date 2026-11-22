// 서른여섯 번째 묶음: 근거 줄, 두 번째로 고친 뒤 처음 쓴 사례(11/22). 이 묶음의 첫 결과가 점수다.
// 앞 두 묶음과 다른 모양: 한국어 키워드 · 삼항식 · 열거형 값으로 상태를 정함(한계 예상) · 검사 도우미 함수 · 객체로 돌려주기 · 상태를 보면서 다른 값을 정하는 블록.
import type { Case } from './corpus.ts';
import type { EvVariant } from './holdout33.ts';

const ok = (name: string, code: string, ev: string): EvVariant => ({ name, code, expect: '확인됨', ev });
const unk = (name: string, code: string): EvVariant => ({ name, code, expect: '미확인' });

const SELLER = (guard: string) => `type Seller = { id: string; suspended: boolean; violations: number };

export function listProduct(seller: Seller, title: string, catalog: { add(id: string, title: string): void }) {
${guard}  if (/fake|replica/i.test(title)) {
    seller.violations += 1;
    if (seller.violations >= 2) seller.suspended = true;
    throw new Error('BANNED_TITLE');
  }
  catalog.add(seller.id, title);
}
`;
const SESSION = (body: string) => `type User = { id: string; locked: boolean; failedLogins: number };

export function startSession(user: User, passwordOk: boolean) {
  if (!passwordOk) {
    user.failedLogins += 1;
    if (user.failedLogins >= 5) user.locked = true;
    throw new Error('WRONG_PASSWORD');
  }
${body}}

function createSession(id: string) {
  return { id, token: Math.random().toString(36).slice(2) };
}
`;
const SUB = (guard: string) => `enum SubState { Active = 'active', Cancelled = 'cancelled' }
type Subscription = { state: SubState; renewedAt: number };

export function renew(sub: Subscription, paymentOk: boolean, now: number) {
${guard}  if (!paymentOk) {
    sub.state = SubState.Cancelled;
    throw new Error('PAYMENT_FAILED');
  }
  sub.renewedAt = now;
}
`;
const HELPER = (call: string) => `type Account = { locked: boolean; failures: number };

function assertNotLocked(account: Account) {
  if (account.locked) throw new Error('ACCOUNT_LOCKED');
}

export function login(account: Account, ok: boolean) {
${call}  if (!ok) {
    account.failures += 1;
    if (account.failures >= 5) account.locked = true;
    throw new Error('BAD_LOGIN');
  }
  return 'session';
}
`;
const VOICE = (guard: string) => `type Member = { id: string; muted: boolean; strikes: number };

export function joinVoiceRoom(member: Member, room: { members: string[] }) {
${guard}  if (member.strikes > 2) {
    member.muted = true;
    return { error: 'TOO_MANY_STRIKES' };
  }
  room.members.push(member.id);
  return { ok: true };
}
`;
const CAMPAIGN = (guard: string) => `type Campaign = { paused: boolean; skipped: number; budget: number };

export function sendCampaignEmails(campaign: Campaign, emails: string[], send: (to: string) => void) {
${guard}  if (campaign.budget <= 0) {
    campaign.paused = true;
    return 0;
  }
  emails.forEach(send);
  return emails.length;
}
`;

export const HOLDOUT35: (Omit<Case, 'variants'> & { variants: EvVariant[] })[] = [
  { id: 'ev3-seller-ko', area: '근거 줄 · 정지(한국어 키워드)', req: '정지된 판매자는 상품을 올릴 수 없다', keywords: '정지, 상품', test: '정지된 판매자는 상품을 올릴 수 없다', file: 'src/products.ts', variants: [
    ok('정지 검사 있음', SELLER("  if (seller.suspended) throw new Error('SELLER_SUSPENDED');\n"), 'seller.suspended'),
    unk('정지 검사 없음', SELLER('')),
  ] },
  { id: 'ev3-ternary', area: '근거 줄 · 삼항식', req: 'A locked user cannot start a session', keywords: 'locked, session', test: 'a locked user cannot start a session', file: 'src/session.ts', variants: [
    ok('삼항식으로 막기', SESSION('  return user.locked ? null : createSession(user.id);\n'), 'user.locked'),
    unk('막지 않음', SESSION('  return createSession(user.id);\n')),
  ] },
  { id: 'ev3-enum', area: '근거 줄 · 열거형 상태(한계 예상)', req: 'A cancelled subscription cannot be renewed', keywords: 'cancelled, renew', test: 'a cancelled subscription cannot be renewed', file: 'src/subscriptions.ts', variants: [
    ok('취소 검사 있음', SUB("  if (sub.state === SubState.Cancelled) throw new Error('CANCELLED');\n"), 'SubState.Cancelled'),
    unk('취소 검사 없음', SUB('')),
  ] },
  { id: 'ev3-helper', area: '근거 줄 · 검사 도우미 함수', req: 'A locked account cannot log in', keywords: 'locked, login', test: 'a locked account cannot log in', file: 'src/login.ts', variants: [
    ok('도우미로 막기', HELPER('  assertNotLocked(account);\n'), 'account.locked'),
    unk('도우미를 부르지 않음', HELPER('')),
  ] },
  { id: 'ev3-voice', area: '근거 줄 · 객체로 돌려주기', req: 'A muted member cannot join a voice room', keywords: 'muted, join', test: 'a muted member cannot join a voice room', file: 'src/voice.ts', variants: [
    ok('음소거 검사 있음', VOICE("  if (member.muted) return { error: 'MUTED' };\n"), 'member.muted'),
    unk('음소거 검사 없음', VOICE('')),
  ] },
  { id: 'ev3-paused', area: '근거 줄 · 상태를 보며 다른 값을 정함', req: 'A paused campaign cannot send emails', keywords: 'paused, send', test: 'a paused campaign cannot send emails', file: 'src/campaigns.ts', variants: [
    ok('멈춤 검사 있음', CAMPAIGN('  if (campaign.paused) {\n    campaign.skipped += 1;\n    return 0;\n  }\n'), 'campaign.paused'),
    unk('멈춤 검사 없음', CAMPAIGN('')),
  ] },
];

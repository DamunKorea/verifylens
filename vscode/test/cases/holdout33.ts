// 서른네 번째 묶음: 근거 줄(11/22). 고치기 전에 썼다.
// 막는 요구사항(「잠긴 계정은 로그인할 수 없다」)의 진짜 검사 줄 옆에, 같은 낱말이 블록 안에 들어 있는 다른 if 블록이 있는 코드.
// 데모 PR(DamunKorea/verifylens#1)에서 찾음: 비밀번호 확인 블록 안의 `locked = true` · `BAD_LOGIN` 때문에 그 블록이 근거로 뽑혔다.
// ev: 「확인됨」이어야 하는 코드에서 근거 줄에 있어야 할 글. 검사가 없는 코드는 「미확인」이어야 한다(블록 안 낱말만으로 「확인됨」이면 안 된다).
import type { Case, Variant } from './corpus.ts';

export type EvVariant = Variant & { ev?: string };
const ok = (name: string, code: string, ev: string): EvVariant => ({ name, code, expect: '확인됨', ev });
const unk = (name: string, code: string): EvVariant => ({ name, code, expect: '미확인' });

const LOGIN = (guard: string) => `export type Account = { failures: number; locked: boolean; passwordHash: string };

export function login(account: Account, password: string, matches: (password: string, hash: string) => boolean) {
${guard}  if (!matches(password, account.passwordHash)) {
    account.failures += 1;
    if (account.failures >= 5) account.locked = true;
    throw new Error('BAD_LOGIN');
  }
  account.failures = 0;
  return 'ok';
}
`;
const COMMENT = (guard: string) => `type User = { id: string; suspended: boolean; warnings: number };

export function postComment(user: User, text: string, store: { add(userId: string, text: string): void }) {
${guard}  if (containsSpam(text)) {
    user.warnings += 1;
    if (user.warnings >= 3) user.suspended = true;
    throw new Error('SPAM_COMMENT');
  }
  store.add(user.id, text);
}

function containsSpam(text: string) {
  return /free money|click here/i.test(text);
}
`;
const WALLET = (guard: string) => `type Wallet = { balance: number; frozen: boolean; flags: number };

export function transfer(wallet: Wallet, to: Wallet, amount: number) {
${guard}  if (amount > 10_000) {
    wallet.flags += 1;
    if (wallet.flags > 2) wallet.frozen = true;
    throw new Error('TRANSFER_TOO_LARGE');
  }
  wallet.balance -= amount;
  to.balance += amount;
}
`;
const ARCHIVE = (guard: string) => `type Project = { name: string; archived: boolean; lastEditAt: number };

export function renameProject(project: Project, name: string, now: number) {
${guard}  if (now - project.lastEditAt > 365 * 24 * 3600 * 1000) {
    project.archived = true;
    throw new Error('PROJECT_EDIT_EXPIRED');
  }
  project.name = name;
  project.lastEditAt = now;
}
`;
const COUPON = (guard: string) => `type Coupon = { code: string; used: boolean; expiresAt: number };

export function redeemCoupon(coupon: Coupon, now: number) {
${guard}  if (coupon.code.length !== 8) {
    coupon.used = true;
    throw new Error('INVALID_COUPON_CODE');
  }
  coupon.used = true;
  return coupon.code;
}
`;

export const HOLDOUT33: (Omit<Case, 'variants'> & { variants: EvVariant[] })[] = [
  { id: 'ev-locked', area: '근거 줄 · 잠금', req: 'A locked account cannot log in', keywords: 'locked, login', test: 'a locked account cannot log in', file: 'src/login.ts', variants: [
    ok('잠금 검사 있음', LOGIN("  if (account.locked) throw new Error('LOCKED');\n"), 'account.locked'),
    unk('잠금 검사 없음', LOGIN('')),
  ] },
  { id: 'ev-locked-ko', area: '근거 줄 · 잠금(한국어)', req: '잠긴 계정은 로그인할 수 없다', keywords: 'locked, login', test: '잠긴 계정은 로그인할 수 없다', file: 'src/login.ts', variants: [
    ok('잠금 검사 있음', LOGIN("  if (account.locked) throw new Error('LOCKED');\n"), 'account.locked'),
    unk('잠금 검사 없음', LOGIN('')),
  ] },
  { id: 'ev-suspended', area: '근거 줄 · 정지', req: 'A suspended user cannot post comments', keywords: 'suspended, comment', test: 'a suspended user cannot post comments', file: 'src/comments.ts', variants: [
    ok('정지 검사 있음', COMMENT("  if (user.suspended) throw new Error('SUSPENDED');\n"), 'user.suspended'),
    unk('정지 검사 없음', COMMENT('')),
  ] },
  { id: 'ev-frozen', area: '근거 줄 · 동결', req: 'A frozen wallet cannot send a transfer', keywords: 'frozen, transfer', test: 'a frozen wallet cannot send a transfer', file: 'src/wallet.ts', variants: [
    ok('동결 검사 있음', WALLET("  if (wallet.frozen) throw new Error('WALLET_FROZEN');\n"), 'wallet.frozen'),
    unk('동결 검사 없음', WALLET('')),
  ] },
  { id: 'ev-archived', area: '근거 줄 · 보관', req: 'An archived project cannot be renamed', keywords: 'archived, rename', test: 'an archived project cannot be renamed', file: 'src/projects.ts', variants: [
    ok('보관 검사 있음', ARCHIVE("  if (project.archived) throw new Error('ARCHIVED');\n"), 'project.archived'),
    unk('보관 검사 없음', ARCHIVE('')),
  ] },
  { id: 'ev-coupon-used', area: '근거 줄 · 쓴 쿠폰', req: 'A used coupon cannot be redeemed again', keywords: 'used, redeem', test: 'a used coupon cannot be redeemed again', file: 'src/coupons.ts', variants: [
    ok('쓴 쿠폰 검사 있음', COUPON("  if (coupon.used) throw new Error('ALREADY_USED');\n"), 'coupon.used'),
    unk('쓴 쿠폰 검사 없음', COUPON('')),
  ] },
];

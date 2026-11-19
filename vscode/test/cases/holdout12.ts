// 열세 번째 묶음: 거부 표현 · 중복 · 비율 설정값 · 타이머를 고친 뒤 처음 썼다. 0.11.0 과 고친 판을 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT12: Case[] = [
  { id: 'y-min-payment', area: '금액', req: 'Payments below 1,000 won are not accepted', keywords: 'payment, amount', test: 'a payment of 999 is rejected', variants: [
    ok('<', "export function pay(amount: number) {\n  if (amount < 1000) throw new Error('MIN');\n}\n"),
    bad('<=', "export function pay(amount: number) {\n  if (amount <= 1000) throw new Error('MIN');\n}\n"),
  ] },
  { id: 'y-vote-once', area: '중복', req: '투표는 한 사람당 한 번만 할 수 있다', keywords: 'vote, voted', test: 'a second vote by the same person is rejected', variants: [
    ok('막기', "export function vote(poll: { voters: Set<string> }, userId: string) {\n  if (poll.voters.has(userId)) throw new Error('ALREADY_VOTED');\n  poll.voters.add(userId);\n}\n"),
    unk('검사 없음', "export function vote(poll: { voters: Set<string> }, userId: string) {\n  poll.voters.add(userId);\n}\n"),
  ] },
  { id: 'y-service-fee', area: '비율', req: '중개 수수료는 5%다', keywords: 'fee, rate', test: 'the service fee is 5%', variants: [
    ok('0.05', "export const SERVICE_FEE_RATE = 0.05;\nexport const serviceFee = (price: number) => price * SERVICE_FEE_RATE;\n"),
    bad('0.1', "export const SERVICE_FEE_RATE = 0.1;\nexport const serviceFee = (price: number) => price * SERVICE_FEE_RATE;\n"),
  ] },
  { id: 'y-poll-interval', area: '시간', req: 'The status is refreshed every 30 seconds', keywords: 'status, refresh', test: 'status refreshes every 30 seconds', variants: [
    ok('setInterval', "export function startStatusRefresh(refresh: () => void) {\n  return setInterval(refresh, 30000);\n}\n"),
    bad('60초', "export function startStatusRefresh(refresh: () => void) {\n  return setInterval(refresh, 60000);\n}\n"),
  ] },
  { id: 'y-name-length', area: '길이', req: '이름이 2자보다 짧으면 받지 않는다', keywords: 'name, length', test: 'a one letter name is rejected', variants: [
    ok('<', "export function setName(name: string) {\n  if (name.length < 2) throw new Error('SHORT');\n}\n"),
    bad('<=', "export function setName(name: string) {\n  if (name.length <= 2) throw new Error('SHORT');\n}\n"),
  ] },
  { id: 'y-session-8h', area: '시간 차이', req: '로그인은 8시간 뒤 풀린다', keywords: 'login, expired', test: 'login expires after 8 hours', variants: [
    ok('Date.now', "export const loginExpired = (loggedInAt: number) => Date.now() - loggedInAt > 8 * 60 * 60 * 1000;\n"),
    bad('24시간', "export const loginExpired = (loggedInAt: number) => Date.now() - loggedInAt > 24 * 60 * 60 * 1000;\n"),
  ] },
  { id: 'y-empty-cart', area: '0이면', req: 'Checkout is blocked when the cart has 0 items', keywords: 'cart, checkout', test: 'checkout with an empty cart is blocked', variants: [
    ok('=== 0', "export function checkout(cart: string[]) {\n  if (cart.length === 0) throw new Error('EMPTY');\n}\n"),
    bad('< 0', "export function checkout(cart: string[]) {\n  if (cart.length < 0) throw new Error('EMPTY');\n}\n"),
  ] },
  { id: 'y-email-unique', area: '중복', req: 'Each email can be registered only once', keywords: 'email, exists', test: 'registering the same email twice is rejected', variants: [
    ok('막기', "export async function register(email: string) {\n  if (await users.exists(email)) throw new Error('TAKEN');\n  return users.create(email);\n}\n"),
    unk('검사 없음', "export async function register(email: string) {\n  return users.create(email);\n}\n"),
  ] },
  { id: 'y-trap-fee', area: '함정', req: '배송비는 3,000원이다', keywords: 'shipping, fee', test: 'shipping fee is 3000', variants: [
    unk('다른 대상의 3000', "export const RETURN_FEE = 3000;\nexport const returnFee = () => RETURN_FEE;\n"),
  ] },
];

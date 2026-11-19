// 열두 번째 묶음: 0.11.0 을 고치기 전에 썼다. 남은 약점(「~마다 한 번만」 · 소수로 저장한 비율)과 새 업무 규칙.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT11: Case[] = [
  { id: 'x-review-per-product', area: '중복', req: '상품마다 리뷰는 한 번만 쓸 수 있다', keywords: 'review, exists', test: 'a second review on the same product is rejected', variants: [
    ok('막기', "export async function writeReview(userId: string, productId: string) {\n  if (await reviews.exists(userId, productId)) throw new Error('ALREADY_REVIEWED');\n  return reviews.create(userId, productId);\n}\n"),
    unk('검사 없음', "export async function writeReview(userId: string, productId: string) {\n  return reviews.create(userId, productId);\n}\n"),
  ] },
  { id: 'x-coupon-per-person', area: '중복', req: 'Each coupon can be used once per person', keywords: 'coupon, used', test: 'a coupon used twice by the same person is rejected', variants: [
    ok('막기', "export function redeem(coupon: { usedBy: Set<string> }, userId: string) {\n  if (coupon.usedBy.has(userId)) throw new Error('ALREADY_USED');\n  coupon.usedBy.add(userId);\n}\n"),
    unk('검사 없음', "export function redeem(coupon: { usedBy: Set<string> }, userId: string) {\n  coupon.usedBy.add(userId);\n}\n"),
  ] },
  { id: 'x-vat', area: '비율', req: '부가세는 10%다', keywords: 'vat, rate', test: 'vat is 10%', variants: [
    ok('0.1', "export const VAT_RATE = 0.1;\nexport const withVat = (price: number) => price * (1 + VAT_RATE);\n"),
    bad('0.08', "export const VAT_RATE = 0.08;\nexport const withVat = (price: number) => price * (1 + VAT_RATE);\n"),
  ] },
  { id: 'x-fee', area: '비율', req: 'The platform fee is 3% of the order total', keywords: 'fee, rate', test: 'platform fee is 3% of the total', variants: [
    ok('0.03', "const FEE_RATE = 0.03;\nexport const platformFee = (total: number) => Math.round(total * FEE_RATE);\n"),
    bad('0.05', "const FEE_RATE = 0.05;\nexport const platformFee = (total: number) => Math.round(total * FEE_RATE);\n"),
  ] },
  { id: 'x-page-size', area: '개수', req: '목록은 한 번에 최대 100개까지 돌려준다', keywords: 'limit, items', test: 'list returns at most 100 items', variants: [
    ok('Math.min', "export function listItems(limit: number) {\n  const take = Math.min(limit, 100);\n  return db.items.find({ take });\n}\n"),
    bad('Math.min 1000', "export function listItems(limit: number) {\n  const take = Math.min(limit, 1000);\n  return db.items.find({ take });\n}\n"),
  ] },
  { id: 'x-file-type', area: '형식', req: '이미지는 png 와 jpg 만 올릴 수 있다', keywords: 'image, extension', test: 'a gif image is rejected', variants: [
    ok('목록으로 막기', "const ALLOWED = ['png', 'jpg'];\nexport function uploadImage(name: string) {\n  const extension = name.split('.').pop()!.toLowerCase();\n  if (!ALLOWED.includes(extension)) throw new Error('TYPE');\n}\n"),
    unk('검사 없음', "export function uploadImage(name: string) {\n  return storage.put(name);\n}\n"),
  ] },
  { id: 'x-birth-year', area: '나이', req: 'Users must be at least 18 years old', keywords: 'age, birth', test: 'an 18 year old can sign up', variants: [
    ok('계산', "export function canSignUp(birthYear: number, thisYear: number) {\n  const age = thisYear - birthYear;\n  return age >= 18;\n}\n"),
    bad('> 18', "export function canSignUp(birthYear: number, thisYear: number) {\n  const age = thisYear - birthYear;\n  return age > 18;\n}\n"),
  ] },
  { id: 'x-retry-delay', area: '시간', req: '실패하면 2초 뒤에 다시 시도한다', keywords: 'retry, delay', test: 'retries after 2 seconds', variants: [
    ok('setTimeout', "export function scheduleRetry(fn: () => void) {\n  setTimeout(fn, 2000);\n}\n"),
    bad('5초', "export function scheduleRetry(fn: () => void) {\n  setTimeout(fn, 5000);\n}\n"),
  ] },
  { id: 'x-min-order', area: '금액', req: 'Orders under 10,000 won are not accepted', keywords: 'order, total', test: 'an order of 9999 is rejected', variants: [
    ok('<', "export function placeOrder(total: number) {\n  if (total < 10000) throw new Error('MIN_ORDER');\n}\n"),
    bad('<=', "export function placeOrder(total: number) {\n  if (total <= 10000) throw new Error('MIN_ORDER');\n}\n"),
  ] },
  { id: 'x-trap-rate', area: '함정', req: '포인트 적립률은 5%다', keywords: 'point, rate', test: 'point rate is 5%', variants: [
    unk('다른 대상의 0.05', "export const TAX_RATE = 0.05;\nexport const withTax = (price: number) => price * (1 + TAX_RATE);\n"),
  ] },
];

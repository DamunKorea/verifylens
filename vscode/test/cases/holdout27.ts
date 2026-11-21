// 스물여덟 번째 묶음: 같은 파일 · 다른 파일의 다른 기능 검사와 「~할 수 없다」를 고친 뒤 처음 썼다(고칠 때 안 본 사례).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '확인됨', extra });
const unk = (name: string, code: string, extra: Record<string, string> = {}): Variant => ({ name, code, expect: '미확인', extra });

const EMAIL = "const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n";
const TRANSFER = { 'src/transfer.ts': "export function transfer(acc: { balance: number }, amount: number) {\n  if (amount > acc.balance) throw new Error('INSUFFICIENT');\n  acc.balance -= amount;\n}\n" };
const LIMITS = { 'src/limits.ts': "export function assertSize(file: { size: number }, max: number) {\n  if (file.size > max) throw new Error('TOO_LARGE');\n}\n" };

export const HOLDOUT27: Case[] = [
  { id: 'u-class-refund', area: '클래스 메서드', req: '배송된 주문은 환불할 수 없다', keywords: 'refund, shipped', test: '배송된 주문의 환불은 거부한다', file: 'src/order-service.ts', variants: [
    ok('refund 에 검사', "export class OrderService {\n  cancel(order: { shipped: boolean }) {\n    if (order.shipped) throw new Error('SHIPPED');\n    return 'canceled';\n  }\n  refund(order: { shipped: boolean }) {\n    if (order.shipped) throw new Error('SHIPPED');\n    return 'refunded';\n  }\n}\n"),
    unk('cancel 에만 검사', "export class OrderService {\n  cancel(order: { shipped: boolean }) {\n    if (order.shipped) throw new Error('SHIPPED');\n    return 'canceled';\n  }\n  refund(order: { shipped: boolean }) {\n    return 'refunded';\n  }\n}\n"),
  ] },
  { id: 'u-arrow-banned', area: '화살표 함수', req: 'Banned users cannot comment', keywords: 'banned, comment', test: 'a banned user cannot post a comment', file: 'src/content.ts', variants: [
    ok('comment 에 검사', "export const createPost = (u: { banned: boolean }, body: string) => {\n  if (u.banned) throw new Error('BANNED');\n  return { body };\n};\nexport const createComment = (u: { banned: boolean }, body: string) => {\n  if (u.banned) throw new Error('BANNED');\n  return { body };\n};\n"),
    unk('post 에만 검사', "export const createPost = (u: { banned: boolean }, body: string) => {\n  if (u.banned) throw new Error('BANNED');\n  return { body };\n};\nexport const createComment = (u: { banned: boolean }, body: string) => {\n  return { body };\n};\n"),
  ] },
  { id: 'u-helper-call', area: '검사 함수 부르기', req: 'Registration rejects an invalid email address', keywords: 'register, email', test: 'registration with an invalid email is rejected', file: 'src/register.ts', variants: [
    ok('register 가 검사 함수를 부름', EMAIL + "function assertValidEmail(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n}\nexport function register(email: string, password: string) {\n  assertValidEmail(email);\n  return users.create({ email, password });\n}\nexport function subscribe(email: string) {\n  return newsletter.add(email);\n}\n"),
    unk('subscribe 만 검사 함수를 부름', EMAIL + "function assertValidEmail(email: string) {\n  if (!EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL');\n}\nexport function register(email: string, password: string) {\n  return users.create({ email, password });\n}\nexport function subscribe(email: string) {\n  assertValidEmail(email);\n  return newsletter.add(email);\n}\n"),
  ] },
  { id: 'u-withdraw-cross', area: '다른 파일 다른 기능', req: '잔액보다 많은 금액은 출금할 수 없다', keywords: 'withdraw, balance', test: '잔액보다 많은 출금은 거부한다', file: 'src/withdraw.ts', variants: [
    ok('withdraw 에 검사', "export function withdraw(acc: { balance: number }, amount: number) {\n  if (amount > acc.balance) throw new Error('INSUFFICIENT');\n  acc.balance -= amount;\n}\n", TRANSFER),
    unk('transfer 에만 검사', 'export function withdraw(acc: { balance: number }, amount: number) {\n  acc.balance -= amount;\n}\n', TRANSFER),
  ] },
  { id: 'u-attach-size', area: '같은 파일 다른 기능 · 숫자', req: 'Attachments larger than 10MB cannot be sent', keywords: 'attachment, send', test: 'sending an attachment larger than 10MB is rejected', file: 'src/media.ts', variants: [
    ok('sendAttachment 에 검사', "export function uploadPhoto(file: { size: number }) {\n  if (file.size > 10 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return photos.put(file);\n}\nexport function sendAttachment(file: { size: number }, to: string) {\n  if (file.size > 10 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return mail.send(to, file);\n}\n"),
    unk('uploadPhoto 에만 검사', "export function uploadPhoto(file: { size: number }) {\n  if (file.size > 10 * 1024 * 1024) throw new Error('TOO_LARGE');\n  return photos.put(file);\n}\nexport function sendAttachment(file: { size: number }, to: string) {\n  return mail.send(to, file);\n}\n"),
  ] },
  { id: 'u-left-edit', area: '「~할 수 없다」', req: '탈퇴한 회원은 글을 수정할 수 없다', keywords: 'edit, deleted', test: '탈퇴한 회원의 글 수정은 거부한다', file: 'src/post.ts', variants: [
    ok('editPost 에 검사', "export function writePost(user: { deletedAt: Date | null }, body: string) {\n  if (user.deletedAt) throw new Error('LEFT');\n  return { body };\n}\nexport function editPost(user: { deletedAt: Date | null }, post: { body: string }, body: string) {\n  if (user.deletedAt) throw new Error('LEFT');\n  post.body = body;\n}\n"),
    unk('writePost 에만 검사', "export function writePost(user: { deletedAt: Date | null }, body: string) {\n  if (user.deletedAt) throw new Error('LEFT');\n  return { body };\n}\nexport function editPost(user: { deletedAt: Date | null }, post: { body: string }, body: string) {\n  post.body = body;\n}\n"),
  ] },
  { id: 'u-review-verified', area: '같은 파일 다른 기능', req: '인증하지 않은 사용자는 리뷰를 쓸 수 없다', keywords: 'review, verified', test: '인증하지 않은 사용자의 리뷰 작성은 거부한다', file: 'src/review.ts', variants: [
    ok('writeReview 에 검사', "export function likeReview(user: { verified: boolean }, id: string) {\n  if (!user.verified) throw new Error('NOT_VERIFIED');\n  return likes.add(id);\n}\nexport function writeReview(user: { verified: boolean }, text: string) {\n  if (!user.verified) throw new Error('NOT_VERIFIED');\n  return reviews.add(text);\n}\n"),
    unk('likeReview 에만 검사', "export function likeReview(user: { verified: boolean }, id: string) {\n  if (!user.verified) throw new Error('NOT_VERIFIED');\n  return likes.add(id);\n}\nexport function writeReview(user: { verified: boolean }, text: string) {\n  return reviews.add(text);\n}\n"),
  ] },
  { id: 'u-sale-coupon', area: '같은 함수 다른 검사', req: 'Coupons cannot be applied to sale items', keywords: 'coupon, sale', test: 'applying a coupon to a sale item is rejected', file: 'src/coupon.ts', variants: [
    ok('applyCoupon 에 세일 검사', "export function addPoints(item: { onSale: boolean }, points: number) {\n  if (item.onSale) throw new Error('SALE_ITEM');\n  return points;\n}\nexport function applyCoupon(item: { onSale: boolean; price: number }, amount: number) {\n  if (item.price < 10000) throw new Error('MIN_PRICE');\n  if (item.onSale) throw new Error('SALE_ITEM');\n  return item.price - amount;\n}\n"),
    unk('applyCoupon 은 최소 금액만', "export function addPoints(item: { onSale: boolean }, points: number) {\n  if (item.onSale) throw new Error('SALE_ITEM');\n  return points;\n}\nexport function applyCoupon(item: { onSale: boolean; price: number }, amount: number) {\n  if (item.price < 10000) throw new Error('MIN_PRICE');\n  return item.price - amount;\n}\n"),
  ] },
  { id: 'u-own-vote', area: '「can\'t」', req: "Users can't vote on their own posts", keywords: 'vote, author', test: 'voting on your own post is rejected', file: 'src/vote.ts', variants: [
    ok('votePost 에 검사', "export function reportPost(post: { authorId: string }, userId: string) {\n  if (post.authorId === userId) throw new Error('OWN_POST');\n  return reports.add(post);\n}\nexport function votePost(post: { authorId: string }, userId: string) {\n  if (post.authorId === userId) throw new Error('OWN_POST');\n  return votes.add(post, userId);\n}\n"),
    unk('reportPost 에만 검사', "export function reportPost(post: { authorId: string }, userId: string) {\n  if (post.authorId === userId) throw new Error('OWN_POST');\n  return reports.add(post);\n}\nexport function votePost(post: { authorId: string }, userId: string) {\n  return votes.add(post, userId);\n}\n"),
  ] },
  { id: 'u-video-helper', area: '다른 파일 검사 함수', req: 'Videos larger than 100MB are rejected', keywords: 'video, upload', test: 'uploading a video larger than 100MB is rejected', file: 'src/upload.ts', variants: [
    ok('uploadVideo 가 assertSize 를 부름', "import { assertSize } from './limits';\nconst MAX_VIDEO_BYTES = 100 * 1024 * 1024;\nexport function uploadVideo(file: { size: number }) {\n  assertSize(file, MAX_VIDEO_BYTES);\n  return videos.put(file);\n}\nexport function uploadImage(file: { size: number }) {\n  return images.put(file);\n}\n", LIMITS),
    unk('uploadImage 만 assertSize 를 부름', "import { assertSize } from './limits';\nconst MAX_VIDEO_BYTES = 100 * 1024 * 1024;\nexport function uploadVideo(file: { size: number }) {\n  return videos.put(file);\n}\nexport function uploadImage(file: { size: number }) {\n  assertSize(file, MAX_VIDEO_BYTES);\n  return images.put(file);\n}\n", LIMITS),
  ] },
];

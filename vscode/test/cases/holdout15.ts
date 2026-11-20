// 열여섯 번째 묶음: 이웃 줄 · 먼저 세기 · 「N일에 한 번」 · 서수 검사 이름을 고친 뒤 처음 썼다. 0.12.0 과 고친 판을 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

const SMS = (limit: number) =>
  `const HOUR = 60 * 60 * 1000;\nexport function sendCode(phone: string, sent: number[], now: number) {\n  if (phone.length !== 11) throw new Error('PHONE');\n  const recent = sent.filter((t) => now - t < HOUR);\n  if (recent.length >= ${limit}) throw new Error('TOO_MANY');\n  sent.push(now);\n}\n`;

export const HOLDOUT15: Case[] = [
  { id: 'o-sms-hour', area: '이웃 줄', req: '인증 문자는 1시간에 5번까지만 보낼 수 있다', keywords: 'sent, recent', test: 'verification sms is limited to 5 per hour', variants: [
    ok('창 안에서 세기', SMS(5)),
    bad('10번', SMS(10)),
  ] },
  { id: 'o-tags', area: '이웃 줄', req: '게시글 태그는 5개까지 달 수 있다', keywords: 'tags, post', test: 'a post with 6 tags is rejected', variants: [
    ok('목록 길이', "export function savePost(post: { tags: string[] }) {\n  for (const tag of post.tags) if (tag.length > 20) throw new Error('TAG_LENGTH');\n  if (post.tags.length > 5) throw new Error('TOO_MANY_TAGS');\n}\n"),
    bad('10개', "export function savePost(post: { tags: string[] }) {\n  for (const tag of post.tags) if (tag.length > 20) throw new Error('TAG_LENGTH');\n  if (post.tags.length > 10) throw new Error('TOO_MANY_TAGS');\n}\n"),
  ] },
  { id: 'o-reset-links', area: '이웃 줄', req: 'A user can request at most 3 password reset links per day', keywords: 'reset, requests', test: 'a fourth reset link request in a day is rejected', variants: [
    ok('넣기 전', "export function requestReset(user: { requests: number[] }, newPassword: string, now: number) {\n  if (newPassword.length < 10) throw new Error('WEAK');\n  const today = user.requests.filter((t) => now - t < 86_400_000);\n  if (today.length >= 3) throw new Error('LIMIT');\n  user.requests.push(now);\n}\n"),
    bad('5번', "export function requestReset(user: { requests: number[] }, newPassword: string, now: number) {\n  if (newPassword.length < 10) throw new Error('WEAK');\n  const today = user.requests.filter((t) => now - t < 86_400_000);\n  if (today.length >= 5) throw new Error('LIMIT');\n  user.requests.push(now);\n}\n"),
  ] },
  { id: 'o-note-trap', area: '함정', req: '쪽지는 하루에 20번까지 보낼 수 있다', keywords: 'note, sent', test: 'notes are limited to 20 per day', variants: [
    unk('제한 없음, 글자 수만', "export function sendNote(box: { sent: string[] }, message: string) {\n  if (message.length > 20) throw new Error('TOO_LONG');\n  box.sent.push(message);\n}\n"),
  ] },
  { id: 'o-team-rename', area: '한 번', req: '팀 이름은 7일에 한 번만 바꿀 수 있다', keywords: 'team, renamedAt', test: 'a team cannot be renamed again within 7 days', variants: [
    ok('Date.now', "const DAY = 86_400_000;\nexport function renameTeam(team: { name: string; renamedAt: number }, name: string) {\n  if (Date.now() - team.renamedAt < 7 * DAY) throw new Error('TOO_SOON');\n  team.name = name;\n  team.renamedAt = Date.now();\n}\n"),
    bad('하루', "const DAY = 86_400_000;\nexport function renameTeam(team: { name: string; renamedAt: number }, name: string) {\n  if (Date.now() - team.renamedAt < 1 * DAY) throw new Error('TOO_SOON');\n  team.name = name;\n  team.renamedAt = Date.now();\n}\n"),
  ] },
  { id: 'o-export-gap', area: '한 번', req: 'A user can export their data once every 24 hours', keywords: 'export, lastExportAt', test: 'a second export within 24 hours is rejected', variants: [
    ok('Date.now', "const HOUR = 3_600_000;\nexport function exportData(u: { lastExportAt: number }) {\n  if (Date.now() - u.lastExportAt < 24 * HOUR) throw new Error('TOO_SOON');\n  u.lastExportAt = Date.now();\n}\n"),
    bad('12시간', "const HOUR = 3_600_000;\nexport function exportData(u: { lastExportAt: number }) {\n  if (Date.now() - u.lastExportAt < 12 * HOUR) throw new Error('TOO_SOON');\n  u.lastExportAt = Date.now();\n}\n"),
  ] },
  { id: 'o-coupon-uses', area: '먼저 세기', req: '쿠폰은 한 사람당 3번까지 쓸 수 있다', keywords: 'coupon, uses', test: 'a coupon cannot be used a fourth time', variants: [
    ok('먼저 세기', "export function useCoupon(c: { uses: number }) {\n  c.uses++;\n  if (c.uses > 3) throw new Error('USED_UP');\n}\n"),
    bad('4번', "export function useCoupon(c: { uses: number }) {\n  c.uses++;\n  if (c.uses > 4) throw new Error('USED_UP');\n}\n"),
  ] },
  { id: 'o-booking-people', area: '서수 검사', req: 'Guests can add at most 4 people to a booking', keywords: 'booking, people', test: 'adding a fifth person to a booking is rejected', variants: [
    ok('넣기 전', "export function addPerson(booking: { people: string[] }, name: string) {\n  if (booking.people.length >= 4) throw new Error('FULL');\n  booking.people.push(name);\n}\n"),
    bad('넣기 전 >', "export function addPerson(booking: { people: string[] }, name: string) {\n  if (booking.people.length > 4) throw new Error('FULL');\n  booking.people.push(name);\n}\n"),
  ] },
  { id: 'o-phone-confirm', area: '빠진 동작', req: 'Changing the phone number must send a confirmation SMS', keywords: 'phone, confirmation', test: 'changing the phone number sends a confirmation sms', variants: [
    ok('보내기', "export async function changePhone(user: { phone: string }, next: string) {\n  user.phone = next;\n  await sms.sendConfirmation(next);\n}\n"),
    unk('안 보냄', "export async function changePhone(user: { phone: string }, next: string) {\n  user.phone = next;\n}\n"),
  ] },
  { id: 'o-short-name', area: '반대 함정', req: '장바구니 상품 이름은 30자까지 보여 준다', keywords: 'name, shortName', test: 'product names are cut at 30 characters', variants: [
    ok('30자', "export function checkCart(cart: { items: string[] }) {\n  if (cart.items.length > 30) throw new Error('CART_FULL');\n}\nexport const shortName = (name: string) => (name.length > 30 ? name.slice(0, 30) + '…' : name);\n"),
    bad('40자', "export function checkCart(cart: { items: string[] }) {\n  if (cart.items.length > 30) throw new Error('CART_FULL');\n}\nexport const shortName = (name: string) => (name.length > 40 ? name.slice(0, 40) + '…' : name);\n"),
  ] },
];

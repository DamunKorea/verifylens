// 아홉 번째 묶음: 가입 · 계정 규칙을 고친 뒤 처음 쓴 사례. 0.9.0 과 고친 판을 이 묶음으로 나란히 잰다(고치지 않는다).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

export const HOLDOUT8: Case[] = [
  { id: 'u-phone-format', area: '형식', req: 'Phone numbers must be in a valid format', keywords: 'phone, valid', test: 'rejects a phone number in an invalid format', variants: [
    ok('정규식', "const PHONE = /^\\+?[0-9-]{9,15}$/;\nexport function savePhone(phone: string) {\n  if (!PHONE.test(phone)) throw new Error('INVALID_PHONE');\n  return db.save(phone);\n}\n"),
    unk('검사 없음', "export function savePhone(phone: string) {\n  return db.save(phone);\n}\n"),
  ] },
  { id: 'u-username-unique', area: '중복', req: '이미 쓰는 아이디로는 가입할 수 없다', keywords: 'username, exists', test: 'signup with a username that is taken is rejected', variants: [
    ok('찾아서 막기', "export async function signup(username: string) {\n  if (await users.exists(username)) throw new Error('USERNAME_TAKEN');\n  return users.create(username);\n}\n"),
    unk('검사 없음', "export async function signup(username: string) {\n  return users.create(username);\n}\n"),
  ] },
  { id: 'u-privacy-consent', area: '동의', req: '개인정보 수집에 동의해야 가입할 수 있다', keywords: 'privacy, consent', test: 'signup without privacy consent is rejected', variants: [
    ok('막기', "export function signup(input: { email: string; privacyConsent: boolean }) {\n  if (!input.privacyConsent) throw new Error('CONSENT_REQUIRED');\n  return users.create(input);\n}\n"),
    unk('검사 없음', "export function signup(input: { email: string; privacyConsent: boolean }) {\n  return users.create(input);\n}\n"),
  ] },
  { id: 'u-password-max', area: '길이', req: 'Passwords can be at most 64 characters', keywords: 'password, length', test: 'a password of 64 characters is accepted', variants: [
    ok('>', "export function checkPassword(password: string) {\n  if (password.length > 64) throw new Error('TOO_LONG');\n}\n"),
    bad('>=', "export function checkPassword(password: string) {\n  if (password.length >= 64) throw new Error('TOO_LONG');\n}\n"),
  ] },
  { id: 'u-pin', area: '형식', req: 'PIN 은 정확히 4자리 숫자다', keywords: 'pin, length', test: 'a 4 digit pin is accepted', variants: [
    ok('!==', "export function checkPin(pin: string) {\n  if (pin.length !== 4 || !/^\\d+$/.test(pin)) throw new Error('BAD_PIN');\n}\n"),
    bad('6자리', "export function checkPin(pin: string) {\n  if (pin.length !== 6 || !/^\\d+$/.test(pin)) throw new Error('BAD_PIN');\n}\n"),
  ] },
  { id: 'u-reset-once', area: '중복', req: 'A password reset link can be used only once', keywords: 'reset, used', test: 'a used reset link is rejected', variants: [
    ok('막기', "export function useResetLink(link: { used: boolean }) {\n  if (link.used) throw new Error('LINK_USED');\n  link.used = true;\n}\n"),
    unk('검사 없음', "export function useResetLink(link: { used: boolean }) {\n  link.used = true;\n}\n"),
  ] },
  { id: 'u-adult', area: '나이', req: '만 19세 이상만 가입할 수 있다', keywords: 'age', test: 'age 19 can sign up', variants: [
    ok('<', "export function signup(age: number) {\n  if (age < 19) throw new Error('TOO_YOUNG');\n}\n"),
    bad('<=', "export function signup(age: number) {\n  if (age <= 19) throw new Error('TOO_YOUNG');\n}\n"),
  ] },
  { id: 'u-otp-tries', area: '횟수', req: '인증번호는 5번 틀리면 다시 받아야 한다', keywords: 'attempts, code', test: 'code is invalidated after 5 wrong attempts', variants: [
    ok('>=', "export function checkCode(state: { attempts: number }, ok: boolean) {\n  if (!ok) state.attempts += 1;\n  if (state.attempts >= 5) throw new Error('REISSUE');\n}\n"),
    bad('>', "export function checkCode(state: { attempts: number }, ok: boolean) {\n  if (!ok) state.attempts += 1;\n  if (state.attempts > 5) throw new Error('REISSUE');\n}\n"),
  ] },
  { id: 'u-inactive', area: '기간', req: 'Accounts inactive for more than 365 days are deactivated', keywords: 'inactive, days', test: 'account inactive for 366 days is deactivated', variants: [
    ok('>', "export const shouldDeactivate = (inactiveDays: number) => inactiveDays > 365;\n"),
    bad('>=', "export const shouldDeactivate = (inactiveDays: number) => inactiveDays >= 365;\n"),
  ] },
  { id: 'u-email-change', area: '형식', req: '이메일을 바꾸면 새 주소로 인증 메일을 보내야 한다', keywords: 'email, verification', test: 'changing the email sends a verification mail', variants: [
    ok('보내기', "export async function changeEmail(user: { email: string }, next: string) {\n  user.email = next;\n  await mailer.sendVerification(next);\n}\n"),
    unk('안 보냄', "export async function changeEmail(user: { email: string }, next: string) {\n  user.email = next;\n}\n"),
  ] },
  // 함정: 이름만 같은 다른 규칙
  { id: 'u-trap-length', area: '함정', req: '닉네임은 최대 10자다', keywords: 'nickname', test: 'bio is limited to 10 lines', variants: [
    unk('다른 대상', "export function saveBio(bioLines: string[]) {\n  if (bioLines.length > 10) throw new Error('BIO');\n}\n"),
  ] },
];

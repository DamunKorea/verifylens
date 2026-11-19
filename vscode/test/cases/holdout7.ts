// 여덟 번째 묶음: 가입 흐름. X 에서 받은 답(「항상 가입 흐름부터 눌러 본다」)을 보고, 0.9.0 을 고치기 전에 썼다.
// 숫자가 없는 규칙(형식 · 중복 · 동의)이 많다. 구현이 아예 없는 코드는 「다름」이 아니라도 「확인됨」이면 안 된다(미확인).
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string): Variant => ({ name, code, expect: '확인됨' });
const bad = (name: string, code: string): Variant => ({ name, code, expect: '다름' });
const unk = (name: string, code: string): Variant => ({ name, code, expect: '미확인' });

const save = 'export async function signup(input: { email: string; password: string }) {\n  return users.create(input);\n}\n';

export const HOLDOUT7: Case[] = [
  { id: 's-email-format', area: '형식', req: '이메일 형식이 올바르지 않으면 가입을 거부한다', keywords: 'email, invalid', test: 'rejects an invalid email', variants: [
    ok('정규식', "const EMAIL = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/;\nexport async function signup(input: { email: string; password: string }) {\n  if (!EMAIL.test(input.email)) throw new Error('INVALID_EMAIL');\n  return users.create(input);\n}\n"),
    unk('검사 없음', save),
  ] },
  { id: 's-password-min', area: '길이', req: 'Passwords must be at least 8 characters', keywords: 'password, length', test: 'a password of 8 characters is accepted', variants: [
    ok('<', "export function checkPassword(password: string) {\n  if (password.length < 8) throw new Error('WEAK_PASSWORD');\n}\n"),
    bad('<=', "export function checkPassword(password: string) {\n  if (password.length <= 8) throw new Error('WEAK_PASSWORD');\n}\n"),
  ] },
  { id: 's-password-digit', area: '형식', req: '비밀번호에는 숫자가 하나 이상 들어가야 한다', keywords: 'password, digit', test: 'a password without a digit is rejected', variants: [
    ok('정규식', "export function checkPassword(password: string) {\n  if (!/\\d/.test(password)) throw new Error('NEEDS_DIGIT');\n}\n"),
    unk('검사 없음', "export function checkPassword(password: string) {\n  if (password.length < 8) throw new Error('WEAK_PASSWORD');\n}\n"),
  ] },
  { id: 's-age-consent', area: '나이', req: 'Users under 14 need guardian consent', keywords: 'age, consent', test: 'a 13 year old without consent is rejected', variants: [
    ok('<', "export function signup(input: { age: number; guardianConsent: boolean }) {\n  if (input.age < 14 && !input.guardianConsent) throw new Error('CONSENT_REQUIRED');\n}\n"),
    bad('<=', "export function signup(input: { age: number; guardianConsent: boolean }) {\n  if (input.age <= 14 && !input.guardianConsent) throw new Error('CONSENT_REQUIRED');\n}\n"),
  ] },
  { id: 's-duplicate', area: '중복', req: '같은 이메일로는 한 번만 가입할 수 있다', keywords: 'email, exists', test: 'a second signup with the same email is rejected', variants: [
    ok('찾아서 막기', "export async function signup(input: { email: string; password: string }) {\n  const existing = await users.findByEmail(input.email);\n  if (existing) throw new Error('EMAIL_TAKEN');\n  return users.create(input);\n}\n"),
    unk('검사 없음', save),
  ] },
  { id: 's-terms', area: '동의', req: 'Users must accept the terms to sign up', keywords: 'terms, accepted', test: 'signup without accepting the terms is rejected', variants: [
    ok('막기', "export function signup(input: { email: string; acceptedTerms: boolean }) {\n  if (!input.acceptedTerms) throw new Error('TERMS_REQUIRED');\n  return users.create(input);\n}\n"),
    unk('검사 없음', "export function signup(input: { email: string; acceptedTerms: boolean }) {\n  return users.create(input);\n}\n"),
  ] },
  { id: 's-nickname', area: '길이', req: '닉네임은 2자 이상 12자 이하여야 한다', keywords: 'nickname, length', test: 'nickname of 2 to 12 characters is accepted', variants: [
    ok('범위', "export function checkNickname(nickname: string) {\n  if (nickname.length < 2 || nickname.length > 12) throw new Error('NICKNAME');\n}\n"),
    bad('위쪽 >=', "export function checkNickname(nickname: string) {\n  if (nickname.length < 2 || nickname.length >= 12) throw new Error('NICKNAME');\n}\n"),
  ] },
  { id: 's-verify-link', area: '시간', req: '인증 메일 링크는 24시간 뒤에 만료된다', keywords: 'link, expired', test: 'verification link expires after 24 hours', variants: [
    ok('ms', "const HOUR = 60 * 60 * 1000;\nexport const linkExpired = (sentAt: number, now: number) => now - sentAt > 24 * HOUR;\n"),
    bad('48시간', "const HOUR = 60 * 60 * 1000;\nexport const linkExpired = (sentAt: number, now: number) => now - sentAt > 48 * HOUR;\n"),
  ] },
  { id: 's-code-digits', area: '형식', req: 'The verification code has 6 digits', keywords: 'code, length', test: 'a 6 digit code is accepted', variants: [
    ok('!==', "export function checkCode(code: string) {\n  if (code.length !== 6) throw new Error('BAD_CODE');\n}\n"),
    bad('4자리', "export function checkCode(code: string) {\n  if (code.length !== 4) throw new Error('BAD_CODE');\n}\n"),
  ] },
  { id: 's-signup-rate', area: '횟수', req: '같은 IP 에서 한 시간에 가입은 최대 3번까지 할 수 있다', keywords: 'signups, ip', test: 'a fourth signup from the same ip within an hour is rejected', variants: [
    ok('넣기 전', "export function signup(signupsFromIp: number[], now: number) {\n  if (signupsFromIp.length >= 3) throw new Error('TOO_MANY');\n  signupsFromIp.push(now);\n}\n"),
    bad('넣기 전 >', "export function signup(signupsFromIp: number[], now: number) {\n  if (signupsFromIp.length > 3) throw new Error('TOO_MANY');\n  signupsFromIp.push(now);\n}\n"),
  ] },
];

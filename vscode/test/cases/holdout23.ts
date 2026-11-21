// 스물네 번째 묶음: 0.16.0 에서 남은 세 갈래(class-validator 데코레이터 · 키워드 없이 중복 막기 검사 잇기 · 시간 창 없는 「N시간에 M번」)를
// 고치기 전에 먼저 썼다. 0.16.0 으로 첫 점수를 잰 뒤 고친다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

const LOGIN_DTO = { 'src/login.dto.ts': "import { IsEmail } from 'class-validator';\nexport class LoginDto {\n  @IsEmail()\n  email!: string;\n}\n" };
const MEMBER_DTO = { 'src/member.dto.ts': "import { IsUUID } from 'class-validator';\nexport class MemberDto {\n  @IsUUID()\n  userId!: string;\n}\n" };
const BIO_DTO = { 'src/bio.dto.ts': "import { MaxLength } from 'class-validator';\nexport class BioDto {\n  @MaxLength(12)\n  headline!: string;\n}\n" };
const PIN_DTO = { 'src/pin.dto.ts': "import { Matches } from 'class-validator';\nexport class PinDto {\n  @Matches(/^\\d{6}$/)\n  pin!: string;\n}\n" };
const POLL = { 'src/poll.ts': "export function vote(votes: { userId: string }[], userId: string) {\n  if (votes.some((v) => v.userId === userId)) throw new Error('ALREADY_VOTED');\n  votes.push({ userId });\n}\n" };
const LEDGER = { 'src/ledger.ts': 'export function addEntry(entries: { id: string }[], id: string) {\n  entries.push({ id });\n}\n' };
const RETRY3 = { 'src/retry.ts': 'export async function withRetry(fn: () => Promise<void>) {\n  for (let i = 0; i < 3; i++) {\n    try { return await fn(); } catch { /* again */ }\n  }\n}\n' };
const PAGE5 = { 'src/page.ts': 'export const firstFive = (rows: string[]) => rows.slice(0, 5);\n' };

const DTO = (deco: string, imp: string, prop: string) => `import { ${imp} } from 'class-validator';\nexport class Dto {\n  ${deco}\n  ${prop}!: string;\n}\n`;

export const HOLDOUT23: Case[] = [
  // class-validator 데코레이터
  { id: 'x-dto-email', area: '데코레이터 검사', req: 'Sign-up rejects an invalid email address', keywords: 'email, signup', test: 'sign-up rejects an invalid email address', file: 'src/signup.dto.ts', variants: [
    ok('@IsEmail', DTO('@IsEmail()', 'IsEmail', 'email').replace('class Dto', 'class SignupDto'), LOGIN_DTO),
    unk('@IsString 만 · 로그인에만 @IsEmail', DTO('@IsString()', 'IsString', 'email').replace('class Dto', 'class SignupDto'), LOGIN_DTO),
  ] },
  { id: 'x-dto-url', area: '데코레이터 검사', req: '프로필 웹사이트 주소가 URL 형식이 아니면 저장을 거부한다', keywords: 'website, profile', test: 'rejects a profile website that is not a url', file: 'src/profile.dto.ts', variants: [
    ok('@IsUrl', DTO('@IsUrl()', 'IsUrl', 'website').replace('class Dto', 'class ProfileDto'), LOGIN_DTO),
    unk('@IsString 만', DTO('@IsString()', 'IsString', 'website').replace('class Dto', 'class ProfileDto'), LOGIN_DTO),
  ] },
  { id: 'x-dto-uuid', area: '데코레이터 검사', req: 'Requests with an invalid team id are rejected', keywords: 'teamId, dto', test: 'rejects a team id that is not a uuid', file: 'src/team.dto.ts', variants: [
    ok('@IsUUID', DTO('@IsUUID()', 'IsUUID', 'teamId').replace('class Dto', 'class TeamDto'), MEMBER_DTO),
    unk('@IsString 만 · 멤버에만 @IsUUID', DTO('@IsString()', 'IsString', 'teamId').replace('class Dto', 'class TeamDto'), MEMBER_DTO),
  ] },
  { id: 'x-dto-length', area: '데코레이터 길이', req: '닉네임은 2자 이상 12자 이하다', keywords: 'nickname, dto', test: 'nickname must be 2 to 12 characters', file: 'src/nickname.dto.ts', variants: [
    ok('2 ~ 12', "import { MaxLength, MinLength } from 'class-validator';\nexport class NicknameDto {\n  @MinLength(2)\n  @MaxLength(12)\n  nickname!: string;\n}\n", BIO_DTO),
    bad('2 ~ 20', "import { MaxLength, MinLength } from 'class-validator';\nexport class NicknameDto {\n  @MinLength(2)\n  @MaxLength(20)\n  nickname!: string;\n}\n", BIO_DTO),
  ] },
  { id: 'x-dto-matches', area: '데코레이터 길이', req: 'Verification codes must be exactly 6 digits', keywords: 'code, verify', test: 'rejects a verification code that is not 6 digits', file: 'src/verify.dto.ts', variants: [
    ok('@Matches 6자리', "import { Matches } from 'class-validator';\nexport class VerifyDto {\n  @Matches(/^\\d{6}$/)\n  code!: string;\n}\n", PIN_DTO),
    bad('@Matches 4자리', "import { Matches } from 'class-validator';\nexport class VerifyDto {\n  @Matches(/^\\d{4}$/)\n  code!: string;\n}\n", PIN_DTO),
  ] },
  // 키워드 없이도 이어져야 하는 중복 막기 검사
  { id: 'x-event-dup', area: '중복 막기', req: '같은 이벤트에는 한 사람이 한 번만 참여할 수 있다', keywords: 'event, join', test: 'joining the same event twice is rejected', file: 'src/event.ts', variants: [
    ok('some 막기', "export function joinEvent(event: { participants: { userId: string }[] }, userId: string) {\n  if (event.participants.some((p) => p.userId === userId)) throw new Error('ALREADY_JOINED');\n  event.participants.push({ userId });\n}\n", POLL),
    unk('검사 없음 · 투표에만 some', 'export function joinEvent(event: { participants: { userId: string }[] }, userId: string) {\n  event.participants.push({ userId });\n}\n', POLL),
  ] },
  { id: 'x-transfer-key', area: '중복 막기', req: 'Sending the same transfer request again moves the money only once', keywords: 'transfer, requestId', test: 'a repeated transfer request with the same id moves the money once', file: 'src/transfer.ts', variants: [
    ok('id 로 이전 결과', 'export async function transfer(db: any, requestId: string, amount: number) {\n  const done = await db.transfer.findUnique({ where: { requestId } });\n  if (done) return done;\n  return db.transfer.create({ data: { requestId, amount } });\n}\n', LEDGER),
    unk('검사 없음', 'export async function transfer(db: any, requestId: string, amount: number) {\n  return db.transfer.create({ data: { requestId, amount } });\n}\n', LEDGER),
  ] },
  // 「N시간에 M번」인데 코드에 시간 창이 없는 경우
  { id: 'x-hourly-window', area: '시간 창', req: '같은 IP 에서는 1시간에 5번까지만 로그인을 시도할 수 있다', keywords: 'login, attempts', test: 'a sixth login attempt within an hour is blocked', file: 'src/login.ts', variants: [
    ok('1시간 안만 셈', "export function tryLogin(attempts: number[], now: number) {\n  const recent = attempts.filter((t) => now - t < 60 * 60 * 1000);\n  if (recent.length >= 5) throw new Error('TOO_MANY');\n  attempts.push(now);\n}\n", RETRY3),
    unk('시간 창 없음 · 전부 셈', "export function tryLogin(attempts: number[], now: number) {\n  if (attempts.length >= 5) throw new Error('TOO_MANY');\n  attempts.push(now);\n}\n", RETRY3),
  ] },
  { id: 'x-daily-window', area: '시간 창', req: 'Each user can send at most 3 invites per day', keywords: 'invite, sent', test: 'a fourth invite on the same day is rejected', file: 'src/invite.ts', variants: [
    ok('오늘 것만 셈', "export function sendInvite(sent: number[], now: number) {\n  const today = sent.filter((t) => now - t < 24 * 60 * 60 * 1000);\n  if (today.length >= 3) throw new Error('DAILY_LIMIT');\n  sent.push(now);\n}\n", PAGE5),
    unk('시간 창 없음 · 전부 셈', "export function sendInvite(sent: number[], now: number) {\n  if (sent.length >= 3) throw new Error('DAILY_LIMIT');\n  sent.push(now);\n}\n", PAGE5),
  ] },
  { id: 'x-hourly-happy', area: '테스트가 다른 경우만', req: '비밀번호 재설정 메일은 1시간에 3번까지 보낼 수 있다', keywords: 'reset, mail', test: 'sends a reset mail', file: 'src/reset.ts', variants: [
    unk('창 있음 · 한 번 보내는 테스트뿐', "export function sendResetMail(sent: number[], now: number) {\n  const recent = sent.filter((t) => now - t < 60 * 60 * 1000);\n  if (recent.length >= 3) throw new Error('TOO_MANY');\n  sent.push(now);\n}\n", RETRY3),
    unk('창 없음 · 한 번 보내는 테스트뿐', "export function sendResetMail(sent: number[], now: number) {\n  if (sent.length >= 3) throw new Error('TOO_MANY');\n  sent.push(now);\n}\n", RETRY3),
  ] },
];

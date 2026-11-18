// 네 번째 묶음: 범위를 말하는 표현. 0.7.0 에서 「up to and including 8mb」를 잘못 읽은 일을 계기로, 고치기 전에 먼저 썼다.
// 표현마다 맞는 코드와 경계가 하나 어긋난 코드를 함께 돌린다.
import type { Case, Variant } from './corpus.ts';

const ok = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '확인됨', extra });
const bad = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '다름', extra });
const unk = (name: string, code: string, extra?: Record<string, string>): Variant => ({ name, code, expect: '미확인', extra });

type Kind = 'lte' | 'lt' | 'gte' | 'gt';
/** 조건이 참이면 통과하는 코드: 맞는 연산자와 하나 어긋난 연산자 */
const OPS: Record<Kind, [string, string]> = { lte: ['<=', '<'], lt: ['<', '<='], gte: ['>=', '>'], gt: ['>', '>='] };
const code = (op: string, n: number) => `export const accepted = (fileSize: number) => fileSize ${op} ${n};\n`;

let seq = 0;
const phrase = (req: string, kind: Kind, n = 8): Case => {
  const [good, wrong] = OPS[kind];
  return { id: `r${++seq}`, area: '범위 표현', req, keywords: 'file, size', test: `file size ${n} rule`, variants: [ok(good, code(good, n)), bad(wrong, code(wrong, n))] };
};

const upload = (body: string) => `export function upload(request: { file: { size: number } }) {\n${body}\n}\n`;

export const HOLDOUT3: Case[] = [
  // 위쪽 한도 (그 값 포함)
  phrase('Files up to and including 8mb are accepted', 'lte'),
  phrase('Files up to 8mb are accepted', 'lte'),
  phrase('File size must be at most 8mb', 'lte'),
  phrase('File size must be no more than 8mb', 'lte'),
  phrase('File size must not be more than 8mb', 'lte'),
  phrase('The maximum file size is 8mb', 'lte'),
  phrase('Max file size: 8mb', 'lte'),
  phrase('Files of 8mb or less are accepted', 'lte'),
  phrase('Files of 8mb or smaller are accepted', 'lte'),
  phrase('File size must not exceed 8mb', 'lte'),
  phrase('File size cannot exceed 8mb', 'lte'),
  phrase('File size may not be greater than 8mb', 'lte'),
  phrase('File size is limited to 8mb', 'lte'),
  phrase('File size is capped at 8mb', 'lte'),
  phrase('File size must be less than or equal to 8mb', 'lte'),
  phrase('File size must be no larger than 8mb', 'lte'),
  phrase('Files through 8mb are accepted', 'lte'),
  phrase('파일은 8MB까지 포함해서 올릴 수 있다', 'lte'),
  phrase('파일 크기는 8MB를 넘지 않아야 한다', 'lte'),
  phrase('파일 크기는 8MB를 넘을 수 없다', 'lte'),
  // 위쪽 한도 (그 값 제외)
  phrase('Files under 8mb are accepted', 'lt'),
  phrase('Files below 8mb are accepted', 'lt'),
  phrase('File size must be less than 8mb', 'lt'),
  phrase('Files smaller than 8mb are accepted', 'lt'),
  phrase('Files up to but not including 8mb are accepted', 'lt'),
  phrase('Files up to 8mb exclusive are accepted', 'lt'),
  phrase('파일 크기는 8MB 미만이어야 한다', 'lt'),
  phrase('파일 크기는 8MB보다 작아야 한다', 'lt'),
  // 아래쪽 한도 (그 값 포함)
  phrase('File size must be at least 8', 'gte'),
  phrase('Files of 8mb or more are accepted', 'gte'),
  phrase('Files of 8mb or larger are accepted', 'gte'),
  phrase('The minimum file size is 8mb', 'gte'),
  phrase('Min file size: 8mb', 'gte'),
  phrase('File size must be no less than 8mb', 'gte'),
  phrase('File size must not be less than 8mb', 'gte'),
  phrase('File size must be greater than or equal to 8mb', 'gte'),
  phrase('Files from 8mb are accepted', 'gte'),
  phrase('파일 크기는 8MB 이상이어야 한다', 'gte'),
  phrase('파일 크기는 최소 8MB다', 'gte'),
  // 아래쪽 한도 (그 값 제외)
  phrase('Files over 8mb are accepted', 'gt'),
  phrase('Files above 8mb are accepted', 'gt'),
  phrase('File size must be more than 8mb', 'gt'),
  phrase('File size must be greater than 8mb', 'gt'),
  phrase('Files larger than 8mb are accepted', 'gt'),
  phrase('File size must exceed 8mb', 'gt'),
  phrase('파일 크기는 8MB 초과여야 한다', 'gt'),
  phrase('파일 크기는 8MB보다 커야 한다', 'gt'),
  // 숫자 없이 말하는 경계
  { id: 'r-positive', area: '말로 쓴 경계', req: 'Accept any positive change count', keywords: 'change, count', test: 'change count positive rule', variants: [
    ok('> 0', 'export const accepted = (changeCount: number) => changeCount > 0;\n'),
    ok('>= 1', 'export const accepted = (changeCount: number) => changeCount >= 1;\n'),
    bad('=== 1', 'export const accepted = (changeCount: number) => changeCount === 1;\n'),
    bad('>= 0', 'export const accepted = (changeCount: number) => changeCount >= 0;\n'),
  ] },
  { id: 'r-nonneg', area: '말로 쓴 경계', req: 'The balance must be non-negative', keywords: 'balance', test: 'balance non negative rule', variants: [
    ok('>= 0', 'export const valid = (balance: number) => balance >= 0;\n'),
    ok('막는 조건', "export function check(balance: number) {\n  if (balance < 0) throw new Error('balance');\n}\n"),
    bad('> 0', 'export const valid = (balance: number) => balance > 0;\n'),
  ] },
  { id: 'r-at-least-one', area: '말로 쓴 경계', req: 'An order needs at least one item', keywords: 'order, items', test: 'order items one rule', variants: [
    ok('>= 1', 'export const valid = (order: { items: string[] }) => order.items.length >= 1;\n'),
    ok('> 0', 'export const valid = (order: { items: string[] }) => order.items.length > 0;\n'),
    bad('> 1', 'export const valid = (order: { items: string[] }) => order.items.length > 1;\n'),
  ] },
  { id: 'r-ko-positive', area: '말로 쓴 경계', req: '수량은 양수여야 한다', keywords: 'quantity', test: 'quantity positive rule', variants: [
    ok('> 0', 'export const valid = (quantity: number) => quantity > 0;\n'),
    bad('>= 0', 'export const valid = (quantity: number) => quantity >= 0;\n'),
  ] },
  // 범위
  { id: 'r-between', area: '범위', req: 'Quantity must be between 1 and 10 inclusive', keywords: 'quantity', test: 'quantity 1 10 rule', variants: [
    ok('둘 다 포함', 'export const valid = (quantity: number) => quantity >= 1 && quantity <= 10;\n'),
    bad('위쪽 제외', 'export const valid = (quantity: number) => quantity >= 1 && quantity < 10;\n'),
    bad('아래쪽 제외', 'export const valid = (quantity: number) => quantity > 1 && quantity <= 10;\n'),
  ] },
  { id: 'r-from-to', area: '범위', req: '수량은 1부터 10까지다', keywords: 'quantity', test: 'quantity 1 10 rule', variants: [
    ok('둘 다 포함', 'export const valid = (quantity: number) => quantity >= 1 && quantity <= 10;\n'),
    bad('위쪽 제외', 'export const valid = (quantity: number) => quantity >= 1 && quantity < 10;\n'),
  ] },
  { id: 'r-tilde', area: '범위', req: '수량은 1~10개다', keywords: 'quantity', test: 'quantity 1 10 rule', variants: [
    ok('둘 다 포함', 'export const valid = (quantity: number) => quantity >= 1 && quantity <= 10;\n'),
    bad('위쪽 제외', 'export const valid = (quantity: number) => quantity >= 1 && quantity < 10;\n'),
  ] },
  // 방향이 적혀 있지 않은 숫자는 「맞다」고 하면 안 된다
  { id: 'r-no-direction', area: '말로 쓴 경계', req: 'The file size limit is about 8mb', keywords: 'file, size', test: 'file size 8 rule', variants: [
    unk('>=', 'export const accepted = (fileSize: number) => fileSize >= 8;\n'),
  ] },
  // 실제 PR 과 같은 모양: 다른 파일의 상수를 경로 별칭으로 가져옴
  { id: 'r-alias', area: '상수', req: 'Files up to and including 8mb are accepted', keywords: 'file, size', test: 'file size 8 rule', file: 'src/controllers/upload.ts', variants: [
    ok('별칭 >', "import { MAX_FILE_SIZE_IN_BYTES } from '@services/constants';\n" + upload("  if (request.file.size > MAX_FILE_SIZE_IN_BYTES) throw new Error('large');"), { 'src/services/constants.ts': 'export const MAX_FILE_SIZE_IN_BYTES = 8 * 1024 * 1024;\n' }),
    bad('별칭 >=', "import { MAX_FILE_SIZE_IN_BYTES } from '@services/constants';\n" + upload("  if (request.file.size >= MAX_FILE_SIZE_IN_BYTES) throw new Error('large');"), { 'src/services/constants.ts': 'export const MAX_FILE_SIZE_IN_BYTES = 8 * 1024 * 1024;\n' }),
    bad('재수출을 거쳐 >=', "import { MAX_FILE_SIZE_IN_BYTES } from './shared.ts';\n" + upload("  if (request.file.size >= MAX_FILE_SIZE_IN_BYTES) throw new Error('large');"), { 'src/controllers/shared.ts': "export * from './limits.ts';\n", 'src/controllers/limits.ts': 'export const MAX_FILE_SIZE_IN_BYTES = 8 * 1024 * 1024;\n' }),
  ] },
];

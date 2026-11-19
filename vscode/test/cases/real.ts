// 실제 공개 프로젝트의 코드로 재 본다. node test/cases/real.ts <내려받은 저장소들이 있는 폴더>
// 코드는 읽기만 하고 실행하지 않는다. 문서에 적힌 규칙을 요구사항으로 쓰고,
//  1) 그대로의 코드는 「확인됨」이어야 하고  2) 경계 연산자나 숫자를 바꾼 코드는 「다름」이어야 한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFiles, evaluate } from '../../../src/engine.ts';
import { parseRequirements } from '../../../src/requirements.ts';
import { partValue } from '../../../src/numeric.ts';
import type { NumPart, Report } from '../../../src/types.ts';

type Rule = { repo: string; files: string[]; req: string; keywords: string };

/** 고정 묶음: 판마다 같은 커밋으로 잰다 (docs/benchmark.md). 저장소를 바꾸거나 커밋을 올리면 이전 판과 숫자를 비교할 수 없다. */
export const REPOS: Record<string, { url: string; commit: string }> = {
  'validator.js': { url: 'https://github.com/validatorjs/validator.js', commit: '9ff342479591ca5a43cb30000195bcf55c1bbed9' },
  'express-rate-limit': { url: 'https://github.com/express-rate-limit/express-rate-limit', commit: 'f2fbded251a5c2186c244b612dabee970f5ad3c1' },
  'p-retry': { url: 'https://github.com/sindresorhus/p-retry', commit: 'ac3c4cdb7f015e1f71825e4274e2323a49b615eb' },
  ky: { url: 'https://github.com/sindresorhus/ky', commit: '3541888878c4d303a8bc2ad61815f4e048f55a5d' },
  helmet: { url: 'https://github.com/helmetjs/helmet', commit: 'e91d88f6586656531df99816a2e26441feab0e45' },
  nanoid: { url: 'https://github.com/ai/nanoid', commit: '055d1700cc67ac843e3efb5235d806b419ec7b2b' },
};

const RULES: Rule[] = [
  { repo: 'validator.js', files: ['src/lib/isEmail.js'], req: '이메일 주소는 254자를 넘을 수 없다', keywords: 'email, length, str' },
  { repo: 'validator.js', files: ['src/lib/isEmail.js'], req: 'The local part of an email is at most 64 bytes', keywords: 'user, max' },
  { repo: 'validator.js', files: ['src/lib/isFQDN.js'], req: '도메인의 각 부분은 63자 이하여야 한다', keywords: 'part, length' },
  { repo: 'validator.js', files: ['src/lib/isStrongPassword.js'], req: '강한 비밀번호는 8자 이상이어야 한다', keywords: 'analysis, length, minLength' },
  { repo: 'validator.js', files: ['src/lib/isPort.js'], req: 'A port number is at most 65535', keywords: 'port, max' },
  { repo: 'express-rate-limit', files: ['source/rate-limit.ts'], req: '기본 시간 창은 1분이다', keywords: 'windowMs' },
  { repo: 'express-rate-limit', files: ['source/rate-limit.ts'], req: 'By default a client may make at most 5 requests per window', keywords: 'limit' },
  { repo: 'p-retry', files: ['index.js'], req: '기본으로 최대 10번 재시도한다', keywords: 'retries, options' },
  { repo: 'ky', files: ['source/utils/normalize.ts'], req: '기본 재시도 횟수는 최대 2번이다', keywords: 'limit, retry' },
  { repo: 'helmet', files: ['middlewares/strict-transport-security/index.ts'], req: 'The default HSTS max age is 365 days', keywords: 'maxAge' },
  { repo: 'nanoid', files: ['non-secure/index.js'], req: '기본 ID 길이는 21자다', keywords: 'size, id' },
];

const root = process.argv[2];
const run = (rule: Rule, files: Record<string, string>) => {
  // 규칙을 확인하는 검사가 있다고 치고 경계만 본다
  const test = `${rule.keywords.split(',').map((s) => s.trim()).join(' ')} ${parseRequirements(`- R1: ${rule.req}`)[0].numbers.join(' ')} rule`;
  const set = analyzeFiles({ key: 'A', ref: 'real', sha: 'real', files, tests: [{ name: test, status: 'pass', message: '' }] });
  return evaluate([set], parseRequirements(`- R1: ${rule.req} | keywords: ${rule.keywords}`), '.', 'main');
};
const judged = (r: Report) => {
  const e = r.sets[0].perReq.R1.evidence;
  const b = e.boundaries?.[0];
  const p = e.unit?.cond?.parts?.find((x) => x.line === b?.line) ?? e.unit?.cond?.parts?.[0];
  return { e, b, p };
};
const FLIP: Record<string, string> = { '>=': '>', '<=': '<', '>': '>=', '<': '<=' };

function mutants(src: string, p: NumPart): { name: string; code: string }[] {
  const lines = src.split('\n');
  const out: { name: string; code: string }[] = [];
  const at = p.line - 1;
  if (p.source === 'compare' || p.source === 'loop') {
    const m = lines[at].match(/(>=|<=|(?<![=-])>(?!=)|<(?!=))/);
    if (m) {
      const next = [...lines];
      next[at] = lines[at].replace(m[0], FLIP[m[0]]);
      out.push({ name: `연산자 ${m[0]} → ${FLIP[m[0]]}`, code: next.join('\n') });
    }
  }
  const v = partValue(p);
  if (v !== undefined && Number.isInteger(v)) {
    // 그 줄의 숫자나, 상수를 정한 줄의 숫자를 바꾼다
    const re = new RegExp(`\\b${v}\\b`);
    let i = re.test(lines[at]) ? at : lines.findIndex((l) => new RegExp(`\\b(?:const|let|var)\\s+\\w+\\s*=\\s*${v}\\b`).test(l));
    if (i >= 0) {
      const next = [...lines];
      next[i] = lines[i].replace(re, String(v * 2 + 3));
      out.push({ name: `숫자 ${v} → ${v * 2 + 3}`, code: next.join('\n') });
    }
  }
  return out;
}

let verified = 0;
let caught = 0;
let total = 0;
let falseVerified = 0;
for (const rule of RULES) {
  const files = Object.fromEntries(rule.files.map((f) => [f, readFileSync(join(root, rule.repo, f), 'utf8').replace(/\r\n/g, '\n')]));
  const r = run(rule, files);
  const s = r.summaries[0];
  const { b, p } = judged(r);
  console.log(`\n[${rule.repo}] ${rule.req}\n  원본: ${s.overall}${p ? ` · ${p.left} ${p.op} ${p.lit ?? p.ref} (${p.source}, ${p.line}행)` : ''}${s.notes.length ? ` · ${s.notes.join(' / ')}` : ''}`);
  if (s.overall === '확인됨') verified++;
  if (!p || !b) continue;
  const main = rule.files[0];
  for (const m of mutants(files[main], p)) {
    const got = run(rule, { ...files, [main]: m.code }).summaries[0].overall;
    total++;
    if (got === '다름') caught++;
    if (got === '확인됨') falseVerified++;
    console.log(`  ${got === '다름' ? '잡음' : '놓침'}: ${m.name} → ${got}`);
  }
}
console.log(`\n규칙 ${RULES.length}개 · 원본 확인됨 ${verified} · 바꾼 코드 ${total}개 중 잡음 ${caught} · 틀린데 확인됨 ${falseVerified}`);

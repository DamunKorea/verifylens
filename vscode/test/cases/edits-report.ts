// 「바뀐 검사」 사례를 돌려 표로 본다: node test/cases/edits-report.ts [--set2] [--src <엔진 src 폴더>]
// --src 로 예전 판(비교 사본)의 엔진을 줄 수 있다. 처음 결과를 적을 때 쓴다.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { EDITS, type EditCase } from './edits.ts';

const argv = process.argv.slice(2);
const srcAt = argv.indexOf('--src');
const src = srcAt >= 0 ? resolve(argv[srcAt + 1]) : resolve(import.meta.dirname, '../../../src');
const engine = await import(pathToFileURL(resolve(src, 'engine.ts')).href);
const reqs = await import(pathToFileURL(resolve(src, 'requirements.ts')).href);
const set2 = argv.includes('--set2');
const set3 = argv.includes('--set3');
const cases: EditCase[] = set3 ? (await import('./edits3.ts')).EDITS3 : set2 ? (await import('./edits2.ts')).EDITS2 : EDITS;

export function runEditCase(c: EditCase) {
  const files: Record<string, string> = { [c.file]: c.code };
  if (c.after !== null) files[c.testFile] = c.after;
  const baseFiles: Record<string, string> = { [c.file]: c.code };
  if (c.before !== null) baseFiles[c.testFile] = c.before;
  for (const m of c.more ?? []) {
    if (m.after !== null) files[m.file] = m.after;
    if (m.before !== null) baseFiles[m.file] = m.before;
  }
  const set = engine.analyzeFiles({ key: 'A', ref: 'case', sha: 'case', files, tests: c.tests, baseFiles });
  const report = engine.evaluate([set], reqs.parseRequirements(`- R1: ${c.req} | keywords: ${c.keywords}`), '.', 'main');
  const edits: { kind: string; values: { from: string; to: string }[]; fewerChecks: number }[] = report.sets[0].perReq.R1.edits ?? [];
  return { edits, overall: report.summaries[0].overall as string };
}

let ok = 0;
let caught = 0;
let should = 0;
let falseFlag = 0;
for (const c of cases) {
  const { edits, overall } = runEditCase(c);
  const e = edits[0];
  const values = (e?.values ?? []).map((v) => `${v.from} → ${v.to}`);
  const susp = edits.some((x) => x.kind !== 'changed' || x.values.length > 0 || x.fewerChecks > 0);
  const want = c.expect;
  const good =
    (want.kind === null ? edits.length === 0 : e?.kind === want.kind) &&
    (!want.values || want.values.every((v) => values.includes(v))) &&
    (want.fewer === undefined || e?.fewerChecks === want.fewer) &&
    susp === want.suspicious;
  if (want.suspicious) should++;
  if (want.suspicious && susp) caught++;
  if (!want.suspicious && susp) falseFlag++;
  if (good) ok++;
  const got = edits.length ? edits.map((x) => `${x.kind}${x.values.length ? ` ${x.values.map((v) => `${v.from}→${v.to}`).join(',')}` : ''}${x.fewerChecks ? ` -${x.fewerChecks}` : ''}`).join(' / ') : '없음';
  console.log(`${good ? 'ok ' : 'XX '} ${c.id} (${c.area}) — 기대 ${want.kind ?? '없음'}${want.values ? ` ${want.values.join(',')}` : ''}, 결과 ${got} · 판정 ${overall}`);
}
console.log(JSON.stringify({ set: set3 ? 'EDITS3' : set2 ? 'EDITS2' : 'EDITS', src, total: cases.length, matched: ok, suspiciousCaught: caught, suspiciousTotal: should, falseFlag }));

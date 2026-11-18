// 사례별 결과를 표로 본다: node test/cases/report.ts [--auto] [--all]
import { CASES, HOLDOUT, HOLDOUT2, allRows, score } from './run.ts';

const auto = process.argv.includes('--auto');
const all = process.argv.includes('--all');
const hold = process.argv.includes('--holdout');
const hold2 = process.argv.includes('--holdout2');
const rows = allRows(!auto, hold2 ? HOLDOUT2 : hold ? HOLDOUT : CASES);
for (const r of rows) {
  if (!all && r.got === r.v.expect) continue;
  console.log(`${r.got === r.v.expect ? 'ok ' : 'XX '} ${r.c.id} / ${r.v.name}: 기대 ${r.v.expect}, 결과 ${r.got}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(hold2 ? '[세 번째 사례]' : hold ? '[새 사례]' : '[기본 사례]', auto ? '(키워드 없이)' : '(키워드 있음)', JSON.stringify(score(rows)));

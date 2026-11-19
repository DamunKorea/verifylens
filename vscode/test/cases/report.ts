// 사례별 결과를 표로 본다: node test/cases/report.ts [--auto] [--all]
import { CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, allRows, score } from './run.ts';

const auto = process.argv.includes('--auto');
const all = process.argv.includes('--all');
const hold = process.argv.includes('--holdout');
const hold2 = process.argv.includes('--holdout2');
const hold3 = process.argv.includes('--holdout3');
const hold4 = process.argv.includes('--holdout4');
const hold5 = process.argv.includes('--holdout5');
const hold6 = process.argv.includes('--holdout6');
const hold7 = process.argv.includes('--holdout7');
const hold8 = process.argv.includes('--holdout8');
const rows = allRows(!auto, hold8 ? HOLDOUT8 : hold7 ? HOLDOUT7 : hold6 ? HOLDOUT6 : hold5 ? HOLDOUT5 : hold4 ? HOLDOUT4 : hold3 ? HOLDOUT3 : hold2 ? HOLDOUT2 : hold ? HOLDOUT : CASES);
for (const r of rows) {
  if (!all && r.got === r.v.expect) continue;
  console.log(`${r.got === r.v.expect ? 'ok ' : 'XX '} ${r.c.id} / ${r.v.name}: 기대 ${r.v.expect}, 결과 ${r.got}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(hold8 ? '[아홉 번째 사례 · 계정]' : hold7 ? '[여덟 번째 사례 · 가입]' : hold6 ? '[일곱 번째 사례]' : hold5 ? '[여섯 번째 사례]' : hold4 ? '[다섯 번째 사례]' : hold3 ? '[네 번째 사례]' : hold2 ? '[세 번째 사례]' : hold ? '[새 사례]' : '[기본 사례]', auto ? '(키워드 없이)' : '(키워드 있음)', JSON.stringify(score(rows)));

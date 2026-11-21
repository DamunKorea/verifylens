// 사례별 결과를 표로 본다: node test/cases/report.ts [--auto] [--all]
import { CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, HOLDOUT14, HOLDOUT15, HOLDOUT16, HOLDOUT17, HOLDOUT18, HOLDOUT19, HOLDOUT20, HOLDOUT21, HOLDOUT22, HOLDOUT23, HOLDOUT24, HOLDOUT25, HOLDOUT26, HOLDOUT27, HOLDOUT28, allRows, score } from './run.ts';

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
const hold9 = process.argv.includes('--holdout9');
const hold10 = process.argv.includes('--holdout10');
const hold11 = process.argv.includes('--holdout11');
const hold12 = process.argv.includes('--holdout12');
const hold13 = process.argv.includes('--holdout13');
const hold14 = process.argv.includes('--holdout14');
const hold15 = process.argv.includes('--holdout15');
const hold16 = process.argv.includes('--holdout16');
const hold17 = process.argv.includes('--holdout17');
const hold18 = process.argv.includes('--holdout18');
const hold19 = process.argv.includes('--holdout19');
const hold20 = process.argv.includes('--holdout20');
const hold21 = process.argv.includes('--holdout21');
const hold22 = process.argv.includes('--holdout22');
const hold23 = process.argv.includes('--holdout23');
const hold24 = process.argv.includes('--holdout24');
const hold25 = process.argv.includes('--holdout25');
const hold26 = process.argv.includes('--holdout26');
const hold27 = process.argv.includes('--holdout27');
const hold28 = process.argv.includes('--holdout28');
const rows = allRows(!auto, hold28 ? HOLDOUT28 : hold27 ? HOLDOUT27 : hold26 ? HOLDOUT26 : hold25 ? HOLDOUT25 : hold24 ? HOLDOUT24 : hold23 ? HOLDOUT23 : hold22 ? HOLDOUT22 : hold21 ? HOLDOUT21 : hold20 ? HOLDOUT20 : hold19 ? HOLDOUT19 : hold18 ? HOLDOUT18 : hold17 ? HOLDOUT17 : hold16 ? HOLDOUT16 : hold15 ? HOLDOUT15 : hold14 ? HOLDOUT14 : hold13 ? HOLDOUT13 : hold12 ? HOLDOUT12 : hold11 ? HOLDOUT11 : hold10 ? HOLDOUT10 : hold9 ? HOLDOUT9 : hold8 ? HOLDOUT8 : hold7 ? HOLDOUT7 : hold6 ? HOLDOUT6 : hold5 ? HOLDOUT5 : hold4 ? HOLDOUT4 : hold3 ? HOLDOUT3 : hold2 ? HOLDOUT2 : hold ? HOLDOUT : CASES);
for (const r of rows) {
  if (!all && r.got === r.v.expect) continue;
  console.log(`${r.got === r.v.expect ? 'ok ' : 'XX '} ${r.c.id} / ${r.v.name}: 기대 ${r.v.expect}, 결과 ${r.got}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(hold28 ? '[스물아홉 번째 사례 · 검사의 주인 고친 뒤 처음]' : hold27 ? '[스물여덟 번째 사례 · 같은 파일 고친 뒤 처음]' : hold26 ? '[스물일곱 번째 사례 · 같은 파일 다른 기능]' : hold25 ? '[스물여섯 번째 사례 · 다시 고친 뒤 처음]' : hold24 ? '[스물다섯 번째 사례 · 고친 뒤 처음]' : hold23 ? '[스물네 번째 사례 · 데코레이터 · 중복 · 시간 창]' : hold22 ? '[스물세 번째 사례 · 모두 고친 뒤]' : hold21 ? '[스물두 번째 사례 · 고친 뒤]' : hold20 ? '[스물한 번째 사례 · 스키마 · 중복 · 정액]' : hold19 ? '[스무 번째 사례 · X 버그 뒤]' : hold18 ? '[열아홉 번째 사례 · X 버그]' : hold17 ? '[열여덟 번째 사례]' : hold16 ? '[열일곱 번째 사례]' : hold15 ? '[열여섯 번째 사례]' : hold14 ? '[열다섯 번째 사례]' : hold13 ? '[열네 번째 사례]' : hold12 ? '[열세 번째 사례]' : hold11 ? '[열두 번째 사례]' : hold10 ? '[열한 번째 사례]' : hold9 ? '[열 번째 사례 · 시간 · 업무]' : hold8 ? '[아홉 번째 사례 · 계정]' : hold7 ? '[여덟 번째 사례 · 가입]' : hold6 ? '[일곱 번째 사례]' : hold5 ? '[여섯 번째 사례]' : hold4 ? '[다섯 번째 사례]' : hold3 ? '[네 번째 사례]' : hold2 ? '[세 번째 사례]' : hold ? '[새 사례]' : '[기본 사례]', auto ? '(키워드 없이)' : '(키워드 있음)', JSON.stringify(score(rows)));

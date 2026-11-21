// 사례 묶음을 엔진에 돌린다. git 없이 파일 내용만으로 결과를 만든다.
import { analyzeFiles, evaluate } from '../../../src/engine.ts';
import { parseRequirements } from '../../../src/requirements.ts';
import { CASES, type Case, type Variant } from './corpus.ts';
import { HOLDOUT } from './holdout.ts';
import { HOLDOUT2 } from './holdout2.ts';
import { HOLDOUT3 } from './holdout3.ts';
import { HOLDOUT4 } from './holdout4.ts';
import { HOLDOUT5 } from './holdout5.ts';
import { HOLDOUT6 } from './holdout6.ts';
import { HOLDOUT7 } from './holdout7.ts';
import { HOLDOUT8 } from './holdout8.ts';
import { HOLDOUT9 } from './holdout9.ts';
import { HOLDOUT10 } from './holdout10.ts';
import { HOLDOUT11 } from './holdout11.ts';
import { HOLDOUT12 } from './holdout12.ts';
import { HOLDOUT13 } from './holdout13.ts';
import { HOLDOUT14 } from './holdout14.ts';
import { HOLDOUT15 } from './holdout15.ts';
import { HOLDOUT16 } from './holdout16.ts';
import { HOLDOUT17 } from './holdout17.ts';
import { HOLDOUT18 } from './holdout18.ts';
import { HOLDOUT19 } from './holdout19.ts';
import { HOLDOUT20 } from './holdout20.ts';
import { HOLDOUT21 } from './holdout21.ts';
import { HOLDOUT22 } from './holdout22.ts';

export type Row = { c: Case; v: Variant; got: string; note: string };

export function runVariant(c: Case, v: Variant, withKeywords = true): { got: string; note: string } {
  const file = c.file ?? 'src/feature.ts';
  const files: Record<string, string> = { [file]: v.code, ...(v.extra ?? {}) };
  const set = analyzeFiles({ key: 'A', ref: 'case', sha: 'case', files, tests: [{ name: c.test, status: 'pass', message: '' }] });
  const line = withKeywords ? `- R1: ${c.req} | keywords: ${c.keywords}` : `- R1: ${c.req}`;
  const report = evaluate([set], parseRequirements(line), '.', 'main');
  const s = report.summaries[0];
  return { got: s.overall, note: s.notes.join(' / ') };
}

export const allRows = (withKeywords = true, cases: Case[] = CASES): Row[] => cases.flatMap((c) => c.variants.map((v) => ({ c, v, ...runVariant(c, v, withKeywords) })));
export { CASES, HOLDOUT, HOLDOUT2, HOLDOUT3, HOLDOUT4, HOLDOUT5, HOLDOUT6, HOLDOUT7, HOLDOUT8, HOLDOUT9, HOLDOUT10, HOLDOUT11, HOLDOUT12, HOLDOUT13, HOLDOUT14, HOLDOUT15, HOLDOUT16, HOLDOUT17, HOLDOUT18, HOLDOUT19, HOLDOUT20, HOLDOUT21, HOLDOUT22 };

export function score(rows: Row[]) {
  const bads = rows.filter((r) => r.v.expect === '다름');
  const goods = rows.filter((r) => r.v.expect === '확인됨');
  return {
    total: rows.length,
    matched: rows.filter((r) => r.got === r.v.expect).length,
    badCaught: bads.filter((r) => r.got === '다름').length,
    badTotal: bads.length,
    /** 틀렸거나 확정할 수 없는 코드를 「확인됨」이라고 한 것. 가장 나쁜 실수다. */
    falseVerified: rows.filter((r) => r.v.expect !== '확인됨' && r.got === '확인됨').length,
    goodVerified: goods.filter((r) => r.got === '확인됨').length,
    goodTotal: goods.length,
    /** 맞는 코드를 「다름」이라고 한 것 */
    falseAlarm: rows.filter((r) => r.v.expect !== '다름' && r.got === '다름').length,
  };
}

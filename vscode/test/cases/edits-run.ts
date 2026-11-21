// 「바뀐 검사」 사례 하나를 지금 엔진으로 돌린다 (시험에서 쓴다. 예전 판과 견줄 때는 edits-report.ts --src)
import { analyzeFiles, evaluate } from '../../../src/engine.ts';
import { parseRequirements } from '../../../src/requirements.ts';
import type { TestEdit } from '../../../src/types.ts';
import type { EditCase } from './edits.ts';

export function runEditCase(c: EditCase): { edits: TestEdit[]; overall: string } {
  const files: Record<string, string> = { [c.file]: c.code };
  if (c.after !== null) files[c.testFile] = c.after;
  const baseFiles: Record<string, string> = { [c.file]: c.code };
  if (c.before !== null) baseFiles[c.testFile] = c.before;
  for (const m of c.more ?? []) {
    if (m.after !== null) files[m.file] = m.after;
    if (m.before !== null) baseFiles[m.file] = m.before;
  }
  const set = analyzeFiles({ key: 'A', ref: 'case', sha: 'case', files, tests: c.tests, baseFiles });
  const report = evaluate([set], parseRequirements(`- R1: ${c.req} | keywords: ${c.keywords}`), '.', 'main');
  return { edits: report.sets[0].perReq.R1.edits ?? [], overall: report.summaries[0].overall };
}

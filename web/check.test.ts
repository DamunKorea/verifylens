// 해 보기 페이지의 예제가 확장과 같은 판정을 내는지 본다. 판정이 바뀌면 페이지 설명도 다시 봐야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFileName, normalizeRequirements, runCheck } from './check.ts';
import { EXAMPLES } from './examples.ts';

const verdicts = (id: string, lang: 'en' | 'ko') => {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  return runCheck({ requirements: ex.requirements[lang], fileName: ex.fileName, code: ex.code, tests: ex.tests[lang], lang }).rows.map((r) => r.overall);
};

test('examples give the same verdicts in both languages', () => {
  for (const lang of ['en', 'ko'] as const) {
    assert.deepEqual(verdicts('login', lang), ['다름', '확인됨']);
    assert.deepEqual(verdicts('shipping', lang), ['다름']);
    assert.deepEqual(verdicts('upload', lang), ['다름']);
    assert.deepEqual(verdicts('signup', lang), ['확인됨', '확인됨']);
  }
});

test('fixing the code in the page changes the verdict', () => {
  const ex = EXAMPLES[0];
  const r = runCheck({ requirements: ex.requirements.en, fileName: ex.fileName, code: ex.code.replace('failures > 5', 'failures >= 5'), tests: ex.tests.en, lang: 'en' });
  assert.deepEqual(r.rows.map((x) => x.overall), ['확인됨', '확인됨']);
  assert.ok(r.notes.some((n) => n.line === 10 && n.reqId === 'R1'));
});

test('plain lines become numbered requirements, and odd file names still get analyzed', () => {
  assert.deepEqual(normalizeRequirements('# note\nOrders over 10 ship free\n\n- R5: Age at least 14\n2. Retry at most 3 times'), [
    '- R1: Orders over 10 ship free',
    '- R5: Age at least 14',
    '- R6: Retry at most 3 times',
  ]);
  assert.equal(codeFileName(''), 'src/feature.ts');
  assert.equal(codeFileName('auth'), 'auth.ts');
  assert.equal(codeFileName('lib/a.js'), 'lib/a.js');
});

test('no requirement, no rows', () => {
  assert.equal(runCheck({ requirements: '\n# only a comment\n', fileName: 'a.ts', code: 'export const a = 1;', tests: [], lang: 'en' }).rows.length, 0);
});

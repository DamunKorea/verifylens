// 여러 업무 영역의 사례 묶음. 틀린 코드를 「확인됨」이라고 하거나, 맞는 코드를 「다름」이라고 하면 실패한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, HOLDOUT, HOLDOUT2, allRows, score } from './cases/run.ts';
import { numbersIn, parseConstraints } from '../../src/numeric.ts';
import { analyzeFile } from '../../src/analyze.ts';

const wrong = (rows: ReturnType<typeof allRows>) => rows.filter((r) => r.got !== r.v.expect).map((r) => `${r.c.id} / ${r.v.name}: 기대 ${r.v.expect}, 결과 ${r.got}`);

test('cases with keywords: every verdict is the expected one', () => {
  assert.deepEqual(wrong(allRows(true, CASES)), []);
});

test('unseen cases with keywords: every verdict is the expected one', () => {
  assert.deepEqual(wrong(allRows(true, HOLDOUT)), []);
  assert.deepEqual(wrong(allRows(true, HOLDOUT2)), []);
});

test('without keywords nothing wrong is called verified, and nothing right is called different', () => {
  for (const cases of [CASES, HOLDOUT, HOLDOUT2]) {
    const s = score(allRows(false, cases));
    assert.equal(s.falseVerified, 0);
    assert.equal(s.falseAlarm, 0);
  }
});

test('numbers in requirements are read the way people write them', () => {
  assert.deepEqual(numbersIn('주문 금액이 50,000원 이상'), [50000]);
  assert.deepEqual(numbersIn('5만 원 이상'), [50000]);
  assert.deepEqual(numbersIn('비밀번호를 다섯 번 틀리면'), [5]);
  assert.deepEqual(numbersIn('fails three times'), [3]);
  const rel = (s: string) => parseConstraints(s).map((c) => `${c.value}:${c.rel}`);
  assert.deepEqual(rel('14세 미만'), ['14:lt']);
  assert.deepEqual(rel('8자 이상이어야 한다'), ['8:gte']);
  assert.deepEqual(rel('최대 20개까지'), ['20:lte']);
  assert.deepEqual(rel('10개 초과'), ['10:gt']);
  assert.deepEqual(rel('no more than 5 files'), ['5:lte']);
  assert.deepEqual(rel('more than 5 files'), ['5:gt']);
  assert.deepEqual(rel('연속 5회 실패하면'), ['5:count']);
  assert.deepEqual(rel('1개 이상 10개 이하'), ['1:gte', '10:lte']);
  assert.deepEqual(rel('최소 주문 금액은 10,000원이다'), ['10000:gte']);
  assert.deepEqual(rel('가입 후 30일이 넘으면'), ['30:gt']);
  assert.deepEqual(rel('한 번에 최대 20건까지'), ['20:lte']);
});

test('numbers that are not conditions are not treated as requirements on the code', () => {
  assert.deepEqual(parseConstraints('HTTP 400을 돌려준다'), []);
  assert.deepEqual(parseConstraints('2단계 인증을 켠 사용자'), []);
  assert.deepEqual(parseConstraints('OAuth 2.0 로그인'), []);
});

test('constants are read through arithmetic, objects and readonly fields, but not from changing fields', () => {
  const a = analyzeFile('a.ts', 'const MIN = 60;\nconst MS = MIN * 1000;\nconst L = { a: { b: 7 } } as const;\nclass C { readonly r = 3; n = 0; static s = 4; }\n', null);
  assert.equal(a.constants.MS, 60000);
  assert.equal(a.constants['L.a.b'], 7);
  assert.equal(a.constants['this.r'], 3);
  assert.equal(a.constants['C.s'], 4);
  assert.equal(a.constants['this.n'], undefined);
});

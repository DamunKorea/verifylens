// 화면 글의 언어. 엔진 안의 값(상태 이름 등)은 한국어 그대로 두고, 보여 줄 때만 바꾼다.
// 그래야 저장된 판단 · 시험 · 다른 에디터 판이 쓰는 값이 언어에 따라 달라지지 않는다.
import type { Overall, TestStatus } from './types.ts';

export type Lang = 'ko' | 'en';

let cur: Lang = 'ko';
export const setLang = (l: Lang): void => {
  cur = l;
};
export const getLang = (): Lang => cur;
export const isEn = (): boolean => cur === 'en';

/** 지금 언어의 글을 고른다. */
export const L = (ko: string, en: string): string => (cur === 'en' ? en : ko);

/** 「ko」「en」 말고 다른 값(auto 등)이면 locale 을 보고 정한다: 한국어 화면이면 ko, 아니면 en. */
export function resolveLang(setting: string | undefined, locale: string | undefined): Lang {
  if (setting === 'ko' || setting === 'en') return setting;
  return (locale ?? '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

const OVERALL: Record<Overall, string> = { 확인됨: 'Verified', 다름: 'Different', 실패: 'Failed', 미확인: 'Not verified' };
const TEST: Record<TestStatus, string> = { 통과: 'passed', 실패: 'failed', 미실행: 'not run' };
const EVIDENCE: Record<string, string> = { 발견: 'found', '일부 발견': 'partly found', 미발견: 'not found' };
const RELATION: Record<string, string> = { 일치: 'same', 불일치: 'differ', '비교 조건 다름': 'not comparable', '단일 결과': 'single result' };
const JUDGE: Record<string, string> = { 사용: 'Use', 수정: 'Fix', '추가 검증': 'Verify more', 보류: 'Hold', 미검토: 'Not reviewed' };

/** 요구사항의 상태 (확인됨 · 다름 · 실패 · 미확인) */
export const wOverall = (s: string): string => (cur === 'en' ? (OVERALL[s as Overall] ?? s) : s);
/** 검사 결과 (통과 · 실패 · 미실행) */
export const wTest = (s: string): string => (cur === 'en' ? (TEST[s as TestStatus] ?? s) : s);
/** 구현 근거 (발견 · 일부 발견 · 미발견) */
export const wEvidence = (s: string): string => (cur === 'en' ? (EVIDENCE[s] ?? s) : s);
/** 두 결과의 관계 (일치 · 불일치 …) */
export const wRelation = (s: string): string => (cur === 'en' ? (RELATION[s] ?? s) : s);
/** 사람의 판단 (사용 · 수정 · 추가 검증 · 보류 · 미검토) */
export const wJudge = (s: string): string => (cur === 'en' ? (JUDGE[s] ?? s) : s);
export const JUDGE_LABELS = (): Record<string, string> => Object.fromEntries(Object.keys(JUDGE).map((k) => [k, wJudge(k)]));

/** 「검사 통과」 처럼 검사 결과를 짧게 말한다. */
export const testPhrase = (s: string): string => (cur === 'en' ? (s === '통과' ? 'tests pass' : s === '실패' ? 'a test fails' : 'no test run') : `검사 ${s}`);

/**
 * 검사 결과를 짧게, 이어진 검사가 있는지까지: 결과가 없으면 이어진 검사가 있을 때 「검사 안 돌림」, 없을 때 「검사 없음」.
 * 0.23.0 에서 미확인 이유를 둘로 나눴는데 코드 줄 표시 · 리포트는 「검사 미실행」 하나로 남아 있었다 (국내 홍보 세션이 체험 페이지에서 찾음, 11/23)
 */
type TestView = { testStatus: string; tests: readonly unknown[]; noResults?: boolean };
/** 결과가 없는 까닭: 이어졌지만 안 돌림 · 결과가 오래되어 버림 · 결과가 하나도 없음 · 이어진 검사 없음 (0.25.2: 오래되거나 없는 결과를 「검사 없음」이라 하던 것 — JetBrains 세션이 찾음) */
const missingTest = (rr: TestView, stale?: boolean): 'not-run' | 'stale' | 'no-results' | 'no-test' =>
  rr.tests.length ? 'not-run' : stale ? 'stale' : rr.noResults ? 'no-results' : 'no-test';
export const testPhraseFor = (rr: TestView, stale?: boolean): string => {
  if (rr.testStatus !== '미실행') return testPhrase(rr.testStatus);
  const k = missingTest(rr, stale);
  return k === 'not-run' ? L('검사 안 돌림', 'test not run') : k === 'stale' ? L('검사 오래됨', 'tests out of date') : k === 'no-results' ? L('검사 결과 없음', 'no test results') : L('검사 없음', 'no test');
};
/** 표 칸에 쓰는 한 낱말 (통과 · 실패 · 안 돌림 · 오래됨 · 결과 없음 · 없음) */
export const testCell = (rr: TestView, stale?: boolean): string => {
  if (rr.testStatus !== '미실행') return wTest(rr.testStatus);
  const k = missingTest(rr, stale);
  return k === 'not-run' ? L('안 돌림', 'not run') : k === 'stale' ? L('오래됨', 'out of date') : k === 'no-results' ? L('결과 없음', 'no results') : L('없음', 'none');
};

/** 결과 이름: 결과 A / Result A */
export const setLabel = (key: string): string => (cur === 'en' ? `Result ${key}` : `결과 ${key}`);

/** 여러 이름을 한 줄로: 한국어는 가운뎃점, 영어는 and */
export const joinNames = (xs: string[]): string => (cur === 'en' ? xs.join(' and ') : xs.join('·'));

/** 5 → 5th (영어 서수) */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

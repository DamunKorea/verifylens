import type { Report, ReqSummary, ResultSet } from './types.ts';
import { L, joinNames, testPhraseFor, wEvidence, wOverall, wRelation } from './i18n.ts';
import { boundaryLine, checkWord, undecidedAction, type UndecidedKind } from './numeric.ts';

const where = (s: ResultSet, id: string) => {
  const u = s.perReq[id].evidence.unit;
  return u ? L(`${u.file} ${u.startLine}행`, `${u.file} line ${u.startLine}`) : L('찾지 못함', 'not found');
};

export function counts(report: Report) {
  const c = { 확인됨: 0, 다름: 0, 미확인: 0, 실패: 0 };
  for (const s of report.summaries) c[s.overall] += 1;
  return c;
}

/**
 * 사람이 얼마나 봐야 하는지. 결과를 다 읽지 않아도 되게 나눈다 (OKKY 의견: 「결국 제가 확인하는 게 늦어짐」).
 * fix = 다름 · 실패, look = 미확인 중 코드나 문장을 봐야 하는 것(끝값 애매 · 다른 조건 · 근거 없음 등),
 * tests = 미확인이지만 검사가 없거나 오래된 것뿐, ok = 확인됨.
 */
export type Attention = 'fix' | 'look' | 'tests' | 'ok';
const TEST_ONLY: UndecidedKind[] = ['no-test', 'not-run', 'no-results', 'stale'];
export function attention(report: Report, s: ReqSummary): Attention {
  if (s.overall === '다름' || s.overall === '실패') return 'fix';
  if (s.overall === '확인됨') return 'ok';
  return undecidedReasons(report, s).every((k) => TEST_ONLY.includes(k)) ? 'tests' : 'look';
}

/** 「미확인」인 까닭을 종류로 돌려준다. 판단을 막은 것부터 앞에 둔다. 「미확인」이 아니면 빈 목록이다. */
export function undecidedReasons(report: Report, s: ReqSummary): UndecidedKind[] {
  if (s.overall !== '미확인') return [];
  const out = new Set<UndecidedKind>();
  for (const set of report.sets) {
    const rr = set.perReq[s.req.id];
    if (rr.evidence.status === '미발견') out.add('no-evidence');
    if (rr.evidence.noWindow) out.add('no-window');
    if (rr.evidence.unchecked) out.add('unchecked-input');
    else if (rr.evidence.stateUnread) out.add('state-unread');
    else if (rr.evidence.status === '일부 발견' && !rr.evidence.boundaries?.length) out.add('no-check');
    for (const b of rr.evidence.boundaries ?? []) if (b.ok === null) out.add(b.why && b.why !== 'inverted' ? b.why : 'missing');
    if (rr.evidence.caveat) out.add('extra-condition');
  }
  // 근거가 아예 없으면 「코드에 숫자 없음」은 같은 말이다
  if (out.has('no-evidence')) out.delete('missing');
  const untested = report.sets.some((x) => x.perReq[s.req.id].testStatus === '미실행');
  // 이어진 검사는 있는데 결과가 없으면(건너뜀 · 체험 페이지는 돌리지 않음) 「검사 없음」이 아니라 「돌리지 않음」이다
  const notRun = untested && report.sets.every((x) => x.perReq[s.req.id].testStatus !== '미실행' || x.perReq[s.req.id].tests.length > 0);
  // 테스트 결과가 하나도 없으면 「검사 없음」이 아니라 「검사 결과 없음」 (검사 파일은 있어도 리포트를 안 만들었을 수 있다)
  const noResults = report.sets.every((x) => x.tests.length === 0);
  const testKind: UndecidedKind = notRun ? 'not-run' : noResults ? 'no-results' : 'no-test';
  if (!out.size) out.add(report.testsStale ? 'stale' : testKind);
  else if (untested) out.add(testKind);
  return [...out];
}

export function nextAction(s: ReqSummary, report: Report): string {
  if (s.overall === '다름') {
    const bad = report.sets.filter((x) => x.perReq[s.req.id].evidence.boundary?.ok === false || x.perReq[s.req.id].testStatus === '실패');
    const who = bad.length ? joinNames(bad.map((x) => x.label)) : L('다른 쪽', 'the other side');
    // 검사가 통과했는데도 계산한 동작 시점이 다르면, 조건만이 아니라 검사도 요구사항과 맞는지 봐야 한다.
    const passOff = bad.find((x) => x.perReq[s.req.id].testStatus === '통과' && x.perReq[s.req.id].evidence.boundary?.ok === false);
    if (passOff) {
      const b = passOff.perReq[s.req.id].evidence.boundary;
      return L(
        `${who}의 조건과 검사를 함께 확인한다. 검사가 요구사항과 같은 ${checkWord(b, 'ko')}을 보도록 고친 뒤 조건을 수정하고 다시 검사한다.`.replace('횟수을', '횟수를'),
        `Check both the condition and the test in ${who}. Make the test exercise the same ${checkWord(b, 'en')} as the requirement, then fix the condition and run the tests again.`,
      );
    }
    return L(`${who}의 조건을 확인·수정한 뒤 같은 기준으로 다시 검사한다.`, `Check and fix the condition in ${who}, then run the same tests again.`);
  }
  if (s.overall === '실패') return L('실패한 검사의 원인을 확인한다.', 'Find out why the test fails.');
  if (s.overall === '미확인') {
    const reasons = undecidedReasons(report, s);
    if (reasons.length) return reasons.slice(0, 2).map((k) => undecidedAction(k)).join(' ');
    const open = report.sets.some((x) => x.perReq[s.req.id].evidence.boundaries?.some((b) => b.ok === null) || x.perReq[s.req.id].evidence.caveat);
    if (open) return L('위 주의 사항을 코드와 요구사항에서 직접 확인하고, 필요하면 요구사항 문장을 더 분명하게 고친다.', 'Check the note above in the code and the requirement, and make the requirement wording more precise if needed.');
    return L('관련 검사를 추가하거나 실행해 구현 근거를 확인한다.', 'Add or run a test for this requirement to confirm the behavior.');
  }
  return L('확인된 근거를 리포트에 남기고 사람이 판단한다.', 'Keep the evidence in the report; the decision is yours.');
}

/** 시각화와 같은 사실을 글로만 정리한 요약. 「글 요약 vs 시각화」 비교에 쓴다. */
export function renderSummaryMd(report: Report): string {
  const c = counts(report);
  const out: string[] = [];
  out.push(L('# VerifyLens 검증 요약 (규칙 기반 분석, AI 추정 없음)', '# VerifyLens verification summary (rule-based analysis, no AI inference)'));
  out.push('');
  out.push(L(`- 기준: \`${report.base}\``, `- Base: \`${report.base}\``));
  for (const s of report.sets) out.push(L(`- ${s.label}: \`${s.ref}\` (${s.sha}) · 검사 ${s.tests.length}개`, `- ${s.label}: \`${s.ref}\` (${s.sha}) · ${s.tests.length} test(s)`));
  out.push(`- ${L('요약', 'Summary')}: ${(['확인됨', '다름', '실패', '미확인'] as const).map((k) => `${wOverall(k)} ${c[k]}`).join(' · ')}`);
  out.push('');
  for (const s of report.summaries) {
    out.push(`## ${s.req.id} ${s.req.text} — ${wOverall(s.overall)}`);
    if (report.sets.length === 2) out.push(`- ${L('결과 비교', 'A vs B')}: ${wRelation(s.relation.kind)}${s.relation.detail ? ` (${s.relation.detail})` : ''}`);
    for (const set of report.sets) {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      const parts = [L(`${set.label}: 구현 근거 ${rr.evidence.status}`, `${set.label}: evidence ${wEvidence(rr.evidence.status)}`)];
      if (u) parts.push(`\`${u.cond?.expr ?? u.text}\` (${where(set, s.req.id)}${u.kind === 'function' ? L(', 함수 전체 단위 — 세부 조건은 사람이 확인', ', whole function — check the exact condition yourself') : ''})`);
      const b = rr.evidence.boundary;
      for (const x of rr.evidence.boundaries ?? []) parts.push(boundaryLine(x));
      // 검사는 통과했는데 계산한 동작 시점이 요구사항과 다르면, 그 어긋남을 그대로 적는다.
      parts.push(
        rr.testStatus === '통과' && b?.ok === false
          ? L(`검사는 통과 (검사가 요구사항과 같은 ${checkWord(b, 'ko')}을 확인하는지 볼 것)`.replace('횟수을', '횟수를'), `but the test passes (check that the test exercises the same ${checkWord(b, 'en')} as the requirement)`)
          : testPhraseFor(rr, report.testsStale),
      );
      const fail = rr.tests.find((t) => t.status === 'fail');
      if (fail) parts.push(`${L('실패 이유', 'failure')}: ${fail.message || fail.name}`);
      out.push('- ' + parts.join(' · '));
    }
    for (const n of s.notes) out.push(`- ${L('주의', 'Note')}: ${n}`);
    out.push(`- ${L('다음 행동', 'Next step')}: ${nextAction(s, report)}`);
    out.push('');
  }
  // 「미확인」 판정 수와 헷갈리지 않게, 이 절이 실제로 담는 것(돌리지 않은 검사 · 못 찾은 근거)을 이름으로 쓴다
  out.push(L('## 검사를 돌리지 않았거나 근거를 못 찾은 곳', '## Tests not run or evidence not found'));
  let any = false;
  for (const s of report.summaries) {
    const missing = report.sets.filter((x) => x.perReq[s.req.id].testStatus === '미실행' || x.perReq[s.req.id].evidence.status === '미발견');
    if (missing.length) {
      any = true;
      out.push(`- ${s.req.id}: ${missing.map((x) => `${x.label} (${x.perReq[s.req.id].evidence.status === '미발견' ? L('구현 근거 없음', 'no evidence found') : testPhraseFor(x.perReq[s.req.id], report.testsStale)})`).join(', ')}`);
    }
  }
  for (const set of report.sets) {
    for (const d of set.dyn) {
      any = true;
      out.push(L(`- ${set.label}: 해석하지 못한 호출 ${d.file} ${d.line}행 \`${d.text}\` (동적 호출 — 영향 범위를 정적 분석으로 알 수 없음)`, `- ${set.label}: unresolved call ${d.file} line ${d.line} \`${d.text}\` (dynamic call — static analysis cannot tell what it affects)`));
    }
  }
  if (!any) out.push(L('- 없음', '- none'));
  out.push('');
  out.push(L('> 이 요약은 코드 구조와 검사 결과에서만 만든 사실이다. 사람이 근거를 보고 판단한다.', '> This summary is built only from the code structure and the test results. You read the evidence and decide.'));
  return out.join('\n') + '\n';
}

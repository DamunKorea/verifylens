import type { Report, ReqSummary, ResultSet } from './types.ts';
import { L, joinNames, wEvidence, wOverall, wRelation, wTest } from './i18n.ts';

const where = (s: ResultSet, id: string) => {
  const u = s.perReq[id].evidence.unit;
  return u ? L(`${u.file} ${u.startLine}행`, `${u.file} line ${u.startLine}`) : L('찾지 못함', 'not found');
};

export function counts(report: Report) {
  const c = { 확인됨: 0, 다름: 0, 미확인: 0, 실패: 0 };
  for (const s of report.summaries) c[s.overall] += 1;
  return c;
}

export function nextAction(s: ReqSummary, report: Report): string {
  if (s.overall === '다름') {
    const bad = report.sets.filter((x) => x.perReq[s.req.id].evidence.boundary?.ok === false || x.perReq[s.req.id].testStatus === '실패');
    const who = bad.length ? joinNames(bad.map((x) => x.label)) : L('다른 쪽', 'the other side');
    // 검사가 통과했는데도 계산한 동작 시점이 다르면, 조건만이 아니라 검사도 요구사항과 맞는지 봐야 한다.
    const passOff = bad.some((x) => x.perReq[s.req.id].testStatus === '통과' && x.perReq[s.req.id].evidence.boundary?.ok === false);
    if (passOff)
      return L(
        `${who}의 조건과 검사를 함께 확인한다. 검사가 요구사항과 같은 횟수를 보도록 고친 뒤 조건을 수정하고 다시 검사한다.`,
        `Check both the condition and the test in ${who}. Make the test exercise the same count as the requirement, then fix the condition and run the tests again.`,
      );
    return L(`${who}의 조건을 확인·수정한 뒤 같은 기준으로 다시 검사한다.`, `Check and fix the condition in ${who}, then run the same tests again.`);
  }
  if (s.overall === '실패') return L('실패한 검사의 원인을 확인한다.', 'Find out why the test fails.');
  if (s.overall === '미확인') return L('관련 검사를 추가하거나 실행해 구현 근거를 확인한다.', 'Add or run a test for this requirement to confirm the behavior.');
  return L('확인된 근거를 리포트에 남기고 사람이 판단한다.', 'Keep the evidence in the report; the decision is yours.');
}

/** 시각화와 같은 사실을 글로만 정리한 요약. 「글 요약 vs 시각화」 비교에 쓴다. */
export function renderSummaryMd(report: Report): string {
  const c = counts(report);
  const out: string[] = [];
  out.push(L('# VerifyLens 검증 요약 (프로토타입 v0 · 규칙 기반 분석, AI 추정 없음)', '# VerifyLens verification summary (preview · rule-based analysis, no AI inference)'));
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
      if (b && b.attempts !== null) parts.push(L(`${b.attempts}번째 시도에서 동작${b.ok === false ? ` ← 요구사항은 ${b.required}회` : ''}`, `acts on attempt ${b.attempts}${b.ok === false ? ` ← the requirement says ${b.required}` : ''}`));
      // 검사는 통과했는데 계산한 동작 시점이 요구사항과 다르면, 그 어긋남을 그대로 적는다.
      parts.push(
        rr.testStatus === '통과' && b?.ok === false
          ? L('검사는 통과 (검사가 요구사항과 같은 횟수를 확인하는지 볼 것)', 'but the test passes (check that the test exercises the same count as the requirement)')
          : L(`검사 ${rr.testStatus}`, `tests ${wTest(rr.testStatus)}`),
      );
      const fail = rr.tests.find((t) => t.status === 'fail');
      if (fail) parts.push(`${L('실패 이유', 'failure')}: ${fail.message || fail.name}`);
      out.push('- ' + parts.join(' · '));
    }
    for (const n of s.notes) out.push(`- ${L('주의', 'Note')}: ${n}`);
    out.push(`- ${L('다음 행동', 'Next step')}: ${nextAction(s, report)}`);
    out.push('');
  }
  out.push(L('## 미확인 범위', '## Not verified'));
  let any = false;
  for (const s of report.summaries) {
    const missing = report.sets.filter((x) => x.perReq[s.req.id].testStatus === '미실행' || x.perReq[s.req.id].evidence.status === '미발견');
    if (missing.length) {
      any = true;
      out.push(`- ${s.req.id}: ${missing.map((x) => `${x.label} (${x.perReq[s.req.id].evidence.status === '미발견' ? L('구현 근거 없음', 'no evidence found') : L('검사 미실행', 'no test run')})`).join(', ')}`);
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

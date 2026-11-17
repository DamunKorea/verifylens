import type { Report, ReqSummary, ResultSet } from './types.ts';

const where = (s: ResultSet, id: string) => {
  const u = s.perReq[id].evidence.unit;
  return u ? `${u.file} ${u.startLine}행` : '찾지 못함';
};

export function counts(report: Report) {
  const c = { 확인됨: 0, 다름: 0, 미확인: 0, 실패: 0 };
  for (const s of report.summaries) c[s.overall] += 1;
  return c;
}

export function nextAction(s: ReqSummary, report: Report): string {
  if (s.overall === '다름') {
    const bad = report.sets.filter((x) => x.perReq[s.req.id].evidence.boundary?.ok === false || x.perReq[s.req.id].testStatus === '실패');
    const who = bad.length ? bad.map((x) => x.label).join('·') : '다른 쪽';
    // 검사가 통과했는데도 계산한 동작 시점이 다르면, 조건만이 아니라 검사도 요구사항과 맞는지 봐야 한다.
    const passOff = bad.some((x) => x.perReq[s.req.id].testStatus === '통과' && x.perReq[s.req.id].evidence.boundary?.ok === false);
    if (passOff) return `${who}의 조건과 검사를 함께 확인한다. 검사가 요구사항과 같은 횟수를 보도록 고친 뒤 조건을 수정하고 다시 검사한다.`;
    return `${who}의 조건을 확인·수정한 뒤 같은 기준으로 다시 검사한다.`;
  }
  if (s.overall === '실패') return '실패한 검사의 원인을 확인한다.';
  if (s.overall === '미확인') return '관련 검사를 추가하거나 실행해 구현 근거를 확인한다.';
  return '확인된 근거를 리포트에 남기고 사람이 판단한다.';
}

/** 시각화와 같은 사실을 글로만 정리한 요약. 「글 요약 vs 시각화」 비교에 쓴다. */
export function renderSummaryMd(report: Report): string {
  const c = counts(report);
  const out: string[] = [];
  out.push('# VerifyLens 검증 요약 (프로토타입 v0 · 규칙 기반 분석, AI 추정 없음)');
  out.push('');
  out.push(`- 기준: \`${report.base}\``);
  for (const s of report.sets) out.push(`- ${s.label}: \`${s.ref}\` (${s.sha}) · 검사 ${s.tests.length}개`);
  out.push(`- 요약: 확인됨 ${c.확인됨} · 다름 ${c.다름} · 실패 ${c.실패} · 미확인 ${c.미확인}`);
  out.push('');
  for (const s of report.summaries) {
    out.push(`## ${s.req.id} ${s.req.text} — ${s.overall}`);
    if (report.sets.length === 2) out.push(`- 결과 비교: ${s.relation.kind}${s.relation.detail ? ` (${s.relation.detail})` : ''}`);
    for (const set of report.sets) {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      const parts = [`${set.label}: 구현 근거 ${rr.evidence.status}`];
      if (u) parts.push(`\`${u.cond?.expr ?? u.text}\` (${where(set, s.req.id)}${u.kind === 'function' ? ', 함수 전체 단위 — 세부 조건은 사람이 확인' : ''})`);
      const b = rr.evidence.boundary;
      if (b && b.attempts !== null) parts.push(`${b.attempts}번째 시도에서 동작${b.ok === false ? ` ← 요구사항은 ${b.required}회` : ''}`);
      // 검사는 통과했는데 계산한 동작 시점이 요구사항과 다르면, 그 어긋남을 그대로 적는다.
      parts.push(rr.testStatus === '통과' && b?.ok === false ? '검사는 통과 (검사가 요구사항과 같은 횟수를 확인하는지 볼 것)' : `검사 ${rr.testStatus}`);
      const fail = rr.tests.find((t) => t.status === 'fail');
      if (fail) parts.push(`실패 이유: ${fail.message || fail.name}`);
      out.push('- ' + parts.join(' · '));
    }
    for (const n of s.notes) out.push(`- 주의: ${n}`);
    out.push(`- 다음 행동: ${nextAction(s, report)}`);
    out.push('');
  }
  out.push('## 미확인 범위');
  let any = false;
  for (const s of report.summaries) {
    const missing = report.sets.filter((x) => x.perReq[s.req.id].testStatus === '미실행' || x.perReq[s.req.id].evidence.status === '미발견');
    if (missing.length) {
      any = true;
      out.push(`- ${s.req.id}: ${missing.map((x) => `${x.label} (${x.perReq[s.req.id].evidence.status === '미발견' ? '구현 근거 없음' : '검사 미실행'})`).join(', ')}`);
    }
  }
  for (const set of report.sets) {
    for (const d of set.dyn) {
      any = true;
      out.push(`- ${set.label}: 해석하지 못한 호출 ${d.file} ${d.line}행 \`${d.text}\` (동적 호출 — 영향 범위를 정적 분석으로 알 수 없음)`);
    }
  }
  if (!any) out.push('- 없음');
  out.push('');
  out.push('> 이 요약은 코드 구조와 검사 결과에서만 만든 사실이다. 사람이 근거를 보고 판단한다.');
  return out.join('\n') + '\n';
}

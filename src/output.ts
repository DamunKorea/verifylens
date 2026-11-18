import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Evidence, FlowGraph, Report, ReqSummary, ResultSet } from './types.ts';
import { diffFlow, renderFlowSvg } from './flowsvg.ts';
import { renderChain } from './chain.ts';
import { counts, nextAction, renderSummaryMd } from './summary.ts';
import { extractFromPrBody } from './requirements.ts';
import { renderConcept } from './concept.ts';
import { ID, esc, hl, hlMark } from './view.ts';
import { JUDGE_LABELS, L, getLang, joinNames, wEvidence, wJudge, wOverall, wRelation, wTest } from './i18n.ts';
import { boundaryLine, boundaryShort, checkWord } from './numeric.ts';

// ---------------------------------------------------------------- 작은 조각
const cls = (o: string) => (o === '확인됨' ? 'ok' : o === '다름' ? 'diff' : o === '실패' ? 'fail' : 'unk');
const pill = (o: string) => `<span class="pill ${cls(o)}">${wOverall(o)}</span>`;
const evCls = (s: string) => (s === '발견' ? 'ok' : s === '일부 발견' ? 'diff' : 'unk');
const tsCls = (s: string) => (s === '통과' ? 'ok' : s === '실패' ? 'fail' : 'unk');
const idDot = (k: 'A' | 'B') => `<i class="idd" style="background:${ID[k]}"></i>`;

function headline(report: Report, s: ReqSummary): string {
  const id = s.req.id;
  const sets = report.sets;
  const bad = sets.filter((x) => x.perReq[id].evidence.boundary?.ok === false);
  const failed = sets.filter((x) => x.perReq[id].testStatus === '실패');
  const labels = (xs: ResultSet[]) => joinNames(xs.map((x) => x.label));
  if (s.overall === '다름') {
    const parts: string[] = [];
    for (const x of bad) {
      const b = x.perReq[id].evidence.boundary!;
      const u = x.perReq[id].evidence.unit!;
      parts.push(
        b.attempts !== null
          ? L(
              `${x.label}의 조건 <code>${esc(u.cond?.expr ?? '')}</code>은 <b>${b.attempts}번째 시도</b>에서 동작해 요구사항(${b.required}회)과 다릅니다.`,
              `The condition <code>${esc(u.cond?.expr ?? '')}</code> in ${x.label} acts on <b>attempt ${b.attempts}</b>, which differs from the requirement (${b.required}).`,
            )
          : L(`${x.label}의 조건 <code>${esc(u.cond?.expr ?? '')}</code>: <b>${esc(boundaryLine(b))}</b>.`, `The condition <code>${esc(u.cond?.expr ?? '')}</code> in ${x.label}: <b>${esc(boundaryLine(b))}</b>.`),
      );
    }
    if (!bad.length && s.relation.kind === '불일치') parts.push(L(`두 결과의 조건이 다릅니다 (${esc(s.relation.detail)}).`, `The two results use different conditions (${esc(s.relation.detail)}).`));
    if (failed.length) parts.push(L(`${labels(failed)}에서 연결된 검사가 실패해 이 차이를 뒷받침합니다.`, `A linked test fails in ${labels(failed)}, which supports this difference.`));
    const passOff = bad.filter((x) => x.perReq[id].testStatus === '통과');
    if (passOff.length) {
      const pb = passOff[0].perReq[id].evidence.boundary;
      parts.push(
        L(
          `그런데 ${labels(passOff)}에서 연결된 검사는 <b>통과</b>했습니다. 검사가 요구사항과 같은 ${checkWord(pb, 'ko')}을 확인하는지 검사 코드를 보세요.`.replace('횟수을', '횟수를'),
          `Yet the linked test <b>passes</b> in ${labels(passOff)}. Check in the test code that it exercises the same ${checkWord(pb, 'en')} as the requirement.`,
        ),
      );
    }
    return parts.join(' ');
  }
  if (s.overall === '실패') return L(`${labels(failed)}에서 연결된 검사가 실패했습니다. 실패 이유부터 확인하세요.`, `A linked test fails in ${labels(failed)}. Start with the failure message.`);
  if (s.overall === '미확인') {
    const open = sets.flatMap((x) => (x.perReq[id].evidence.boundaries ?? []).filter((b) => b.ok === null).map((b) => `${sets.length > 1 ? `${x.label}: ` : ''}${boundaryLine(b)}`));
    if (open.length) return L(`숫자 조건을 확정하지 못했습니다. ${esc(open.join(' / '))}`, `The numeric condition could not be confirmed. ${esc(open.join(' / '))}`);
    const noEv = sets.filter((x) => x.perReq[id].evidence.status === '미발견');
    if (noEv.length) return L(`${labels(noEv)}에서 구현 근거를 찾지 못했습니다. 코드 위치를 사람이 직접 확인해야 합니다.`, `No implementation evidence was found in ${labels(noEv)}. Someone has to locate the code by hand.`);
    return L(
      '관련 코드는 찾았지만 <b>연결된 검사가 없어</b> 실제 동작을 확인하지 못했습니다. 근거가 있다고 안심하지 마세요.',
      'Related code was found, but <b>no test is linked</b>, so the actual behavior is not confirmed. Finding the code is not the same as verifying it.',
    );
  }
  const broad = sets.some((x) => x.perReq[id].evidence.unit?.kind === 'function');
  return L(
    `모든 결과에서 구현 근거를 찾았고 연결된 검사가 통과했습니다.${broad ? ' 다만 근거가 <b>함수 전체 단위</b>라 세부 조건은 사람이 확인해야 합니다.' : ''}`,
    `Implementation evidence was found in every result and the linked tests pass.${broad ? ' The evidence is a <b>whole function</b>, though, so check the exact condition yourself.' : ''}`,
  );
}

// ---------------------------------------------------------------- 한눈에 보기 표
function matrixCell(set: ResultSet, id: string): string {
  const rr = set.perReq[id];
  const e = rr.evidence;
  const u = e.unit;
  const loc = u ? ` <code>${esc(u.file.split('/').pop()!)}:${u.startLine}</code>${u.kind === 'function' ? `<em>${L('함수 전체', 'whole function')}</em>` : ''}` : '';
  const b = e.boundary ? ` <span class="bd ${e.boundary.ok ? 'ok' : e.boundary.ok === null ? 'unk' : 'diff'}">${esc(e.boundary.attempts !== null ? L(`${e.boundary.attempts}회째 동작`, `acts on attempt ${e.boundary.attempts}`) : boundaryShort(e.boundary))}</span>` : '';
  return `<div class="mc"><div><span class="mk ${evCls(e.status)}"></span>${L(`근거 ${e.status}`, `evidence ${wEvidence(e.status)}`)}${loc}</div><div><span class="mk ${tsCls(rr.testStatus)}"></span>${L(`검사 ${rr.testStatus}`, `tests ${wTest(rr.testStatus)}`)}${b}</div></div>`;
}

function overview(report: Report): string {
  const c = counts(report);
  const two = report.sets.length === 2;
  const head = `<tr><th>${L('요구사항', 'Requirement')}</th>${report.sets.map((s) => `<th>${idDot(s.key)}${s.label}<small>${esc(s.ref)} · ${s.sha}</small></th>`).join('')}${two ? '<th>A·B</th>' : ''}<th>${L('상태', 'Status')}</th><th>${L('사람의 판단', 'Your decision')}</th></tr>`;
  const rows = report.summaries
    .map((s) => `<tr class="row" data-req="${s.req.id}"><td class="rq"><b>${s.req.id}</b>${esc(s.req.text)}</td>${report.sets.map((set) => `<td>${matrixCell(set, s.req.id)}</td>`).join('')}${two ? `<td><span class="rel ${s.relation.kind === '일치' ? 'same' : 'diffs'}">${wRelation(s.relation.kind)}</span></td>` : ''}<td>${pill(s.overall)}</td><td class="jc" data-jcell="${s.req.id}">${wJudge('미검토')}</td></tr>`)
    .join('');
  const unc: string[] = [];
  for (const s of report.summaries) {
    const miss = report.sets.filter((x) => x.perReq[s.req.id].testStatus === '미실행' || x.perReq[s.req.id].evidence.status === '미발견');
    if (miss.length) unc.push(`<span><b>${s.req.id}</b> ${miss.map((x) => `${x.key} ${x.perReq[s.req.id].evidence.status === '미발견' ? L('근거 없음', 'no evidence') : L('검사 미실행', 'no test run')}`).join(' · ')}</span>`);
  }
  for (const set of report.sets) for (const d of set.dyn) unc.push(`<span><b>${set.key}</b> ${L('해석하지 못한 호출', 'unresolved call')} <code>${esc(d.file.split('/').pop()!)}:${d.line}</code> <code>${esc(d.text)}</code></span>`);
  return `<section class="ov"><div class="ovh"><h2>${L('요구사항별 검증 상태', 'Verification status by requirement')}</h2><div class="cnt"><span class="ok">${wOverall('확인됨')} <b>${c.확인됨}</b></span><span class="diff">${wOverall('다름')} <b>${c.다름}</b></span><span class="fail">${wOverall('실패')} <b>${c.실패}</b></span><span class="unk">${wOverall('미확인')} <b>${c.미확인}</b></span></div><div class="hint">${L('행을 누르면 아래에 근거가 열립니다', 'Click a row to see its evidence below')}</div></div>
<table class="mx"><thead>${head}</thead><tbody>${rows}</tbody></table>
<div class="unc"><b>${L('미확인 범위', 'Not verified')}</b>${unc.join('') || `<span>${L('없음', 'none')}</span>`}</div></section>`;
}

// ---------------------------------------------------------------- 코드 비교
function codePane(set: ResultSet, ev: Evidence, mark: boolean): string {
  const head = `<div class="ph">${idDot(set.key)}<b>${set.label}</b><span class="sub">${esc(set.ref)} · ${set.sha}</span></div>`;
  const u = ev.unit;
  if (!u) return `<div class="pane">${head}<div class="empty">${L('이 결과에서 구현 근거를 찾지 못했습니다.', 'No implementation evidence was found in this result.')}</div></div>`;
  const src = (set.files[u.file] ?? '').split('\n');
  const long = u.kind === 'function' && u.endLine - u.startLine > 12;
  const from = Math.max(1, u.startLine - (u.kind === 'condition' ? 3 : 0));
  const to = long ? u.startLine + 11 : Math.min(src.length, u.endLine + (u.kind === 'condition' ? 3 : 0));
  const rows: string[] = [];
  for (let n = from; n <= Math.min(to, from + 30); n++) {
    const hit = u.kind === 'condition' && n >= u.startLine && n <= u.endLine;
    const html = hit && n === u.startLine ? hlMark(src[n - 1] ?? '', u.cond?.expr, mark ? u.cond?.op : undefined) : hl(src[n - 1] ?? '');
    rows.push(`<div class="cl${hit ? ' hit' : ''}"><span class="ln">${n}</span><span class="tx">${html}</span></div>`);
  }
  if (long) rows.push(`<div class="cl"><span class="ln"></span><span class="tx c">${L('… 함수의 나머지는 생략 (근거가 함수 전체 단위)', '… rest of the function omitted (the evidence is the whole function)')}</span></div>`);
  return `<div class="pane">${head}<div class="loc">${esc(u.file)}:${u.startLine}${u.kind === 'condition' && u.endLine > u.startLine ? '–' + u.endLine : ''}</div><div class="code">${rows.join('')}</div></div>`;
}

// ---------------------------------------------------------------- 시도 횟수 타임라인
function timeline(report: Report, id: string): string {
  const rows = report.sets.map((s) => ({ set: s, b: s.perReq[id].evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return '';
  const req = rows[0].b!.required;
  let chk: number | null = null;
  let chkName = '';
  for (const s of report.sets)
    for (const t of s.perReq[id].tests) {
      const m = t.name.match(/\b(\d+)(?:st|nd|rd|th)?\b/);
      if (m && chk === null) {
        chk = Number(m[1]);
        chkName = t.name;
      }
    }
  const N = Math.max(7, req + 2, ...rows.map((r) => r.b!.attempts! + 1));
  const lock = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0B1423" stroke-width="2.6" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2" fill="#0B1423" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  let head = '<div class="tr"><div class="tl"></div><div class="tcs">';
  for (let n = 1; n <= N; n++) head += `<span class="th${n === req ? ' on' : ''}${n === chk ? ' chk' : ''}">${L(`${n}회`, `${n}`)}${n === chk ? `<i>${L('검사', 'test')}</i>` : ''}</span>`;
  head += '</div></div>';
  const reqRow = (() => {
    let cells = '';
    for (let n = 1; n <= N; n++) cells += `<span class="tc${n >= req ? ' lk req' : ''}">${n >= req ? lock : n}</span>`;
    return `<div class="tr"><div class="tl"><b>${L('요구사항', 'Requirement')}</b><small>${L(`${req}번째에서 잠금`, `locks on attempt ${req}`)}</small></div><div class="tcs">${cells}</div></div>`;
  })();
  const resRows = rows
    .map((r) => {
      const at = r.b!.attempts!;
      const good = at === req;
      const ts = r.set.perReq[id].testStatus;
      let cells = '';
      for (let n = 1; n <= N; n++) {
        const locked = n >= at;
        const miss = !good && n === req && at > req;
        const mark = n === chk ? `<i class="tk ${ts === '통과' ? 'ok' : ts === '실패' ? 'no' : 'na'}">${ts === '통과' ? '✓' : ts === '실패' ? '✗' : '?'}</i>` : '';
        cells += `<span class="tc${locked ? ` lk ${good ? 'good' : 'off'}` : ''}${miss ? ' miss' : ''}">${miss ? '×' : locked ? lock : n}${mark}</span>`;
      }
      return `<div class="tr"><div class="tl"><b>${idDot(r.set.key)}${r.set.label}</b><small>${esc(r.set.perReq[id].evidence.unit?.cond?.expr ?? '')}</small></div><div class="tcs">${cells}</div></div>`;
    })
    .join('');
  const before = rows.every((r) => r.b!.before === true);
  const offSets = rows.filter((r) => r.set.perReq[id].testStatus === '통과' && r.b!.ok === false);
  const offNote = offSets.length
    ? L(
        ` ${offSets.map((r) => r.set.label).join('·')}는 계산으로는 ${offSets.map((r) => r.b!.attempts).join('·')}번째에 동작하는데도 검사가 통과했습니다. 검사가 실제로 몇 번째 시도를 보는지 확인하세요.`,
        ` By the computed condition, ${joinNames(offSets.map((r) => r.set.label))} acts on attempt ${offSets.map((r) => r.b!.attempts).join(' / ')}, yet its test passes. Check which attempt the test actually looks at.`,
      )
    : '';
  const marks = report.sets.map((s) => `${s.key} ${wTest(s.perReq[id].testStatus)}`).join(' · ');
  const cap =
    chk !== null
      ? L(`「${esc(chkName)}」 검사는 이름으로 보면 ${chk}번째 시도 뒤의 잠금을 확인합니다 — ${marks}.${offNote}`, `Going by its name, the test "${esc(chkName)}" checks the lock after attempt ${chk} — ${marks}.${offNote}`)
      : L('이 조건을 직접 확인하는 검사가 연결되지 않았습니다.', 'No test that checks this condition directly is linked.');
  const order = before ? L(' 카운터를 올린 뒤 비교하는 코드로 읽었습니다.', ' Read as code that increments the counter before comparing.') : L(' 카운터 증가 순서는 코드에서 확인하세요.', ' Check in the code whether the counter is incremented before the comparison.');
  return `<div class="card"><h4>${L('시도 횟수별 잠금 시점', 'When it locks, attempt by attempt')} <span class="mini">${L('조건 값에서 계산한 사실', 'computed from the condition')}</span></h4><div class="tline">${head}${reqRow}${resRows}</div><div class="cap">${cap}${order}</div><div class="lg"><span><i class="sw" style="background:#4285E8"></i>${L('요구사항', 'requirement')}</span><span><i class="sw" style="background:#34D399"></i>${L('요구사항과 같은 시점', 'same attempt as the requirement')}</span><span><i class="sw" style="background:#FBBF24"></i>${L('다른 시점', 'a different attempt')}</span><span><i class="sw miss"></i>${L('잠겨야 하는데 안 잠김', 'should be locked, but is not')}</span></div></div>`;
}

// ---------------------------------------------------------------- 흐름 지도
function pickFlow(set: ResultSet, ev: Evidence): FlowGraph | null {
  const u = ev.unit;
  if (!u) return null;
  let best: FlowGraph | null = null;
  for (const a of set.analyses) {
    if (a.file !== u.file) continue;
    for (const f of a.flows) if (u.startLine >= f.startLine && u.startLine <= f.endLine && (!best || f.endLine - f.startLine < best.endLine - best.startLine)) best = f;
  }
  return best;
}

function flowCard(report: Report, id: string): string {
  const flows = report.sets.map((set) => ({ set, g: pickFlow(set, set.perReq[id].evidence) }));
  const avail = flows.filter((x) => x.g);
  if (!avail.length) return `<div class="card"><h4>${L('코드 흐름 지도', 'Code flow map')}</h4><div class="empty">${L('근거가 있는 함수를 찾지 못했습니다.', 'No function with evidence was found.')}</div></div>`;
  const tabs = avail.length > 1 ? `<div class="ftabs">${avail.map((x, i) => `<button class="ftab${i === 0 ? ' on' : ''}" data-set="${x.set.key}">${idDot(x.set.key)}${x.set.label}</button>`).join('')}</div>` : '';
  const boxes = avail
    .map((x, i) => {
      const other = avail.find((o) => o.set !== x.set && o.g!.fn === x.g!.fn);
      const onlyHere = other ? diffFlow(x.g!, other.g!) : undefined;
      const u = x.set.perReq[id].evidence.unit!;
      const svg = renderFlowSvg(x.g!, { hi: u.kind === 'condition' ? { start: u.startLine, end: u.endLine } : null, onlyHere, onlyKey: x.set.key, idColor: ID[x.set.key] });
      return `<div class="flowbox" data-set="${x.set.key}"${i === 0 ? '' : ' hidden'}><div class="fnn">${esc(x.g!.fn)}() · ${esc(x.g!.file)}</div>${svg}</div>`;
    })
    .join('');
  return `<div class="card"><h4>${L('코드 흐름 지도', 'Code flow map')} <span class="mini">${L('시작 → 변경된 조건 경로를 강조', 'path from the start to the changed condition is highlighted')}</span></h4>${tabs}${boxes}<div class="lg"><span><i class="sw" style="background:#FBBF24"></i>${L('이 요구사항의 조건', "this requirement's condition")}</span><span><i class="sw line"></i>${L('시작부터 조건까지의 경로', 'path from the start to the condition')}</span><span><i class="sw dash"></i>${L('다른 결과에는 없는 문장이 든 단계', 'step with statements the other result lacks')}</span><span><i class="sw dim"></i>${L('흐린 단계는 이 요구사항과 무관', 'dimmed steps are unrelated to this requirement')}</span></div></div>`;
}

// ---------------------------------------------------------------- 요구사항 상세
function detail(report: Report, s: ReqSummary): string {
  const id = s.req.id;
  const mark = s.relation.kind === '불일치' || report.sets.some((x) => x.perReq[id].evidence.boundary?.ok === false);
  const panes = report.sets.map((set) => codePane(set, set.perReq[id].evidence, mark)).join('');
  const tests = report.sets
    .map((set) => {
      const rr = set.perReq[id];
      if (!rr.tests.length) return `<tr><td>${idDot(set.key)}${set.label}</td><td colspan="2" class="mute">${L('연결된 검사가 없습니다 → 미실행', 'No linked test → not run')}</td></tr>`;
      return rr.tests.map((t) => `<tr><td>${idDot(set.key)}${set.label}</td><td>${esc(t.name)}</td><td><span class="pill ${t.status === 'pass' ? 'ok' : t.status === 'fail' ? 'fail' : 'unk'}">${t.status === 'pass' ? L('통과', 'passed') : t.status === 'fail' ? L('실패', 'failed') : L('건너뜀', 'skipped')}</span>${t.message ? `<div class="msg">${esc(t.message)}</div>` : ''}</td></tr>`).join('');
    })
    .join('');
  const why = report.sets
    .map((set, i) => {
      const e = set.perReq[id].evidence;
      return `<div class="ev"><span class="eid">E${i + 1}</span><span>${idDot(set.key)}<b>${set.label}</b> ${e.unit ? `<code>${esc(e.unit.file)}:${e.unit.startLine}</code> · ${e.unit.kind === 'function' ? L('함수 전체 단위', 'whole function') : L('조건 단위', 'single condition')}` : L('근거 없음', 'no evidence')}<br><small>${esc(e.why.join(' · ') || L('일치하는 단어·숫자 없음', 'no matching words or numbers'))} · ${L('점수', 'score')} ${e.score}</small></span></div>`;
    })
    .join('');
  const opts = ['미검토', '사용', '수정', '추가 검증', '보류'].map((v) => `<option value="${v}">${wJudge(v)}</option>`).join('');
  const judge = `<div class="card judge" data-req="${id}"><h4>${L('사람의 판단', 'Your decision')} <span class="mini">${L('근거를 보고 직접 정합니다', 'you decide from the evidence')}</span></h4><div class="jrow"><select>${opts}</select></div><textarea rows="3" placeholder="${L('이유나 남은 확인 사항', 'Reason, or what is left to check')}"></textarea></div>`;
  return `<section class="det" data-req="${id}" hidden>
<div class="dh"><span class="rid">${id}</span><h2>${esc(s.req.text)}</h2>${pill(s.overall)}</div>
<p class="lead">${headline(report, s)} <span class="next">${L('다음 행동', 'Next step')} · ${esc(nextAction(s, report))}</span></p>
<div class="card"><h4>${L('근거 사슬', 'Evidence chain')} <span class="mini">${L('요구사항 → 코드 근거 → 검사 → 동작 시점 → 사람의 판단', 'requirement → code evidence → tests → when it acts → your decision')}</span></h4>${renderChain(report, s)}</div>
<div class="g2"><div>
<div class="card"><h4>${L('코드 비교', 'Code comparison')} <span class="mini">${mark ? L('다른 부분을 표시', 'differences are marked') : L('근거가 된 코드', 'the code used as evidence')}</span></h4><div class="panes">${panes}</div></div>
<div class="card"><h4>${L('검사 결과', 'Test results')} <span class="mini">${L('실행된 검사 보고서(JUnit)에서 읽음', 'read from the executed test report (JUnit)')}</span></h4><table class="tt"><tbody>${tests}</tbody></table></div>
<div class="card"><h4>${L('연결 근거', 'Why this code')} <span class="mini">${L('왜 이 코드를 근거로 골랐는가', 'why this code was picked as evidence')}</span></h4>${why}</div>
${judge}
</div><div>
${timeline(report, id)}${flowCard(report, id)}
</div></div></section>`;
}

// ---------------------------------------------------------------- 글 요약
function mdToHtml(md: string): string {
  const out: string[] = [];
  let list = false;
  const close = () => {
    if (list) {
      out.push('</ul>');
      list = false;
    }
  };
  const inline = (t: string) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      close();
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith('# ')) {
      close();
      out.push(`<h2>${inline(line.slice(2))}</h2>`);
    } else if (line.startsWith('- ')) {
      if (!list) {
        out.push('<ul>');
        list = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.startsWith('> ')) {
      close();
      out.push(`<p class="q">${inline(line.slice(2))}</p>`);
    } else if (!line.trim()) close();
    else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join('');
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A1220;color:#C9D5E8;font:13px/1.55 'Pretendard Variable','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;padding-bottom:52px}
code,.cl,.loc{font-family:'Cascadia Mono',Consolas,monospace}
code{font-size:12px;color:#BFD3F2;background:#14223A;padding:0 5px;border-radius:4px}
.top{position:sticky;top:0;z-index:5;height:54px;display:flex;align-items:center;gap:12px;padding:0 22px;background:#07101C;border-bottom:1px solid #1C2B46}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px;color:#fff;letter-spacing:-.02em}.logo span{color:#8DB5F4}
.top .meta{color:#7D8FAB;font-size:12px}.sp{flex:1}
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:12px;border:1px solid #2A4372;color:#9DB7E0;font-size:11.5px;font-weight:700;white-space:nowrap}
.badge.g{border-color:rgba(52,211,153,.5);color:#6EE7B7}
.vt{display:flex;border:1px solid #27406B;border-radius:8px;overflow:hidden}.vt button{background:transparent;border:0;color:#9DAEC8;padding:5px 14px;font:inherit;cursor:pointer}.vt button.on{background:#16294A;color:#fff;font-weight:700}
.wrap{max-width:1560px;margin:0 auto;padding:18px 22px 24px}
.idd{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}
.pill{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:11px;font-size:11.5px;font-weight:800;white-space:nowrap}
.pill.ok{background:rgba(52,211,153,.15);color:#6EE7B7}.pill.diff{background:rgba(251,191,36,.16);color:#FCD34D}.pill.fail{background:rgba(248,113,113,.16);color:#FCA5A5}.pill.unk{background:rgba(148,163,184,.16);color:#CBD5E1}
.ov{border:1px solid #1C2B46;border-radius:12px;background:#0C1628;padding:14px 16px 12px;margin-bottom:18px}
.ovh{display:flex;align-items:center;gap:18px;margin-bottom:10px}.ovh h2{font-size:15px;color:#fff}
.cnt{display:flex;gap:14px;font-size:12.5px}.cnt b{font-size:15px;margin-left:3px}.cnt .ok b{color:#6EE7B7}.cnt .diff b{color:#FCD34D}.cnt .fail b{color:#FCA5A5}.cnt .unk b{color:#CBD5E1}
.hint{margin-left:auto;color:#6B7D9A;font-size:12px}
table.mx{width:100%;border-collapse:separate;border-spacing:0}
.mx th{text-align:left;font-size:11.5px;color:#7D8FAB;font-weight:700;padding:8px 12px;border-bottom:1px solid #1C2B46}.mx th small{display:block;font-weight:500;color:#5E7091;font-family:'Cascadia Mono',Consolas,monospace;font-size:10.5px}
.mx td{padding:10px 12px;border-bottom:1px solid #14223A;vertical-align:middle}
.mx tr.row{cursor:pointer}.mx tr.row:hover td{background:#0F1D35}.mx tr.row.on td{background:#11223F}.mx tr.row.on td:first-child{box-shadow:inset 3px 0 #4285E8}
.mx .rq{color:#E6EDF8;font-weight:600;max-width:340px}.mx .rq b{color:#8DB5F4;margin-right:8px}
.mc{display:flex;flex-direction:column;gap:3px;font-size:12px}.mc em{font-style:normal;color:#FCD34D;font-size:10.5px;margin-left:6px;border:1px solid rgba(251,191,36,.45);border-radius:8px;padding:0 6px}
.mk{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.mk.ok{background:#34D399}.mk.diff{background:#FBBF24}.mk.fail{background:#F87171}.mk.unk{background:#64748B}
.bd{font-size:11px;font-weight:700;margin-left:6px}.bd.ok{color:#6EE7B7}.bd.diff{color:#FCD34D}.bd.unk{color:#CBD5E1}
.rel{font-size:12px;font-weight:700}.rel.same{color:#6EE7B7}.rel.diffs{color:#FCD34D}
.jc{color:#7D8FAB;font-size:12px}.jc.done{color:#E6EDF8;font-weight:700}
.unc{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:12px;color:#AEBBD0}.unc>b{color:#7D8FAB}
.det{margin-bottom:18px}
.dh{display:flex;align-items:center;gap:12px;margin:4px 0 8px}.dh h2{font-size:19px;color:#fff;letter-spacing:-.01em}.rid{font-weight:800;color:#8DB5F4;font-size:17px}
.lead{font-size:14px;line-height:1.75;color:#E6EDF8;background:#0E1A2E;border:1px solid #1C2B46;border-left:4px solid #4285E8;border-radius:10px;padding:11px 16px;margin-bottom:14px}
.lead code{font-size:12.5px}.next{display:block;color:#9DB7E0;font-size:12.5px;margin-top:3px}
.card{border:1px solid #1C2B46;border-radius:12px;background:#0C1628;padding:13px 15px;margin-bottom:14px}
.card h4{font-size:11.5px;letter-spacing:.04em;color:#8A9BB8;font-weight:800;margin-bottom:10px;display:flex;gap:8px;align-items:center}.mini{margin-left:auto;font-weight:500;letter-spacing:0;color:#5E7091}
svg.chain{display:block}.ct{font-size:11px;font-weight:700;fill:#8A9BB8}.cl2{font-size:13px;fill:#EAF0F8;font-weight:600}.cm{font-size:13px;fill:#EAF0F8;font-weight:700;font-family:'Cascadia Mono',Consolas,monospace}.cs{font-size:11px;fill:#8A9BB8}.cb{font-size:11px;font-weight:800;fill:#07101C}.cp{font-size:11px;font-weight:800}.ck{font-size:11.5px;fill:#9DB7E0;font-family:'Cascadia Mono',Consolas,monospace}
.g2{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:16px}
@media (max-width:1280px){.g2{grid-template-columns:1fr}.hint{display:none}}
.panes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.pane{border:1px solid #1C2B46;border-radius:10px;background:#0A1424;overflow:hidden}
.ph{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#0F1B30;border-bottom:1px solid #1C2B46;font-size:12px;color:#E6EDF8}.ph .sub{margin-left:auto;color:#5E7091;font-family:'Cascadia Mono',Consolas,monospace;font-size:10.5px}
.loc{padding:6px 12px 2px;color:#5E7091;font-size:11px}
.code{padding:4px 0 8px;overflow:auto}
.cl{display:flex;min-height:21px;line-height:21px;font-size:12px}.cl .ln{width:40px;flex:none;text-align:right;padding-right:12px;color:#3F5070}.cl .tx{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:10px;padding-left:2.2em;text-indent:-2.2em}.cl.hit{background:rgba(251,191,36,.10);box-shadow:inset 3px 0 #FBBF24}.cl.hit .ln{color:#E6EDF8}
mark.xm{background:rgba(251,191,36,.18);color:inherit;border-radius:4px;outline:1px solid rgba(251,191,36,.55);padding:1px 2px}
b.op{background:#FBBF24;color:#1A1203;border-radius:3px;padding:0 3px;margin:0 1px}
.k{color:#C792EA}.s{color:#9ED8A6}.n{color:#F2A07B}.f{color:#82AAFF}.ty{color:#7FDBCA}.c{color:#5C6F8F;font-style:italic}.p{color:#9DB7E0}.pu{color:#7F93B8}
.empty{padding:16px 14px;color:#7D8FAB}
table.tt{width:100%;border-collapse:collapse;font-size:12.5px}.tt td{padding:8px 8px;border-bottom:1px solid #14223A;vertical-align:top}.mute{color:#7D8FAB}.msg{margin-top:4px;color:#FCA5A5;font-size:11.5px}
.ev{display:flex;gap:10px;margin-bottom:9px;font-size:12.5px}.eid{flex:none;width:26px;height:19px;border-radius:5px;background:#16294A;color:#8DB5F4;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}.ev small{color:#7D8FAB}
.tline .tr{display:flex;align-items:center;gap:10px;margin-bottom:8px}.tl{width:118px;flex:none}.tl b{font-size:12.5px;color:#E6EDF8;display:block;white-space:nowrap}.tl small{display:block;color:#6B7D9A;font-size:10.5px;font-family:'Cascadia Mono',Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcs{display:flex;gap:7px}.tc{position:relative;width:30px;height:30px;border-radius:50%;border:2px solid #2A3A58;color:#6B7D9A;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.tc.lk.req{background:#4285E8;border-color:#4285E8}.tc.lk.good{background:#34D399;border-color:#34D399}.tc.lk.off{background:#FBBF24;border-color:#FBBF24}.tc.miss{border-color:#F87171;color:#F87171;background:rgba(248,113,113,.12);font-size:14px}
.tk{position:absolute;right:-6px;top:-7px;width:16px;height:16px;border-radius:50%;font-style:normal;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #0C1628}.tk.ok{background:#34D399;color:#062016}.tk.no{background:#F87171;color:#2A0707}.tk.na{background:#64748B;color:#0B1423}
.th{position:relative;width:30px;text-align:center;font-size:10.5px;color:#6B7D9A}.th.on{color:#8DB5F4;font-weight:800}.th i{position:absolute;left:50%;transform:translateX(-50%);top:-15px;font-style:normal;font-size:9.5px;color:#0B1423;background:#9DB7E0;border-radius:6px;padding:0 4px;white-space:nowrap}
.tline{padding-top:12px}.cap{margin-top:6px;color:#AEBBD0;font-size:12px;line-height:1.6}
.lg{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:11px;color:#7D8FAB}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}.sw.miss{border:2px solid #F87171;border-radius:50%}.sw.line{height:3px;width:14px;background:#8DB5F4;vertical-align:2px}.sw.dash{border:1.5px dashed #C084FC;background:transparent}.sw.dim{background:#3E5784;opacity:.45}
.ftabs{display:flex;gap:6px;margin-bottom:8px}.ftab{background:#10213D;border:1px solid #27406B;color:#AEBBD0;border-radius:7px;padding:4px 12px;font:inherit;cursor:pointer}.ftab.on{background:#16294A;border-color:#4285E8;color:#fff;font-weight:700}
.flowbox{overflow:auto;padding-top:4px}.fnn{color:#6B7D9A;font-size:11px;margin-bottom:8px;font-family:'Cascadia Mono',Consolas,monospace}
svg.flow{display:block;max-width:none}.fl{fill:#E6EDF8;font-size:11.5px;font-weight:600;font-family:'Cascadia Mono',Consolas,monospace}.fl.hot{fill:#FCD34D}.fn2{fill:#5E7091;font-size:9.5px}.fe{fill:#7D8FAB;font-size:10.5px}.fo{font-size:9.5px;font-weight:800}
.judge select,.judge textarea{width:100%;background:#0A1424;border:1px solid #27406B;border-radius:7px;color:#E6EDF8;font:inherit;padding:7px 9px;margin-bottom:8px}
.bar{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;gap:12px;padding:0 22px;background:#1F57B5;color:#E6EDF8;font-size:12.5px;z-index:6}.bar select,.bar button{background:#16294A;border:1px solid #3B63A6;color:#fff;border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer}
.text{display:none}.text .doc{max-width:900px;margin:0 auto;padding:26px 22px;color:#E6EDF8;font-size:14px;line-height:1.85}.text h2{font-size:18px;margin:0 0 14px}.text h3{font-size:15px;margin:22px 0 6px;color:#fff}.text ul{margin:0 0 4px 20px}.text .q{margin-top:22px;color:#9DAEC8}
body[data-view=text] .wrap{display:none}body[data-view=text] .text{display:block}
@media print{.bar,.vt{display:none}.top{position:static}.det[hidden]{display:block!important}}
`;

const SCRIPT = String.raw`
(function(){
var DATA=JSON.parse(document.getElementById('vl-data').textContent);
var KEY='vl:'+DATA.id,store={};
try{store=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){}
store.timings=store.timings||[];
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function fit(){
  $$('.det:not([hidden]) .flowbox:not([hidden])').forEach(function(box){
    var svg=$('svg',box); if(!svg)return;
    var vb=svg.getAttribute('viewBox').split(' '),w=+vb[2],h=+vb[3],avail=box.clientWidth||w;
    var k=Math.max(0.8,Math.min(1,avail/w));
    svg.style.width=Math.round(w*k)+'px'; svg.style.height=Math.round(h*k)+'px';
  });
}
function select(id,scroll){
  $$('.mx tr.row').forEach(function(el){el.classList.toggle('on',el.getAttribute('data-req')===id);});
  $$('.det').forEach(function(el){el.hidden=el.getAttribute('data-req')!==id;});
  fit();
  try{history.replaceState(null,'','#'+id);}catch(e){}
  if(scroll){var d=$('.det[data-req="'+id+'"]');if(d)d.scrollIntoView({behavior:'smooth',block:'start'});}
}
$$('.mx tr.row').forEach(function(el){el.addEventListener('click',function(){select(el.getAttribute('data-req'),true);});});
$$('.ftab').forEach(function(b){b.addEventListener('click',function(){
  var card=b.closest('.card'),k=b.getAttribute('data-set');
  $$('.ftab',card).forEach(function(x){x.classList.toggle('on',x===b);});
  $$('.flowbox',card).forEach(function(f){f.hidden=f.getAttribute('data-set')!==k;});
  fit();
});});
function show(id){
  var j=(store[id]||{}).judge||'미검토',jl=DATA.t.jl[j]||j;
  $$('[data-jcell="'+id+'"]').forEach(function(c){c.textContent=jl;c.classList.toggle('done',j!=='미검토');});
  $$('[data-judge-of="'+id+'"]').forEach(function(t){t.textContent=jl;});
}
function refresh(){
  var n=0;
  DATA.reqs.forEach(function(r){var j=(store[r.id]||{}).judge;if(j&&j!=='미검토')n++;show(r.id);});
  $('#judged').textContent=n+' / '+DATA.reqs.length;
}
$$('.judge').forEach(function(box){
  var id=box.getAttribute('data-req'),rec=store[id]||{},sel=$('select',box),note=$('textarea',box);
  if(rec.judge)sel.value=rec.judge; if(rec.note)note.value=rec.note;
  function upd(){store[id]=store[id]||{};store[id].judge=sel.value;store[id].note=note.value;save();refresh();}
  sel.addEventListener('change',upd); note.addEventListener('input',upd);
});
refresh();
function setView(v){document.body.setAttribute('data-view',v);$$('.vtab').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-view')===v);});if(v==='viz')fit();}
$$('.vtab').forEach(function(b){b.addEventListener('click',function(){setView(b.getAttribute('data-view'));});});
var running=null,tick=null,btn=$('#tstart'),label=$('#tlabel');
function fmt(s){return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
function log(){$('#tlog').textContent=store.timings.map(function(x){return x.task+'/'+(x.view==='text'?DATA.t.text:DATA.t.viz)+' '+fmt(x.seconds);}).join(' · ');}
btn.addEventListener('click',function(){
  if(!running){
    running={t:Date.now(),task:$('#task').value,view:document.body.getAttribute('data-view')};
    btn.textContent=DATA.t.stop; tick=setInterval(function(){label.textContent=fmt(Math.round((Date.now()-running.t)/1000));},500);
  }else{
    var sec=Math.round((Date.now()-running.t)/1000);
    store.timings.push({task:running.task,view:running.view,seconds:sec}); save();
    clearInterval(tick); running=null; btn.textContent=DATA.t.start; label.textContent=DATA.t.rec+' '+fmt(sec); log();
  }
});
log();
$('#export').addEventListener('click',function(){
  var out={report:DATA.meta,judgments:{},timings:store.timings,exportedAt:new Date().toISOString()};
  DATA.reqs.forEach(function(r){out.judgments[r.id]={status:r.status,judge:(store[r.id]||{}).judge||'미검토',note:(store[r.id]||{}).note||''};});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  a.download='verifylens-judgments.json'; a.click();
});
window.addEventListener('resize',fit);
var h=(location.hash||'').slice(1).split(':');
if(h[0]==='text'){setView('text');select(DATA.first,false);}
else{
  var rid=/^R\d+$/.test(h[0])&&$('.det[data-req="'+h[0]+'"]')?h[0]:DATA.first;
  select(rid,false);
  if(h[1]){var t=$('.det[data-req="'+rid+'"] .ftab[data-set="'+h[1]+'"]');if(t)t.click();}
}
})();
`;

export function renderHtml(report: Report, summaryMd: string): string {
  const id = String(Math.abs([...(report.generatedAt + report.sets.map((s) => s.sha).join(''))].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)));
  const first = report.summaries.find((s) => s.overall === '다름' || s.overall === '실패') ?? report.summaries[0];
  const meta = { generatedAt: report.generatedAt, base: report.base, results: report.sets.map((s) => ({ label: s.label, ref: s.ref, sha: s.sha })) };
  const t = { jl: JUDGE_LABELS(), text: L('글', 'text'), viz: L('시각화', 'visual'), stop: L('종료', 'Stop'), start: L('시작', 'Start'), rec: L('기록', 'recorded') };
  const data = { id, first: first.req.id, meta, t, reqs: report.summaries.map((s) => ({ id: s.req.id, text: s.req.text, status: s.overall })) };
  const mark = '<svg width="24" height="24" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="6"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/></svg>';
  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${L('VerifyLens 검증 리포트 (프로토타입 v0)', 'VerifyLens verification report (preview)')}</title><style>${CSS}</style></head>
<body data-view="viz">
<div class="top"><div class="logo">${mark}<div>Verify<span>Lens</span></div></div><div class="meta">${L('검증 리포트 · 프로토타입 v0 · 기준', 'Verification report · preview · base')} <code>${esc(report.base)}</code></div><span class="sp"></span><span class="badge g">${L('로컬에서 생성 · 네트워크 사용 없음 · AI 추정 없음', 'Generated locally · no network · no AI inference')}</span><div class="vt"><button class="vtab on" data-view="viz">${L('시각화', 'Visual')}</button><button class="vtab" data-view="text">${L('글 요약', 'Text summary')}</button></div></div>
<div class="wrap">${overview(report)}${report.summaries.map((s) => detail(report, s)).join('')}</div>
<div class="text"><div class="doc">${mdToHtml(summaryMd)}</div></div>
<div class="bar"><b>${L('과제 시간', 'Task timer')}</b><select id="task"><option>T1</option><option>T2</option><option>T3</option><option>${L('자유', 'Free')}</option></select><button id="tstart">${L('시작', 'Start')}</button><span id="tlabel">0:00</span><span id="tlog" style="opacity:.85"></span><span class="sp"></span><span>${L('사람의 판단', 'Decisions')} <b id="judged">0</b></span><button id="export">${L('판단·시간 내보내기', 'Export decisions and times')}</button></div>
<script type="application/json" id="vl-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>${SCRIPT}</script>
</body></html>`;
}

export function writeOutputs(report: Report, out: string, prFile?: string, concept = false): string[] {
  const md = renderSummaryMd(report);
  const files: string[] = [];
  const put = (name: string, text: string) => {
    writeFileSync(join(out, name), text, 'utf8');
    files.push(join(out, name));
  };
  put('report.html', renderHtml(report, md));
  put('summary.md', md);
  // 컨셉 시연은 샘플(가상 사례) 대화 장면이 들어가므로 demo 에서만 만든다.
  if (concept) put('concept.html', renderConcept(report));
  if (prFile) put('requirements.draft.md', extractFromPrBody(readFileSync(prFile, 'utf8')));
  return files;
}

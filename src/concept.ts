// 컨셉 시연 화면 (out/concept.html)
// 「AI가 만든 코드 → VerifyLens 확인 → 사람의 판단」을 에디터 화면 안에서 한 단계씩 보여 준다.
// 분석 결과(상태·조건·검사·동작 시점·바뀐 줄)는 모두 실제 리포트 값이고, AI 대화 문구만 가상 사례의 장면 설정이다.
import type { Report, ReqSummary, ResultSet } from './types.ts';
import { changedLines, git } from './git.ts';
import { counts } from './summary.ts';
import { ID, esc, hl, hlMark } from './view.ts';

const TEST_FILE = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/)/;
const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

type SetInfo = { set: ResultSet; changed: Map<string, Set<number>>; status: Map<string, string>; tree: string[] };

function info(report: Report, set: ResultSet): SetInfo {
  let changed = new Map<string, Set<number>>();
  const status = new Map<string, string>();
  let tree = Object.keys(set.files);
  try {
    changed = changedLines(report.repo, report.base, set.ref);
  } catch {}
  try {
    for (const l of git(report.repo, ['diff', '--name-status', '--no-renames', `${report.base}...${set.ref}`]).split('\n')) {
      const [st, f] = l.trim().split(/\t/);
      if (st && f) status.set(f, st[0]);
    }
  } catch {}
  try {
    tree = git(report.repo, ['ls-tree', '-r', '--name-only', set.ref]).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {}
  return { set, changed, status, tree };
}

const codeLinesAdded = (si: SetInfo) => [...si.changed].filter(([f]) => CODE_EXT.test(f) && !TEST_FILE.test(f)).reduce((n, [, s]) => n + s.size, 0);
const cls = (o: string) => (o === '확인됨' ? 'ok' : o === '다름' ? 'diff' : o === '실패' ? 'fail' : 'unk');
const dot = (k: 'A' | 'B') => `<i class="idd" style="background:${ID[k]}"></i>`;

// ---------------------------------------------------------------- 에디터
type Deco = { key: string; line: number; end: number; c: 'ok' | 'diff' | 'fail' | 'unk'; text: string; expr?: string; op?: string };

function decos(report: Report, set: ResultSet, file: string): Deco[] {
  const out: Deco[] = [];
  for (const s of report.summaries) {
    const rr = set.perReq[s.req.id];
    const u = rr.evidence.unit;
    if (!u || u.file !== file) continue;
    const b = rr.evidence.boundary;
    let c: Deco['c'];
    let text: string;
    if (b && b.attempts != null) {
      c = b.ok ? 'ok' : 'diff';
      text = `${s.req.id} ${b.ok ? '요구사항과 같음' : '다름'} · ${b.attempts}번째 시도에서 동작${b.ok ? '' : ` — 요구사항은 ${b.required}회`} · 검사 ${rr.testStatus}`;
    } else if (rr.testStatus === '미실행') {
      c = 'unk';
      text = `${s.req.id} 미확인 · 코드는 찾았지만 연결된 검사가 없음`;
    } else if (rr.testStatus === '실패') {
      c = 'fail';
      text = `${s.req.id} 실패 · 연결된 검사가 실패`;
    } else {
      c = 'ok';
      text = `${s.req.id} 확인됨 · ${u.kind === 'function' ? `${u.fn}() 함수 전체가 근거` : '조건이 근거'} · 검사 통과`;
    }
    const mark = (b && b.ok === false) || s.relation.kind === '불일치';
    out.push({ key: s.req.id, line: u.startLine, end: u.kind === 'condition' ? u.endLine : u.startLine, c, text, expr: u.cond?.expr, op: mark ? u.cond?.op : undefined });
  }
  for (const d of set.dyn) if (d.file === file) out.push({ key: 'dyn', line: d.line, end: d.line, c: 'unk', text: '해석하지 못한 호출 · 무엇이 실행될지 정적 분석으로 알 수 없음' });
  return out;
}

function pane(report: Report, si: SetInfo, file: string): string {
  const set = si.set;
  const src = (set.files[file] ?? '').replace(/\n$/, '').split('\n');
  const ch = si.changed.get(file) ?? new Set<number>();
  const ds = decos(report, set, file);
  const rows: string[] = [];
  src.forEach((line, i) => {
    const n = i + 1;
    for (const d of ds.filter((x) => x.line === n)) rows.push(`<div class="lens ${d.c}" data-k="${d.key}"><span class="ln"></span><span class="lt">${d.key === 'dyn' ? '?' : '◆'} ${esc(d.text)}</span></div>`);
    const here = ds.filter((x) => n >= x.line && n <= x.end);
    const md = here.find((x) => x.expr && x.line === n);
    const html = md ? hlMark(line, md.expr, md.op) : hl(line);
    const keys = here.map((x) => x.key).join(' ');
    rows.push(`<div class="cl${ch.has(n) ? ' add' : ''}"${keys ? ` data-k="${keys}" data-c="${here[0].c}"` : ''}><span class="ln">${n}</span><span class="tx">${html || ' '}</span></div>`);
  });
  return `<div class="pane" data-set="${set.key}"><div class="etab">${dot(set.key)}<b>${esc(file.split('/').pop()!)}</b><span class="tg" style="color:${ID[set.key]}">${set.label}</span><span class="rf">${esc(set.ref)} · ${set.sha}</span></div><div class="code">${rows.join('')}</div></div>`;
}

// ---------------------------------------------------------------- 탐색기
function explorer(infos: SetInfo[], file: string): string {
  const all = [...new Set(infos.flatMap((i) => i.tree))].sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  let dir = '';
  for (const f of all) {
    const parts = f.split('/');
    const d = parts.slice(0, -1).join('/');
    if (d !== dir) {
      dir = d;
      if (d) out.push(`<div class="fd">▾ ${esc(d)}</div>`);
    }
    const tags = infos
      .filter((i) => i.status.has(f))
      .map((i) => `<span class="ft" style="color:${ID[i.set.key]}">${i.set.key} ${i.status.get(f) === 'A' ? '추가' : '변경'}</span>`)
      .join('');
    out.push(`<div class="fi${f === file ? ' on' : ''}${d ? ' in' : ''}"><span class="fn">${esc(parts[parts.length - 1])}</span>${tags}</div>`);
  }
  return `<div class="sh">탐색기</div><div class="fr">▾ login-service</div>${out.join('')}`;
}

// ---------------------------------------------------------------- VerifyLens 패널
const evMark = (s: string) => `<b class="${s === '발견' ? 'ok' : s === '일부 발견' ? 'diff' : 'unk'}">${s === '발견' ? '●' : s === '일부 발견' ? '◐' : '○'}</b>`;
const tsMark = (s: string) => `<b class="${s === '통과' ? 'ok' : s === '실패' ? 'fail' : 'unk'}">${s === '통과' ? '✓' : s === '실패' ? '✗' : '–'}</b>`;

function miniTimeline(report: Report, id: string): string {
  const rows = report.sets.map((s) => ({ s, b: s.perReq[id].evidence.boundary })).filter((x) => x.b && x.b.attempts != null);
  if (!rows.length) return '';
  const req = rows[0].b!.required;
  const N = Math.max(7, req + 2, ...rows.map((r) => r.b!.attempts! + 1));
  const head = Array.from({ length: N }, (_, i) => `<span class="mh${i + 1 === req ? ' on' : ''}">${i + 1}</span>`).join('');
  const reqCells = Array.from({ length: N }, (_, i) => `<span class="mc${i + 1 >= req ? ' qq' : ''}"></span>`).join('');
  const res = rows
    .map((r) => {
      const at = r.b!.attempts!;
      const good = at === req;
      const cells = Array.from({ length: N }, (_, i) => {
        const n = i + 1;
        const miss = !good && n === req && at > req;
        return `<span class="mc${n >= at ? (good ? ' gd' : ' of') : ''}${miss ? ' ms' : ''}">${miss ? '×' : ''}</span>`;
      }).join('');
      return `<div class="mr"><span class="ml">${dot(r.s.key)}${r.s.key}</span>${cells}</div>`;
    })
    .join('');
  return `<div class="tlm"><div class="tlh">시도 횟수별 잠금 시점</div><div class="mr"><span class="ml"></span>${head}</div><div class="mr"><span class="ml">요구</span>${reqCells}</div>${res}<div class="tln">칠한 칸부터 잠김 · <span class="msx">×</span> 잠겨야 하는데 안 잠김</div></div>`;
}

function detailOf(report: Report, s: ReqSummary): string {
  const id = s.req.id;
  const lines = report.sets
    .map((set) => {
      const rr = set.perReq[id];
      const u = rr.evidence.unit;
      const b = rr.evidence.boundary;
      const what = u ? (u.kind === 'condition' ? `<code>${esc(u.cond?.expr ?? u.text)}</code>` : `<code>${esc(u.fn)}()</code> 함수 전체`) : '근거 없음';
      const beh = b && b.attempts != null ? `<em class="${b.ok ? 'ok' : 'diff'}">${b.attempts}번째</em> 시도에서 동작 · ` : '';
      const fail = rr.tests.find((t) => t.status === 'fail');
      const test = rr.tests.length ? `검사 ${tsMark(rr.testStatus)} ${rr.testStatus}` : `검사 ${tsMark('미실행')} 연결된 검사 없음`;
      return `<div class="dl">${dot(set.key)}<b>${set.label}</b> ${what}<div class="ds">${beh}${test}</div>${fail ? `<div class="ds fm">${esc(fail.name)}</div>` : ''}</div>`;
    })
    .join('');
  const dyn = s.overall === '미확인' ? report.sets.flatMap((set) => set.dyn.map((d) => `<div class="dl dn">${dot(set.key)}? <code>${esc(d.text)}</code> ${esc(d.file.split('/').pop()!)}:${d.line} · 해석하지 못한 호출</div>`)).join('') : '';
  const tl = s.overall === '다름' ? miniTimeline(report, id) : '';
  return `<div class="dt" data-req="${id}" hidden>${lines}${dyn}${tl}</div>`;
}

function vlPanel(report: Report): string {
  const c = counts(report);
  const two = report.sets.length === 2;
  const rows = report.summaries
    .map((s) => {
      const ab = report.sets.map((set) => `<span class="ab">${dot(set.key)}근거${evMark(set.perReq[s.req.id].evidence.status)} 검사${tsMark(set.perReq[s.req.id].testStatus)}</span>`).join('');
      return `<li class="rq" data-req="${s.req.id}"><div class="r1"><span class="pill ${cls(s.overall)}">${s.overall}</span><b class="rid">${s.req.id}</b><span class="rt">${esc(s.req.text)}</span></div><div class="r2">${ab}</div><div class="r3">판단 <span class="jd" data-j="${s.req.id}">미검토</span></div></li>`;
    })
    .join('');
  const logo = '<svg width="16" height="16" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="7"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="8.5" stroke-linecap="round"/></svg>';
  return `<div class="sh">${logo}<span>VerifyLens</span><small>요구사항 ${report.summaries.length} · ${two ? '결과 A·B 비교' : '결과 1개'}</small></div>
<div class="scanbar"><div class="sb1">요구사항 ${report.summaries.length}개를 코드와 맞춰 보는 중…</div><div class="sb2"><i></i></div><div class="sb3">코드 근거 찾기 → 검사 결과 읽기 → 결과 비교</div></div>
<div class="cnts"><span class="ok">확인됨 <b>${c.확인됨}</b></span><span class="diff">다름 <b>${c.다름}</b></span><span class="fail">실패 <b>${c.실패}</b></span><span class="unk">미확인 <b>${c.미확인}</b></span></div>
<ul class="rqs">${rows}</ul>
${report.summaries.map((s) => detailOf(report, s)).join('')}
<div class="vf">이 PC 안에서 규칙으로 분석 · 네트워크 없음 · AI 추정 없음</div>`;
}

// ---------------------------------------------------------------- 하단 패널 (변경 요약 · 검사 결과)
function bottom(infos: SetInfo[]): string {
  const diff = infos
    .map((i) => {
      const files = [...i.changed]
        .filter(([f]) => CODE_EXT.test(f))
        .map(([f, s]) => `<span class="df">${esc(f)} <b>+${s.size}</b>${i.status.get(f) === 'A' ? ' <em>새 파일</em>' : ''}</span>`)
        .join('');
      return `<div class="trow">${dot(i.set.key)}<b class="tw">${i.set.label}</b><span class="tref">${esc(i.set.ref)}</span>${files}</div>`;
    })
    .join('');
  const tests = infos
    .map((i) => {
      const head = `<div class="trow th">$ node --test <span class="tref">→ 검사 보고서 · ${i.set.label} · ${i.set.sha}</span></div>`;
      const body = i.set.tests
        .map((t) => `<div class="trow${t.status === 'fail' ? ' fail' : ''}"><span class="tk ${t.status === 'pass' ? 'ok' : t.status === 'fail' ? 'no' : 'na'}">${t.status === 'pass' ? '✔' : t.status === 'fail' ? '✖' : '–'}</span>${esc(t.name)}${t.status === 'fail' && t.message ? `<span class="tmsg">${esc(t.message)}</span>` : ''}</div>`)
        .join('');
      return head + (body || '<div class="trow mute">검사 보고서 없음</div>');
    })
    .join('');
  return `<div class="ttabs"><span class="tt" data-t="diff">변경 요약</span><span class="tt" data-t="test">검사 결과</span><span class="tsp"></span><span class="tnote">터미널</span></div>
<div class="tbody"><div class="tv" data-t="none"><div class="trow mute">$ <span class="cur"></span></div></div><div class="tv" data-t="diff">${diff}<div class="trow mute">AI가 바꾼 코드 줄 수 (+는 새로 쓰거나 고친 줄)</div></div><div class="tv" data-t="test">${tests}</div></div>`;
}

// ---------------------------------------------------------------- AI 대화 (가상 사례 장면)
function chat(report: Report, infos: SetInfo[]): string {
  const reqs = report.reqs.map((r) => `<li>${esc(r.text)}</li>`).join('');
  const claims = report.reqs.map((r) => `<li><b class="ok">✓</b> ${esc(r.text)}</li>`).join('');
  const files = (i: SetInfo) =>
    [...i.changed]
      .filter(([f]) => CODE_EXT.test(f) && !TEST_FILE.test(f))
      .map(([f, s]) => `<code>${esc(f.split('/').pop()!)} +${s.size}</code>`)
      .join(' ');
  const say: Record<string, string> = { A: '구현했습니다. 요구사항 3개 모두 반영했어요.', B: '완료했습니다! 로그인 지표 기록도 같이 추가했어요.' };
  const ai = infos
    .map((i, k) => `<div class="msg ai" data-n="${k + 2}"><div class="who">${dot(i.set.key)}AI 에이전트 ${k + 1} <span>→ ${i.set.label}</span></div><p>${say[i.set.key] ?? '구현했습니다.'}</p><ul class="cl3">${claims}</ul><div class="mf">바꾼 파일 ${files(i)}</div><div class="done">✓ 작업 완료</div></div>`)
    .join('');
  return `<div class="sh">AI 코딩 도우미<span class="vtag">가상 대화</span></div><div class="msgs"><div class="msg me" data-n="1"><div class="who">개발자</div><p>로그인 잠금 기능 추가해 줘. 아래 요구사항 지켜서.</p><ul>${reqs}</ul></div>${ai}</div><div class="cin">AI에게 요청하기…</div>`;
}

// ---------------------------------------------------------------- 표지 · 붙는 곳
function cover(): string {
  return `<div class="ov ov-cover"><div class="cv">
<div class="kick">VerifyLens 컨셉 시연</div>
<h1>AI 없이는 일할 수 없지만,<br>AI가 만든 코드를 그대로 믿을 수는 없습니다.</h1>
<p>그래서 개발자는 AI 결과물을 <b>거꾸로 읽으며 다시 검증</b>합니다.<br><b class="bl">VerifyLens</b>는 그 재검증을 요구사항별 근거 화면으로 바꿔, <b>검증에 드는 시간을 줄입니다.</b></p>
<div class="f3"><div><i>1</i><b>요구사항</b><small>무엇을 만들어야 했나</small></div><span>→</span><div><i>2</i><b>근거</b><small>코드 · 검사 · 동작 시점</small></div><span>→</span><div><i>3</i><b>사람의 판단</b><small>쓸지 · 고칠지 · 더 볼지</small></div></div>
<button class="go" data-go="1">시연 시작 →</button>
<div class="note">가상 사례(로그인 잠금) · 화면 속 분석 결과는 프로토타입이 실제 코드와 실행한 검사에서 계산한 값입니다 · 키보드 → 로 넘깁니다</div>
</div></div>`;
}

function where(report: Report, F: ReqSummary, U?: ReqSummary): string {
  const c = counts(report);
  const bad = report.sets.find((s) => s.perReq[F.req.id].evidence.boundary?.ok === false);
  const bb = bad?.perReq[F.req.id].evidence;
  const prLine = bad && bb?.unit ? `<b>${F.req.id} 다름</b> — ${bad.label} <code>${esc(bb.unit.cond?.expr ?? '')}</code> → ${bb.boundary!.attempts}번째 시도에서 동작 (요구사항 ${bb.boundary!.required}회)` : `<b>${F.req.id} ${F.overall}</b>`;
  const uLine = U ? `<b>${U.req.id} 미확인</b> — 연결된 검사 없음` : '';
  return `<div class="ov ov-where"><div class="wh">
<h2>같은 분석 엔진을, 개발자가 이미 쓰는 곳에 붙입니다</h2>
<div class="cards">
<div class="wc"><span class="wt">첫 제품 후보</span><h3>에디터 패널</h3><p>VS Code·Cursor 확장. AI가 코드를 만든 직후 옆 패널에서 바로 확인합니다. 방금 보신 화면입니다.</p>
<div class="mini mide"><div class="mi1"><span class="pill ok">확인됨</span> R1</div><div class="mi1"><span class="pill diff">다름</span> R2</div><div class="mi1"><span class="pill unk">미확인</span> R3</div></div></div>
<div class="wc"><span class="wt">팀용</span><h3>PR 검사</h3><p>PR을 올리면 요구사항별 상태와 요약이 댓글로 붙고, 리뷰어는 갈리는 곳부터 봅니다.</p>
<div class="mini mpr"><div class="mph"><span class="bot">VerifyLens</span> 검증 결과</div><div class="mpc">확인됨 ${c.확인됨} · 다름 ${c.다름} · 미확인 ${c.미확인}</div><div class="mpl">${prLine}</div>${uLine ? `<div class="mpl">${uLine}</div>` : ''}</div></div>
<div class="wc"><span class="wt">확장</span><h3>AI 에이전트 도구</h3><p>AI가 "완료"라고 말하기 전에 VerifyLens 결과를 함께 보여 줍니다. 무엇을 할지는 사람이 정합니다.</p>
<div class="mini mag"><div class="mab">AI: 작업을 마쳤고 VerifyLens로 확인했습니다. <b>${F.req.id} 다름</b>이 있어요. 어떻게 할까요?</div><div class="mbt"><span>근거 보기</span><span>수정 요청</span></div></div></div>
</div>
<div class="now">지금(v0) — 명령어 한 줄로 리포트 파일을 만들고, 이 PC 안에서만 분석합니다. 같은 엔진을 에디터 · PR · AI 도구에 붙이는 것이 다음 단계입니다.</div>
<div class="acts"><a class="btn" href="report.html#${F.req.id}">전체 리포트 열기</a><button class="btn ghost" data-go="0">처음부터</button></div>
</div></div>`;
}

// ---------------------------------------------------------------- 단계
type Step = { title: string; body: string; side: 'files' | 'vl'; chat: number; term: string; diff?: 1; focus: string; show?: string; sel?: string; scan?: 1; tl?: 1; failhi?: 1; judge?: Record<string, string>; ov?: string };

function steps(report: Report, infos: SetInfo[], F: ReqSummary, U?: ReqSummary): Step[] {
  const c = counts(report);
  const id = F.req.id;
  const nums = infos.map((i) => `${i.set.key} ${codeLinesAdded(i)}줄`).join(' · ');
  const conds = report.sets.map((s) => ({ s, e: s.perReq[id].evidence }));
  const condTxt = conds.map((x) => `${x.s.label}는 <code>${esc(x.e.unit?.cond?.expr ?? x.e.unit?.text ?? '근거 없음')}</code>`).join(', ');
  const bad = conds.find((x) => x.e.boundary?.ok === false);
  const failed = report.sets.filter((s) => s.perReq[id].testStatus === '실패');
  const passOff = !!bad && bad.s.perReq[id].testStatus === '통과';
  const allGreen = report.sets.every((s) => s.tests.length > 0 && s.tests.every((t) => t.status !== 'fail'));
  const maxLines = Math.max(...infos.map(codeLinesAdded));
  const S: Step[] = [];
  S.push({ title: 'VerifyLens 컨셉 시연', body: 'AI가 만든 코드를 쓰기 전, 무엇이 확인됐고 무엇이 다르고 무엇이 아직 확인되지 않았는지를 한 화면에서 봅니다.', side: 'files', chat: 0, term: 'none', focus: '', ov: 'cover' });
  S.push({ title: '개발자가 AI에게 기능을 맡깁니다', body: `"로그인에 연속 5회 실패하면 계정을 잠가 줘." 이 요청 안에는 지켜야 할 요구사항이 ${report.reqs.length}개 있습니다.`, side: 'files', chat: 1, term: 'none', focus: 'chat' });
  S.push({ title: allGreen ? 'AI는 두 결과 모두 "완료"라고 답하고, 테스트도 전부 통과합니다' : 'AI는 두 결과 모두 "요구사항 전부 반영, 완료"라고 답합니다', body: `${allGreen ? '테스트가 통과했다고 요구사항대로라는 뜻은 아닙니다. AI가 코드와 테스트를 같은 오해로 쓰면 둘 다 초록색입니다. ' : ''}정말 그런지는 AI의 말이 아니라 코드로 확인해야 합니다. 바뀐 코드(${nums})를 사람이 거꾸로 읽어 가며 다시 검증하는 것 — 지금 개발자들이 시간을 쓰는 곳이 여기입니다.`, side: 'files', chat: 3, term: 'diff', diff: 1, focus: 'chat ed term' });
  S.push({ title: 'VerifyLens가 요구사항마다 코드와 검사 결과를 맞춰 봅니다', body: `AI는 모두 ✓라고 했지만 결과는 <b class="ok">확인됨 ${c.확인됨}</b> · <b class="diff">다름 ${c.다름}</b> · <b class="unk">미확인 ${c.미확인}</b>입니다. 이 PC 안에서 규칙으로 분석하고, AI가 추정한 내용은 넣지 않습니다.`, side: 'vl', chat: 3, term: 'test', diff: 1, focus: 'side', scan: 1 });
  S.push({ title: '"다름"을 누르면 두 결과가 갈리는 코드 줄로 바로 갑니다', body: `${condTxt}. 바뀐 코드 수십 줄 가운데 연산자 한 글자가 다릅니다. 에디터 안에 요구사항과의 관계가 함께 표시됩니다.`, side: 'vl', chat: 3, term: 'test', diff: 1, focus: 'ed side', show: id, sel: id });
  if (bad?.e.boundary)
    S.push({ title: `코드 값으로 계산하면, ${bad.s.label}는 ${bad.e.boundary.attempts}번째 시도에서야 잠급니다`, body: `요구사항은 ${bad.e.boundary.required}번째입니다. ${failed.length ? `실제로 돌린 검사도 ${failed.map((s) => s.label).join('·')}에서 실패해 이 차이를 뒷받침합니다. ` : passOff ? `그런데 ${bad.s.label}의 검사는 통과했습니다. 검사가 요구사항과 다른 횟수를 확인하고 있어서, 테스트만 돌려서는 보이지 않는 어긋남입니다. ` : ''}"완료"라던 AI의 말과 다릅니다.`, side: 'vl', chat: 3, term: 'test', diff: 1, focus: 'side term', show: id, sel: id, tl: 1, failhi: 1 });
  if (U)
    S.push({ title: '확인되지 않은 것은 "미확인"으로 남깁니다', body: `${U.req.id}는 코드는 찾았지만 연결된 검사가 없어 실제 동작을 확인하지 못했습니다. <code>hooks[event]?.()</code>처럼 무엇이 실행될지 알 수 없는 호출도 따로 표시합니다. 근거가 없는 곳을 안심시키지 않습니다.`, side: 'vl', chat: 3, term: 'test', diff: 1, focus: 'ed side', show: `${U.req.id} dyn`, sel: U.req.id });
  const judge: Record<string, string> = {};
  for (const s of report.summaries) judge[s.req.id] = s.overall === '확인됨' ? '사용' : s.overall === '미확인' ? '추가 검증' : bad ? `${bad.s.key} 수정` : '수정';
  S.push({ title: '무엇을 쓸지는 사람이 근거를 보고 정합니다', body: `코드 ${maxLines}줄을 처음부터 다시 읽는 대신, 갈리는 한 줄과 그 근거만 확인했습니다. 판단과 이유는 근거와 함께 기록으로 남습니다.`, side: 'vl', chat: 3, term: 'test', diff: 1, focus: 'side', show: id, sel: id, judge });
  S.push({ title: '제품은 개발자의 작업 흐름 안으로 들어갑니다', body: '지금 보신 것은 v0(로컬 명령어 + 리포트 파일)입니다. 제품은 같은 분석 엔진을 에디터·PR·AI 도구에 붙이는 형태입니다.', side: 'vl', chat: 3, term: 'test', diff: 1, focus: '', show: id, sel: id, judge, ov: 'where' });
  return S;
}

// ---------------------------------------------------------------- 화면
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--fs:13px;--code:12.5px;--lh:20px;--side:clamp(280px,21vw,380px);--chat:clamp(290px,21vw,400px);--term:clamp(150px,19vh,220px)}
@media (min-width:1700px){:root{--fs:14.5px;--code:14px;--lh:23px}}
html,body{height:100%}
body{background:#060D18;color:#C9D5E8;font:var(--fs)/1.5 'Pretendard Variable','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;overflow:hidden;min-width:1180px}
code,.code,.tbody,.rf,.tref{font-family:'Cascadia Mono',Consolas,monospace}
code{font-size:.92em;color:#BFD3F2;background:#14223A;padding:0 5px;border-radius:4px}
.ok{color:#6EE7B7}.diff{color:#FCD34D}.fail{color:#FCA5A5}.unk{color:#CBD5E1}
.idd{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;flex:none}
.pill{display:inline-flex;align-items:center;height:20px;padding:0 9px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap}
.pill.ok{background:rgba(52,211,153,.15)}.pill.diff{background:rgba(251,191,36,.16)}.pill.fail{background:rgba(248,113,113,.16)}.pill.unk{background:rgba(148,163,184,.16)}
.app{height:100vh;display:flex;flex-direction:column}
.top{height:44px;flex:none;display:flex;align-items:center;gap:12px;padding:0 18px;background:#050B15;border-bottom:1px solid #16243C}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:#fff}.logo span{color:#8DB5F4}
.top .meta{color:#7D8FAB;font-size:12px}.sp{flex:1}
.badge{height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:12px;border:1px solid rgba(52,211,153,.45);color:#6EE7B7;font-size:11.5px;font-weight:700;white-space:nowrap}
.top a{color:#9DB7E0;font-size:12.5px;text-decoration:none;border:1px solid #27406B;border-radius:7px;padding:4px 10px}.top a:hover{background:#10213D}
.frame{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:46px var(--side) minmax(0,1fr) var(--chat);grid-template-rows:30px minmax(0,1fr) var(--term);background:#0A1424}
.tb{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0 12px;background:#07101C;border-bottom:1px solid #16243C;color:#7D8FAB;font-size:12px}.tb i{width:11px;height:11px;border-radius:50%;background:#26354F;display:inline-block}.tb b{color:#AEBBD0;font-weight:600;margin-left:10px}
.act{grid-row:2/4;background:#07101C;border-right:1px solid #16243C;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:8px}
.act span{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;opacity:.45}
.app[data-side=files] .act .a-files,.app[data-side=vl] .act .a-vl{opacity:1;background:#12213B;box-shadow:inset 2px 0 #4285E8}
.z{position:relative;transition:opacity .35s ease;min-width:0;min-height:0}
.z.dim{opacity:.3}
.z.hot::after{content:'';position:absolute;inset:1px;border:2px solid #4285E8;border-radius:6px;pointer-events:none;z-index:20;box-shadow:0 0 0 3px rgba(66,133,232,.2),0 0 26px rgba(66,133,232,.18)}
.side{grid-row:2/4;background:#0B1526;border-right:1px solid #16243C;overflow:hidden;display:flex;flex-direction:column}
.sh{height:34px;flex:none;display:flex;align-items:center;gap:7px;padding:0 14px;font-size:11.5px;font-weight:800;letter-spacing:.04em;color:#8A9BB8;border-bottom:1px solid #14223A}.sh small{margin-left:auto;font-weight:500;letter-spacing:0;color:#5E7091}
.sv{display:none;flex:1;min-height:0;overflow:auto;flex-direction:column}
.app[data-side=files] .sv-files,.app[data-side=vl] .sv-vl{display:flex}
.fr,.fd{padding:4px 14px;color:#AEBBD0;font-weight:700;font-size:12px}.fd{padding-left:22px;color:#8A9BB8}
.fi{display:flex;align-items:center;gap:6px;padding:3px 14px 3px 22px;font-size:12.5px;color:#AEBBD0}.fi.in{padding-left:36px}.fi.on{background:#12213B;color:#fff}
.fi .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ft{font-size:10.5px;font-weight:800;opacity:0;transition:opacity .3s}
.app[data-diff="1"] .ft{opacity:1}
.sv-vl .sh span{color:#fff;font-size:13px;letter-spacing:0}
.scanbar{display:none;padding:18px 16px}.sb1{color:#E6EDF8;font-weight:700;margin-bottom:10px}.sb2{height:5px;border-radius:3px;background:#14223A;overflow:hidden}.sb2 i{display:block;height:100%;width:0;background:#4285E8}.sb3{margin-top:9px;color:#7D8FAB;font-size:11.5px}
.app.scanning .scanbar{display:block}.app.scanning .sb2 i{animation:bar 1.3s ease forwards}
.app.scanning .cnts,.app.scanning .rqs,.app.scanning .dt,.app.scanning .vf{display:none}
@keyframes bar{to{width:100%}}
.cnts{display:flex;gap:12px;padding:10px 14px 6px;font-size:12px}.cnts b{font-size:15px;margin-left:2px}
.rqs{list-style:none;padding:4px 8px}
.rq{border:1px solid #16243C;border-radius:9px;padding:8px 10px;margin-bottom:6px;cursor:pointer;background:#0C182B;animation:rqIn .4s both}
.rq:nth-child(2){animation-delay:.12s}.rq:nth-child(3){animation-delay:.24s}.rq:nth-child(4){animation-delay:.36s}
.rq:hover{border-color:#27406B}.rq.on{border-color:#4285E8;background:#10213D}
@keyframes rqIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.r1{display:flex;align-items:flex-start;gap:7px}.rid{color:#8DB5F4;flex:none;line-height:20px}.rt{color:#E6EDF8;font-weight:600;font-size:12.5px;line-height:1.45;padding-top:1px}
.r2{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:11.5px;color:#8A9BB8}.ab{display:inline-flex;align-items:center;gap:4px}.ab b{font-size:12px;margin-right:2px}.ab b.unk{color:#64748B}
.r3{margin-top:5px;font-size:11.5px;color:#6B7D9A}.jd{display:inline-block;margin-left:4px;color:#7D8FAB;transition:all .3s}.jd.set{color:#fff;background:#1F57B5;border-radius:6px;padding:0 8px;font-weight:800}
.rq:nth-child(2) .jd.set{transition-delay:.35s}.rq:nth-child(3) .jd.set{transition-delay:.7s}
.dt{margin:2px 8px 6px;padding:9px 11px;border:1px dashed #27406B;border-radius:9px;background:#0A1424;font-size:12px;animation:rqIn .35s both}
.dl{margin-bottom:7px;color:#C9D5E8;line-height:1.55}.dl b{margin-right:4px}.ds{color:#8A9BB8;font-size:11.5px;padding-left:15px}.fm{color:#FCA5A5}.dl em{font-style:normal;font-weight:800}.dl em.ok{color:#6EE7B7}.dl em.diff{color:#FCD34D}.dn{color:#AEBBD0}
.tlm{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #16243C}.app[data-tl="1"] .tlm{display:block;animation:rqIn .4s both}
.tlh{font-size:11px;font-weight:800;color:#8A9BB8;margin-bottom:6px}
.mr{display:flex;align-items:center;gap:4px;margin-bottom:4px}.ml{width:38px;flex:none;font-size:11px;color:#AEBBD0;display:flex;align-items:center}
.mh{width:19px;text-align:center;font-size:10px;color:#6B7D9A}.mh.on{color:#8DB5F4;font-weight:800}
.mc{width:19px;height:19px;border-radius:50%;border:2px solid #2A3A58;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}
.mc.qq{background:#4285E8;border-color:#4285E8}.mc.gd{background:#34D399;border-color:#34D399}.mc.of{background:#FBBF24;border-color:#FBBF24}.mc.ms{border-color:#F87171;color:#F87171;background:rgba(248,113,113,.15)}
.tln{font-size:10.5px;color:#6B7D9A;margin-top:4px}.msx{color:#F87171;font-weight:900}
.vf{margin-top:auto;padding:10px 14px;font-size:11px;color:#5E7091;border-top:1px solid #14223A}
.ed{grid-row:2;display:grid;grid-template-columns:1fr 1fr;background:#0A1424;overflow:hidden}
.pane{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid #16243C}
.etab{height:34px;flex:none;display:flex;align-items:center;gap:2px;padding:0 12px;background:#0B1526;border-bottom:1px solid #16243C;font-size:12.5px;color:#E6EDF8;white-space:nowrap;overflow:hidden}.etab b{margin-right:8px}.etab .tg{font-weight:800;font-size:11.5px}.etab .rf{margin-left:auto;color:#5E7091;font-size:10.5px;padding-left:8px;overflow:hidden;text-overflow:ellipsis}
.code{position:relative;flex:1;min-height:0;overflow:auto;padding:6px 0 30px;font-size:var(--code)}
.cl{display:flex;min-height:var(--lh);line-height:var(--lh);transition:background .3s}
.cl .ln{width:42px;flex:none;text-align:right;padding-right:12px;color:#3F5070;user-select:none}
.cl .tx{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:10px;padding-left:2.2em;text-indent:-2.2em}
.app[data-diff="1"] .cl.add{background:rgba(46,163,107,.07)}.app[data-diff="1"] .cl.add .ln{box-shadow:inset -3px 0 #2EA36B;color:#5E8C77}
.cl[data-c=ok]{--hl:rgba(52,211,153,.13);--hb:#34D399}.cl[data-c=diff]{--hl:rgba(251,191,36,.15);--hb:#FBBF24}.cl[data-c=fail]{--hl:rgba(248,113,113,.15);--hb:#F87171}.cl[data-c=unk]{--hl:rgba(148,163,184,.14);--hb:#94A3B8}
.cl mark.xm{background:transparent;color:inherit;border-radius:4px;padding:1px 2px;outline:1px solid transparent;transition:all .3s}
.cl b.op{background:transparent;color:inherit;border-radius:3px;padding:0 3px;margin:0 1px;transition:all .3s}
.lens{display:none;align-items:center;min-height:calc(var(--lh) + 2px);font-family:'Pretendard Variable','Noto Sans KR','Malgun Gothic',sans-serif;font-size:11.5px;animation:lensIn .35s both}
.lens .ln{width:42px;flex:none}.lens .lt{padding:1px 9px;border-radius:5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 50px)}
.lens.ok .lt{background:rgba(52,211,153,.14);color:#6EE7B7}.lens.diff .lt{background:rgba(251,191,36,.16);color:#FCD34D}.lens.fail .lt{background:rgba(248,113,113,.16);color:#FCA5A5}.lens.unk .lt{background:rgba(148,163,184,.16);color:#CBD5E1}
@keyframes lensIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
.k{color:#C792EA}.s{color:#9ED8A6}.n{color:#F2A07B}.f{color:#82AAFF}.ty{color:#7FDBCA}.c{color:#5C6F8F;font-style:italic}.p{color:#9DB7E0}.pu{color:#7F93B8}
.term{grid-row:3;grid-column:3;background:#07101C;border-top:1px solid #16243C;display:flex;flex-direction:column;overflow:hidden}
.ttabs{height:30px;flex:none;display:flex;align-items:center;gap:16px;padding:0 14px;border-bottom:1px solid #14223A;font-size:11.5px;color:#6B7D9A}
.tt{padding:6px 0;border-bottom:2px solid transparent}.app[data-term=diff] .tt[data-t=diff],.app[data-term=test] .tt[data-t=test]{color:#E6EDF8;border-color:#4285E8}
.tsp{flex:1}.tnote{font-size:10.5px}
.tbody{flex:1;min-height:0;overflow:auto;padding:6px 14px;font-size:calc(var(--code) - .5px)}
.tv{display:none}.app[data-term=none] .tv[data-t=none],.app[data-term=diff] .tv[data-t=diff],.app[data-term=test] .tv[data-t=test]{display:block}
.trow{display:flex;align-items:center;gap:8px;line-height:1.75;color:#AEBBD0;flex-wrap:wrap;border-radius:5px;padding:0 6px;transition:background .3s}
.trow.th{color:#7D8FAB;margin-top:2px}.tref{color:#5E7091;font-size:.92em}.tw{color:#E6EDF8;min-width:52px}
.tbody .tw,.tbody .tref,.tbody em,.tbody .mute{font-family:'Pretendard Variable','Noto Sans KR','Malgun Gothic',sans-serif}
.df{color:#AEBBD0}.df b{color:#6EE7B7}.df em{font-style:normal;color:#C084FC;font-size:.9em}
.tk{width:14px;text-align:center;font-weight:900}.tk.ok{color:#34D399}.tk.no{color:#F87171}.tmsg{color:#FCA5A5;font-size:.92em}
.app[data-failhi="1"] .trow.fail{background:rgba(248,113,113,.14);box-shadow:inset 3px 0 #F87171}
.mute{color:#5E7091}.cur{display:inline-block;width:8px;height:15px;background:#5E7091;vertical-align:-2px;animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.chat{grid-row:2/4;grid-column:4;background:#0B1526;border-left:1px solid #16243C;display:flex;flex-direction:column;overflow:hidden}
.vtag{margin-left:auto;font-size:10.5px;letter-spacing:0;color:#FCD34D;border:1px solid rgba(251,191,36,.45);border-radius:8px;padding:0 7px;font-weight:700}
.msgs{flex:1;min-height:0;overflow:auto;padding:12px}
.msg{border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.55;animation:rqIn .45s both}
.msg.me{background:#13284A;color:#E6EDF8}.msg.me ul{margin:6px 0 0 18px;color:#C9D5E8}
.msg.ai{background:#0F1D33;border:1px solid #1C2B46}.msg.ai[data-n="3"]{animation-delay:.6s}
.who{font-size:11px;font-weight:800;color:#8A9BB8;margin-bottom:4px;display:flex;align-items:center}.who span{font-weight:600;margin-left:4px;color:#6B7D9A}
.msg p{color:#E6EDF8}.cl3{list-style:none;margin:6px 0 0;color:#C9D5E8;font-size:12px}.cl3 li{margin-bottom:2px}
.mf{margin-top:7px;font-size:11px;color:#7D8FAB}.mf code{font-size:10.5px;margin-left:3px}
.done{margin-top:7px;display:inline-block;font-size:11px;font-weight:800;color:#6EE7B7;background:rgba(52,211,153,.12);border-radius:7px;padding:1px 8px}
.app[data-chat="0"] .msg{display:none}.app[data-chat="1"] .msg[data-n="2"],.app[data-chat="1"] .msg[data-n="3"],.app[data-chat="2"] .msg[data-n="3"]{display:none}
.cin{margin:10px 12px 12px;border:1px solid #1C2B46;border-radius:9px;padding:9px 12px;color:#4F6283;font-size:12px}
.ov{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(5,11,21,.88);backdrop-filter:blur(3px);padding:24px}
.app[data-ov=cover] .ov-cover,.app[data-ov=where] .ov-where{display:flex;animation:fade .4s both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.cv{max-width:1000px;text-align:center}
.kick{display:inline-block;color:#8DB5F4;font-weight:800;font-size:13px;letter-spacing:.08em;border:1px solid #27406B;border-radius:14px;padding:3px 14px;margin-bottom:22px}
.cv h1{font-size:clamp(28px,2.6vw,44px);line-height:1.3;color:#fff;letter-spacing:-.02em;margin-bottom:18px}
.cv p{font-size:clamp(15px,1.15vw,19px);line-height:1.8;color:#C9D5E8;margin-bottom:30px}.cv p b{color:#fff}.cv p .bl{color:#8DB5F4}
.f3{display:flex;align-items:stretch;justify-content:center;gap:14px;margin-bottom:30px}.f3>span{align-self:center;color:#4A6591;font-size:22px}
.f3 div{width:230px;border:1px solid #27406B;border-radius:14px;background:#0C1628;padding:16px 14px;display:flex;flex-direction:column;align-items:center;gap:4px}
.f3 i{font-style:normal;width:26px;height:26px;border-radius:50%;background:#4285E8;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
.f3 b{color:#fff;font-size:16px}.f3 small{color:#8A9BB8;font-size:12.5px}
.go,.btn{display:inline-block;background:#4285E8;color:#fff;border:0;border-radius:10px;padding:11px 26px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;text-decoration:none}.go:hover,.btn:hover{background:#3274DA}
.btn.ghost{background:transparent;border:1px solid #27406B;color:#AEBBD0}
.note{margin-top:20px;color:#6B7D9A;font-size:12px}
.wh{max-width:1180px;width:100%}.wh h2{text-align:center;color:#fff;font-size:clamp(22px,1.9vw,32px);margin-bottom:22px;letter-spacing:-.01em}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.wc{border:1px solid #27406B;border-radius:14px;background:#0C1628;padding:18px 18px 16px;display:flex;flex-direction:column}
.wt{align-self:flex-start;font-size:11px;font-weight:800;color:#8DB5F4;border:1px solid #27406B;border-radius:10px;padding:1px 9px;margin-bottom:10px}
.wc h3{color:#fff;font-size:18px;margin-bottom:6px}.wc p{color:#AEBBD0;font-size:13px;line-height:1.65;margin-bottom:14px}
.mini{margin-top:auto;border:1px solid #1C2B46;border-radius:10px;background:#0A1424;padding:11px 12px;font-size:12px}
.mi1{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:#C9D5E8}
.mph{color:#E6EDF8;font-weight:700;margin-bottom:4px}.bot{background:#1F57B5;color:#fff;border-radius:5px;padding:0 6px;font-size:11px;margin-right:4px}.mpc{color:#8A9BB8;margin-bottom:6px}.mpl{color:#C9D5E8;line-height:1.55;margin-bottom:3px}.mpl b{color:#FCD34D}.mpl:last-child b{color:#CBD5E1}
.mab{background:#0F1D33;border-radius:8px;padding:8px 10px;color:#E6EDF8;line-height:1.55}.mab b{color:#FCD34D}.mbt{display:flex;gap:6px;margin-top:8px}.mbt span{border:1px solid #27406B;border-radius:7px;padding:2px 10px;color:#9DB7E0;font-size:11.5px}
.now{margin:18px auto 0;text-align:center;color:#9DB7E0;font-size:13.5px}
.acts{display:flex;justify-content:center;gap:10px;margin-top:16px}
.nar{flex:none;min-height:112px;display:flex;align-items:center;gap:22px;padding:14px 22px;background:#050B15;border-top:1px solid #16243C}
.nno{width:64px;flex:none;color:#5E7091;font-size:14px;text-align:center}.nno b{display:block;color:#8DB5F4;font-size:30px;line-height:1.1}
.ntx{flex:1;min-width:0;animation:fade .35s both}
.ntx h2{color:#fff;font-size:clamp(17px,1.35vw,23px);letter-spacing:-.01em;margin-bottom:5px}
.ntx p{color:#C9D5E8;font-size:clamp(13.5px,1vw,16.5px);line-height:1.65}.ntx p b.ok{color:#6EE7B7}.ntx p b.diff{color:#FCD34D}.ntx p b.unk{color:#CBD5E1}
.nav{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:9px}
.nbt{display:flex;gap:8px}.nbt button{background:#10213D;border:1px solid #27406B;color:#E6EDF8;border-radius:8px;padding:7px 14px;font:inherit;font-weight:700;cursor:pointer}.nbt button:disabled{opacity:.35;cursor:default}.nbt #next{background:#4285E8;border-color:#4285E8}
.nbt #auto.on{background:#1F57B5;border-color:#4285E8}
.dots{display:flex;gap:6px}.dot{width:22px;height:6px;border-radius:3px;background:#1C2B46;border:0;cursor:pointer;padding:0}.dot.past{background:#2F4D80}.dot.on{background:#4285E8}
`;

const SCRIPT = String.raw`
(function(){
var D=JSON.parse(document.getElementById('cd').textContent),S=D.steps,app=document.querySelector('.app'),cur=-1,auto=null;
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function scrollPanes(show){
  var keys=(show||'').split(' ').filter(Boolean);
  $$('.pane .code').forEach(function(c){
    var lo=Infinity,hi=-Infinity;
    keys.forEach(function(k){
      $$('.lens[data-k="'+k+'"],.cl[data-k~="'+k+'"]',c).forEach(function(el){
        if(!el.offsetHeight)return;
        lo=Math.min(lo,el.offsetTop);hi=Math.max(hi,el.offsetTop+el.offsetHeight);
      });
    });
    var top=0,h=c.clientHeight;
    if(lo<Infinity){top=hi-lo<h*0.85?lo-(h-(hi-lo))*0.4:lo-24;}
    top=Math.max(0,top);
    try{c.scrollTo({top:top,behavior:'smooth'});}catch(e){c.scrollTop=top;}
  });
}
function state(s){
  app.setAttribute('data-side',s.side);app.setAttribute('data-show',s.show||'');app.setAttribute('data-term',s.term||'none');
  app.setAttribute('data-diff',s.diff?'1':'0');app.setAttribute('data-tl',s.tl?'1':'0');app.setAttribute('data-ov',s.ov||'');
  app.setAttribute('data-chat',String(s.chat||0));app.setAttribute('data-failhi',s.failhi?'1':'0');
  var f=(s.focus||'').split(' ').filter(Boolean);
  $$('.z').forEach(function(z){var on=f.indexOf(z.getAttribute('data-z'))>=0;z.classList.toggle('hot',on);z.classList.toggle('dim',f.length>0&&!on);});
  $$('.rq').forEach(function(r){r.classList.toggle('on',r.getAttribute('data-req')===s.sel);});
  $$('.dt').forEach(function(d){d.hidden=d.getAttribute('data-req')!==s.sel;});
  $$('.jd').forEach(function(j){var v=s.judge&&s.judge[j.getAttribute('data-j')];j.textContent=v||'미검토';j.classList.toggle('set',!!v);});
  scrollPanes(s.show);
}
function go(i){
  i=Math.max(0,Math.min(S.length-1,i));var prev=cur;cur=i;var s=S[i];
  app.setAttribute('data-step',String(i));
  state(s);
  if(s.scan&&prev<i){app.classList.remove('scanning');void app.offsetWidth;app.classList.add('scanning');setTimeout(function(){app.classList.remove('scanning');},1450);}
  else app.classList.remove('scanning');
  var t=$('.ntx');t.style.animation='none';void t.offsetWidth;t.style.animation='';
  $('#nt').innerHTML=s.title;$('#nb').innerHTML=s.body;
  $('#nno').innerHTML=i===0?'':'<b>'+i+'</b>/ '+(S.length-1);
  $$('.dot').forEach(function(d,k){d.classList.toggle('on',k===i);d.classList.toggle('past',k<i);});
  $('#prev').disabled=i===0;$('#next').textContent=i===S.length-1?'처음으로':i===0?'시작 →':'다음 →';
  try{history.replaceState(null,'','#s'+i);}catch(e){}
  if(auto&&i===S.length-1)stopAuto();
}
function next(){go(cur===S.length-1?0:cur+1);}
function stopAuto(){clearInterval(auto);auto=null;$('#auto').classList.remove('on');$('#auto').textContent='▶ 자동';}
$('#next').addEventListener('click',next);
$('#prev').addEventListener('click',function(){go(cur-1);});
$('#auto').addEventListener('click',function(){
  if(auto){stopAuto();return;}
  if(cur===S.length-1)go(0);
  auto=setInterval(function(){cur<S.length-1?go(cur+1):stopAuto();},D.autoMs);
  this.classList.add('on');this.textContent='❚❚ 멈춤';
});
$$('.dot').forEach(function(d,k){d.addEventListener('click',function(){go(k);});});
$$('[data-go]').forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-go'));});});
$$('.rq').forEach(function(r){r.addEventListener('click',function(){
  var id=r.getAttribute('data-req'),s=S[cur],x={};for(var k in s)x[k]=s[k];
  x.side='vl';x.sel=id;x.show=id+(D.unc===id?' dyn':'');x.focus='ed side';x.ov='';x.diff=1;x.term='test';x.chat=3;x.tl=D.first===id?1:0;x.failhi=0;
  state(x);
});});
document.addEventListener('keydown',function(e){
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;
  var k=e.key;
  if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();next();}
  else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(cur-1);}
  else if(k==='Home')go(0);else if(k==='End')go(S.length-1);
  else if(/^[0-9]$/.test(k))go(+k);
});
var m=/^#s(\d+)$/.exec(location.hash||'');
go(m?+m[1]:0);
})();
`;

export function renderConcept(report: Report): string {
  const F = report.summaries.find((s) => s.overall === '다름' || s.overall === '실패') ?? report.summaries[0];
  const U = report.summaries.find((s) => s.overall === '미확인' && s !== F);
  const file = report.sets.map((s) => s.perReq[F.req.id].evidence.unit?.file).find(Boolean) ?? Object.keys(report.sets[0].files).find((f) => !TEST_FILE.test(f)) ?? '';
  const infos = report.sets.map((s) => info(report, s));
  const S = steps(report, infos, F, U);
  const data = { steps: S, first: F.req.id, unc: U?.req.id ?? '', autoMs: 9000 };
  const mark = '<svg width="22" height="22" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="6"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/></svg>';
  const ico = (p: string) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#AEBBD0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const keys = [...report.summaries.map((s) => s.req.id), 'dyn'];
  const keyCss = keys
    .map((k) => `.app[data-show~="${k}"] .lens[data-k="${k}"]{display:flex}.app[data-show~="${k}"] .cl[data-k~="${k}"]{background:var(--hl);box-shadow:inset 3px 0 var(--hb)}.app[data-show~="${k}"] .cl[data-k~="${k}"] .ln{color:#E6EDF8}.app[data-show~="${k}"] .cl[data-k~="${k}"] mark.xm{background:rgba(251,191,36,.18);outline-color:rgba(251,191,36,.6)}.app[data-show~="${k}"] .cl[data-k~="${k}"] b.op{background:#FBBF24;color:#1A1203}`)
    .join('');
  const dots = S.map((_, i) => `<button class="dot" aria-label="${i}단계"></button>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VerifyLens 컨셉 시연</title><style>${CSS}${keyCss}</style></head>
<body>
<div class="app" data-step="0">
<div class="top"><div class="logo">${mark}<div>Verify<span>Lens</span></div></div><div class="meta">컨셉 시연 · 가상 사례(로그인 잠금)</div><span class="sp"></span><span class="badge">분석 결과는 프로토타입이 실제로 계산한 값 · AI 추정 없음</span><a href="report.html#${F.req.id}">전체 리포트 →</a></div>
<div class="frame">
<div class="tb"><i></i><i></i><i></i><b>login-service — ${esc(file)}</b><span class="sp"></span>결과 A · B 비교 보기</div>
<div class="act"><span class="a-files" title="탐색기">${ico('<path d="M4 4h6l2 2h8v13H4z"/>')}</span><span title="검색">${ico('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>')}</span><span title="소스 제어">${ico('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4-6 3-11 6"/>')}</span><span class="a-vl" title="VerifyLens">${mark.replace('width="22" height="22"', 'width="20" height="20"')}</span></div>
<div class="side z" data-z="side"><div class="sv sv-files">${explorer(infos, file)}</div><div class="sv sv-vl">${vlPanel(report)}</div></div>
<div class="ed z" data-z="ed">${infos.map((i) => pane(report, i, file)).join('')}</div>
<div class="term z" data-z="term">${bottom(infos)}</div>
<div class="chat z" data-z="chat">${chat(report, infos)}</div>
${cover()}${where(report, F, U)}
</div>
<div class="nar"><div class="nno" id="nno"></div><div class="ntx"><h2 id="nt"></h2><p id="nb"></p></div><div class="nav"><div class="nbt"><button id="prev">←</button><button id="next">다음 →</button><button id="auto">▶ 자동</button></div><div class="dots">${dots}</div></div></div>
</div>
<script type="application/json" id="cd">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>${SCRIPT}</script>
</body></html>`;
}

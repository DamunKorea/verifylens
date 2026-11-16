// VerifyLens 확장의 순수 로직. vscode 모듈을 쓰지 않아서 Node 에서 바로 시험할 수 있다.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyzeResult, evaluate } from '../../src/engine.ts';
import { parseRequirements } from '../../src/requirements.ts';
import { buildSampleRepo } from '../../src/demo.ts';
import { renderHtml } from '../../src/output.ts';
import { counts, renderSummaryMd } from '../../src/summary.ts';
import { git } from '../../src/git.ts';
import type { Overall, Report, ReqSummary, ResultSet } from '../../src/types.ts';

export type RepoParams = { repo: string; base: string; a: string; b?: string; reqFile: string; junitA?: string; junitB?: string; workingRef?: string };
export type DemoParams = { sampleDir: string; node: string | null; fallbackJunit: { a: string; b: string } };

export type Run = {
  kind: 'demo' | 'repo';
  repo: string;
  report: Report;
  /** 작업 폴더에 지금 체크아웃된 브랜치. 이 결과의 파일은 실제 파일로 연다. */
  workingRef?: string;
  /** 사용자에게 알릴 말 (예: 미리 만든 테스트 결과를 썼다) */
  notes: string[];
};

function readReqs(reqFile: string) {
  if (!existsSync(reqFile)) throw new Error(`요구사항 파일이 없습니다: ${reqFile}`);
  const reqs = parseRequirements(readFileSync(reqFile, 'utf8'));
  if (!reqs.length) throw new Error('요구사항을 읽지 못했습니다. 「- R1: 문장 | keywords: 영어 단어」 형식인지 확인하세요.');
  return reqs;
}

export function runDemo(p: DemoParams): Run {
  const env = buildSampleRepo({ sampleDir: p.sampleDir, node: p.node, fallbackJunit: p.fallbackJunit });
  const reqs = readReqs(env.reqFile);
  const sets = [
    analyzeResult({ key: 'A', repo: env.repo, base: 'main', ref: 'feature/lockout-a', junit: env.junitA }),
    analyzeResult({ key: 'B', repo: env.repo, base: 'main', ref: 'feature/lockout-b', junit: env.junitB }),
  ];
  const notes = env.testsFromFallback ? ['Node.js 22.18 이상을 찾지 못해 테스트는 미리 만들어 둔 결과(JUnit)를 썼습니다.'] : [];
  return { kind: 'demo', repo: env.repo, report: evaluate(sets, reqs, env.repo, 'main'), notes };
}

export function runRepo(p: RepoParams): Run {
  const reqs = readReqs(p.reqFile);
  for (const [ref, label] of [[p.base, '기준'], [p.a, '결과 A'], ...(p.b ? [[p.b, '결과 B']] : [])] as [string, string][]) {
    try {
      git(p.repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    } catch {
      throw new Error(`${label} 브랜치 「${ref}」를 찾지 못했습니다.`);
    }
  }
  for (const [j, label] of [[p.junitA, 'A'], [p.junitB, 'B']] as [string | undefined, string][]) {
    if (j && !existsSync(j)) throw new Error(`결과 ${label}의 테스트 보고서가 없습니다: ${j}`);
  }
  const sets = [analyzeResult({ key: 'A', repo: p.repo, base: p.base, ref: p.a, junit: p.junitA })];
  if (p.b) sets.push(analyzeResult({ key: 'B', repo: p.repo, base: p.base, ref: p.b, junit: p.junitB }));
  const notes: string[] = [];
  for (const s of sets) {
    if (!s.analyses.length) notes.push(`${s.label}(${s.ref})에는 ${p.base}와 비교해 바뀐 TypeScript · JavaScript 파일이 없습니다. 커밋된 변경만 봅니다.`);
  }
  if (!p.junitA && !p.junitB) notes.push('테스트 보고서(JUnit)를 주지 않아 검사는 모두 「미실행」으로 표시됩니다.');
  return { kind: 'repo', repo: p.repo, report: evaluate(sets, reqs, p.repo, p.base), workingRef: p.workingRef, notes };
}

// ---------------------------------------------------------------- git 도우미
export function gitRoot(dir: string): string | null {
  try {
    return git(dir, ['rev-parse', '--show-toplevel']).trim() || null;
  } catch {
    return null;
  }
}
export const currentBranch = (repo: string) => git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
export const localBranches = (repo: string) =>
  git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').map((s) => s.trim()).filter(Boolean);

/** 기준 브랜치 후보: main → master → develop 순으로, 지금 브랜치는 빼고 앞에 둔다. */
export function orderBases(branches: string[], current: string): string[] {
  const pref = ['main', 'master', 'develop', 'dev'];
  const rest = branches.filter((b) => b !== current);
  return [...pref.filter((p) => rest.includes(p)), ...rest.filter((b) => !pref.includes(b))];
}

/** Node 실행 파일이 22.18 이상인지 (데모 테스트가 TypeScript 라서 필요). */
export function nodeSupportsTs(node: string): boolean {
  try {
    const v = execFileSync(node, ['--version'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    const m = v.match(/^v(\d+)\.(\d+)/);
    if (!m) return false;
    const [maj, min] = [Number(m[1]), Number(m[2])];
    return maj > 22 || (maj === 22 && min >= 18);
  } catch {
    return false;
  }
}

export const REQ_TEMPLATE = `# 요구사항 — VerifyLens 가 이 파일을 읽습니다.
# 형식: - R번호: 요구사항 문장 | keywords: 코드에 나오는 영어 단어(쉼표로)
# 숫자(5회, 30분 등)를 쓰면 코드의 조건과 비교해 몇 번째에 동작하는지 계산합니다.
# 아래 두 줄은 예시입니다. 이번 작업의 요구사항으로 바꿔 쓰세요.
- R1: 올바른 비밀번호로 로그인할 수 있다 | keywords: login, password
- R2: 연속 5회 실패하면 계정을 잠근다 | keywords: failure, lock
`;

// ---------------------------------------------------------------- 화면에 보여 줄 모양
/** 좁은 옆 패널에서도 읽히게 label · detail 은 짧게, 긴 설명은 tooltip 에 둔다. */
export type EvidenceRow = { setKey: 'A' | 'B'; label: string; file?: string; line?: number; detail: string; tooltip: string };
export type ReqRow = { id: string; text: string; overall: Overall; summary: string; children: EvidenceRow[] };

function boundaryText(set: ResultSet, id: string): string {
  const b = set.perReq[id].evidence.boundary;
  if (!b || b.attempts === null) return '';
  return `${b.attempts}번째 시도에 동작${b.ok === false ? ` (요구사항 ${b.required}회)` : ''}`;
}

export function summaryLine(report: Report, s: ReqSummary): string {
  const id = s.req.id;
  if (s.overall === '다름') {
    const bad = report.sets.filter((x) => x.perReq[id].evidence.boundary?.ok === false);
    if (bad.length) return bad.map((x) => `${x.label}: ${boundaryText(x, id)}`).join(' · ');
    if (s.relation.kind === '불일치') return `두 결과의 조건이 다름 (${s.relation.detail})`;
    return '결과 사이에 검사 결과가 다름';
  }
  if (s.overall === '실패') return '연결된 검사가 실패';
  if (s.overall === '미확인') {
    if (report.sets.some((x) => x.perReq[id].evidence.status === '미발견')) return '구현 근거를 찾지 못함';
    return '연결된 검사가 없어 동작을 확인하지 못함';
  }
  return '근거를 찾았고 검사가 통과';
}

export function treeModel(report: Report): ReqRow[] {
  return report.summaries.map((s) => ({
    id: s.req.id,
    text: s.req.text,
    overall: s.overall,
    summary: summaryLine(report, s),
    children: report.sets.map((set) => {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      const bt = boundaryText(set, s.req.id);
      const b = rr.evidence.boundary;
      const when = b && b.attempts !== null ? `${b.attempts}번째 동작` : '';
      const who = `${set.label} (${set.ref})`;
      return {
        setKey: set.key,
        label: u ? `${set.key}  ${u.file.split('/').pop()}:${u.startLine}` : `${set.key}  근거 없음`,
        file: u?.file,
        line: u?.startLine,
        detail: [when, `검사 ${rr.testStatus}`].filter(Boolean).join(' · '),
        tooltip: u ? `${who} · ${u.file}:${u.startLine} · 검사 ${rr.testStatus}${bt ? ` · ${bt}` : ''}` : `${who} · 구현 근거를 찾지 못함 · 검사 ${rr.testStatus}`,
      };
    }),
  }));
}

/**
 * 근거가 된 코드 줄 하나에 붙일 표시.
 * head 는 줄 위(코드렌즈), note 는 줄 끝 설명, severity 는 이 결과만 놓고 본 심각도다
 * (전체 판정이 「다름」이어도 이 결과 자체가 맞으면 info).
 */
export type Lens = {
  setKey: 'A' | 'B';
  file: string;
  line: number;
  endLine: number;
  reqId: string;
  reqText: string;
  overall: Overall;
  severity: 'ok' | 'warn' | 'info';
  head: string;
  note: string;
  title: string;
};

export function allLenses(report: Report): Lens[] {
  const out: Lens[] = [];
  for (const set of report.sets) {
    for (const s of report.summaries) {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      if (!u) continue;
      const bt = boundaryText(set, s.req.id);
      const notes = [bt, `검사 ${rr.testStatus}`].filter(Boolean);
      const other = report.sets.find((x) => x.key !== set.key);
      if (other && s.relation.kind === '불일치') notes.push(`${other.key}와 조건 다름`);
      const bad = rr.testStatus === '실패' || rr.evidence.boundary?.ok === false;
      const long = [`VerifyLens ${s.req.id} · ${s.overall}`, bt, `검사 ${rr.testStatus}`, other && s.relation.kind === '불일치' ? 'A·B 조건 다름' : ''].filter(Boolean);
      out.push({
        setKey: set.key,
        file: u.file,
        line: u.startLine,
        endLine: u.kind === 'condition' ? u.endLine : u.startLine,
        reqId: s.req.id,
        reqText: s.req.text,
        overall: s.overall,
        severity: bad ? 'warn' : s.overall === '확인됨' ? 'ok' : 'info',
        head: `${s.req.id} · ${s.overall}`,
        note: notes.join(' · '),
        title: long.join(' · '),
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** 한 결과의 한 파일에서, 근거가 된 줄마다 붙일 표시 */
export function lensesFor(report: Report, setKey: string, file: string): Lens[] {
  return allLenses(report).filter((l) => l.setKey === setKey && l.file === file);
}

const cmdLink = (label: string, command: string, args: unknown[]) => `[${label}](command:${command}?${encodeURIComponent(JSON.stringify(args))})`;
const mdCode = (s: string) => '`' + s.replace(/`/g, "'").replace(/\|/g, '\\|') + '`';

/** 코드 줄에 마우스를 올렸을 때 보여 줄 근거 표 (마크다운). links 가 true 면 명령 링크를 붙인다. */
export function hoverMarkdown(report: Report, reqId: string, links = true): string | null {
  const s = report.summaries.find((x) => x.req.id === reqId);
  if (!s) return null;
  const out: string[] = [`**VerifyLens · ${s.req.id} · ${s.overall}**`, '', s.req.text, '', summaryLine(report, s), ''];
  out.push('| 결과 | 근거 | 동작 시점 | 검사 |', '|---|---|---|---|');
  const failed: string[] = [];
  for (const set of report.sets) {
    const rr = set.perReq[reqId];
    const u = rr.evidence.unit;
    const b = rr.evidence.boundary;
    const where = u ? `${mdCode(`${u.file.split('/').pop()}:${u.startLine}`)}${u.cond?.expr ? ' ' + mdCode(u.cond.expr) : u.kind === 'function' ? ' 함수 전체' : ''}` : '찾지 못함';
    const when = b && b.attempts !== null ? `${b.attempts}번째${b.ok === false ? ` ⚠ (요구 ${b.required}회)` : ''}` : '–';
    out.push(`| ${set.key} | ${where} | ${when} | ${rr.testStatus} |`);
    for (const t of rr.tests) {
      if (t.status !== 'fail') continue;
      const why = t.message.split('\n').map((x) => x.trim()).filter(Boolean).join(' ').slice(0, 140);
      failed.push(`- ${set.key} · ${mdCode(t.name)}${why ? ` — ${why.replace(/\|/g, '\\|')}` : ''}`);
    }
  }
  if (failed.length) out.push('', '실패한 검사', ...failed);
  if (links) {
    const acts = [cmdLink('근거 보기', 'verifylens.focusRequirement', [reqId])];
    if (diffTarget(report, reqId)) acts.push(cmdLink(report.sets.length > 1 ? 'A ↔ B 비교' : '기준과 비교', 'verifylens.openDiff', [reqId]));
    acts.push(cmdLink('판단 기록', 'verifylens.recordJudgment', [reqId]));
    out.push('', acts.join(' · '));
  }
  return out.join('\n');
}

export type DiffSide = { key: 'A' | 'B' | 'base'; ref: string; file: string; line: number };
/** 나란히 비교할 두 쪽. 결과가 둘이면 A ↔ B, 하나면 기준 ↔ 결과. 근거가 없으면 null. */
export function diffTarget(report: Report, reqId: string): { left: DiffSide; right: DiffSide; title: string } | null {
  const units = report.sets.map((set) => ({ set, u: set.perReq[reqId]?.evidence.unit ?? null }));
  const withUnit = units.filter((x) => x.u);
  if (!withUnit.length) return null;
  if (report.sets.length >= 2) {
    const [a, b] = units;
    const fa = a.u ?? b.u!;
    const fb = b.u ?? a.u!;
    return {
      left: { key: a.set.key, ref: a.set.ref, file: fa.file, line: fa.startLine },
      right: { key: b.set.key, ref: b.set.ref, file: fb.file, line: fb.startLine },
      title: `${reqId} · A ↔ B · ${fb.file.split('/').pop()}`,
    };
  }
  const { set, u } = withUnit[0];
  return {
    left: { key: 'base', ref: report.base, file: u!.file, line: u!.startLine },
    right: { key: set.key, ref: set.ref, file: u!.file, line: u!.startLine },
    title: `${reqId} · ${report.base} ↔ ${set.ref} · ${u!.file.split('/').pop()}`,
  };
}

/** 확인이 필요한 요구사항 수 (다름 · 실패 · 미확인) */
export function attentionCount(report: Report): number {
  return report.summaries.filter((s) => s.overall !== '확인됨').length;
}

export function statusText(report: Report): string {
  const c = counts(report);
  return `확인됨 ${c.확인됨} · 다름 ${c.다름} · 실패 ${c.실패} · 미확인 ${c.미확인}`;
}

/** 상태 표시줄용: 0 이 아닌 항목만 아이콘과 숫자로 */
export function statusIcons(report: Report): string {
  const c = counts(report);
  const parts = [c.확인됨 ? `$(pass) ${c.확인됨}` : '', c.다름 ? `$(diff) ${c.다름}` : '', c.실패 ? `$(error) ${c.실패}` : '', c.미확인 ? `$(question) ${c.미확인}` : ''].filter(Boolean);
  return `$(search) VerifyLens  ${parts.join('  ')}`;
}

/** 목록 위 한 줄: 무엇을 무엇과 비교했는지 */
export function contextLine(r: Run): string {
  const [a, b] = r.report.sets;
  if (r.kind === 'demo') return `샘플 · 결과 A ↔ 결과 B (기준 ${r.report.base})`;
  return b ? `${a.ref} ↔ ${b.ref} (기준 ${r.report.base})` : `${a.ref} ← ${r.report.base}`;
}

/** 판단이 어느 코드에 대한 것인지 구분하는 값. 코드가 바뀌면(커밋) 이전 판단은 쓰지 않는다. */
export const reportSig = (report: Report) => report.sets.map((s) => s.sha).join('+');

// ---------------------------------------------------------------- 바뀌면 다시 분석
export type WatchSpec = { repo: string; refs: string[]; files: string[] };
export function gitDir(repo: string): string {
  return git(repo, ['rev-parse', '--absolute-git-dir']).trim();
}
/** 브랜치가 가리키는 커밋과 입력 파일(요구사항 · 테스트 보고서)의 수정 시각. 이 값이 바뀌면 다시 분석한다. */
export function signature(spec: WatchSpec): string {
  const shas = spec.refs.map((r) => {
    try {
      return git(spec.repo, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).trim();
    } catch {
      return '-';
    }
  });
  const times = spec.files.map((f) => {
    try {
      const st = statSync(f);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return '-';
    }
  });
  return [...shas, ...times].join('|');
}

// ---------------------------------------------------------------- 리포트 웹뷰
export type Judgment = { judge: string; note: string };
export type WebviewOptions = { judgments?: Record<string, Judgment>; focus?: string };

/**
 * 리포트 HTML 을 VS Code 웹뷰용으로 바꾼다.
 * CSP · nonce, 인터뷰용 하단 바 숨김, 어두운 테마에서는 에디터 색을 따름,
 * 코드 줄을 누르면 에디터로 이동, 「나란히 비교」 단추, 판단을 확장과 주고받기.
 */
export function webviewHtml(report: Report, nonce: string, cspSource: string, opts: WebviewOptions = {}): string {
  let html = renderHtml(report, renderSummaryMd(report));
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">`;
  html = html.replace('<head>', `<head>${csp}`);
  html = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
  const D = 'body.vscode-dark';
  const css = `<style>
.bar{display:none!important}body{padding-bottom:0!important}
body{font-family:var(--vscode-font-family,inherit)}
code,.cl,.loc,.fnn,.mx th small,.ph .sub,.tl small{font-family:var(--vscode-editor-font-family,'Cascadia Mono',Consolas,monospace)!important}
svg.chain{width:100%;min-width:900px;height:auto}.card:has(>svg.chain){overflow-x:auto}
.det{scroll-margin-top:56px}
.pane .cl,.pane .loc{cursor:pointer}.pane .cl:hover{outline:1px solid var(--vscode-focusBorder,#4285E8);outline-offset:-1px}
.pane .loc::after{content:'↗ 에디터에서 열기';margin-left:10px;color:var(--vscode-textLink-foreground,#8DB5F4);font-family:var(--vscode-font-family,inherit)}.pane .loc:hover{text-decoration:underline}
.vl-acts{margin-left:auto;display:flex;gap:8px}
.vl-acts button{background:var(--vscode-button-background,#1F57B5);color:var(--vscode-button-foreground,#fff);border:1px solid var(--vscode-button-border,transparent);border-radius:4px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.vl-acts button:hover{background:var(--vscode-button-hoverBackground,#2B6AD0)}
.vl-acts button.sec{background:var(--vscode-button-secondaryBackground,#16294A);color:var(--vscode-button-secondaryForeground,#E6EDF8)}
.vl-acts button.sec:hover{background:var(--vscode-button-secondaryHoverBackground,#1D3660)}
.top{height:44px}.top .badge.g{display:none}
${D}{background:var(--vscode-editor-background)}
${D} .top{background:var(--vscode-editor-background);border-bottom-color:var(--vscode-panel-border,#1C2B46)}
${D} .ov,${D} .card{background:var(--vscode-sideBar-background,#0C1628);border-color:var(--vscode-panel-border,#1C2B46)}
${D} .pane{background:var(--vscode-editor-background);border-color:var(--vscode-panel-border,#1C2B46)}
${D} .ph{background:var(--vscode-sideBarSectionHeader-background,var(--vscode-sideBar-background));border-bottom-color:var(--vscode-panel-border,#1C2B46)}
${D} .lead{background:var(--vscode-sideBar-background,#0E1A2E);border-color:var(--vscode-panel-border,#1C2B46);border-left-color:var(--vscode-focusBorder,#4285E8)}
${D} .mx th,${D} .mx td,${D} .tt td{border-bottom-color:var(--vscode-panel-border,#1C2B46)}
${D} .mx tr.row:hover td{background:var(--vscode-list-hoverBackground,#0F1D35)}
${D} .mx tr.row.on td{background:var(--vscode-list-inactiveSelectionBackground,#11223F)}
${D} .judge select,${D} .judge textarea{background:var(--vscode-input-background,#0A1424);color:var(--vscode-input-foreground,#E6EDF8);border-color:var(--vscode-input-border,var(--vscode-panel-border,#27406B))}
${D} .tk{border-color:var(--vscode-sideBar-background,#0C1628)}
</style>`;
  const sets = JSON.stringify(report.sets.map((s) => s.key));
  const init = JSON.stringify({ judgments: opts.judgments ?? {}, focus: opts.focus ?? null }).replace(/</g, '\\u003c');
  const bridge = `<script nonce="${nonce}">(function(){var api=acquireVsCodeApi(),SETS=${sets},INIT=${init},seeding=false;
function all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;
var act=t.closest('[data-vl]');if(act){e.preventDefault();api.postMessage({type:act.getAttribute('data-vl'),id:act.getAttribute('data-id')});return;}
var hit=t.closest('.pane .cl, .pane .loc');if(!hit)return;
var pane=hit.closest('.pane'),list=Array.prototype.filter.call(pane.parentElement.children,function(x){return x.classList.contains('pane');});
var loc=pane.querySelector('.loc');if(!loc)return;var m=/^(.*):(\\d+)/.exec(loc.textContent.trim());if(!m)return;
var line=+m[2],ln=hit.classList.contains('cl')?hit.querySelector('.ln'):null;if(ln&&/^\\d+$/.test(ln.textContent))line=+ln.textContent;
api.postMessage({type:'open',set:SETS[list.indexOf(pane)],file:m[1],line:line});});
all('.det').forEach(function(det){var id=det.getAttribute('data-req'),dh=det.querySelector('.dh');if(!dh)return;
var w=document.createElement('span');w.className='vl-acts';
if(det.querySelector('.pane .loc'))w.innerHTML='<button data-vl="diff" data-id="'+id+'">'+(SETS.length>1?'A ↔ B 나란히 비교':'기준과 나란히 비교')+'</button>';
dh.appendChild(w);});
function apply(state){seeding=true;all('.judge').forEach(function(box){var r=state[box.getAttribute('data-req')]||{},sel=box.querySelector('select'),note=box.querySelector('textarea');
sel.value=r.judge||'미검토';note.value=r.note||'';sel.dispatchEvent(new Event('change'));});seeding=false;}
function onJudge(e){if(seeding||!e.target.closest)return;var box=e.target.closest('.judge');if(!box)return;
api.postMessage({type:'judge',id:box.getAttribute('data-req'),judge:box.querySelector('select').value,note:box.querySelector('textarea').value});}
document.addEventListener('change',onJudge,true);document.addEventListener('input',onJudge,true);
function sel(id){var r=document.querySelector('.mx tr.row[data-req="'+id+'"]');if(r)r.click();}
apply(INIT.judgments);if(INIT.focus)sel(INIT.focus);
window.addEventListener('message',function(e){var m=e.data||{};if(m.type==='select')sel(m.id);else if(m.type==='judgments')apply(m.state||{});});
})();</script>`;
  return html.replace('</head>', `${css}</head>`).replace('</body>', `${bridge}</body>`);
}

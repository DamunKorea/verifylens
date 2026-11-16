// VerifyLens 확장의 순수 로직. vscode 모듈을 쓰지 않아서 Node 에서 바로 시험할 수 있다.
import { existsSync, readFileSync } from 'node:fs';
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
export type EvidenceRow = { setKey: 'A' | 'B'; label: string; file?: string; line?: number; detail: string };
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
      return {
        setKey: set.key,
        label: set.label,
        file: u?.file,
        line: u?.startLine,
        detail: u ? `${u.file}:${u.startLine} · 검사 ${rr.testStatus}${bt ? ` · ${bt}` : ''}` : `근거 없음 · 검사 ${rr.testStatus}`,
      };
    }),
  }));
}

export type Lens = { line: number; endLine: number; reqId: string; overall: Overall; title: string };

/** 한 결과의 한 파일에서, 근거가 된 줄마다 붙일 표시 */
export function lensesFor(report: Report, setKey: string, file: string): Lens[] {
  const set = report.sets.find((x) => x.key === setKey);
  if (!set) return [];
  const out: Lens[] = [];
  for (const s of report.summaries) {
    const rr = set.perReq[s.req.id];
    const u = rr.evidence.unit;
    if (!u || u.file !== file) continue;
    const parts = [`VerifyLens ${s.req.id} · ${s.overall}`];
    const bt = boundaryText(set, s.req.id);
    if (bt) parts.push(bt);
    parts.push(`검사 ${rr.testStatus}`);
    if (report.sets.length === 2 && s.relation.kind === '불일치') parts.push('A·B 조건 다름');
    out.push({ line: u.startLine, endLine: u.kind === 'condition' ? u.endLine : u.startLine, reqId: s.req.id, overall: s.overall, title: parts.join(' · ') });
  }
  return out.sort((a, b) => a.line - b.line);
}

export function statusText(report: Report): string {
  const c = counts(report);
  return `확인됨 ${c.확인됨} · 다름 ${c.다름} · 실패 ${c.실패} · 미확인 ${c.미확인}`;
}

/** 리포트 HTML 을 VS Code 웹뷰용으로 바꾼다: CSP · nonce, 인터뷰용 하단 바 숨김, 코드 줄을 누르면 에디터로 이동. */
export function webviewHtml(report: Report, nonce: string, cspSource: string): string {
  let html = renderHtml(report, renderSummaryMd(report));
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">`;
  html = html.replace('<head>', `<head>${csp}`);
  html = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
  const css = `<style>.bar{display:none!important}body{padding-bottom:0!important}.pane .cl,.pane .loc{cursor:pointer}.pane .cl:hover{outline:1px solid #4285E8;outline-offset:-1px}.pane .loc:hover{text-decoration:underline}</style>`;
  const sets = JSON.stringify(report.sets.map((s) => s.key));
  const bridge = `<script nonce="${nonce}">(function(){var api=acquireVsCodeApi(),SETS=${sets};
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var hit=t.closest('.pane .cl, .pane .loc');if(!hit)return;
var pane=hit.closest('.pane'),list=Array.prototype.filter.call(pane.parentElement.children,function(x){return x.classList.contains('pane');});
var loc=pane.querySelector('.loc');if(!loc)return;var m=/^(.*):(\\d+)/.exec(loc.textContent.trim());if(!m)return;
var line=+m[2],ln=hit.classList.contains('cl')?hit.querySelector('.ln'):null;if(ln&&/^\\d+$/.test(ln.textContent))line=+ln.textContent;
api.postMessage({type:'open',set:SETS[list.indexOf(pane)],file:m[1],line:line});});
window.addEventListener('message',function(e){var m=e.data;if(m&&m.type==='select'){var r=document.querySelector('.mx tr.row[data-req="'+m.id+'"]');if(r)r.click();}});
})();</script>`;
  return html.replace('</head>', `${css}</head>`).replace('</body>', `${bridge}</body>`);
}

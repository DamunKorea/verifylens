import { chainSteps, type ChainStep, type ChainTone } from '../../src/evidenceSteps.ts';
import { light, marks } from '../../src/verdictStyle.ts';
import { stepTone } from '../../src/evidenceView.ts';
export { chainSteps, attemptDots, type ChainStep, type ChainTone } from '../../src/evidenceSteps.ts';
// VerifyLens 확장의 순수 로직. vscode 모듈을 쓰지 않아서 Node 에서 바로 시험할 수 있다.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyzeResult, evaluate } from '../../src/engine.ts';
import { draftRequirements, extractRequirements, parseRequirements } from '../../src/requirements.ts';
import { buildSampleRepo } from '../../src/demo.ts';
import { renderHtml } from '../../src/output.ts';
import { attention, counts, renderSummaryMd, undecidedReasons, type Attention } from '../../src/summary.ts';
import { git, mergeBase, uncommittedFiles, worktreeChangedFiles } from '../../src/git.ts';
import type { Overall, Report, ReqResult, ReqSummary, ResultSet } from '../../src/types.ts';
import { L, getLang, setLabel, testPhrase, wOverall, wTest } from '../../src/i18n.ts';
import { boundaryLine, boundaryShort, checkWord, pick, undecidedAction, undecidedLabel } from '../../src/numeric.ts';
import { testPointsLine } from '../../src/testpoints.ts';

export { L, getLang, resolveLang, setLang, wJudge, wOverall } from '../../src/i18n.ts';
export type { Lang } from '../../src/i18n.ts';

export type RepoParams = {
  repo: string;
  base: string;
  a: string;
  b?: string;
  reqFile: string;
  junitA?: string;
  junitB?: string;
  workingRef?: string;
  /** a 를 커밋이 아니라 지금 작업 폴더로 본다 (커밋 전 변경 · 새 파일 포함). a 는 체크아웃된 브랜치여야 한다. */
  worktree?: boolean;
};
const CODE_FILE = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
const mtime = (f: string) => {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};
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
  if (!existsSync(reqFile)) throw new Error(L(`요구사항 파일이 없습니다: ${reqFile}`, `The requirements file does not exist: ${reqFile}`));
  const reqs = parseRequirements(readFileSync(reqFile, 'utf8'));
  if (!reqs.length) throw new Error(L('요구사항을 읽지 못했습니다. 「- R1: 문장 | keywords: 영어 단어」 형식인지 확인하세요.', 'No requirements could be read. Each line must look like "- R1: sentence" (optionally followed by "| keywords: words, in, the, code").'));
  return reqs;
}

export function runDemo(p: DemoParams): Run {
  const env = buildSampleRepo({ sampleDir: p.sampleDir, node: p.node, fallbackJunit: p.fallbackJunit });
  const reqs = readReqs(env.reqFile);
  const sets = [
    analyzeResult({ key: 'A', repo: env.repo, base: 'main', ref: 'feature/lockout-a', junit: env.junitA }),
    analyzeResult({ key: 'B', repo: env.repo, base: 'main', ref: 'feature/lockout-b', junit: env.junitB }),
  ];
  const notes = env.testsFromFallback ? [L('Node.js 22.18 이상을 찾지 못해 테스트는 미리 만들어 둔 결과(JUnit)를 썼습니다.', 'Node.js 22.18 or later was not found, so the demo used bundled test results (JUnit) instead of running the tests.')] : [];
  return { kind: 'demo', repo: env.repo, report: evaluate(sets, reqs, env.repo, 'main'), notes };
}

export function runRepo(p: RepoParams): Run {
  const reqs = readReqs(p.reqFile);
  for (const [ref, label] of [[p.base, L('기준', 'base')], [p.a, setLabel('A')], ...(p.b ? [[p.b, setLabel('B')]] : [])] as [string, string][]) {
    try {
      git(p.repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    } catch {
      throw new Error(L(`${label} 브랜치 「${ref}」를 찾지 못했습니다.`, `Branch "${ref}" (${label}) was not found.`));
    }
  }
  for (const [j, label] of [[p.junitA, 'A'], [p.junitB, 'B']] as [string | undefined, string][]) {
    if (j && !existsSync(j)) throw new Error(L(`결과 ${label}의 테스트 보고서가 없습니다: ${j}`, `The test report for result ${label} does not exist: ${j}`));
  }
  // 테스트 결과가 코드보다 오래됐으면 쓰지 않는다. 고치기 전의 「통과」나 「실패」는 지금 코드에 대한 근거가 아니다.
  let junitA = p.junitA;
  let stale = false;
  if (p.worktree && junitA) {
    const from = mergeBase(p.repo, p.base);
    const newest = Math.max(0, ...worktreeChangedFiles(p.repo, from).filter((f) => CODE_FILE.test(f)).map((f) => mtime(join(p.repo, f))));
    if (mtime(junitA) + 1500 < newest) {
      stale = true;
      junitA = undefined;
    }
  }
  const sets = [analyzeResult({ key: 'A', repo: p.repo, base: p.base, ref: p.a, junit: junitA, worktree: p.worktree })];
  if (p.b) sets.push(analyzeResult({ key: 'B', repo: p.repo, base: p.base, ref: p.b, junit: p.junitB }));
  const notes: string[] = [];
  for (const s of sets) {
    if (s.analyses.length) continue;
    notes.push(
      p.worktree && s.key === 'A'
        ? L(`${p.base}와 비교해 바뀐 TypeScript · JavaScript 파일이 없습니다.`, `No TypeScript or JavaScript files changed compared to ${p.base}.`)
        : L(`${s.label}(${s.ref})에는 ${p.base}와 비교해 바뀐 TypeScript · JavaScript 파일이 없습니다. 커밋된 변경만 봅니다.`, `${s.label} (${s.ref}) has no TypeScript or JavaScript files changed compared to ${p.base}. Only committed changes are compared.`),
    );
  }
  if (stale) notes.push(L('테스트 결과가 코드보다 오래되어 쓰지 않았습니다. 테스트를 다시 실행하면 반영됩니다.', 'The test results are older than the code and were not used. Run the tests again to include them.'));
  else if (!junitA && !p.junitB) notes.push(L('테스트 결과가 없어 검사는 모두 「미실행」으로 표시됩니다. 테스트를 실행하면 채워집니다.', 'There are no test results, so every requirement shows "no test run". Run the tests to fill them in.'));
  const report = evaluate(sets, reqs, p.repo, p.base);
  report.testsStale = stale;
  return { kind: 'repo', repo: p.repo, report, workingRef: p.workingRef, notes };
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

const REQ_TEMPLATE_EN = `# Requirements — VerifyLens reads this file.
# Format: - R<number>: requirement sentence
# If you write a number (5 times, 30 minutes), it is compared with the condition in the code to compute when the code acts.
# If a requirement lands on the wrong code, append "| keywords: words, in, the, code" to pin it yourself.
# To pull requirements from an issue or a PR, run "VerifyLens: Import requirements" from the Command Palette.
# The two lines below are examples. Replace them with the requirements of this change.
- R1: Users can log in with the right password
- R2: Lock the account after 5 consecutive failures
`;

export const REQ_TEMPLATE = `# 요구사항 — VerifyLens 가 이 파일을 읽습니다.
# 형식: - R번호: 요구사항 문장
# 숫자(5회, 30분 등)를 쓰면 코드의 조건과 비교해 몇 번째에 동작하는지 계산합니다.
# 코드와 잘못 이어지면 뒤에 「| keywords: 코드에 나오는 영어 단어」를 붙여 직접 정할 수 있습니다.
# 이슈나 PR 글에서 가져오려면 명령 팔레트에서 「VerifyLens: Import requirements」를 실행하세요.
# 아래 두 줄은 예시입니다. 이번 작업의 요구사항으로 바꿔 쓰세요.
- R1: 올바른 비밀번호로 로그인할 수 있다
- R2: 연속 5회 실패하면 계정을 잠근다
`;
/** 지금 언어의 요구사항 파일 본보기 */
export const reqTemplate = (): string => L(REQ_TEMPLATE, REQ_TEMPLATE_EN);

// ---------------------------------------------------------------- 화면에 보여 줄 모양
/** 좁은 옆 패널에서도 읽히게 label · detail 은 짧게, 긴 설명은 tooltip 에 둔다. */
export type EvidenceRow = { setKey: 'A' | 'B'; label: string; file?: string; line?: number; detail: string; tooltip: string };
export type ReqRow = { id: string; text: string; overall: Overall; attention: Attention; reason: string; summary: string; children: EvidenceRow[] };

/** 한 줄 글 그림 (훅 메시지 · 명령줄): 요구사항 → 코드 줄 → 검사 → 동작 */
export function chainText(steps: ChainStep[]): string {
  const mark: Record<ChainTone, string> = { ok: '✓', diff: '✗', miss: '?', plain: '' };
  return steps
    .slice(1)
    .map((x) => `${x.title}: ${x.text}${mark[x.tone] && !x.text.includes('✗') ? ` ${mark[x.tone]}` : ''}`)
    .join(' → ');
}

/** GitHub 이 그려 주는 Mermaid 그림 (PR 요약 · Action 작업 요약). 글자는 Mermaid 이름표 규칙에 맞게 바꾼다 */
export function chainMermaid(reqId: string, steps: ChainStep[], overall?: Overall): string[] {
  const safe = (s: string) => s.replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/[`|]/g, "'");
  const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const key = reqId.replace(/[^A-Za-z0-9]/g, '');
  const ids = steps.map((_, i) => `${key}_${i}`);
  const node = (x: ChainStep, i: number) => `  ${ids[i]}["${safe(x.title)}<br/>${safe(short(x.text, x.kind === 'req' ? 46 : 52))}"]`;
  const lines = ['```mermaid', 'flowchart LR', ...steps.map(node), `  ${ids.join(' --> ')}`];
  for (const tone of ['ok', 'diff', 'fail', 'miss', 'plain'] as const) {
    const [ink, fill] = light[tone];
    lines.push(`  classDef ${tone} fill:${fill},stroke:${ink},color:${ink}${tone === 'miss' ? ',stroke-dasharray:5 4' : ''}`);
  }
  for (const tone of ['ok', 'diff', 'fail', 'miss', 'plain'] as const) {
    const of = steps.map((x, i) => (stepTone(x, overall) === tone ? ids[i] : '')).filter(Boolean);
    if (of.length) lines.push(`  class ${of.join(',')} ${tone}`);
  }
  lines.push('```');
  return lines;
}

/** 상태 옆에 붙일 짧은 이유. 「미확인」이 왜 미확인인지 한눈에 보이게 한다. */
function shortReason(report: Report, s: ReqSummary): string {
  // 「미확인」은 까닭을 종류로 보여 준다 (판단을 막은 것 두 가지까지)
  if (s.overall === '미확인') return undecidedReasons(report, s).slice(0, 2).map((k) => undecidedLabel(k)).join(' · ');
  if (s.overall === '실패') return L('검사 실패', 'a test fails');
  return '';
}

const isWide = (ch: string) => /[ᄀ-ᇿ　-鿿가-힣＀-￯]/.test(ch);
const wideCount = (s: string) => [...s].filter(isWide).length;
/**
 * 이름표들의 폭을 맞춘다. 한글은 고정폭 글꼴에서도 정확히 두 칸이 아니어서, 한글이 모자란 만큼은 전각 공백(한글과 같은 폭)으로,
 * 영문이 모자란 만큼은 보통 공백으로 채운다. 이렇게 해야 아래위 숫자가 같은 자리에 선다.
 */
function alignLabels(labels: string[]): string[] {
  const wide = Math.max(...labels.map(wideCount));
  const narrow = Math.max(...labels.map((l) => [...l].length - wideCount(l)));
  return labels.map((l) => l + '　'.repeat(wide - wideCount(l)) + ' '.repeat(narrow - ([...l].length - wideCount(l))));
}

/**
 * 시도 횟수별 동작 시점을 글자로 그린 줄들. [n] 이 동작하는 시도다.
 * 조건 값에서 계산한 것이라 「눈으로는 놓치는 한 글자 차이」를 그대로 보여 준다. 계산할 수 없으면 빈 배열.
 */
export function attemptLines(report: Report, reqId: string, lang: 'ko' | 'en' = getLang()): string[] {
  const rows = report.sets.map((set) => ({ set, b: set.perReq[reqId]?.evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return [];
  const req = rows[0].b!.required;
  const max = Math.max(req, ...rows.map((x) => x.b!.attempts as number));
  if (max > 12) return [];
  const two = report.sets.length > 1;
  const strip = (at: number) => Array.from({ length: max }, (_, i) => (i + 1 === at ? `[${i + 1}]` : ` ${i + 1} `)).join('');
  const lines: [string, string, string][] = [[lang === 'ko' ? '요구사항' : 'required', strip(req), '']];
  for (const { set, b } of rows) {
    const at = b!.attempts as number;
    const d = Math.abs(at - req);
    const note =
      at === req
        ? lang === 'ko' ? '✓ 요구사항과 같음' : '✓ matches'
        : lang === 'ko' ? `✗ ${d}회 ${at > req ? '늦음' : '빠름'}` : `✗ ${d} ${at > req ? 'late' : 'early'}`;
    lines.push([two ? (lang === 'ko' ? `결과 ${set.key}` : `result ${set.key}`) : lang === 'ko' ? '코드' : 'code', strip(at), note]);
  }
  const labels = alignLabels(lines.map((l) => l[0]));
  return lines.map(([, s, note], i) => `${labels[i]}  ${s}${note ? '  ' + note : ''}`.trimEnd());
}

/** 가장 앞에 내세울 한 줄: 요구사항 몇 개 중 몇 개가 근거와 검사로 확인됐는가 */
export function verifiedLine(report: Report, lang: 'ko' | 'en' = getLang()): string {
  const n = report.summaries.length;
  const v = report.summaries.filter((s) => s.overall === '확인됨').length;
  if (lang === 'en') {
    if (v === 0) return `None of the ${n} requirements is verified by evidence and tests yet`;
    return v === n ? `All ${n} requirements verified by evidence and tests` : `${v} of ${n} requirements verified by evidence and tests`;
  }
  if (v === 0) return `요구사항 ${n}개 중 근거와 검사로 확인된 것이 아직 없음`;
  return v === n ? `요구사항 ${n}개 모두 근거와 검사로 확인됨` : `요구사항 ${n}개 중 ${v}개만 근거와 검사로 확인됨`;
}

/**
 * 검사는 통과했는데, 조건 값에서 계산한 동작 시점이 요구사항과 다른 경우.
 * 테스트만 돌려서는 보이지 않는 어긋남이다 (코드와 검사가 같은 오해로 쓰였을 때 생긴다).
 */
export const passButOff = (rr: ReqResult): boolean => rr.testStatus === '통과' && rr.evidence.boundary?.ok === false;
/** 검사 결과를 짧게. 위 경우는 「검사는 통과」라고 써서 어긋남이 드러나게 한다. */
const testWord = (rr: ReqResult): string => (passButOff(rr) ? L('검사는 통과', 'but the test passes') : testPhrase(rr.testStatus));
/** 요구사항 하나에서 위 경우에 해당하는 결과들 */
export function passButOffSets(report: Report, reqId: string): ResultSet[] {
  return report.sets.filter((x) => x.perReq[reqId] && passButOff(x.perReq[reqId]));
}
export const PASS_BUT_OFF_NOTE = '검사는 통과했지만, 조건 값에서 계산한 동작 시점이 요구사항과 다릅니다. 검사가 요구사항과 같은 횟수를 확인하는지 검사 코드를 보세요.';
export const passButOffNote = (rr?: ReqResult): string => {
  const b = rr?.evidence.boundary;
  if (b && b.attempts === null)
    return L(`검사는 통과했지만, 조건의 경계가 요구사항과 다릅니다. 검사가 요구사항과 같은 ${checkWord(b, 'ko')}을 확인하는지 검사 코드를 보세요.`.replace('횟수을', '횟수를'), `The test passes, but the boundary in the condition differs from the requirement. Check in the test code that it exercises the same ${checkWord(b, 'en')} as the requirement.`);
  return L(PASS_BUT_OFF_NOTE, 'The test passes, but the attempt computed from the condition differs from the requirement. Check in the test code that it exercises the same count as the requirement.');
};

/** 샘플을 돌린 직후 보여 줄 말: AI 의 「완료」와 확인된 사실의 차이 */
export function demoHeadline(report: Report): string {
  const n = report.summaries.length;
  const v = report.summaries.filter((s) => s.overall === '확인됨').length;
  const allGreen = report.sets.every((s) => s.tests.length > 0 && s.tests.every((t) => t.status !== 'fail'));
  if (allGreen)
    return L(
      `AI는 두 결과 모두 「요구사항 전부 반영, 완료」라고 답했고, 테스트도 전부 통과했습니다. 그런데 근거와 검사로 확인된 것은 ${n}개 중 ${v}개입니다.`,
      `The AI said "all requirements implemented, done" for both results, and every test passes. Yet only ${v} of ${n} requirements are verified by evidence and tests.`,
    );
  return L(
    `AI는 두 결과 모두 「요구사항 전부 반영, 완료」라고 답했습니다. 근거와 검사로 확인된 것은 ${n}개 중 ${v}개입니다.`,
    `The AI said "all requirements implemented, done" for both results. ${v} of ${n} requirements are verified by evidence and tests.`,
  );
}

function boundaryText(set: ResultSet, id: string): string {
  return boundaryLine(set.perReq[id].evidence.boundary);
}

export function summaryLine(report: Report, s: ReqSummary): string {
  const id = s.req.id;
  if (s.overall === '다름') {
    const bad = report.sets.filter((x) => x.perReq[id].evidence.boundary?.ok === false);
    if (bad.length) {
      const line = bad.map((x) => (report.sets.length > 1 ? `${x.label}: ` : '') + boundaryText(x, id)).join(' · ');
      return bad.every((x) => passButOff(x.perReq[id])) ? `${line} — ${L('검사는 통과', 'but the test passes')}` : line;
    }
    if (s.relation.kind === '불일치') return L(`두 결과의 조건이 다름 (${s.relation.detail})`, `the two results use different conditions (${s.relation.detail})`);
    return L('결과 사이에 검사 결과가 다름', 'the test results differ between the results');
  }
  if (s.overall === '실패') return L('연결된 검사가 실패', 'a linked test fails');
  if (s.overall === '미확인') {
    if (report.sets.some((x) => x.perReq[id].evidence.status === '미발견')) return L('구현 근거를 찾지 못함', 'no implementation evidence found');
    const open = report.sets.flatMap((x) => {
      const e = x.perReq[id].evidence;
      const tag = report.sets.length > 1 ? `${x.label}: ` : '';
      return [...(e.boundaries ?? []).filter((b) => b.ok === null).map((b) => tag + boundaryLine(b)), ...(e.caveat ? [tag + pick(e.caveat)] : [])];
    });
    if (open.length) return open.join(' · ');
    if (report.testsStale) return L('테스트 결과가 코드보다 오래되어 쓰지 않음 — 테스트를 다시 실행해야 함', 'test results are older than the code and were not used — run the tests again');
    return L('연결된 검사가 없어 동작을 확인하지 못함', 'no linked test, so the behavior is not confirmed');
  }
  return L('근거를 찾았고 검사가 통과', 'evidence found and the tests pass');
}

/**
 * 옆 패널의 맨 위에 둘 것과 접어 둘 것. 다름 · 실패, 그다음 사람이 볼 미확인을 위에 두고,
 * 확인됨과 검사만 없는 미확인은 「나머지」로 접는다. 위에 둘 것이 없으면 모두 rest 에 요구사항 순서대로 둔다.
 */
export function treeGroups(rows: ReqRow[]): { top: ReqRow[]; rest: ReqRow[]; restNote: string } {
  const top = [...rows.filter((r) => r.attention === 'fix'), ...rows.filter((r) => r.attention === 'look')];
  const rest = rows.filter((r) => r.attention === 'ok' || r.attention === 'tests');
  const ok = rest.filter((r) => r.attention === 'ok').length;
  const tests = rest.length - ok;
  const restNote = [ok ? `${wOverall('확인됨')} ${ok}` : '', tests ? L(`검사만 없음 ${tests}`, `no test only ${tests}`) : ''].filter(Boolean).join(' · ');
  return { top, rest, restNote };
}

export function treeModel(report: Report): ReqRow[] {
  return report.summaries.map((s) => ({
    id: s.req.id,
    text: s.req.text,
    overall: s.overall,
    attention: attention(report, s),
    reason: shortReason(report, s),
    summary: summaryLine(report, s),
    children: report.sets.map((set) => {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      const bt = boundaryText(set, s.req.id);
      const when = boundaryShort(rr.evidence.boundary);
      const who = `${set.label} (${set.ref})`;
      return {
        setKey: set.key,
        // 결과가 하나뿐이면 「A」를 붙이지 않는다 (브랜치 하나만 확인할 때)
        label: (report.sets.length > 1 ? `${set.key}  ` : '') + (u ? `${u.file.split('/').pop()}:${u.startLine}` : L('근거 없음', 'no evidence')),
        file: u?.file,
        line: u?.startLine,
        detail: [when, testWord(rr)].filter(Boolean).join(' · '),
        tooltip: u ? `${who} · ${u.file}:${u.startLine} · ${testWord(rr)}${bt ? ` · ${bt}` : ''}${passButOff(rr) ? ` — ${passButOffNote(rr)}` : ''}` : `${who} · ${L('구현 근거를 찾지 못함', 'no implementation evidence found')} · ${testPhrase(rr.testStatus)}`,
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
      const notes = [bt, testWord(rr)].filter(Boolean);
      const other = report.sets.find((x) => x.key !== set.key);
      if (other && s.relation.kind === '불일치') notes.push(L(`${other.key}와 조건 다름`, `condition differs from ${other.key}`));
      const bad = rr.testStatus === '실패' || rr.evidence.boundary?.ok === false;
      const long = [`VerifyLens ${s.req.id} · ${wOverall(s.overall)}`, bt, testWord(rr), other && s.relation.kind === '불일치' ? L('A·B 조건 다름', 'A and B use different conditions') : ''].filter(Boolean);
      out.push({
        setKey: set.key,
        file: u.file,
        line: u.startLine,
        endLine: u.kind === 'condition' ? u.endLine : u.startLine,
        reqId: s.req.id,
        reqText: s.req.text,
        overall: s.overall,
        severity: bad ? 'warn' : s.overall === '확인됨' ? 'ok' : 'info',
        head: `${s.req.id} · ${wOverall(s.overall)}`,
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
const mdCell = (s: string) => s.replace(/\|/g, '\\|');
const mdCode = (s: string) => '`' + s.replace(/`/g, "'").replace(/\|/g, '\\|') + '`';

/** 코드 줄에 마우스를 올렸을 때 보여 줄 근거 표 (마크다운). links 가 true 면 명령 링크를 붙인다. */
export function hoverMarkdown(report: Report, reqId: string, links = true): string | null {
  const s = report.summaries.find((x) => x.req.id === reqId);
  if (!s) return null;
  const two = report.sets.length > 1;
  const out: string[] = [`**VerifyLens · ${s.req.id} · ${wOverall(s.overall)}** — ${s.req.text}`, '', summaryLine(report, s)];
  // 검사는 통과했는데 계산과 다른 경우의 설명은 표보다 위에 둔다 (hover 가 길면 아래쪽이 잘려 보이지 않는다).
  const reasons = undecidedReasons(report, s);
  if (reasons.length) out.push('', `**${L('미확인 이유', 'Why unverified')}**`, ...reasons.map((k) => `- ${undecidedLabel(k)} — ${undecidedAction(k)}`));
  const off = passButOffSets(report, reqId);
  if (off.length) out.push('', `⚠ ${two ? `${off.map((x) => x.label).join(' · ')}: ` : ''}${passButOffNote(off[0].perReq[reqId])}`);
  const strip = attemptLines(report, reqId);
  if (strip.length) out.push('', '```', ...strip, '```');
  const cols = L('| 근거 | 동작 시점 | 검사 |', '| Evidence | Acts on | Tests |');
  out.push('', two ? `| ${L('결과', 'Result')} ${cols}` : cols, two ? '|---|---|---|---|' : '|---|---|---|');
  const failed: string[] = [];
  for (const set of report.sets) {
    const rr = set.perReq[reqId];
    const u = rr.evidence.unit;
    const b = rr.evidence.boundary;
    const where = u ? `${mdCode(`${u.file.split('/').pop()}:${u.startLine}`)}${u.cond?.expr ? ' ' + mdCode(u.cond.expr) : u.kind === 'function' ? L(' 함수 전체', ' whole function') : ''}` : L('찾지 못함', 'not found');
    const when = !b ? '–' : b.attempts !== null ? L(`${b.attempts}번째${b.ok === false ? ` ⚠ (요구 ${b.required}회)` : ''}`, `attempt ${b.attempts}${b.ok === false ? ` ⚠ (required: ${b.required})` : ''}`) : `${b.ok === true ? '' : '⚠ '}${mdCell(boundaryLine(b))}`;
    out.push(`| ${two ? `${set.key} | ` : ''}${where} | ${when} | ${wTest(rr.testStatus)} |`);
    for (const t of rr.tests) {
      if (t.status !== 'fail') continue;
      const why = t.message.split('\n').map((x) => x.trim()).filter(Boolean).join(' ').slice(0, 140);
      failed.push(`- ${two ? `${set.key} · ` : ''}${mdCode(t.name)}${why ? ` — ${why.replace(/\|/g, '\\|')}` : ''}`);
    }
  }
  if (failed.length) out.push('', L('실패한 검사', 'Failed tests'), ...failed);
  const points = s.overall === '확인됨' ? '' : testPointsLine(s.req);
  if (points) out.push('', `**${L('경계에서 시험할 값', 'Values to test at the boundary')}** ${points}`);
  if (links) {
    const acts = [cmdLink(L('근거 보기', 'Show evidence'), 'verifylens.focusRequirement', [reqId])];
    if (diffTarget(report, reqId)) acts.push(cmdLink(two ? L('A ↔ B 비교', 'Compare A ↔ B') : L('기준과 비교', 'Compare with base'), 'verifylens.openDiff', [reqId]));
    acts.push(cmdLink(L('판단 기록', 'Record decision'), 'verifylens.recordJudgment', [reqId]));
    out.push('', acts.join(' · '));
  }
  out.push('', L('_출처: 조건식은 코드 분석 · 동작 시점은 계산 · 검사는 실행 기록(JUnit) — AI 추정 없음_', '_Source: the condition comes from code analysis · the attempt is computed · tests come from the executed report (JUnit) — no AI inference_'));
  if (s.req.auto) out.push('', L('_키워드를 적지 않아 용어집으로 코드와 이었습니다. 근거 줄이 맞는지 확인하세요._', '_No keywords were given, so this requirement was linked to code by its own words. Check that the evidence line is the right one._'));
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
  return (['확인됨', '다름', '실패', '미확인'] as const).map((k) => `${wOverall(k)} ${c[k]}`).join(' · ');
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
  if (r.kind === 'demo') return L(`샘플 · 결과 A ↔ 결과 B (기준 ${r.report.base})`, `Sample · Result A ↔ Result B (base ${r.report.base})`);
  return b ? L(`${a.ref} ↔ ${b.ref} (기준 ${r.report.base})`, `${a.ref} ↔ ${b.ref} (base ${r.report.base})`) : `${a.ref}${a.wip ? L(' + 커밋 전 변경', ' + uncommitted changes') : ''} ← ${r.report.base}`;
}

/** 판단이 어느 코드에 대한 것인지 구분하는 값. 코드가 바뀌면(커밋) 이전 판단은 쓰지 않는다. */
export const reportSig = (report: Report) => report.sets.map((s) => s.sha + (s.wip ? `~${s.wip}` : '')).join('+');

// ---------------------------------------------------------------- 바뀌면 다시 분석
export type WatchSpec = { repo: string; refs: string[]; files: string[]; worktree?: boolean };
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
  // 작업 폴더를 볼 때는 커밋 전에 손댄 코드 파일의 상태도 넣는다 (저장하면 값이 바뀐다).
  let dirty: string[] = [];
  if (spec.worktree) {
    try {
      dirty = uncommittedFiles(spec.repo).filter((f) => CODE_FILE.test(f)).sort().map((f) => {
        const p = join(spec.repo, f);
        return `${f}:${mtime(p)}:${existsSync(p) ? statSync(p).size : -1}`;
      });
    } catch {
      dirty = ['?'];
    }
  }
  return [...shas, ...times, ...dirty].join('|');
}

/**
 * 묻지 않고 고를 수 있는 기준 브랜치: 원격의 기본 브랜치, 없으면 main → master → develop → dev 순으로 있는 것.
 * 정할 수 없으면 null (그때는 사용자에게 묻는다).
 */
export function defaultBase(repo: string, current: string): string | null {
  const branches = localBranches(repo);
  try {
    const head = git(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '');
    if (head && head !== current && branches.includes(head)) return head;
  } catch {
    /* 원격이 없거나 기본 브랜치를 모른다 */
  }
  return ['main', 'master', 'develop', 'dev'].find((b) => b !== current && branches.includes(b)) ?? null;
}

// ---------------------------------------------------------------- 테스트 실행
export type TestPlan = { framework: string; command: string; report: string };
const DEFAULT_REPORTS = ['.verifylens/test-report.xml', '.verifylens/test-report.json', '.verifylens/junit.xml'];

/** 분석이 읽을 수 있는 테스트 결과 파일 후보 (설정한 경로가 있으면 그것만) */
export function reportCandidates(repo: string, setting = ''): string[] {
  return (setting.trim() ? [setting.trim()] : DEFAULT_REPORTS).map((r) => join(repo, r));
}
/** 지금 있는 테스트 결과 파일 가운데 가장 새것 */
export function findReport(repo: string, setting = ''): string | undefined {
  return reportCandidates(repo, setting).filter((f) => existsSync(f)).sort((a, b) => mtime(b) - mtime(a))[0];
}

/**
 * 테스트를 돌려 결과 파일을 남길 명령을 정한다. override(설정 verifylens.testCommand)가 있으면 그것을 쓰고(${report} 는 결과 파일 경로로 바꾼다),
 * 없으면 package.json 을 보고 Vitest · Jest · node:test 를 알아낸다. 알 수 없으면 null.
 */
export function detectTestPlan(repo: string, override = '', reportSetting = '', node = 'node'): TestPlan | null {
  const rel = (def: string) => reportSetting.trim() || def;
  if (override.trim()) {
    const r = rel('.verifylens/test-report.xml');
    return { framework: L('직접 지정', 'custom command'), command: override.trim().split('${report}').join(r), report: join(repo, r) };
  }
  let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  } catch {
    /* package.json 이 없거나 읽을 수 없다 */
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const script = pkg.scripts?.test ?? '';
  if (deps.vitest || /\bvitest\b/.test(script)) {
    const r = rel('.verifylens/test-report.xml');
    return { framework: 'Vitest', command: `npx vitest run --reporter=junit --outputFile=${r}`, report: join(repo, r) };
  }
  if (deps.jest || /\bjest\b/.test(script)) {
    const r = rel('.verifylens/test-report.json');
    return { framework: 'Jest', command: `npx jest --json --outputFile=${r}`, report: join(repo, r) };
  }
  let hasTests = /\bnode(\.exe)?\b.*\s--test\b/.test(script);
  if (!hasTests && !deps.mocha && !deps.ava && !deps.jasmine) {
    try {
      hasTests = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard']).split('\n').some((f) => /(\.test\.|\.spec\.)(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(f.trim()));
    } catch {
      hasTests = false;
    }
  }
  if (hasTests) {
    const r = rel('.verifylens/test-report.xml');
    const exe = /\s/.test(node) ? `"${node}"` : node;
    return { framework: 'node:test', command: `${exe} --test --test-reporter=junit --test-reporter-destination=${r}`, report: join(repo, r) };
  }
  return null;
}

// ---------------------------------------------------------------- 리포트 웹뷰
export type Judgment = { judge: string; note: string };
export type WebviewOptions = { judgments?: Record<string, Judgment>; focus?: string; demo?: boolean };

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
.pane .loc::after{content:'${L('↗ 에디터에서 열기', '↗ Open in editor')}';margin-left:10px;color:var(--vscode-textLink-foreground,#8DB5F4);font-family:var(--vscode-font-family,inherit)}.pane .loc:hover{text-decoration:underline}
.vl-acts{margin-left:auto;display:flex;gap:8px}
.vl-acts button{background:var(--vscode-button-background,#1F57B5);color:var(--vscode-button-foreground,#fff);border:1px solid var(--vscode-button-border,transparent);border-radius:4px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.vl-acts button:hover{background:var(--vscode-button-hoverBackground,#2B6AD0)}
.vl-acts button.sec{background:var(--vscode-button-secondaryBackground,#16294A);color:var(--vscode-button-secondaryForeground,#E6EDF8)}
.vl-acts button.sec:hover{background:var(--vscode-button-secondaryHoverBackground,#1D3660)}
.top{height:44px}
@media (max-width:980px){.top .meta{display:none}}
.vl-hero{border:1px solid #1C2B46;border-left:4px solid #FBBF24;border-radius:10px;background:#0E1A2E;padding:12px 16px;margin-bottom:14px}
.vl-hero.all{border-left-color:#34D399}
.vl-hero b{display:block;font-size:16px;color:#fff;letter-spacing:-.01em}
.vl-hero span{display:block;margin-top:3px;font-size:12.5px;color:#AEBBD0}
.vl-hero em{font-style:normal;color:#FCD34D;font-weight:700}
${D} .vl-hero{background:var(--vscode-sideBar-background,#0E1A2E);border-color:var(--vscode-panel-border,#1C2B46);border-left-color:#FBBF24}
${D} .vl-hero.all{border-left-color:#34D399}
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
  const cnt = counts(report);
  const need = (['다름', '실패', '미확인'] as const).map((k) => (cnt[k] ? `${wOverall(k)} ${cnt[k]}` : '')).filter(Boolean).join(' · ');
  const hero = {
    all: attentionCount(report) === 0,
    line: verifiedLine(report),
    need,
    sub: L(
      `${opts.demo ? 'AI는 두 결과 모두 「요구사항 전부 반영, 완료」라고 답했습니다. ' : ''}모든 표시는 코드 줄과 실행된 검사 기록으로 이어집니다. AI 의견은 들어 있지 않고, 확인하지 못한 것은 「미확인」으로 남깁니다.`,
      `${opts.demo ? 'The AI said "all requirements implemented, done" for both results. ' : ''}Every mark links to a code line or an executed test. There is no AI opinion in here, and anything that could not be checked stays "Not verified".`,
    ),
  };
  // 아래 글은 웹뷰의 스크립트 안 작은따옴표 문자열로 들어간다. 따옴표를 쓰지 않는다.
  const B = {
    copyTip: L('PR 설명이나 댓글에 붙여 넣을 검증 요약을 복사합니다', 'Copies a verification summary to paste into the PR description or a comment'),
    copy: L('PR 요약 복사', 'Copy PR summary'),
    badge: L('AI 추정 0건 · 이 PC에서만 분석', 'No AI inference · analyzed on this machine only'),
    diffAB: L('A ↔ B 나란히 비교', 'Compare A ↔ B side by side'),
    diffBase: L('기준과 나란히 비교', 'Compare with base side by side'),
  };
  const init = JSON.stringify({ judgments: opts.judgments ?? {}, focus: opts.focus ?? null, hero }).replace(/</g, '\\u003c');
  const bridge = `<script nonce="${nonce}">(function(){var api=acquireVsCodeApi(),SETS=${sets},INIT=${init},seeding=false;
function all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;
var act=t.closest('[data-vl]');if(act){e.preventDefault();api.postMessage({type:act.getAttribute('data-vl'),id:act.getAttribute('data-id')});return;}
var hit=t.closest('.pane .cl, .pane .loc');if(!hit)return;
var pane=hit.closest('.pane'),list=Array.prototype.filter.call(pane.parentElement.children,function(x){return x.classList.contains('pane');});
var loc=pane.querySelector('.loc');if(!loc)return;var m=/^(.*):(\\d+)/.exec(loc.textContent.trim());if(!m)return;
var line=+m[2],ln=hit.classList.contains('cl')?hit.querySelector('.ln'):null;if(ln&&/^\\d+$/.test(ln.textContent))line=+ln.textContent;
api.postMessage({type:'open',set:SETS[list.indexOf(pane)],file:m[1],line:line});});
(function(){var top=document.querySelector('.top'),vt=top&&top.querySelector('.vt');if(!top)return;
var w=document.createElement('span');w.className='vl-acts';w.style.marginLeft='0';w.innerHTML='<button class="sec" data-vl="copy" title="${B.copyTip}">${B.copy}</button>';
top.insertBefore(w,vt||null);
var bg=top.querySelector('.badge.g');if(bg)bg.textContent='${B.badge}';
var wrap=document.querySelector('.wrap');if(wrap&&INIT.hero){var h=document.createElement('div');h.className='vl-hero'+(INIT.hero.all?' all':'');
var b=document.createElement('b');b.textContent=INIT.hero.line;if(INIT.hero.need){var em=document.createElement('em');em.textContent='  ·  '+INIT.hero.need;b.appendChild(em);}
var sp=document.createElement('span');sp.textContent=INIT.hero.sub;h.appendChild(b);h.appendChild(sp);wrap.insertBefore(h,wrap.firstChild);}
})();
all('.det').forEach(function(det){var id=det.getAttribute('data-req'),dh=det.querySelector('.dh');if(!dh)return;
var w=document.createElement('span');w.className='vl-acts';
if(det.querySelector('.pane .loc'))w.innerHTML='<button data-vl="diff" data-id="'+id+'">'+(SETS.length>1?'${B.diffAB}':'${B.diffBase}')+'</button>';
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

// ---------------------------------------------------------------- PR 에 붙이는 검증 요약
export type SummaryLang = 'ko' | 'en';
const TXT = {
  ko: {
    title: 'VerifyLens 검증 요약',
    sample: '샘플(가상 사례)',
    base: '기준',
    wip: '커밋 안 된 변경 포함',
    stale: '테스트 결과가 코드보다 오래되어 쓰지 않음 — 다시 실행 필요',
    status: { 확인됨: `${marks.확인됨} 확인됨`, 다름: `${marks.다름} 다름`, 실패: `${marks.실패} 실패`, 미확인: `${marks.미확인} 미확인` } as Record<Overall, string>,
    count: { 확인됨: '확인됨', 다름: '다름', 실패: '실패', 미확인: '미확인' } as Record<Overall, string>,
    test: { 통과: '통과', 실패: '실패', 미실행: '미실행' } as Record<string, string>,
    judge: { 사용: '사용', 수정: '수정', '추가 검증': '추가 검증', 보류: '보류', 미검토: '미검토' } as Record<string, string>,
    cols: ['요구사항', '상태', '근거와 동작 (코드 분석 · 계산)', '검사 (실행 기록)', '판단 (작성자)'],
    notOpinion: 'AI가 쓴 의견이 아닙니다. 이 요약의 항목은 모두 코드 줄과 실행된 검사 기록에서 나왔고, 확인하지 못한 것은 통과로 치지 않았습니다.',
    when: '동작 시점 (조건 값에서 계산, [n] = 동작하는 시도)',
    chain: '근거 사슬 (요구사항 → 코드 줄 → 검사 → 동작 · 회색 점선 = 비어 있는 칸)',
    attempt: (n: number, req: number, ok: boolean | null) => (ok === false ? `${n}번째 시도에 동작 (요구사항 ${req}회)` : `${n}번째 시도에 동작`),
    noEvidence: '근거를 찾지 못함',
    whole: '함수 전체',
    failed: '실패한 검사',
    passOff: '검사는 통과했지만 계산과 다른 것',
    passOffLine: '검사가 통과했지만, 조건 값에서 계산한 동작 시점이 요구사항과 다름 — 검사가 요구사항과 같은 횟수를 확인하는지 볼 것',
    fix: (n: number) => `고쳐야 할 것 ${n}개 (다름 · 실패)`,
    none: '다름 · 실패인 요구사항이 없습니다.',
    look: (ids: string, n: number) => (ids ? `사람이 볼 것 — 미확인 중 코드나 문장을 봐야 하는 것 (${ids})` : `사람이 볼 것 ${n}개`),
    others: (n: number) => `나머지 요구사항 ${n}개`,
    all: (n: number) => `요구사항 ${n}개 표`,
    testsOnly: '검사가 없어서만 미확인인 것',
    points: '경계에서 시험할 값 (요구사항의 숫자에서 뽑음)',
    tryValues: '시험할 값:',
    notRun: '연결된 검사가 실행되지 않음',
    noImpl: '구현 근거를 찾지 못함',
    dyn: '해석하지 못한 호출',
    autoLink: (ids: string) => `${ids}: 키워드 없이 용어집으로 코드와 연결함 — 근거 줄은 작성자가 확인`,
    footer: (v: string) => `VerifyLens${v ? ' ' + v : ''} · 정적 분석과 실행된 검사 결과만 사용 (AI 추정 없음) · 판단은 작성자가 직접 기록`,
  },
  en: {
    title: 'VerifyLens verification summary',
    sample: 'Sample (fictional case)',
    base: 'base',
    wip: 'includes uncommitted changes',
    stale: 'test results are older than the code and were not used — re-run the tests',
    status: { 확인됨: `${marks.확인됨} Verified`, 다름: `${marks.다름} Different`, 실패: `${marks.실패} Failed`, 미확인: `${marks.미확인} Not verified` } as Record<Overall, string>,
    count: { 확인됨: 'Verified', 다름: 'Different', 실패: 'Failed', 미확인: 'Not verified' } as Record<Overall, string>,
    test: { 통과: 'Passed', 실패: 'Failed', 미실행: 'Not run' } as Record<string, string>,
    judge: { 사용: 'Use', 수정: 'Fix', '추가 검증': 'Verify more', 보류: 'Hold', 미검토: 'Not reviewed' } as Record<string, string>,
    cols: ['Requirement', 'Status', 'Evidence and behavior (code analysis · computed)', 'Tests (executed)', 'Decision (author)'],
    notOpinion: 'This is not an AI opinion. Every item in this summary comes from a code line or an executed test, and anything that could not be checked is not counted as passing.',
    when: 'When it acts (computed from the condition, [n] = the attempt that triggers it)',
    chain: 'Evidence chain (requirement → code line → tests → when it acts · grey dashed = missing)',
    attempt: (n: number, req: number, ok: boolean | null) => (ok === false ? `acts on attempt ${n} (requirement: ${req})` : `acts on attempt ${n}`),
    noEvidence: 'no evidence found',
    whole: 'whole function',
    failed: 'Failed tests',
    passOff: 'Tests pass, but the computed behavior differs',
    passOffLine: 'the linked test passes, but the attempt computed from the condition differs from the requirement — check that the test exercises the same count as the requirement',
    fix: (n: number) => `Needs a fix: ${n} (Different or Failed)`,
    none: 'No requirement is Different or Failed.',
    look: (ids: string, n: number) => (ids ? `Worth a look — not verified, and the code or the wording needs a check (${ids})` : `Worth a look (${n})`),
    others: (n: number) => `Other requirements (${n})`,
    all: (n: number) => `All requirements (${n})`,
    testsOnly: 'Not verified only because no test ran',
    points: "Values to test at the boundary (from the requirement's numbers)",
    tryValues: 'try',
    notRun: 'no linked test was run',
    noImpl: 'no implementation evidence found',
    dyn: 'Unresolved call',
    autoLink: (ids: string) => `${ids}: linked to code by a fixed glossary (no keywords given) — evidence lines checked by the author`,
    footer: (v: string) => `VerifyLens${v ? ' ' + v : ''} · static analysis and executed test results only (no AI inference) · decisions recorded by the author`,
  },
};

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const isJudged = (j?: Judgment) => !!j && !!j.judge && j.judge !== '미검토';

/** 확인이 필요한데(다름 · 실패 · 미확인) 아직 판단을 기록하지 않은 요구사항 수 */
export function pendingDecisions(report: Report, judgments: Record<string, Judgment>): number {
  return report.summaries.filter((s) => s.overall !== '확인됨' && !isJudged(judgments[s.req.id])).length;
}

/**
 * PR 설명이나 댓글에 붙여 넣을 검증 요약 (GitHub 마크다운).
 * 리뷰어가 같은 확인을 다시 하지 않도록: 요구사항마다 상태 · 근거 줄 · 동작 시점 · 검사 · 작성자의 판단을 표에 담는다.
 * 사람이 다 읽지 않아도 되게(0.14.0, OKKY 의견): 다름 · 실패만 펼치고, 볼 만한 미확인과 나머지 표는 접어 둔다.
 * 문제가 없으면 「다름 · 실패 없음」 한 줄이 본문의 전부다.
 */
export function prSummary(r: Run, judgments: Record<string, Judgment> = {}, opts: { lang?: SummaryLang; version?: string } = {}): string {
  const lang = opts.lang ?? getLang();
  const t = TXT[lang];
  const { report } = r;
  const two = report.sets.length > 1;
  const c = counts(report);
  const out: string[] = [`## ${t.title}`, '', `**${verifiedLine(report, lang)}**`, ''];
  const ref = (s: ResultSet) => `\`${s.ref}\` (\`${s.sha}\`${s.wip ? `, ${t.wip}` : ''})`;
  const scope = two ? `A ${ref(report.sets[0])} ↔ B ${ref(report.sets[1])} · ${t.base} \`${report.base}\`` : `${ref(report.sets[0])} ← \`${report.base}\``;
  out.push(`${r.kind === 'demo' ? `${t.sample} · ` : ''}${scope}`, '');
  out.push((['확인됨', '다름', '실패', '미확인'] as Overall[]).map((k) => `${t.count[k]} ${c[k]}`).join(' · '), '');
  const head = [`| ${t.cols.join(' | ')} |`, `|${t.cols.map(() => '---').join('|')}|`];
  const fixRows: string[] = [];
  const otherRows: string[] = [];
  const fixStrips: string[] = [];
  const otherStrips: string[] = [];
  const failed: string[] = [];
  const passOff: string[] = [];
  const look: string[] = [];
  const lookIds: string[] = [];
  const testsOnly: string[] = [];
  const points: string[] = [];
  // 근거 사슬 그림 (GitHub 이 Mermaid 로 그린다): 고칠 것과 사람이 볼 것에만 붙인다
  const fixChains: string[] = [];
  const lookChains: string[] = [];
  const otherChains: string[] = [];
  for (const s of report.summaries) {
    const id = s.req.id;
    const kind = attention(report, s);
    if (!two && s.overall !== '확인됨') (kind === 'fix' ? fixChains : kind === 'look' ? lookChains : otherChains).push(`**${id}**`, ...chainMermaid(id, chainSteps(report, id, lang), s.overall), '');
    const ev: string[] = [];
    const tests: string[] = [];
    const notRun: string[] = [];
    const notes: string[] = [];
    let noImpl = false;
    for (const set of report.sets) {
      const rr = set.perReq[id];
      const u = rr.evidence.unit;
      const b = rr.evidence.boundary;
      const pre = two ? `${set.key} ` : '';
      let e = u ? `\`${cell(`${u.file}:${u.startLine}`)}\`${u.cond?.expr ? ` \`${cell(u.cond.expr)}\`` : u.kind === 'function' ? ` ${t.whole}` : ''}` : t.noEvidence;
      if (b && b.attempts !== null) e += ` → ${t.attempt(b.attempts, b.required, b.ok)}`;
      else if (b) e += ` → ${cell(boundaryLine(b, lang))}`;
      ev.push(pre + e);
      tests.push(pre + (t.test[rr.testStatus] ?? rr.testStatus));
      if (rr.testStatus === '미실행') notRun.push(set.key);
      if (passButOff(rr)) passOff.push(`- ${id}${two ? ` · ${set.key}` : ''}: ${t.passOffLine}`);
      for (const x of rr.evidence.boundaries ?? []) if (x.ok === null) notes.push(`- ${id}${two ? ` · ${set.key}` : ''}: ${boundaryLine(x, lang)}`);
      if (rr.evidence.caveat) notes.push(`- ${id}${two ? ` · ${set.key}` : ''}: ${pick(rr.evidence.caveat, lang)}`);
      if (!u) noImpl = true;
      for (const tc of rr.tests) {
        if (tc.status !== 'fail') continue;
        const why = tc.message.split('\n').map((x) => x.trim()).filter(Boolean).join(' ').slice(0, 160);
        failed.push(`- ${id}${two ? ` · ${set.key}` : ''} · \`${tc.name.replace(/`/g, "'")}\`${why ? ` — ${why}` : ''}`);
      }
    }
    const j = judgments[id];
    const decision = isJudged(j) ? `**${t.judge[j.judge] ?? j.judge}**${j.note ? ` — ${cell(j.note)}` : ''}` : s.overall === '확인됨' ? '—' : t.judge.미검토;
    const row = `| **${id}** ${cell(s.req.text)} | ${t.status[s.overall]} | ${ev.join('<br>')} | ${tests.join('<br>')} | ${decision} |`;
    (kind === 'fix' ? fixRows : otherRows).push(row);
    const strip = attemptLines(report, id, lang);
    if (strip.length && (s.overall !== '확인됨' || two)) (kind === 'fix' ? fixStrips : otherStrips).push(`${id}`, ...strip, '');
    if (noImpl) notes.push(`- ${id}: ${t.noImpl}`);
    // 요구사항의 숫자에서 뽑은 경계값: 고칠 것과 검사가 없는 것에 붙인다 (테스트를 같은 착각으로 쓰지 않게)
    const pts = kind === 'ok' ? '' : testPointsLine(s.req, lang);
    if (pts && kind === 'fix') points.push(`- ${id}: ${pts}`);
    const untested = notRun.length ? `- ${id}: ${t.notRun}${two ? ` (${notRun.join(', ')})` : ''}${pts ? ` — ${t.tryValues} ${pts}` : ''}` : '';
    if (kind === 'tests') {
      if (untested) testsOnly.push(untested);
      continue;
    }
    if (kind === 'look') lookIds.push(id);
    look.push(...notes);
    if (untested && !noImpl && kind === 'look') look.push(untested);
  }
  for (const set of report.sets) {
    for (const d of set.dyn) {
      const line = `- ${t.dyn}${two ? ` (${set.key})` : ''}: \`${d.file}:${d.line}\` \`${d.text.replace(/`/g, "'")}\``;
      if (!look.includes(line)) look.push(line);
    }
  }
  if (report.testsStale) look.unshift(`- ${t.stale}`);
  const code = (lines: string[]) => ['```', ...lines.slice(0, -1), '```'];

  if (fixRows.length) {
    out.push(`### ${t.fix(fixRows.length)}`, '', ...head, ...fixRows);
    if (fixChains.length) out.push('', `**${t.chain}**`, '', ...fixChains.slice(0, -1));
    if (fixStrips.length) out.push('', `**${t.when}**`, ...code(fixStrips));
    if (failed.length) out.push('', `**${t.failed}**`, ...failed);
    if (passOff.length) out.push('', `**${t.passOff}**`, ...passOff);
    if (points.length) out.push('', `**${t.points}**`, ...points);
  } else {
    out.push(`**${t.none}**`);
  }
  // <details> 안의 마크다운은 <summary> 뒤에 빈 줄이 있어야 표 · 목록으로 보인다
  if (look.length || lookChains.length) out.push('', '<details>', `<summary>${t.look(lookIds.join(', '), look.length)}</summary>`, '', ...look, ...(lookChains.length ? ['', `**${t.chain}**`, '', ...lookChains.slice(0, -1)] : []), '', '</details>');
  if (otherRows.length) {
    out.push('', '<details>', `<summary>${fixRows.length ? t.others(otherRows.length) : t.all(otherRows.length)}</summary>`, '', ...head, ...otherRows);
    if (otherStrips.length) out.push('', `**${t.when}**`, ...code(otherStrips));
    if (testsOnly.length) out.push('', `**${t.testsOnly}**`, ...testsOnly);
    if (otherChains.length) out.push('', `**${t.chain}**`, '', ...otherChains.slice(0, -1));
    out.push('', '</details>');
  }
  const autoIds = report.summaries.filter((x) => x.req.auto).map((x) => x.req.id);
  out.push('', `<sub>${t.notOpinion}<br>${autoIds.length ? t.autoLink(autoIds.join(', ')) + '<br>' : ''}${t.footer(opts.version ?? '')}</sub>`, '');
  return out.join('\n');
}

// ---------------------------------------------------------------- 요구사항 가져오기 (GitHub PR · 이슈 · 복사한 글)
/** gh 명령을 실행해 표준 출력을 돌려주는 함수. 시험에서는 가짜로 바꿔 끼운다. */
export type GhRun = (args: string[]) => string;
export function ghRunner(cwd: string, gh = 'gh'): GhRun {
  return (args) => execFileSync(gh, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** gh 가 실패한 이유를 사람이 바로 고칠 수 있는 말로 바꾼다. */
export function ghError(e: unknown): string {
  const err = e as { code?: string; stderr?: string | Buffer; message?: string };
  if (err?.code === 'ENOENT') return L('GitHub CLI(gh)를 찾지 못했습니다. gh를 설치하거나 「복사한 글에서 가져오기」를 쓰세요.', 'GitHub CLI (gh) was not found. Install gh, or use "Copied text (clipboard)" instead.');
  const text = String(err?.stderr ?? err?.message ?? e);
  if (/no pull requests found/i.test(text)) return L('이 브랜치로 올린 PR을 찾지 못했습니다. PR을 먼저 올리거나 이슈 번호로 가져오세요.', 'No pull request was found for this branch. Open the PR first, or import from an issue number.');
  if (/gh auth login|not logged in|authentication/i.test(text)) return L('gh에 로그인되어 있지 않습니다. 터미널에서 gh auth login 을 실행한 뒤 다시 해 보세요.', 'gh is not logged in. Run "gh auth login" in a terminal and try again.');
  if (/could not resolve|not found|404/i.test(text)) return L('그 이슈나 PR을 찾지 못했습니다. 번호나 주소, 그리고 gh로 로그인한 계정의 권한을 확인하세요.', 'That issue or PR was not found. Check the number or URL, and the access of the account gh is logged in with.');
  if (/ETIMEDOUT|timed out/i.test(text)) return L('GitHub 응답이 늦어 중단했습니다. 잠시 뒤 다시 해 보세요.', 'GitHub took too long to answer. Try again in a moment.');
  return text.split('\n').map((x) => x.trim()).filter(Boolean)[0] ?? L('gh 실행에 실패했습니다.', 'gh failed to run.');
}

export type SourceText = { label: string; url: string; title: string; body: string };
type GhItem = { number?: number; title?: string; body?: string; url?: string };

/** 지금 브랜치(또는 ref)의 PR 글과, PR 이 닫는다고 연결한 이슈들의 글. 요구사항은 보통 이슈에 있어서 이슈를 앞에 둔다. */
export function fetchPr(run: GhRun, ref?: string): SourceText[] {
  const pr = JSON.parse(run(['pr', 'view', ...(ref ? [ref] : []), '--json', 'number,title,body,url,closingIssuesReferences'])) as GhItem & { closingIssuesReferences?: GhItem[] };
  const out: SourceText[] = [];
  for (const ref of pr.closingIssuesReferences ?? []) {
    if (!ref.url) continue;
    try {
      out.push(...fetchIssue(run, ref.url));
    } catch {
      /* 권한이 없는 이슈는 건너뛴다 */
    }
  }
  out.push({ label: `PR #${pr.number}`, url: pr.url ?? '', title: pr.title ?? '', body: pr.body ?? '' });
  return out;
}

export function fetchIssue(run: GhRun, ref: string): SourceText[] {
  const it = JSON.parse(run(['issue', 'view', ref.trim().replace(/^#/, ''), '--json', 'number,title,body,url'])) as GhItem;
  return [{ label: L(`이슈 #${it.number}`, `issue #${it.number}`), url: it.url ?? '', title: it.title ?? '', body: it.body ?? '' }];
}

/** 요구사항 파일에 들어 있는 요구사항 수 */
export const treeCount = (md: string) => parseRequirements(md).length;

/** 여러 글에서 요구사항 후보를 모은다. 같은 문장은 한 번만. */
export function requirementsFrom(texts: SourceText[]): { requirements: string[]; sources: string[] } {
  const seen = new Set<string>();
  const requirements: string[] = [];
  const sources: string[] = [];
  for (const t of texts) {
    let found = extractRequirements(t.body).filter((x) => !seen.has(x.toLowerCase()));
    let label = t.label;
    if (!found.length) {
      // 본문이 줄글뿐이면 제목 한 줄이라도 요구사항 후보로 쓴다 ("fix:" 같은 머리말과 "(#123)" 꼬리는 뗀다).
      const title = t.title.replace(/^\s*(feat|fix|chore|refactor|docs|test|perf)(\([^)]*\))?!?:\s*/i, '').replace(/\s*\((?:fix(?:es)?|close[sd]?|resolve[sd]?)?\s*#\d+\)\s*$/i, '').trim();
      if (title.length < 6 || seen.has(title.toLowerCase())) continue;
      found = [title];
      label = L(`${t.label} 제목`, `${t.label} title`);
    }
    found.forEach((x) => seen.add(x.toLowerCase()));
    requirements.push(...found);
    sources.push(label);
  }
  return { requirements: requirements.slice(0, 12), sources };
}

/**
 * 요구사항 파일 내용을 만든다. replace 는 새로 쓰고, append 는 있던 요구사항 뒤에 번호를 이어 붙인다(같은 문장은 빼고).
 * added 는 실제로 들어간 개수.
 */
export function mergeRequirementsFile(existing: string | null, cands: string[], source: string, mode: 'replace' | 'append'): { text: string; added: number } {
  const old = existing ? parseRequirements(existing) : [];
  if (mode === 'replace' || !old.length) return { text: draftRequirements(cands, source), added: cands.length };
  const have = new Set(old.map((r) => r.text.toLowerCase()));
  const fresh = cands.filter((c) => !have.has(c.toLowerCase()));
  if (!fresh.length) return { text: existing!, added: 0 };
  const start = Math.max(...old.map((r) => Number(r.id.slice(1)))) + 1;
  const lines = [L(`# ↓ ${source}에서 추가`, `# ↓ added from ${source}`), ...fresh.map((c, i) => `- R${start + i}: ${c}`)];
  return { text: existing!.replace(/\n*$/, '\n') + lines.join('\n') + '\n', added: fresh.length };
}

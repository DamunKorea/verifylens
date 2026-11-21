// CI(GitHub Actions)에서 돌리는 검사. PR 이 많아 사람이 하나씩 볼 수 없을 때를 위한 것이다
// (OKKY 댓글: 「PR 이 수천 개씩 배포되는 곳에서 눈으로 확인은 쉽지 않다」).
// 요구사항마다 한 줄을 출력하고, GitHub 에서는 근거 줄에 표시(annotation)를 남기고 요약을 작업 요약에 쓴다.
// 「다름」 · 「실패」(기본값)가 있으면 종료 코드 1 로 PR 검사를 실패시킨다.
//
// --worktree: 커밋 전 변경까지 본다 (커밋한 것 + 커밋 전 수정 + 새 파일). pre-commit 같은 git 훅에서 쓴다.
// --hook claude|cursor: AI 에이전트가 「끝났다」고 멈출 때 도는 훅 (X 의견: 에이전트가 끝내기 전에 돌리고 싶다).
//   표준 입력의 JSON 을 읽고, 커밋 전 코드 변경이 있을 때만 검사한다. 「다름」 · 「실패」가 있으면 에이전트에게
//   고치라는 말을 돌려준다 (Claude Code: {"decision":"block"}, Cursor: {"followup_message"}).
//   한 번 돌려보낸 뒤에도 그대로면 더 막지 않고 사람에게만 알린다 (종료 코드 1). 끝없이 돌지 않게 하려는 것이다.
//   훅에서는 표준 출력을 에이전트에게 주는 JSON 에만 쓰고, 알림은 표준 오류로 보낸다. 요구사항별 줄은 쓰지 않는다.
// 실패했던 검사를 다시 돌렸는가 (X 의견: 「고쳤다고 하면 원래 실패하던 단계를 그대로 다시 돌리게 한다」):
//   작업 폴더를 볼 때 --junit 을 주면, 실패한 검사 이름을 git 폴더 안(.git/verifylens-failed-tests.json)에 적어 둔다.
//   코드가 바뀐 뒤 새 결과에 그 검사가 없거나(일부만 돌림) 결과가 코드보다 오래됐으면 「다시 돌리지 않음」으로 알리고,
//   훅에서는 에이전트에게 한 번 그 검사를 다시 돌리라고 돌려보낸다. 통과하면 목록에서 지운다.
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { analyzeResult, evaluate } from './engine.ts';
import { git, mergeBase, uncommittedFiles, worktreeChangedFiles } from './git.ts';
import { parseRequirements } from './requirements.ts';
import { parseTestReport } from './tests.ts';
import { testPointsLine } from './testpoints.ts';
import { undecidedReasons } from './summary.ts';
import { undecidedLabel } from './numeric.ts';
import { L, wOverall } from './i18n.ts';
import type { Overall, Report, ReqSummary, TestCase, TestEdit } from './types.ts';
import { allLenses, chainSteps, chainText, changedTestLine, changedTests, prSummary, summaryLine } from '../vscode/src/model.ts';
import type { Lens } from '../vscode/src/model.ts';

const FAIL_WORDS: Record<string, Overall> = { different: '다름', failed: '실패', unverified: '미확인' };
const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

// GitHub 작업 명령의 글은 %, 줄바꿈을, 속성 값은 : 와 , 도 바꿔 써야 한다
const escData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s: string) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

/** 사용법이 틀렸을 때. CI 에서는 종료 코드 2, 훅에서는 1 (Claude Code 에서 2 는 「멈추지 말라」는 뜻이라 쓰지 않는다). */
export class UsageError extends Error {}

export type Hook = 'claude' | 'cursor';
export type CiIO = { out: (s: string) => void; err: (s: string) => void };
const consoleIO: CiIO = { out: (s) => console.log(s), err: (s) => console.error(s) };

export function parseFailOn(value: string | undefined): Set<Overall> {
  const words = (value ?? 'different,failed').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = words.filter((w) => !FAIL_WORDS[w]);
  if (unknown.length) throw new UsageError(L(`--fail-on 에 모르는 값이 있습니다: ${unknown.join(', ')} (different · failed · unverified)`, `Unknown --fail-on value: ${unknown.join(', ')} (use different, failed, unverified)`));
  return new Set(words.map((w) => FAIL_WORDS[w]));
}

function hookKind(v: string | undefined): Hook | undefined {
  if (v === undefined) return undefined;
  if (v === 'claude' || v === 'cursor') return v;
  throw new UsageError(L(`--hook 은 claude 또는 cursor 입니다: ${v}`, `--hook must be claude or cursor: ${v}`));
}

function parseHookInput(text: string | undefined): Record<string, unknown> {
  if (!text?.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** 훅이 알려 준 프로젝트 폴더. --repo 가 있으면 그쪽이 먼저다. */
function hookDir(hook: Hook | undefined, input: Record<string, unknown>): string | undefined {
  if (hook === 'claude') return str(process.env.CLAUDE_PROJECT_DIR) ?? str(input.cwd);
  if (hook === 'cursor') return str(process.env.CURSOR_PROJECT_DIR) ?? (Array.isArray(input.workspace_roots) ? str(input.workspace_roots[0]) : undefined);
  return undefined;
}

function topLevel(dir: string): string {
  try {
    return resolve(git(dir, ['rev-parse', '--show-toplevel']).trim());
  } catch {
    throw new UsageError(L(`git 저장소가 아닙니다: ${dir}`, `Not a git repository: ${dir}`));
  }
}

function refExists(repo: string, ref: string): boolean {
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** 비교 기준. 주지 않으면 CI 는 origin/main, 작업 폴더 검사는 origin/main · main · origin/master · master 중 있는 것. */
function pickBase(repo: string, given: string | undefined, worktree: boolean): string {
  if (given) {
    if (!refExists(repo, given)) throw new UsageError(L(`비교 기준을 찾지 못했습니다: ${given} (--base 에 있는 브랜치나 커밋을 주세요)`, `The base was not found: ${given} (give --base an existing branch or commit)`));
    return given;
  }
  const tries = worktree ? ['origin/main', 'main', 'origin/master', 'master'] : ['origin/main'];
  const found = tries.find((r) => refExists(repo, r));
  if (!found) throw new UsageError(L(`비교 기준을 찾지 못했습니다 (${tries.join(', ')}). --base 로 정해 주세요.`, `No base was found (${tries.join(', ')}). Set one with --base.`));
  return found;
}

const mtime = (p: string) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

const slash = (p: string) => p.split('\\').join('/');

const quoteList = (names: string[]) => names.map((n) => `"${n}"`).join(', ');

/** 에이전트에게 돌려줄 말: 어긋난 요구사항, 이유, 근거 줄, 실패한 검사 이름. */
function agentMessage(blocking: ReqSummary[], why: (s: ReqSummary) => string, lenses: Lens[], reqPath: string, report: Report): string {
  const lines = [
    L(`VerifyLens: 코드가 ${reqPath} 의 요구사항 ${blocking.length}개와 맞지 않습니다.`, `VerifyLens: the code does not match ${blocking.length} requirement(s) in ${reqPath}.`),
  ];
  for (const s of blocking) {
    const lens = lenses.find((l) => l.reqId === s.req.id);
    lines.push(`- ${s.req.id} · ${wOverall(s.overall)}: ${s.req.text}`);
    const detail = [why(s), lens ? `${lens.file}:${lens.line}` : ''].filter(Boolean).join(' — ');
    if (detail) lines.push(`  ${detail}`);
    // 근거 사슬 한 줄: 어느 칸이 어긋나거나 비었는지 (✗ 어긋남 · ? 비어 있음)
    lines.push(`  ${chainText(chainSteps(report, s.req.id))}`);
    // 실패한 검사는 이름으로 짚는다. 고친 뒤 바로 그 검사를 다시 돌려야 고쳤다고 할 수 있다
    const failed = (report.sets[0]?.perReq[s.req.id]?.tests ?? []).filter((t) => t.status === 'fail').map((t) => t.name);
    if (failed.length) lines.push(`  ${L('실패한 검사(고친 뒤 다시 돌릴 것)', 'Failed tests (run them again after the fix)')}: ${quoteList(failed)}`);
    // 테스트도 같은 착각으로 쓰지 않게, 요구사항의 숫자에서 뽑은 경계값을 함께 준다
    const points = testPointsLine(s.req);
    if (points) lines.push(`  ${L('경계에서 시험할 값', 'Values to test at the boundary')}: ${points}`);
  }
  lines.push(
    L(
      '요구사항이 말하는 대로 코드를 고쳐 주세요. 요구사항 자체가 틀려 보이면 요구사항 파일이나 검사를 바꾸지 말고 사용자에게 물어보세요.',
      'Fix the code so it does what each requirement says. If a requirement itself looks wrong, ask the user instead of changing the requirements file or the check.',
    ),
  );
  return lines.join('\n');
}

/** 요구사항의 검사를 이번 변경에서 바꾸거나 지웠을 때 에이전트에게 돌려줄 말 */
function editedMessage(items: { s: ReqSummary; e: TestEdit }[]): string {
  return [
    L(
      'VerifyLens: 이번 변경에서 요구사항에 이어진 검사를 바꾸거나 지웠습니다. 검사가 통과하는 것이 이 변경 덕일 수 있습니다.',
      'VerifyLens: tests linked to requirements were changed or removed in this change. They may pass only because of that change.',
    ),
    ...items.map(({ s, e }) => `- ${s.req.id} · ${s.req.text}: ${changedTestLine(e)}`),
    L(
      '검사가 코드가 하는 일이 아니라 요구사항이 말하는 것을 확인하도록 되돌려 주세요. 요구사항이 바뀐 것이라면 검사를 고치기 전에 사용자에게 물어보세요.',
      'Make each test check what the requirement says, not what the code does. If the requirement itself changed, ask the user before changing the test.',
    ),
  ].join('\n');
}

/** 전에 실패한 검사를 적어 두는 파일 (git 폴더 안이라 커밋되지 않는다) */
function failedStatePath(repo: string): string {
  return resolve(repo, git(repo, ['rev-parse', '--git-path', 'verifylens-failed-tests.json']).trim());
}
function readFailedState(file: string): string[] {
  try {
    const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const tests = v && typeof v === 'object' ? (v as { tests?: unknown }).tests : undefined;
    return Array.isArray(tests) ? tests.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export type RerunCheck = { notRun: string[]; passedNow: string[] };

/**
 * 전에 실패한 검사를 다시 돌렸는가.
 * fresh: 지금 코드보다 새 테스트 결과(없으면 null). staleFailed: 코드보다 오래된 결과에서 실패한 검사.
 * 다시 돌리지 않은 것 · 아직 실패하는 것은 다음 번을 위해 남기고, 통과한 것은 지운다.
 */
export function checkRerun(stateFile: string, fresh: TestCase[] | null, staleFailed: string[]): RerunCheck {
  const before = readFailedState(stateFile);
  let notRun: string[];
  let passedNow: string[] = [];
  let failingNow: string[] = [];
  if (!fresh) {
    notRun = [...new Set([...before, ...staleFailed])];
  } else {
    const status = new Map(fresh.map((t) => [t.name, t.status]));
    notRun = before.filter((n) => !status.has(n));
    passedNow = before.filter((n) => status.get(n) === 'pass');
    failingNow = fresh.filter((t) => t.status === 'fail').map((t) => t.name);
  }
  const keep = [...new Set([...failingNow, ...notRun])];
  try {
    if (keep.length) writeFileSync(stateFile, JSON.stringify({ tests: keep, at: new Date().toISOString() }, null, 2) + '\n');
    else rmSync(stateFile, { force: true });
  } catch {
    // 적어 두지 못해도 이번 검사는 그대로 한다
  }
  return { notRun, passedNow };
}

function rerunMessage(notRun: string[]): string {
  return L(
    `VerifyLens: 전에 실패한 검사를 코드가 바뀐 뒤 다시 돌리지 않았습니다: ${quoteList(notRun)}. 그 검사를 다시 돌려 결과를 본 뒤에 끝내세요 (테스트 결과 파일도 새로 써야 합니다).`,
    `VerifyLens: tests that failed before were not run again after the code changed: ${quoteList(notRun)}. Run them again and look at the result before you finish (the test report must be written again too).`,
  );
}

/**
 * ci 명령. hookInput 은 --hook 일 때 표준 입력으로 받은 JSON 글.
 * 종료 코드: 0 통과(훅은 늘 0, 막을 때도 JSON 으로 알린다) · 1 실패 · 2 사용법 오류(CI).
 */
export function runCi(opts: Record<string, string>, hookInput?: string, io: CiIO = consoleIO): number {
  let hook: Hook | undefined;
  try {
    hook = hookKind(opts.hook);
    return check(opts, hook, parseHookInput(hookInput), io);
  } catch (e) {
    if (!(e instanceof UsageError) && !hook) throw e;
    io.err(e instanceof Error ? e.message : String(e));
    return hook ? 1 : 2;
  }
}

function check(opts: Record<string, string>, hook: Hook | undefined, input: Record<string, unknown>, io: CiIO): number {
  const worktree = !!hook || opts.worktree === 'true';
  // 훅에서는 표준 출력을 에이전트에게 주는 JSON 에만 쓴다
  const say = hook ? io.err : io.out;
  const pass = () => {
    if (hook === 'cursor') io.out('{}');
    return 0;
  };
  // Cursor 는 멈춘 이유를 알려 준다. 사용자가 멈췄거나 오류로 끝났으면 검사하지 않는다.
  if (hook === 'cursor' && str(input.status) && input.status !== 'completed') return pass();

  const dir = resolve(opts.repo ?? hookDir(hook, input) ?? '.');
  const reqFile = resolve(dir, opts.requirements ?? '.verifylens/requirements.md');
  const failOn = parseFailOn(opts['fail-on']);
  if (!existsSync(reqFile)) {
    // 훅을 사용자 설정에 넣으면 요구사항 파일이 없는 프로젝트에서도 돈다. 그때는 조용히 지나간다.
    if (hook) {
      say(L(`요구사항 파일이 없어 건너뜁니다: ${reqFile}`, `No requirements file, so nothing is checked: ${reqFile}`));
      return pass();
    }
    throw new UsageError(L(`요구사항 파일이 없습니다: ${reqFile}`, `The requirements file does not exist: ${reqFile}`));
  }
  const reqs = parseRequirements(readFileSync(reqFile, 'utf8'));
  if (!reqs.length) throw new UsageError(L('요구사항을 읽지 못했습니다. 「- R1: 문장」 형식인지 확인하세요.', 'No requirements could be read. Each line must look like "- R1: sentence".'));

  const repo = topLevel(dir);
  // 에이전트가 코드를 건드리지 않은 차례(질문에 답만 한 경우)에는 검사하지 않는다
  if (hook && !uncommittedFiles(repo).some((f) => CODE_EXT.test(f))) return pass();
  const base = pickBase(repo, opts.base, worktree);
  const head = opts.head ?? 'HEAD';

  let junit = opts.junit ? resolve(dir, opts.junit) : undefined;
  if (junit && !existsSync(junit)) {
    say(L(`테스트 결과 파일이 없어 검사 없이 판단합니다: ${junit}`, `The test report was not found, so tests are not used: ${junit}`));
    junit = undefined;
  }
  // 작업 폴더를 볼 때, 테스트 결과가 코드보다 오래됐으면 쓰지 않는다 (고치기 전의 「통과」는 지금 코드의 근거가 아니다)
  // 그 오래된 결과에서 실패한 검사는 「다시 돌려야 할 검사」로 남긴다
  let staleFailed: string[] = [];
  if (junit && worktree) {
    const newest = Math.max(0, ...worktreeChangedFiles(repo, mergeBase(repo, base)).filter((f) => CODE_EXT.test(f)).map((f) => mtime(join(repo, f))));
    if (mtime(junit) + 1500 < newest) {
      say(L(`테스트 결과가 코드보다 오래돼 쓰지 않습니다: ${junit} (테스트를 다시 돌리세요)`, `The test report is older than the code, so it is not used: ${junit} (run the tests again)`));
      try {
        staleFailed = parseTestReport(readFileSync(junit, 'utf8')).filter((t) => t.status === 'fail').map((t) => t.name);
      } catch {
        staleFailed = [];
      }
      junit = undefined;
    }
  }
  const set = analyzeResult({ key: 'A', repo, base, ref: worktree ? 'HEAD' : head, junit, worktree });
  const report = evaluate([set], reqs, repo, base);
  // 실패했던 검사를 다시 돌렸는가 (작업 폴더 · 훅에서 테스트 결과 파일을 줄 때만)
  const rerun = worktree && opts.junit ? checkRerun(failedStatePath(repo), junit ? set.tests : null, staleFailed) : { notRun: [], passedNow: [] };
  if (rerun.notRun.length) say(rerunMessage(rerun.notRun));
  if (rerun.passedNow.length) say(L(`전에 실패한 검사가 이제 통과합니다: ${quoteList(rerun.passedNow)}`, `Tests that failed before pass now: ${quoteList(rerun.passedNow)}`));
  if (!set.analyses.length) {
    say(
      worktree
        ? L(`${base}와 비교해 바뀐 TypeScript · JavaScript 파일이 없습니다 (커밋 전 변경 포함).`, `No TypeScript or JavaScript files changed compared to ${base} (uncommitted changes included).`)
        : L(`${base}와 비교해 ${head}에서 바뀐 TypeScript · JavaScript 파일이 없습니다.`, `No TypeScript or JavaScript files changed in ${head} compared to ${base}.`),
    );
  }

  const github = !hook && (!!process.env.GITHUB_ACTIONS || opts.github === 'true');
  // 표시는 작업 폴더 기준 경로로 남긴다 (저장소가 하위 폴더일 수 있다)
  const workspace = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : repo;
  const lenses = allLenses(report);
  const why = (s: ReqSummary) => summaryLine(report, s);
  for (const s of report.summaries) {
    // 훅에서는 요구사항별 줄을 쓰지 않는다. 사람에게 보일 때(종료 코드 1) 짧은 알림만 남게 한다.
    if (hook) continue;
    const reasons = undecidedReasons(report, s).map((k) => undecidedLabel(k));
    say(`${s.req.id} · ${wOverall(s.overall)}${reasons.length ? ` (${reasons.join(', ')})` : ''} — ${s.req.text}${why(s) ? `\n    ${why(s)}` : ''}`);
    // 이번 변경에서 이 요구사항의 검사를 바꾸거나 지웠으면 (판정과 상관없이 알린다)
    const changed = changedTests(report, s.req.id);
    for (const { e } of changed) say(`    ⚠ ${changedTestLine(e)}`);
    if (github) {
      for (const { e } of changed) {
        const at = e.kind === 'removed' ? '' : `file=${escProp(slash(relative(workspace, join(repo, e.file))))},line=${e.line},`;
        io.out(`::warning ${at}title=${escProp(`VerifyLens ${s.req.id} · ${L('검사 바뀜', 'test changed')}`)}::${escData(`${s.req.text} — ${changedTestLine(e)}`)}`);
      }
    }
    if (!github || s.overall === '확인됨') continue;
    const level = s.overall === '미확인' ? 'warning' : 'error';
    const lens = lenses.find((l) => l.reqId === s.req.id);
    const where = lens ? `file=${escProp(slash(relative(workspace, join(repo, lens.file))))},line=${lens.line},` : '';
    const title = `VerifyLens ${s.req.id} · ${wOverall(s.overall)}`;
    const message = [s.req.text, why(s), reasons.join(', ')].filter(Boolean).join(' — ');
    io.out(`::${level} ${where}title=${escProp(title)}::${escData(message)}`);
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && !hook) appendFileSync(summaryFile, prSummary({ kind: 'repo', repo, report, notes: [] }) + '\n');

  const blocking = report.summaries.filter((s) => failOn.has(s.overall));
  const names = [...failOn].map((o) => wOverall(o)).join(L(' · ', ' or '));
  if (!hook) {
    say(
      blocking.length
        ? L(`\n${names} 인 요구사항이 ${blocking.length}개 있어 실패로 끝냅니다: ${blocking.map((s) => s.req.id).join(', ')}`, `\n${blocking.length} requirement(s) are ${names}, so this check fails: ${blocking.map((s) => s.req.id).join(', ')}`)
        : L(`\n${names} 인 요구사항이 없습니다.`, `\nNo requirement is ${names}.`),
    );
    return blocking.length ? 1 : 0;
  }
  // 이번 변경에서 요구사항의 검사를 바꾸거나 지운 것 (막는 요구사항에 든 것은 그 사슬 줄에 이미 나온다)
  const edited = report.summaries.filter((s) => !blocking.includes(s)).flatMap((s) => changedTests(report, s.req.id).map(({ e }) => ({ s, e })));
  // 어긋난 요구사항도, 다시 돌리지 않은 실패 검사도, 바뀐 검사도 없으면 통과
  if (!blocking.length && !rerun.notRun.length && !edited.length) return pass();
  const message = [
    blocking.length ? agentMessage(blocking, why, lenses, slash(relative(dir, reqFile)), report) : '',
    rerun.notRun.length ? rerunMessage(rerun.notRun) : '',
    edited.length ? editedMessage(edited) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  // 이미 한 번 돌려보낸 뒤라면 더 막지 않고 사람에게만 알린다
  const retried = hook === 'claude' ? input.stop_hook_active === true : Number(input.loop_count ?? 0) >= 1;
  if (retried) {
    io.err(message);
    if (hook === 'cursor') io.out('{}');
    return 1;
  }
  io.out(JSON.stringify(hook === 'claude' ? { decision: 'block', reason: message } : { followup_message: message }));
  return 0;
}

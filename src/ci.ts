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
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { analyzeResult, evaluate } from './engine.ts';
import { git, mergeBase, uncommittedFiles, worktreeChangedFiles } from './git.ts';
import { parseRequirements } from './requirements.ts';
import { testPointsLine } from './testpoints.ts';
import { undecidedReasons } from './summary.ts';
import { undecidedLabel } from './numeric.ts';
import { L, wOverall } from './i18n.ts';
import type { Overall, ReqSummary } from './types.ts';
import { allLenses, prSummary, summaryLine } from '../vscode/src/model.ts';
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

/** 에이전트에게 돌려줄 말: 어긋난 요구사항, 이유, 근거 줄. */
function agentMessage(blocking: ReqSummary[], why: (s: ReqSummary) => string, lenses: Lens[], reqPath: string): string {
  const lines = [
    L(`VerifyLens: 코드가 ${reqPath} 의 요구사항 ${blocking.length}개와 맞지 않습니다.`, `VerifyLens: the code does not match ${blocking.length} requirement(s) in ${reqPath}.`),
  ];
  for (const s of blocking) {
    const lens = lenses.find((l) => l.reqId === s.req.id);
    lines.push(`- ${s.req.id} · ${wOverall(s.overall)}: ${s.req.text}`);
    const detail = [why(s), lens ? `${lens.file}:${lens.line}` : ''].filter(Boolean).join(' — ');
    if (detail) lines.push(`  ${detail}`);
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
  if (junit && worktree) {
    const newest = Math.max(0, ...worktreeChangedFiles(repo, mergeBase(repo, base)).filter((f) => CODE_EXT.test(f)).map((f) => mtime(join(repo, f))));
    if (mtime(junit) + 1500 < newest) {
      say(L(`테스트 결과가 코드보다 오래돼 쓰지 않습니다: ${junit} (테스트를 다시 돌리세요)`, `The test report is older than the code, so it is not used: ${junit} (run the tests again)`));
      junit = undefined;
    }
  }
  const set = analyzeResult({ key: 'A', repo, base, ref: worktree ? 'HEAD' : head, junit, worktree });
  const report = evaluate([set], reqs, repo, base);
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
  if (!blocking.length) return pass();
  const message = agentMessage(blocking, why, lenses, slash(relative(dir, reqFile)));
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

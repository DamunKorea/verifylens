// VerifyLens JetBrains 판이 부르는 작은 명령.
// 분석은 VS Code 확장과 같은 코드(../../vscode/src/model.ts 의 runRepo · runDemo · treeModel · allLenses)가 하고,
// 여기서는 그 결과를 표준 출력에 JSON 한 덩어리로 낼 뿐이다. 그래서 두 에디터의 판정이 같다.
// 네트워크를 쓰지 않는다. 읽는 것은 로컬 git 과 작업 폴더의 파일뿐이다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import * as M from '../../vscode/src/model.ts';
import { counts } from '../../src/summary.ts';
import { stepTone } from '../../src/evidenceView.ts';

/** 출력 모양이 바뀌면 올린다. 플러그인은 이 숫자가 다르면 결과를 쓰지 않는다. */
const PROTOCOL = 1;
const DEFAULT_REQ = '.verifylens/requirements.md';

type Fail = { ok: false; protocol: number; code: string; error: string; repo?: string; requirements?: string };

function args(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const k = rest[i].slice(2);
    opts[k] = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
  }
  return { cmd, opts };
}

const fail = (code: string, error: string, extra: Partial<Fail> = {}): Fail => ({ ok: false, protocol: PROTOCOL, code, error, ...extra });
const L = M.L;

/** 화면에 그리는 데 필요한 것만 담는다. rows 는 treeModel, lenses 는 allLenses 그대로다. */
function present(run: M.Run, extra: Record<string, unknown> = {}) {
  const { report } = run;
  const lenses = M.allLenses(report);
  const strips: Record<string, string[]> = {};
  for (const s of report.summaries) {
    const lines = M.attemptLines(report, s.req.id);
    if (lines.length) strips[s.req.id] = lines;
  }
  // 이번 변경에서 바뀐 검사 (판정 옆 알림). 판정 · 이유 글에는 들어가지 않으므로 따로 낸다. 글은 VS Code 와 같다.
  const changedTests: Record<string, { setKey: string; file: string; line: number; removed: boolean; text: string }[]> = {};
  for (const s of report.summaries) {
    const list = M.changedTests(report, s.req.id).map(({ set, e }) => ({ setKey: set.key, file: e.file, line: e.line, removed: e.kind === 'removed', text: M.changedTestLine(e) }));
    if (list.length) changedTests[s.req.id] = list;
  }
  // 근거 사슬 그림의 자료: 요구사항 → 코드 줄 → 검사 → 동작(판정). 리포트 · 체험 페이지 · PR 요약과 같은 모델(chainSteps)이고,
  // 칸의 색(tone)도 리포트와 같은 규칙(stepTone)으로 정해서 낸다. 점 그림(몇 번째 시도에 동작하는가)은 계산할 수 있을 때만 있다.
  const chains: Record<string, { setKey: string; label: string; steps: { kind: string; title: string; text: string; tone: string; changed: boolean }[] }[]> = {};
  const dots: Record<string, { max: number; required: number; rows: { key: string; at: number }[] }> = {};
  for (const s of report.summaries) {
    chains[s.req.id] = report.sets.map((set, i) => ({
      setKey: set.key,
      label: set.label,
      steps: M.chainSteps(report, s.req.id, undefined, i).map((x) => ({ kind: x.kind, title: x.title, text: x.text, tone: stepTone(x, s.overall), changed: x.changed === true })),
    }));
    const d = M.attemptDots(report, s.req.id);
    if (d) dots[s.req.id] = d;
  }
  return {
    ok: true,
    protocol: PROTOCOL,
    kind: run.kind,
    repo: run.repo,
    base: report.base,
    workingRef: run.workingRef ?? null,
    headline: M.verifiedLine(report),
    context: M.contextLine(run),
    status: M.statusText(report),
    counts: counts(report),
    attention: M.attentionCount(report),
    notes: run.notes,
    demoHeadline: run.kind === 'demo' ? M.demoHeadline(report) : null,
    sets: report.sets.map((s) => {
      // 지금 작업 폴더에 있는 파일은 에디터가 실제 파일로 연다. 그렇지 않은 결과(샘플의 A · B)만 내용을 실어 보낸다.
      const onDisk = run.kind === 'repo' && run.workingRef === s.ref;
      const files: Record<string, string> = {};
      if (!onDisk) for (const l of lenses) if (l.setKey === s.key && s.files[l.file] !== undefined) files[l.file] = s.files[l.file];
      return { key: s.key, label: s.label, ref: s.ref, sha: s.sha, wip: s.wip ?? null, onDisk, files };
    }),
    rows: M.treeModel(report),
    lenses,
    strips,
    changedTests,
    chains,
    dots,
    ...extra,
  };
}

function reqPath(repo: string, opt?: string): string {
  const rel = (opt ?? '').trim() || DEFAULT_REQ;
  return isAbsolute(rel) ? rel : join(repo, rel);
}

function findRepo(dir: string | undefined): string | Fail {
  if (!dir) return fail('usage', L('--repo 폴더가 필요합니다.', '--repo <folder> is required.'));
  const start = resolve(dir);
  if (!existsSync(start)) return fail('no-folder', L(`폴더가 없습니다: ${start}`, `The folder does not exist: ${start}`));
  let root: string | null;
  try {
    root = M.gitRoot(start);
  } catch (e) {
    return gitFail(e);
  }
  // gitRoot 는 git 이 없을 때도 null 을 돌려주므로, git 자체가 있는지 따로 본다.
  if (!root) return hasGit() ? fail('no-repo', L('열린 폴더에서 git 저장소를 찾지 못했습니다. git 저장소 폴더를 연 뒤 다시 실행하세요.', 'No git repository was found in the open folder. Open a repository folder and run this again.')) : gitFail({ code: 'ENOENT' });
  // gitRoot 는 폴더를 연 경로 표기 그대로 돌려준다 (src/git.ts 의 topLevel · inCallerSpelling):
  // subst 드라이브 · 이은 폴더 · 심볼릭 링크로 열어도 IDE 가 아는 경로와 같아야 편집기 표시가 붙는다.
  return resolve(root);
}

function hasGit(): boolean {
  try {
    return /git version/.test(execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }));
  } catch {
    return false;
  }
}

function gitFail(e: unknown): Fail {
  const err = e as { code?: string; stderr?: string | Buffer; message?: string };
  if (err?.code === 'ENOENT') return fail('no-git', L('git 을 찾지 못했습니다. git 을 설치하고 PATH 에 넣은 뒤 IDE 를 다시 시작하세요.', 'git was not found. Install git, put it on PATH, and restart the IDE.'));
  const text = String(err?.stderr ?? '').trim() || (err?.message ?? String(e));
  return fail('error', text.split('\n').map((x) => x.trim()).filter(Boolean)[0] ?? L('분석에 실패했습니다.', 'The analysis failed.'));
}

function check(opts: Record<string, string>) {
  const repo = findRepo(opts.repo);
  if (typeof repo !== 'string') return repo;
  const current = M.currentBranch(repo);
  if (current === 'HEAD') return fail('detached', L('브랜치에 있지 않습니다(detached HEAD). 브랜치를 체크아웃한 뒤 실행하세요.', 'You are not on a branch (detached HEAD). Check out a branch and run this again.'), { repo });
  const base = (opts.base ?? '').trim() || M.defaultBase(repo, current);
  if (!base) {
    const others = M.orderBases(M.localBranches(repo), current);
    return fail(
      'no-base',
      others.length
        ? L(`비교할 기준 브랜치를 정하지 못했습니다. main · master · develop 가운데 하나가 있어야 합니다. (있는 브랜치: ${others.slice(0, 6).join(', ')})`, `Could not decide which base branch to compare against. One of main, master or develop is needed. (Branches: ${others.slice(0, 6).join(', ')})`)
        : L(`비교할 기준 브랜치가 없습니다. 지금 브랜치(${current}) 말고 main 같은 브랜치가 있어야 합니다.`, `There is no base branch to compare against. A branch such as main is needed besides the current one (${current}).`),
      { repo },
    );
  }
  const reqFile = reqPath(repo, opts.requirements);
  const relReq = relative(repo, reqFile).split('\\').join('/');
  if (!existsSync(reqFile)) return fail('no-requirements', L(`요구사항 파일(${relReq})이 없습니다.`, `There is no requirements file (${relReq}).`), { repo, requirements: reqFile });
  const setting = (opts.report ?? '').trim();
  const run = M.runRepo({ repo, base, a: current, reqFile, junitA: M.findReport(repo, setting), workingRef: current, worktree: true });
  // 저장할 때 다시 볼지 정하는 데 쓰는 파일들: 요구사항 파일과 테스트 결과 후보.
  return present(run, { requirements: reqFile, watch: [reqFile, ...M.reportCandidates(repo, setting)] });
}

function demo(opts: Record<string, string>) {
  if (!opts.samples) return fail('usage', L('--samples 폴더가 필요합니다.', '--samples <folder> is required.'));
  const samples = resolve(opts.samples);
  const sampleDir = join(samples, 'login-lockout');
  if (!existsSync(sampleDir)) return fail('no-samples', L(`샘플 폴더가 없습니다: ${sampleDir}`, `The sample folder does not exist: ${sampleDir}`));
  // 샘플의 테스트는 TypeScript 라서 Node 22.18 이상에서만 직접 돌린다. 아니면 미리 만들어 둔 결과를 쓴다.
  const node = M.nodeSupportsTs(process.execPath) ? process.execPath : null;
  const run = M.runDemo({ sampleDir, node, fallbackJunit: { a: join(samples, 'junit', 'junit-a.xml'), b: join(samples, 'junit', 'junit-b.xml') } });
  const out = present(run);
  // 결과에 파일 내용을 실었으므로 임시 저장소는 지운다. 우리가 방금 만든 임시 폴더일 때만.
  const root = dirname(run.repo);
  if (basename(root).startsWith('verifylens-demo-') && resolve(dirname(root)) === resolve(tmpdir())) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 못 지워도 결과에는 영향이 없다 */
    }
  }
  return out;
}

function initRequirements(opts: Record<string, string>) {
  const repo = findRepo(opts.repo);
  if (typeof repo !== 'string') return repo;
  const file = reqPath(repo, opts.requirements);
  let created = false;
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    // VS Code 확장의 안내 줄 가운데 VS Code 명령을 가리키는 줄은 뺀다 (이 판에는 아직 가져오기가 없다).
    writeFileSync(file, M.reqTemplate().split('\n').filter((l) => !/Import requirements/.test(l)).join('\n'), 'utf8');
    created = true;
  }
  return { ok: true, protocol: PROTOCOL, repo, requirements: file, created };
}

function main(argv: string[]) {
  const { cmd, opts } = args(argv);
  // 글의 언어: 플러그인이 IDE 언어를 보고 --lang ko|en 을 넘긴다. 없으면 한국어.
  if (opts.lang === 'en' || opts.lang === 'ko') M.setLang(opts.lang);
  let out: unknown;
  try {
    if (cmd === 'check') out = check(opts);
    else if (cmd === 'demo') out = demo(opts);
    else if (cmd === 'init-requirements') out = initRequirements(opts);
    else if (cmd === 'version') out = { ok: true, protocol: PROTOCOL, node: process.version };
    else out = fail('usage', 'usage: check --repo <folder> [--base <branch>] [--requirements <file>] [--report <file>] | demo --samples <folder> | init-requirements --repo <folder> | version   (all take [--lang ko|en])');
  } catch (e) {
    const err = e as { code?: string; stderr?: unknown };
    out = err?.code === 'ENOENT' || err?.stderr !== undefined ? gitFail(e) : fail('error', e instanceof Error ? e.message : String(e));
  }
  // 긴 출력이 끊기지 않게 process.exit 를 부르지 않고 스스로 끝나게 둔다.
  process.stdout.write(JSON.stringify(out));
}

main(process.argv.slice(2));

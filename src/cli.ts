import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { analyzeResult, evaluate } from './engine.ts';
import { parseRequirements, extractFromPrBody } from './requirements.ts';
import { buildSampleRepo } from './demo.ts';
import { L, setLang } from './i18n.ts';

/** 결과 HTML 을 기본 브라우저로 연다 (Windows · macOS · Linux). */
function openInBrowser(file: string) {
  const [cmd, cmdArgs, verbatim] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${file}"`], true]
    : process.platform === 'darwin' ? ['open', [file], false]
    : ['xdg-open', [file], false];
  spawn(cmd as string, cmdArgs as string[], { detached: true, stdio: 'ignore', windowsVerbatimArguments: verbatim as boolean }).unref();
}

function args(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const k = rest[i].slice(2);
      const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
      opts[k] = v;
    }
  }
  return { cmd, opts };
}

const HELP_EN = `VerifyLens — your code never leaves this machine (no network use)

  node src/cli.ts demo [--out dir] [--open] [--lang en|ko]
      Builds a report from the sample (a made-up login-lockout case). --open opens it in the browser.

  node src/cli.ts extract --pr-body pr.md
      Extracts requirement candidates from a PR description and prints a requirements.md draft.

  node src/cli.ts report --repo repo --base main --a branchA [--b branchB]
        --requirements requirements.md [--junit-a a.xml --junit-b b.xml] [--out dir] [--open] [--lang en|ko]
      Analyzes base..branch and writes report.html and summary.md.

  node src/cli.ts ci --repo repo --base origin/main [--head HEAD] --requirements .verifylens/requirements.md
        [--junit report.xml] [--fail-on different,failed] [--lang en|ko]
      For CI (GitHub Actions). Prints one line per requirement, marks the deciding lines on the pull request
      (when GITHUB_ACTIONS is set), writes the summary to GITHUB_STEP_SUMMARY, and exits with 1 when a
      requirement is Different or Failed (--fail-on also accepts unverified).
      --worktree checks the working folder instead of a commit: committed, uncommitted and new files
      compared to --base (origin/main, main, origin/master or master when not given). For git hooks.
      --hook claude|cursor runs as an AI agent's stop hook: reads the hook's JSON on stdin, checks only
      when code has uncommitted changes, and asks the agent once to fix a Different or Failed requirement.

  node src/cli.ts check   (engine check: prints the sample result as text)
`;

const HELP = `VerifyLens — 코드는 이 PC 밖으로 나가지 않습니다 (네트워크 사용 없음)

  node src/cli.ts demo [--out 폴더] [--open]
      샘플(로그인 잠금 가상 사례)로 리포트를 만듭니다. --open 은 컨셉 시연을 브라우저로 엽니다.

  node src/cli.ts extract --pr-body PR설명.md
      PR 설명에서 요구사항 후보를 뽑아 requirements.md 초안을 출력합니다.

  node src/cli.ts report --repo 저장소 --base main --a 브랜치A [--b 브랜치B]
        --requirements requirements.md [--junit-a a.xml --junit-b b.xml] [--out 폴더] [--open]
      저장소의 base..브랜치 변경을 분석해 리포트(report.html, summary.md)를 만듭니다.

  node src/cli.ts ci --repo 저장소 --base origin/main [--head HEAD] --requirements .verifylens/requirements.md
        [--junit report.xml] [--fail-on different,failed] [--lang en|ko]
      CI(GitHub Actions)용. 요구사항마다 한 줄씩 출력하고, GITHUB_ACTIONS 가 있으면 PR 의 근거 줄에 표시를 남기며,
      요약을 GITHUB_STEP_SUMMARY 에 쓴다. 「다름」 · 「실패」가 있으면 종료 코드 1 (--fail-on 에 unverified 도 넣을 수 있다).
      --worktree 는 커밋 대신 작업 폴더를 본다: --base(없으면 origin/main · main · origin/master · master)와 비교해
      커밋한 것 · 커밋 전 수정 · 새 파일. git 훅용.
      --hook claude|cursor 는 AI 에이전트가 멈출 때 도는 훅용: 표준 입력의 훅 JSON 을 읽고, 커밋 전 코드 변경이 있을 때만
      검사해 「다름」 · 「실패」가 있으면 에이전트에게 한 번 고치라고 돌려보낸다.

  node src/cli.ts check   (엔진 점검: 샘플 결과를 표로 출력)
`;

/** 이 컴퓨터의 언어 (LC_ALL · LANG, 없거나 C 면 Intl). 한국어가 아니면 영어 */
function systemLang(): 'en' | 'ko' {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  const loc = /^(C|POSIX)?(\.|$)/i.test(env) ? Intl.DateTimeFormat().resolvedOptions().locale : env;
  return /^ko/i.test(loc) ? 'ko' : 'en';
}

export async function main(argv: string[]) {
  const { cmd, opts } = args(argv);
  // 글의 언어: --lang en|ko, 없으면 환경 변수 VERIFYLENS_LANG, 둘 다 없으면 이 컴퓨터의 언어(한국어가 아니면 영어).
  // (전에는 늘 한국어여서, npx 로 처음 돌린 해외 사용자에게 한국어 도움말이 나왔다)
  const lang = opts.lang ?? process.env.VERIFYLENS_LANG ?? systemLang();
  if (lang === 'en' || lang === 'ko') setLang(lang);
  if (cmd === 'extract') {
    if (!opts['pr-body']) throw new Error(L('--pr-body 파일이 필요합니다.', '--pr-body <file> is required.'));
    process.stdout.write(extractFromPrBody(readFileSync(opts['pr-body'], 'utf8')));
    return;
  }
  if (cmd === 'ci') {
    const { runCi } = await import('./ci.ts');
    // 훅은 표준 입력으로 JSON 을 준다. 사람이 직접 돌릴 때(터미널)는 읽지 않는다.
    let input: string | undefined;
    if (opts.hook && !process.stdin.isTTY) {
      try {
        input = readFileSync(0, 'utf8');
      } catch {
        input = undefined;
      }
    }
    process.exitCode = runCi(opts, input);
    return;
  }
  if (cmd === 'check' || cmd === 'demo' || cmd === 'report') {
    let repo: string, base: string, a: string, b: string | undefined, reqFile: string, ja: string | undefined, jb: string | undefined;
    let pr: string | undefined;
    if (cmd === 'report') {
      repo = resolve(opts.repo ?? '.');
      base = opts.base ?? 'main';
      a = opts.a ?? opts.head;
      b = opts.b;
      reqFile = opts.requirements;
      ja = opts['junit-a'];
      jb = opts['junit-b'];
      if (!a || !reqFile) throw new Error(L('--a(또는 --head) 와 --requirements 가 필요합니다.', '--a (or --head) and --requirements are required.'));
    } else {
      const env = buildSampleRepo();
      repo = env.repo;
      base = 'main';
      a = 'feature/lockout-a';
      b = 'feature/lockout-b';
      reqFile = env.reqFile;
      ja = env.junitA;
      jb = env.junitB;
      pr = env.prFile;
    }
    const reqs = parseRequirements(readFileSync(reqFile, 'utf8'));
    if (!reqs.length) throw new Error(L('요구사항을 읽지 못했습니다. "- R1: 문장" 형식인지 확인하세요.', 'No requirements could be read. Each line must look like "- R1: sentence".'));
    const sets = [analyzeResult({ key: 'A', repo, base, ref: a, junit: ja })];
    if (b) sets.push(analyzeResult({ key: 'B', repo, base, ref: b, junit: jb }));
    const report = evaluate(sets, reqs, repo, base);
    if (cmd === 'check') {
      for (const s of report.summaries) {
        console.log(`${s.req.id} ${s.req.text}\n  → ${s.overall} · 관계 ${s.relation.kind} ${s.relation.detail}`);
        for (const set of report.sets) {
          const rr = set.perReq[s.req.id];
          const u = rr.evidence.unit;
          console.log(`  ${set.key}: 근거 ${rr.evidence.status}(${rr.evidence.score}) ${u ? `${u.file}:${u.startLine} [${u.kind}] ${u.cond?.expr ?? u.text}` : '-'} · 검사 ${rr.testStatus}${rr.evidence.boundary ? ` · 경계 ${JSON.stringify(rr.evidence.boundary)}` : ''}`);
        }
        for (const n of s.notes) console.log(`  ! ${n}`);
      }
      for (const set of report.sets) console.log(`${set.key} dyn:`, set.dyn.map((d) => `${d.file}:${d.line} ${d.text}`).join(' | '));
      return;
    }
    const { writeOutputs } = await import('./output.ts');
    const out = resolve(opts.out ?? (cmd === 'demo' ? 'out' : 'verifylens-out'));
    mkdirSync(out, { recursive: true });
    const files = writeOutputs(report, out, pr, cmd === 'demo' && lang !== 'en');
    console.log(L('리포트를 만들었습니다 (코드는 이 PC 밖으로 나가지 않았습니다):', 'Report written (your code did not leave this machine):'));
    for (const f of files) console.log('  ' + f);
    if (opts.open) {
      // 컨셉 시연은 한국어로만 있어서 영어일 때는 만들지 않는다. 그때는 리포트를 연다.
      const page = files.find((f) => f.endsWith(cmd === 'demo' && lang !== 'en' ? 'concept.html' : 'report.html'));
      if (page) openInBrowser(page);
    }
    if (cmd === 'demo') {
      console.log(L('\n샘플 저장소와 검사 결과는 report 명령 연습용으로 남겨 두었습니다:', '\nThe sample repository and test results are kept so you can try the report command:'));
      console.log(`  node src/cli.ts report --repo "${repo}" --base main --a ${a} --b ${b} --requirements "${reqFile}" --junit-a "${ja}" --junit-b "${jb}"`);
    }
    return;
  }
  // npx 로 받은 묶음(dist/cli.mjs)으로 돌고 있으면 그 실행법으로 보여 준다
  const viaNpx = /dist[\\/]cli\.mjs$/.test(process.argv[1] ?? '');
  console.log(L(HELP, HELP_EN).replaceAll('node src/cli.ts', viaNpx ? 'npx -y github:DamunKorea/verifylens' : 'node src/cli.ts'));
}

main(process.argv.slice(2)).catch((e) => {
  console.error(L('오류:', 'Error:'), e instanceof Error ? e.message : e);
  process.exit(1);
});

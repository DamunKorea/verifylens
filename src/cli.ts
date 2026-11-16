import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { analyzeResult, evaluate } from './engine.ts';
import { parseRequirements, extractFromPrBody } from './requirements.ts';
import { buildSampleRepo } from './demo.ts';

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

const HELP = `VerifyLens 프로토타입 v0 — 코드는 이 PC 밖으로 나가지 않습니다 (네트워크 사용 없음)

  node src/cli.ts demo [--out 폴더] [--open]
      샘플(로그인 잠금 가상 사례)로 리포트를 만듭니다. --open 은 컨셉 시연을 브라우저로 엽니다.

  node src/cli.ts extract --pr-body PR설명.md
      PR 설명에서 요구사항 후보를 뽑아 requirements.md 초안을 출력합니다.

  node src/cli.ts report --repo 저장소 --base main --a 브랜치A [--b 브랜치B]
        --requirements requirements.md [--junit-a a.xml --junit-b b.xml] [--out 폴더] [--open]
      저장소의 base..브랜치 변경을 분석해 리포트(report.html, summary.md)를 만듭니다.

  node src/cli.ts check   (엔진 점검: 샘플 결과를 표로 출력)
`;

export async function main(argv: string[]) {
  const { cmd, opts } = args(argv);
  if (cmd === 'extract') {
    if (!opts['pr-body']) throw new Error('--pr-body 파일이 필요합니다.');
    process.stdout.write(extractFromPrBody(readFileSync(opts['pr-body'], 'utf8')));
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
      if (!a || !reqFile) throw new Error('--a(또는 --head) 와 --requirements 가 필요합니다.');
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
    if (!reqs.length) throw new Error('요구사항을 읽지 못했습니다. "- R1: 문장 | keywords: ..." 형식인지 확인하세요.');
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
    const files = writeOutputs(report, out, pr, cmd === 'demo');
    console.log('리포트를 만들었습니다 (코드는 이 PC 밖으로 나가지 않았습니다):');
    for (const f of files) console.log('  ' + f);
    if (opts.open) {
      const page = files.find((f) => f.endsWith(cmd === 'demo' ? 'concept.html' : 'report.html'));
      if (page) openInBrowser(page);
    }
    if (cmd === 'demo') {
      console.log('\n샘플 저장소와 검사 결과는 report 명령 연습용으로 남겨 두었습니다:');
      console.log(`  node src/cli.ts report --repo "${repo}" --base main --a ${a} --b ${b} --requirements "${reqFile}" --junit-a "${ja}" --junit-b "${jb}"`);
    }
    return;
  }
  console.log(HELP);
}

main(process.argv.slice(2)).catch((e) => {
  console.error('오류:', e instanceof Error ? e.message : e);
  process.exit(1);
});

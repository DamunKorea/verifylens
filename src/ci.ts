// CI(GitHub Actions)에서 돌리는 검사. PR 이 많아 사람이 하나씩 볼 수 없을 때를 위한 것이다
// (OKKY 댓글: 「PR 이 수천 개씩 배포되는 곳에서 눈으로 확인은 쉽지 않다」).
// 요구사항마다 한 줄을 출력하고, GitHub 에서는 근거 줄에 표시(annotation)를 남기고 요약을 작업 요약에 쓴다.
// 「다름」 · 「실패」(기본값)가 있으면 종료 코드 1 로 PR 검사를 실패시킨다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { analyzeResult, evaluate } from './engine.ts';
import { parseRequirements } from './requirements.ts';
import { undecidedReasons } from './summary.ts';
import { undecidedLabel } from './numeric.ts';
import { L, wOverall } from './i18n.ts';
import type { Overall } from './types.ts';
import { allLenses, prSummary, summaryLine } from '../vscode/src/model.ts';

const FAIL_WORDS: Record<string, Overall> = { different: '다름', failed: '실패', unverified: '미확인' };

// GitHub 작업 명령의 글은 %, 줄바꿈을, 속성 값은 : 와 , 도 바꿔 써야 한다
const escData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s: string) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function parseFailOn(value: string | undefined): Set<Overall> {
  const words = (value ?? 'different,failed').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = words.filter((w) => !FAIL_WORDS[w]);
  if (unknown.length) throw new Error(L(`--fail-on 에 모르는 값이 있습니다: ${unknown.join(', ')} (different · failed · unverified)`, `Unknown --fail-on value: ${unknown.join(', ')} (use different, failed, unverified)`));
  return new Set(words.map((w) => FAIL_WORDS[w]));
}

export function runCi(opts: Record<string, string>): number {
  const repo = resolve(opts.repo ?? '.');
  const base = opts.base ?? 'origin/main';
  const head = opts.head ?? 'HEAD';
  const reqFile = resolve(repo, opts.requirements ?? '.verifylens/requirements.md');
  const failOn = parseFailOn(opts['fail-on']);
  if (!existsSync(reqFile)) {
    console.error(L(`요구사항 파일이 없습니다: ${reqFile}`, `The requirements file does not exist: ${reqFile}`));
    return 2;
  }
  const reqs = parseRequirements(readFileSync(reqFile, 'utf8'));
  if (!reqs.length) {
    console.error(L('요구사항을 읽지 못했습니다. 「- R1: 문장」 형식인지 확인하세요.', 'No requirements could be read. Each line must look like "- R1: sentence".'));
    return 2;
  }
  let junit = opts.junit ? resolve(repo, opts.junit) : undefined;
  if (junit && !existsSync(junit)) {
    console.log(L(`테스트 결과 파일이 없어 검사 없이 판단합니다: ${junit}`, `The test report was not found, so tests are not used: ${junit}`));
    junit = undefined;
  }
  const set = analyzeResult({ key: 'A', repo, base, ref: head, junit });
  const report = evaluate([set], reqs, repo, base);

  const github = !!process.env.GITHUB_ACTIONS || opts.github === 'true';
  // 표시는 작업 폴더 기준 경로로 남긴다 (저장소가 하위 폴더일 수 있다)
  const workspace = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : repo;
  const lenses = allLenses(report);
  for (const s of report.summaries) {
    const reasons = undecidedReasons(report, s).map((k) => undecidedLabel(k));
    const why = summaryLine(report, s);
    console.log(`${s.req.id} · ${wOverall(s.overall)}${reasons.length ? ` (${reasons.join(', ')})` : ''} — ${s.req.text}${why ? `\n    ${why}` : ''}`);
    if (!github || s.overall === '확인됨') continue;
    const level = s.overall === '미확인' ? 'warning' : 'error';
    const lens = lenses.find((l) => l.reqId === s.req.id);
    const where = lens ? `file=${escProp(relative(workspace, join(repo, lens.file)).split('\\').join('/'))},line=${lens.line},` : '';
    const title = `VerifyLens ${s.req.id} · ${wOverall(s.overall)}`;
    const message = [s.req.text, why, reasons.join(', ')].filter(Boolean).join(' — ');
    console.log(`::${level} ${where}title=${escProp(title)}::${escData(message)}`);
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, prSummary({ kind: 'repo', repo, report, notes: [] }) + '\n');

  const blocking = report.summaries.filter((s) => failOn.has(s.overall));
  const names = [...failOn].map((o) => wOverall(o)).join(L(' · ', ' or '));
  console.log(
    blocking.length
      ? L(`\n${names} 인 요구사항이 ${blocking.length}개 있어 실패로 끝냅니다: ${blocking.map((s) => s.req.id).join(', ')}`, `\n${blocking.length} requirement(s) are ${names}, so this check fails: ${blocking.map((s) => s.req.id).join(', ')}`)
      : L(`\n${names} 인 요구사항이 없습니다.`, `\nNo requirement is ${names}.`),
  );
  return blocking.length ? 1 : 0;
}

// 설치 없이 해 보는 페이지의 판정 부분. 브라우저 안에서 확장과 같은 엔진을 돌린다.
// git · 파일 시스템 · 네트워크를 쓰지 않는다. 입력한 글과 코드만 본다.
import { analyzeFiles, evaluate } from '../src/engine.ts';
import { parseRequirements } from '../src/requirements.ts';
import { undecidedReasons } from '../src/summary.ts';
import { undecidedAction, undecidedLabel } from '../src/numeric.ts';
import type { Overall } from '../src/types.ts';
import { allLenses, attemptDots, attemptLines, chainSteps, setLang, treeModel, verifiedLine, wOverall, type ChainStep, type Lang } from '../vscode/src/model.ts';

export type TryTest = { name: string; status: 'pass' | 'fail' };
export type TryInput = { requirements: string; fileName: string; code: string; tests: TryTest[]; lang: Lang };
export type TryRow = {
  id: string;
  text: string;
  overall: Overall;
  verdict: string;
  reason: string;
  summary: string;
  line: number | null;
  where: string;
  detail: string;
  strip: string[];
  tests: string[];
  /** 「미확인」일 때 까닭과 할 일 */
  todo: { label: string; action: string }[];
  /** 근거 사슬: 요구사항 → 코드 줄 → 검사 → 동작 (확장 · PR 요약과 같은 모델) */
  chain: ChainStep[];
  /** 시도 횟수 점 그림 (요구사항과 코드가 몇 번째에 동작하는가) */
  dots: { max: number; required: number; at: number } | null;
};
export type TryNote = { line: number; endLine: number; reqId: string; overall: Overall; severity: 'ok' | 'warn' | 'info'; head: string; note: string };
export type TryResult = { headline: string; rows: TryRow[]; notes: TryNote[]; requirementLines: string[] };

/**
 * 「- R1: 문장」 형식이 아닌 줄도 받는다. 빈 줄과 # 으로 시작하는 줄은 건너뛰고,
 * 나머지 줄에는 차례대로 R 번호를 붙인다. 이미 R 번호가 있으면 그대로 둔다.
 */
export function normalizeRequirements(text: string): string[] {
  const out: string[] = [];
  let n = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^[-*]?\s*R(\d+)\s*[:.)]\s*(.+)$/i);
    if (m) {
      n = Math.max(n, Number(m[1]));
      out.push(`- R${m[1]}: ${m[2].trim()}`);
      continue;
    }
    const body = line.replace(/^([-*•]|\d+[.)])\s*/, '').trim();
    if (body) out.push(`- R${++n}: ${body}`);
  }
  return out;
}

/** 파일 이름이 비었거나 코드 파일이 아니면 엔진이 읽지 않으므로 .ts 로 맞춘다. */
export function codeFileName(name: string): string {
  const clean = name.trim().replace(/\\/g, '/').replace(/^\/+/, '') || 'src/feature.ts';
  return /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(clean) ? clean : `${clean}.ts`;
}

export function runCheck(input: TryInput): TryResult {
  setLang(input.lang);
  const requirementLines = normalizeRequirements(input.requirements);
  const reqs = parseRequirements(requirementLines.join('\n'));
  const file = codeFileName(input.fileName);
  const tests = input.tests.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), status: t.status, message: '' }));
  const set = analyzeFiles({ key: 'A', ref: 'try', sha: 'try', files: { [file]: input.code }, tests });
  const report = evaluate([set], reqs, '.', 'try');
  const rows = treeModel(report).map((r): TryRow => {
    const child = r.children[0];
    const rr = set.perReq[r.id];
    const s = report.summaries.find((x) => x.req.id === r.id)!;
    return {
      id: r.id,
      text: r.text,
      overall: r.overall,
      verdict: wOverall(r.overall),
      reason: r.reason,
      summary: r.summary,
      line: child?.line ?? null,
      where: child?.label ?? '',
      detail: child?.detail ?? '',
      strip: attemptLines(report, r.id, input.lang),
      tests: rr.tests.map((t) => `${t.status === 'pass' ? '✓' : '✗'} ${t.name}`),
      todo: undecidedReasons(report, s).map((k) => ({ label: undecidedLabel(k, input.lang), action: undecidedAction(k, input.lang) })),
      chain: chainSteps(report, r.id, input.lang),
      dots: (() => {
        const d = attemptDots(report, r.id);
        return d ? { max: d.max, required: d.required, at: d.rows[0].at } : null;
      })(),
    };
  });
  const notes = allLenses(report).map((l) => ({ line: l.line, endLine: l.endLine, reqId: l.reqId, overall: l.overall, severity: l.severity, head: l.head, note: l.note }));
  return { headline: reqs.length ? verifiedLine(report, input.lang) : '', rows, notes, requirementLines };
}

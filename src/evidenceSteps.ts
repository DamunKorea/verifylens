import type { Overall, Report } from './types.ts';
import { getLang } from './i18n.ts';
import { boundaryShort, boundaryLine, undecidedLabel } from './numeric.ts';
import { undecidedReasons } from './summary.ts';
import { editText, suspicious } from './testedits.ts';
import { sentencePieces } from './readout.ts';

// ---------------------------------------------------------------- 근거 사슬 (보는 곳마다 같은 그림)
/**
 * 요구사항 → 코드 줄 → 검사 → 동작(판정) 네 칸. 체험 페이지 · PR 요약(Mermaid) · 훅 메시지가 같은 모델을 그린다.
 * 「미확인」은 비어 있는 칸(miss)이 어디인지가 곧 까닭이다. 대표 11/21: 「얼마나 잘 시각화해서 이해를 빨리 돕느냐」.
 */
export type ChainTone = 'ok' | 'diff' | 'miss' | 'plain';
export type ChainStep = {
  kind: 'req' | 'code' | 'test' | 'act';
  title: string;
  text: string;
  tone: ChainTone;
  /** 검사 칸: 통과했지만 이번 변경에서 바뀐 검사 (실패 색이 아니라 다름 색) */
  changed?: boolean;
  /** 요구사항 칸: 문장에서 읽은 조각 (숫자 조건 · 규칙 종류 · 상태 · 찾는 낱말 — readout.ts) */
  pieces?: string[];
};

export function chainSteps(report: Report, reqId: string, lang: 'ko' | 'en' = getLang(), setIndex = 0): ChainStep[] {
  const s = report.summaries.find((x) => x.req.id === reqId);
  const set = report.sets[setIndex];
  if (!s || !set) return [];
  const ko = lang === 'ko';
  const rr = set.perReq[reqId];
  const ev = rr.evidence;
  const u = ev.unit;
  const b = ev.boundary;
  const code = u
    ? `${u.file}:${u.startLine}${u.cond?.expr ? ` ${u.cond.expr}` : u.kind === 'function' ? (ko ? ' (함수 전체)' : ' (whole function)') : ''}`
    : ko ? '근거를 찾지 못함' : 'no evidence found';
  const codeTone: ChainTone = !u ? 'miss' : ev.status === '발견' ? 'ok' : 'miss';
  const linked = rr.tests;
  const firstFail = linked.find((t) => t.status === 'fail');
  let testText =
    rr.testStatus === '통과'
      ? `${ko ? '통과' : 'passes'}${linked[0] ? ` · ${linked[0].name}` : ''}`
      : rr.testStatus === '실패'
        ? `${ko ? '실패' : 'fails'}${firstFail ? ` · ${firstFail.name}` : ''}`
        : linked[0]
          ? `${ko ? '돌리지 않음' : 'not run'} · ${linked[0].name}`
          : ko ? '연결된 검사 없음' : 'no linked test';
  let testTone: ChainTone = rr.testStatus === '통과' ? 'ok' : rr.testStatus === '실패' ? 'diff' : 'miss';
  // 이 요구사항의 검사를 이번 변경에서 바꾸거나 지웠으면 「검사」 칸에 적고 어긋남(다름 색)으로 칠한다 — 통과가 그 변경 덕일 수 있다.
  // (실패한 검사는 그대로 실패 색. changed 는 「통과했지만 바뀐 검사」만 표시한다)
  const edited = (rr.edits ?? []).filter(suspicious);
  let changed = false;
  if (edited.length) {
    testText += ` · ${editText(edited[0], lang)}${edited.length > 1 ? ` (+${edited.length - 1})` : ''}`;
    changed = rr.testStatus !== '실패';
    testTone = 'diff';
  }
  let act: ChainStep;
  if (b && b.attempts !== null) {
    const late = b.attempts - b.required;
    const off = late === 0 ? '' : ko ? ` ✗ ${Math.abs(late)}번 ${late > 0 ? '늦음' : '빠름'}` : ` ✗ ${Math.abs(late)} ${late > 0 ? 'late' : 'early'}`;
    act = { kind: 'act', title: ko ? '동작' : 'acts', text: ko ? `${b.attempts}번째 시도 (요구 ${b.required})${off}` : `attempt ${b.attempts} (required ${b.required})${off}`, tone: b.ok === true ? 'ok' : b.ok === false ? 'diff' : 'miss' };
  } else if (b) {
    act = { kind: 'act', title: ko ? '동작' : 'acts', text: boundaryShort(b, lang) || boundaryLine(b, lang), tone: b.ok === true ? 'ok' : b.ok === false ? 'diff' : 'miss' };
  } else {
    const reason = s.overall === '미확인' ? undecidedReasons(report, s).slice(0, 1).map((k) => undecidedLabel(k, lang))[0] ?? '' : '';
    // (판정 낱말은 이 요약의 언어로. wOverall 은 화면 언어를 따른다)
    const word = ko ? s.overall : ({ 확인됨: 'Verified', 다름: 'Different', 실패: 'Failed', 미확인: 'Not verified' } as Record<Overall, string>)[s.overall];
    act = { kind: 'act', title: ko ? '판정' : 'verdict', text: `${word}${reason ? ` · ${reason}` : ''}`, tone: s.overall === '확인됨' ? 'ok' : s.overall === '미확인' ? 'miss' : 'diff' };
  }
  return [
    { kind: 'req', title: ko ? '요구사항' : 'requirement', text: s.req.text, tone: 'plain', pieces: sentencePieces(s.req, lang) },
    { kind: 'code', title: ko ? '코드' : 'code', text: code, tone: codeTone },
    { kind: 'test', title: ko ? '검사' : 'tests', text: testText, tone: testTone, ...(changed ? { changed: true } : {}) },
    act,
  ];
}

/** 시도 횟수 점 그림의 자료: 요구사항이 몇 번째에, 코드가 몇 번째에 동작하는가 (계산할 수 없으면 null) */
export function attemptDots(report: Report, reqId: string): { max: number; required: number; rows: { key: 'A' | 'B'; at: number }[] } | null {
  const rows = report.sets.map((set) => ({ key: set.key, b: set.perReq[reqId]?.evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return null;
  const required = rows[0].b!.required;
  const max = Math.max(required, ...rows.map((x) => x.b!.attempts as number)) + 1;
  if (max > 13) return null;
  return { max, required, rows: rows.map((x) => ({ key: x.key, at: x.b!.attempts as number })) };
}

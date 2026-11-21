import { suspicious } from './testedits.ts';
import type { Report, ReqSummary } from './types.ts';
import { ID, ST, esc, evColor, overallColor, testColor, units, wrapText } from './view.ts';
import { L, wEvidence, wJudge, wTest } from './i18n.ts';
import { boundaryShort, pick } from './numeric.ts';

type Box = { title: string; lines: string[]; sub?: string; mono?: boolean; color: string; dashed?: boolean; badge?: 'A' | 'B'; judgeOf?: string };

const W = 1180;
const LANE_H = 98;
const GAP = 34;
const TOP = 6;
const COL = { req: { x: 0, w: 214 }, code: { x: 256, w: 292 }, test: { x: 590, w: 240 }, beh: { x: 872, w: 156 }, judge: { x: 1070, w: 110 } };

function box(x: number, y: number, w: number, h: number, b: Box): string {
  const out: string[] = [];
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#0F1B30" stroke="${b.color}" stroke-width="1.6"${b.dashed ? ' stroke-dasharray="5 4"' : ''}/>`);
  out.push(`<rect x="${x + 1}" y="${y + 10}" width="4" height="${h - 20}" rx="2" fill="${b.color}"/>`);
  out.push(`<text x="${x + 16}" y="${y + 21}" class="ct">${esc(b.title)}</text>`);
  if (b.badge) out.push(`<circle cx="${x + w - 18}" cy="${y + 17}" r="10" fill="${ID[b.badge]}"/><text x="${x + w - 18}" y="${y + 21.5}" class="cb" text-anchor="middle">${b.badge}</text>`);
  const lineH = 17;
  const startY = y + 42;
  b.lines.forEach((l, i) => {
    const attr = b.judgeOf && i === 0 ? ` data-judge-of="${b.judgeOf}"` : '';
    out.push(`<text x="${x + 16}" y="${startY + i * lineH}" class="${b.mono ? 'cm' : 'cl2'}"${attr}>${esc(l)}</text>`);
  });
  if (b.sub) out.push(`<text x="${x + 16}" y="${y + h - 12}" class="cs">${esc(b.sub)}</text>`);
  return out.join('');
}

function arrow(x1: number, y: number, x2: number): string {
  return `<path d="M${x1} ${y} H${x2 - 2}" stroke="#4A6591" stroke-width="1.5" fill="none" marker-end="url(#cha)"/>`;
}

function gapPill(cx: number, cy: number, text: string, color: string): string {
  const w = 18 + units(text) * 11.5;
  return `<rect x="${cx - w / 2}" y="${cy - 11}" width="${w}" height="22" rx="11" fill="#1A1A10" stroke="${color}" stroke-width="1.2"/><text x="${cx}" y="${cy + 4}" class="cp" fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}

/** 요구사항 → 코드 근거 → 검사 → 동작 시점 → 사람의 판단 을 결과마다 한 줄(레인)로 잇는다. */
export function renderChain(report: Report, s: ReqSummary): string {
  const sets = report.sets;
  const id = s.req.id;
  const reqLines = wrapText(s.req.text, 12.5, 4);
  const kwLines = s.req.keywords.length ? wrapText(s.req.keywords.join(' · '), 15, 3, true) : [];
  // 요구사항 상자에 글·찾는 단어·숫자가 다 들어갈 높이
  const reqNeed = 42 + reqLines.length * 17 + (kwLines.length ? 16 + 18 + kwLines.length * 16 : 0) + 22;
  const lanesH = sets.length * LANE_H + (sets.length - 1) * GAP;
  const H = TOP * 2 + Math.max(lanesH, reqNeed);
  const off = (H - TOP * 2 - lanesH) / 2;
  const laneY = (i: number) => TOP + off + i * (LANE_H + GAP);
  const p: string[] = [];
  p.push(`<svg class="chain" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(id)} ${L('근거 사슬', 'evidence chain')}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="cha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5C79A8"/></marker></defs>`);

  // 요구사항 (모든 레인을 덮는 상자)
  const nums = s.req.numbers.length ? L(`숫자 ${s.req.numbers.join('·')}`, `number ${s.req.numbers.join(', ')}`) : s.req.guardCue ? L('거부 조건', 'rejection rule') : '';
  p.push(box(COL.req.x, TOP, COL.req.w, H - TOP * 2, { title: `${id} · ${L('요구사항', 'requirement')}`, lines: reqLines, sub: nums, color: overallColor(s.overall) }));
  if (kwLines.length) {
    const ky = TOP + 42 + reqLines.length * 17 + 16;
    p.push(`<text x="${COL.req.x + 16}" y="${ky}" class="cs">${L('찾는 단어', 'keywords')}</text>`);
    kwLines.forEach((l, i) => p.push(`<text x="${COL.req.x + 16}" y="${ky + 18 + i * 16}" class="ck">${esc(l)}</text>`));
  }

  sets.forEach((set, i) => {
    const y = laneY(i);
    const cy = y + LANE_H / 2;
    const rr = set.perReq[id];
    const e = rr.evidence;
    const u = e.unit;
    // 코드 근거
    const cond = u?.kind === 'condition';
    const codeLines = u ? (cond ? wrapText(u.cond?.expr ?? u.text, 20, 2, true) : [L(`${u.fn}() 함수 전체`, `${u.fn}() whole function`)]) : [L('구현 근거 없음', 'No evidence found')];
    const codeSub = u ? `${u.file}:${u.startLine} · ${wEvidence(e.status)}${u.kind === 'function' ? L(' · 넓은 근거', ' · broad evidence') : ''}` : L('관련 코드를 찾지 못함', 'no related code found');
    p.push(arrow(COL.req.x + COL.req.w, cy, COL.code.x));
    p.push(box(COL.code.x, y, COL.code.w, LANE_H, { title: `${set.label} · ${L('코드 근거', 'code evidence')}`, lines: codeLines, sub: codeSub, mono: cond, color: u?.kind === 'function' ? ST.diff : evColor(e.status), badge: set.key, dashed: !u }));
    // 검사
    const t = rr.tests.find((x) => x.status === 'fail') ?? rr.tests[0];
    const changed = rr.testStatus !== '실패' && rr.edits?.some(suspicious);
    const testLines = t ? wrapText(t.name, 20, 2) : [L('연결된 검사 없음', 'No linked test')];
    const testSub = t
      ? t.status === 'fail'
        ? wrapText(`${L('실패', 'failed')} · ${t.message}`, 19, 1)[0]
        : L(`${rr.testStatus} · 연결 ${rr.tests.length}개`, `${wTest(rr.testStatus)} · ${rr.tests.length} linked`)
      : L('미실행 → 동작 미확인', 'not run → behavior unverified');
    p.push(arrow(COL.code.x + COL.code.w, cy, COL.test.x));
    p.push(box(COL.test.x, y, COL.test.w, LANE_H, { title: changed ? L('⚠ 검사 · 변경됨', '⚠ tests · changed') : L('검사', 'tests'), lines: testLines, sub: testSub, color: changed ? ST.diff : testColor(rr.testStatus), dashed: !t }));
    // 동작 시점
    const b = e.boundary;
    let behLines = ['—'];
    let behSub = L('숫자 조건 없음', 'no numeric condition');
    let behColor = ST.unk;
    if (b && b.attempts !== null) {
      behLines = [L(`${b.attempts}번째 시도`, `attempt ${b.attempts}`)];
      behSub = L(`요구사항 ${b.required}회 · ${b.ok ? '일치' : '다름'}`, `required ${b.required} · ${b.ok ? 'matches' : 'differs'}`);
      behColor = b.ok ? ST.ok : ST.diff;
    } else if (b && b.ok !== null) {
      behLines = wrapText(boundaryShort(b), 11, 2);
      behSub = wrapText(`${pick(b.want)} · ${b.ok ? L('일치', 'matches') : L('다름', 'differs')}`, 11, 1)[0];
      behColor = b.ok ? ST.ok : ST.diff;
    } else if (b) {
      behLines = [L('확정 불가', 'undetermined')];
      behSub = wrapText(pick(b.want), 11, 1)[0];
    }
    p.push(arrow(COL.test.x + COL.test.w, cy, COL.beh.x));
    p.push(box(COL.beh.x, y, COL.beh.w, LANE_H, { title: L('동작 시점', 'when it acts'), lines: behLines, sub: behSub, color: behColor, dashed: !b }));
    p.push(arrow(COL.beh.x + COL.beh.w, cy, COL.judge.x));
  });

  // 사람의 판단 (모든 레인을 덮는 상자)
  p.push(box(COL.judge.x, TOP, COL.judge.w, H - TOP * 2, { title: L('사람의 판단', 'your decision'), lines: [wJudge('미검토')], sub: L('직접 정함', 'you decide'), color: ST.info, judgeOf: id }));

  // 두 결과 사이 차이 표시
  if (sets.length === 2) {
    const gy = laneY(0) + LANE_H + GAP / 2;
    const [A, B] = sets;
    if (s.relation.kind === '불일치') p.push(gapPill(COL.code.x + COL.code.w / 2, gy, L('A·B 조건 불일치', 'A and B differ'), ST.diff));
    else if (s.relation.kind === '일치') p.push(gapPill(COL.code.x + COL.code.w / 2, gy, L('같은 근거', 'same evidence'), ST.ok));
    const ta = A.perReq[id].testStatus;
    const tb = B.perReq[id].testStatus;
    if (ta !== tb) p.push(gapPill(COL.test.x + COL.test.w / 2, gy, L('검사 결과 다름', 'test results differ'), ST.fail));
    const ba = A.perReq[id].evidence.boundary?.attempts;
    const bb = B.perReq[id].evidence.boundary?.attempts;
    if (ba != null && bb != null && ba !== bb) p.push(gapPill(COL.beh.x + COL.beh.w / 2, gy, L(`${Math.abs(ba - bb)}회 차이`, `off by ${Math.abs(ba - bb)}`), ST.diff));
  }
  p.push('</svg>');
  return p.join('');
}

import type { FlowGraph, FlowNode } from './types.ts';
import { ST, esc, wrapText } from './view.ts';
import { L } from './i18n.ts';

const COL_W = 214;
const ROW_H = 64;
const NODE_W = 196;
const NODE_H = 46;

export type FlowOpts = {
  hi: { start: number; end: number } | null;
  /** 다른 결과에는 없는 문장을 가진 단계: 노드 id → 그 문장들 */
  onlyHere?: Map<number, string[]>;
  /** 표시할 결과 이름(예: B) */
  onlyKey?: string;
  idColor?: string;
};

/** 이 흐름의 단계 중, 다른 흐름 어디에도 없는 문장을 가진 단계를 찾는다. */
export function diffFlow(g: FlowGraph, other: FlowGraph): Map<number, string[]> {
  const theirs = new Set(other.nodes.flatMap((n) => n.stmts));
  const out = new Map<number, string[]>();
  for (const n of g.nodes) {
    const extra = n.stmts.filter((s) => !theirs.has(s));
    if (extra.length) out.set(n.id, extra);
  }
  return out;
}

/**
 * 함수 하나의 흐름 지도. 변경된 조건(hi)이 있으면 시작부터 그 조건까지의 경로와
 * 조건이 참일 때의 결과만 또렷하게 그리고 나머지는 흐리게 한다.
 */
export function renderFlowSvg(g: FlowGraph, o: FlowOpts): string {
  const pos = (n: FlowNode) => ({ x: 12 + n.col * COL_W, y: 10 + n.row * ROW_H });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const hot = new Set(g.nodes.filter((n) => o.hi && n.kind === 'decision' && n.line >= o.hi.start && n.line <= o.hi.end).map((n) => n.id));
  // 경로 강조: hot 의 조상 + hot 의 「예」 쪽 자손
  const focus = new Set<number>();
  if (hot.size) {
    const parents = new Map<number, number[]>();
    for (const e of g.edges) if (!e.back) parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
    const stack = [...hot];
    while (stack.length) {
      const id = stack.pop()!;
      if (focus.has(id)) continue;
      focus.add(id);
      for (const p of parents.get(id) ?? []) stack.push(p);
    }
    for (const h of hot) {
      const hn = byId.get(h)!;
      const q = g.edges.filter((e) => e.from === h && !e.back && (byId.get(e.to)?.col ?? 0) > hn.col).map((e) => e.to);
      while (q.length) {
        const id = q.shift()!;
        if (focus.has(id)) continue;
        focus.add(id);
        for (const e of g.edges) if (e.from === id && !e.back && (byId.get(e.to)?.col ?? 0) > hn.col) q.push(e.to);
      }
    }
  }
  const dim = (id: number) => hot.size > 0 && !focus.has(id);
  const maxCol = Math.max(...g.nodes.map((n) => n.col));
  const maxRow = Math.max(...g.nodes.map((n) => n.row));
  const W = 12 + (maxCol + 1) * COL_W;
  const H = 10 + (maxRow + 1) * ROW_H + (g.truncated ? 20 : 0);
  const p: string[] = [];
  p.push(`<svg class="flow" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(g.fn)} ${L('흐름 지도', 'flow map')}"><defs><marker id="fa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5C79A8"/></marker></defs>`);
  for (const e of g.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const pa = pos(a);
    const pb = pos(b);
    const acx = pa.x + NODE_W / 2;
    const bcx = pb.x + NODE_W / 2;
    let d: string;
    let lx = 0;
    let ly = 0;
    if (e.back) d = `M${acx} ${pa.y + NODE_H} V${pb.y - 10} H${bcx} V${pb.y - 1}`;
    else if (b.col > a.col) {
      const ay = pa.y + NODE_H / 2;
      const by = pb.y + NODE_H / 2;
      d = a.row === b.row ? `M${pa.x + NODE_W} ${ay} H${pb.x - 1}` : `M${pa.x + NODE_W} ${ay} H${pb.x - 10} V${by} H${pb.x - 1}`;
      lx = pa.x + NODE_W + 3;
      ly = ay - 5;
    } else {
      d = `M${acx} ${pa.y + NODE_H} V${pb.y - 1}`;
      lx = acx + 6;
      ly = pa.y + NODE_H + 13;
    }
    const on = focus.has(e.from) && focus.has(e.to);
    p.push(`<path d="${d}" fill="none" stroke="${on ? '#8DB5F4' : '#3E5784'}" stroke-width="${on ? 2 : 1.3}"${e.back ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#fa)" opacity="${dim(e.from) || dim(e.to) ? 0.4 : 1}"/>`);
    if (e.label) p.push(`<text x="${lx}" y="${ly}" class="fe" opacity="${dim(e.from) ? 0.45 : 1}">${esc(e.label)}</text>`);
  }
  for (const n of g.nodes) {
    const { x, y } = pos(n);
    const isHot = hot.has(n.id);
    const extra = o.onlyHere?.get(n.id);
    const only = !!extra && n.kind !== 'start' && !isHot;
    let stroke = '#3E5784';
    if (n.kind === 'start') stroke = '#4285E8';
    if (n.kind === 'end') stroke = n.label.startsWith('throw') ? '#B2574D' : '#2F9A6F';
    if (only && o.idColor) stroke = o.idColor;
    if (isHot) stroke = ST.diff;
    const fill = isHot ? '#2A2112' : '#101C30';
    const dash = only ? ' stroke-dasharray="5 3"' : '';
    const op = dim(n.id) ? ' opacity="0.42"' : '';
    p.push(`<g${op}>`);
    if (n.kind === 'decision') {
      p.push(`<polygon points="${x + 12},${y} ${x + NODE_W - 12},${y} ${x + NODE_W},${y + NODE_H / 2} ${x + NODE_W - 12},${y + NODE_H} ${x + 12},${y + NODE_H} ${x},${y + NODE_H / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${isHot ? 2.2 : 1.3}"${dash}/>`);
    } else {
      p.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="${n.kind === 'start' ? 23 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${dash}/>`);
    }
    // 글자 폭 단위 1 = 한글 한 글자(약 11.5px). 상자 안쪽 폭에 맞춘다.
    const lines = wrapText(n.label, n.kind === 'decision' ? 14 : 15, 2, true);
    const ty = lines.length === 1 ? y + NODE_H / 2 + 4 : y + NODE_H / 2 - 3;
    const tip = [...n.stmts, ...(only ? ['', L(`${o.onlyKey ?? ''}에만 있는 문장:`, `Only in ${o.onlyKey ?? ''}:`), ...extra!] : [])].join('\n') || n.label;
    p.push(`<text class="fl${isHot ? ' hot' : ''}"><title>${esc(tip)}</title>${lines.map((l, i) => `<tspan x="${x + (n.kind === 'decision' ? 16 : 11)}" y="${ty + i * 14}">${esc(l)}</tspan>`).join('')}</text>`);
    p.push(`<text x="${x + NODE_W - 6}" y="${y - 3}" class="fn2" text-anchor="end">${L(`${n.line}행`, `line ${n.line}`)}</text>`);
    if (only && o.onlyKey) {
      const tag = extra!.length < n.stmts.length ? L(`+${extra!.length}줄 ${o.onlyKey}에만`, `+${extra!.length} only in ${o.onlyKey}`) : L(`${o.onlyKey}에만`, `only in ${o.onlyKey}`);
      p.push(`<text x="${x + 4}" y="${y - 3}" class="fo" fill="${o.idColor}">${esc(tag)}</text>`);
    }
    p.push('</g>');
  }
  if (g.truncated) p.push(`<text x="12" y="${H - 5}" class="fe">${L('… 함수가 길어 앞부분만 그렸습니다', '… the function is long; only the first part is drawn')}</text>`);
  p.push('</svg>');
  return p.join('');
}

import type { Overall } from './types.ts';
import type { ChainStep } from './evidenceSteps.ts';
import { esc } from './view.ts';

import { light } from './verdictStyle.ts';
const symbols = { plain: '', ok: '✓ ', diff: '⚠ ', fail: '✕ ', miss: '? ' };

export function stepTone(step: ChainStep, overall?: Overall) {
  if (step.tone === 'diff' && (step.kind === 'test' ||
      (step.kind === 'act' && overall === '실패' && (step.title === '판정' || step.title === 'verdict')))) return 'fail';
  return step.tone;
}

export function evidenceChain(steps: ChainStep[], overall: Overall): string {
  return '<span class="vl-chain">' + steps.map(step => {
    const tone = stepTone(step, overall);
    return `<span class="vl-step vl-${tone}"><strong>${symbols[tone]}${esc(step.title)}</strong><span${step.kind === 'code' ? ' class="vl-code"' : ''}>${esc(step.text)}</span></span>`;
  }).join('<span class="vl-arrow" aria-hidden="true">→</span>') + '</span>';
}

export function attemptComparison(required: number, at: number, label: string, test: ChainStep | undefined, lang: 'ko' | 'en'): string {
  const ko = lang === 'ko';
  const stat = (caption: string, n: number, tone: string) =>
    `<span class="vl-stat vl-${tone}"><small>${esc(caption)}</small>${ko ? `<b>${n}</b><span>번째</span>` : `<span>Attempt</span><b>${n}</b>`}</span>`;
  const status = test && { ok: ko ? '검사 통과' : 'Test passed', diff: ko ? '검사 실패' : 'Test failed', miss: ko ? '검사 미실행' : 'No linked test', plain: '' }[test.tone];
  const tone = test ? stepTone(test) : 'miss';
  return `<span class="vl-compare">${stat(ko ? '요구사항' : 'Required', required, 'plain')}<span class="vl-link" aria-hidden="true">→</span>${stat(label, at, at === required ? 'ok' : 'diff')}${status ? `<strong class="vl-test vl-${tone}">${symbols[tone]}${status}</strong>` : ''}</span>`;
}

export function attemptChart(max: number, required: number, rows: { label: string; at: number }[], lang: 'ko' | 'en'): string {
  const ko = lang === 'ko';
  function row(label: string, at: number, tone: string, note = '') {
    const dots = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<span class="vl-dot${n === at ? ' vl-active vl-' + tone : n > at ? ' vl-after' : ''}">${n}</span>`;
    }).join('');
    return `<span class="vl-row"><b>${esc(label)}</b><span class="vl-track">${dots}</span>${note ? `<strong class="vl-note vl-${tone}">${note}</strong>` : ''}</span>`;
  }
  const codeRows = rows.map(({label, at}) => {
    const d = at - required;
    const delta = d === 0 ? (ko ? '같은 시점' : 'same attempt') : ko ? `${Math.abs(d)}번 ${d > 0 ? '늦음' : '빠름'}` : `${Math.abs(d)} ${d > 0 ? 'late' : 'early'}`;
    return row(label, at, d === 0 ? 'ok' : 'diff', (d === 0 ? '✓ ' : '⚠ ') + delta);
  });
  return `<span class="vl-dots">${row(ko ? '요구사항' : 'Required', required, 'plain')}${codeRows.join('')}</span>`;
}

export const evidenceCSS = `
${Object.keys(light).map(k => `.vl-${k}{--ink:var(--vl-${k});--tint:var(--vl-${k}-bg)}`).join('\n')}
.vl-chain{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr);align-items:stretch;gap:4px;margin:12px 0}
.vl-step{display:flex;flex-direction:column;gap:5px;padding:11px;border:1px solid color-mix(in srgb,var(--ink) 52%,var(--tint));border-radius:8px;background:var(--tint);font-size:13px;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}
.vl-step strong,.vl-note{color:var(--ink);font-size:12px}.vl-step.vl-diff,.vl-step.vl-fail{box-shadow:inset 3px 0 var(--ink)}
.vl-step.vl-miss{border-style:dashed;border-color:var(--ink)}.vl-code{font-family:ui-monospace,Consolas,monospace;font-variant-ligatures:none}
.vl-arrow{align-self:center;color:var(--vl-miss)}

.vl-compare{display:flex;align-items:center;gap:clamp(10px,2vw,28px);padding:14px 0 12px;margin-top:8px;border-top:1px solid var(--vl-miss-bg);font-variant-numeric:tabular-nums}
.vl-stat{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:1px 4px;color:var(--ink)}
.vl-stat small{grid-column:1/-1;font-size:12px;font-weight:700}.vl-stat b{font-size:clamp(30px,3.2vw,52px);line-height:1;font-weight:720;letter-spacing:-.045em}
.vl-stat>span{font-size:12px}.vl-link{font-size:24px;color:var(--vl-miss)}
.vl-test{align-self:center;background:var(--tint);color:var(--ink);border:1px solid var(--ink);border-radius:18px;padding:3px 9px;font-size:12px;white-space:nowrap}
.vl-dots{display:grid;gap:6px;margin:12px 0;font-variant-numeric:tabular-nums}
.vl-row{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px}
.vl-dots{padding:10px 0;border-block:1px solid var(--vl-miss-bg)}.vl-row>b{min-width:58px}.vl-track{display:inline-flex;gap:3px;flex-wrap:wrap}
.vl-dot{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1px solid var(--vl-miss);color:var(--vl-miss)}
.vl-dot.vl-active{background:var(--ink);border:2px solid var(--ink);color:var(--tint);font-weight:800;outline:1px solid var(--ink);outline-offset:1px}
.vl-after{border-style:dotted}.vl-note{white-space:nowrap}
@media(max-width:640px){
.vl-chain{display:flex;flex-direction:column;gap:0}.vl-step{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:baseline;padding:6px 8px}
.vl-arrow{align-self:start;margin-left:17px;line-height:12px;transform:rotate(90deg)}
}
`;

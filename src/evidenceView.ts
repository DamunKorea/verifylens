import type { Overall, TestStatus } from './types.ts';
import type { ChainStep } from './evidenceSteps.ts';
import { esc } from './view.ts';

import { light } from './verdictStyle.ts';
const symbols = { plain: '', ok: '✓ ', diff: '⚠ ', fail: '✕ ', miss: '? ' };

export function stepTone(step: ChainStep, overall?: Overall) {
  // 검사 칸의 diff 는 「실패한 검사」라서 실패 색. 단, 통과했지만 이번 변경에서 바뀐 검사(changed)는 다름 색으로 둔다
  if (step.tone === 'diff' && ((step.kind === 'test' && !step.changed) ||
      (step.kind === 'act' && overall === '실패' && (step.title === '판정' || step.title === 'verdict')))) return 'fail';
  return step.tone;
}

export function evidenceChain(steps: ChainStep[], overall: Overall): string {
  return '<span class="vl-chain">' + steps.map(step => {
    const tone = stepTone(step, overall);
    return `<span class="vl-step vl-${tone}" data-step="${step.kind}"><strong>${symbols[tone]}${esc(step.title)}</strong><span${step.kind === 'code' ? ' class="vl-code"' : ''}>${esc(step.text)}</span></span>`;
  }).join('<span class="vl-arrow" aria-hidden="true">→</span>') + '</span>';
}

export function attemptComparison(required: number, at: number, label: string, test: ChainStep | undefined, lang: 'ko' | 'en', runStatus?: TestStatus): string {
  const ko = lang === 'ko';
  const stat = (caption: string, n: number, tone: string) =>
    `<span class="vl-stat vl-${tone}"><small>${esc(caption)}</small>${ko ? `<b>${n}</b><span>번째</span>` : `<span>Attempt</span><b>${n}</b>`}</span>`;
  const actual = runStatus && { 통과: 'ok', 실패: 'diff', 미실행: 'miss' }[runStatus] as 'ok' | 'diff' | 'miss' | undefined;
  const status = test && { ok: ko ? '검사 통과' : 'Test passed', diff: ko ? '검사 실패' : 'Test failed', miss: ko ? '검사 미실행' : 'No linked test', plain: '' }[actual ?? test.tone];
  const tone = test ? stepTone(test) : 'miss';
  return `<span class="vl-compare">${stat(ko ? '요구사항' : 'Required', required, 'plain')}<span class="vl-link" aria-hidden="true">→</span>${stat(label, at, at === required ? 'ok' : 'diff')}${status ? `<strong class="vl-test vl-${tone}">${symbols[tone]}${status}</strong>` : ''}</span>`;
}

export function attemptChart(max: number, required: number, rows: { label: string; at: number }[], lang: 'ko' | 'en'): string {
  const ko = lang === 'ko';
  function row(label: string, at: number, tone: string) {
    const dots = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<span class="vl-dot${n === at ? ' vl-active vl-' + tone : n > at ? ' vl-after' : ''}">${n}</span>`;
    }).join('');
    return `<span class="vl-row"><b>${esc(label)}</b><span class="vl-track">${dots}</span></span>`;
  }
  const codeRows = rows.map(({label, at}) => {
    const d = at - required;
    const delta = d === 0 ? (ko ? '같은 시점' : 'same attempt') : ko ? `${Math.abs(d)}번 ${d > 0 ? '늦음' : '빠름'}` : `${Math.abs(d)} ${d > 0 ? 'late' : 'early'}`;
    const tone = d === 0 ? 'ok' : 'diff';
    const x = (n: number) => 100 * (n - 0.5) / max;
    const from = x(required), to = x(at);
    const hasDot = (n: number) => Number.isInteger(n) && n >= 1 && n <= max;
    const line = hasDot(at) && hasDot(required)
      ? `<svg aria-hidden="true" viewBox="0 0 100 32" preserveAspectRatio="none"><path d="M ${from} 0 V 24 H ${to} V 32" vector-effect="non-scaling-stroke"/></svg>`
      : '';
    const link = `<span class="vl-gap vl-${tone}" style="--mid:${(from + to) / 2}%">${line}<strong>${delta}</strong></span>`;
    return `<span class="vl-pair">${row(ko ? '요구사항' : 'Required', required, 'plain')}${link}${row(label, at, tone)}</span>`;
  });
  return `<span class="vl-dots" style="--count:${max}">${codeRows.join('')}</span>`;
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
.vl-pair{display:grid;grid-template-columns:4.8em minmax(0,1fr);align-items:center;column-gap:6px;max-width:calc(4.8em + 6px + var(--count)*31px);font-size:12px}
.vl-row{display:contents}.vl-track{display:grid;grid-template-columns:repeat(var(--count),minmax(0,1fr));justify-items:center}
.vl-gap{position:relative;grid-column:2;height:32px;color:var(--ink)}
.vl-gap svg{position:absolute;inset:0;width:100%;height:100%;stroke:currentColor;stroke-width:1.6;fill:none}
.vl-gap strong{position:absolute;top:2px;left:clamp(3.3em,var(--mid),calc(100% - 3.3em));transform:translateX(-50%);white-space:nowrap;padding:0 4px;border-radius:4px;background:var(--tint);font-size:11px}
.vl-dots{padding:10px 0;border-block:1px solid var(--vl-miss-bg)}
.vl-dot{display:grid;place-items:center;width:min(24px,92%);max-width:100%;aspect-ratio:1;border-radius:50%;border:1px solid var(--vl-miss);color:var(--vl-miss);line-height:1}
.vl-dot.vl-active{background:var(--ink);border:2px solid var(--ink);color:var(--tint);font-weight:800;outline:1px solid var(--ink);outline-offset:1px}
.vl-after{border-style:dotted}.vl-note{white-space:nowrap}
@media(max-width:640px){
.vl-chain{display:flex;flex-direction:column;gap:0}.vl-step{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:baseline;padding:6px 8px}
.vl-arrow{align-self:start;margin-left:17px;line-height:12px;transform:rotate(90deg)}
}
`;

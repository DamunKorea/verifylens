export const marks = { 확인됨: '✅', 다름: '⚠️', 실패: '❌', 미확인: '❔' };
export const tones = { 확인됨: 'ok', 다름: 'diff', 실패: 'fail', 미확인: 'miss' } as const;
export const light = { ok: ['#176840','#e4f4ec'], diff: ['#884600','#fff1d9'], fail: ['#a72b36','#fce9ec'], miss: ['#536173','#edf0f4'], plain: ['#275eae','#eaf1ff'] };
export const dark = { ok: ['#62d6a0','#113229'], diff: ['#ffc26b','#38291a'], fail: ['#ff9099','#3b202a'], miss: ['#aab8ca','#202b3b'], plain: ['#94bbff','#192d49'] };

export function palette(theme: typeof light) {
  return Object.entries(theme).map(([k,[ink,fill]]) => `--vl-${k}:${ink};--vl-${k}-bg:${fill};`).join('');
}

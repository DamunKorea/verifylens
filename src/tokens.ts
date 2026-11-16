const STOP = new Set([
  'if', 'else', 'return', 'const', 'let', 'var', 'new', 'await', 'async', 'function', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'is',
  'and', 'or', 'not', 'true', 'false', 'null', 'undefined', 'this', 'typeof', 'void', 'import', 'from', 'export', 'default', 'throw',
  'try', 'catch', 'for', 'while', 'as', 'type',
]);

export function stem(word: string): string {
  let s = word.toLowerCase();
  const ord = s.match(/^(\d+)(st|nd|rd|th)$/);
  if (ord) return ord[1];
  if (/^\d+$/.test(s)) return s;
  if (/[가-힣]/.test(s)) return s;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const parts = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9가-힣]+/);
  for (const p of parts) {
    if (!p) continue;
    const s = stem(p);
    if (s.length < 2 && !/^\d$/.test(s)) continue;
    if (STOP.has(s)) continue;
    out.push(s);
  }
  return out;
}

export function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

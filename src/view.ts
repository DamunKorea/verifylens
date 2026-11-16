// 리포트 그림에서 같이 쓰는 색과 글자 도구

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- 코드 색칠 (리포트·컨셉 시연 공용)
const KW = new Set(['export', 'async', 'function', 'const', 'let', 'var', 'if', 'else', 'throw', 'await', 'return', 'new', 'import', 'from', 'type', 'class', 'extends', 'try', 'catch', 'for', 'of', 'in', 'typeof', 'default']);
export function hl(line: string): string {
  const rx = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = rx.exec(line))) {
    const [t, c, s, n, id, ws] = m;
    if (c) out += `<span class="c">${esc(c)}</span>`;
    else if (s) out += `<span class="s">${esc(s)}</span>`;
    else if (n) out += `<span class="n">${n}</span>`;
    else if (id) {
      const next = line[m.index + t.length];
      const prev = line[m.index - 1];
      const cls = KW.has(id) ? 'k' : next === '(' ? 'f' : prev === '.' ? 'p' : /^[A-Z]/.test(id) ? 'ty' : '';
      out += cls ? `<span class="${cls}">${id}</span>` : id;
    } else if (ws) out += t;
    else out += `<span class="pu">${esc(t)}</span>`;
  }
  return out;
}

/** 줄 안의 조건식(expr)을 감싸고, 연산자(op)를 따로 강조한다. */
export function hlMark(line: string, expr?: string, op?: string): string {
  if (!expr) return hl(line);
  const i = line.indexOf(expr);
  if (i < 0) return hl(line);
  const mid = line.slice(i, i + expr.length);
  let midHtml = hl(mid);
  if (op) {
    const j = mid.indexOf(op);
    if (j >= 0) midHtml = hl(mid.slice(0, j)) + `<b class="op">${esc(op)}</b>` + hl(mid.slice(j + op.length));
  }
  return hl(line.slice(0, i)) + `<mark class="xm">${midHtml}</mark>` + hl(line.slice(i + expr.length));
}

/** 결과를 구분하는 색 (상태 색과 겹치지 않게) */
export const ID: Record<'A' | 'B', string> = { A: '#38BDF8', B: '#C084FC' };

/** 상태 색: 확인·다름·실패·미확인 */
export const ST = { ok: '#34D399', diff: '#FBBF24', fail: '#F87171', unk: '#94A3B8', info: '#4285E8' };

export const evColor = (s: string) => (s === '발견' ? ST.ok : s === '일부 발견' ? ST.diff : ST.unk);
export const testColor = (s: string) => (s === '통과' ? ST.ok : s === '실패' ? ST.fail : ST.unk);
export const overallColor = (s: string) => (s === '확인됨' ? ST.ok : s === '다름' ? ST.diff : s === '실패' ? ST.fail : ST.unk);

/** 글자 폭 단위: 한글 1, 영문·숫자는 mono 0.6 / 일반 0.56 */
export function units(s: string, mono = false): number {
  let u = 0;
  for (const ch of s) u += /[ᄀ-￿]/.test(ch) ? 1 : mono ? 0.6 : 0.56;
  return u;
}

/** 폭(units)에 맞춰 줄을 나누고, maxLines 를 넘으면 마지막 줄을 … 로 줄인다. */
export function wrapText(s: string, maxUnits: number, maxLines: number, mono = false): string[] {
  const tokens = s.replace(/\s+/g, ' ').trim().split(/(\s)/);
  const lines: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    if (units(cur + tok, mono) <= maxUnits) {
      cur += tok;
      continue;
    }
    if (cur.trim()) lines.push(cur.trim());
    cur = tok.trimStart();
    while (units(cur, mono) > maxUnits) {
      let i = cur.length;
      while (i > 1 && units(cur.slice(0, i), mono) > maxUnits) i--;
      lines.push(cur.slice(0, i));
      cur = cur.slice(i);
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && units(last + '…', mono) > maxUnits) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

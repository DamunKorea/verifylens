import type { Requirement } from './types.ts';
import { tokenize, clip } from './tokens.ts';

const GUARD_CUE = /(않|차단|거부|막|금지|불가|reject|deny|block|forbid|refuse|must not|cannot)/i;

export function parseRequirements(md: string): Requirement[] {
  const reqs: Requirement[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s*(?:\[[ xX]\]\s*)?(R\d+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const [body, kw] = m[2].split(/\|\s*keywords?\s*:/i);
    const text = body.trim().replace(/\s*\|\s*$/, '');
    const keywords = (kw ?? '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const numbers = [...text.matchAll(/(\d+)\s*(?:회|번째|번|개|초|분|건|times?|th|st|nd|rd)?/g)].map((x) => Number(x[1]));
    const auto = tokenize(text).filter((t) => !/[가-힣]/.test(t) && !/^\d+$/.test(t));
    const tokens = keywords.length ? tokenize(keywords.join(' ')) : auto;
    reqs.push({ id: m[1].toUpperCase(), text, keywords, tokens: [...new Set(tokens)], numbers: [...new Set(numbers)], guardCue: GUARD_CUE.test(text) });
  }
  return reqs;
}

/** PR 설명에서 요구사항 후보를 뽑아 requirements.md 초안으로 만든다. 사람이 고치고 확정한다. */
export function extractFromPrBody(md: string): string {
  const bullets: string[] = [];
  const sentences: string[] = [];
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
  const MODAL = /(해야|한다|하도록|할 수|않는다|않게|되어야|must|should|shall|when|if |needs? to|able to)/i;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^notes?\s*:/i.test(line)) continue;
    const item = line.match(/^[-*]\s*(?:\[[ xX]\]\s*)?(.+)$/);
    if (item) {
      bullets.push(clean(item[1]));
    } else if (MODAL.test(line)) {
      for (const part of line.split(/(?<=[.。])\s+/)) if (MODAL.test(part)) sentences.push(clean(part));
    }
  }
  // 체크리스트가 있으면 그것을 요구사항으로 보고, 없을 때만 본문 문장에서 뽑는다.
  const seen = new Set<string>();
  const cands = (bullets.length >= 2 ? bullets : [...bullets, ...sentences]).filter((t) => {
    if (t.length < 6 || seen.has(t) || /^https?:/.test(t)) return false;
    seen.add(t);
    return true;
  });
  const out = ['# 요구사항 초안 — 사람이 읽고 고친 뒤 확정하세요', '# 형식: - R번호: 요구사항 문장 | keywords: 코드에서 찾을 영어 단어(선택)'];
  cands.forEach((c, i) => out.push(`- R${i + 1}: ${clip(c, 120)} | keywords: `));
  return out.join('\n') + '\n';
}

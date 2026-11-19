import type { Requirement } from './types.ts';
import { tokenize, clip } from './tokens.ts';
import { conceptsFor } from './glossary.ts';
import { L } from './i18n.ts';
import { numbersIn, parseConstraints } from './numeric.ts';

/** 「관리자만」 · only: 다른 경우를 빼는 요구사항 */
const ONLY_CUE = /[가-힣]만(?=\s|$)|\bonly\b/i;
const GUARD_CUE = /(않|차단|거부|막|금지|불가|reject|deny|block|forbid|refuse|must not|cannot)/i;
/** 무엇을 확인하거나 막는 조건이 코드에 있어야 하는 요구사항 (함수 이름만 겹쳐서는 근거가 되지 않는다) */
const CHECK_CUE = /\bmust\b|\brequired?\b|\bneeds?\b|\bhave to\b|\bhas to\b|해야|여야|필요|만\s+\S+\s*수\s*있|\bonce\s+(?:per|a|each|for)\b|\bonly once\b|한\s*번(?:씩)?만|중복/i;

export function parseRequirements(md: string): Requirement[] {
  const reqs: Requirement[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s*(?:\[[ xX]\]\s*)?(R\d+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const [body, kw] = m[2].split(/\|\s*keywords?\s*:/i);
    const text = body.trim().replace(/\s*\|\s*$/, '');
    const keywords = (kw ?? '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const numbers = numbersIn(text);
    const constraints = parseConstraints(text);
    const auto = !keywords.length;
    // 키워드를 적어도 문장의 개념은 뽑아 둔다 (검사 이름과 이을 때 쓴다)
    const concepts = conceptsFor(text);
    const tokens = auto ? concepts.flat() : tokenize(keywords.join(' '));
    reqs.push({ id: m[1].toUpperCase(), text, keywords, auto, concepts, tokens: [...new Set(tokens)], numbers, guardCue: GUARD_CUE.test(text), constraints, only: ONLY_CUE.test(text), needsCheck: GUARD_CUE.test(text) || CHECK_CUE.test(text) || ONLY_CUE.test(text) });
  }
  return reqs;
}

const SECTION = /(acceptance\s*criteria|requirements?|definition\s*of\s*done|expected\s*behaviou?r|요구\s*사항|인수\s*조건|완료\s*조건|수용\s*기준|기대\s*동작|해야\s*할\s*일|체크\s*리스트)/i;
const MODAL = /(해야|한다|하도록|할 수|않는다|않게|되어야|된다|must|should|shall|when |if |needs? to|able to|cannot|can't)/i;

/**
 * 이슈 · PR · 메신저에서 복사한 글에서 요구사항 후보 문장을 뽑는다 (규칙 기반, AI 없음).
 * 「요구사항 / Acceptance criteria」 같은 제목 아래의 목록 > 글 전체의 목록 > 「~해야 한다」 꼴 문장 순으로 고른다.
 */
export function extractRequirements(md: string, max = 12): string[] {
  const clean = (t: string) =>
    t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.。]+$/, '');
  const text = md.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const inSection: string[] = [];
  const bullets: string[] = [];
  const sentences: string[] = [];
  let section = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('>') || /^notes?\s*:/i.test(line)) continue;
    const head = line.match(/^(#{1,6})\s+(.*)$/) ?? line.match(/^\*\*(.+?)\*\*:?$/) ?? line.match(/^([^-*\d].{0,40}):$/);
    if (head) {
      section = SECTION.test(head[2] ?? head[1]);
      continue;
    }
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
    if (item) {
      const t = clean(item[1]);
      (section ? inSection : bullets).push(t);
    } else if (MODAL.test(line)) {
      for (const part of line.split(/(?<=[.。!?])\s+/)) if (MODAL.test(part)) (section ? inSection : sentences).push(clean(part));
    }
  }
  const pool = inSection.length ? inSection : bullets.length >= 2 ? bullets : [...bullets, ...sentences];
  const seen = new Set<string>();
  return pool
    .filter((t) => {
      const key = t.toLowerCase();
      if (t.length < 6 || seen.has(key) || /^https?:\S+$/.test(t)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map((t) => clip(t, 140));
}

/** 요구사항 후보를 requirements.md 글로 만든다. start 는 첫 번호. */
export function draftRequirements(cands: string[], source = '', start = 1): string {
  const out = [
    L(`# 요구사항 초안${source ? ` — ${source}에서 가져옴` : ''}. 읽어 보고 고친 뒤 저장하세요.`, `# Draft requirements${source ? ` — imported from ${source}` : ''}. Read them, fix them, then save.`),
    L('# 형식: - R번호: 요구사항 문장', '# Format: - R<number>: requirement sentence'),
    L('# 코드와 잘못 이어지면 뒤에 「| keywords: 코드에 나오는 영어 단어」를 붙여 직접 정할 수 있습니다.', '# If a requirement lands on the wrong code, append "| keywords: words, in, the, code" to pin it yourself.'),
  ];
  cands.forEach((c, i) => out.push(`- R${start + i}: ${c}`));
  return out.join('\n') + '\n';
}

/** PR 설명에서 요구사항 후보를 뽑아 requirements.md 초안으로 만든다. 사람이 고치고 확정한다. */
export function extractFromPrBody(md: string): string {
  return draftRequirements(extractRequirements(md));
}

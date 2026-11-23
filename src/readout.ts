import type { Requirement } from './types.ts';
import { constraintText, pick } from './numeric.ts';
import { FILLER, GENERIC, isUniqueReq, stateOf } from './engine.ts';
import { stem, tokenize } from './tokens.ts';
import { displayWord } from './glossary.ts';

/** 찾는 낱말로 보이지 않는 말: 부정 · 조동사 (개념에는 들어 있지만 코드에서 찾는 낱말이 아니다) */
const NOT_A_WORD = new Set(['cannot', 'can', 'not', 'never', 'must', 'should', 'shall', 'may', 'will'].map(stem));
/** 찾는 낱말은 이만큼만 보인다 (길면 칸이 넘친다) */
const MAX_WORDS = 5;

/**
 * 요구사항 문장에서 엔진이 읽은 조각: 숫자 조건 · 규칙 종류 · 상태 · HTTP 상태 번호 · 코드에서 찾는 낱말.
 * 「LLM 없이 글로 쓴 요구사항을 어떻게 검사로 바꾸나?」(X 에서 세 사람이 따로 물음, 11/22~23)에 그림으로 답한다:
 * 문장 → 이 조각들 → 코드 줄 → 검사. 근거 사슬의 「요구사항」 칸 아래에 칩으로 붙는다.
 */
export function sentencePieces(req: Requirement, lang: 'ko' | 'en'): string[] {
  const ko = lang === 'ko';
  const out: string[] = [];
  for (const c of req.constraints) {
    const t = pick(constraintText(c), lang);
    if (c.window) out.push(ko ? `${t} 안에서` : `within ${t}`);
    else if (c.rel === 'eq') out.push(ko ? `정확히 ${t}` : `exactly ${t}`);
    // 「after 5 failed logins」: 단위가 없는 횟수는 「5 뒤」가 아니라 「5번 뒤」
    else if (c.rel === 'after' && (!c.unit || c.unit === 'cnt')) out.push(ko ? `${c.value}번 뒤` : `after ${c.value} times`);
    else out.push(t);
  }
  const statuses = req.concepts.flat().filter((t) => /^[1-5]\d\d$/.test(t));
  for (const s of new Set(statuses)) out.push(`HTTP ${s}`);
  if (req.guardCue) out.push(ko ? '막아야 함' : 'must block');
  else if (isUniqueReq(req)) out.push(ko ? '한 번만' : 'only once');
  else if (req.only) out.push(ko ? '그것만 허용' : 'only rule');
  else if (req.needsCheck) out.push(ko ? '확인 조건 필요' : 'needs a check');
  const state = stateOf(req);
  if (state) out.push(ko ? `상태: ${state.word}` : `state: ${state.word}`);
  const words = lookedFor(req);
  if (words.length) out.push(`${ko ? '찾는 낱말' : 'looks for'}: ${words.join(' · ')}`);
  return out;
}

/** 코드에서 찾는 낱말. 키워드를 적었으면 그대로, 아니면 문장의 개념을 문장에 쓰인 꼴로 (영어 문장의 「deleted」는 delet 이 아니라 deleted) */
function lookedFor(req: Requirement): string[] {
  if (!req.auto) return req.keywords.slice(0, MAX_WORDS);
  const written = req.text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const out: string[] = [];
  for (const g of req.concepts) {
    const head = g[0];
    if (/^\d/.test(head) || g.every((t) => GENERIC.has(t) || FILLER.has(t) || NOT_A_WORD.has(t))) continue;
    const shown = written.find((w) => tokenize(w).includes(head))?.toLowerCase() ?? displayWord(head);
    if (!out.includes(shown)) out.push(shown);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

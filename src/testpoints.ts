// 요구사항 문장의 숫자에서 「이 값으로 시험해 보라」는 경계값을 뽑는다. LLM 없이 문장의 숫자 조건만 쓴다.
// 예: 「5번 틀리면 잠금」→ 4번째(아직) · 5번째(동작), 「8자 이상」→ 7자(거절) · 8자(허용),
//     「3만 원 이상 무료」→ 29,999원(조건 밖) · 30,000원(조건 안).
// 에이전트가 같은 착각으로 테스트를 쓰는 일(「5번째에 잠근다」를 6번째로 시험)을 막는 데 쓴다 (OKKY 의견:
// 「테스트를 돌려 검증을 강화하는 쪽」, 「검증 절차가 있으면 잡히지 않나」).
import type { Constraint, Requirement, UnitKind } from './types.ts';
import { getLang, type Lang } from './i18n.ts';

export type TestPoint = { value: string; expect: string };

/** 하나씩 세는 단위 (바로 옆 값이 정수로 정해진다). 시간 · 크기 · 비율은 「직전 · 정확히 · 바로 넘음」으로 쓴다. */
const DISCRETE: (UnitKind | null)[] = ['money', 'age', 'char', 'cnt', 'qty', null];
const COUNTED: (UnitKind | null)[] = ['cnt', null];

const W = {
  ko: { allow: '허용', reject: '거절', acts: '동작', notYet: '아직 동작 안 함', noAct: '동작 안 함', inside: '조건 안', outside: '조건 밖', under: '직전', over: '바로 넘음' },
  en: { allow: 'allowed', reject: 'rejected', acts: 'acts', notYet: 'does not act yet', noAct: 'does not act', inside: 'inside the condition', outside: 'outside the condition', under: 'just under', over: 'just over' },
};

const num = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(n));
const ordinal = (n: number) => {
  const r = n % 100;
  const s = r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};
const hangul = (s: string) => /[가-힣]/.test(s);

/** 값과 단위를 문장에 쓰인 모양대로 붙인다: 7자 · 29,999원 · $29,999 · 7 characters */
function withUnit(n: number, c: Constraint): string {
  const u = c.unitText.trim();
  if (!u) return num(n);
  if (u === '$' || u === '₩' || u === '€' || u === '£') return `${u}${num(n)}`;
  return hangul(u) || u === '%' ? `${num(n)}${u}` : `${num(n)} ${u}`;
}

/** 몇 번째 (세는 조건): 4번째 · 4th time */
function nth(n: number, lang: Lang): string {
  return lang === 'ko' ? `${n}번째` : `${ordinal(n)} time`;
}

function pointsFor(c: Constraint, lang: Lang): TestPoint[] {
  const w = W[lang];
  if (c.window || c.rel === 'value' || !Number.isFinite(c.value)) return [];
  const discrete = DISCRETE.includes(c.unit) && Number.isInteger(c.value);
  const v = c.value;
  // 세는 조건 (「5번 틀리면」 「after 5 failures」 「하루 3번까지」): 몇 번째로 쓴다
  const counted = discrete && COUNTED.includes(c.unit) && (c.rel === 'count' || c.rel === 'after' || ((c.rel === 'lte' || c.rel === 'lt') && c.validSide === 'lower'));
  const show = (n: number) => (counted ? nth(n, lang) : withUnit(n, c));
  // 끝값 쪽 · 바깥 쪽에서 무엇이 되어야 하는지
  const yes = c.validSide ? w.allow : w.inside;
  const no = c.validSide ? w.reject : w.outside;
  const at = (n: number, expect: string): TestPoint => ({ value: show(n), expect });
  const near = (word: string, expect: string): TestPoint => ({ value: lang === 'ko' ? `${withUnit(v, c)} ${word}` : `${word} ${withUnit(v, c)}`, expect });
  const exact = (expect: string): TestPoint => ({ value: withUnit(v, c), expect });

  if (c.rel === 'count' || c.rel === 'after') {
    if (discrete) return v >= 1 ? [at(v - 1, w.notYet), at(v, w.acts)].filter((p) => !/^0/.test(p.value)) : [];
    return [near(w.under, w.notYet), exact(w.acts)];
  }
  if (c.rel === 'eq') {
    if (c.trigger) return discrete ? [at(v, w.acts), at(v + 1, w.noAct)] : [exact(w.acts), near(w.over, w.noAct)];
    return discrete ? [at(v - 1, w.outside), at(v, w.inside), at(v + 1, w.outside)].filter((_, i) => i > 0 || v > 0) : [];
  }
  // 「이상 · 초과 · 이하 · 미만」: 유효한 쪽이 위면 아래가 거절, 아래면 위가 거절이다
  const upperOk = c.validSide ? c.validSide === 'upper' : c.rel === 'gte' || c.rel === 'gt';
  if (discrete) {
    if (c.rel === 'gte') return [at(v - 1, upperOk ? no : yes), at(v, upperOk ? yes : no)].filter((p, i) => i > 0 || v - 1 >= 0);
    if (c.rel === 'gt') return [at(v, upperOk ? no : yes), at(v + 1, upperOk ? yes : no)];
    if (c.rel === 'lte') return [at(v, upperOk ? no : yes), at(v + 1, upperOk ? yes : no)];
    if (c.rel === 'lt') return [at(v - 1, upperOk ? no : yes), at(v, upperOk ? yes : no)].filter((p, i) => i > 0 || v - 1 >= 0);
    return [];
  }
  // 이어진 값 (시간 · 크기 · 비율 · 소수): 끝값이 포함되는지에 따라 「정확히」 쪽이 달라진다
  const atIncluded = c.rel === 'gte' || c.rel === 'lte';
  const below = upperOk ? no : yes;
  const above = upperOk ? yes : no;
  if (c.rel === 'gte' || c.rel === 'gt') return [near(w.under, below), exact(atIncluded ? above : below), ...(atIncluded ? [] : [near(w.over, above)])];
  if (c.rel === 'lte' || c.rel === 'lt') return [...(atIncluded ? [] : [near(w.under, below)]), exact(atIncluded ? below : above), near(w.over, above)];
  return [];
}

/** 요구사항의 숫자 조건마다 경계 바로 안 · 밖의 값. 숫자가 없거나 시간 창 · 값 자체(1% 적립)뿐이면 빈 목록. */
export function testPoints(req: Requirement, lang: Lang = getLang()): TestPoint[] {
  const out: TestPoint[] = [];
  const seen = new Set<string>();
  for (const c of req.constraints) {
    for (const p of pointsFor(c, lang)) {
      if (seen.has(p.value)) continue;
      seen.add(p.value);
      out.push(p);
    }
  }
  return out;
}

/** 한 줄로: 「4번째 → 아직 동작 안 함 · 5번째 → 동작」. 값이 없으면 빈 글. */
export function testPointsLine(req: Requirement, lang: Lang = getLang()): string {
  return testPoints(req, lang)
    .map((p) => `${p.value} → ${p.expect}`)
    .join(' · ');
}

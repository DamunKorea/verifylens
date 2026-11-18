import { tokenize } from './tokens.ts';

/**
 * 한국어 요구사항을 키워드 없이도 코드(영어 식별자)와 잇기 위한 용어집.
 * [요구사항 문장에서 찾을 한국어(정규식), 코드에 나올 법한 영어 단어들]
 * AI 추정이 아니라 고정된 표다. 여기 없는 말은 연결하지 못하고, 그때는 keywords 를 직접 적으면 된다.
 */
const GLOSSARY: [RegExp, string][] = [
  // 계정 · 인증
  [/로그인|사인\s*인|접속/, 'login signin sign authenticate auth'],
  [/로그아웃/, 'logout signout'],
  [/회원\s*가입|가입/, 'signup register registration'],
  [/비밀\s*번호|패스워드|암호(?!화)/, 'password passwd pw'],
  [/계정/, 'account'],
  [/사용자|유저|회원/, 'user member'],
  [/나이|연령|\d+\s*세|\d+\s*살/, 'age'],
  [/보호자|부모/, 'guardian parent'],
  [/동의/, 'consent agree'],
  [/탈퇴/, 'withdrawn withdraw deleted'],
  [/구매|구입/, 'purchase buy order'],
  [/닉네임|별명/, 'nickname'],
  [/요청/, 'request'],
  [/포인트|적립금/, 'point'],
  [/수량|개수/, 'quantity count qty'],
  [/할인율/, 'rate'],
  [/관리자/, 'admin administrator'],
  [/권한|역할/, 'permission role authorize authorization access'],
  [/인증/, 'auth authenticate authentication verify'],
  [/토큰/, 'token'],
  [/세션/, 'session'],
  [/이메일|메일/, 'email mail'],
  [/전화|휴대폰|핸드폰/, 'phone mobile'],
  // 상태 · 판단
  [/잠그|잠근|잠가|잠긴|잠금|잠기|잠겨/, 'lock locked lockout'],
  [/해제|풀린|풀어|푼다/, 'unlock release reset'],
  [/실패|틀리|틀린|오류|에러/, 'fail failed failure error wrong invalid'],
  [/성공/, 'success succeed ok'],
  [/올바른|올바르|맞는|맞아|맞으면|정확|유효/, 'right valid correct'],
  [/잘못|유효하지|무효/, 'invalid wrong bad'],
  [/거부|거절|차단|막는|막아|금지/, 'reject deny block forbid refuse'],
  [/허용|허락/, 'allow permit'],
  [/만료|유효\s*기간|기한/, 'expire expired expiry expiration ttl'],
  [/\d+\s*일/, 'day'],
  [/\d+\s*분/, 'minute min ms sec'],
  [/\d+\s*시간/, 'hour ms sec'],
  [/활동이?\s*없|유휴/, 'idle inactive'],
  [/활성/, 'active enable enabled activate'],
  [/비활성|정지|중지/, 'inactive disable disabled suspend deactivate'],
  // 횟수 · 시간 · 한도
  [/연속|반복|거듭/, 'consecutive repeated repeat streak'],
  [/시도|재시도|다시\s*시도/, 'attempt retry try'],
  [/횟수|번\s*이상|회\s*이상|카운트/, 'count counter times'],
  [/제한|한도|상한|최대/, 'limit max maximum cap'],
  [/최소|하한/, 'min minimum'],
  [/시간\s*초과|타임아웃/, 'timeout'],
  [/대기|지연/, 'wait delay'],
  [/분\s*(?:동안|간|뒤|후)|시간\s*(?:동안|뒤|후)|초\s*(?:동안|뒤|후)|기간/, 'duration minute second hour window period'],
  // 데이터 동작
  [/생성|만들|추가|등록/, 'create add insert new register'],
  [/수정|변경|갱신|업데이트/, 'update edit change modify'],
  [/삭제|지우|제거/, 'delete remove destroy'],
  [/조회|불러|가져|읽/, 'get fetch find load read list'],
  [/저장/, 'save store persist'],
  [/검색|찾/, 'search find query'],
  [/정렬/, 'sort order'],
  [/필터|걸러/, 'filter'],
  [/페이지/, 'page pagination paginate'],
  [/중복/, 'duplicate unique exists'],
  [/검증|확인/, 'validate verify check'],
  [/업로드|올리/, 'upload'],
  [/다운로드|내려받/, 'download'],
  [/파일/, 'file'],
  [/이미지|사진/, 'image photo'],
  // 알림 · 기록
  [/알림|통지/, 'notify notification alert'],
  [/전송|보내|발송/, 'send'],
  [/기록|로그(?!인|아웃)|이력/, 'log audit history record'],
  [/집계|통계|지표/, 'metric metrics count stat'],
  // 거래
  [/결제|지불/, 'payment pay charge'],
  [/환불/, 'refund'],
  [/주문/, 'order'],
  [/장바구니/, 'cart basket'],
  [/가격|금액|요금|배송비/, 'price amount fee cost total subtotal'],
  [/할인|쿠폰/, 'discount coupon'],
  [/재고/, 'stock inventory'],
  [/배송/, 'shipping delivery ship'],
  // 글 · 화면
  [/댓글/, 'comment reply'],
  [/게시|글\s*(?:쓰|작성)/, 'post article'],
  [/길이|글자\s*수|자\s*이상|자\s*이하/, 'length size'],
  [/비어|빈\s*값|필수/, 'empty required blank'],
  [/형식|포맷/, 'format pattern'],
];

/** 영어 요구사항에서 뜻이 약해 연결에 쓰지 않는 말 */
const WEAK = new Set([
  'should', 'must', 'shall', 'can', 'could', 'may', 'will', 'would', 'be', 'able', 'when', 'then', 'that', 'it', 'are', 'was', 'were', 'has',
  'have', 'had', 'with', 'without', 'by', 'at', 'after', 'before', 'into', 'than', 'they', 'their', 'them', 'you', 'your', 'we', 'our', 'do',
  'does', 'done', 'so', 'only', 'even', 'also', 'any', 'all', 'each', 'every', 'more', 'most', 'need', 'make', 'sure', 'ensure', 'please',
  'no', 'there', 'which', 'who', 'what', 'user',
]);

/** 두 낱말로 쓴 영어 표현을 코드에서 쓰는 한 낱말로 맞춘다 ("log in" → login). */
export function normalizePhrases(text: string): string {
  return text
    .replace(/\blog(?:s|ged|ging)?[\s-]+in\b/gi, 'login')
    .replace(/\blog(?:s|ged|ging)?[\s-]+out\b/gi, 'logout')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+in\b/gi, 'signin')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+out\b/gi, 'signout')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+up\b/gi, 'signup')
    .replace(/\btime(?:s|d)?[\s-]+out\b/gi, 'timeout');
}

/**
 * 키워드를 적지 않은 요구사항에서 「개념」을 뽑는다. 개념 하나는 같은 뜻의 영어 단어 묶음이다.
 * 한국어는 용어집으로, 영어는 문장에 나온 낱말 그대로(뜻이 약한 말은 뺀다).
 */
export function conceptsFor(text: string): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  const push = (words: string[]) => {
    const group = [...new Set(words)].filter((w) => !seen.has(w));
    if (!group.length) return;
    group.forEach((w) => seen.add(w));
    out.push(group);
  };
  for (const [re, en] of GLOSSARY) if (re.test(text)) push(tokenize(en));
  for (const t of tokenize(normalizePhrases(text))) {
    if (/[가-힣]/.test(t) || /^\d+$/.test(t) || WEAK.has(t)) continue;
    push([t]);
  }
  return out;
}

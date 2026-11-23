import { stem, tokenize } from './tokens.ts';

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
  [/나이|연령|\d+\s*세|\d+\s*살|\d+\s*years?\s*old/i, 'age'],
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
  // 0.24.0: 맞는 코드 묶음에서 「관리자만 공지를 올릴 수 있다」 ↔ 「관리자가 아니면 공지를 올릴 수 없다」 검사가 이어지지 않았다
  [/공지/, 'notice announcement'],
  [/올리|게시|등록하/, 'post publish create'],
  // (영어 password 를 pw 와 잇는 것은 해 봤다가 뺐다: 「Passwords must contain at least one digit」에 길이만 보는
  //  if (pw.length < 8) throw 가 근거가 되어 숫자 검사가 없는 코드가 「확인됨」이 됐다 — 예전 사례 s-pw-digit)
  [/권한|역할/, 'permission role authorize authorization access'],
  [/인증/, 'auth authenticate authentication verify verification'],
  [/인증\s*(?:번호|코드)|\botp\b/i, 'code otp'],
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
  [/잘못|유효하지|무효|올바르지\s*(?:않|못)|맞지\s*않/, 'invalid wrong bad'],
  // 가입 · 비밀번호 규칙 (X 답글: 「항상 가입 흐름부터 눌러 본다」)
  [/숫자/, 'digit number numeric'],
  [/특수\s*문자/, 'special symbol'],
  [/대문자/, 'uppercase upper'],
  [/소문자/, 'lowercase lower'],
  [/\d+\s*자리/, 'digit length'],
  [/약관/, 'terms term agreement'],
  [/한\s*번만|하나만|\bonly once\b|\bonly one\b/i, 'unique exists duplicate taken'],
  // 「같은 시간에 두 번 예약할 수 없다」는 2번까지가 아니라 두 번째를 막으라는 뜻이다
  [/두\s*번\s*(?:[가-힣]+\s*){0,2}?(?:수\s*없|못\s)/, 'unique exists duplicate taken'],
  [/거부|거절|차단|막는|막아|금지/, 'reject deny block forbid refuse'],
  [/허용|허락/, 'allow permit'],
  [/만료|유효\s*기간|기한/, 'expire expired expiry expiration ttl'],
  [/체험/, 'trial'],
  [/끝나|끝난|끝날|종료/, 'end ended finish expire'],
  [/\d+\s*일/, 'day'],
  [/\d+\s*분/, 'minute min ms sec'],
  [/\d+\s*시간/, 'hour ms sec'],
  [/활동이?\s*없|유휴/, 'idle inactive'],
  [/활성/, 'active enable enabled activate'],
  // 상태 낱말 (status === 'canceled' · 'approved' · 'paid' 같은 조건과 견준다)
  [/취소/, 'cancel canceled cancelled'],
  [/승인/, 'approve approved'],
  [/결제\s*(?:가|를|이)?\s*(?:끝난|완료|된)|결제된|입금\s*(?:된|완료)/, 'paid'],
  [/비활성|정지|중지/, 'inactive disable disabled suspend deactivate'],
  // 횟수 · 시간 · 한도
  [/연속|반복|거듭/, 'consecutive repeated repeat streak'],
  [/시도|재시도|다시\s*시도|\btr(?:y|ies|ied|ying)\b/i, 'attempt retry try'],
  [/횟수|번\s*이상|회\s*이상|카운트/, 'count counter times'],
  [/제한|한도|상한|최대|\b(?:max|maximum|limit(?:s|ed)?|capped|at most|up to)\b/i, 'limit max maximum cap'],
  [/최소|하한|\b(?:min|minimum|at least)\b/i, 'min minimum'],
  [/양수|\bpositive\b/i, 'positive'],
  [/음수|\bnegative\b/i, 'negative'],
  [/\blasts?\b|\bvalid for\b|유지/i, 'ttl expire age duration'],
  [/시간\s*초과|타임아웃/, 'timeout'],
  [/대기|지연/, 'wait delay'],
  [/분\s*(?:동안|간|뒤|후)|시간\s*(?:동안|뒤|후)|초\s*(?:동안|뒤|후)|기간/, 'duration minute second hour window period'],
  // 데이터 동작
  [/생성|만들|추가|등록/, 'create add insert new register'],
  [/수정|변경|갱신|업데이트|바꾸|바꿀|바꾼|바꿔/, 'update edit change modify'],
  [/삭제|지우|제거/, 'delete remove destroy'],
  [/조회|불러|가져|읽/, 'get fetch find load read list query'],
  [/저장/, 'save store persist'],
  [/검색|찾/, 'search find query'],
  [/정렬/, 'sort order'],
  [/필터|걸러/, 'filter'],
  [/페이지/, 'page pagination paginate'],
  [/목록/, 'list items page'],
  [/중복/, 'duplicate unique exists'],
  [/검증|확인/, 'validate verify check'],
  [/업로드|올리/, 'upload'],
  [/다운로드|내려받/, 'download'],
  [/파일/, 'file'],
  [/이미지|사진/, 'image photo'],
  // 알림 · 기록
  [/알림|통지/, 'notify notification alert'],
  [/전송|보내|보낼|보낸|보냅|발송/, 'send sent'],
  [/기록|로그(?!인|아웃)|이력/, 'log audit history record'],
  [/집계|통계|지표/, 'metric metrics count stat'],
  // 거래
  [/결제|지불/, 'payment pay charge'],
  [/정액/, 'fixed flat'],
  [/위시\s*리스트|찜/, 'wishlist wish favorite'],
  [/환불/, 'refund'],
  [/주문/, 'order'],
  [/장바구니/, 'cart basket'],
  [/가격|금액|요금|배송비/, 'price amount fee cost total subtotal'],
  [/할인|쿠폰/, 'discount coupon'],
  [/선물/, 'gift present'],
  // 금액을 말하면 코드에서는 amount · price · total 같은 이름으로 나온다 (10만 원을 넘는 환불 ↔ amount > 100000)
  [/\d[\d,]*\s*(?:만|천|백)?\s*원|[$₩]\s*\d|\d\s*(?:dollars?|won|usd|krw)\b/i, 'amount price total fee cost'],
  [/재고/, 'stock inventory'],
  // 「배송이 시작된」은 발송(shipped), 「배송 완료」는 도착(delivered)이다. 둘을 섞으면 delivered 만 보는 조건이 「배송 시작」의 근거가 된다
  [/배송\s*(?:이|을|가)?\s*(?:시작|출발|중)|발송|출고/, 'ship shipping dispatch'],
  [/배송\s*(?:이|을|가)?\s*완료|배달\s*(?:이|을|가)?\s*완료|도착/, 'deliver delivered delivery'],
  [/배송(?!\s*(?:이|을|가)?\s*(?:시작|출발|중|완료))/, 'shipping delivery ship'],
  // 글 · 화면
  [/댓글/, 'comment reply'],
  [/게시|글\s*(?:쓰|작성)/, 'post article'],
  [/길이|글자\s*수|자\s*이상|자\s*이하/, 'length size'],
  [/비어|빈\s*값|필수/, 'empty required blank'],
  [/형식|포맷/, 'format pattern'],
  [/이름|성명/, 'name'],
  [/제목/, 'title subject'],
  [/내용|본문/, 'content body text'],
  [/설명/, 'description'],
  [/태그/, 'tag'],
  [/첨부/, 'attachment attach'],
  [/동영상|영상|비디오/, 'video'],
  [/프로필/, 'profile avatar'],
  [/자기\s*소개|소개\s*글/, 'bio introduction'],
  // 「리뷰를 쓸 수 없다」의 쓰다는 작성, 「쿠폰을 쓸 수 없다」의 쓰다는 사용이라 둘 다 둔다
  [/작성/, 'write'],
  [/쓸\s*수|쓰지|쓴다|쓰는|써서|쓰기/, 'write use'],
  [/폴더/, 'folder directory'],
  [/주소/, 'address'],
  [/카테고리|분류/, 'category'],
  [/메시지|쪽지/, 'message'],
  [/채팅방|대화방/, 'room chat channel'],
  [/채널/, 'channel'],
  [/친구/, 'friend'],
  [/좋아요/, 'like'],
  [/리뷰|후기/, 'review'],
  [/별점|평점/, 'rating score'],
  // 사람 · 모임
  [/인원|\d+\s*명|참가자|참석자|구성원|멤버/, 'member participant attendee people headcount user'],
  [/그룹|모임/, 'group'],
  [/팀/, 'team'],
  [/재설정|초기화/, 'reset'],
  [/(?<!(?:특수|대|소|영)\s*)문자(?!\s*열)/, 'sms text message'],
  [/하루|매일|오늘/, 'day today daily'],
  [/입력/, 'enter entry input'],
  [/회사|조직/, 'company organization org'],
  [/초대/, 'invite invitation'],
  [/투표/, 'vote poll ballot'],
  [/응모|신청/, 'entry apply application'],
  [/들어오|입장|참여|참가/, 'join enter'],
  [/학생/, 'student'],
  [/수업|강의/, 'lesson course class'],
  [/시험/, 'exam test'],
  [/점수/, 'score'],
  // 예약 · 일정
  [/예약/, 'reserve reservation book booking'],
  [/좌석/, 'seat'],
  [/티켓|입장권/, 'ticket'],
  [/일정/, 'schedule'],
  [/회의/, 'meeting'],
  [/출석/, 'attendance'],
  // 상품 · 돈
  [/상품|제품|물건/, 'product item goods'],
  [/구독/, 'subscription subscribe'],
  [/요금제|플랜/, 'plan'],
  [/잔액/, 'balance'],
  [/송금|이체/, 'transfer'],
  [/출금/, 'withdraw withdrawal'],
  [/입금/, 'deposit'],
  [/수수료/, 'fee'],
  [/부가세|부가가치세|세금|\bvat\b/i, 'vat tax'],
  [/청구|인보이스/, 'invoice bill'],
  // 시스템
  [/작업|할\s*일/, 'job task'],
  [/실행/, 'run execute'],
  [/동시/, 'concurrent concurrency parallel'],
  [/대기열/, 'queue'],
  [/캐시/, 'cache'],
  [/연결/, 'connection connect'],
  [/프로젝트/, 'project'],
  [/백업/, 'backup'],
];

/** 용어집의 낱말을 어간이 아니라 원래 꼴로 보인다 (화면의 「찾는 낱말」: uniqu → unique, notic → notice) */
const DISPLAY = new Map<string, string>();
for (const [, en] of GLOSSARY) for (const w of en.split(/\s+/)) if (w && !DISPLAY.has(stem(w))) DISPLAY.set(stem(w), w);
export const displayWord = (t: string) => DISPLAY.get(t) ?? t;

/** 영어 요구사항에서 뜻이 약해 연결에 쓰지 않는 말. 범위를 나타내는 말은 숫자 조건에서 따로 읽는다. */
const WEAK = new Set([
  'should', 'must', 'shall', 'can', 'could', 'may', 'will', 'would', 'be', 'able', 'when', 'then', 'that', 'it', 'are', 'was', 'were', 'has',
  'have', 'had', 'with', 'without', 'by', 'at', 'after', 'before', 'into', 'than', 'they', 'their', 'them', 'you', 'your', 'we', 'our', 'do',
  'does', 'done', 'so', 'only', 'even', 'also', 'any', 'all', 'each', 'every', 'more', 'most', 'need', 'make', 'sure', 'ensure', 'please',
  'no', 'there', 'which', 'who', 'what', 'user',
  'up', 'least', 'less', 'fewer', 'greater', 'larger', 'smaller', 'over', 'under', 'above', 'below', 'between', 'through', 'including',
  'inclusive', 'exclusive', 'exceed', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
].map(stem));

/** 두 낱말로 쓴 영어 표현을 코드에서 쓰는 한 낱말로 맞춘다 ("log in" → login). */
export function normalizePhrases(text: string): string {
  return text
    .replace(/\blog(?:s|ged|ging)?[\s-]+in\b/gi, 'login')
    .replace(/\blog(?:s|ged|ging)?[\s-]+out\b/gi, 'logout')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+in\b/gi, 'signin')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+out\b/gi, 'signout')
    .replace(/\bsign(?:s|ed|ing)?[\s-]+up\b/gi, 'signup')
    // 「Registration rejects …」 ↔ register()
    .replace(/\bregistrations?\b/gi, 'register')
    // 「can be used only once」 ↔ 「using the same link twice」
    .replace(/\b(?:using|uses|used)\b/gi, 'use')
    .replace(/\bcheck(?:s|ed|ing)?[\s-]+out\b/gi, 'checkout')
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

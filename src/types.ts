export type Text = { ko: string; en: string };
export type CmpOp = '>' | '>=' | '<' | '<=' | '===' | '!==';

/** 코드에서 찾은 숫자 비교 하나 */
export type NumPart = {
  expr: string;
  /** 비교하는 값 (예: cart.length) */
  left: string;
  op: CmpOp;
  /** 숫자. 상수를 풀어서 넣는다. 못 읽었으면 없음 */
  lit?: number;
  /** 아직 값을 모르는 이름 (예: CART_MAX, process.env.MAX) */
  ref?: string;
  line: number;
  source: 'compare' | 'schema' | 'cap' | 'loop' | 'config';
  /** 같은 변수를 1씩 올리는 코드: 비교 앞(true) · 뒤(false) · 없음(null) */
  incBefore: boolean | null;
  /** 검사 뒤에 같은 목록에 넣는가 (넣기 전 검사) */
  preAdd: boolean;
  inCatch: boolean;
  /** 검사 뒤에 다른 호출이 이어지는가 */
  actionAfter: boolean;
  thenKind: 'reject' | null;
  /** for 문의 시작값 */
  loopStart?: number;
  /** 글자 수: name.length 처럼 문자열의 길이다. 「몇 번 · 몇 개」를 세는 값이 아니다 */
  strLen?: boolean;
  /** 개수: cart.items.length 처럼 목록의 길이다. 「30자까지」 같은 글자 수가 아니다 */
  listLen?: boolean;
  /** '1h' · '7d' 처럼 글로 쓴 기간을 초로 읽은 값 */
  secs?: boolean;
  /** 센 값이 시간으로 거른 것이다 (recent = log.filter((t) => now - t < HOUR) · count({ where: { createdAt: { gte: startOfDay(…) } } })) */
  timed?: boolean;
  /** 센 목록을 달력으로 같은 기간만 걸렀다 (getMonth() === now.getMonth() → month · isSameDay → day) */
  calendar?: 'hour' | 'day' | 'week' | 'month';
};

export type CondInfo = {
  expr: string;
  op?: string;
  lit?: number;
  left?: string;
  firstTrue?: number;
  incrementBefore?: boolean | null;
  attempts?: number | null;
  parts?: NumPart[];
  /** a && b 꼴일 때 각 조건의 글 */
  andTerms?: string[];
  /** 조건식 전체가 비교 하나인가 */
  single?: boolean;
  /** 「정액이면」 갈래(kind === 'fixed')의 계산: 비율(÷100)인가 금액 빼기인가 */
  fixedBranch?: 'percent' | 'subtract';
};

export type UnitKind = 'money' | 'age' | 'char' | 'month' | 'week' | 'day' | 'hour' | 'min' | 'sec' | 'pct' | 'cnt' | 'qty' | 'kb' | 'mb' | 'gb';
export type NumRelation = 'gte' | 'gt' | 'lte' | 'lt' | 'count' | 'after' | 'eq' | 'value';
/** 요구사항 문장의 숫자 조건 */
export type Constraint = { value: number; unit: UnitKind | null; unitText: string; rel: NumRelation; scales: number[]; validSide: 'upper' | 'lower' | null; raw: string; /** 끝값 포함 여부가 문장에 없음 */ soft?: boolean; /** 「1분에 5번」의 1분처럼 세는 시간 창 */ window?: boolean; /** 「0이면 막는다」처럼 그 값에서 조건이 걸려야 함 */ trigger?: boolean };

export type Unit = {
  id: string;
  kind: 'function' | 'condition';
  file: string;
  fn: string;
  startLine: number;
  endLine: number;
  text: string;
  tokens: string[];
  guard: boolean;
  changed: boolean;
  cond?: CondInfo;
  /** if · 삼항식만: 조건식(괄호 안)의 낱말. 블록 안 문장의 낱말은 tokens 에만 있다 */
  condTokens?: string[];
  /** if 만: 블록 안에서 값을 정하는 곳(account.locked = true 의 account.locked)의 낱말 */
  setTokens?: string[];
  /** 함수 줄만: 몸통에서 부르는 함수 이름 */
  calls?: string[];
  /** 함수 줄만: 몸통에서 쓰는 이름(변수 · 상수) */
  refs?: string[];
};

export type DynCall = { file: string; line: number; text: string };

export type FlowNode = {
  id: number;
  kind: 'start' | 'step' | 'decision' | 'end';
  label: string;
  /** 이 단계에 묶인 문장들(공백 정리). 두 결과의 흐름을 문장 단위로 비교할 때 쓴다. */
  stmts: string[];
  line: number;
  endLine: number;
  col: number;
  row: number;
};
export type FlowEdge = { from: number; to: number; label?: string; back?: boolean };
export type FlowGraph = { fn: string; file: string; startLine: number; endLine: number; nodes: FlowNode[]; edges: FlowEdge[]; truncated: boolean };

export type FileAnalysis = {
  file: string;
  units: Unit[];
  dyn: DynCall[];
  flows: FlowGraph[];
  /** 파일 안의 숫자 상수 (이름 → 값) */
  constants: Record<string, number>;
  /** 가져온 이름 → 어느 파일의 무슨 이름인지 */
  imports: Record<string, { from: string; name: string }>;
  /** 다른 파일에서 그대로 내보내는 것: export * from · export { A as B } from */
  reexports: { all: string[]; named: Record<string, { from: string; name: string }> };
  /** 스키마의 문자열 칸 (email: z.string().email()). checked 는 형식 · 길이 검사가 붙었는지 */
  fields?: SchemaField[];
};

export type SchemaField = { file: string; line: number; name: string; checked: boolean };

export type TestCase = { name: string; status: 'pass' | 'fail' | 'skip'; message: string };

export type Requirement = {
  id: string;
  text: string;
  keywords: string[];
  /** keywords 를 적지 않아 용어집·문장의 낱말로 자동 연결한 요구사항인가 */
  auto: boolean;
  /** 자동 연결일 때의 개념 묶음 (묶음 하나 = 같은 뜻의 영어 낱말들) */
  concepts: string[][];
  tokens: string[];
  numbers: number[];
  guardCue: boolean;
  /** 문장에서 읽은 숫자 조건 */
  constraints: Constraint[];
  /** 「관리자만」처럼 다른 경우를 빼는 요구사항인가 */
  only: boolean;
  /** 확인하거나 막는 조건이 있어야 하는 요구사항인가 (해야 · must · 거부 · 만) */
  needsCheck?: boolean;
};

export type Boundary = {
  required: number;
  firstTrue?: number;
  attempts: number | null;
  ok: boolean | null;
  before: boolean | null;
  /** attempt: 몇 번째에 동작 · limit: 최대 몇 번 · value: 값의 경계 */
  kind?: 'attempt' | 'limit' | 'value';
  got?: number;
  say?: Text;
  want?: Text;
  /** 확정하지 못했거나 어긋난 까닭 (UndecidedKind 와 같은 이름을 쓴다) */
  why?: 'wording' | 'edge' | 'path' | 'unresolved' | 'missing' | 'conflict' | 'inverted';
  line?: number;
};

export type Evidence = {
  unit: Unit | null;
  score: number;
  status: '발견' | '일부 발견' | '미발견';
  why: string[];
  /** 대표 판정: 숫자 조건이 여럿이면 가장 나쁜 것 */
  boundary?: Boundary;
  boundaries?: Boundary[];
  /** 「확인됨」이라고 하기 어려운 까닭 (예: 다른 조건이 함께 걸려 있음) */
  caveat?: Text;
  /** 요구사항이 말하는 입력을 검사 없이 받는 곳 (다른 곳의 검사로 확인됐다고 하지 않는다) */
  unchecked?: Text;
  /** 「하루에 N번」인데 세는 줄에 기간이 보이지 않음 (전부 센다) */
  noWindow?: boolean;
};

export type TestStatus = '통과' | '실패' | '미실행';
/**
 * 이번 변경에서 바뀐 검사 하나 (기준 커밋의 검사 파일과 견줌).
 * 에이전트가 단언의 숫자를 바꾸거나 검사를 지워 「모두 통과」를 만든 경우를 보이려고 쓴다.
 */
export type TestEdit = {
  file: string;
  /** 지금 줄 (지운 검사면 기준 커밋의 줄) */
  line: number;
  title: string;
  /** describe 이름까지 붙인 이름 */
  full: string;
  /** 이름이 바뀌었으면 전 이름 */
  was?: string;
  kind: 'changed' | 'removed' | 'skipped';
  /** 짝이 맞는 줄에서 바뀐 값 (5 → 6, 'LOCKED' → 'BAD_LOGIN') */
  values: { from: string; to: string }[];
  /** 줄어든 확인(expect · assert) 수 */
  fewerChecks: number;
  /** 검사 자체가 아니라 그것이 가져오는 도우미 · 준비 파일이 바뀐 경우 그 파일 */
  via?: string;
};
export type ReqResult = { evidence: Evidence; tests: TestCase[]; testStatus: TestStatus; /** 이 요구사항의 검사 가운데 이번 변경에서 바뀐 것 */ edits?: TestEdit[] };

export type ResultSet = {
  key: 'A' | 'B';
  label: string;
  ref: string;
  sha: string;
  /** 커밋 전 변경이 들어 있으면 그 내용의 지문. 같은 커밋이어도 내용이 바뀌면 달라진다. */
  wip?: string;
  files: Record<string, string>;
  analyses: FileAnalysis[];
  units: Unit[];
  dyn: DynCall[];
  tests: TestCase[];
  /** 이번 변경에서 바뀐 검사 (검사 파일을 기준 커밋과 견줌) */
  testEdits?: TestEdit[];
  perReq: Record<string, ReqResult>;
};

export type Relation = { kind: '일치' | '불일치' | '비교 조건 다름' | '단일 결과'; detail: string };
export type Overall = '확인됨' | '다름' | '미확인' | '실패';
export type ReqSummary = { req: Requirement; relation: Relation; overall: Overall; notes: string[] };

export type Report = {
  generatedAt: string;
  repo: string;
  base: string;
  sets: ResultSet[];
  reqs: Requirement[];
  summaries: ReqSummary[];
  /** 테스트 결과가 코드보다 오래되어 쓰지 않았는가 */
  testsStale?: boolean;
};

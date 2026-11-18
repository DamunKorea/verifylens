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
};

export type UnitKind = 'money' | 'age' | 'char' | 'month' | 'week' | 'day' | 'hour' | 'min' | 'sec' | 'pct' | 'cnt' | 'qty' | 'kb' | 'mb' | 'gb';
export type NumRelation = 'gte' | 'gt' | 'lte' | 'lt' | 'count' | 'after' | 'eq' | 'value';
/** 요구사항 문장의 숫자 조건 */
export type Constraint = { value: number; unit: UnitKind | null; unitText: string; rel: NumRelation; scales: number[]; validSide: 'upper' | 'lower' | null; raw: string };

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
};

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
  /** 확정하지 못했거나 어긋난 까닭 */
  why?: 'ambiguous' | 'unresolved' | 'order' | 'missing' | 'inverted';
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
};

export type TestStatus = '통과' | '실패' | '미실행';
export type ReqResult = { evidence: Evidence; tests: TestCase[]; testStatus: TestStatus };

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

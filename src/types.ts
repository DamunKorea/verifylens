export type CondInfo = {
  expr: string;
  op?: string;
  lit?: number;
  left?: string;
  firstTrue?: number;
  incrementBefore?: boolean | null;
  attempts?: number | null;
};

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

export type FileAnalysis = { file: string; units: Unit[]; dyn: DynCall[]; flows: FlowGraph[] };

export type TestCase = { name: string; status: 'pass' | 'fail' | 'skip'; message: string };

export type Requirement = {
  id: string;
  text: string;
  keywords: string[];
  tokens: string[];
  numbers: number[];
  guardCue: boolean;
};

export type Boundary = { required: number; firstTrue?: number; attempts: number | null; ok: boolean | null; before: boolean | null };

export type Evidence = {
  unit: Unit | null;
  score: number;
  status: '발견' | '일부 발견' | '미발견';
  why: string[];
  boundary?: Boundary;
};

export type TestStatus = '통과' | '실패' | '미실행';
export type ReqResult = { evidence: Evidence; tests: TestCase[]; testStatus: TestStatus };

export type ResultSet = {
  key: 'A' | 'B';
  label: string;
  ref: string;
  sha: string;
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

export type Report = { generatedAt: string; repo: string; base: string; sets: ResultSet[]; reqs: Requirement[]; summaries: ReqSummary[] };

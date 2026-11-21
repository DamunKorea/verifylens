import ts from 'typescript';
import type { CmpOp, CondInfo, DynCall, FileAnalysis, FlowEdge, FlowGraph, FlowNode, NumPart, SchemaField, Unit } from './types.ts';
import { clip, tokenize } from './tokens.ts';
import { L } from './i18n.ts';

type FnNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const MAX_FLOW_NODES = 44;

/** 한 파일을 읽어 조건·함수 단위, 해석하지 못한 호출, 흐름 지도를 뽑는다. changed 가 있으면 바뀐 줄 여부를 표시한다. */
export function analyzeFile(file: string, content: string, changed: Set<number> | null): FileAnalysis {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const units: Unit[] = [];
  const dyn: DynCall[] = [];
  const flows: FlowGraph[] = [];
  let seq = 0;

  const isChanged = (a: number, b: number) => {
    if (!changed) return true;
    for (let l = a; l <= b; l++) if (changed.has(l)) return true;
    return false;
  };

  const fnName = (n: ts.Node): string | null => {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText(sf);
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isPropertyAssignment(p)) return p.name.getText(sf);
    }
    return null;
  };

  const isTerminal = (s: ts.Statement) => ts.isThrowStatement(s) || ts.isReturnStatement(s);
  /** 정액 갈래의 이름: kind === 'fixed' · case 'flat': */
  const FIXED_CASE = /['"`](?:fixed|flat|amount)['"`]/i;
  /** 정액 갈래가 돌려주는 값: 비율(÷100 · ×0.x)이면 percent, 금액을 빼면 subtract */
  const fixedKind = (ret: ts.Expression | undefined): 'percent' | 'subtract' | undefined => {
    const e = ret ? ret.getText(sf) : '';
    if (/\/\s*100\b|\*\s*0\.\d/.test(e)) return 'percent';
    if (/(?:^|[\s(])[\w.]+\s*-\s*[\w.]+/.test(e)) return 'subtract';
    return undefined;
  };
  const stmtsOf = (s: ts.Statement): readonly ts.Statement[] => (ts.isBlock(s) ? s.statements : [s]);

  // ---------------------------------------------------------------- 숫자 상수
  const constants: Record<string, number> = {};
  const conflicted = new Set<string>();
  const imports: FileAnalysis['imports'] = {};
  const reexports: FileAnalysis['reexports'] = { all: [], named: {} };
  const seen = new Set<ts.Node>();

  const unwrap = (e: ts.Expression): ts.Expression => {
    let x = e;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    return x;
  };
  const lookup = (name: string) => (conflicted.has(name) ? undefined : constants[name]);
  /** 코드만 보고 값을 알 수 있는 숫자 식을 계산한다 (5 * 60 * 1000, MAX_ITEMS, LIMITS.cart …). */
  const evalNum = (e0: ts.Expression): number | undefined => {
    const e = unwrap(e0);
    if (ts.isNumericLiteral(e)) return Number(e.text.replace(/_/g, ''));
    if (ts.isPrefixUnaryExpression(e)) {
      const v = evalNum(e.operand);
      if (v === undefined) return undefined;
      return e.operator === ts.SyntaxKind.MinusToken ? -v : e.operator === ts.SyntaxKind.PlusToken ? v : undefined;
    }
    if (ts.isBinaryExpression(e)) {
      const a = evalNum(e.left);
      const b = evalNum(e.right);
      if (a === undefined || b === undefined) return undefined;
      switch (e.operatorToken.kind) {
        case ts.SyntaxKind.AsteriskToken: return a * b;
        case ts.SyntaxKind.AsteriskAsteriskToken: return a ** b;
        case ts.SyntaxKind.PlusToken: return a + b;
        case ts.SyntaxKind.MinusToken: return a - b;
        case ts.SyntaxKind.SlashToken: return b ? a / b : undefined;
        default: return undefined;
      }
    }
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return lookup(e.getText(sf));
    // Math.pow(1024, 3)
    if (ts.isCallExpression(e) && e.expression.getText(sf) === 'Math.pow' && e.arguments.length === 2) {
      const a = evalNum(e.arguments[0]);
      const b = evalNum(e.arguments[1]);
      return a === undefined || b === undefined ? undefined : a ** b;
    }
    return undefined;
  };
  /** 이름 없이 숫자만으로 된 식인가 */
  const isPureNum = (e0: ts.Expression): boolean => {
    const e = unwrap(e0);
    if (ts.isNumericLiteral(e)) return true;
    if (ts.isPrefixUnaryExpression(e)) return isPureNum(e.operand);
    return ts.isBinaryExpression(e) && evalNum(e) !== undefined && isPureNum(e.left) && isPureNum(e.right);
  };
  const setConst = (name: string, v: number) => {
    if (name in constants && constants[name] !== v) conflicted.add(name);
    constants[name] = v;
  };
  const setObject = (prefix: string, o: ts.ObjectLiteralExpression) => {
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p) || (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name))) continue;
      const key = `${prefix}.${p.name.text}`;
      const init = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(init)) setObject(key, init);
      else {
        const v = evalNum(init);
        if (v !== undefined) setConst(key, v);
      }
    }
  };
  const collectConstants = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.getCombinedNodeFlags(n) & ts.NodeFlags.Const) {
      const init = unwrap(n.initializer);
      if (ts.isObjectLiteralExpression(init)) setObject(n.name.text, init);
      else {
        const v = evalNum(init);
        if (v !== undefined) setConst(n.name.text, v);
      }
    } else if (ts.isPropertyDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && ts.isClassLike(n.parent) && (ts.getCombinedModifierFlags(n) & (ts.ModifierFlags.Readonly | ts.ModifierFlags.Static))) {
      // 값이 바뀌는 필드(retries = 0)는 상수가 아니다
      const v = evalNum(n.initializer);
      if (v !== undefined) {
        setConst(`this.${n.name.text}`, v);
        if (n.parent.name) setConst(`${n.parent.name.text}.${n.name.text}`, v);
      }
    } else if (ts.isEnumMember(n) && n.initializer && ts.isIdentifier(n.name)) {
      const v = evalNum(n.initializer);
      if (v !== undefined) setConst(`${n.parent.name.text}.${n.name.text}`, v);
    } else if (ts.isParameter(n) && n.initializer && ts.isIdentifier(n.name)) {
      const v = evalNum(n.initializer);
      if (v !== undefined) setConst(n.name.text, v);
    } else if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.importClause?.namedBindings) {
      const from = n.moduleSpecifier.text;
      const b = n.importClause.namedBindings;
      if (ts.isNamespaceImport(b)) imports[b.name.text] = { from, name: '*' };
      else for (const el of b.elements) imports[el.name.text] = { from, name: (el.propertyName ?? el.name).text };
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const from = n.moduleSpecifier.text;
      if (!n.exportClause) {
        if (!reexports.all.includes(from)) reexports.all.push(from);
      } else if (ts.isNamedExports(n.exportClause)) {
        for (const el of n.exportClause.elements) reexports.named[el.name.text] = { from, name: (el.propertyName ?? el.name).text };
      }
    }
    ts.forEachChild(n, collectConstants);
  };
  // 상수가 다른 상수를 쓸 수 있으므로 두 번 돈다.
  collectConstants(sf);
  collectConstants(sf);

  // ---------------------------------------------------------------- 비교 읽기
  const CMP: Record<number, CmpOp> = {
    [ts.SyntaxKind.GreaterThanToken]: '>',
    [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
    [ts.SyntaxKind.LessThanToken]: '<',
    [ts.SyntaxKind.LessThanEqualsToken]: '<=',
    [ts.SyntaxKind.EqualsEqualsEqualsToken]: '===',
    [ts.SyntaxKind.EqualsEqualsToken]: '===',
    [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '!==',
    [ts.SyntaxKind.ExclamationEqualsToken]: '!==',
  };
  const FLIP: Record<CmpOp, CmpOp> = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '===': '===', '!==': '!==' };
  const NOT: Record<CmpOp, CmpOp> = { '>': '<=', '>=': '<', '<': '>=', '<=': '>', '===': '!==', '!==': '===' };
  const isCmp = (n: ts.Node): n is ts.BinaryExpression => ts.isBinaryExpression(n) && CMP[n.operatorToken.kind] !== undefined;
  const isFnLike = (n: ts.Node) => ts.isFunctionLike(n);

  /** 같은 변수를 1씩 올리는 문장이 비교 앞에 있는지(true), 뒤에만 있는지(false), 없는지(null) */
  const counterOrder = (target: string, at: ts.Node, fnBody: ts.Node | null): boolean | null => {
    if (!fnBody) return null;
    let before = false;
    let after = false;
    const scan = (n: ts.Node) => {
      let hit = false;
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.PlusPlusToken && n.operand.getText(sf) === target) hit = true;
      if (ts.isBinaryExpression(n) && n.left.getText(sf) === target) {
        if (n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken && ts.isNumericLiteral(n.right) && n.right.text === '1') hit = true;
        if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isBinaryExpression(n.right) && n.right.operatorToken.kind === ts.SyntaxKind.PlusToken && n.right.left.getText(sf) === target) hit = true;
      }
      if (hit) {
        if (n.pos < at.pos) before = true;
        else after = true;
      }
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return before ? true : after ? false : null;
  };
  const insideCatch = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p && !isFnLike(p); p = p.parent) if (ts.isCatchClause(p)) return true;
    return false;
  };
  const hasCall = (n: ts.Node): boolean => {
    if (ts.isThrowStatement(n)) return false;
    if (ts.isCallExpression(n) || ts.isAwaitExpression(n)) return true;
    return !!ts.forEachChild(n, (c) => (hasCall(c) ? true : undefined));
  };
  /** 검사 다음에 다른 호출(실제 동작)이 이어지는가 */
  const actionFollows = (at: ts.Node): boolean => {
    let s: ts.Node = at;
    while (s.parent && !ts.isBlock(s.parent) && !ts.isSourceFile(s.parent)) s = s.parent;
    const list = s.parent && (ts.isBlock(s.parent) || ts.isSourceFile(s.parent)) ? s.parent.statements : null;
    if (!list) return false;
    const i = list.indexOf(s as ts.Statement);
    return list.slice(i + 1).some(hasCall);
  };
  /** 검사 뒤에 같은 목록에 넣는가: cart.length 를 본 다음 cart.push(…) */
  const addsAfter = (left: string, at: ts.Node, fnBody: ts.Node | null): boolean => {
    const target = left.replace(/\.(?:length|size|count)(?:\(\))?$/, '');
    if (target === left || !fnBody) return false;
    let found = false;
    const scan = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.pos >= at.pos && n.expression.expression.getText(sf) === target && /^(?:push|unshift|add|set|append|insert)$/.test(n.expression.name.text)) found = true;
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return found;
  };
  /** const recent = attempts.filter(…) 처럼 다른 목록에서 걸러 낸 목록이면 원래 목록의 이름 (recent.length 는 attempts 의 개수를 센다) */
  const derivedFrom = (left: string, fnBody: ts.Node | null): string | undefined => {
    const name = left.replace(/\.(?:length|size)$/, '');
    if (name === left || !fnBody || !/^[A-Za-z_$][\w$]*$/.test(name)) return undefined;
    let src: string | undefined;
    const scan = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) {
        let init = n.initializer;
        while (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && /^(?:filter|slice|map|concat)$/.test(init.expression.name.text)) {
          src = init.expression.expression.getText(sf);
          init = init.expression.expression;
        }
      }
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return src && src !== name ? src : undefined;
  };
  /** if 의 몸통이 거부하는가: throw, return false / null / 빈 return */
  const rejects = (s: ts.Statement): boolean =>
    stmtsOf(s).some((x) => ts.isThrowStatement(x) || (ts.isReturnStatement(x) && (!x.expression || x.expression.kind === ts.SyntaxKind.FalseKeyword || x.expression.kind === ts.SyntaxKind.NullKeyword)));

  /** let n = 5 처럼 시작값이 있고 함수 안에서 1씩 줄이는 변수의 시작값 */
  const countdownStart = (name: string, fnBody: ts.Node | null): number | undefined => {
    if (!fnBody) return undefined;
    let start: number | undefined;
    let down = false;
    const scan = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) start = evalNum(n.initializer);
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.MinusMinusToken && n.operand.getText(sf) === name) down = true;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken && n.left.getText(sf) === name && evalNum(n.right) === 1) down = true;
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return down ? start : undefined;
  };

  /**
   * X.length 가 문자열의 길이(글자 수)인가, 목록의 길이(개수)인가.
   * pw.length 를 「하루에 3번」에, cart.items.length 를 「이름은 30자까지」에 잘못 견주지 않게 한다.
   * 이 파일에 그 이름의 선언이 있으면 타입(string · 배열 · 초깃값)으로, 없으면 흔한 이름으로 본다.
   */
  const lenKind = new Map<string, 'str' | 'list' | 'other'>();
  const visitDecl = (n: ts.Node) => {
    if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) && ts.isIdentifier(n.name)) {
      const type = n.type;
      const init = ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n) ? n.initializer : undefined;
      const strType = (t: ts.TypeNode): boolean =>
        t.kind === ts.SyntaxKind.StringKeyword || (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) ||
        (ts.isUnionTypeNode(t) && t.types.some(strType) && t.types.every((x) => strType(x) || x.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword)));
      const listType = (t: ts.TypeNode): boolean => ts.isArrayTypeNode(t) || ts.isTupleTypeNode(t) || (ts.isTypeReferenceNode(t) && /^(?:Array|ReadonlyArray)$/.test(t.typeName.getText(sf)));
      let kind: 'str' | 'list' | 'other' | undefined;
      if (type) kind = strType(type) ? 'str' : listType(type) ? 'list' : 'other';
      else if (init) kind = ts.isStringLiteralLike(init) || ts.isTemplateExpression(init) ? 'str' : ts.isArrayLiteralExpression(init) ? 'list' : undefined;
      if (kind !== undefined && !lenKind.has(n.name.text)) lenKind.set(n.name.text, kind);
    }
    ts.forEachChild(n, visitDecl);
  };
  visitDecl(sf);
  const STRINGY = /^(?:name|\w+Name|pw|pwd|password|passwd|passcode|otp|pin|text|\w+Text|title|username|nickname|email|phone|slug|message|msg|memo|label|keyword|description|content)$/;
  const LISTY = /^(?:items|list|rows|entries|tags|files|users|people|members|children|results|values|keys|ids|records|orders|products|messages|comments|attempts|requests|lines)$/;
  const lengthKind = (left: string): 'str' | 'list' | undefined => {
    const m = left.match(/(?:^|\.)([A-Za-z_$][\w$]*)\.length$/);
    if (!m) return undefined;
    const k = lenKind.get(m[1]);
    if (k === 'str' || k === 'list') return k;
    if (k === 'other') return undefined;
    return STRINGY.test(m[1]) ? 'str' : LISTY.test(m[1]) ? 'list' : undefined;
  };

  type Ctx = { at: ts.Node; fnBody: ts.Node | null; reject: boolean; loopVar?: string; loopStart?: number; inLoopHead?: boolean };
  const partOf = (e: ts.BinaryExpression, negated: boolean, ctx: Ctx): NumPart | null => {
    let op = CMP[e.operatorToken.kind];
    let l = unwrap(e.left);
    let r = unwrap(e.right);
    if (isPureNum(l) && isPureNum(r)) return null;
    // 숫자를 오른쪽으로 모은다: 5 <= x → x >= 5. 양쪽 다 이름이면 오른쪽을 기준값으로 본다.
    if (isPureNum(l) || (evalNum(r) === undefined && evalNum(l) !== undefined)) {
      [l, r] = [r, l];
      op = FLIP[op];
    }
    const lit = evalNum(r);
    let ref: string | undefined;
    if (lit === undefined) {
      // 문자열 · true · null 과의 비교는 숫자 조건이 아니다
      if (op === '===' || op === '!==') return null;
      if (ts.isStringLiteralLike(r) || r.kind === ts.SyntaxKind.NullKeyword || r.kind === ts.SyntaxKind.TrueKeyword || r.kind === ts.SyntaxKind.FalseKeyword) return null;
      ref = clip(r.getText(sf), 50);
    }
    if (negated) op = NOT[op];
    // while (n-- > 0) 의 왼쪽은 n 이다
    if ((ts.isPostfixUnaryExpression(l) || ts.isPrefixUnaryExpression(l)) && l.operator === ts.SyntaxKind.MinusMinusToken) l = l.operand;
    const left = l.getText(sf);
    const down = ctx.inLoopHead && ctx.loopVar === undefined ? countdownStart(left, ctx.fnBody) : undefined;
    const loop = down !== undefined || (ctx.loopVar !== undefined && left === ctx.loopVar);
    if (down !== undefined) ctx = { ...ctx, loopStart: down };
    // 걸러 낸 목록의 개수는 원래 목록의 이름도 함께 적어 둔다: recent.length (attempts)
    const src = derivedFrom(left, ctx.fnBody);
    return {
      expr: clip(e.getText(sf), 80),
      left: src ? `${left} (${src})` : left,
      op,
      lit,
      ref,
      line: line(e.getStart(sf)),
      source: loop ? 'loop' : 'compare',
      incBefore: loop ? null : counterOrder(left, ctx.at, ctx.fnBody),
      preAdd: addsAfter(left, ctx.at, ctx.fnBody) || (!!src && addsAfter(`${src}.length`, ctx.at, ctx.fnBody)),
      inCatch: insideCatch(ctx.at),
      actionAfter: actionFollows(ctx.at),
      thenKind: ctx.reject ? 'reject' : null,
      loopStart: loop ? ctx.loopStart : undefined,
      ...(lengthKind(left) === 'str' ? { strLen: true } : lengthKind(left) === 'list' ? { listLen: true } : {}),
    };
  };
  /** 조건식을 &&, ||, ! 로 나눠 숫자 비교를 모은다. */
  const collectParts = (e0: ts.Expression, negated: boolean, ctx: Ctx, out: NumPart[]) => {
    const e = unwrap(e0);
    seen.add(e);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return collectParts(e.operand, !negated, ctx, out);
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      collectParts(e.left, negated, ctx, out);
      collectParts(e.right, negated, ctx, out);
      return;
    }
    if (isCmp(e)) {
      const p = partOf(e, negated, ctx);
      if (p) out.push(p);
    }
  };
  const andTermsOf = (e0: ts.Expression): string[] => {
    const e = unwrap(e0);
    return ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [...andTermsOf(e.left), ...andTermsOf(e.right)] : [e.getText(sf)];
  };
  const buildCond = (expr: ts.Expression, ctx: Ctx): CondInfo => {
    const parts: NumPart[] = [];
    collectParts(expr, false, ctx, parts);
    const terms = andTermsOf(expr);
    return { expr: clip(expr.getText(sf), 80), parts, andTerms: terms.length > 1 ? terms : undefined, single: isCmp(unwrap(expr)) };
  };

  const summarize = (stmts: ts.Statement[]): string => {
    const first = clip(stmts[0].getText(sf).replace(/;$/, ''), 34);
    return stmts.length > 1 ? `${first} ${L('외', '+')} ${stmts.length - 1}` : first;
  };

  const buildFlow = (name: string, fn: FnNode & { body: ts.Block }): FlowGraph => {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    let truncated = false;
    let merges: number[] = [];
    const norm = (t: string) => t.replace(/;$/, '').replace(/\s+/g, ' ').trim();
    const add = (kind: FlowNode['kind'], label: string, n: ts.Node, col: number, row: number, stmts: string[] = []): number => {
      if (nodes.length >= MAX_FLOW_NODES) {
        truncated = true;
        return -1;
      }
      nodes.push({ id: nodes.length, kind, label, stmts, line: line(n.getStart(sf)), endLine: line(n.getEnd()), col, row });
      return nodes.length - 1;
    };
    const link = (from: number | null, to: number, label?: string) => {
      if (to < 0) return;
      if (from !== null && from >= 0) edges.push({ from, to, label });
      for (const m of merges) if (m >= 0 && m !== from) edges.push({ from: m, to, back: true });
      merges = [];
    };
    // returns { last, nextRow, terminal }
    const walk = (stmts: readonly ts.Statement[], col: number, row: number, prev: number | null, prevLabel?: string) => {
      let cur = prev;
      let label = prevLabel;
      let r = row;
      let pending: ts.Statement[] = [];
      let terminal = false;
      const flush = () => {
        if (!pending.length) return;
        const id = add('step', summarize(pending), pending[0], col, r, pending.map((p) => norm(p.getText(sf))));
        link(cur, id, label);
        if (id >= 0) cur = id;
        label = undefined;
        r += 1;
        pending = [];
      };
      for (const s of stmts) {
        if (truncated) break;
        if (ts.isIfStatement(s)) {
          flush();
          const d = add('decision', clip(s.expression.getText(sf), 30), s, col, r, [`if (${norm(s.expression.getText(sf))})`]);
          link(cur, d, label);
          label = undefined;
          if (d < 0) break;
          const res = walk(stmtsOf(s.thenStatement), col + 1, r, d, L('예', 'yes'));
          cur = d;
          label = L('아니오', 'no');
          if (!res.terminal && res.last !== null) merges.push(res.last);
          r = Math.max(r + 1, res.nextRow);
        } else if (isTerminal(s)) {
          flush();
          const id = add('end', clip(s.getText(sf).replace(/;$/, ''), 34), s, col, r, [norm(s.getText(sf))]);
          link(cur, id, label);
          r += 1;
          cur = id;
          terminal = true;
          break;
        } else {
          pending.push(s);
        }
      }
      if (!terminal) flush();
      return { last: cur, nextRow: r, terminal };
    };
    const start = add('start', `${name}()`, fn, 0, 0);
    walk(fn.body.statements, 0, 1, start);
    return { fn: name, file, startLine: line(fn.getStart(sf)), endLine: line(fn.getEnd()), nodes, edges, truncated };
  };

  const visitFn = (fn: FnNode, name: string) => {
    const body = fn.body && ts.isBlock(fn.body) ? fn.body : null;
    const startLine = line(fn.getStart(sf));
    const endLine = line(fn.getEnd());
    const bodyText = fn.getText(sf);
    units.push({
      id: `${file}#fn${seq++}`,
      kind: 'function',
      file,
      fn: name,
      startLine,
      endLine,
      text: clip(bodyText.split('\n')[0], 90),
      tokens: [...new Set(tokenize(name + ' ' + bodyText))],
      guard: false,
      changed: isChanged(startLine, endLine),
    });
    if (body) flows.push(buildFlow(name, fn as FnNode & { body: ts.Block }));
  };

  const addCond = (n: ts.Node, cur: { name: string } | undefined, text: string, sl: number, el: number, guard: boolean, cond: CondInfo) => {
    units.push({
      id: `${file}#c${seq++}`,
      kind: 'condition',
      file,
      fn: cur?.name ?? L('(최상위)', '(top level)'),
      startLine: sl,
      endLine: el,
      text: clip(text, 120),
      tokens: [...new Set(tokenize(text))],
      guard,
      changed: isChanged(sl, el),
      cond,
    });
  };
  /** 비교가 들어 있는 문장 (변수 선언 · return · 객체의 한 칸 …) */
  const enclosing = (n: ts.Node): ts.Node => {
    let p = n;
    while (p.parent && !ts.isStatement(p) && !ts.isPropertyAssignment(p) && !ts.isSourceFile(p.parent)) p = p.parent;
    return p;
  };
  /** 스키마 값의 이름: password: z.string().min(8) 이면 password */
  const ownerName = (n: ts.Node): string => {
    for (let p: ts.Node | undefined = n.parent; p && !ts.isStatement(p); p = p.parent) {
      if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return p.name.getText(sf);
      if (ts.isVariableDeclaration(p)) return p.name.getText(sf);
    }
    return n.getText(sf).split('.')[0];
  };
  const SCHEMA_OP: Record<string, CmpOp> = { min: '>=', minLength: '>=', gte: '>=', gt: '>', max: '<=', maxLength: '<=', lte: '<=', lt: '<' };
  const simplePartBase = (n: ts.Node, left: string, op: CmpOp): NumPart => ({ expr: clip(n.getText(sf), 80), left, op, line: line(n.getStart(sf)), source: 'schema', incBefore: null, preAdd: false, inCatch: false, actionAfter: false, thenKind: null });
  const simplePart = (n: ts.Node, left: string, op: CmpOp, value: ts.Expression, source: NumPart['source']): NumPart | null => {
    const lit = evalNum(value);
    const v = unwrap(value);
    if (lit === undefined && !ts.isIdentifier(v) && !ts.isPropertyAccessExpression(v)) return null;
    return { ...simplePartBase(n, left, op), lit, ref: lit === undefined ? clip(v.getText(sf), 50) : undefined, source };
  };
  /** 비교문이 아닌 숫자 조건: 스키마(.min(8)), 상한(Math.min, slice) */
  const callPart = (n: ts.CallExpression): NumPart | null => {
    if (ts.isIdentifier(n.expression)) {
      const callee = n.expression.text;
      // setTimeout(fn, 30000) · sleep(1000)
      if (/^(?:setTimeout|setInterval)$/.test(callee) && n.arguments.length >= 2) return simplePart(n, `${ownerName(n)} ${callee}`, '===', n.arguments[1], 'config');
      if (/^(?:sleep|delay|wait)$/.test(callee) && n.arguments.length === 1) return simplePart(n, `${ownerName(n)} ${callee}`, '===', n.arguments[0], 'config');
      // @MaxLength(15) · @Min(18) 데코레이터
      const op = SCHEMA_OP[callee[0].toLowerCase() + callee.slice(1)];
      if (op && ts.isDecorator(n.parent) && n.arguments.length >= 1) return simplePart(n, ownerName(n.parent), op, n.arguments[0], 'schema');
      return null;
    }
    if (!ts.isPropertyAccessExpression(n.expression)) return null;
    const name = n.expression.name.text;
    const recv = n.expression.expression;
    const a = n.arguments;
    if (ts.isIdentifier(recv) && recv.text === 'Math' && a.length === 2 && (name === 'min' || name === 'max')) {
      const numeric = evalNum(a[1]) !== undefined ? 1 : evalNum(a[0]) !== undefined ? 0 : -1;
      if (numeric < 0) return null;
      return simplePart(n, `${ownerName(n)} ${a[1 - numeric].getText(sf)}`, name === 'min' ? '<=' : '>=', a[numeric], 'cap');
    }
    if (name === 'slice' && a.length === 2 && evalNum(a[0]) === 0) return simplePart(n, `${recv.getText(sf)} ${ownerName(n)}`, '<=', a[1], 'cap');
    if ((name === 'limit' || name === 'take') && a.length === 1) return simplePart(n, `${recv.getText(sf)} ${ownerName(n)}`, '<=', a[0], 'cap');
    if (SCHEMA_OP[name] && a.length >= 1) return simplePart(n, `${ownerName(n)} ${recv.getText(sf)}`, SCHEMA_OP[name], a[0], 'schema');
    return null;
  };
  /** 설정값: { maxLength: 20, minLength: 8, maxAttempts: 3 } */
  const CONFIG_NAME = /retr|attempt|timeout|ttl|expire|age|window|delay|interval|duration|limit|size|count|capacity|lifetime|max|length|quota|threshold|period|day|hour|minute|second(?!ary)|week|month|year|rate|ratio|percent|pct|fee|tax|vat|commission|discount|interest|coupon|voucher/i;
  /** '1h' · '7d' · '30m' 같은 기간 글을 초로 */
  const durationSeconds = (e0: ts.Expression): number | undefined => {
    const e = unwrap(e0);
    if (!ts.isStringLiteralLike(e)) return undefined;
    const m = e.text.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|week|weeks)$/i);
    if (!m) return undefined;
    const unit = m[2][0].toLowerCase();
    return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit as 's']!;
  };
  /** HOUR · ONE_DAY · MS_PER_DAY · SECONDS_IN_HOUR 는 단위를 환산하는 상수이지 설정값이 아니다 */
  const UNIT_CONSTANT = /^(?:one_?|(?:ms|msecs?|millis(?:econds)?|secs?|seconds?)_?(?:per|in)_?)?(?:second|minute|hour|day|week|month|year)s?(?:_?(?:in_?)?(?:ms|msecs?|millis(?:econds)?|secs?|seconds?))?$/i;
  const configPart = (n: ts.Node, name: string, value0: ts.Expression): NumPart | null => {
    if (!CONFIG_NAME.test(name) || UNIT_CONSTANT.test(name.split('.').pop()!)) return null;
    // options.max ?? 5, opts.limit || 5: 정해 주지 않았을 때의 기본값을 읽는다
    let value = unwrap(value0);
    if (ts.isBinaryExpression(value) && (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || value.operatorToken.kind === ts.SyntaxKind.BarBarToken)) value = value.right;
    const secs = durationSeconds(value);
    if (secs !== undefined) return { ...simplePartBase(n, name, '==='), lit: secs, source: 'config', secs: true };
    return evalNum(value) === undefined ? null : simplePart(n, name, '===', value, 'config');
  };
  const propertyPart = (n: ts.PropertyAssignment): NumPart | null => {
    const name = n.name.getText(sf).replace(/['"]/g, '');
    const timeLike = /age|time|wait|duration|delay/i.test(name);
    if (evalNum(n.initializer) !== undefined && !timeLike) {
      if (/^min/i.test(name)) return simplePart(n, name, '>=', n.initializer, 'schema');
      if (/^(?:max|limit$)/i.test(name)) return simplePart(n, name, '<=', n.initializer, 'schema');
    }
    return configPart(n, name, n.initializer);
  };

  const isDefaultAssign = (n: ts.Node): boolean =>
    ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken || n.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken || n.operatorToken.kind === ts.SyntaxKind.EqualsToken);

  const walkNode = (n: ts.Node, fnStack: { name: string; body: ts.Node | null }[]) => {
    const name = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) ? fnName(n) : null;
    let stack = fnStack;
    if (name) {
      const f = n as FnNode;
      visitFn(f, name);
      stack = [...fnStack, { name, body: f.body ?? null }];
    }
    const cur = stack[stack.length - 1];
    const fnBody = cur?.body ?? null;
    if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
      const cond = ts.isIfStatement(n) ? n.expression : n.condition;
      const consequent = ts.isIfStatement(n) ? stmtsOf(n.thenStatement) : [];
      const sl = line(n.getStart(sf));
      const el = ts.isIfStatement(n) ? line(n.thenStatement.getEnd()) : line(n.getEnd());
      const guard = consequent.some(isTerminal);
      const text = ts.isIfStatement(n) ? n.getText(sf).slice(0, n.thenStatement.getEnd() - n.getStart(sf)) : n.getText(sf);
      const info = buildCond(cond, { at: n, fnBody, reject: ts.isIfStatement(n) && rejects(n.thenStatement) });
      // 「정액이면」 갈래의 계산이 비율(÷100)인지 금액 빼기인지 본다 (X 에서 받은 버그: 정액 쿠폰을 비율로 계산)
      if (FIXED_CASE.test(cond.getText(sf))) {
        const ret = ts.isIfStatement(n) ? consequent.find(ts.isReturnStatement)?.expression : n.whenTrue;
        const fb = fixedKind(ret);
        if (fb) info.fixedBranch = fb;
      }
      addCond(n, cur, text, sl, el, guard, info);
    } else if (ts.isPropertyAssignment(n) && /^['"`]?(?:fixed|flat|amount)['"`]?$/i.test(n.name.getText(sf)) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      // { fixed: (total, v) => total - v, rate: … } 처럼 객체에 담은 계산식도 같은 갈래로 본다
      const f = n.initializer;
      const body = f.body;
      const ret = ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : body;
      const fb = fixedKind(ret);
      if (fb) {
        const sl = line(n.getStart(sf));
        addCond(n, cur, `${cur?.name ?? ''} ${clip(n.getText(sf), 200)}`, sl, line(n.getEnd()), true, { expr: `${n.name.getText(sf)}: ${clip(ret!.getText(sf), 60)}`, fixedBranch: fb });
      }
    } else if (ts.isCaseClause(n) && FIXED_CASE.test(n.expression.getText(sf))) {
      // switch (c.type) { case 'fixed': return … } 도 같은 갈래로 본다
      const fb = fixedKind(n.statements.find(ts.isReturnStatement)?.expression);
      if (fb) {
        const sl = line(n.getStart(sf));
        const subject = ts.isSwitchStatement(n.parent.parent) ? n.parent.parent.expression.getText(sf) : 'switch';
        addCond(n, cur, `${subject} ${clip(n.getText(sf), 200)}`, sl, line(n.getEnd()), true, { expr: `${subject} === ${n.expression.getText(sf)}`, fixedBranch: fb });
      }
    } else if (ts.isWhileStatement(n) || ts.isDoStatement(n)) {
      const sl = line(n.expression.getStart(sf));
      addCond(n, cur, n.getText(sf), sl, sl, false, buildCond(n.expression, { at: n, fnBody, reject: false, inLoopHead: true }));
    } else if (ts.isForStatement(n) && n.condition) {
      // for (let i = 0; i < 3; i++): 몇 번 도는지 계산할 수 있게 시작값을 넘긴다
      let loopVar: string | undefined;
      let loopStart: number | undefined;
      if (n.initializer && ts.isVariableDeclarationList(n.initializer) && n.initializer.declarations.length === 1) {
        const d = n.initializer.declarations[0];
        if (ts.isIdentifier(d.name) && d.initializer) {
          loopVar = d.name.text;
          loopStart = evalNum(d.initializer);
        }
      }
      if (loopStart === undefined) loopVar = undefined;
      const sl = line(n.getStart(sf));
      addCond(n, cur, n.getText(sf), sl, sl, false, buildCond(n.condition, { at: n, fnBody, reject: false, loopVar, loopStart }));
    } else if (isCmp(n) && !seen.has(n)) {
      // if 밖의 비교: const ok = age >= 19, return x < 3, (a) => a.days <= 7
      const cond = buildCond(n, { at: n, fnBody, reject: false });
      if (cond.parts?.length) {
        const host = enclosing(n);
        const sl = line(n.getStart(sf));
        addCond(n, cur, `${cur?.name ?? ''} ${host.getText(sf)}`, sl, sl, false, cond);
      }
    } else if (ts.isCallExpression(n) || ts.isPropertyAssignment(n) || ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer && ts.isIdentifier(n.name)) || isDefaultAssign(n)) {
      // const SESSION_TTL_MS = 1800000, options.retries ??= 10, (size = 21) => …, { limit = 20 } 처럼 값만 정해 두는 경우도 설정값으로 읽는다
      const p = ts.isCallExpression(n)
        ? callPart(n)
        : ts.isPropertyAssignment(n)
          ? propertyPart(n)
          : ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)
            ? configPart(n, (n.name as ts.Identifier).text, n.initializer!)
            : configPart(n, (n as ts.BinaryExpression).left.getText(sf), (n as ts.BinaryExpression).right);
      if (p) {
        // 값이 들어 있는 문장 전체를 본다: const loginLimit = rateLimit({ max: 10 }) 의 max 는 login 에 대한 것이다
        let st: ts.Node = n;
        while (st.parent && !ts.isStatement(st) && !ts.isClassElement(st) && !ts.isSourceFile(st.parent)) st = st.parent;
        addCond(n, cur, `${cur?.name ?? ''} ${clip(st.getText(sf), 400)}`, p.line, p.line, false, { expr: p.expr, parts: [p], single: false });
      }
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isElementAccessExpression(callee) || (ts.isIdentifier(callee) && callee.text === 'eval')) {
        dyn.push({ file, line: line(n.getStart(sf)), text: clip(n.getText(sf), 60) });
      }
    }
    ts.forEachChild(n, (c) => walkNode(c, stack));
  };

  walkNode(sf, []);
  for (const k of conflicted) delete constants[k];
  for (const u of units) if (u.cond) syncPrimary(u.cond);
  // ---------------------------------------------------------------- 스키마의 문자열 칸 (z.string() · yup.string() · Joi.string())
  // 「잘못된 이메일은 거부한다」에서, 바뀐 스키마가 그 칸을 검사 없이 받는지(email: z.string()) 본다 (X 에서 받은 버그)
  const fields: SchemaField[] = [];
  const STRING_CHECK = new Set(['email', 'url', 'uuid', 'cuid', 'cuid2', 'ulid', 'regex', 'matches', 'pattern', 'min', 'max', 'length', 'nonempty', 'startsWith', 'endsWith', 'includes', 'refine', 'superRefine', 'ip', 'datetime', 'emoji']);
  // 형식을 보는 검사(.email() · .url() · .uuid() · .regex(…))는 그 자체로 잘못된 값을 막는 조건이다 → 근거가 될 수 있게 조건 줄로 둔다
  const FORMAT_CHECK = new Set(['email', 'url', 'uuid', 'cuid', 'cuid2', 'ulid', 'regex', 'matches', 'pattern', 'ip', 'datetime', 'emoji']);
  const schemaName = (n: ts.Node): string => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    return L('(최상위)', '(top level)');
  };
  const visitFields = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && ts.isCallExpression(n.initializer)) {
      const calls: string[] = [];
      const callNodes: ts.CallExpression[] = [];
      let e: ts.Expression = n.initializer;
      while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        calls.push(e.expression.name.text);
        callNodes.push(e);
        e = e.expression.expression;
      }
      const l = line(n.getStart(sf));
      if (calls.at(-1) === 'string' && ts.isIdentifier(e) && /^(z|yup|joi|Joi)$/.test(e.text) && isChanged(l, l)) {
        const name = n.name.getText(sf).replace(/['"`]/g, '');
        fields.push({ file, line: l, name, checked: calls.slice(0, -1).some((c) => STRING_CHECK.has(c)) });
        if (calls.some((c) => FORMAT_CHECK.has(c))) {
          // regex(/^\d{5}$/) 는 글자 수가 정확히 5 (우편번호 · 인증번호)
          const parts: NumPart[] = [];
          for (const c of callNodes) {
            const arg = c.arguments[0];
            if (!/^(?:regex|matches|pattern)$/.test((c.expression as ts.PropertyAccessExpression).name.text) || !arg || !ts.isRegularExpressionLiteral(arg)) continue;
            const m = arg.text.match(/^\/\^(?:\\d|\[0-9\])\{(\d+)\}\$\/[a-z]*$/);
            if (m) parts.push({ ...simplePartBase(c, `${name} length`, '==='), lit: Number(m[1]), strLen: true });
          }
          const text = n.getText(sf);
          const host = schemaName(n);
          const cond: CondInfo = { expr: clip(text, 80), parts, single: parts.length === 1 };
          syncPrimary(cond);
          units.push({ id: `${file}#s${seq++}`, kind: 'condition', file, fn: host, startLine: l, endLine: line(n.getEnd()), text: clip(text, 120), tokens: [...new Set(tokenize(`${host} ${text}`))], guard: true, changed: true, cond });
        }
      }
    }
    ts.forEachChild(n, visitFields);
  };
  visitFields(sf);

  return { file, units, dyn, flows, constants, imports, reexports, fields };
}

/** 조건식이 비교 하나뿐이면 그 값을 cond 에 바로 둔다 (두 결과 비교 · 화면 표시에 쓴다). */
export function syncPrimary(c: CondInfo) {
  const p = c.single && c.parts?.length === 1 ? c.parts[0] : undefined;
  if (!p || p.lit === undefined || p.op === '!==') return;
  c.op = p.op;
  c.lit = p.lit;
  c.left = p.left;
  c.firstTrue = p.op === '>=' || p.op === '===' ? p.lit : p.op === '>' ? p.lit + 1 : undefined;
  c.incrementBefore = p.incBefore;
  if (c.firstTrue !== undefined) c.attempts = p.incBefore === null ? null : p.incBefore ? c.firstTrue : c.firstTrue + 1;
}

const normalizePath = (p: string) => {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
};

/**
 * 다른 파일에서 가져온 상수를 푼다: import { CART_MAX } from './limits'.
 * 바뀌지 않은 파일이면 read 로 읽어 본다. 못 찾으면 값 없음으로 남고, 그 조건은 「확정 불가」가 된다.
 */
export function resolveRefs(analyses: FileAnalysis[], read?: (file: string) => string | null, allFiles: string[] = []) {
  const known = new Map(analyses.map((a) => [a.file, a]));
  const everyFile = [...new Set([...allFiles, ...known.keys()])];
  const load = (file: string): FileAnalysis | null => {
    if (known.has(file)) return known.get(file)!;
    const text = read?.(file);
    if (text === null || text === undefined) return null;
    const a = analyzeFile(file, text, null);
    known.set(file, a);
    return a;
  };
  const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '/index.ts', '/index.js'];
  const open = (from: string, spec: string): FileAnalysis | null => {
    if (spec.startsWith('.')) {
      const dir = from.split('/').slice(0, -1).join('/');
      const stem = normalizePath(`${dir}/${spec}`).replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, '');
      for (const ext of EXTS) {
        const a = load(stem + ext);
        if (a) return a;
      }
      return null;
    }
    // 경로 별칭: @/x, ~/x, #/x, @services/x. 저장소에서 그 경로로 끝나는 파일이 하나뿐일 때만 잇는다.
    const m = spec.match(/^(?:[@~#]\/|[@~#]([\w-]+)\/)(.+)$/);
    if (!m) return null;
    const tail = (m[1] ? `${m[1]}/${m[2]}` : m[2]).replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, '');
    for (const t of m[1] ? [tail, m[2].replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, '')] : [tail]) {
      const hits = EXTS.flatMap((ext) => everyFile.filter((f) => f === t + ext || f.endsWith(`/${t}${ext}`)));
      if (hits.length === 1) return load(hits[0]);
      if (hits.length > 1) return null;
    }
    return null;
  };
  /** 파일에서 이름의 값을 찾는다. 다시 내보낸 것이면 따라간다. */
  const valueOf = (a: FileAnalysis, key: string, depth = 0): number | undefined => {
    if (a.constants[key] !== undefined) return a.constants[key];
    if (depth >= 4) return undefined;
    const [root, ...rest] = key.split('.');
    const via = a.reexports.named[root] ?? a.imports[root];
    if (via) {
      const t = open(a.file, via.from);
      const v = t && valueOf(t, [via.name, ...rest].join('.'), depth + 1);
      if (v !== undefined && v !== null) return v;
    }
    for (const from of a.reexports.all) {
      const t = open(a.file, from);
      const v = t && valueOf(t, key, depth + 1);
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  for (const a of analyses) {
    for (const u of a.units) {
      if (!u.cond?.parts) continue;
      for (const p of u.cond.parts) {
        if (p.lit !== undefined || !p.ref) continue;
        const [root, ...rest] = p.ref.split('.');
        const imp = a.imports[root];
        if (!imp) continue;
        const target = open(a.file, imp.from);
        if (!target) continue;
        const key = imp.name === '*' ? rest.join('.') : [imp.name, ...rest].join('.');
        const v = valueOf(target, key);
        if (v !== undefined) {
          p.lit = v;
          p.ref = undefined;
        }
      }
      syncPrimary(u.cond);
    }
  }
}

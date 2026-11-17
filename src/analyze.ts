import ts from 'typescript';
import type { CondInfo, DynCall, FileAnalysis, FlowEdge, FlowGraph, FlowNode, Unit } from './types.ts';
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
  const stmtsOf = (s: ts.Statement): readonly ts.Statement[] => (ts.isBlock(s) ? s.statements : [s]);

  const parseCond = (expr: ts.Expression, ifNode: ts.Node, fnBody: ts.Node | null): CondInfo => {
    let e = expr;
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    const info: CondInfo = { expr: clip(expr.getText(sf), 80) };
    if (!ts.isBinaryExpression(e)) return info;
    const k = e.operatorToken.kind;
    const opText: Record<number, string> = {
      [ts.SyntaxKind.GreaterThanToken]: '>',
      [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
      [ts.SyntaxKind.LessThanToken]: '<',
      [ts.SyntaxKind.LessThanEqualsToken]: '<=',
      [ts.SyntaxKind.EqualsEqualsEqualsToken]: '===',
      [ts.SyntaxKind.EqualsEqualsToken]: '==',
    };
    const flip: Record<string, string> = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '===': '===', '==': '==' };
    let op = opText[k];
    if (!op) return info;
    let left: ts.Expression = e.left;
    let right: ts.Expression = e.right;
    if (ts.isNumericLiteral(left) && !ts.isNumericLiteral(right)) {
      [left, right] = [right, left];
      op = flip[op];
    }
    if (!ts.isNumericLiteral(right)) return info;
    info.op = op;
    info.lit = Number(right.text);
    info.left = left.getText(sf);
    if (op === '>=' || op === '===' || op === '==') info.firstTrue = info.lit;
    else if (op === '>') info.firstTrue = info.lit + 1;
    // 같은 변수를 1씩 올리는 문장이 비교 앞에 있는지, 뒤에 있는지
    let before = false;
    let after = false;
    const target = info.left;
    const scan = (n: ts.Node) => {
      let hit = false;
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.PlusPlusToken && n.operand.getText(sf) === target) hit = true;
      if (ts.isBinaryExpression(n) && n.left.getText(sf) === target) {
        if (n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken && ts.isNumericLiteral(n.right) && n.right.text === '1') hit = true;
        if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isBinaryExpression(n.right) && n.right.operatorToken.kind === ts.SyntaxKind.PlusToken && n.right.left.getText(sf) === target) hit = true;
      }
      if (hit) {
        if (n.pos < ifNode.pos) before = true;
        else after = true;
      }
      ts.forEachChild(n, scan);
    };
    if (fnBody) scan(fnBody);
    info.incrementBefore = before ? true : after ? false : null;
    if (info.firstTrue !== undefined) info.attempts = before ? info.firstTrue : after ? info.firstTrue + 1 : null;
    return info;
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

  const walkNode = (n: ts.Node, fnStack: { name: string; body: ts.Node | null }[]) => {
    const name = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) ? fnName(n) : null;
    let stack = fnStack;
    if (name) {
      const f = n as FnNode;
      visitFn(f, name);
      stack = [...fnStack, { name, body: f.body ?? null }];
    }
    const cur = stack[stack.length - 1];
    if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
      const cond = ts.isIfStatement(n) ? n.expression : n.condition;
      const consequent = ts.isIfStatement(n) ? stmtsOf(n.thenStatement) : [];
      const sl = line(n.getStart(sf));
      const el = ts.isIfStatement(n) ? line(n.thenStatement.getEnd()) : line(n.getEnd());
      const guard = consequent.some(isTerminal);
      const text = ts.isIfStatement(n) ? n.getText(sf).slice(0, n.thenStatement.getEnd() - n.getStart(sf)) : n.getText(sf);
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
        cond: parseCond(cond, n, cur?.body ?? null),
      });
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
  return { file, units, dyn, flows };
}

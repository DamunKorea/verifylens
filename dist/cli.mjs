#!/usr/bin/env node
// VerifyLens command line, bundled from src/ by tools/build-cli.mjs. Do not edit; edit src/ and rebuild.
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/tokens.ts
function stem(word) {
  let s = word.toLowerCase();
  const ord = s.match(/^(\d+)(st|nd|rd|th)$/);
  if (ord) return ord[1];
  if (/^\d+$/.test(s)) return s;
  if (/[가-힣]/.test(s)) return s;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("ied")) s = s.slice(0, -3) + "y";
  else if (s.length > 5 && s.endsWith("ing")) s = undouble(s.slice(0, -3));
  else if (s.length > 4 && s.endsWith("ed") && !s.endsWith("eed")) s = undouble(s.slice(0, -2));
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}
function tokenize(text) {
  const out = [];
  const parts = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9가-힣]+/);
  for (const p of parts) {
    if (!p) continue;
    const s = stem(p);
    if (s.length < 2 && !/^\d$/.test(s)) continue;
    if (STOP.has(s)) continue;
    out.push(s);
  }
  return out;
}
function clip(s, n) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "\u2026" : one;
}
var undouble, STOP;
var init_tokens = __esm({
  "src/tokens.ts"() {
    undouble = (s) => s.replace(/([bgmnprt])\1$/, "$1");
    STOP = new Set([
      "if",
      "else",
      "return",
      "const",
      "let",
      "var",
      "new",
      "await",
      "async",
      "function",
      "the",
      "a",
      "an",
      "of",
      "to",
      "in",
      "on",
      "is",
      "and",
      "or",
      "not",
      "true",
      "false",
      "null",
      "undefined",
      "this",
      "typeof",
      "void",
      "import",
      "from",
      "export",
      "default",
      "throw",
      "try",
      "catch",
      "for",
      "while",
      "as",
      "type"
    ].map(stem));
  }
});

// src/i18n.ts
var cur, setLang, getLang, isEn, L, OVERALL, TEST, EVIDENCE, RELATION, JUDGE, wOverall, wTest, wEvidence, wRelation, wJudge, JUDGE_LABELS, testPhrase, setLabel, joinNames;
var init_i18n = __esm({
  "src/i18n.ts"() {
    cur = "ko";
    setLang = (l) => {
      cur = l;
    };
    getLang = () => cur;
    isEn = () => cur === "en";
    L = (ko, en) => cur === "en" ? en : ko;
    OVERALL = { \uD655\uC778\uB428: "Verified", \uB2E4\uB984: "Different", \uC2E4\uD328: "Failed", \uBBF8\uD655\uC778: "Not verified" };
    TEST = { \uD1B5\uACFC: "passed", \uC2E4\uD328: "failed", \uBBF8\uC2E4\uD589: "not run" };
    EVIDENCE = { \uBC1C\uACAC: "found", "\uC77C\uBD80 \uBC1C\uACAC": "partly found", \uBBF8\uBC1C\uACAC: "not found" };
    RELATION = { \uC77C\uCE58: "same", \uBD88\uC77C\uCE58: "differ", "\uBE44\uAD50 \uC870\uAC74 \uB2E4\uB984": "not comparable", "\uB2E8\uC77C \uACB0\uACFC": "single result" };
    JUDGE = { \uC0AC\uC6A9: "Use", \uC218\uC815: "Fix", "\uCD94\uAC00 \uAC80\uC99D": "Verify more", \uBCF4\uB958: "Hold", \uBBF8\uAC80\uD1A0: "Not reviewed" };
    wOverall = (s) => cur === "en" ? OVERALL[s] ?? s : s;
    wTest = (s) => cur === "en" ? TEST[s] ?? s : s;
    wEvidence = (s) => cur === "en" ? EVIDENCE[s] ?? s : s;
    wRelation = (s) => cur === "en" ? RELATION[s] ?? s : s;
    wJudge = (s) => cur === "en" ? JUDGE[s] ?? s : s;
    JUDGE_LABELS = () => Object.fromEntries(Object.keys(JUDGE).map((k) => [k, wJudge(k)]));
    testPhrase = (s) => cur === "en" ? s === "\uD1B5\uACFC" ? "tests pass" : s === "\uC2E4\uD328" ? "a test fails" : "no test run" : `\uAC80\uC0AC ${s}`;
    setLabel = (key) => cur === "en" ? `Result ${key}` : `\uACB0\uACFC ${key}`;
    joinNames = (xs) => cur === "en" ? xs.join(" and ") : xs.join("\xB7");
  }
});

// src/analyze.ts
import ts from "typescript";
function analyzeFile(file, content, changed) {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const units2 = [];
  const dyn = [];
  const flows = [];
  let seq = 0;
  const isChanged = (a, b) => {
    if (!changed) return true;
    for (let l = a; l <= b; l++) if (changed.has(l)) return true;
    return false;
  };
  const methodCount = /* @__PURE__ */ new Map();
  const countMethods = (n) => {
    if (ts.isClassDeclaration(n)) {
      for (const m of n.members) if (ts.isMethodDeclaration(m) && m.name) methodCount.set(m.name.getText(sf), (methodCount.get(m.name.getText(sf)) ?? 0) + 1);
    }
    ts.forEachChild(n, countMethods);
  };
  countMethods(sf);
  const fnName = (n) => {
    if (ts.isMethodDeclaration(n) && n.name) {
      const m = n.name.getText(sf);
      return (methodCount.get(m) ?? 0) > 1 && ts.isClassDeclaration(n.parent) && n.parent.name ? `${n.parent.name.text}.${m}` : m;
    }
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.getText(sf);
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isPropertyAssignment(p)) return p.name.getText(sf);
    }
    return null;
  };
  const isTerminal = (s) => ts.isThrowStatement(s) || ts.isReturnStatement(s);
  const FIXED_CASE = /['"`](?:fixed|flat|amount)['"`]/i;
  const fixedKind = (ret) => {
    const e = ret ? ret.getText(sf) : "";
    if (/\/\s*100\b|\*\s*0\.\d/.test(e)) return "percent";
    if (/(?:^|[\s(])[\w.]+\s*-\s*[\w.]+/.test(e)) return "subtract";
    return void 0;
  };
  const stmtsOf = (s) => ts.isBlock(s) ? s.statements : [s];
  const constants = {};
  const conflicted = /* @__PURE__ */ new Set();
  const imports = {};
  const reexports = { all: [], named: {} };
  const seen = /* @__PURE__ */ new Set();
  const unwrap = (e) => {
    let x = e;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    return x;
  };
  const lookup = (name) => conflicted.has(name) ? void 0 : constants[name];
  const evalNum = (e0) => {
    const e = unwrap(e0);
    if (ts.isNumericLiteral(e)) return Number(e.text.replace(/_/g, ""));
    if (ts.isPrefixUnaryExpression(e)) {
      const v = evalNum(e.operand);
      if (v === void 0) return void 0;
      return e.operator === ts.SyntaxKind.MinusToken ? -v : e.operator === ts.SyntaxKind.PlusToken ? v : void 0;
    }
    if (ts.isBinaryExpression(e)) {
      const a = evalNum(e.left);
      const b = evalNum(e.right);
      if (a === void 0 || b === void 0) return void 0;
      switch (e.operatorToken.kind) {
        case ts.SyntaxKind.AsteriskToken:
          return a * b;
        case ts.SyntaxKind.AsteriskAsteriskToken:
          return a ** b;
        case ts.SyntaxKind.PlusToken:
          return a + b;
        case ts.SyntaxKind.MinusToken:
          return a - b;
        case ts.SyntaxKind.SlashToken:
          return b ? a / b : void 0;
        default:
          return void 0;
      }
    }
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return lookup(e.getText(sf));
    if (ts.isCallExpression(e) && e.expression.getText(sf) === "Math.pow" && e.arguments.length === 2) {
      const a = evalNum(e.arguments[0]);
      const b = evalNum(e.arguments[1]);
      return a === void 0 || b === void 0 ? void 0 : a ** b;
    }
    return void 0;
  };
  const isPureNum = (e0) => {
    const e = unwrap(e0);
    if (ts.isNumericLiteral(e)) return true;
    if (ts.isPrefixUnaryExpression(e)) return isPureNum(e.operand);
    return ts.isBinaryExpression(e) && evalNum(e) !== void 0 && isPureNum(e.left) && isPureNum(e.right);
  };
  const setConst = (name, v) => {
    if (name in constants && constants[name] !== v) conflicted.add(name);
    constants[name] = v;
  };
  const setObject = (prefix, o) => {
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) continue;
      const key = `${prefix}.${p.name.text}`;
      const init = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(init)) setObject(key, init);
      else {
        const v = evalNum(init);
        if (v !== void 0) setConst(key, v);
      }
    }
  };
  const collectConstants = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.getCombinedNodeFlags(n) & ts.NodeFlags.Const) {
      const init = unwrap(n.initializer);
      if (ts.isObjectLiteralExpression(init)) setObject(n.name.text, init);
      else {
        const v = evalNum(init);
        if (v !== void 0) setConst(n.name.text, v);
      }
    } else if (ts.isPropertyDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && ts.isClassLike(n.parent) && ts.getCombinedModifierFlags(n) & (ts.ModifierFlags.Readonly | ts.ModifierFlags.Static)) {
      const v = evalNum(n.initializer);
      if (v !== void 0) {
        setConst(`this.${n.name.text}`, v);
        if (n.parent.name) setConst(`${n.parent.name.text}.${n.name.text}`, v);
      }
    } else if (ts.isEnumMember(n) && n.initializer && ts.isIdentifier(n.name)) {
      const v = evalNum(n.initializer);
      if (v !== void 0) setConst(`${n.parent.name.text}.${n.name.text}`, v);
    } else if (ts.isParameter(n) && n.initializer && ts.isIdentifier(n.name)) {
      const v = evalNum(n.initializer);
      if (v !== void 0) setConst(n.name.text, v);
    } else if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.importClause?.namedBindings) {
      const from = n.moduleSpecifier.text;
      const b = n.importClause.namedBindings;
      if (ts.isNamespaceImport(b)) imports[b.name.text] = { from, name: "*" };
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
  collectConstants(sf);
  collectConstants(sf);
  const CMP = {
    [ts.SyntaxKind.GreaterThanToken]: ">",
    [ts.SyntaxKind.GreaterThanEqualsToken]: ">=",
    [ts.SyntaxKind.LessThanToken]: "<",
    [ts.SyntaxKind.LessThanEqualsToken]: "<=",
    [ts.SyntaxKind.EqualsEqualsEqualsToken]: "===",
    [ts.SyntaxKind.EqualsEqualsToken]: "===",
    [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!==",
    [ts.SyntaxKind.ExclamationEqualsToken]: "!=="
  };
  const FLIP = { ">": "<", ">=": "<=", "<": ">", "<=": ">=", "===": "===", "!==": "!==" };
  const NOT = { ">": "<=", ">=": "<", "<": ">=", "<=": ">", "===": "!==", "!==": "===" };
  const isCmp = (n) => ts.isBinaryExpression(n) && CMP[n.operatorToken.kind] !== void 0;
  const isFnLike = (n) => ts.isFunctionLike(n);
  const counterOrder = (target, at, fnBody) => {
    if (!fnBody) return null;
    let before = false;
    let after = false;
    const scan = (n) => {
      let hit = false;
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.PlusPlusToken && n.operand.getText(sf) === target) hit = true;
      if (ts.isBinaryExpression(n) && n.left.getText(sf) === target) {
        if (n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken && ts.isNumericLiteral(n.right) && n.right.text === "1") hit = true;
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
  const insideCatch = (n) => {
    for (let p = n.parent; p && !isFnLike(p); p = p.parent) if (ts.isCatchClause(p)) return true;
    return false;
  };
  const hasCall = (n) => {
    if (ts.isThrowStatement(n)) return false;
    if (ts.isCallExpression(n) || ts.isAwaitExpression(n)) return true;
    return !!ts.forEachChild(n, (c) => hasCall(c) ? true : void 0);
  };
  const actionFollows = (at) => {
    let s = at;
    while (s.parent && !ts.isBlock(s.parent) && !ts.isSourceFile(s.parent)) s = s.parent;
    const list2 = s.parent && (ts.isBlock(s.parent) || ts.isSourceFile(s.parent)) ? s.parent.statements : null;
    if (!list2) return false;
    const i = list2.indexOf(s);
    return list2.slice(i + 1).some(hasCall);
  };
  const addsAfter = (left, at, fnBody) => {
    const target = left.replace(/\.(?:length|size|count)(?:\(\))?$/, "");
    if (target === left || !fnBody) return false;
    let found = false;
    const scan = (n) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.pos >= at.pos && n.expression.expression.getText(sf) === target && /^(?:push|unshift|add|set|append|insert)$/.test(n.expression.name.text)) found = true;
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return found;
  };
  const initOf = (name, fnBody) => {
    if (!fnBody || !/^[A-Za-z_$][\w$]*$/.test(name)) return void 0;
    let init;
    const scan = (n) => {
      if (!init && ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) init = n.initializer;
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return init;
  };
  const countedBeforeAdd = (left, at, fnBody) => {
    const init = initOf(left, fnBody);
    if (!init || !fnBody) return false;
    let e = unwrap(init);
    if (ts.isAwaitExpression(e)) e = unwrap(e.expression);
    if (ts.isPropertyAccessExpression(e) && /^(?:length|size)$/.test(e.name.text)) {
      let src = e.expression;
      while (ts.isCallExpression(src) && ts.isPropertyAccessExpression(src.expression) && /^(?:filter|slice|map|concat)$/.test(src.expression.name.text)) src = src.expression.expression;
      return addsAfter(`${src.getText(sf)}.length`, at, fnBody);
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && /^(?:count|countDocuments)$/.test(e.expression.name.text)) {
      const model = e.expression.expression.getText(sf);
      let found = false;
      const scan = (n) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.pos >= at.pos && n.expression.expression.getText(sf) === model && /^(?:create|insert|insertOne|save|add)$/.test(n.expression.name.text)) found = true;
        ts.forEachChild(n, scan);
      };
      scan(fnBody);
      return found;
    }
    return false;
  };
  const TIMED = /\bnow\b\s*-|Date\.now\(\)\s*-|getTime\(\)\s*-|isSame(?:Day|Hour|Week|Month)|startOf|toDateString|\bsince\b|\btoday\b|sub(?:Days|Hours|Minutes|Weeks|Months)\b|86400|3600|60\s*\*\s*60|24\s*\*\s*60/;
  const timedCount = (left, fnBody) => {
    const init = initOf(left.replace(/\.(?:length|size)$/, ""), fnBody);
    return !!init && (TIMED.test(init.getText(sf)) || !!calendarOf(left, fnBody));
  };
  const CALENDAR = [
    [/isSameHour|startOfHour|getHours\(\)\s*===/, "hour"],
    [/isSameDay|startOfDay|isToday|toDateString\(\)\s*===|getDate\(\)\s*===/, "day"],
    [/isSameWeek|startOfWeek|isThisWeek/, "week"],
    [/isSameMonth|startOfMonth|isThisMonth|getMonth\(\)\s*===/, "month"]
  ];
  const calendarOf = (left, fnBody) => {
    const init = initOf(left.replace(/\.(?:length|size)$/, ""), fnBody);
    if (!init) return void 0;
    const text = init.getText(sf);
    return CALENDAR.find(([re]) => re.test(text))?.[1];
  };
  const derivedFrom = (left, fnBody) => {
    const name = left.replace(/\.(?:length|size)$/, "");
    if (name === left || !fnBody || !/^[A-Za-z_$][\w$]*$/.test(name)) return void 0;
    let src;
    const scan = (n) => {
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
    return src && src !== name ? src : void 0;
  };
  const rejects = (s) => stmtsOf(s).some((x) => ts.isThrowStatement(x) || ts.isReturnStatement(x) && (!x.expression || x.expression.kind === ts.SyntaxKind.FalseKeyword || x.expression.kind === ts.SyntaxKind.NullKeyword));
  const countdownStart = (name, fnBody) => {
    if (!fnBody) return void 0;
    let start;
    let down = false;
    const scan = (n) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) start = evalNum(n.initializer);
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.MinusMinusToken && n.operand.getText(sf) === name) down = true;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken && n.left.getText(sf) === name && evalNum(n.right) === 1) down = true;
      ts.forEachChild(n, scan);
    };
    scan(fnBody);
    return down ? start : void 0;
  };
  const lenKind = /* @__PURE__ */ new Map();
  const visitDecl = (n) => {
    if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) && ts.isIdentifier(n.name)) {
      const type = n.type;
      const init = ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n) ? n.initializer : void 0;
      const strType = (t) => t.kind === ts.SyntaxKind.StringKeyword || ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) || ts.isUnionTypeNode(t) && t.types.some(strType) && t.types.every((x) => strType(x) || x.kind === ts.SyntaxKind.UndefinedKeyword || ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword);
      const listType = (t) => ts.isArrayTypeNode(t) || ts.isTupleTypeNode(t) || ts.isTypeReferenceNode(t) && /^(?:Array|ReadonlyArray)$/.test(t.typeName.getText(sf));
      let kind;
      if (type) kind = strType(type) ? "str" : listType(type) ? "list" : "other";
      else if (init) kind = ts.isStringLiteralLike(init) || ts.isTemplateExpression(init) ? "str" : ts.isArrayLiteralExpression(init) ? "list" : void 0;
      if (kind !== void 0 && !lenKind.has(n.name.text)) lenKind.set(n.name.text, kind);
    }
    ts.forEachChild(n, visitDecl);
  };
  visitDecl(sf);
  const STRINGY = /^(?:name|\w+Name|pw|pwd|password|passwd|passcode|otp|pin|text|\w+Text|title|username|nickname|email|phone|slug|message|msg|memo|label|keyword|description|content)$/;
  const LISTY = /^(?:items|list|rows|entries|tags|files|users|people|members|children|results|values|keys|ids|records|orders|products|messages|comments|attempts|requests|lines)$/;
  const lengthKind = (left) => {
    const m = left.match(/(?:^|\.)([A-Za-z_$][\w$]*)\.length$/);
    if (!m) return void 0;
    const k = lenKind.get(m[1]);
    if (k === "str" || k === "list") return k;
    if (k === "other") return void 0;
    return STRINGY.test(m[1]) ? "str" : LISTY.test(m[1]) ? "list" : void 0;
  };
  const partOf = (e, negated, ctx) => {
    let op = CMP[e.operatorToken.kind];
    let l = unwrap(e.left);
    let r = unwrap(e.right);
    if (isPureNum(l) && isPureNum(r)) return null;
    if (isPureNum(l) || evalNum(r) === void 0 && evalNum(l) !== void 0) {
      [l, r] = [r, l];
      op = FLIP[op];
    }
    const lit = evalNum(r);
    let ref;
    if (lit === void 0) {
      if (op === "===" || op === "!==") return null;
      if (ts.isStringLiteralLike(r) || r.kind === ts.SyntaxKind.NullKeyword || r.kind === ts.SyntaxKind.TrueKeyword || r.kind === ts.SyntaxKind.FalseKeyword) return null;
      ref = clip(r.getText(sf), 50);
    }
    if (negated) op = NOT[op];
    if ((ts.isPostfixUnaryExpression(l) || ts.isPrefixUnaryExpression(l)) && l.operator === ts.SyntaxKind.MinusMinusToken) l = l.operand;
    const left = l.getText(sf);
    const down = ctx.inLoopHead && ctx.loopVar === void 0 ? countdownStart(left, ctx.fnBody) : void 0;
    const loop = down !== void 0 || ctx.loopVar !== void 0 && left === ctx.loopVar;
    if (down !== void 0) ctx = { ...ctx, loopStart: down };
    const src = derivedFrom(left, ctx.fnBody);
    return {
      expr: clip(e.getText(sf), 80),
      left: src ? `${left} (${src})` : left,
      op,
      lit,
      ref,
      line: line(e.getStart(sf)),
      source: loop ? "loop" : "compare",
      incBefore: loop ? null : counterOrder(left, ctx.at, ctx.fnBody),
      preAdd: addsAfter(left, ctx.at, ctx.fnBody) || !!src && addsAfter(`${src}.length`, ctx.at, ctx.fnBody) || countedBeforeAdd(left, ctx.at, ctx.fnBody),
      ...timedCount(left, ctx.fnBody) ? { timed: true } : {},
      ...calendarOf(left, ctx.fnBody) ? { calendar: calendarOf(left, ctx.fnBody) } : {},
      inCatch: insideCatch(ctx.at),
      actionAfter: actionFollows(ctx.at),
      thenKind: ctx.reject ? "reject" : null,
      loopStart: loop ? ctx.loopStart : void 0,
      ...lengthKind(left) === "str" ? { strLen: true } : lengthKind(left) === "list" ? { listLen: true } : {}
    };
  };
  const collectParts = (e0, negated, ctx, out) => {
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
  const andTermsOf = (e0) => {
    const e = unwrap(e0);
    return ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [...andTermsOf(e.left), ...andTermsOf(e.right)] : [e.getText(sf)];
  };
  const buildCond = (expr, ctx) => {
    const parts = [];
    collectParts(expr, false, ctx, parts);
    const terms = andTermsOf(expr);
    return { expr: clip(expr.getText(sf), 80), parts, andTerms: terms.length > 1 ? terms : void 0, single: isCmp(unwrap(expr)) };
  };
  const summarize2 = (stmts) => {
    const first = clip(stmts[0].getText(sf).replace(/;$/, ""), 34);
    return stmts.length > 1 ? `${first} ${L("\uC678", "+")} ${stmts.length - 1}` : first;
  };
  const buildFlow = (name, fn) => {
    const nodes = [];
    const edges = [];
    let truncated = false;
    let merges = [];
    const norm = (t) => t.replace(/;$/, "").replace(/\s+/g, " ").trim();
    const add = (kind, label, n, col, row, stmts = []) => {
      if (nodes.length >= MAX_FLOW_NODES) {
        truncated = true;
        return -1;
      }
      nodes.push({ id: nodes.length, kind, label, stmts, line: line(n.getStart(sf)), endLine: line(n.getEnd()), col, row });
      return nodes.length - 1;
    };
    const link = (from, to, label) => {
      if (to < 0) return;
      if (from !== null && from >= 0) edges.push({ from, to, label });
      for (const m of merges) if (m >= 0 && m !== from) edges.push({ from: m, to, back: true });
      merges = [];
    };
    const walk = (stmts, col, row, prev, prevLabel) => {
      let cur2 = prev;
      let label = prevLabel;
      let r = row;
      let pending = [];
      let terminal = false;
      const flush = () => {
        if (!pending.length) return;
        const id = add("step", summarize2(pending), pending[0], col, r, pending.map((p) => norm(p.getText(sf))));
        link(cur2, id, label);
        if (id >= 0) cur2 = id;
        label = void 0;
        r += 1;
        pending = [];
      };
      for (const s of stmts) {
        if (truncated) break;
        if (ts.isIfStatement(s)) {
          flush();
          const d = add("decision", clip(s.expression.getText(sf), 30), s, col, r, [`if (${norm(s.expression.getText(sf))})`]);
          link(cur2, d, label);
          label = void 0;
          if (d < 0) break;
          const res = walk(stmtsOf(s.thenStatement), col + 1, r, d, L("\uC608", "yes"));
          cur2 = d;
          label = L("\uC544\uB2C8\uC624", "no");
          if (!res.terminal && res.last !== null) merges.push(res.last);
          r = Math.max(r + 1, res.nextRow);
        } else if (isTerminal(s)) {
          flush();
          const id = add("end", clip(s.getText(sf).replace(/;$/, ""), 34), s, col, r, [norm(s.getText(sf))]);
          link(cur2, id, label);
          r += 1;
          cur2 = id;
          terminal = true;
          break;
        } else {
          pending.push(s);
        }
      }
      if (!terminal) flush();
      return { last: cur2, nextRow: r, terminal };
    };
    const start = add("start", `${name}()`, fn, 0, 0);
    walk(fn.body.statements, 0, 1, start);
    return { fn: name, file, startLine: line(fn.getStart(sf)), endLine: line(fn.getEnd()), nodes, edges, truncated };
  };
  const visitFn = (fn, name) => {
    const body = fn.body && ts.isBlock(fn.body) ? fn.body : null;
    const startLine = line(fn.getStart(sf));
    const endLine = line(fn.getEnd());
    const bodyText = fn.getText(sf);
    const calls = /* @__PURE__ */ new Set();
    const refs = /* @__PURE__ */ new Set();
    const scanCalls = (n) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        if (ts.isIdentifier(e)) calls.add(e.text);
        else if (ts.isPropertyAccessExpression(e)) calls.add(e.name.text);
      }
      if (ts.isIdentifier(n)) refs.add(n.text);
      ts.forEachChild(n, scanCalls);
    };
    if (fn.body) scanCalls(fn.body);
    units2.push({
      id: `${file}#fn${seq++}`,
      kind: "function",
      file,
      fn: name,
      startLine,
      endLine,
      text: clip(bodyText.split("\n")[0], 90),
      tokens: [...new Set(tokenize(name + " " + bodyText))],
      guard: false,
      changed: isChanged(startLine, endLine),
      calls: [...calls],
      refs: [...refs]
    });
    if (body) flows.push(buildFlow(name, fn));
  };
  const addCond = (n, cur2, text, sl, el, guard, cond) => {
    units2.push({
      id: `${file}#c${seq++}`,
      kind: "condition",
      file,
      fn: cur2?.name ?? L("(\uCD5C\uC0C1\uC704)", "(top level)"),
      startLine: sl,
      endLine: el,
      text: clip(text, 120),
      tokens: [...new Set(tokenize(text))],
      guard,
      changed: isChanged(sl, el),
      cond
    });
  };
  const enclosing = (n) => {
    let p = n;
    while (p.parent && !ts.isStatement(p) && !ts.isPropertyAssignment(p) && !ts.isSourceFile(p.parent)) p = p.parent;
    return p;
  };
  const ownerName = (n) => {
    for (let p = n.parent; p && !ts.isStatement(p); p = p.parent) {
      if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return p.name.getText(sf);
      if (ts.isVariableDeclaration(p)) return p.name.getText(sf);
    }
    return n.getText(sf).split(".")[0];
  };
  const SCHEMA_OP = { min: ">=", minLength: ">=", gte: ">=", gt: ">", max: "<=", maxLength: "<=", lte: "<=", lt: "<" };
  const simplePartBase = (n, left, op) => ({ expr: clip(n.getText(sf), 80), left, op, line: line(n.getStart(sf)), source: "schema", incBefore: null, preAdd: false, inCatch: false, actionAfter: false, thenKind: null });
  const simplePart = (n, left, op, value, source) => {
    const lit = evalNum(value);
    const v = unwrap(value);
    if (lit === void 0 && !ts.isIdentifier(v) && !ts.isPropertyAccessExpression(v)) return null;
    return { ...simplePartBase(n, left, op), lit, ref: lit === void 0 ? clip(v.getText(sf), 50) : void 0, source };
  };
  const callPart = (n) => {
    if (ts.isIdentifier(n.expression)) {
      const callee2 = n.expression.text;
      if (/^(?:setTimeout|setInterval)$/.test(callee2) && n.arguments.length >= 2) return simplePart(n, `${ownerName(n)} ${callee2}`, "===", n.arguments[1], "config");
      if (/^(?:sleep|delay|wait)$/.test(callee2) && n.arguments.length === 1) return simplePart(n, `${ownerName(n)} ${callee2}`, "===", n.arguments[0], "config");
      const op = SCHEMA_OP[callee2[0].toLowerCase() + callee2.slice(1)];
      if (op && ts.isDecorator(n.parent) && n.arguments.length >= 1) return simplePart(n, ownerName(n.parent), op, n.arguments[0], "schema");
      return null;
    }
    if (!ts.isPropertyAccessExpression(n.expression)) return null;
    const name = n.expression.name.text;
    const recv = n.expression.expression;
    const a = n.arguments;
    if (ts.isIdentifier(recv) && recv.text === "Math" && a.length === 2 && (name === "min" || name === "max")) {
      const numeric = evalNum(a[1]) !== void 0 ? 1 : evalNum(a[0]) !== void 0 ? 0 : -1;
      if (numeric < 0) return null;
      return simplePart(n, `${ownerName(n)} ${a[1 - numeric].getText(sf)}`, name === "min" ? "<=" : ">=", a[numeric], "cap");
    }
    if (name === "slice" && a.length === 2 && evalNum(a[0]) === 0) return simplePart(n, `${recv.getText(sf)} ${ownerName(n)}`, "<=", a[1], "cap");
    if ((name === "limit" || name === "take") && a.length === 1) return simplePart(n, `${recv.getText(sf)} ${ownerName(n)}`, "<=", a[0], "cap");
    if (SCHEMA_OP[name] && a.length >= 1) return simplePart(n, `${ownerName(n)} ${recv.getText(sf)}`, SCHEMA_OP[name], a[0], "schema");
    return null;
  };
  const CONFIG_NAME = /retr|attempt|timeout|ttl|expire|age|window|delay|interval|duration|limit|size|count|capacity|lifetime|max|length|quota|threshold|period|day|hour|minute|second(?!ary)|week|month|year|rate|ratio|percent|pct|fee|tax|vat|commission|discount|interest|coupon|voucher/i;
  const durationSeconds = (e0) => {
    const e = unwrap(e0);
    if (!ts.isStringLiteralLike(e)) return void 0;
    const m = e.text.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|week|weeks)$/i);
    if (!m) return void 0;
    const unit = m[2][0].toLowerCase();
    return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit];
  };
  const UNIT_CONSTANT = /^(?:one_?|(?:ms|msecs?|millis(?:econds)?|secs?|seconds?)_?(?:per|in)_?)?(?:second|minute|hour|day|week|month|year)s?(?:_?(?:in_?)?(?:ms|msecs?|millis(?:econds)?|secs?|seconds?))?$/i;
  const configPart = (n, name, value0) => {
    if (!CONFIG_NAME.test(name) || UNIT_CONSTANT.test(name.split(".").pop())) return null;
    let value = unwrap(value0);
    if (ts.isBinaryExpression(value) && (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || value.operatorToken.kind === ts.SyntaxKind.BarBarToken)) value = value.right;
    const secs = durationSeconds(value);
    if (secs !== void 0) return { ...simplePartBase(n, name, "==="), lit: secs, source: "config", secs: true };
    return evalNum(value) === void 0 ? null : simplePart(n, name, "===", value, "config");
  };
  const propertyPart = (n) => {
    const name = n.name.getText(sf).replace(/['"]/g, "");
    const timeLike = /age|time|wait|duration|delay/i.test(name);
    if (evalNum(n.initializer) !== void 0 && !timeLike) {
      if (/^min/i.test(name)) return simplePart(n, name, ">=", n.initializer, "schema");
      if (/^(?:max|limit$)/i.test(name)) return simplePart(n, name, "<=", n.initializer, "schema");
    }
    return configPart(n, name, n.initializer);
  };
  const isDefaultAssign = (n) => ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken || n.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken || n.operatorToken.kind === ts.SyntaxKind.EqualsToken);
  const walkNode = (n, fnStack) => {
    const name = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) ? fnName(n) : null;
    let stack = fnStack;
    if (name) {
      const f = n;
      visitFn(f, name);
      stack = [...fnStack, { name, body: f.body ?? null }];
    }
    const cur2 = stack[stack.length - 1];
    const fnBody = cur2?.body ?? null;
    if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
      const cond = ts.isIfStatement(n) ? n.expression : n.condition;
      const consequent = ts.isIfStatement(n) ? stmtsOf(n.thenStatement) : [];
      const sl = line(n.getStart(sf));
      const el = ts.isIfStatement(n) ? line(n.thenStatement.getEnd()) : line(n.getEnd());
      const guard = consequent.some(isTerminal);
      const text = ts.isIfStatement(n) ? n.getText(sf).slice(0, n.thenStatement.getEnd() - n.getStart(sf)) : n.getText(sf);
      const info2 = buildCond(cond, { at: n, fnBody, reject: ts.isIfStatement(n) && rejects(n.thenStatement) });
      if (FIXED_CASE.test(cond.getText(sf))) {
        const ret = ts.isIfStatement(n) ? consequent.find(ts.isReturnStatement)?.expression : n.whenTrue;
        const fb = fixedKind(ret);
        if (fb) info2.fixedBranch = fb;
      }
      addCond(n, cur2, text, sl, el, guard, info2);
    } else if (ts.isPropertyAssignment(n) && /^['"`]?(?:fixed|flat|amount)['"`]?$/i.test(n.name.getText(sf)) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      const f = n.initializer;
      const body = f.body;
      const ret = ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : body;
      const fb = fixedKind(ret);
      if (fb) {
        const sl = line(n.getStart(sf));
        addCond(n, cur2, `${cur2?.name ?? ""} ${clip(n.getText(sf), 200)}`, sl, line(n.getEnd()), true, { expr: `${n.name.getText(sf)}: ${clip(ret.getText(sf), 60)}`, fixedBranch: fb });
      }
    } else if (ts.isCaseClause(n) && FIXED_CASE.test(n.expression.getText(sf))) {
      const fb = fixedKind(n.statements.find(ts.isReturnStatement)?.expression);
      if (fb) {
        const sl = line(n.getStart(sf));
        const subject = ts.isSwitchStatement(n.parent.parent) ? n.parent.parent.expression.getText(sf) : "switch";
        addCond(n, cur2, `${subject} ${clip(n.getText(sf), 200)}`, sl, line(n.getEnd()), true, { expr: `${subject} === ${n.expression.getText(sf)}`, fixedBranch: fb });
      }
    } else if (ts.isWhileStatement(n) || ts.isDoStatement(n)) {
      const sl = line(n.expression.getStart(sf));
      addCond(n, cur2, n.getText(sf), sl, sl, false, buildCond(n.expression, { at: n, fnBody, reject: false, inLoopHead: true }));
    } else if (ts.isForStatement(n) && n.condition) {
      let loopVar;
      let loopStart;
      if (n.initializer && ts.isVariableDeclarationList(n.initializer) && n.initializer.declarations.length === 1) {
        const d = n.initializer.declarations[0];
        if (ts.isIdentifier(d.name) && d.initializer) {
          loopVar = d.name.text;
          loopStart = evalNum(d.initializer);
        }
      }
      if (loopStart === void 0) loopVar = void 0;
      const sl = line(n.getStart(sf));
      addCond(n, cur2, n.getText(sf), sl, sl, false, buildCond(n.condition, { at: n, fnBody, reject: false, loopVar, loopStart }));
    } else if (isCmp(n) && !seen.has(n)) {
      const cond = buildCond(n, { at: n, fnBody, reject: false });
      if (cond.parts?.length) {
        const host = enclosing(n);
        const sl = line(n.getStart(sf));
        addCond(n, cur2, `${cur2?.name ?? ""} ${host.getText(sf)}`, sl, sl, false, cond);
      }
    } else if (ts.isCallExpression(n) || ts.isPropertyAssignment(n) || (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer && ts.isIdentifier(n.name) || isDefaultAssign(n)) {
      const p = ts.isCallExpression(n) ? callPart(n) : ts.isPropertyAssignment(n) ? propertyPart(n) : ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n) ? configPart(n, n.name.text, n.initializer) : configPart(n, n.left.getText(sf), n.right);
      if (p) {
        let st = n;
        while (st.parent && !ts.isStatement(st) && !ts.isClassElement(st) && !ts.isSourceFile(st.parent)) st = st.parent;
        addCond(n, cur2, `${cur2?.name ?? ""} ${clip(st.getText(sf), 400)}`, p.line, p.line, false, { expr: p.expr, parts: [p], single: false });
      }
    }
    if (ts.isCallExpression(n)) {
      const callee2 = n.expression;
      if (ts.isElementAccessExpression(callee2) || ts.isIdentifier(callee2) && callee2.text === "eval") {
        dyn.push({ file, line: line(n.getStart(sf)), text: clip(n.getText(sf), 60) });
      }
    }
    ts.forEachChild(n, (c) => walkNode(c, stack));
  };
  walkNode(sf, []);
  for (const k of conflicted) delete constants[k];
  for (const u of units2) if (u.cond) syncPrimary(u.cond);
  const fields = [];
  const STRING_CHECK = /* @__PURE__ */ new Set(["email", "url", "uuid", "cuid", "cuid2", "ulid", "regex", "matches", "pattern", "min", "max", "length", "nonempty", "startsWith", "endsWith", "includes", "refine", "superRefine", "ip", "datetime", "emoji"]);
  const FORMAT_CHECK = /* @__PURE__ */ new Set(["email", "url", "uuid", "cuid", "cuid2", "ulid", "regex", "matches", "pattern", "ip", "datetime", "emoji"]);
  const schemaName = (n) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    return L("(\uCD5C\uC0C1\uC704)", "(top level)");
  };
  const DECO_FORMAT = /^(?:IsEmail|IsUrl|IsURL|IsUUID|Matches|IsPhoneNumber|IsMobilePhone|IsISO8601|IsDateString|IsAlphanumeric|IsNumberString|IsPostalCode|IsHexColor|IsIP|IsJWT)$/;
  const DECO_LENGTH = /^(?:MinLength|MaxLength|Length)$/;
  const visitDecorated = (n) => {
    const decos2 = ts.canHaveDecorators(n) ? ts.getDecorators(n) ?? [] : [];
    if (!decos2.length) return;
    const calls = decos2.map((d) => d.expression).filter(ts.isCallExpression).filter((c) => ts.isIdentifier(c.expression));
    const names = calls.map((c) => c.expression.text);
    const l = line(n.getStart(sf));
    if (!isChanged(l, line(n.getEnd()))) return;
    const name = n.name.getText(sf);
    const stringy = names.includes("IsString") || n.type?.getText(sf) === "string";
    if (stringy) fields.push({ file, line: l, name, checked: names.some((x) => DECO_FORMAT.test(x) || DECO_LENGTH.test(x)) });
    if (!names.some((x) => DECO_FORMAT.test(x) || x === "Length")) return;
    const parts = [];
    for (const c of calls) {
      const arg = c.arguments[0];
      if (c.expression.text === "Length" && arg) {
        const lo = evalNum(arg);
        const hi = c.arguments[1] ? evalNum(c.arguments[1]) : void 0;
        if (lo !== void 0 && hi === lo) parts.push({ ...simplePartBase(c, `${name} length`, "==="), lit: lo, strLen: true });
        else {
          if (lo !== void 0) parts.push({ ...simplePartBase(c, `${name} length`, ">="), lit: lo, strLen: true });
          if (hi !== void 0) parts.push({ ...simplePartBase(c, `${name} length`, "<="), lit: hi, strLen: true });
        }
        continue;
      }
      if (c.expression.text !== "Matches" || !arg || !ts.isRegularExpressionLiteral(arg)) continue;
      const m = arg.text.match(/^\/\^(?:\\d|\[0-9\])\{(\d+)\}\$\/[a-z]*$/);
      if (m) parts.push({ ...simplePartBase(c, `${name} length`, "==="), lit: Number(m[1]), strLen: true });
    }
    let host = L("(\uCD5C\uC0C1\uC704)", "(top level)");
    for (let p = n.parent; p; p = p.parent) if (ts.isClassDeclaration(p) && p.name) {
      host = p.name.text;
      break;
    }
    const text = n.getText(sf);
    const cond = { expr: clip(text.replace(/\s+/g, " "), 80), parts, single: parts.length === 1 };
    syncPrimary(cond);
    units2.push({ id: `${file}#d${seq++}`, kind: "condition", file, fn: host, startLine: l, endLine: line(n.getEnd()), text: clip(text.replace(/\s+/g, " "), 120), tokens: [...new Set(tokenize(`${host} ${text}`))], guard: true, changed: true, cond });
  };
  const visitFields = (n) => {
    if (ts.isPropertyDeclaration(n)) visitDecorated(n);
    if (ts.isPropertyAssignment(n) && ts.isCallExpression(n.initializer)) {
      const calls = [];
      const callNodes = [];
      let e = n.initializer;
      while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        calls.push(e.expression.name.text);
        callNodes.push(e);
        e = e.expression.expression;
      }
      const l = line(n.getStart(sf));
      if (calls.at(-1) === "string" && ts.isIdentifier(e) && /^(z|yup|joi|Joi)$/.test(e.text) && isChanged(l, l)) {
        const name = n.name.getText(sf).replace(/['"`]/g, "");
        fields.push({ file, line: l, name, checked: calls.slice(0, -1).some((c) => STRING_CHECK.has(c)) });
        if (calls.some((c) => FORMAT_CHECK.has(c))) {
          const parts = [];
          for (const c of callNodes) {
            const arg = c.arguments[0];
            if (!/^(?:regex|matches|pattern)$/.test(c.expression.name.text) || !arg || !ts.isRegularExpressionLiteral(arg)) continue;
            const m = arg.text.match(/^\/\^(?:\\d|\[0-9\])\{(\d+)\}\$\/[a-z]*$/);
            if (m) parts.push({ ...simplePartBase(c, `${name} length`, "==="), lit: Number(m[1]), strLen: true });
          }
          const text = n.getText(sf);
          const host = schemaName(n);
          const cond = { expr: clip(text, 80), parts, single: parts.length === 1 };
          syncPrimary(cond);
          units2.push({ id: `${file}#s${seq++}`, kind: "condition", file, fn: host, startLine: l, endLine: line(n.getEnd()), text: clip(text, 120), tokens: [...new Set(tokenize(`${host} ${text}`))], guard: true, changed: true, cond });
        }
      }
    }
    ts.forEachChild(n, visitFields);
  };
  visitFields(sf);
  return { file, units: units2, dyn, flows, constants, imports, reexports, fields };
}
function syncPrimary(c) {
  const p = c.single && c.parts?.length === 1 ? c.parts[0] : void 0;
  if (!p || p.lit === void 0 || p.op === "!==") return;
  c.op = p.op;
  c.lit = p.lit;
  c.left = p.left;
  c.firstTrue = p.op === ">=" || p.op === "===" ? p.lit : p.op === ">" ? p.lit + 1 : void 0;
  c.incrementBefore = p.incBefore;
  if (c.firstTrue !== void 0) c.attempts = p.incBefore === null ? null : p.incBefore ? c.firstTrue : c.firstTrue + 1;
}
function resolveRefs(analyses, read, allFiles = []) {
  const known = new Map(analyses.map((a) => [a.file, a]));
  const everyFile = [.../* @__PURE__ */ new Set([...allFiles, ...known.keys()])];
  const load = (file) => {
    if (known.has(file)) return known.get(file);
    const text = read?.(file);
    if (text === null || text === void 0) return null;
    const a = analyzeFile(file, text, null);
    known.set(file, a);
    return a;
  };
  const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", "/index.ts", "/index.js"];
  const open = (from, spec) => {
    if (spec.startsWith(".")) {
      const dir = from.split("/").slice(0, -1).join("/");
      const stem2 = normalizePath(`${dir}/${spec}`).replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, "");
      for (const ext of EXTS) {
        const a = load(stem2 + ext);
        if (a) return a;
      }
      return null;
    }
    const m = spec.match(/^(?:[@~#]\/|[@~#]([\w-]+)\/)(.+)$/);
    if (!m) return null;
    const tail = (m[1] ? `${m[1]}/${m[2]}` : m[2]).replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, "");
    for (const t of m[1] ? [tail, m[2].replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, "")] : [tail]) {
      const hits = EXTS.flatMap((ext) => everyFile.filter((f) => f === t + ext || f.endsWith(`/${t}${ext}`)));
      if (hits.length === 1) return load(hits[0]);
      if (hits.length > 1) return null;
    }
    return null;
  };
  const valueOf = (a, key, depth = 0) => {
    if (a.constants[key] !== void 0) return a.constants[key];
    if (depth >= 4) return void 0;
    const [root, ...rest] = key.split(".");
    const via = a.reexports.named[root] ?? a.imports[root];
    if (via) {
      const t = open(a.file, via.from);
      const v = t && valueOf(t, [via.name, ...rest].join("."), depth + 1);
      if (v !== void 0 && v !== null) return v;
    }
    for (const from of a.reexports.all) {
      const t = open(a.file, from);
      const v = t && valueOf(t, key, depth + 1);
      if (v !== void 0 && v !== null) return v;
    }
    return void 0;
  };
  for (const a of analyses) {
    for (const u of a.units) {
      if (!u.cond?.parts) continue;
      for (const p of u.cond.parts) {
        if (p.lit !== void 0 || !p.ref) continue;
        const [root, ...rest] = p.ref.split(".");
        const imp = a.imports[root];
        if (!imp) continue;
        const target = open(a.file, imp.from);
        if (!target) continue;
        const key = imp.name === "*" ? rest.join(".") : [imp.name, ...rest].join(".");
        const v = valueOf(target, key);
        if (v !== void 0) {
          p.lit = v;
          p.ref = void 0;
        }
      }
      syncPrimary(u.cond);
    }
  }
}
var MAX_FLOW_NODES, normalizePath;
var init_analyze = __esm({
  "src/analyze.ts"() {
    init_tokens();
    init_i18n();
    MAX_FLOW_NODES = 44;
    normalizePath = (p) => {
      const out = [];
      for (const seg of p.split("/")) {
        if (seg === "..") out.pop();
        else if (seg && seg !== ".") out.push(seg);
      }
      return out.join("/");
    };
  }
});

// src/numeric.ts
function readNumber(m) {
  return Number(m[1].replace(/,/g, "")) * (m[2] ? MAGNITUDE[m[2]] : 1);
}
function readUnit(text) {
  const trimmed = text.replace(/^\s+/, "");
  const skip = text.length - trimmed.length;
  for (const [re, kind] of UNITS) {
    const m = trimmed.match(re);
    if (m) return { unit: kind, unitText: m[0], rest: trimmed.slice(m[0].length), skip };
  }
  return { unit: null, unitText: "", rest: text, skip: 0 };
}
function finish(text, value, unit, unitText, rel, raw, soft = false) {
  const scales = unit && SCALES[unit] || [1];
  const negative = NEGATIVE.test(text.replace(ABSORBED, " "));
  let validSide = null;
  if (rel === "gte" || rel === "gt" || rel === "lte" || rel === "lt") {
    if (negative) validSide = rel === "gte" || rel === "gt" ? "lower" : "upper";
    else if (MUST.test(text)) validSide = rel === "gte" || rel === "gt" ? "upper" : "lower";
  }
  return { value, unit, unitText, rel, scales, validSide, raw, soft };
}
function applyEdgeWord(rel, rest) {
  if (/^[\s(,]*(?:exclusive|제외)/i.test(rest)) return rel === "lte" ? "lt" : rel === "gte" ? "gt" : rel;
  if (/^[\s(,]*(?:inclusive|포함)/i.test(rest)) return rel === "lt" ? "lte" : rel === "gt" ? "gte" : rel;
  return rel;
}
function onlyOnce(text, m) {
  return m[1] === "\uD55C" && /^\s*번만/.test(text.slice(m.index + m[0].length)) && !WINDOW.test(text);
}
function makeConstraint(text, value, start, end) {
  const head = text.slice(Math.max(0, start - 30), start);
  const { unit, unitText, rest, skip } = readUnit(text.slice(end));
  let rel = null;
  for (const [re, r] of BEFORE) if (re.test(head)) {
    rel = r;
    break;
  }
  if (!rel) {
    for (const [re, r] of AFTER) if (re.test(rest)) {
      rel = r;
      break;
    }
  }
  if (/\bafter\s*$/i.test(head)) rel = unit === "cnt" ? "count" : "after";
  if ((!rel || rel === "value") && (/(?:정확히|exactly)\s*$/i.test(head) || /^\s*(?:자리|digits?\b)/i.test(text.slice(end)))) rel = "eq";
  const notifyAfter = /^\s*(?:after\b|뒤에|후에)/i.test(rest);
  if (!rel && unit && unit !== "cnt" && unit !== "qty" && NOTIFY_CUE.test(text) && /^\s*(?:전에|전(?=[^까가-힣]|$)|before\b|after\b|뒤에|후에)/i.test(rest) && (!notifyAfter || !/expir|만료|유효|valid/i.test(text))) rel = "eq";
  if (!rel && unit && /^\s*(?:전까지|전에|before\b|in advance\b|ahead\b)/i.test(rest)) rel = "gte";
  if ((!rel || rel === "value") && unit && /^\s*after\b/i.test(rest)) rel = unit === "cnt" ? "count" : "after";
  const window = !!unit && unit !== "cnt" && unit !== "qty" && (/^\s*(?:에|당)(?![가-힣])/.test(rest) || /\bper\s*$/i.test(head));
  const trigger = !window && (!rel || rel === "value" || rel === "eq") && (/\b(?:when|if|once)\b[^.]*\b(?:is|are|has|have|contains|equals|reaches|hits|becomes)\s*$/i.test(head) || /^\s*(?:이면|일\s*때|이\s*되면|가\s*되면|이\s*될\s*때)/.test(rest));
  if (trigger) rel = "eq";
  if (window) rel = "value";
  if (!rel) {
    if (unit === "cnt") rel = "count";
    else if (unit) rel = "value";
    else return null;
  }
  if (rel === "after" && unit === "cnt") rel = "count";
  rel = applyEdgeWord(rel, rest);
  const c = finish(text, value, unit, unitText, rel, text.slice(start, end + skip + unitText.length).trim());
  if (window) c.window = true;
  if (trigger) c.trigger = true;
  return c;
}
function parseRanges(text) {
  const found = [];
  const spans = [];
  for (const { re, soft } of RANGES) {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(([a, b]) => start < b && end > a)) continue;
      const lo = Number(m[1].replace(/,/g, "")) * (m[2] ? MAGNITUDE[m[2]] : 1);
      const hi = Number(m[3].replace(/,/g, "")) * (m[4] ? MAGNITUDE[m[4]] : 1);
      if (!(hi > lo)) continue;
      const { unit, unitText, rest } = readUnit(text.slice(end));
      const edge = /^[\s(,]*(?:inclusive|포함)/i.test(rest);
      const exclusive = /^[\s(,]*(?:exclusive|제외)/i.test(rest);
      const raw = text.slice(start, end).trim();
      found.push(finish(text, lo, unit, unitText, exclusive ? "gt" : "gte", raw, !!soft && !edge && !exclusive));
      found.push(finish(text, hi, unit, unitText, exclusive ? "lt" : "lte", raw, !!soft && !edge && !exclusive));
      spans.push([start, end]);
    }
  }
  return { found, spans };
}
function wordBoundaries(text) {
  const out = [];
  if (/\bnon[-\s]?negative\b|\bzero or more\b|음수가\s*아니|음수\s*불가/i.test(text)) {
    out.push(finish(text, 0, null, "", "gte", "non-negative"));
  } else if (/\b(?:any|must be|should be|be|is|are|only)\s+(?:a\s+)?positive\b|\bpositive\s+(?:count|number|integer|value|amount|quantity|size)\b|양수/i.test(text) && !/\bnon[-\s]?positive\b/i.test(text)) {
    out.push(finish(text, 0, null, "", "gt", "positive"));
  }
  return out;
}
function parseConstraints(text0) {
  const text = text0.replace(EVEN_IF_TIMES, (m) => " ".repeat(m.length));
  const out = [];
  const add = (c) => {
    if (c && !out.some((x) => x.value === c.value && x.unit === c.unit && x.rel === c.rel)) out.push(c);
  };
  const { found, spans } = parseRanges(text);
  found.forEach(add);
  const inRange = (i) => spans.some(([a, b]) => i >= a && i < b);
  for (const m of text.matchAll(NUM)) {
    if (/[A-Za-z]$/.test(text.slice(0, m.index)) || inRange(m.index)) continue;
    add(makeConstraint(text, readNumber(m), m.index, m.index + m[0].length));
  }
  const twiceForbidden = (m) => /^두\s*번\s*(?:[가-힣]+\s*){0,2}?(?:수\s*없|못\s)/.test(text.slice(m.index));
  for (const m of text.matchAll(NATIVE_RE)) if (!onlyOnce(text, m) && !twiceForbidden(m)) add(makeConstraint(text, NATIVE[m[1]], m.index, m.index + m[0].length));
  for (const m of text.matchAll(WORD_RE)) add(makeConstraint(text, WORDS[m[1].toLowerCase()], m.index, m.index + m[0].length));
  for (const m of text.matchAll(/\b(twice|thrice)\b/gi)) {
    const head = text.slice(Math.max(0, m.index - 30), m.index);
    let rel = null;
    for (const [re, r] of BEFORE) if (re.test(head)) {
      rel = r;
      break;
    }
    if (!rel && /\bonly\s*$/i.test(head)) rel = "lte";
    if (rel === "lte" || rel === "lt" || rel === "gte" || rel === "gt") add(finish(text, m[1].toLowerCase() === "twice" ? 2 : 3, "cnt", "", rel, m[0]));
  }
  wordBoundaries(text).forEach(add);
  return onceEvery(text, out);
}
function onceEvery(text, out) {
  const ko = /(\d+)\s*(?:일|시간|분|주|개월|달)\s*(?:에|마다)\s*한\s*번/.exec(text);
  const en = /\bonce\s+(?:every|per|in|each)\s+(\d+)\s+(?:days?|hours?|minutes?|weeks?|months?)\b/i.exec(text);
  const m = ko ?? en;
  if (!m) return out;
  const value = Number(m[1]);
  const i = out.findIndex((c) => c.value === value && !!c.unit && GAP_UNIT.has(c.unit));
  if (i < 0) return out;
  const old = out[i];
  const gap = { ...finish(text, value, old.unit, old.unitText, "gte", old.raw), validSide: "upper" };
  return out.flatMap((c, j) => j === i ? [gap] : c.unit === "cnt" && c.value === 1 ? [] : [c]);
}
function numbersIn(text0) {
  const text = text0.replace(EVEN_IF_TIMES, (m) => " ".repeat(m.length));
  const out = [...text.matchAll(NUM)].filter((m) => !/[A-Za-z]$/.test(text.slice(0, m.index))).map((m) => readNumber(m));
  for (const m of text.matchAll(NATIVE_RE)) if (!onlyOnce(text, m)) out.push(NATIVE[m[1]]);
  for (const m of text.matchAll(WORD_RE)) out.push(WORDS[m[1].toLowerCase()]);
  return [...new Set(out)];
}
function matchScale(c, lit) {
  for (const k of c.scales) {
    const v = c.value * k;
    if (near(lit, v) || Number.isInteger(v) && Number.isInteger(lit) && Math.abs(lit - v) <= 1) return k;
  }
  return null;
}
function closestScale(c, lit) {
  if (!lit || !c.value) return 1;
  let best = 1;
  let gap = Infinity;
  for (const k of c.scales) {
    const g = Math.abs(Math.log(Math.abs(lit) / (c.value * k)));
    if (g < gap) [gap, best] = [g, k];
  }
  return best;
}
function ro(word) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 44032 && code <= 55203) {
    const jong = (code - 44032) % 28;
    return jong === 0 || jong === 8 ? "\uB85C" : "\uC73C\uB85C";
  }
  if (/[0-9]/.test(ch)) return "036".includes(ch) ? "\uC73C\uB85C" : "\uB85C";
  return "\uB85C";
}
function englishUnit(unitText, n) {
  const en = EN_UNIT[unitText.trim()];
  if (!en) return null;
  return Number(String(n).replace(/,/g, "")) === 1 ? en[0] : en[1];
}
function constraintText(c) {
  const v = withUnit(round(c.value), c);
  const e = withUnitEn(round(c.value), c);
  switch (c.rel) {
    case "gte":
      return T(`${v} \uC774\uC0C1`, `at least ${e}`);
    case "gt":
      return T(`${v} \uCD08\uACFC`, `more than ${e}`);
    case "lte":
      return T(`${v} \uC774\uD558`, `at most ${e}`);
    case "lt":
      return T(`${v} \uBBF8\uB9CC`, `under ${e}`);
    case "after":
      return T(`${v} \uB4A4`, `after ${e}`);
    default:
      return T(v, e);
  }
}
function base(c, p) {
  return { required: c.value, attempts: null, ok: null, before: p?.incBefore ?? null, kind: "value", want: constraintText(c), line: p?.line };
}
function calendarBoundary(c, p) {
  const word = { hour: ["\uC2DC\uAC04", "hour"], day: ["\uB0A0", "day"], week: ["\uC8FC", "week"], month: ["\uB2EC", "month"] }[p.calendar ?? "day"];
  return { ...base(c, p), ok: true, say: T(`\uB2EC\uB825\uC73C\uB85C \uAC19\uC740 ${word[0]}\uB9CC \uC148`, `counts only the same calendar ${word[1]}`) };
}
function missingBoundary(c) {
  const t = constraintText(c);
  return { ...base(c, null), why: "missing", say: T(`\uC694\uAD6C\uC0AC\uD56D\uC758 \uC22B\uC790(${t.ko})\uB97C \uCF54\uB4DC\uC5D0\uC11C \uCC3E\uC9C0 \uBABB\uD568`, `could not find the number in the code (${t.en})`) };
}
function loopCount(p) {
  if (p.source !== "loop" || p.loopStart === void 0 || p.lit === void 0) return null;
  const s = p.loopStart;
  return p.op === "<" ? p.lit - s : p.op === "<=" ? p.lit - s + 1 : p.op === ">" ? s - p.lit : p.op === ">=" ? s - p.lit + 1 : null;
}
function judge(c, p) {
  const b = base(c, p);
  const v = c.value;
  if (p.lit === void 0) {
    return { ...b, why: "unresolved", say: T(`\uCF54\uB4DC\uC758 \uAC12\uC744 \uC77D\uC9C0 \uBABB\uD568 (${p.ref ?? p.expr})`, `could not read the value in the code (${p.ref ?? p.expr})`) };
  }
  const lit = p.lit;
  const stopAt = p.op === ">" || p.op === "<=" ? lit + 1 : lit;
  const limitWanted = c.rel === "lt" ? v - 1 : v;
  const limitResult = (total) => ({
    ...b,
    kind: "limit",
    ok: total === limitWanted,
    got: total,
    say: T(`\uCD5C\uB300 ${withUnit(total, c)} \uB3D9\uC791`, `runs at most ${withUnitEn(total, c)}`)
  });
  if (isCountable(c)) {
    const n2 = loopCount(p);
    if (n2 !== null) return limitResult(n2);
  }
  if (p.incBefore !== null && p.source !== "schema" && p.source !== "cap" && isCountable(c) && c.rel !== "eq" && c.rel !== "value") {
    if (isCapacity(c)) {
      const rejectsThisOne = p.thenKind === "reject" && !p.inCatch;
      const total = !p.incBefore || p.inCatch || !p.actionAfter && !rejectsThisOne ? stopAt : stopAt - 1;
      return limitResult(total);
    }
    if (p.op !== "!==") {
      const attempts = stopAt + (p.incBefore ? 0 : 1);
      const target = c.rel === "gt" ? v + 1 : v;
      return { ...b, kind: "attempt", firstTrue: stopAt, attempts, ok: attempts === target };
    }
  }
  if (c.rel === "count") {
    return { ...b, kind: "attempt", firstTrue: stopAt, why: "path", say: T("\uD69F\uC218\uB97C \uC62C\uB9AC\uB294 \uCF54\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD574 \uBA87 \uBC88\uC9F8\uC5D0 \uB3D9\uC791\uD558\uB294\uC9C0 \uD655\uC815 \uBABB\uD568", "the code that increments the counter was not found, so the attempt is undetermined") };
  }
  const k = matchScale(c, lit);
  const secScale = p.secs && c.unit ? SEC_PER[c.unit] : void 0;
  const pctScale = c.unit === "pct" && c.value >= 1 && Math.abs(lit) < 1 && c.scales.includes(0.01) ? 0.01 : void 0;
  const shown = k ?? secScale ?? pctScale ?? closestScale(c, lit);
  const n = round(lit / shown);
  if (p.source === "config") {
    const what = withUnit(n, c);
    const set = T(`${what}${ro(what)} \uC124\uC815\uB428`, `set to ${withUnitEn(n, c)}`);
    return { ...b, ok: k !== null, say: set };
  }
  const upperStyle = c.rel === "gte" || c.rel === "gt" || c.rel === "after";
  const closedAtLit = p.op === ">=" || p.op === "<";
  let say = upperStyle ? closedAtLit ? T(`${withUnit(n, c)}\uBD80\uD130 \uD574\uB2F9`, `applies from ${withUnitEn(n, c)}`) : T(`${withUnit(n, c)} \uCD08\uACFC\uBD80\uD130 \uD574\uB2F9`, `applies above ${withUnitEn(n, c)}`) : closedAtLit ? T(`${withUnit(n, c)} \uBBF8\uB9CC\uAE4C\uC9C0 \uD574\uB2F9`, `applies below ${withUnitEn(n, c)}`) : T(`${withUnit(n, c)}\uAE4C\uC9C0 \uD574\uB2F9`, `applies up to ${withUnitEn(n, c)}`);
  if (p.op === "===" || p.op === "!==") say = T(`${withUnit(n, c)}\uC77C \uB54C \uD574\uB2F9`, `applies at ${withUnitEn(n, c)}`);
  if (c.window) {
    const win = T(`${withUnit(n, c)} \uCC3D`, `${withUnitEn(n, c)} window`);
    return k !== null ? { ...b, ok: true, say: win } : { ...b, why: "missing", say: T(`\uC694\uAD6C\uC0AC\uD56D\uC758 \uC2DC\uAC04 \uCC3D(${withUnit(round(v), c)})\uC744 \uCF54\uB4DC\uC5D0\uC11C \uCC3E\uC9C0 \uBABB\uD568`, `could not find the ${withUnitEn(round(v), c)} window in the code`) };
  }
  if (c.trigger) {
    const val = k ?? 1;
    const at = v * val;
    const hits = p.op === "<=" ? at <= lit : p.op === "<" ? at < lit : p.op === ">=" ? at >= lit : p.op === ">" ? at > lit : p.op === "===" ? at === lit : at !== lit;
    return hits ? { ...b, ok: true, say: T(`${withUnit(round(v), c)}\uC77C \uB54C \uD574\uB2F9`, `applies at ${withUnitEn(round(v), c)}`) } : { ...b, ok: false, say: T(`${withUnit(round(v), c)}\uC77C \uB54C\uB294 \uD574\uB2F9\uD558\uC9C0 \uC54A\uC74C`, `does not apply at ${withUnitEn(round(v), c)}`) };
  }
  if (c.rel === "value") {
    const shownValue = T(`\uCF54\uB4DC\uC758 \uAC12 ${withUnit(n, c)}`, `${withUnitEn(n, c)} in the code`);
    if (k === null) return { ...b, ok: false, say: shownValue };
    if (p.source !== "compare") return { ...b, ok: true, say: shownValue };
    return { ...b, why: "wording", say: T(`${say.ko}. \uC694\uAD6C\uC0AC\uD56D\uC5D0 \u300C\uC774\uC0C1 \xB7 \uC774\uD558\u300D \uAC19\uC740 \uBC29\uD5A5\uC774 \uC5C6\uC5B4 \uACBD\uACC4\uB97C \uD655\uC815\uD560 \uC218 \uC5C6\uC74C`, `${say.en}. The requirement does not say which side of ${withUnitEn(round(v), c)} is meant`) };
  }
  if (c.rel === "eq") {
    if (p.op === "===" || p.op === "!==") return lit === v ? { ...b, ok: true, say } : { ...b, ok: false, say };
    const cut2 = closedAtLit ? lit : lit + 1;
    if (cut2 === v + 1) return { ...b, ok: true, say };
    return Math.abs(lit - v) <= 1 ? { ...b, ok: false, say } : { ...b, why: "missing", say };
  }
  if (p.op === "===" && p.preAdd && isCapacity(c)) {
    const total = lit;
    const allowed = c.rel === "lt" ? v - 1 : v;
    return { ...b, ok: total === allowed, say: T(`\uCD5C\uB300 ${withUnit(total, c)}\uAE4C\uC9C0 \uB4E4\uC5B4\uAC10`, `allows up to ${withUnitEn(total, c)}`) };
  }
  if (p.op === "===" && (c.rel === "gt" || c.rel === "gte") && p.thenKind !== "reject") return { ...b, ok: false, say: T(`${withUnit(n, c)}\uC77C \uB54C\uB9CC \uD574\uB2F9`, `applies only at ${withUnitEn(n, c)}`) };
  if (p.op === "===" || p.op === "!==") return { ...b, why: "missing", say };
  const scaled = k !== null && k !== 1;
  const timeUnit = c.unit === "sec" || c.unit === "min" || c.unit === "hour" || c.unit === "day" || c.unit === "week";
  if (scaled && (timeUnit || c.rel === "after")) return { ...b, ok: true, say };
  if (scaled) {
    const base2 = v * k;
    const wantClosed = c.rel === "gte" || c.rel === "lt";
    const same = near(lit, base2) ? closedAtLit === wantClosed : (closedAtLit ? lit : lit + 1) === (wantClosed ? base2 : base2 + 1);
    return { ...b, ok: same, say };
  }
  const cut = closedAtLit ? lit : lit + 1;
  if (c.rel === "after") {
    if (cut === v || cut === v + 1) {
      const exact = withUnit(round(v), c);
      return { ...b, why: "edge", say: T(`${say.ko}. \uC694\uAD6C\uC0AC\uD56D \uBB38\uC7A5\uB9CC\uC73C\uB85C\uB294 \uC815\uD655\uD788 ${exact}\uC9F8\uAC00 \uD3EC\uD568\uB418\uB294\uC9C0 \uC815\uD574\uC9C0\uC9C0 \uC54A\uC74C`, `${say.en}. The requirement does not say whether exactly ${withUnitEn(round(v), c)} counts`) };
    }
    return { ...b, ok: false, say };
  }
  let wanted = c.rel === "gte" || c.rel === "lt" ? v : v + 1;
  if (p.preAdd && isCapacity(c)) {
    wanted -= 1;
    say = T(`\uCD5C\uB300 ${withUnit(cut, c)}\uAE4C\uC9C0 \uB4E4\uC5B4\uAC10`, `allows up to ${withUnitEn(cut, c)}`);
    if (c.rel === "lt") say = T(`${withUnit(cut, c)}\uAE4C\uC9C0 \uB4E4\uC5B4\uAC10`, `allows up to ${withUnitEn(cut, c)}`);
  }
  if (isCapacity(c) && (c.unit === "cnt" || c.unit === "qty") && p.source === "compare" && !p.preAdd && /count|hits|used|entries|requests|sent/i.test(p.left) && !/\.(?:length|size)$/.test(p.left) && (cut === wanted || cut === wanted - 1)) {
    return { ...b, why: "path", say: T(`${say.ko}. \uC774 \uAC12\uC5D0 \uC774\uBC88 \uC694\uCCAD\uC774 \uD3EC\uD568\uB418\uB294\uC9C0 \uCF54\uB4DC\uB9CC\uC73C\uB85C \uC815\uD574\uC9C0\uC9C0 \uC54A\uC74C`, `${say.en}. The code does not show whether this count includes the current one`) };
  }
  if (p.thenKind === "reject" && c.validSide) {
    const trueSide = p.op === ">" || p.op === ">=" ? "upper" : "lower";
    if (trueSide === c.validSide) return { ...b, ok: false, why: "inverted", say: T(`${say.ko}: \uD5C8\uC6A9\uD574\uC57C \uD560 \uCABD\uC744 \uB9C9\uACE0 \uC788\uC74C`, `${say.en}: it rejects the side that should be allowed`) };
  }
  const altRel = c.rel === "gte" ? "gt" : c.rel === "gt" ? "gte" : c.rel === "lte" ? "lt" : "lte";
  const altWanted = (altRel === "gte" || altRel === "lt" ? v : v + 1) - (p.preAdd && isCapacity(c) ? 1 : 0);
  if (c.soft && cut !== wanted && cut === altWanted) return { ...b, why: "edge", say: T(`${say.ko}. \u300C${c.raw}\u300D\uC758 \uB05D\uAC12 \uD3EC\uD568 \uC5EC\uBD80\uAC00 \uBB38\uC7A5\uC5D0 \uC5C6\uC74C`, `${say.en}. "${c.raw}" does not say whether the end value counts`) };
  return { ...b, ok: cut === wanted, say };
}
function boundaryLine(b, lang = getLang()) {
  if (!b) return "";
  const ko = lang === "ko";
  if (b.kind === "attempt" && b.attempts !== null) {
    return ko ? `${b.attempts}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0 \uB3D9\uC791${b.ok === false ? ` (\uC694\uAD6C\uC0AC\uD56D ${b.required}\uD68C)` : ""}` : `acts on attempt ${b.attempts}${b.ok === false ? ` (requirement: ${b.required})` : ""}`;
  }
  const say = pick(b.say, lang);
  if (b.ok !== false) return say;
  return ko ? `${say} (\uC694\uAD6C\uC0AC\uD56D: ${pick(b.want, lang)})` : `${say} (requirement: ${pick(b.want, lang)})`;
}
function boundaryShort(b, lang = getLang()) {
  if (!b) return "";
  const ko = lang === "ko";
  if (b.kind === "attempt" && b.attempts !== null) return ko ? `${b.attempts}\uBC88\uC9F8 \uB3D9\uC791` : `attempt ${b.attempts}`;
  if (b.ok === null) return undecidedLabel(b.why && b.why !== "inverted" ? b.why : "missing", lang);
  return pick(b.say, lang);
}
function checkWord(b, lang = getLang()) {
  const counted = !b || b.kind === "attempt" || b.kind === "limit";
  return lang === "ko" ? counted ? "\uD69F\uC218" : "\uAC12" : counted ? "count" : "value";
}
function boundaryNote(b, label, lang = getLang()) {
  const ko = lang === "ko";
  if (b.kind === "attempt" && b.ok === false) return ko ? `${label}: \uC694\uAD6C\uC0AC\uD56D ${b.required}\uD68C, \uCF54\uB4DC\uB294 ${b.attempts}\uD68C\uC9F8\uC5D0 \uB3D9\uC791` : `${label}: the requirement says ${b.required}, the code acts on attempt ${b.attempts}`;
  return `${label}: ${boundaryLine(b, lang)}`;
}
var T, pick, NATIVE, WORDS, MAGNITUDE, UNITS, SCALES, NUM, NATIVE_RE, WORD_RE, MORE, LESS, BEFORE, AFTER, MUST, NEGATIVE, ABSORBED, WINDOW, NOTIFY_CUE, NUM_SRC, RANGES, EVEN_IF_TIMES, GAP_UNIT, near, SEC_PER, round, withUnit, EN_UNIT, withUnitEn, isCountable, isCapacity, partValue, UNDECIDED, undecidedLabel, undecidedAction;
var init_numeric = __esm({
  "src/numeric.ts"() {
    init_i18n();
    T = (ko, en) => ({ ko, en });
    pick = (t, lang = getLang()) => t ? t[lang] : "";
    NATIVE = { \uD55C: 1, \uD558\uB098: 1, \uB450: 2, \uB458: 2, \uC138: 3, \uC14B: 3, \uB124: 4, \uB137: 4, \uB2E4\uC12F: 5, \uC5EC\uC12F: 6, \uC77C\uACF1: 7, \uC5EC\uB35F: 8, \uC544\uD649: 9, \uC5F4: 10 };
    WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
    MAGNITUDE = { \uC5B5: 1e8, \uCC9C\uB9CC: 1e7, \uBC31\uB9CC: 1e6, \uC2ED\uB9CC: 1e5, \uB9CC: 1e4, \uCC9C: 1e3, \uBC31: 100 };
    UNITS = [
      [/^(?:원|달러|dollars?|usd|krw|won)\b|^(?:원|달러)/i, "money"],
      [/^(?:세|살)(?![가-힣]*(?:대))|^years?\s+old\b/i, "age"],
      [/^(?:글자|자리|자)|^(?:characters?|chars?|letters?|digits?)\b/i, "char"],
      [/^(?:개월|달)|^months?\b/i, "month"],
      [/^(?:주일|주)(?!년|문)|^weeks?\b/i, "week"],
      [/^일(?![가-힣]*(?:부|반|단|괄))|^days?\b/i, "day"],
      [/^시간|^(?:hours?|hrs?)\b/i, "hour"],
      [/^분|^(?:minutes?|mins?)\b/i, "min"],
      [/^초|^(?:seconds?|secs?)\b/i, "sec"],
      [/^(?:%|퍼센트|프로)|^percent\b/i, "pct"],
      [/^(?:kb|킬로바이트)/i, "kb"],
      [/^(?:mb|메가바이트|메가)/i, "mb"],
      [/^(?:gb|기가바이트|기가)/i, "gb"],
      [/^(?:회|번)(?!째)|^(?:times?|attempts?|tries|retries|failures?|failed)\b/i, "cnt"],
      [/^(?:개|건|명|장|점|권|줄)|^(?:items?|members?|users?|people|entries|records|points?|rows?|products?)\b/i, "qty"]
    ];
    SCALES = {
      week: [1, 7, 168, 10080, 604800, 6048e5],
      day: [1, 24, 1440, 86400, 864e5],
      hour: [1, 60, 3600, 36e5],
      min: [1, 60, 6e4],
      sec: [1, 1e3],
      pct: [1, 0.01],
      kb: [1, 1024, 1e3],
      mb: [1, 1024, 1048576, 1e3, 1e6],
      gb: [1, 1024, 1048576, 1073741824, 1e3, 1e6, 1e9]
    };
    NUM = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(억|천만|백만|십만|만|천|백)(?![가-힣]*(?:약|명히)))?/g;
    NATIVE_RE = /(?<![가-힣])(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*(?=번(?!\s*(?:에|도|더|씩|쯤|다시))|회|개|명|살|시간|달)/g;
    WORD_RE = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundred)\b(?=\s+(?:times?|attempts?|tries|retries|failures?|failed|characters?|items?|days?|hours?|minutes?|seconds?|members?|users?|files?|consecutive))/gi;
    MORE = "more|greater|larger|bigger|longer|higher";
    LESS = "less|fewer|smaller|shorter|lower";
    BEFORE = [
      [/(?:up to but (?:not including|excluding))\s*$/i, "lt"],
      [new RegExp(`(?:(?:no|not)\\s+(?:${MORE})\\s+than|(?:${LESS})\\s+than\\s+or\\s+equal\\s+to)\\s*$`, "i"), "lte"],
      [new RegExp(`(?:(?:no|not)\\s+(?:${LESS})\\s+than|(?:${MORE})\\s+than\\s+or\\s+equal\\s+to)\\s*$`, "i"), "gte"],
      [/(?:(?:not|never|cannot|can't|can not|must not|may not|shall not|should not|does not|doesn't|do not|don't|won't|will not)\s+(?:be\s+)?(?:exceed(?:ing)?|over|above|beyond))\s*$/i, "lte"],
      [/(?:최대|많아야|up to and including|up to|through|at most|maximum(?: of)?|max(?:imum)?:?|limited to|capped at|cap of|limit of|within)\s*$/i, "lte"],
      [/(?:최소|적어도|at least|minimum(?: of)?|min(?:imum)?:?|starting (?:at|from)|from)\s*$/i, "gte"],
      [new RegExp(`(?:(?:${MORE})\\s+than|over|above|beyond|exceed(?:s|ing)?)\\s*$`, "i"), "gt"],
      [new RegExp(`(?:(?:${LESS})\\s+than|under|below)\\s*$`, "i"), "lt"],
      // 「최소 주문 금액은 10,000원」 · 「the maximum size is 5」 · 「Max file size: 8mb」
      [/(?:최대|최고)[^,.]{0,14}(?:은|는|이|가)\s*$|\b(?:maximum|max)\b[^,.]{0,20}(?:\b(?:is|of)|:)\s*$/i, "lte"],
      [/(?:최소|최저)[^,.]{0,14}(?:은|는|이|가)\s*$|\b(?:minimum|min)\b[^,.]{0,20}(?:\b(?:is|of)|:)\s*$/i, "gte"]
    ];
    AFTER = [
      [/^\s*[을를이가]?\s*넘(?:지\s*(?:않|말|못)|을\s*수\s*없|으면\s*안|어서는\s*안)/, "lte"],
      [/^\s*(?:이상|부터|or more|or greater|or larger|or bigger|or longer|or higher|or over|or above|\+)/i, "gte"],
      [/^\s*(?:초과|[을를이가]?\s*넘(?:으면|는|어|게|을|긴|기면)|보다\s*(?:크|커|많|높|길))/, "gt"],
      [/^\s*(?:이하|이내|까지|안에|or less|or fewer|or smaller|or shorter|or lower|or under|or below)/i, "lte"],
      [/^\s*(?:미만|보다\s*(?:작|적|낮|짧))/, "lt"],
      [/^\s*(?:이|가)?\s*(?:지나|경과)|^\s*(?:뒤|후)(?![가-힣]*불)|^\s*(?:동안|마다)|^\s*(?:later|ago)\b/i, "after"],
      [/^\s*(?:이면|면|일\s*때|인\s*경우)/, "eq"]
    ];
    MUST = /(?:이어야|여야|해야|할 수 있|될 수 있|가능|must|should|shall|can\b|at least|at most|accepted|allowed|최대|최소|까지만?)/i;
    NEGATIVE = /(?:없다|없음|없어|불가|금지|안\s*된다|않는다|cannot|can't|can not|must not|may not|not allowed|rejected|denied|blocked|refused|declined|\bnot\s+(?:be\s+)?(?:accepted|allowed|permitted|possible|valid)\b|받지\s*않)/i;
    ABSORBED = new RegExp(`(?:not|never|cannot|can't|can not|must not|may not|shall not|should not|does not|doesn't|do not|don't|won't|will not)\\s+(?:be\\s+)?(?:exceed(?:ing)?|over|above|beyond|below|under|(?:${MORE}|${LESS})\\s+than)|\uB118\uC9C0\\s*(?:\uC54A|\uB9D0|\uBABB)[\uAC00-\uD7A3]*|\uB118\uC744\\s*\uC218\\s*\uC5C6[\uAC00-\uD7A3]*|\uB118\uC73C\uBA74\\s*\uC548[\uAC00-\uD7A3\\s]*|\uB118\uC5B4\uC11C\uB294\\s*\uC548[\uAC00-\uD7A3\\s]*`, "gi");
    WINDOW = /(하루|매일|주|달|시간|분|초|일)\s*(?:에|마다|당)|\bper\s+(?:day|hour|minute|week|month)|\ba\s+(?:day|week|month)|\ban\s+hour/i;
    NOTIFY_CUE = /\b(?:remind(?:er|ers|s|ed)?|notif(?:y|ies|ied|ication|ications)|alert|e-?mail(?:s|ed)?|sends?|sent|messages?)\b|알림|안내|알려|보낸|보내|발송|문자/i;
    NUM_SRC = "(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)(?:\\s*(\uC5B5|\uCC9C\uB9CC|\uBC31\uB9CC|\uC2ED\uB9CC|\uB9CC|\uCC9C|\uBC31))?";
    RANGES = [
      { re: new RegExp(`\\bbetween\\s+${NUM_SRC}\\s*[a-z%]*\\s+and\\s+${NUM_SRC}`, "gi"), soft: true },
      { re: new RegExp(`\\bfrom\\s+${NUM_SRC}\\s*[a-z%]*\\s+(?:to|through)\\s+${NUM_SRC}`, "gi") },
      { re: new RegExp(`\\b${NUM_SRC}\\s+(?:to|through)\\s+${NUM_SRC}`, "gi") },
      { re: new RegExp(`${NUM_SRC}\\s*(?:~|\u301C|\u2013|\u2014)\\s*${NUM_SRC}`, "g") },
      { re: new RegExp(`${NUM_SRC}[\uAC00-\uD7A3%]{0,3}\\s*(?:\uC5D0\uC11C|\uBD80\uD130)\\s*${NUM_SRC}`, "g") }
    ];
    EVEN_IF_TIMES = /(?:\d+|하나|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번\s*[가-힣]{1,6}?(?:어도|아도|여도|해도|러도|라도|더라도)(?![가-힣])/g;
    GAP_UNIT = /* @__PURE__ */ new Set(["sec", "min", "hour", "day", "week", "month"]);
    near = (a, b) => Math.abs(a - b) < 1e-9;
    SEC_PER = { sec: 1, min: 60, hour: 3600, day: 86400, week: 604800, month: 2592e3 };
    round = (n) => String(Math.round(n * 1e6) / 1e6);
    withUnit = (n, c) => {
      const u = c.unitText;
      return /^[A-Za-z]/.test(u) ? `${n} ${u}` : `${n}${u}`;
    };
    EN_UNIT = {
      \uC6D0: ["won", "won"],
      \uB2EC\uB7EC: ["dollar", "dollars"],
      \uC138: ["year old", "years old"],
      \uC0B4: ["year old", "years old"],
      \uAE00\uC790: ["character", "characters"],
      \uC790: ["character", "characters"],
      \uC790\uB9AC: ["digit", "digits"],
      \uAC1C\uC6D4: ["month", "months"],
      \uB2EC: ["month", "months"],
      \uC8FC\uC77C: ["week", "weeks"],
      \uC8FC: ["week", "weeks"],
      \uC77C: ["day", "days"],
      \uC2DC\uAC04: ["hour", "hours"],
      \uBD84: ["minute", "minutes"],
      \uCD08: ["second", "seconds"],
      \uD37C\uC13C\uD2B8: ["%", "%"],
      \uD504\uB85C: ["%", "%"],
      \uD0AC\uB85C\uBC14\uC774\uD2B8: ["KB", "KB"],
      \uBA54\uAC00\uBC14\uC774\uD2B8: ["MB", "MB"],
      \uBA54\uAC00: ["MB", "MB"],
      \uAE30\uAC00\uBC14\uC774\uD2B8: ["GB", "GB"],
      \uAE30\uAC00: ["GB", "GB"],
      \uD68C: ["time", "times"],
      \uBC88: ["time", "times"],
      \uAC1C: ["item", "items"],
      \uAC74: ["item", "items"],
      \uBA85: ["person", "people"],
      \uC7A5: ["sheet", "sheets"],
      \uC810: ["point", "points"],
      \uAD8C: ["book", "books"],
      \uC904: ["line", "lines"]
    };
    withUnitEn = (n, c) => {
      const word = englishUnit(c.unitText, n);
      if (!word) return withUnit(n, c);
      return word === "%" ? `${n}%` : `${n} ${word}`;
    };
    isCountable = (c) => c.unit === "cnt" || c.unit === "qty" || c.unit === null;
    isCapacity = (c) => c.rel === "lte" || c.rel === "lt";
    partValue = (p) => loopCount(p) ?? p.lit;
    UNDECIDED = {
      wording: {
        label: { ko: "\uBB38\uC7A5\uC5D0 \uBC29\uD5A5 \uC5C6\uC74C", en: "wording has no direction" },
        action: { ko: "\uC694\uAD6C\uC0AC\uD56D\uC5D0 \u300C\uC774\uC0C1 \xB7 \uC774\uD558 \xB7 \uCD08\uACFC \xB7 \uBBF8\uB9CC\u300D \uAC00\uC6B4\uB370 \uD558\uB098\uB97C \uC801\uB294\uB2E4.", en: "Say \u201Cat least\u201D, \u201Cat most\u201D, \u201Cover\u201D or \u201Cunder\u201D in the requirement." }
      },
      edge: {
        label: { ko: "\uB05D\uAC12 \uD3EC\uD568 \uC5EC\uBD80 \uC560\uB9E4", en: "edge value unclear" },
        action: { ko: "\uB05D\uAC12\uC774 \uD3EC\uD568\uB418\uB294\uC9C0 \uC694\uAD6C\uC0AC\uD56D\uC5D0 \uC801\uB294\uB2E4 (\uC608: \u300C7\uC77C\uC9F8\uBD80\uD130\u300D, \u300C8MB \uD3EC\uD568\u300D).", en: "Say in the requirement whether the edge value counts (for example \u201Cfrom day 7\u201D, \u201C8 MB included\u201D)." }
      },
      path: {
        label: { ko: "\uC2E4\uD589 \uC21C\uC11C \uD655\uC778 \uBABB\uD568", en: "execution order not visible" },
        action: { ko: "\uC138\uB294 \uCF54\uB4DC\uC640 \uBE44\uAD50\uAC00 \uC5B4\uB5A4 \uC21C\uC11C\uB85C \uB3C4\uB294\uC9C0 \uD655\uC778\uD558\uACE0, \uACBD\uACC4 \uAC12\uC744 \uC9C1\uC811 \uB123\uB294 \uD14C\uC2A4\uD2B8\uB97C \uB354\uD55C\uB2E4.", en: "Check the order in which the counting code and the comparison run, and add a test that hits the edge value." }
      },
      unresolved: {
        label: { ko: "\uAC12\uC744 \uC77D\uC9C0 \uBABB\uD568", en: "value not readable" },
        action: { ko: "\uAC12\uC774 \uD658\uACBD \uBCC0\uC218\uB098 \uC124\uC815\uC5D0\uC11C \uC624\uBA74 \uAE30\uBCF8\uAC12\uC744 \uCF54\uB4DC\uC5D0 \uB450\uAC70\uB098, \uADF8 \uAC12\uC744 \uD655\uC778\uD558\uB294 \uD14C\uC2A4\uD2B8\uB97C \uB354\uD55C\uB2E4.", en: "If the value comes from an environment variable or settings, keep a default in the code or add a test for it." }
      },
      missing: {
        label: { ko: "\uCF54\uB4DC\uC5D0 \uC22B\uC790 \uC5C6\uC74C", en: "number not found" },
        action: { ko: "\uAD6C\uD604\uC774 \uC788\uB294\uC9C0 \uD655\uC778\uD55C\uB2E4. \uC788\uC73C\uBA74 \u300C| keywords: \uCF54\uB4DC\uC5D0 \uB098\uC624\uB294 \uC601\uC5B4 \uB2E8\uC5B4\u300D\uB97C \uC694\uAD6C\uC0AC\uD56D\uC5D0 \uBD99\uC778\uB2E4.", en: "Check that it is implemented. If it is, add \u201C| keywords: words in the code\u201D to the requirement." }
      },
      conflict: {
        label: { ko: "\uB2E4\uB978 \uAC12\uC774 \uD568\uAED8 \uC788\uC74C", en: "conflicting values" },
        action: { ko: "\uAC19\uC740 \uB300\uC0C1\uC5D0 \uB2E4\uB978 \uAC12\uC774 \uC788\uB2E4. \uC5B4\uB290 \uAC12\uC774 \uC2E4\uC81C\uB85C \uC4F0\uC774\uB294\uC9C0 \uD655\uC778\uD558\uACE0 \uD558\uB098\uB85C \uB9DE\uCD98\uB2E4.", en: "The same thing has another value elsewhere. Check which one is used and make them agree." }
      },
      "no-check": {
        label: { ko: "\uD655\uC778\uD558\uB294 \uC870\uAC74 \uBABB \uCC3E\uC74C", en: "no deciding check" },
        action: {
          ko: "\uC694\uAD6C\uC0AC\uD56D\uC744 \uD655\uC778\uD558\uAC70\uB098 \uB9C9\uB294 if \uBB38\uC774 \uC788\uB294\uC9C0 \uBCF8\uB2E4. \uC9C0\uAE08\uC740 \uD568\uC218 \uC774\uB984\uC5D0 \uB0B1\uB9D0\uB9CC \uACB9\uCCE4\uB2E4. \uC788\uC73C\uBA74 \u300C| keywords: \uCF54\uB4DC\uC5D0 \uB098\uC624\uB294 \uC601\uC5B4 \uB2E8\uC5B4\u300D\uB97C \uBD99\uC778\uB2E4.",
          en: "Check that an if statement enforces the requirement. Only the function name matched. If there is one, add \u201C| keywords: words in the code\u201D."
        }
      },
      "no-evidence": {
        label: { ko: "\uADFC\uAC70 \uC5C6\uC74C", en: "no evidence" },
        action: { ko: "\uAD6C\uD604\uC774 \uC788\uB294\uC9C0 \uD655\uC778\uD55C\uB2E4. \uC788\uC73C\uBA74 \u300C| keywords: \uCF54\uB4DC\uC5D0 \uB098\uC624\uB294 \uC601\uC5B4 \uB2E8\uC5B4\u300D\uB97C \uC694\uAD6C\uC0AC\uD56D\uC5D0 \uBD99\uC778\uB2E4.", en: "Check that it is implemented. If it is, add \u201C| keywords: words in the code\u201D to the requirement." }
      },
      "extra-condition": {
        label: { ko: "\uC870\uAC74\uC774 \uB354 \uC788\uC74C", en: "extra condition" },
        action: { ko: "\uD568\uAED8 \uAC78\uB9B0 \uC870\uAC74\uC774 \uAC70\uC9D3\uC77C \uB54C\uB3C4 \uC694\uAD6C\uC0AC\uD56D\uC774 \uC9C0\uCF1C\uC9C0\uB294\uC9C0 \uD655\uC778\uD55C\uB2E4.", en: "Check that the requirement still holds when the attached condition is false." }
      },
      "unchecked-input": {
        label: { ko: "\uAC80\uC0AC \uC5C6\uC774 \uBC1B\uB294 \uACF3 \uC788\uC74C", en: "accepted unchecked elsewhere" },
        action: { ko: "\uADF8 \uC785\uB825\uC744 \uBC1B\uB294 \uACF3\uB9C8\uB2E4 \uAC80\uC0AC\uB97C \uB123\uAC70\uB098, \uC694\uAD6C\uC0AC\uD56D\uC774 \uC5B4\uB290 \uACF3\uC744 \uB9D0\uD558\uB294\uC9C0 \u300C| keywords: \uCF54\uB4DC\uC5D0 \uB098\uC624\uB294 \uC601\uC5B4 \uB2E8\uC5B4\u300D\uB85C \uC815\uD55C\uB2E4.", en: "Add the check wherever that input is accepted, or say which place the requirement means with \u201C| keywords: words in the code\u201D." }
      },
      "no-window": {
        label: { ko: "\uAE30\uAC04 \uC548\uC5D0\uC11C \uC138\uB294\uC9C0 \uBABB \uCC3E\uC74C", en: "no time window" },
        action: { ko: "\u300C\uD558\uB8E8\uC5D0 \xB7 1\uC2DC\uAC04\uC5D0\u300D\uCC98\uB7FC \uADF8 \uAE30\uAC04 \uC548\uC758 \uAC83\uB9CC \uC138\uB294\uC9C0 \uD655\uC778\uD55C\uB2E4(\uAE30\uAC04\uC774 \uC9C0\uB098\uBA74 \uB2E4\uC2DC \uC138\uB294 \uCF54\uB4DC\uB098, sentToday \uCC98\uB7FC \uAE30\uAC04\uC774 \uB4E0 \uC774\uB984).", en: "Check that only the period is counted (code that resets after a day or an hour, or a name such as sentToday)." }
      },
      "no-test": {
        label: { ko: "\uAC80\uC0AC \uC5C6\uC74C", en: "no test" },
        action: { ko: "\uC774 \uC694\uAD6C\uC0AC\uD56D\uC744 \uD655\uC778\uD558\uB294 \uD14C\uC2A4\uD2B8\uB97C \uB3CC\uB9B0\uB2E4. \uD14C\uC2A4\uD2B8 \uC774\uB984\uC5D0 \uC694\uAD6C\uC0AC\uD56D\uC758 \uB0B1\uB9D0\uACFC \uC22B\uC790\uB97C \uB123\uC73C\uBA74 \uC774\uC5B4\uC9C4\uB2E4.", en: "Run a test for this requirement. A test name with the requirement\u2019s words and number gets linked." }
      },
      stale: {
        label: { ko: "\uAC80\uC0AC \uC624\uB798\uB428", en: "tests out of date" },
        action: { ko: "\uCF54\uB4DC\uB97C \uBC14\uAFBC \uB4A4 \uD14C\uC2A4\uD2B8\uB97C \uB2E4\uC2DC \uB3CC\uB9B0\uB2E4.", en: "Run the tests again after the code change." }
      }
    };
    undecidedLabel = (k, lang = getLang()) => pick(UNDECIDED[k].label, lang);
    undecidedAction = (k, lang = getLang()) => pick(UNDECIDED[k].action, lang);
  }
});

// src/git.ts
import { execFileSync } from "node:child_process";
function git(repo, args2) {
  return execFileSync("git", ["-c", "core.quotepath=false", "-C", repo, ...args2], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
function shortSha(repo, ref) {
  return git(repo, ["rev-parse", "--short", ref]).trim();
}
function changedFiles(repo, base2, head) {
  return git(repo, ["diff", "--name-only", "--diff-filter=AMR", `${base2}...${head}`]).split("\n").map((s) => s.trim()).filter(Boolean);
}
function changedPaths(repo, base2, head) {
  const out = git(repo, ["diff", "--name-status", "-M", "--no-color", head ? `${base2}...${head}` : base2]);
  const rows = [];
  for (const line of out.split("\n")) {
    const p = line.split("	");
    if (p.length < 2) continue;
    const st = p[0].trim();
    if (st.startsWith("R") && p.length >= 3) rows.push({ path: p[2].trim(), old: p[1].trim(), deleted: false });
    else if (st === "D") rows.push({ path: p[1].trim(), old: p[1].trim(), deleted: true });
    else if (st === "M") rows.push({ path: p[1].trim(), old: p[1].trim(), deleted: false });
  }
  return rows;
}
function changedLines(repo, base2, head) {
  return parseDiffLines(git(repo, ["diff", "-U0", "--no-color", "--diff-filter=AMR", `${base2}...${head}`]));
}
function trackedFiles(repo, ref) {
  return list(git(repo, ["ls-tree", "-r", "--name-only", ref]));
}
function mergeBase(repo, base2, head = "HEAD") {
  return git(repo, ["merge-base", base2, head]).trim();
}
function untrackedFiles(repo) {
  return list(git(repo, ["ls-files", "--others", "--exclude-standard"])).filter((f) => !/(^|\/)node_modules\//.test(f));
}
function worktreeChangedFiles(repo, from) {
  return [.../* @__PURE__ */ new Set([...list(git(repo, ["diff", "--name-only", "--diff-filter=AMR", from])), ...untrackedFiles(repo)])];
}
function worktreeChangedLines(repo, from) {
  return parseDiffLines(git(repo, ["diff", "-U0", "--no-color", "--diff-filter=AMR", from]));
}
function uncommittedFiles(repo) {
  return [.../* @__PURE__ */ new Set([...list(git(repo, ["diff", "--name-only", "HEAD"])), ...untrackedFiles(repo)])];
}
function parseDiffLines(out) {
  const map = /* @__PURE__ */ new Map();
  let file = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.startsWith("+++ b/") ? line.slice(6) : "";
      if (file) map.set(file, /* @__PURE__ */ new Set());
    } else if (line.startsWith("@@") && file) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === void 0 ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) map.get(file).add(start + i);
    }
  }
  return map;
}
function showFile(repo, ref, path) {
  try {
    return git(repo, ["show", `${ref}:${path}`]);
  } catch {
    return null;
  }
}
var list;
var init_git = __esm({
  "src/git.ts"() {
    list = (out) => out.split("\n").map((s) => s.trim()).filter(Boolean);
  }
});

// src/tests.ts
function parseJunit(xml) {
  const out = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while (m = re.exec(xml)) {
    const attrs = m[1];
    const body = m[3] ?? "";
    const name = decode((attrs.match(/\bname="([^"]*)"/) ?? [])[1] ?? "");
    const hasFail = /\bfailure=/.test(attrs) || /<failure\b/.test(body);
    const skipped = /<skipped\b/.test(body) || /\bskipped=/.test(attrs);
    let message = "";
    const fm = body.match(/<failure[^>]*message="([^"]*)"/) ?? attrs.match(/\bfailure="([^"]*)"/);
    if (fm) message = decode(fm[1]).split("\n").filter((x) => x.trim()).join(" \xB7 ");
    out.push({ name, status: hasFail ? "fail" : skipped ? "skip" : "pass", message });
  }
  return out;
}
function parseJestJson(text) {
  const j = JSON.parse(text);
  const out = [];
  for (const f of j.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      const name = a.fullName || [...a.ancestorTitles ?? [], a.title ?? ""].join(" ").trim();
      const message = (a.failureMessages ?? []).join("\n").replace(ANSI, "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(" \xB7 ");
      out.push({ name, status: a.status === "passed" ? "pass" : a.status === "failed" ? "fail" : "skip", message });
    }
  }
  return out;
}
function parseTestReport(text) {
  const t = text.replace(/^﻿/, "").trimStart();
  if (t.startsWith("{")) return parseJestJson(t);
  return parseJunit(t).map((c) => ({ ...c, name: c.name.replace(ANSI, ""), message: c.message.replace(ANSI, "") }));
}
var decode, ANSI;
var init_tests = __esm({
  "src/tests.ts"() {
    decode = (s) => s.replace(/&#10;/g, "\n").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    ANSI = /\u001b\[[0-9;]*m/g;
  }
});

// src/testedits.ts
import ts2 from "typescript";
function callee(e) {
  if (ts2.isIdentifier(e)) {
    const n = e.text;
    if (TEST_FN.has(n)) return { suite: false, skip: false };
    if (SKIP_TEST_FN.has(n)) return { suite: false, skip: true };
    if (SUITE_FN.has(n)) return { suite: true, skip: false };
    if (SKIP_SUITE_FN.has(n)) return { suite: true, skip: true };
    return null;
  }
  if (ts2.isPropertyAccessExpression(e) && ts2.isIdentifier(e.expression)) {
    const base2 = callee(e.expression);
    if (!base2) return null;
    return { suite: base2.suite, skip: base2.skip || SKIP_MOD.has(e.name.text) };
  }
  return null;
}
function testBlocks(file, text) {
  const sf = ts2.createSourceFile(file, text, ts2.ScriptTarget.Latest, true, /x$/.test(file) ? ts2.ScriptKind.TSX : ts2.ScriptKind.TS);
  const out = [];
  const visit = (node, parents, skipped) => {
    if (ts2.isCallExpression(node)) {
      const c = callee(node.expression);
      const first = node.arguments[0];
      const title = first && (ts2.isStringLiteral(first) || ts2.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
      if (c && title !== null) {
        const opt = node.arguments.find((a) => ts2.isObjectLiteralExpression(a));
        const optSkip = !!opt && /\b(skip|todo)\s*:\s*(true|['"`])/.test(opt.getText(sf));
        const skip = skipped || c.skip || optSkip;
        if (c.suite) {
          for (const a of node.arguments.slice(1)) visit(a, [...parents, title], skip);
          return;
        }
        out.push({ title, full: [...parents, title].join(" "), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: node.getText(sf), skipped: skip });
        return;
      }
    }
    ts2.forEachChild(node, (n) => visit(n, parents, skipped));
  };
  visit(sf, [], false);
  return out;
}
function lineDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i2 = n - 1; i2 >= 0; i2--) for (let j2 = m - 1; j2 >= 0; j2--) dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}
function splitExpect(line) {
  const i = line.search(/\bexpect\s*\(/);
  if (i < 0) return null;
  let depth = 0;
  for (let j = line.indexOf("(", i); j < line.length; j++) {
    if (line[j] === "(") depth++;
    else if (line[j] === ")" && --depth === 0) return { subject: line.slice(0, j + 1), matcher: line.slice(j + 1).replace(/;\s*$/, "").trim() };
  }
  return null;
}
function changedValues(before, after, numbersOnly = false) {
  const { removed, added } = lineDiff(lines(before), lines(after));
  const out = [];
  const push = (from, to) => {
    if (from !== to && !out.some((p) => p.from === from && p.to === to)) out.push({ from, to });
  };
  const used = /* @__PURE__ */ new Set();
  const left = [];
  for (const r of removed) {
    const k = added.findIndex((a2, idx) => !used.has(idx) && shape(a2) === shape(r));
    if (k < 0) {
      left.push(r);
      continue;
    }
    used.add(k);
    const a = added[k];
    const er = splitExpect(r);
    const ea = splitExpect(a);
    const parts = er && ea ? [[er.subject, ea.subject, false], [er.matcher, ea.matcher, true]] : [[r, a, checks(r) > 0]];
    for (const [x, y, strings] of parts) {
      const vx = valuesOf(x);
      const vy = valuesOf(y);
      for (let i = 0; i < vx.length; i++) {
        if (vx[i] === vy[i]) continue;
        if (!/^\d/.test(vx[i]) && (!strings || numbersOnly)) continue;
        push(vx[i], vy[i]);
      }
    }
  }
  if (!numbersOnly) {
    for (const r of left) {
      const er = splitExpect(r);
      if (!er) continue;
      const k = added.findIndex((a, idx) => !used.has(idx) && splitExpect(a)?.subject === er.subject);
      if (k < 0) continue;
      used.add(k);
      push(er.matcher.replace(/^\./, ""), splitExpect(added[k]).matcher.replace(/^\./, ""));
    }
  }
  return out.slice(0, 4);
}
function similar(a, b) {
  const x = words(a);
  const y = words(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.max(1, x.size + y.size - both);
}
function diffTestFile(file, before, after) {
  if (before === null) return [];
  const old = safeBlocks(file, before);
  const now = after === null ? [] : safeBlocks(file, after);
  const out = [];
  const left = [...old];
  const fresh = [];
  for (const b of now) {
    const i = left.findIndex((a2) => a2.full === b.full);
    if (i < 0) {
      fresh.push(b);
      continue;
    }
    const [a] = left.splice(i, 1);
    const e = compare(file, a, b);
    if (e) out.push(e);
  }
  for (const b of fresh) {
    let best = -1;
    let score = 0.5;
    for (let i = 0; i < left.length; i++) {
      const s = similar(left[i].text, b.text);
      if (s > score) {
        score = s;
        best = i;
      }
    }
    if (best < 0) continue;
    const [a] = left.splice(best, 1);
    const e = compare(file, a, b);
    if (e) out.push(e);
  }
  for (const a of left) out.push({ file, line: a.line, title: a.title, full: a.full, kind: "removed", values: [], fewerChecks: checks(a.text) });
  return out;
}
function compare(file, a, b) {
  if (a.text === b.text && a.skipped === b.skipped) return null;
  const base2 = { file, line: b.line, title: b.title, full: b.full, ...a.full !== b.full ? { was: a.full } : {} };
  if (b.skipped && !a.skipped) return { ...base2, kind: "skipped", values: [], fewerChecks: checks(a.text) };
  if (lines(a.text).join("\n") === lines(b.text).join("\n")) return null;
  return { ...base2, kind: "changed", values: changedValues(a.text, b.text), fewerChecks: Math.max(0, checks(a.text) - checks(b.text)) };
}
function importsOf(file, text, known) {
  const dir = file.split("/").slice(0, -1);
  const out = [];
  for (const m of text.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const parts = [...dir];
    for (const seg of m[1].split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    const base2 = parts.join("/").replace(/\.(js|mjs|cjs|jsx)$/, "");
    for (const ext of ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.js"]) {
      if (known.has(base2 + ext)) {
        out.push(base2 + ext);
        break;
      }
    }
  }
  return out;
}
function diffTestFiles(changed, others = () => []) {
  const out = [];
  const helpers = /* @__PURE__ */ new Map();
  for (const c of changed) {
    const edits = diffTestFile(c.file, c.before, c.after);
    out.push(...edits);
    if (c.before === null || c.after === null || c.before === c.after) continue;
    if (safeBlocks(c.file, c.before).length || safeBlocks(c.file, c.after).length) continue;
    const values = changedValues(c.before, c.after, true);
    if (values.length) helpers.set(c.file, values);
  }
  if (!helpers.size) return out;
  const known = new Set(helpers.keys());
  const texts = [...changed.filter((c) => c.after !== null).map((c) => ({ file: c.file, text: c.after })), ...others()];
  const seen = /* @__PURE__ */ new Set();
  for (const { file, text } of texts) {
    if (seen.has(file) || helpers.has(file)) continue;
    seen.add(file);
    const via = importsOf(file, text, known);
    if (!via.length) continue;
    for (const b of safeBlocks(file, text)) {
      if (out.some((e) => e.file === file && e.full === b.full)) continue;
      out.push({ file, line: b.line, title: b.title, full: b.full, kind: "changed", values: via.flatMap((h) => helpers.get(h) ?? []).slice(0, 4), fewerChecks: 0, via: via[0] });
    }
  }
  return out;
}
function safeBlocks(file, text) {
  try {
    return testBlocks(file, text);
  } catch {
    return [];
  }
}
function editText(e, lang) {
  const ko = lang === "ko";
  const vals = e.values.map((v) => `${v.from} \u2192 ${v.to}`).join(", ");
  const fewer = e.fewerChecks > 0 ? ko ? `\uD655\uC778 \uC904 ${e.fewerChecks}\uAC1C \uC904\uC5B4\uB4E6` : `${e.fewerChecks} fewer check${e.fewerChecks > 1 ? "s" : ""}` : "";
  if (e.kind === "removed") return ko ? "\uC774\uBC88 \uBCC0\uACBD\uC5D0\uC11C \uAC80\uC0AC\uB97C \uC9C0\uC6C0" : "test removed in this change";
  if (e.kind === "skipped") return ko ? "\uC774\uBC88 \uBCC0\uACBD\uC5D0\uC11C \uAC80\uC0AC\uB97C \uAC74\uB108\uB6F0\uAC8C \uD568" : "test skipped in this change";
  const what = [vals, fewer].filter(Boolean).join(" \xB7 ");
  const via = e.via ? ko ? ` (${e.via.split("/").pop()} \uC5D0\uC11C)` : ` (in ${e.via.split("/").pop()})` : "";
  return ko ? `\uC774\uBC88 \uBCC0\uACBD\uC5D0\uC11C \uAC80\uC0AC\uAC00 \uBC14\uB01C${via}${what ? `: ${what}` : ""}` : `test changed in this change${via}${what ? `: ${what}` : ""}`;
}
var TEST_FN, SKIP_TEST_FN, SUITE_FN, SKIP_SUITE_FN, SKIP_MOD, CHECK, checks, VALUE, shape, valuesOf, lines, words, suspicious;
var init_testedits = __esm({
  "src/testedits.ts"() {
    TEST_FN = /* @__PURE__ */ new Set(["it", "test", "specify"]);
    SKIP_TEST_FN = /* @__PURE__ */ new Set(["xit", "xtest", "xspecify"]);
    SUITE_FN = /* @__PURE__ */ new Set(["describe", "suite", "context"]);
    SKIP_SUITE_FN = /* @__PURE__ */ new Set(["xdescribe", "xcontext"]);
    SKIP_MOD = /* @__PURE__ */ new Set(["skip", "todo"]);
    CHECK = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\bt\.(?:is|not|ok|notOk|equal|deepEqual|strictEqual|notEqual|true|false|throws|rejects|like|match|same)\s*\(|\.should\b/g;
    checks = (s) => (s.match(CHECK) ?? []).length;
    VALUE = /(['"`])(?:(?!\1)[^\\\n]|\\.){0,40}\1|\b\d+(?:[._]\d+)*\b/g;
    shape = (line) => line.replace(VALUE, "#");
    valuesOf = (line) => line.match(VALUE) ?? [];
    lines = (s) => s.split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("//"));
    words = (s) => new Set(s.toLowerCase().match(/[a-z_$][\w$]*|\d+|[가-힣]+/g) ?? []);
    suspicious = (e) => e.kind !== "changed" || e.values.length > 0 || e.fewerChecks > 0;
  }
});

// src/glossary.ts
function normalizePhrases(text) {
  return text.replace(/\blog(?:s|ged|ging)?[\s-]+in\b/gi, "login").replace(/\blog(?:s|ged|ging)?[\s-]+out\b/gi, "logout").replace(/\bsign(?:s|ed|ing)?[\s-]+in\b/gi, "signin").replace(/\bsign(?:s|ed|ing)?[\s-]+out\b/gi, "signout").replace(/\bsign(?:s|ed|ing)?[\s-]+up\b/gi, "signup").replace(/\bregistrations?\b/gi, "register").replace(/\b(?:using|uses|used)\b/gi, "use").replace(/\bcheck(?:s|ed|ing)?[\s-]+out\b/gi, "checkout").replace(/\btime(?:s|d)?[\s-]+out\b/gi, "timeout");
}
function conceptsFor(text) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (words2) => {
    const group = [...new Set(words2)].filter((w) => !seen.has(w));
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
var GLOSSARY, WEAK;
var init_glossary = __esm({
  "src/glossary.ts"() {
    init_tokens();
    GLOSSARY = [
      // 계정 · 인증
      [/로그인|사인\s*인|접속/, "login signin sign authenticate auth"],
      [/로그아웃/, "logout signout"],
      [/회원\s*가입|가입/, "signup register registration"],
      [/비밀\s*번호|패스워드|암호(?!화)/, "password passwd pw"],
      [/계정/, "account"],
      [/사용자|유저|회원/, "user member"],
      [/나이|연령|\d+\s*세|\d+\s*살|\d+\s*years?\s*old/i, "age"],
      [/보호자|부모/, "guardian parent"],
      [/동의/, "consent agree"],
      [/탈퇴/, "withdrawn withdraw deleted"],
      [/구매|구입/, "purchase buy order"],
      [/닉네임|별명/, "nickname"],
      [/요청/, "request"],
      [/포인트|적립금/, "point"],
      [/수량|개수/, "quantity count qty"],
      [/할인율/, "rate"],
      [/관리자/, "admin administrator"],
      [/권한|역할/, "permission role authorize authorization access"],
      [/인증/, "auth authenticate authentication verify verification"],
      [/인증\s*(?:번호|코드)|\botp\b/i, "code otp"],
      [/토큰/, "token"],
      [/세션/, "session"],
      [/이메일|메일/, "email mail"],
      [/전화|휴대폰|핸드폰/, "phone mobile"],
      // 상태 · 판단
      [/잠그|잠근|잠가|잠긴|잠금|잠기|잠겨/, "lock locked lockout"],
      [/해제|풀린|풀어|푼다/, "unlock release reset"],
      [/실패|틀리|틀린|오류|에러/, "fail failed failure error wrong invalid"],
      [/성공/, "success succeed ok"],
      [/올바른|올바르|맞는|맞아|맞으면|정확|유효/, "right valid correct"],
      [/잘못|유효하지|무효|올바르지\s*(?:않|못)|맞지\s*않/, "invalid wrong bad"],
      // 가입 · 비밀번호 규칙 (X 답글: 「항상 가입 흐름부터 눌러 본다」)
      [/숫자/, "digit number numeric"],
      [/특수\s*문자/, "special symbol"],
      [/대문자/, "uppercase upper"],
      [/소문자/, "lowercase lower"],
      [/\d+\s*자리/, "digit length"],
      [/약관/, "terms term agreement"],
      [/한\s*번만|하나만|\bonly once\b|\bonly one\b/i, "unique exists duplicate taken"],
      // 「같은 시간에 두 번 예약할 수 없다」는 2번까지가 아니라 두 번째를 막으라는 뜻이다
      [/두\s*번\s*(?:[가-힣]+\s*){0,2}?(?:수\s*없|못\s)/, "unique exists duplicate taken"],
      [/거부|거절|차단|막는|막아|금지/, "reject deny block forbid refuse"],
      [/허용|허락/, "allow permit"],
      [/만료|유효\s*기간|기한/, "expire expired expiry expiration ttl"],
      [/체험/, "trial"],
      [/끝나|끝난|끝날|종료/, "end ended finish expire"],
      [/\d+\s*일/, "day"],
      [/\d+\s*분/, "minute min ms sec"],
      [/\d+\s*시간/, "hour ms sec"],
      [/활동이?\s*없|유휴/, "idle inactive"],
      [/활성/, "active enable enabled activate"],
      // 상태 낱말 (status === 'canceled' · 'approved' · 'paid' 같은 조건과 견준다)
      [/취소/, "cancel canceled cancelled"],
      [/승인/, "approve approved"],
      [/결제\s*(?:가|를|이)?\s*(?:끝난|완료|된)|결제된|입금\s*(?:된|완료)/, "paid"],
      [/비활성|정지|중지/, "inactive disable disabled suspend deactivate"],
      // 횟수 · 시간 · 한도
      [/연속|반복|거듭/, "consecutive repeated repeat streak"],
      [/시도|재시도|다시\s*시도|\btr(?:y|ies|ied|ying)\b/i, "attempt retry try"],
      [/횟수|번\s*이상|회\s*이상|카운트/, "count counter times"],
      [/제한|한도|상한|최대|\b(?:max|maximum|limit(?:s|ed)?|capped|at most|up to)\b/i, "limit max maximum cap"],
      [/최소|하한|\b(?:min|minimum|at least)\b/i, "min minimum"],
      [/양수|\bpositive\b/i, "positive"],
      [/음수|\bnegative\b/i, "negative"],
      [/\blasts?\b|\bvalid for\b|유지/i, "ttl expire age duration"],
      [/시간\s*초과|타임아웃/, "timeout"],
      [/대기|지연/, "wait delay"],
      [/분\s*(?:동안|간|뒤|후)|시간\s*(?:동안|뒤|후)|초\s*(?:동안|뒤|후)|기간/, "duration minute second hour window period"],
      // 데이터 동작
      [/생성|만들|추가|등록/, "create add insert new register"],
      [/수정|변경|갱신|업데이트|바꾸|바꿀|바꾼|바꿔/, "update edit change modify"],
      [/삭제|지우|제거/, "delete remove destroy"],
      [/조회|불러|가져|읽/, "get fetch find load read list query"],
      [/저장/, "save store persist"],
      [/검색|찾/, "search find query"],
      [/정렬/, "sort order"],
      [/필터|걸러/, "filter"],
      [/페이지/, "page pagination paginate"],
      [/목록/, "list items page"],
      [/중복/, "duplicate unique exists"],
      [/검증|확인/, "validate verify check"],
      [/업로드|올리/, "upload"],
      [/다운로드|내려받/, "download"],
      [/파일/, "file"],
      [/이미지|사진/, "image photo"],
      // 알림 · 기록
      [/알림|통지/, "notify notification alert"],
      [/전송|보내|보낼|보낸|보냅|발송/, "send sent"],
      [/기록|로그(?!인|아웃)|이력/, "log audit history record"],
      [/집계|통계|지표/, "metric metrics count stat"],
      // 거래
      [/결제|지불/, "payment pay charge"],
      [/정액/, "fixed flat"],
      [/위시\s*리스트|찜/, "wishlist wish favorite"],
      [/환불/, "refund"],
      [/주문/, "order"],
      [/장바구니/, "cart basket"],
      [/가격|금액|요금|배송비/, "price amount fee cost total subtotal"],
      [/할인|쿠폰/, "discount coupon"],
      [/선물/, "gift present"],
      // 금액을 말하면 코드에서는 amount · price · total 같은 이름으로 나온다 (10만 원을 넘는 환불 ↔ amount > 100000)
      [/\d[\d,]*\s*(?:만|천|백)?\s*원|[$₩]\s*\d|\d\s*(?:dollars?|won|usd|krw)\b/i, "amount price total fee cost"],
      [/재고/, "stock inventory"],
      // 「배송이 시작된」은 발송(shipped), 「배송 완료」는 도착(delivered)이다. 둘을 섞으면 delivered 만 보는 조건이 「배송 시작」의 근거가 된다
      [/배송\s*(?:이|을|가)?\s*(?:시작|출발|중)|발송|출고/, "ship shipping dispatch"],
      [/배송\s*(?:이|을|가)?\s*완료|배달\s*(?:이|을|가)?\s*완료|도착/, "deliver delivered delivery"],
      [/배송(?!\s*(?:이|을|가)?\s*(?:시작|출발|중|완료))/, "shipping delivery ship"],
      // 글 · 화면
      [/댓글/, "comment reply"],
      [/게시|글\s*(?:쓰|작성)/, "post article"],
      [/길이|글자\s*수|자\s*이상|자\s*이하/, "length size"],
      [/비어|빈\s*값|필수/, "empty required blank"],
      [/형식|포맷/, "format pattern"],
      [/이름|성명/, "name"],
      [/제목/, "title subject"],
      [/내용|본문/, "content body text"],
      [/설명/, "description"],
      [/태그/, "tag"],
      [/첨부/, "attachment attach"],
      [/동영상|영상|비디오/, "video"],
      [/프로필/, "profile avatar"],
      [/자기\s*소개|소개\s*글/, "bio introduction"],
      // 「리뷰를 쓸 수 없다」의 쓰다는 작성, 「쿠폰을 쓸 수 없다」의 쓰다는 사용이라 둘 다 둔다
      [/작성/, "write"],
      [/쓸\s*수|쓰지|쓴다|쓰는|써서|쓰기/, "write use"],
      [/폴더/, "folder directory"],
      [/주소/, "address"],
      [/카테고리|분류/, "category"],
      [/메시지|쪽지/, "message"],
      [/채팅방|대화방/, "room chat channel"],
      [/채널/, "channel"],
      [/친구/, "friend"],
      [/좋아요/, "like"],
      [/리뷰|후기/, "review"],
      [/별점|평점/, "rating score"],
      // 사람 · 모임
      [/인원|\d+\s*명|참가자|참석자|구성원|멤버/, "member participant attendee people headcount user"],
      [/그룹|모임/, "group"],
      [/팀/, "team"],
      [/재설정|초기화/, "reset"],
      [/(?<!(?:특수|대|소|영)\s*)문자(?!\s*열)/, "sms text message"],
      [/하루|매일|오늘/, "day today daily"],
      [/입력/, "enter entry input"],
      [/회사|조직/, "company organization org"],
      [/초대/, "invite invitation"],
      [/투표/, "vote poll ballot"],
      [/응모|신청/, "entry apply application"],
      [/들어오|입장|참여|참가/, "join enter"],
      [/학생/, "student"],
      [/수업|강의/, "lesson course class"],
      [/시험/, "exam test"],
      [/점수/, "score"],
      // 예약 · 일정
      [/예약/, "reserve reservation book booking"],
      [/좌석/, "seat"],
      [/티켓|입장권/, "ticket"],
      [/일정/, "schedule"],
      [/회의/, "meeting"],
      [/출석/, "attendance"],
      // 상품 · 돈
      [/상품|제품|물건/, "product item goods"],
      [/구독/, "subscription subscribe"],
      [/요금제|플랜/, "plan"],
      [/잔액/, "balance"],
      [/송금|이체/, "transfer"],
      [/출금/, "withdraw withdrawal"],
      [/입금/, "deposit"],
      [/수수료/, "fee"],
      [/부가세|부가가치세|세금|\bvat\b/i, "vat tax"],
      [/청구|인보이스/, "invoice bill"],
      // 시스템
      [/작업|할\s*일/, "job task"],
      [/실행/, "run execute"],
      [/동시/, "concurrent concurrency parallel"],
      [/대기열/, "queue"],
      [/캐시/, "cache"],
      [/연결/, "connection connect"],
      [/프로젝트/, "project"],
      [/백업/, "backup"]
    ];
    WEAK = new Set([
      "should",
      "must",
      "shall",
      "can",
      "could",
      "may",
      "will",
      "would",
      "be",
      "able",
      "when",
      "then",
      "that",
      "it",
      "are",
      "was",
      "were",
      "has",
      "have",
      "had",
      "with",
      "without",
      "by",
      "at",
      "after",
      "before",
      "into",
      "than",
      "they",
      "their",
      "them",
      "you",
      "your",
      "we",
      "our",
      "do",
      "does",
      "done",
      "so",
      "only",
      "even",
      "also",
      "any",
      "all",
      "each",
      "every",
      "more",
      "most",
      "need",
      "make",
      "sure",
      "ensure",
      "please",
      "no",
      "there",
      "which",
      "who",
      "what",
      "user",
      "up",
      "least",
      "less",
      "fewer",
      "greater",
      "larger",
      "smaller",
      "over",
      "under",
      "above",
      "below",
      "between",
      "through",
      "including",
      "inclusive",
      "exclusive",
      "exceed",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten"
    ].map(stem));
  }
});

// src/engine.ts
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
function analyzeResult(opts) {
  const { key, repo, base: base2, ref } = opts;
  const from = opts.worktree ? mergeBase(repo, base2) : "";
  const lines2 = opts.worktree ? worktreeChangedLines(repo, from) : changedLines(repo, base2, ref);
  const read = (f) => {
    if (!opts.worktree) return showFile(repo, ref, f);
    const p = join(repo, f);
    return existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : null;
  };
  const files = {};
  const analyses = [];
  for (const f of opts.worktree ? worktreeChangedFiles(repo, from) : changedFiles(repo, base2, ref)) {
    if (!CODE_EXT.test(f)) continue;
    const text = read(f);
    if (text === null) continue;
    files[f] = text;
    if (TEST_FILE.test(f)) continue;
    analyses.push(analyzeFile(f, text, lines2.get(f) ?? null));
  }
  let allFiles = [];
  try {
    allFiles = trackedFiles(repo, opts.worktree ? "HEAD" : ref);
  } catch {
  }
  resolveRefs(
    analyses,
    (f) => {
      try {
        return read(f);
      } catch {
        return null;
      }
    },
    allFiles
  );
  const tests = opts.junit ? parseTestReport(readFileSync(opts.junit, "utf8")) : [];
  const testEdits = [];
  try {
    const fork = opts.worktree ? from : mergeBase(repo, base2, ref);
    const changed = (opts.worktree ? changedPaths(repo, fork) : changedPaths(repo, base2, ref)).filter((p) => CODE_EXT.test(p.path) && TEST_FILE.test(p.path)).map((p) => ({ file: p.path, before: showFile(repo, fork, p.old), after: p.deleted ? null : read(p.path) }));
    const others = () => allFiles.filter((f) => CODE_EXT.test(f) && TEST_FILE.test(f) && !changed.some((c) => c.file === f)).map((f) => ({ file: f, text: read(f) })).filter((x) => x.text !== null);
    testEdits.push(...diffTestFiles(changed, others));
  } catch {
  }
  let wip;
  if (opts.worktree) {
    const dirty = uncommittedFiles(repo).filter((f) => CODE_EXT.test(f)).sort();
    if (dirty.length) {
      const h = createHash("sha1");
      for (const f of dirty) h.update(f).update("\0").update(read(f) ?? "").update("\0");
      wip = h.digest("hex").slice(0, 7);
    }
  }
  return {
    key,
    label: setLabel(key),
    ref,
    sha: shortSha(repo, opts.worktree ? "HEAD" : ref),
    wip,
    files,
    analyses,
    units: analyses.flatMap((a) => a.units),
    dyn: analyses.flatMap((a) => a.dyn),
    tests,
    testEdits,
    perReq: {}
  };
}
function scoreUnit(req, u) {
  const why = [];
  let num2 = false;
  const set = new Set(req.tokens);
  const shared = [...new Set(u.tokens.filter((t) => set.has(t)))];
  const hits = req.auto ? req.concepts.filter((c) => c.some((t) => u.tokens.includes(t))).length : shared.length;
  let s = u.kind === "function" ? Math.min(hits, 1.5) : hits;
  if (shared.length) why.push(L(`\uACB9\uCE58\uB294 \uB2E8\uC5B4: ${shared.join(", ")}`, `shared words: ${shared.join(", ")}`));
  const parts = (u.cond?.parts ?? []).filter((p) => numberPart(req, p));
  const exact = parts.find((p) => litMatches(req, p.lit));
  const counted = req.numbers.length ? parts.find((p) => p.lit !== void 0 && leftHits(req, p.left) > 0) : void 0;
  if (exact) {
    s += 2;
    num2 = true;
    why.push(L(`\uC22B\uC790 ${exact.lit} (\uC694\uAD6C\uC0AC\uD56D ${req.numbers.join("\xB7")})`, `number ${exact.lit} (requirement: ${req.numbers.join(", ")})`));
  } else if (counted) {
    s += 2;
    num2 = true;
    why.push(L(`\uC22B\uC790 \uC870\uAC74 ${counted.left} \u2194 ${counted.lit} (\uC694\uAD6C\uC0AC\uD56D ${req.numbers.join("\xB7")})`, `numeric condition ${counted.left} \u2194 ${counted.lit} (requirement: ${req.numbers.join(", ")})`));
  }
  if (u.guard && (req.guardCue || req.needsCheck && hits > 0)) {
    s += 1;
    why.push(L("\uAC70\uBD80 \uBB38\uC7A5 \u2194 \uC870\uAC74 \uB4A4 throw/return", "rejection wording \u2194 throw/return after the condition"));
  }
  if (u.changed) s += 0.5;
  return { score: s, why, num: num2 };
}
function moreSpecific(u, num2, best) {
  if (u.kind !== best.u.kind) return u.kind === "condition";
  if (num2 !== best.num) return num2;
  return u.endLine - u.startLine < best.u.endLine - best.u.startLine;
}
function configNamed(req, f) {
  const said = (t) => tokenize(f.p.left).includes(t) || f.u.tokens.includes(t);
  const subject = req.tokens.filter((t) => !GENERIC.has(t) && !MEASURE.has(t));
  if (subject.length) return subject.some(said);
  return req.tokens.filter((t) => !GENERIC.has(t)).some(said) || req.tokens.some((t) => tokenize(f.p.left).includes(t));
}
function dupSignal(text, dupWords) {
  if (tokenize(text.replace(ERROR_TEXT, "Error(")).some((t) => dupWords.has(t))) return true;
  for (const m of text.matchAll(ERROR_TEXT)) {
    const words2 = tokenize(m[1].replace(/['"`]/g, "").replace(/_/g, " "));
    if (words2.some((w, i) => STRONG_DUP.has(w) && !["not", "no", "non"].includes(words2[i - 1] ?? ""))) return true;
  }
  return false;
}
function stateMismatch(req, text) {
  const lits = [];
  for (const m of text.matchAll(STATE_LIT)) lits.push(m[2] ?? m[3]);
  if (!lits.length) return false;
  const words2 = [.../* @__PURE__ */ new Set([...req.tokens, ...req.concepts.flat()])].filter((w) => w.length >= 3);
  const near2 = (a, b) => {
    const k = Math.min(a.length, b.length, 5);
    return k >= 3 && a.slice(0, k) === b.slice(0, k);
  };
  const litWords = lits.flatMap((l) => tokenize(l)).map((w) => IRREGULAR[w] ?? w);
  return !litWords.some((w) => words2.some((r) => near2(w, r) || near2(IRREGULAR[r] ?? r, w)));
}
function nameScore(subject, u) {
  const fn = new Set(tokenize(u.fn ?? "").filter((t) => subject.has(t)));
  const file = new Set(tokenize(u.file.split("/").pop().replace(/\.[^.]+$/, "")).filter((t) => subject.has(t) && !fn.has(t)));
  return fn.size * 2 + file.size;
}
function sameTarget(req, f) {
  const hits = leftHits(req, f.p.left);
  const said = new Set(req.tokens);
  const subjectAround = () => {
    const subject = req.tokens.filter((t) => !GENERIC.has(t) && !WEAK_NAME.has(t) && !TIME_WORDS.has(t));
    const around = /* @__PURE__ */ new Set([...f.u.tokens, ...tokenize(f.u.fn ?? "")]);
    return subject.some((t) => around.has(t));
  };
  if (!hits) {
    const toks = tokenize(f.p.left);
    if (f.p.source === "config" && toks.length > 0 && toks.every((t) => GENERIC.has(t) || WEAK_NAME.has(t)) && subjectAround()) return true;
    return f.p.source === "compare" && f.p.thenKind === "reject" && f.p.preAdd && subjectAround();
  }
  const bare = stem(f.p.left.split(/[.\s]/).pop().toLowerCase());
  const ownAge = (t) => t === AGE && bare === AGE && /\bages?\b|나이|연령/i.test(req.text);
  if (!tokenize(f.p.left).some((t) => said.has(t) && (!WEAK_NAME.has(t) || ownAge(t))) && !subjectAround()) return false;
  if (f.p.source === "config" && !configNamed(req, f)) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t));
  const left = new Set(tokenize(f.p.left));
  if (!specific.length || hits >= 2 || specific.some((t) => left.has(t))) return true;
  const fnWords = tokenize(f.u.fn ?? "");
  return specific.some((t) => f.u.tokens.includes(t) || f.p.source === "compare" && fnWords.includes(t));
}
function timeDiffTarget(req, c, f) {
  if (!c.unit || !TIME_UNIT.has(c.unit)) return false;
  const specific = req.tokens.filter((t) => !GENERIC.has(t) && !TIME_WORDS.has(t));
  if (f.p.source === "config" && /^(?:setTimeout|setInterval|sleep|delay|wait)\b/.test(f.p.left)) return specific.some((t) => f.u.tokens.includes(t));
  if (f.p.source !== "compare") return false;
  const left = f.p.left;
  if (!/[^-]-[^-=]/.test(left) || (left.match(new RegExp(TIME_NAME.source, "g")) ?? []).length < 1) return false;
  return specific.some((t) => f.u.tokens.includes(t));
}
function judgeConstraints(req, units2) {
  const all = units2.flatMap((u) => (u.cond?.parts ?? []).map((p) => ({ u, p, score: scoreUnit(req, u).score })));
  const subject = subjectOf(req);
  const rank = (f) => (leftHits(req, f.p.left) * 1e3 + (f.u.changed ? 500 : 0) + SOURCE_RANK[f.p.source] + f.score) * 16 + Math.min(15, nameScore(subject, f.u));
  const used = /* @__PURE__ */ new Set();
  const out = /* @__PURE__ */ new Map();
  const chosen = /* @__PURE__ */ new Map();
  const sameValue = (c, f) => {
    const v = partValue(f.p);
    return !used.has(f.p) && v !== void 0 && matchScale(c, v) !== null;
  };
  const decidingLine = (c, f) => {
    if (f.p.source !== "config") return f;
    const name = f.p.left.split(".").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const uses = new RegExp(`(^|[^\\w$])${name}($|[^\\w$])`);
    return all.filter((g) => (g.p.source === "compare" || g.p.source === "loop") && fitsUnit(c, g.p) && sameValue(c, g) && uses.test(g.p.expr)).sort((a, b) => rank(b) - rank(a))[0] ?? f;
  };
  const take = (c, found) => {
    const f = decidingLine(c, found);
    used.add(f.p);
    chosen.set(c, f.p);
    out.set(c, { b: judge(c, f.p), u: f.u });
  };
  for (const c of req.constraints) {
    const exact = all.filter((f) => fitsUnit(c, f.p) && sameValue(c, f) && (sameTarget(req, f) || timeDiffTarget(req, c, f))).sort((a, b) => rank(b) - rank(a));
    if (exact[0]) take(c, exact[0]);
  }
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    const others = all.filter((f) => !used.has(f.p) && fitsUnit(c, f.p) && (sameTarget(req, f) || timeDiffTarget(req, c, f)) && (f.p.op !== "!==" || c.rel === "eq") && (f.p.op !== "===" || c.rel === "eq" || f.p.source === "config")).filter((f) => f.p.lit === void 0 || f.p.source === "loop" || c.unit === "pct" || c.rel === "eq" && f.p.op === "===" || !(Math.abs(f.p.lit) <= 1 && c.value >= 3)).filter((f) => f.p.lit === void 0 || sameThing(c, f.p) || timeDiffTarget(req, c, f)).sort((a, b) => Number(b.p.lit !== void 0) - Number(a.p.lit !== void 0) || rank(b) - rank(a));
    if (others[0]) take(c, others[0]);
  }
  for (const c of req.constraints) {
    if (out.has(c)) continue;
    if (c.window && c.value === 1) {
      const cal = all.find((g) => g.p.calendar === c.unit && [...chosen.values()].includes(g.p));
      if (cal) {
        out.set(c, { b: calendarBoundary(c, cal.p), u: cal.u });
        continue;
      }
    }
    const named = (f) => f.p.source !== "config" || configNamed(req, f);
    const exactly = (f) => {
      const v = partValue(f.p);
      return v !== void 0 && c.scales.some((k) => Math.abs(v - c.value * k) < 1e-9);
    };
    const loose = all.filter((f) => fitsUnit(c, f.p) && sameValue(c, f) && exactly(f) && f.score >= 3 && named(f)).sort((a, b) => rank(b) - rank(a));
    if (loose[0]) take(c, loose[0]);
    else out.set(c, { b: missingBoundary(c), u: null });
  }
  for (const c of req.constraints) {
    const got = out.get(c);
    const p = chosen.get(c);
    if (got.b.ok !== true || !p || p.source !== "config") continue;
    const family = (x) => x.source;
    const rival = all.find(
      (f) => !used.has(f.p) && f.p !== p && family(f.p) === family(p) && f.p.lit !== void 0 && f.p.op === p.op && partValue(f.p) !== void 0 && matchScale(c, partValue(f.p)) === null && sameName(f.p.left, p.left) && sameThing(c, f.p) && !(Math.abs(f.p.lit) <= 1 && c.value >= 3)
    );
    if (rival) out.set(c, { ...got, b: { ...got.b, ok: null, why: "conflict", say: conflictSay(got.b, rival.u.file, rival.p) } });
  }
  return req.constraints.map((c) => out.get(c));
}
function findEvidence(req, units2, fields = []) {
  let best = null;
  for (const u of units2) {
    const { score, why, num: num2 } = scoreUnit(req, u);
    if (!best || score > best.score || score === best.score && moreSpecific(u, num2, best)) best = { u, score, why, num: num2 };
  }
  const judged = judgeConstraints(req, units2);
  if (!judged.length && FIXED_REQ.test(req.text) && FIXED_MONEY.test(req.text)) {
    const fixed = units2.filter((u) => u.cond?.fixedBranch);
    const pick2 = fixed.find((u) => u.cond.fixedBranch === "percent") ?? fixed[0];
    if (pick2) {
      const s0 = scoreUnit(req, pick2);
      const ev2 = { unit: pick2, score: s0.score, status: "\uBC1C\uACAC", why: [...s0.why, L("\uC815\uC561 \uAC08\uB798\uC758 \uACC4\uC0B0\uC2DD", "the fixed-amount branch")] };
      if (pick2.cond.fixedBranch === "percent") {
        const b = {
          required: 0,
          attempts: null,
          ok: false,
          before: null,
          kind: "value",
          say: { ko: "\uC815\uC561\uC778\uB370 \uBE44\uC728(\xF7100)\uB85C \uACC4\uC0B0\uD568", en: "computes the fixed amount as a percentage (\xF7100)" },
          want: { ko: "\uAE08\uC561\uC744 \uADF8\uB300\uB85C \uBE80\uB2E4", en: "subtract the amount itself" },
          line: pick2.startLine
        };
        ev2.boundaries = [b];
        ev2.boundary = b;
      }
      return ev2;
    }
  }
  const worst = [...judged].sort((a, b) => severity(a.b) - severity(b.b))[0];
  if (!best || best.score < 1) {
    if (!worst?.u) return { unit: null, score: best?.score ?? 0, status: "\uBBF8\uBC1C\uACAC", why: [], boundaries: judged.length ? judged.map((j) => j.b) : void 0, boundary: worst?.b };
  }
  let unit = worst?.u ?? best.u;
  if (!judged.length && unit.kind === "function" && req.needsCheck && !isUniqueReq(req)) {
    const words3 = new Set([...req.tokens, ...req.concepts.flat()].filter((t) => !GENERIC.has(t) && !FILLER.has(t)));
    const fnWords = new Set(tokenize(unit.fn ?? ""));
    const host = unit;
    const inner = units2.filter((u) => u.kind === "condition" && u.guard && u.file === host.file && u.fn === host.fn && tokenize(u.text).some((t) => words3.has(t) && !fnWords.has(t))).map((u) => ({ u, score: scoreUnit(req, u).score })).sort((a, b) => b.score - a.score)[0];
    if (inner) unit = inner.u;
  }
  let foreign = false;
  const isFn = (file, fn) => units2.some((x) => x.kind === "function" && x.file === file && x.fn === fn);
  const configName = unit.kind === "condition" && !isFn(unit.file, unit.fn) ? (unit.cond?.parts ?? []).find((p) => p.source === "config")?.left.split(".").pop() : void 0;
  if (unit.kind === "condition" && (unit.guard || configName || judged.length > 0 && isFn(unit.file, unit.fn))) {
    const subject = subjectOf(req);
    const callee2 = unit.fn.split(".").pop();
    const users = units2.filter((x) => x.kind === "function" && (configName ? x.file === unit.file && !!x.refs?.includes(configName) : !!x.calls?.includes(callee2)));
    if (configName && !users.length) {
    } else {
      const owners = new Set(users.map((x) => `${x.file}#${x.fn}`));
      const mine = users.length ? Math.max(...users.map((x) => nameScore(subject, x))) : nameScore(subject, unit);
      const pool = units2.filter((u) => u.fn !== unit.fn && !owners.has(`${u.file}#${u.fn}`) && nameScore(subject, u) > mine && (!judged.length || u.file === unit.file));
      if (pool.length) {
        const top = Math.max(...pool.map((u) => nameScore(subject, u)));
        const theirs = pool.filter((u) => nameScore(subject, u) === top);
        const words3 = /* @__PURE__ */ new Set([...req.tokens, ...req.concepts.flat()]);
        const said = (u) => {
          const own = new Set(tokenize(u.fn ?? ""));
          return tokenize(u.text).some((t) => words3.has(t) && !own.has(t) && !GENERIC.has(t));
        };
        const same = (u) => u.text.replace(/\s+/g, " ") === unit.text.replace(/\s+/g, " ");
        const check2 = theirs.filter((u) => u.kind === "condition" && u.guard && (said(u) || same(u))).map((u) => ({ u, score: scoreUnit(req, u).score })).sort((a, b) => b.score - a.score)[0];
        if (check2) {
          if (!judged.length) unit = check2.u;
        } else {
          const own = theirs.map((u) => ({ u, score: scoreUnit(req, u).score })).sort((a, b) => b.score - a.score)[0];
          if (own && own.score >= 1) {
            unit = own.u;
            foreign = true;
          }
        }
      }
    }
  }
  let dupInner = false;
  if (!judged.length && unit.kind === "function" && isUniqueReq(req)) {
    const dupWords2 = /* @__PURE__ */ new Set([...req.concepts.find((g) => g.includes(UNIQUE)) ?? [], ...DUP_GUARD]);
    const inner = units2.find((u) => u.kind === "condition" && u.guard && u.file === unit.file && u.startLine >= unit.startLine && u.endLine <= unit.endLine && dupSignal(u.text, dupWords2));
    if (inner) {
      unit = inner;
      dupInner = true;
    }
  }
  const s = unit === best?.u ? best : { ...scoreUnit(req, unit), u: unit };
  const onlyName = req.needsCheck && !judged.length && unit.kind === "function";
  const around = /* @__PURE__ */ new Set([...unit.tokens, ...tokenize(unit.fn ?? "")]);
  const ideas = req.concepts.filter((g) => !g.every((t) => GENERIC.has(t) || FILLER.has(t)));
  const covered = ideas.filter((g) => g.some((t) => around.has(t))).length;
  const thin = req.auto && !judged.length && (unit.kind === "function" || unit.kind === "condition" && !unit.guard) && ideas.length >= 3 && covered * 2 < ideas.length;
  const notDuplicateCheck = !req.constraints.length && req.concepts.some((g) => g.includes(UNIQUE)) && unit.kind === "condition" && (unit.cond?.parts ?? []).some((p) => p.lit !== void 0 && Math.abs(p.lit) > 1);
  const otherState = !judged.length && unit.kind === "condition" && stateMismatch(req, unit.text);
  const dupWords = /* @__PURE__ */ new Set([...req.concepts.find((g) => g.includes(UNIQUE)) ?? [], ...DUP_GUARD]);
  const notDupGuard = isUniqueReq(req) && !dupInner && unit.kind === "condition" && !dupSignal(unit.text, dupWords) && !/\.(?:some|includes|has|find|findFirst|findUnique|indexOf|exists?|count)\s*\(/.test(unit.text);
  const found = !onlyName && !thin && !notDuplicateCheck && !foreign && !otherState && !notDupGuard && (judged.some((j) => j.u) || s.score >= 2 || dupInner);
  const words2 = new Set(req.tokens);
  const unchecked = found && !judged.length && (req.guardCue || req.needsCheck) ? fields.find((f) => !f.checked && tokenize(f.name).some((t) => words2.has(t)) && !(f.file === unit.file && f.line >= unit.startLine && f.line <= unit.endLine)) : void 0;
  const perPeriod = PER_PERIOD.test(req.text) && !req.constraints.some((c) => c.window) && req.constraints.some((c) => (c.rel === "lte" || c.rel === "lt") && (c.unit === "cnt" || c.unit === "qty" || c.unit === null));
  const noWindow = (
    // 오류 글(throw new Error('DAILY_LIMIT'))의 「daily」는 세는 값이 아니므로 따옴표 안 글은 빼고 본다.
    found && perPeriod && judged.length > 0 && unit.kind === "condition" && !unit.cond?.parts?.some((p) => p.timed) && !PERIOD_NAME.test(unit.text.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")) && !units2.some((u) => u.file === unit.file && u.fn === unit.fn && u.kind === "condition" && TIME_CMP.test(u.text))
  );
  const status = found && !unchecked && !noWindow ? "\uBC1C\uACAC" : "\uC77C\uBD80 \uBC1C\uACAC";
  const ev = { unit, score: s.score, status, why: s.why };
  if (noWindow) ev.noWindow = true;
  if (unchecked) {
    const at = `${unchecked.file.split("/").pop()}:${unchecked.line}`;
    ev.unchecked = { ko: `${unchecked.name} \uC744(\uB97C) \uAC80\uC0AC \uC5C6\uC774 \uBC1B\uB294 \uACF3\uC774 \uC788\uC74C (${at})`, en: `${unchecked.name} is accepted without a check at ${at}` };
    ev.why = [...s.why, ev.unchecked.ko];
  }
  if (judged.length) {
    ev.boundaries = judged.map((j) => j.b);
    ev.boundary = worst.b;
  }
  const terms = unit.cond?.andTerms;
  if (req.only && unit.guard && terms) {
    const extra = terms.filter((t) => leftHits(req, t) === 0);
    if (extra.length) ev.caveat = { ko: `\uB2E4\uB978 \uC870\uAC74(${extra.join(", ")})\uC774 \uD568\uAED8 \uAC78\uB824 \uC788\uC5B4 \uD56D\uC0C1 \uC801\uC6A9\uB418\uC9C0 \uC54A\uC744 \uC218 \uC788\uC74C`, en: `another condition (${extra.join(", ")}) is attached, so this may not always apply` };
  }
  return ev;
}
function ordinals(name) {
  const out = [];
  for (const m of name.matchAll(/\b(\d+)(?:st|nd|rd|th)\b|(\d+)\s*(?:번째|회째)/gi)) out.push(Number(m[1] ?? m[2]));
  for (const m of name.matchAll(/\b([a-z]+)\b/gi)) {
    const w = m[1].toLowerCase();
    if (!ORD_EN[w]) continue;
    if (w === "second" && (/(?:\d|one|per|each|every|half a|a few)\s*$/i.test(name.slice(0, m.index)) || !/^\s+(?!(?:later|after|before|ago|delay|timeout|window|interval|passes|elapses)\b)[a-z]/i.test(name.slice(m.index + w.length)))) continue;
    out.push(ORD_EN[w]);
  }
  for (const m of name.matchAll(/(?<![가-힣])(열다섯|열한|열두|열세|열네|다섯|여섯|일곱|여덟|아홉|스무|첫|두|세|네|열)\s*번째/g)) out.push(ORD_KO[m[1]]);
  return out;
}
function boundaryTest(req, name) {
  const ords = ordinals(name);
  if (!ords.length) return false;
  return req.constraints.some((c) => (c.unit === "cnt" || c.unit === "qty" || c.unit === null) && !c.window && (c.rel === "lte" && ords.includes(c.value + 1) || c.rel === "lt" && ords.includes(c.value)));
}
function mapTests(req, tests, ev) {
  const settled = !!ev.boundaries?.length && ev.boundaries.every((b) => b.ok === true);
  const sameRule = (t) => {
    if (!settled) return false;
    const names = /* @__PURE__ */ new Set([...tokenize(normalizePhrases(plainNumbers(t.name))), ...conceptsFor(t.name).flat()]);
    const nums = namedNumbers(t.name);
    const firstRejected = (c, n) => NEGATIVE_TEST.test(t.name) && (c.rel === "lte" && n === c.value + 1 || c.rel === "lt" && n === c.value);
    return req.constraints.some((c) => nums.some((n) => matchScale(c, n) !== null || firstRejected(c, n))) && req.concepts.some((g) => g.some((x) => !BROAD.has(x) && names.has(x)));
  };
  const deciding = ev.status === "\uBC1C\uACAC" && ev.unit?.kind === "condition" && !req.constraints.length;
  const testWords = (name) => /* @__PURE__ */ new Set([...tokenize(normalizePhrases(plainNumbers(name))), ...conceptsFor(name).flat()]);
  const twiceOk = (t) => !isUniqueReq(req) || TWICE_TEST.test(t.name);
  const agrees = (t) => {
    if (!deciding || !twiceOk(t)) return false;
    const names = testWords(t.name);
    const code = new Set(ev.unit.tokens);
    const words2 = /* @__PURE__ */ new Set([...req.tokens, ...req.concepts.flat()]);
    const shared = [...names].some((x) => code.has(x) && words2.has(x) && !BROAD.has(x));
    const covered = req.concepts.filter((g) => g.some((x) => names.has(x))).length;
    return shared && covered >= 2 && covered * 2 >= req.concepts.length && (!req.guardCue || NEGATIVE_TEST.test(t.name));
  };
  const capReq = req.constraints.some((c) => (c.rel === "lte" || c.rel === "lt") && !c.window && (c.unit === "cnt" || c.unit === "qty" || c.unit === null && PER_PERIOD.test(req.text)));
  const limitOk = (t) => !capReq || NEGATIVE_TEST.test(t.name) || LIMIT_TEST.test(t.name) || namedNumbers(t.name).length > 0;
  if (!req.auto) {
    const set = /* @__PURE__ */ new Set([...req.tokens, ...req.numbers.map(String)]);
    const need = Math.min(2, set.size);
    const negOk = (t) => !req.guardCue || NEGATIVE_TEST.test(t.name);
    const edge = (t) => boundaryTest(req, t.name) && NEGATIVE_TEST.test(t.name) ? 1 : 0;
    return tests.filter((t) => sameRule(t) || agrees(t) || twiceOk(t) && negOk(t) && limitOk(t) && new Set(tokenize(plainNumbers(t.name)).filter((x) => set.has(x))).size + edge(t) >= need);
  }
  const groups = [...req.concepts, ...req.numbers.map((n) => [String(n)])];
  const scope = new Set([...req.text.matchAll(/\b(?:per|each|every)\s+([a-z]+)/gi)].map((m) => stem(m[1].toLowerCase())).filter((s) => !TIME_WORDS.has(s) && !WEAK_NAME.has(s)));
  return tests.filter((t) => {
    if (sameRule(t) || agrees(t)) return true;
    const names = testWords(t.name);
    if (groups.length < 2 || !twiceOk(t) || !limitOk(t)) return false;
    if (req.guardCue && !NEGATIVE_TEST.test(t.name)) return false;
    const uniqueSaid = isUniqueReq(req) && TWICE_TEST.test(t.name);
    const real = groups.filter((g) => !g.every((x) => FILLER.has(x) || SAME_AGAIN.has(x) || scope.has(x)));
    if (boundaryTest(req, t.name) && NEGATIVE_TEST.test(t.name) && real.some((g) => !/^\d/.test(g[0]) && g.some((x) => names.has(x)))) return true;
    const covered = real.filter((g) => g.some((x) => names.has(x)) || uniqueSaid && g.includes(UNIQUE)).length;
    return covered >= 2 && covered / real.length >= 2 / 3;
  });
}
function editLinked(req, e, mapped, ev) {
  if (mapped.some((t) => sameTestName(t.name, e.full) || sameTestName(t.name, e.title))) return true;
  const names = [e.full, e.title, ...e.was ? [e.was] : []];
  return names.some((name) => mapTests(req, [{ name, status: "pass", message: "" }], ev).length > 0);
}
function testStatus(ts3) {
  if (ts3.some((t) => t.status === "fail")) return "\uC2E4\uD328";
  if (ts3.some((t) => t.status === "pass")) return "\uD1B5\uACFC";
  return "\uBBF8\uC2E4\uD589";
}
function evaluate(sets, reqs, repo, base2) {
  for (const s of sets) {
    for (const r of reqs) {
      const evidence = findEvidence(r, s.units, s.analyses.flatMap((a) => a.fields ?? []));
      const mapped = mapTests(r, s.tests, evidence);
      const rr = { evidence, tests: mapped, testStatus: testStatus(mapped) };
      const edits = (s.testEdits ?? []).filter((e) => editLinked(r, e, mapped, evidence));
      if (edits.length) rr.edits = edits;
      s.perReq[r.id] = rr;
    }
  }
  const summaries = reqs.map((r) => summarize(r, sets));
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), repo, base: base2, sets, reqs, summaries };
}
function summarize(req, sets) {
  const notes = [];
  let relation = { kind: "\uB2E8\uC77C \uACB0\uACFC", detail: "" };
  if (sets.length === 2) {
    const [A, B] = sets;
    const a = A.perReq[req.id].evidence;
    const b = B.perReq[req.id].evidence;
    if (!a.unit || !b.unit) {
      relation = { kind: "\uBE44\uAD50 \uC870\uAC74 \uB2E4\uB984", detail: L("\uD55C\uCABD\uC5D0\uC11C \uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD588\uB2E4.", "No implementation evidence was found on one side.") };
    } else if (a.unit.cond && b.unit.cond) {
      const sa = `${a.unit.cond.op ?? ""}${a.unit.cond.lit ?? a.unit.cond.expr}`;
      const sb = `${b.unit.cond.op ?? ""}${b.unit.cond.lit ?? b.unit.cond.expr}`;
      relation = sa === sb ? { kind: "\uC77C\uCE58", detail: L(`\uB458 \uB2E4 ${a.unit.cond.expr}`, `both ${a.unit.cond.expr}`) } : { kind: "\uBD88\uC77C\uCE58", detail: `A ${a.unit.cond.expr} \xB7 B ${b.unit.cond.expr}` };
    } else {
      relation = { kind: "\uC77C\uCE58", detail: L("\uB458 \uB2E4 \uAC19\uC740 \uC885\uB958\uC758 \uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC558\uB2E4.", "Both sides have the same kind of implementation evidence.") };
    }
  }
  const evs = sets.map((s) => s.perReq[req.id]);
  for (const [i, s] of sets.entries()) {
    for (const b of evs[i].evidence.boundaries ?? []) if (b.ok !== true) notes.push(boundaryNote(b, s.label));
    const caveat = evs[i].evidence.caveat;
    if (caveat) notes.push(`${s.label}: ${pick(caveat)}`);
  }
  const anyFail = evs.some((e) => e.testStatus === "\uC2E4\uD328");
  const allPass = evs.every((e) => e.testStatus === "\uD1B5\uACFC");
  const allFound = evs.every((e) => e.evidence.status === "\uBC1C\uACAC");
  const boundaryBad = evs.some((e) => e.evidence.boundaries?.some((b) => b.ok === false));
  const unsettled = evs.some((e) => e.evidence.caveat || e.evidence.boundaries?.some((b) => b.ok === null));
  let overall;
  if (relation.kind === "\uBD88\uC77C\uCE58" || boundaryBad || anyFail && !allPass && evs.some((e) => e.testStatus === "\uD1B5\uACFC")) overall = "\uB2E4\uB984";
  else if (anyFail) overall = "\uC2E4\uD328";
  else if (allFound && allPass && !unsettled) overall = "\uD655\uC778\uB428";
  else overall = "\uBBF8\uD655\uC778";
  return { req, relation, overall, notes };
}
var CODE_EXT, TEST_FILE, litMatches, leftHits, COUNTED, COUNT_LEFT, PERIOD_UNITS, fitsUnit, numberPart, SAME_THING, sameThing, SOURCE_RANK, GENERIC, MEASURE, FILLER, UNIQUE, PER_PERIOD, PERIOD_NAME, TIME_CMP, SAME_AGAIN, FIXED_REQ, FIXED_MONEY, TWICE_TEST, isUniqueReq, DUP_GUARD, ERROR_TEXT, STRONG_DUP, STATE_LIT, IRREGULAR, subjectOf, AGE, WEAK_NAME, TIME_UNIT, TIME_NAME, TIME_WORDS, QUALIFIER, nameCore, sameName, conflictSay, severity, ORD_EN, ORD_KO, NEGATIVE_TEST, plainNumbers, WORD_NUMBER, ORDINAL, namedNumbers, LIMIT_TEST, BROAD, sameTestName;
var init_engine = __esm({
  "src/engine.ts"() {
    init_analyze();
    init_numeric();
    init_git();
    init_tests();
    init_testedits();
    init_tokens();
    init_glossary();
    init_i18n();
    CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
    TEST_FILE = /(\.test\.|\.spec\.|__tests__\/|\/tests?\/)/;
    litMatches = (req, lit) => lit !== void 0 && (req.numbers.some((n) => Math.abs(n - lit) <= 1) || req.constraints.some((c) => matchScale(c, lit) !== null));
    leftHits = (req, left) => {
      const set = new Set(req.tokens);
      return new Set(tokenize(left).filter((t) => set.has(t))).size;
    };
    COUNTED = ["cnt", "qty"];
    COUNT_LEFT = /\.(?:length|size)\b/;
    PERIOD_UNITS = ["sec", "min", "hour", "day", "week", "month"];
    fitsUnit = (c, p) => !(p.strLen && COUNTED.includes(c.unit)) && !(p.listLen && c.unit === "char") && !((p.listLen || p.preAdd || COUNT_LEFT.test(p.left)) && PERIOD_UNITS.includes(c.unit));
    numberPart = (req, p) => !p.strLen && !p.listLen || !req.constraints.length || req.constraints.some((c) => fitsUnit(c, p));
    SAME_THING = {
      money: /total|price|amount|fee|cost|sum|subtotal|balance|pay|coupon|voucher|discount|credit/i,
      age: /age/i,
      char: /length|len\b|size|chars?/i,
      day: /day|date|expir|age|ttl|elapsed|since/i,
      week: /week|day|date|expir|age|ttl|elapsed/i,
      month: /month|date|expir|age/i,
      hour: /hour|ms$|sec|time|ttl|age|idle|elapsed|expir|duration/i,
      min: /min|ms$|sec|time|ttl|age|idle|elapsed|expir|duration/i,
      sec: /sec|ms$|time|ttl|age|idle|elapsed|expir|duration/i,
      pct: /rate|percent|ratio|discount|pct/i,
      cnt: /count|attempt|fail|retr|tries|times|limit|max|request|hits|length|size/i,
      qty: /length|size|count|qty|quantity|limit|max|num|total|items?|stock/i
    };
    sameThing = (c, p) => p.source !== "compare" && p.source !== "config" || !c.unit || !SAME_THING[c.unit] || SAME_THING[c.unit].test(p.left);
    SOURCE_RANK = { compare: 200, loop: 200, schema: 100, cap: 100, config: 0 };
    GENERIC = new Set(["length", "len", "size", "count", "max", "min", "limit", "value", "number", "num", "id", "item", "data", "rate", "ratio", "percent"].map(stem));
    MEASURE = new Set(["fee", "price", "cost", "amount", "total", "sum", "charge", "tax"].map(stem));
    FILLER = new Set(["once", "per", "each", "every", "only", "time", "twice"].map(stem));
    UNIQUE = stem("unique");
    PER_PERIOD = /\b(?:per|a|an|each|every)\s+(?:day|hour|minute|week|month)\b|\b(?:daily|hourly|weekly|monthly)\b|하루|매일|일일|시간당|분당|주당|일주일|한\s*달|매달|매월/i;
    PERIOD_NAME = /today|daily|per_?day|this_?(?:day|week|month|hour)|hourly|weekly|monthly|per_?(?:hour|minute|week|month)|recent|window|since/i;
    TIME_CMP = /\bnow\b\s*-|Date\.now\(\)\s*-|getTime\(\)|isSame(?:Day|Hour|Week|Month)|startOf|toDateString|86400|3600|60\s*\*\s*60|24\s*\*\s*60/;
    SAME_AGAIN = new Set(["same", "again"].map(stem));
    FIXED_REQ = /정액|\bfixed\b|\bflat\b/i;
    FIXED_MONEY = /할인|쿠폰|금액|discount|coupon|voucher|amount|\boff\b/i;
    TWICE_TEST = /twice|second|again|duplicat|already|only (?:one|once)|more than once|\bused\b|reus|re-us|redeemed|consumed|retr(?:y|ied|ies|ying)|resen[dt]|repeat|same key|두\s*번|중복|이미|다시|반복|한\s*번만|하나만|사용한|사용된|재사용/i;
    isUniqueReq = (req) => !req.constraints.length && req.concepts.some((g) => g.includes(UNIQUE));
    DUP_GUARD = new Set(["uniqu", "exist", "duplicat", "taken", "prev", "previou", "already", "seen", "done", "processed", "found", "used", "consumed", "redeemed", "claimed"].map(stem));
    ERROR_TEXT = /\b(?:Error|Exception|[A-Z]\w*(?:Error|Exception))\s*\(\s*('[^']*'|"[^"]*"|`[^`]*`)/g;
    STRONG_DUP = new Set(["already", "duplicat", "duplicate", "taken", "exist", "exists", "used", "redeemed", "consumed", "claimed", "uniqu", "conflict"].map(stem));
    STATE_LIT = /([A-Za-z_.]*(?:status|state|stage|phase|role|plan|tier))\s*[!=]==?\s*['"`]([\w-]+)['"`]|['"`]([\w-]+)['"`]\s*[!=]==?\s*([A-Za-z_.]*(?:status|state|stage|phase|role|plan|tier))\b/gi;
    IRREGULAR = { paid: "pay", sent: "send", sold: "sell" };
    subjectOf = (req) => new Set([...req.tokens, ...req.concepts.flat()].filter((t) => !GENERIC.has(t) && !FILLER.has(t) && !WEAK_NAME.has(t) && !TIME_WORDS.has(t)));
    AGE = stem("age");
    WEAK_NAME = new Set(["day", "minute", "min", "ms", "sec", "second", "hour", "week", "month", "age"].map(stem));
    TIME_UNIT = /* @__PURE__ */ new Set(["sec", "min", "hour", "day", "week", "month"]);
    TIME_NAME = /\bDate\.now\(\)|\bnow\b|\b\w*(?:At|Time|time|Date|date|Seen|seen)\b|\bt\b/;
    TIME_WORDS = new Set(["day", "minute", "min", "ms", "sec", "second", "hour", "week", "month", "duration", "window", "period", "time"].map(stem));
    QUALIFIER = new Set(["default", "def", "option", "opt", "config", "cfg", "setting", "this", "self", "props", "param", "arg"].map(stem));
    nameCore = (left) => tokenize(left).filter((t) => !QUALIFIER.has(t)).sort().join(" ");
    sameName = (a, b) => nameCore(a) !== "" && nameCore(a) === nameCore(b);
    conflictSay = (b, file, p) => {
      const here2 = `${file.split("/").pop()}:${p.line}`;
      return {
        ko: `${b.say?.ko ?? ""}. \uAC19\uC740 \uC774\uB984\uC758 \uB2E4\uB978 \uAC12 ${p.lit}\uC774 ${here2}\uC5D0 \uC788\uC74C`.replace(/^\. /, ""),
        en: `${b.say?.en ?? ""}. Another value for the same name, ${p.lit}, is at ${here2}`.replace(/^\. /, "")
      };
    };
    severity = (b) => b.ok === false ? 0 : b.ok === null ? 1 : 2;
    ORD_EN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fiftieth: 50, hundredth: 100 };
    ORD_KO = { \uCCAB: 1, \uB450: 2, \uC138: 3, \uB124: 4, \uB2E4\uC12F: 5, \uC5EC\uC12F: 6, \uC77C\uACF1: 7, \uC5EC\uB35F: 8, \uC544\uD649: 9, \uC5F4: 10, \uC5F4\uD55C: 11, \uC5F4\uB450: 12, \uC5F4\uC138: 13, \uC5F4\uB124: 14, \uC5F4\uB2E4\uC12F: 15, \uC2A4\uBB34: 20 };
    NEGATIVE_TEST = /(reject|den(y|ies|ied)|block|refus|forbid|fail|error|throw|invalid|cannot|can't|does not|doesn't|should not|must not|unauthori|locked out|거부|차단|실패|막|않|수\s*없|불가|금지|못\s*(?:하|받|씀|써|보|넣|가))/i;
    plainNumbers = (s) => s.replace(/(\d),(?=\d{3}\b)/g, "$1");
    WORD_NUMBER = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
    ORDINAL = { first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10" };
    namedNumbers = (name) => [...plainNumbers(name).replace(/\b(a|an|the)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (_w, a, o) => `${a} ${ORDINAL[o.toLowerCase()]}`).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => WORD_NUMBER[w.toLowerCase()]).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).concat(ordinals(name));
    LIMIT_TEST = /limit|too many|exceed|\bmax|at most|up to|quota|throttl|rate|한도|초과|넘|최대|까지|제한/i;
    BROAD = /* @__PURE__ */ new Set([...GENERIC, ...["maximum", "cap", "minimum", "counter", "time", "day", "minute", "hour", "second", "sec", "ms", "duration", "window", "period"].map(stem)]);
    sameTestName = (a, b) => {
      const n = (s) => s.toLowerCase().replace(/\s*>\s*/g, " ").replace(/\s+/g, " ").trim();
      const x = n(a);
      const y = n(b);
      if (x === y) return true;
      const [short, long] = x.length < y.length ? [x, y] : [y, x];
      return short.split(" ").length >= 3 && long.endsWith(" " + short);
    };
  }
});

// src/requirements.ts
function parseRequirements(md) {
  const reqs = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s*(?:\[[ xX]\]\s*)?(R\d+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const [body, kw] = m[2].split(/\|\s*keywords?\s*:/i);
    const text = body.trim().replace(/\s*\|\s*$/, "");
    const keywords = (kw ?? "").split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const numbers = numbersIn(text);
    const constraints = parseConstraints(text);
    const auto = !keywords.length;
    const concepts = conceptsFor(text.replace(/(\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten))\s*times?\b/gi, "$1"));
    const kwTokens = keywords.flatMap((k) => /[가-힣]/.test(k) ? [...conceptsFor(k).flat(), ...tokenize(k)] : tokenize(k));
    const tokens = auto ? concepts.flat() : kwTokens;
    reqs.push({ id: m[1].toUpperCase(), text, keywords, auto, concepts, tokens: [...new Set(tokens)], numbers, guardCue: GUARD_CUE.test(text), constraints, only: ONLY_CUE.test(text), needsCheck: GUARD_CUE.test(text) || CHECK_CUE.test(text) || ONLY_CUE.test(text) });
  }
  return reqs;
}
function extractRequirements(md, max = 12) {
  const clean = (t) => t.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~)/g, "").replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");
  const text = md.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, "");
  const inSection = [];
  const bullets = [];
  const sentences = [];
  let section = false;
  let process2 = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith(">") || /^notes?\s*:/i.test(line)) continue;
    const head = line.match(/^(#{1,6})\s+(.*)$/) ?? line.match(/^\*\*(.+?)\*\*:?$/) ?? line.match(/^([^-*\d].{0,40}):$/);
    if (head) {
      const title = (head[2] ?? head[1]).trim();
      section = SECTION.test(title);
      process2 = !section && PROCESS_SECTION.test(title);
      continue;
    }
    if (process2) continue;
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
    if (item) {
      const t = clean(item[1]);
      if (AUTHOR_ITEM.test(t)) continue;
      (section ? inSection : bullets).push(t);
    } else if (section || MODAL.test(line)) {
      for (const part of line.split(/(?<=[.。!?])\s+/)) {
        if (/[:：]$/.test(part.trim()) || AUTHOR_ITEM.test(part.trim())) continue;
        if (section) inSection.push(clean(part));
        else if (MODAL.test(part)) sentences.push(clean(part));
      }
    }
  }
  const pool = inSection.length ? inSection : bullets.length >= 2 ? bullets : [...bullets, ...sentences];
  const seen = /* @__PURE__ */ new Set();
  return pool.filter((t) => {
    const key = t.toLowerCase();
    if (t.length < 6 || seen.has(key) || /^https?:\S+$/.test(t)) return false;
    seen.add(key);
    return true;
  }).slice(0, max).map((t) => clip(t, 140));
}
function draftRequirements(cands, source = "", start = 1) {
  const out = [
    L(`# \uC694\uAD6C\uC0AC\uD56D \uCD08\uC548${source ? ` \u2014 ${source}\uC5D0\uC11C \uAC00\uC838\uC634` : ""}. \uC77D\uC5B4 \uBCF4\uACE0 \uACE0\uCE5C \uB4A4 \uC800\uC7A5\uD558\uC138\uC694.`, `# Draft requirements${source ? ` \u2014 imported from ${source}` : ""}. Read them, fix them, then save.`),
    L("# \uD615\uC2DD: - R\uBC88\uD638: \uC694\uAD6C\uC0AC\uD56D \uBB38\uC7A5", "# Format: - R<number>: requirement sentence"),
    L("# \uCF54\uB4DC\uC640 \uC798\uBABB \uC774\uC5B4\uC9C0\uBA74 \uB4A4\uC5D0 \u300C| keywords: \uCF54\uB4DC\uC5D0 \uB098\uC624\uB294 \uC601\uC5B4 \uB2E8\uC5B4\u300D\uB97C \uBD99\uC5EC \uC9C1\uC811 \uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", '# If a requirement lands on the wrong code, append "| keywords: words, in, the, code" to pin it yourself.')
  ];
  cands.forEach((c, i) => out.push(`- R${start + i}: ${c}`));
  return out.join("\n") + "\n";
}
function extractFromPrBody(md) {
  return draftRequirements(extractRequirements(md));
}
var ONLY_CUE, GUARD_CUE, CHECK_CUE, SECTION, MODAL, PROCESS_SECTION, AUTHOR_ITEM;
var init_requirements = __esm({
  "src/requirements.ts"() {
    init_tokens();
    init_glossary();
    init_i18n();
    init_numeric();
    ONLY_CUE = /[가-힣]만(?=\s|$)|\bonly\b/i;
    GUARD_CUE = /(않|차단|거부|막|금지|불가|수\s*없|reject|deny|block|forbid|refuse|must not|cannot|can't)/i;
    CHECK_CUE = /\bmust\b|\brequired?\b|\bneeds?\b|\bhave to\b|\bhas to\b|해야|여야|필요|만\s+\S+\s*수\s*있|\bonce\s+(?:per|a|each|for)\b|\bonly once\b|\bonly one\b|한\s*번(?:씩)?만|하나만|중복/i;
    SECTION = /(acceptance\s*criteria|requirements?|definition\s*of\s*done|expected\s*behaviou?r|요구\s*사항|인수\s*조건|완료\s*조건|수용\s*기준|기대\s*동작|해야\s*할\s*일|체크\s*리스트)/i;
    MODAL = /(해야|한다|하도록|할 수|않는다|않게|되어야|된다|must|should|shall|when |if |needs? to|able to|cannot|can't)/i;
    PROCESS_SECTION = /check\s*-?\s*list|before\s+(?:you\s+)?(?:submit|merg|open)|type\s+of\s+change|related\s+(?:issues?|tasks?|prs?)|how\s+(?:has\s+this\s+been|to)\s+test|^testing$|test\s+plan|screenshots?|notes?\s+(?:for|to)\s+review/i;
    AUTHOR_ITEM = /^(?:I(?:'ve|'m|'d)\b|I\s+(?:have|has|am|did|added|ran|tested|updated|created|confirm(?:ed)?|agree|read|followed|checked|made|wrote|signed|performed|reviewed|verified|included|linked)\b|we(?:'ve|\s+have)\s|저는\s|제가\s)/i;
  }
});

// src/demo.ts
import { cpSync, mkdirSync, mkdtempSync, existsSync as existsSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join as join2 } from "node:path";
import { execFileSync as execFileSync2 } from "node:child_process";
import { fileURLToPath } from "node:url";
function buildSampleRepo(o = {}) {
  const sample = o.sampleDir ?? SAMPLE;
  const root = mkdtempSync(join2(tmpdir(), "verifylens-demo-"));
  const repo = join2(root, "repo");
  mkdirSync(repo);
  const g = (...a) => execFileSync2("git", ["-c", "user.name=VerifyLens Demo", "-c", "user.email=demo@example.invalid", "-c", "core.autocrlf=false", "-C", repo, ...a], { stdio: "pipe", encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: DEMO_DATE, GIT_COMMITTER_DATE: DEMO_DATE } });
  g("init", "-q", "-b", "main");
  cpSync(join2(sample, "base"), repo, { recursive: true });
  g("add", "-A");
  g("commit", "-q", "-m", "base: login without lockout");
  for (const v of ["a", "b"]) {
    g("checkout", "-q", "-b", `feature/lockout-${v}`, "main");
    cpSync(join2(sample, "shared"), repo, { recursive: true });
    cpSync(join2(sample, v), repo, { recursive: true });
    g("add", "-A");
    g("commit", "-q", "-m", `feature: lockout (${v.toUpperCase()})`);
    g("checkout", "-q", "main");
  }
  const junit = {};
  let testsFromFallback = false;
  for (const v of ["a", "b"]) {
    const dir = join2(root, `run-${v}`);
    mkdirSync(dir);
    cpSync(join2(sample, "base"), dir, { recursive: true });
    cpSync(join2(sample, "shared"), dir, { recursive: true });
    cpSync(join2(sample, v), dir, { recursive: true });
    const out = join2(root, `junit-${v}.xml`);
    if (o.node !== null) {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      try {
        execFileSync2(o.node ?? process.execPath, ["--test", "--test-reporter=junit", `--test-reporter-destination=${out}`, "test/lockout.test.ts"], { cwd: dir, stdio: "pipe", windowsHide: true, env });
      } catch {
      }
    }
    const fallback = o.fallbackJunit?.[v];
    if (!existsSync2(out) && fallback && existsSync2(fallback)) {
      cpSync(fallback, out);
      testsFromFallback = true;
    }
    if (!existsSync2(out)) throw new Error(L(`\uD14C\uC2A4\uD2B8 \uBCF4\uACE0\uC11C\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${out}`, `Could not create the test report: ${out}`));
    junit[v] = out;
  }
  const pick2 = (name) => {
    const en = join2(sample, name.replace(/\.md$/, ".en.md"));
    return isEn() && existsSync2(en) ? en : join2(sample, name);
  };
  return { root, repo, junitA: junit.a, junitB: junit.b, reqFile: pick2("requirements.md"), prFile: pick2("pr.md"), testsFromFallback };
}
var here, SAMPLE, DEMO_DATE;
var init_demo = __esm({
  "src/demo.ts"() {
    init_i18n();
    here = dirname(fileURLToPath(import.meta.url));
    SAMPLE = join2(here, "..", "samples", "login-lockout");
    DEMO_DATE = "2026-01-01T00:00:00Z";
  }
});

// src/testpoints.ts
function withUnit2(n, c, lang) {
  const u = c.unitText.trim();
  if (!u) return num(n);
  if (u === "$" || u === "\u20A9" || u === "\u20AC" || u === "\xA3") return `${u}${num(n)}`;
  if (lang === "en" && hangul(u)) {
    const w = englishUnit(u, n);
    if (w) return w === "%" ? `${num(n)}%` : `${num(n)} ${w}`;
  }
  return hangul(u) || u === "%" ? `${num(n)}${u}` : `${num(n)} ${u}`;
}
function nth(n, lang) {
  return lang === "ko" ? `${n}\uBC88\uC9F8` : `${ordinal(n)} time`;
}
function pointsFor(c, lang) {
  const w = W[lang];
  if (c.window || c.rel === "value" || !Number.isFinite(c.value)) return [];
  const discrete = DISCRETE.includes(c.unit) && Number.isInteger(c.value);
  const v = c.value;
  const counted = discrete && COUNTED2.includes(c.unit) && (c.rel === "count" || c.rel === "after" || (c.rel === "lte" || c.rel === "lt") && c.validSide === "lower");
  const show = (n) => counted ? nth(n, lang) : withUnit2(n, c, lang);
  const yes = c.validSide ? w.allow : w.inside;
  const no = c.validSide ? w.reject : w.outside;
  const at = (n, expect) => ({ value: show(n), expect });
  const near2 = (word, expect) => ({ value: lang === "ko" ? `${withUnit2(v, c, lang)} ${word}` : `${word} ${withUnit2(v, c, lang)}`, expect });
  const exact = (expect) => ({ value: withUnit2(v, c, lang), expect });
  if (c.rel === "count" || c.rel === "after") {
    if (discrete) return v >= 1 ? [at(v - 1, w.notYet), at(v, w.acts)].filter((p) => !/^0/.test(p.value)) : [];
    return [near2(w.under, w.notYet), exact(w.acts)];
  }
  if (c.rel === "eq") {
    if (c.trigger) return discrete ? [at(v, w.acts), at(v + 1, w.noAct)] : [exact(w.acts), near2(w.over, w.noAct)];
    return discrete ? [at(v - 1, w.outside), at(v, w.inside), at(v + 1, w.outside)].filter((_, i) => i > 0 || v > 0) : [];
  }
  const upperOk = c.validSide ? c.validSide === "upper" : c.rel === "gte" || c.rel === "gt";
  if (discrete) {
    if (c.rel === "gte") return [at(v - 1, upperOk ? no : yes), at(v, upperOk ? yes : no)].filter((p, i) => i > 0 || v - 1 >= 0);
    if (c.rel === "gt") return [at(v, upperOk ? no : yes), at(v + 1, upperOk ? yes : no)];
    if (c.rel === "lte") return [at(v, upperOk ? no : yes), at(v + 1, upperOk ? yes : no)];
    if (c.rel === "lt") return [at(v - 1, upperOk ? no : yes), at(v, upperOk ? yes : no)].filter((p, i) => i > 0 || v - 1 >= 0);
    return [];
  }
  const atIncluded = c.rel === "gte" || c.rel === "lte";
  const below = upperOk ? no : yes;
  const above = upperOk ? yes : no;
  if (c.rel === "gte" || c.rel === "gt") return [near2(w.under, below), exact(atIncluded ? above : below), ...atIncluded ? [] : [near2(w.over, above)]];
  if (c.rel === "lte" || c.rel === "lt") return [...atIncluded ? [] : [near2(w.under, below)], exact(atIncluded ? below : above), near2(w.over, above)];
  return [];
}
function testPoints(req, lang = getLang()) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const c of req.constraints) {
    for (const p of pointsFor(c, lang)) {
      if (seen.has(p.value)) continue;
      seen.add(p.value);
      out.push(p);
    }
  }
  return out;
}
function testPointsLine(req, lang = getLang()) {
  return testPoints(req, lang).map((p) => `${p.value} \u2192 ${p.expect}`).join(" \xB7 ");
}
var DISCRETE, COUNTED2, W, num, ordinal, hangul;
var init_testpoints = __esm({
  "src/testpoints.ts"() {
    init_i18n();
    init_numeric();
    DISCRETE = ["money", "age", "char", "cnt", "qty", null];
    COUNTED2 = ["cnt", null];
    W = {
      ko: { allow: "\uD5C8\uC6A9", reject: "\uAC70\uC808", acts: "\uB3D9\uC791", notYet: "\uC544\uC9C1 \uB3D9\uC791 \uC548 \uD568", noAct: "\uB3D9\uC791 \uC548 \uD568", inside: "\uC870\uAC74 \uC548", outside: "\uC870\uAC74 \uBC16", under: "\uC9C1\uC804", over: "\uBC14\uB85C \uB118\uC74C" },
      en: { allow: "allowed", reject: "rejected", acts: "acts", notYet: "does not act yet", noAct: "does not act", inside: "inside the condition", outside: "outside the condition", under: "just under", over: "just over" }
    };
    num = (n) => Math.abs(n) >= 1e3 ? n.toLocaleString("en-US") : String(n);
    ordinal = (n) => {
      const r = n % 100;
      const s = r >= 11 && r <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
      return `${n}${s}`;
    };
    hangul = (s) => /[가-힣]/.test(s);
  }
});

// src/summary.ts
function counts(report) {
  const c = { \uD655\uC778\uB428: 0, \uB2E4\uB984: 0, \uBBF8\uD655\uC778: 0, \uC2E4\uD328: 0 };
  for (const s of report.summaries) c[s.overall] += 1;
  return c;
}
function attention(report, s) {
  if (s.overall === "\uB2E4\uB984" || s.overall === "\uC2E4\uD328") return "fix";
  if (s.overall === "\uD655\uC778\uB428") return "ok";
  return undecidedReasons(report, s).every((k) => TEST_ONLY.includes(k)) ? "tests" : "look";
}
function undecidedReasons(report, s) {
  if (s.overall !== "\uBBF8\uD655\uC778") return [];
  const out = /* @__PURE__ */ new Set();
  for (const set of report.sets) {
    const rr = set.perReq[s.req.id];
    if (rr.evidence.status === "\uBBF8\uBC1C\uACAC") out.add("no-evidence");
    if (rr.evidence.noWindow) out.add("no-window");
    if (rr.evidence.unchecked) out.add("unchecked-input");
    else if (rr.evidence.status === "\uC77C\uBD80 \uBC1C\uACAC" && !rr.evidence.boundaries?.length) out.add("no-check");
    for (const b of rr.evidence.boundaries ?? []) if (b.ok === null) out.add(b.why && b.why !== "inverted" ? b.why : "missing");
    if (rr.evidence.caveat) out.add("extra-condition");
  }
  if (out.has("no-evidence")) out.delete("missing");
  const untested = report.sets.some((x) => x.perReq[s.req.id].testStatus === "\uBBF8\uC2E4\uD589");
  if (!out.size) out.add(report.testsStale ? "stale" : "no-test");
  else if (untested) out.add("no-test");
  return [...out];
}
function nextAction(s, report) {
  if (s.overall === "\uB2E4\uB984") {
    const bad = report.sets.filter((x) => x.perReq[s.req.id].evidence.boundary?.ok === false || x.perReq[s.req.id].testStatus === "\uC2E4\uD328");
    const who = bad.length ? joinNames(bad.map((x) => x.label)) : L("\uB2E4\uB978 \uCABD", "the other side");
    const passOff = bad.find((x) => x.perReq[s.req.id].testStatus === "\uD1B5\uACFC" && x.perReq[s.req.id].evidence.boundary?.ok === false);
    if (passOff) {
      const b = passOff.perReq[s.req.id].evidence.boundary;
      return L(
        `${who}\uC758 \uC870\uAC74\uACFC \uAC80\uC0AC\uB97C \uD568\uAED8 \uD655\uC778\uD55C\uB2E4. \uAC80\uC0AC\uAC00 \uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC740 ${checkWord(b, "ko")}\uC744 \uBCF4\uB3C4\uB85D \uACE0\uCE5C \uB4A4 \uC870\uAC74\uC744 \uC218\uC815\uD558\uACE0 \uB2E4\uC2DC \uAC80\uC0AC\uD55C\uB2E4.`.replace("\uD69F\uC218\uC744", "\uD69F\uC218\uB97C"),
        `Check both the condition and the test in ${who}. Make the test exercise the same ${checkWord(b, "en")} as the requirement, then fix the condition and run the tests again.`
      );
    }
    return L(`${who}\uC758 \uC870\uAC74\uC744 \uD655\uC778\xB7\uC218\uC815\uD55C \uB4A4 \uAC19\uC740 \uAE30\uC900\uC73C\uB85C \uB2E4\uC2DC \uAC80\uC0AC\uD55C\uB2E4.`, `Check and fix the condition in ${who}, then run the same tests again.`);
  }
  if (s.overall === "\uC2E4\uD328") return L("\uC2E4\uD328\uD55C \uAC80\uC0AC\uC758 \uC6D0\uC778\uC744 \uD655\uC778\uD55C\uB2E4.", "Find out why the test fails.");
  if (s.overall === "\uBBF8\uD655\uC778") {
    const reasons = undecidedReasons(report, s);
    if (reasons.length) return reasons.slice(0, 2).map((k) => undecidedAction(k)).join(" ");
    const open = report.sets.some((x) => x.perReq[s.req.id].evidence.boundaries?.some((b) => b.ok === null) || x.perReq[s.req.id].evidence.caveat);
    if (open) return L("\uC704 \uC8FC\uC758 \uC0AC\uD56D\uC744 \uCF54\uB4DC\uC640 \uC694\uAD6C\uC0AC\uD56D\uC5D0\uC11C \uC9C1\uC811 \uD655\uC778\uD558\uACE0, \uD544\uC694\uD558\uBA74 \uC694\uAD6C\uC0AC\uD56D \uBB38\uC7A5\uC744 \uB354 \uBD84\uBA85\uD558\uAC8C \uACE0\uCE5C\uB2E4.", "Check the note above in the code and the requirement, and make the requirement wording more precise if needed.");
    return L("\uAD00\uB828 \uAC80\uC0AC\uB97C \uCD94\uAC00\uD558\uAC70\uB098 \uC2E4\uD589\uD574 \uAD6C\uD604 \uADFC\uAC70\uB97C \uD655\uC778\uD55C\uB2E4.", "Add or run a test for this requirement to confirm the behavior.");
  }
  return L("\uD655\uC778\uB41C \uADFC\uAC70\uB97C \uB9AC\uD3EC\uD2B8\uC5D0 \uB0A8\uAE30\uACE0 \uC0AC\uB78C\uC774 \uD310\uB2E8\uD55C\uB2E4.", "Keep the evidence in the report; the decision is yours.");
}
function renderSummaryMd(report) {
  const c = counts(report);
  const out = [];
  out.push(L("# VerifyLens \uAC80\uC99D \uC694\uC57D (\uADDC\uCE59 \uAE30\uBC18 \uBD84\uC11D, AI \uCD94\uC815 \uC5C6\uC74C)", "# VerifyLens verification summary (rule-based analysis, no AI inference)"));
  out.push("");
  out.push(L(`- \uAE30\uC900: \`${report.base}\``, `- Base: \`${report.base}\``));
  for (const s of report.sets) out.push(L(`- ${s.label}: \`${s.ref}\` (${s.sha}) \xB7 \uAC80\uC0AC ${s.tests.length}\uAC1C`, `- ${s.label}: \`${s.ref}\` (${s.sha}) \xB7 ${s.tests.length} test(s)`));
  out.push(`- ${L("\uC694\uC57D", "Summary")}: ${["\uD655\uC778\uB428", "\uB2E4\uB984", "\uC2E4\uD328", "\uBBF8\uD655\uC778"].map((k) => `${wOverall(k)} ${c[k]}`).join(" \xB7 ")}`);
  out.push("");
  for (const s of report.summaries) {
    out.push(`## ${s.req.id} ${s.req.text} \u2014 ${wOverall(s.overall)}`);
    if (report.sets.length === 2) out.push(`- ${L("\uACB0\uACFC \uBE44\uAD50", "A vs B")}: ${wRelation(s.relation.kind)}${s.relation.detail ? ` (${s.relation.detail})` : ""}`);
    for (const set of report.sets) {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      const parts = [L(`${set.label}: \uAD6C\uD604 \uADFC\uAC70 ${rr.evidence.status}`, `${set.label}: evidence ${wEvidence(rr.evidence.status)}`)];
      if (u) parts.push(`\`${u.cond?.expr ?? u.text}\` (${where(set, s.req.id)}${u.kind === "function" ? L(", \uD568\uC218 \uC804\uCCB4 \uB2E8\uC704 \u2014 \uC138\uBD80 \uC870\uAC74\uC740 \uC0AC\uB78C\uC774 \uD655\uC778", ", whole function \u2014 check the exact condition yourself") : ""})`);
      const b = rr.evidence.boundary;
      for (const x of rr.evidence.boundaries ?? []) parts.push(boundaryLine(x));
      parts.push(
        rr.testStatus === "\uD1B5\uACFC" && b?.ok === false ? L(`\uAC80\uC0AC\uB294 \uD1B5\uACFC (\uAC80\uC0AC\uAC00 \uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC740 ${checkWord(b, "ko")}\uC744 \uD655\uC778\uD558\uB294\uC9C0 \uBCFC \uAC83)`.replace("\uD69F\uC218\uC744", "\uD69F\uC218\uB97C"), `but the test passes (check that the test exercises the same ${checkWord(b, "en")} as the requirement)`) : L(`\uAC80\uC0AC ${rr.testStatus}`, `tests ${wTest(rr.testStatus)}`)
      );
      const fail = rr.tests.find((t) => t.status === "fail");
      if (fail) parts.push(`${L("\uC2E4\uD328 \uC774\uC720", "failure")}: ${fail.message || fail.name}`);
      out.push("- " + parts.join(" \xB7 "));
    }
    for (const n of s.notes) out.push(`- ${L("\uC8FC\uC758", "Note")}: ${n}`);
    out.push(`- ${L("\uB2E4\uC74C \uD589\uB3D9", "Next step")}: ${nextAction(s, report)}`);
    out.push("");
  }
  out.push(L("## \uAC80\uC0AC\uB97C \uB3CC\uB9AC\uC9C0 \uC54A\uC558\uAC70\uB098 \uADFC\uAC70\uB97C \uBABB \uCC3E\uC740 \uACF3", "## Tests not run or evidence not found"));
  let any = false;
  for (const s of report.summaries) {
    const missing = report.sets.filter((x) => x.perReq[s.req.id].testStatus === "\uBBF8\uC2E4\uD589" || x.perReq[s.req.id].evidence.status === "\uBBF8\uBC1C\uACAC");
    if (missing.length) {
      any = true;
      out.push(`- ${s.req.id}: ${missing.map((x) => `${x.label} (${x.perReq[s.req.id].evidence.status === "\uBBF8\uBC1C\uACAC" ? L("\uAD6C\uD604 \uADFC\uAC70 \uC5C6\uC74C", "no evidence found") : L("\uAC80\uC0AC \uBBF8\uC2E4\uD589", "no test run")})`).join(", ")}`);
    }
  }
  for (const set of report.sets) {
    for (const d of set.dyn) {
      any = true;
      out.push(L(`- ${set.label}: \uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uD638\uCD9C ${d.file} ${d.line}\uD589 \`${d.text}\` (\uB3D9\uC801 \uD638\uCD9C \u2014 \uC601\uD5A5 \uBC94\uC704\uB97C \uC815\uC801 \uBD84\uC11D\uC73C\uB85C \uC54C \uC218 \uC5C6\uC74C)`, `- ${set.label}: unresolved call ${d.file} line ${d.line} \`${d.text}\` (dynamic call \u2014 static analysis cannot tell what it affects)`));
    }
  }
  if (!any) out.push(L("- \uC5C6\uC74C", "- none"));
  out.push("");
  out.push(L("> \uC774 \uC694\uC57D\uC740 \uCF54\uB4DC \uAD6C\uC870\uC640 \uAC80\uC0AC \uACB0\uACFC\uC5D0\uC11C\uB9CC \uB9CC\uB4E0 \uC0AC\uC2E4\uC774\uB2E4. \uC0AC\uB78C\uC774 \uADFC\uAC70\uB97C \uBCF4\uACE0 \uD310\uB2E8\uD55C\uB2E4.", "> This summary is built only from the code structure and the test results. You read the evidence and decide."));
  return out.join("\n") + "\n";
}
var where, TEST_ONLY;
var init_summary = __esm({
  "src/summary.ts"() {
    init_i18n();
    init_numeric();
    where = (s, id) => {
      const u = s.perReq[id].evidence.unit;
      return u ? L(`${u.file} ${u.startLine}\uD589`, `${u.file} line ${u.startLine}`) : L("\uCC3E\uC9C0 \uBABB\uD568", "not found");
    };
    TEST_ONLY = ["no-test", "stale"];
  }
});

// src/evidenceSteps.ts
function chainSteps(report, reqId, lang = getLang(), setIndex = 0) {
  const s = report.summaries.find((x) => x.req.id === reqId);
  const set = report.sets[setIndex];
  if (!s || !set) return [];
  const ko = lang === "ko";
  const rr = set.perReq[reqId];
  const ev = rr.evidence;
  const u = ev.unit;
  const b = ev.boundary;
  const code = u ? `${u.file}:${u.startLine}${u.cond?.expr ? ` ${u.cond.expr}` : u.kind === "function" ? ko ? " (\uD568\uC218 \uC804\uCCB4)" : " (whole function)" : ""}` : ko ? "\uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD568" : "no evidence found";
  const codeTone = !u ? "miss" : ev.status === "\uBC1C\uACAC" ? "ok" : "miss";
  const linked = rr.tests;
  const firstFail = linked.find((t) => t.status === "fail");
  let testText = rr.testStatus === "\uD1B5\uACFC" ? `${ko ? "\uD1B5\uACFC" : "passes"}${linked[0] ? ` \xB7 ${linked[0].name}` : ""}` : rr.testStatus === "\uC2E4\uD328" ? `${ko ? "\uC2E4\uD328" : "fails"}${firstFail ? ` \xB7 ${firstFail.name}` : ""}` : ko ? "\uC5F0\uACB0\uB41C \uAC80\uC0AC \uC5C6\uC74C" : "no linked test";
  let testTone = rr.testStatus === "\uD1B5\uACFC" ? "ok" : rr.testStatus === "\uC2E4\uD328" ? "diff" : "miss";
  const edited = (rr.edits ?? []).filter(suspicious);
  let changed = false;
  if (edited.length) {
    testText += ` \xB7 ${editText(edited[0], lang)}${edited.length > 1 ? ` (+${edited.length - 1})` : ""}`;
    changed = rr.testStatus !== "\uC2E4\uD328";
    testTone = "diff";
  }
  let act;
  if (b && b.attempts !== null) {
    const late = b.attempts - b.required;
    const off = late === 0 ? "" : ko ? ` \u2717 ${Math.abs(late)}\uBC88 ${late > 0 ? "\uB2A6\uC74C" : "\uBE60\uB984"}` : ` \u2717 ${Math.abs(late)} ${late > 0 ? "late" : "early"}`;
    act = { kind: "act", title: ko ? "\uB3D9\uC791" : "acts", text: ko ? `${b.attempts}\uBC88\uC9F8 \uC2DC\uB3C4 (\uC694\uAD6C ${b.required})${off}` : `attempt ${b.attempts} (required ${b.required})${off}`, tone: b.ok === true ? "ok" : b.ok === false ? "diff" : "miss" };
  } else if (b) {
    act = { kind: "act", title: ko ? "\uB3D9\uC791" : "acts", text: boundaryShort(b, lang) || boundaryLine(b, lang), tone: b.ok === true ? "ok" : b.ok === false ? "diff" : "miss" };
  } else {
    const reason = s.overall === "\uBBF8\uD655\uC778" ? undecidedReasons(report, s).slice(0, 1).map((k) => undecidedLabel(k, lang))[0] ?? "" : "";
    const word = ko ? s.overall : { \uD655\uC778\uB428: "Verified", \uB2E4\uB984: "Different", \uC2E4\uD328: "Failed", \uBBF8\uD655\uC778: "Not verified" }[s.overall];
    act = { kind: "act", title: ko ? "\uD310\uC815" : "verdict", text: `${word}${reason ? ` \xB7 ${reason}` : ""}`, tone: s.overall === "\uD655\uC778\uB428" ? "ok" : s.overall === "\uBBF8\uD655\uC778" ? "miss" : "diff" };
  }
  return [
    { kind: "req", title: ko ? "\uC694\uAD6C\uC0AC\uD56D" : "requirement", text: s.req.text, tone: "plain" },
    { kind: "code", title: ko ? "\uCF54\uB4DC" : "code", text: code, tone: codeTone },
    { kind: "test", title: ko ? "\uAC80\uC0AC" : "tests", text: testText, tone: testTone, ...changed ? { changed: true } : {} },
    act
  ];
}
function attemptDots(report, reqId) {
  const rows = report.sets.map((set) => ({ key: set.key, b: set.perReq[reqId]?.evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return null;
  const required = rows[0].b.required;
  const max = Math.max(required, ...rows.map((x) => x.b.attempts)) + 1;
  if (max > 13) return null;
  return { max, required, rows: rows.map((x) => ({ key: x.key, at: x.b.attempts })) };
}
var init_evidenceSteps = __esm({
  "src/evidenceSteps.ts"() {
    init_i18n();
    init_numeric();
    init_summary();
    init_testedits();
  }
});

// src/verdictStyle.ts
function palette(theme) {
  return Object.entries(theme).map(([k, [ink, fill]]) => `--vl-${k}:${ink};--vl-${k}-bg:${fill};`).join("");
}
var marks, light, dark;
var init_verdictStyle = __esm({
  "src/verdictStyle.ts"() {
    marks = { \uD655\uC778\uB428: "\u2705", \uB2E4\uB984: "\u26A0\uFE0F", \uC2E4\uD328: "\u274C", \uBBF8\uD655\uC778: "\u2754" };
    light = { ok: ["#176840", "#e4f4ec"], diff: ["#884600", "#fff1d9"], fail: ["#a72b36", "#fce9ec"], miss: ["#536173", "#edf0f4"], plain: ["#275eae", "#eaf1ff"] };
    dark = { ok: ["#62d6a0", "#113229"], diff: ["#ffc26b", "#38291a"], fail: ["#ff9099", "#3b202a"], miss: ["#aab8ca", "#202b3b"], plain: ["#94bbff", "#192d49"] };
  }
});

// src/view.ts
function hl(line) {
  const rx = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let out = "";
  let m;
  while (m = rx.exec(line)) {
    const [t, c, s, n, id, ws] = m;
    if (c) out += `<span class="c">${esc(c)}</span>`;
    else if (s) out += `<span class="s">${esc(s)}</span>`;
    else if (n) out += `<span class="n">${n}</span>`;
    else if (id) {
      const next = line[m.index + t.length];
      const prev = line[m.index - 1];
      const cls3 = KW.has(id) ? "k" : next === "(" ? "f" : prev === "." ? "p" : /^[A-Z]/.test(id) ? "ty" : "";
      out += cls3 ? `<span class="${cls3}">${id}</span>` : id;
    } else if (ws) out += t;
    else out += `<span class="pu">${esc(t)}</span>`;
  }
  return out;
}
function hlMark(line, expr, op) {
  if (!expr) return hl(line);
  const i = line.indexOf(expr);
  if (i < 0) return hl(line);
  const mid = line.slice(i, i + expr.length);
  let midHtml = hl(mid);
  if (op) {
    const j = mid.indexOf(op);
    if (j >= 0) midHtml = hl(mid.slice(0, j)) + `<b class="op">${esc(op)}</b>` + hl(mid.slice(j + op.length));
  }
  return hl(line.slice(0, i)) + `<mark class="xm">${midHtml}</mark>` + hl(line.slice(i + expr.length));
}
function units(s, mono = false) {
  let u = 0;
  for (const ch of s) u += /[ᄀ-￿]/.test(ch) ? 1 : mono ? 0.6 : 0.56;
  return u;
}
function wrapText(s, maxUnits, maxLines, mono = false) {
  const tokens = s.replace(/\s+/g, " ").trim().split(/(\s)/);
  const lines2 = [];
  let cur2 = "";
  for (const tok of tokens) {
    if (units(cur2 + tok, mono) <= maxUnits) {
      cur2 += tok;
      continue;
    }
    if (cur2.trim()) lines2.push(cur2.trim());
    cur2 = tok.trimStart();
    while (units(cur2, mono) > maxUnits) {
      let i = cur2.length;
      while (i > 1 && units(cur2.slice(0, i), mono) > maxUnits) i--;
      lines2.push(cur2.slice(0, i));
      cur2 = cur2.slice(i);
    }
  }
  if (cur2.trim()) lines2.push(cur2.trim());
  if (lines2.length > maxLines) {
    const kept = lines2.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && units(last + "\u2026", mono) > maxUnits) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "\u2026";
    return kept;
  }
  return lines2;
}
var esc, KW, ID, ST, evColor, testColor, overallColor;
var init_view = __esm({
  "src/view.ts"() {
    init_verdictStyle();
    esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    KW = /* @__PURE__ */ new Set(["export", "async", "function", "const", "let", "var", "if", "else", "throw", "await", "return", "new", "import", "from", "type", "class", "extends", "try", "catch", "for", "of", "in", "typeof", "default"]);
    ID = { A: "#38BDF8", B: "#C084FC" };
    ST = { ok: dark.ok[0], diff: dark.diff[0], fail: dark.fail[0], unk: dark.miss[0], info: dark.plain[0] };
    evColor = (s) => s === "\uBC1C\uACAC" ? ST.ok : s === "\uC77C\uBD80 \uBC1C\uACAC" ? ST.diff : ST.unk;
    testColor = (s) => s === "\uD1B5\uACFC" ? ST.ok : s === "\uC2E4\uD328" ? ST.fail : ST.unk;
    overallColor = (s) => s === "\uD655\uC778\uB428" ? ST.ok : s === "\uB2E4\uB984" ? ST.diff : s === "\uC2E4\uD328" ? ST.fail : ST.unk;
  }
});

// src/evidenceView.ts
function stepTone(step, overall) {
  if (step.tone === "diff" && (step.kind === "test" && !step.changed || step.kind === "act" && overall === "\uC2E4\uD328" && (step.title === "\uD310\uC815" || step.title === "verdict"))) return "fail";
  return step.tone;
}
function evidenceChain(steps2, overall) {
  return '<span class="vl-chain">' + steps2.map((step) => {
    const tone = stepTone(step, overall);
    return `<span class="vl-step vl-${tone}" data-step="${step.kind}"><strong>${symbols[tone]}${esc(step.title)}</strong><span${step.kind === "code" ? ' class="vl-code"' : ""}>${esc(step.text)}</span></span>`;
  }).join('<span class="vl-arrow" aria-hidden="true">\u2192</span>') + "</span>";
}
function attemptComparison(required, at, label, test, lang, runStatus) {
  const ko = lang === "ko";
  const stat = (caption, n, tone2) => `<span class="vl-stat vl-${tone2}"><small>${esc(caption)}</small>${ko ? `<b>${n}</b><span>\uBC88\uC9F8</span>` : `<span>Attempt</span><b>${n}</b>`}</span>`;
  const actual = runStatus && { \uD1B5\uACFC: "ok", \uC2E4\uD328: "diff", \uBBF8\uC2E4\uD589: "miss" }[runStatus];
  const status = test && { ok: ko ? "\uAC80\uC0AC \uD1B5\uACFC" : "Test passed", diff: ko ? "\uAC80\uC0AC \uC2E4\uD328" : "Test failed", miss: ko ? "\uAC80\uC0AC \uBBF8\uC2E4\uD589" : "No linked test", plain: "" }[actual ?? test.tone];
  const tone = test ? stepTone(test) : "miss";
  return `<span class="vl-compare">${stat(ko ? "\uC694\uAD6C\uC0AC\uD56D" : "Required", required, "plain")}<span class="vl-link" aria-hidden="true">\u2192</span>${stat(label, at, at === required ? "ok" : "diff")}${status ? `<strong class="vl-test vl-${tone}">${symbols[tone]}${status}</strong>` : ""}</span>`;
}
function attemptChart(max, required, rows, lang) {
  const ko = lang === "ko";
  function row(label, at, tone) {
    const dots = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<span class="vl-dot${n === at ? " vl-active vl-" + tone : n > at ? " vl-after" : ""}">${n}</span>`;
    }).join("");
    return `<span class="vl-row"><b>${esc(label)}</b><span class="vl-track">${dots}</span></span>`;
  }
  const codeRows = rows.map(({ label, at }) => {
    const d = at - required;
    const delta = d === 0 ? ko ? "\uAC19\uC740 \uC2DC\uC810" : "same attempt" : ko ? `${Math.abs(d)}\uBC88 ${d > 0 ? "\uB2A6\uC74C" : "\uBE60\uB984"}` : `${Math.abs(d)} ${d > 0 ? "late" : "early"}`;
    const tone = d === 0 ? "ok" : "diff";
    const x = (n) => 100 * (n - 0.5) / max;
    const from = x(required), to = x(at);
    const hasDot = (n) => Number.isInteger(n) && n >= 1 && n <= max;
    const line = hasDot(at) && hasDot(required) ? `<svg aria-hidden="true" viewBox="0 0 100 32" preserveAspectRatio="none"><path d="M ${from} 0 V 24 H ${to} V 32" vector-effect="non-scaling-stroke"/></svg>` : "";
    const link = `<span class="vl-gap vl-${tone}" style="--mid:${(from + to) / 2}%">${line}<strong>${delta}</strong></span>`;
    return `<span class="vl-pair">${row(ko ? "\uC694\uAD6C\uC0AC\uD56D" : "Required", required, "plain")}${link}${row(label, at, tone)}</span>`;
  });
  return `<span class="vl-dots" style="--count:${max}">${codeRows.join("")}</span>`;
}
var symbols, evidenceCSS;
var init_evidenceView = __esm({
  "src/evidenceView.ts"() {
    init_view();
    init_verdictStyle();
    symbols = { plain: "", ok: "\u2713 ", diff: "\u26A0 ", fail: "\u2715 ", miss: "? " };
    evidenceCSS = `
${Object.keys(light).map((k) => `.vl-${k}{--ink:var(--vl-${k});--tint:var(--vl-${k}-bg)}`).join("\n")}
.vl-chain{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr);align-items:stretch;gap:4px;margin:12px 0}
.vl-step{display:flex;flex-direction:column;gap:5px;padding:11px;border:1px solid color-mix(in srgb,var(--ink) 52%,var(--tint));border-radius:8px;background:var(--tint);font-size:13px;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}
.vl-step strong,.vl-note{color:var(--ink);font-size:12px}.vl-step.vl-diff,.vl-step.vl-fail{box-shadow:inset 3px 0 var(--ink)}
.vl-step.vl-miss{border-style:dashed;border-color:var(--ink)}.vl-code{font-family:ui-monospace,Consolas,monospace;font-variant-ligatures:none}
.vl-arrow{align-self:center;color:var(--vl-miss)}

.vl-compare{display:flex;align-items:center;gap:clamp(10px,2vw,28px);padding:14px 0 12px;margin-top:8px;border-top:1px solid var(--vl-miss-bg);font-variant-numeric:tabular-nums}
.vl-stat{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:1px 4px;color:var(--ink)}
.vl-stat small{grid-column:1/-1;font-size:12px;font-weight:700}.vl-stat b{font-size:clamp(30px,3.2vw,52px);line-height:1;font-weight:720;letter-spacing:-.045em}
.vl-stat>span{font-size:12px}.vl-link{font-size:24px;color:var(--vl-miss)}
.vl-test{align-self:center;background:var(--tint);color:var(--ink);border:1px solid var(--ink);border-radius:18px;padding:3px 9px;font-size:12px;white-space:nowrap}
.vl-dots{display:grid;gap:6px;margin:12px 0;font-variant-numeric:tabular-nums}
.vl-pair{display:grid;grid-template-columns:4.8em minmax(0,1fr);align-items:center;column-gap:6px;max-width:calc(4.8em + 6px + var(--count)*31px);font-size:12px}
.vl-row{display:contents}.vl-track{display:grid;grid-template-columns:repeat(var(--count),minmax(0,1fr));justify-items:center}
.vl-gap{position:relative;grid-column:2;height:32px;color:var(--ink)}
.vl-gap svg{position:absolute;inset:0;width:100%;height:100%;stroke:currentColor;stroke-width:1.6;fill:none}
.vl-gap strong{position:absolute;top:2px;left:clamp(3.3em,var(--mid),calc(100% - 3.3em));transform:translateX(-50%);white-space:nowrap;padding:0 4px;border-radius:4px;background:var(--tint);font-size:11px}
.vl-dots{padding:10px 0;border-block:1px solid var(--vl-miss-bg)}
.vl-dot{display:grid;place-items:center;width:min(24px,92%);max-width:100%;aspect-ratio:1;border-radius:50%;border:1px solid var(--vl-miss);color:var(--vl-miss);line-height:1}
.vl-dot.vl-active{background:var(--ink);border:2px solid var(--ink);color:var(--tint);font-weight:800;outline:1px solid var(--ink);outline-offset:1px}
.vl-after{border-style:dotted}.vl-note{white-space:nowrap}
@media(max-width:640px){
.vl-chain{display:flex;flex-direction:column;gap:0}.vl-step{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:baseline;padding:6px 8px}
.vl-arrow{align-self:start;margin-left:17px;line-height:12px;transform:rotate(90deg)}
}
`;
  }
});

// src/flowsvg.ts
function diffFlow(g, other) {
  const theirs = new Set(other.nodes.flatMap((n) => n.stmts));
  const out = /* @__PURE__ */ new Map();
  for (const n of g.nodes) {
    const extra = n.stmts.filter((s) => !theirs.has(s));
    if (extra.length) out.set(n.id, extra);
  }
  return out;
}
function renderFlowSvg(g, o) {
  const pos = (n) => ({ x: 12 + n.col * COL_W, y: 10 + n.row * ROW_H });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const hot = new Set(g.nodes.filter((n) => o.hi && n.kind === "decision" && n.line >= o.hi.start && n.line <= o.hi.end).map((n) => n.id));
  const focus = /* @__PURE__ */ new Set();
  if (hot.size) {
    const parents = /* @__PURE__ */ new Map();
    for (const e of g.edges) if (!e.back) parents.set(e.to, [...parents.get(e.to) ?? [], e.from]);
    const stack = [...hot];
    while (stack.length) {
      const id = stack.pop();
      if (focus.has(id)) continue;
      focus.add(id);
      for (const p2 of parents.get(id) ?? []) stack.push(p2);
    }
    for (const h of hot) {
      const hn = byId.get(h);
      const q = g.edges.filter((e) => e.from === h && !e.back && (byId.get(e.to)?.col ?? 0) > hn.col).map((e) => e.to);
      while (q.length) {
        const id = q.shift();
        if (focus.has(id)) continue;
        focus.add(id);
        for (const e of g.edges) if (e.from === id && !e.back && (byId.get(e.to)?.col ?? 0) > hn.col) q.push(e.to);
      }
    }
  }
  const dim = (id) => hot.size > 0 && !focus.has(id);
  const maxCol = Math.max(...g.nodes.map((n) => n.col));
  const maxRow = Math.max(...g.nodes.map((n) => n.row));
  const W3 = 12 + (maxCol + 1) * COL_W;
  const H = 10 + (maxRow + 1) * ROW_H + (g.truncated ? 20 : 0);
  const p = [];
  p.push(`<svg class="flow" viewBox="0 0 ${W3} ${H}" width="${W3}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(g.fn)} ${L("\uD750\uB984 \uC9C0\uB3C4", "flow map")}"><defs><marker id="fa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5C79A8"/></marker></defs>`);
  for (const e of g.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const pa = pos(a);
    const pb = pos(b);
    const acx = pa.x + NODE_W / 2;
    const bcx = pb.x + NODE_W / 2;
    let d;
    let lx = 0;
    let ly = 0;
    if (e.back) d = `M${acx} ${pa.y + NODE_H} V${pb.y - 10} H${bcx} V${pb.y - 1}`;
    else if (b.col > a.col) {
      const ay = pa.y + NODE_H / 2;
      const by = pb.y + NODE_H / 2;
      d = a.row === b.row ? `M${pa.x + NODE_W} ${ay} H${pb.x - 1}` : `M${pa.x + NODE_W} ${ay} H${pb.x - 10} V${by} H${pb.x - 1}`;
      lx = pa.x + NODE_W + 3;
      ly = ay - 5;
    } else {
      d = `M${acx} ${pa.y + NODE_H} V${pb.y - 1}`;
      lx = acx + 6;
      ly = pa.y + NODE_H + 13;
    }
    const on = focus.has(e.from) && focus.has(e.to);
    p.push(`<path d="${d}" fill="none" stroke="${on ? "#8DB5F4" : "#3E5784"}" stroke-width="${on ? 2 : 1.3}"${e.back ? ' stroke-dasharray="4 3"' : ""} marker-end="url(#fa)" opacity="${dim(e.from) || dim(e.to) ? 0.4 : 1}"/>`);
    if (e.label) p.push(`<text x="${lx}" y="${ly}" class="fe" opacity="${dim(e.from) ? 0.45 : 1}">${esc(e.label)}</text>`);
  }
  for (const n of g.nodes) {
    const { x, y } = pos(n);
    const isHot = hot.has(n.id);
    const extra = o.onlyHere?.get(n.id);
    const only = !!extra && n.kind !== "start" && !isHot;
    let stroke = "#3E5784";
    if (n.kind === "start") stroke = "#4285E8";
    if (n.kind === "end") stroke = n.label.startsWith("throw") ? "#B2574D" : "#2F9A6F";
    if (only && o.idColor) stroke = o.idColor;
    if (isHot) stroke = ST.diff;
    const fill = isHot ? "#2A2112" : "#101C30";
    const dash = only ? ' stroke-dasharray="5 3"' : "";
    const op = dim(n.id) ? ' opacity="0.42"' : "";
    p.push(`<g${op}>`);
    if (n.kind === "decision") {
      p.push(`<polygon points="${x + 12},${y} ${x + NODE_W - 12},${y} ${x + NODE_W},${y + NODE_H / 2} ${x + NODE_W - 12},${y + NODE_H} ${x + 12},${y + NODE_H} ${x},${y + NODE_H / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${isHot ? 2.2 : 1.3}"${dash}/>`);
    } else {
      p.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="${n.kind === "start" ? 23 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${dash}/>`);
    }
    const lines2 = wrapText(n.label, n.kind === "decision" ? 14 : 15, 2, true);
    const ty = lines2.length === 1 ? y + NODE_H / 2 + 4 : y + NODE_H / 2 - 3;
    const tip = [...n.stmts, ...only ? ["", L(`${o.onlyKey ?? ""}\uC5D0\uB9CC \uC788\uB294 \uBB38\uC7A5:`, `Only in ${o.onlyKey ?? ""}:`), ...extra] : []].join("\n") || n.label;
    p.push(`<text class="fl${isHot ? " hot" : ""}"><title>${esc(tip)}</title>${lines2.map((l, i) => `<tspan x="${x + (n.kind === "decision" ? 16 : 11)}" y="${ty + i * 14}">${esc(l)}</tspan>`).join("")}</text>`);
    p.push(`<text x="${x + NODE_W - 6}" y="${y - 3}" class="fn2" text-anchor="end">${L(`${n.line}\uD589`, `line ${n.line}`)}</text>`);
    if (only && o.onlyKey) {
      const tag = extra.length < n.stmts.length ? L(`+${extra.length}\uC904 ${o.onlyKey}\uC5D0\uB9CC`, `+${extra.length} only in ${o.onlyKey}`) : L(`${o.onlyKey}\uC5D0\uB9CC`, `only in ${o.onlyKey}`);
      p.push(`<text x="${x + 4}" y="${y - 3}" class="fo" fill="${o.idColor}">${esc(tag)}</text>`);
    }
    p.push("</g>");
  }
  if (g.truncated) p.push(`<text x="12" y="${H - 5}" class="fe">${L("\u2026 \uD568\uC218\uAC00 \uAE38\uC5B4 \uC55E\uBD80\uBD84\uB9CC \uADF8\uB838\uC2B5\uB2C8\uB2E4", "\u2026 the function is long; only the first part is drawn")}</text>`);
  p.push("</svg>");
  return p.join("");
}
var COL_W, ROW_H, NODE_W, NODE_H;
var init_flowsvg = __esm({
  "src/flowsvg.ts"() {
    init_view();
    init_i18n();
    COL_W = 214;
    ROW_H = 64;
    NODE_W = 196;
    NODE_H = 46;
  }
});

// src/chain.ts
function box(x, y, w, h, b) {
  const out = [];
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#0F1B30" stroke="${b.color}" stroke-width="1.6"${b.dashed ? ' stroke-dasharray="5 4"' : ""}/>`);
  out.push(`<rect x="${x + 1}" y="${y + 10}" width="4" height="${h - 20}" rx="2" fill="${b.color}"/>`);
  out.push(`<text x="${x + 16}" y="${y + 21}" class="ct">${esc(b.title)}</text>`);
  if (b.badge) out.push(`<circle cx="${x + w - 18}" cy="${y + 17}" r="10" fill="${ID[b.badge]}"/><text x="${x + w - 18}" y="${y + 21.5}" class="cb" text-anchor="middle">${b.badge}</text>`);
  const lineH = 17;
  const startY = y + 42;
  b.lines.forEach((l, i) => {
    const attr = b.judgeOf && i === 0 ? ` data-judge-of="${b.judgeOf}"` : "";
    out.push(`<text x="${x + 16}" y="${startY + i * lineH}" class="${b.mono ? "cm" : "cl2"}"${attr}>${esc(l)}</text>`);
  });
  if (b.sub) out.push(`<text x="${x + 16}" y="${y + h - 12}" class="cs">${esc(b.sub)}</text>`);
  return out.join("");
}
function arrow(x1, y, x2) {
  return `<path d="M${x1} ${y} H${x2 - 2}" stroke="#4A6591" stroke-width="1.5" fill="none" marker-end="url(#cha)"/>`;
}
function gapPill(cx, cy, text, color) {
  const w = 18 + units(text) * 11.5;
  return `<rect x="${cx - w / 2}" y="${cy - 11}" width="${w}" height="22" rx="11" fill="#1A1A10" stroke="${color}" stroke-width="1.2"/><text x="${cx}" y="${cy + 4}" class="cp" fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}
function renderChain(report, s) {
  const sets = report.sets;
  const id = s.req.id;
  const reqLines = wrapText(s.req.text, 12.5, 4);
  const kwLines = s.req.keywords.length ? wrapText(s.req.keywords.join(" \xB7 "), 15, 3, true) : [];
  const reqNeed = 42 + reqLines.length * 17 + (kwLines.length ? 16 + 18 + kwLines.length * 16 : 0) + 22;
  const lanesH = sets.length * LANE_H + (sets.length - 1) * GAP;
  const H = TOP * 2 + Math.max(lanesH, reqNeed);
  const off = (H - TOP * 2 - lanesH) / 2;
  const laneY = (i) => TOP + off + i * (LANE_H + GAP);
  const p = [];
  p.push(`<svg class="chain" viewBox="0 0 ${W2} ${H}" width="100%" role="img" aria-label="${esc(id)} ${L("\uADFC\uAC70 \uC0AC\uC2AC", "evidence chain")}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="cha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5C79A8"/></marker></defs>`);
  const nums = s.req.numbers.length ? L(`\uC22B\uC790 ${s.req.numbers.join("\xB7")}`, `number ${s.req.numbers.join(", ")}`) : s.req.guardCue ? L("\uAC70\uBD80 \uC870\uAC74", "rejection rule") : "";
  p.push(box(COL.req.x, TOP, COL.req.w, H - TOP * 2, { title: `${id} \xB7 ${L("\uC694\uAD6C\uC0AC\uD56D", "requirement")}`, lines: reqLines, sub: nums, color: overallColor(s.overall) }));
  if (kwLines.length) {
    const ky = TOP + 42 + reqLines.length * 17 + 16;
    p.push(`<text x="${COL.req.x + 16}" y="${ky}" class="cs">${L("\uCC3E\uB294 \uB2E8\uC5B4", "keywords")}</text>`);
    kwLines.forEach((l, i) => p.push(`<text x="${COL.req.x + 16}" y="${ky + 18 + i * 16}" class="ck">${esc(l)}</text>`));
  }
  sets.forEach((set, i) => {
    const y = laneY(i);
    const cy = y + LANE_H / 2;
    const rr = set.perReq[id];
    const e = rr.evidence;
    const u = e.unit;
    const cond = u?.kind === "condition";
    const codeLines = u ? cond ? wrapText(u.cond?.expr ?? u.text, 20, 2, true) : [L(`${u.fn}() \uD568\uC218 \uC804\uCCB4`, `${u.fn}() whole function`)] : [L("\uAD6C\uD604 \uADFC\uAC70 \uC5C6\uC74C", "No evidence found")];
    const codeSub = u ? `${u.file}:${u.startLine} \xB7 ${wEvidence(e.status)}${u.kind === "function" ? L(" \xB7 \uB113\uC740 \uADFC\uAC70", " \xB7 broad evidence") : ""}` : L("\uAD00\uB828 \uCF54\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD568", "no related code found");
    p.push(arrow(COL.req.x + COL.req.w, cy, COL.code.x));
    p.push(box(COL.code.x, y, COL.code.w, LANE_H, { title: `${set.label} \xB7 ${L("\uCF54\uB4DC \uADFC\uAC70", "code evidence")}`, lines: codeLines, sub: codeSub, mono: cond, color: u?.kind === "function" ? ST.diff : evColor(e.status), badge: set.key, dashed: !u }));
    const t = rr.tests.find((x) => x.status === "fail") ?? rr.tests[0];
    const changed = rr.testStatus !== "\uC2E4\uD328" && rr.edits?.some(suspicious);
    const testLines = t ? wrapText(t.name, 20, 2) : [L("\uC5F0\uACB0\uB41C \uAC80\uC0AC \uC5C6\uC74C", "No linked test")];
    const testSub = t ? t.status === "fail" ? wrapText(`${L("\uC2E4\uD328", "failed")} \xB7 ${t.message}`, 19, 1)[0] : L(`${rr.testStatus} \xB7 \uC5F0\uACB0 ${rr.tests.length}\uAC1C`, `${wTest(rr.testStatus)} \xB7 ${rr.tests.length} linked`) : L("\uBBF8\uC2E4\uD589 \u2192 \uB3D9\uC791 \uBBF8\uD655\uC778", "not run \u2192 behavior unverified");
    p.push(arrow(COL.code.x + COL.code.w, cy, COL.test.x));
    p.push(box(COL.test.x, y, COL.test.w, LANE_H, { title: changed ? L("\u26A0 \uAC80\uC0AC \xB7 \uBCC0\uACBD\uB428", "\u26A0 tests \xB7 changed") : L("\uAC80\uC0AC", "tests"), lines: testLines, sub: testSub, color: changed ? ST.diff : testColor(rr.testStatus), dashed: !t }));
    const b = e.boundary;
    let behLines = ["\u2014"];
    let behSub = L("\uC22B\uC790 \uC870\uAC74 \uC5C6\uC74C", "no numeric condition");
    let behColor = ST.unk;
    if (b && b.attempts !== null) {
      behLines = [L(`${b.attempts}\uBC88\uC9F8 \uC2DC\uB3C4`, `attempt ${b.attempts}`)];
      behSub = L(`\uC694\uAD6C\uC0AC\uD56D ${b.required}\uD68C \xB7 ${b.ok ? "\uC77C\uCE58" : "\uB2E4\uB984"}`, `required ${b.required} \xB7 ${b.ok ? "matches" : "differs"}`);
      behColor = b.ok ? ST.ok : ST.diff;
    } else if (b && b.ok !== null) {
      behLines = wrapText(boundaryShort(b), 11, 2);
      behSub = wrapText(`${pick(b.want)} \xB7 ${b.ok ? L("\uC77C\uCE58", "matches") : L("\uB2E4\uB984", "differs")}`, 11, 1)[0];
      behColor = b.ok ? ST.ok : ST.diff;
    } else if (b) {
      behLines = [L("\uD655\uC815 \uBD88\uAC00", "undetermined")];
      behSub = wrapText(pick(b.want), 11, 1)[0];
    }
    p.push(arrow(COL.test.x + COL.test.w, cy, COL.beh.x));
    p.push(box(COL.beh.x, y, COL.beh.w, LANE_H, { title: L("\uB3D9\uC791 \uC2DC\uC810", "when it acts"), lines: behLines, sub: behSub, color: behColor, dashed: !b }));
    p.push(arrow(COL.beh.x + COL.beh.w, cy, COL.judge.x));
  });
  p.push(box(COL.judge.x, TOP, COL.judge.w, H - TOP * 2, { title: L("\uC0AC\uB78C\uC758 \uD310\uB2E8", "your decision"), lines: [wJudge("\uBBF8\uAC80\uD1A0")], sub: L("\uC9C1\uC811 \uC815\uD568", "you decide"), color: ST.info, judgeOf: id }));
  if (sets.length === 2) {
    const gy = laneY(0) + LANE_H + GAP / 2;
    const [A, B] = sets;
    if (s.relation.kind === "\uBD88\uC77C\uCE58") p.push(gapPill(COL.code.x + COL.code.w / 2, gy, L("A\xB7B \uC870\uAC74 \uBD88\uC77C\uCE58", "A and B differ"), ST.diff));
    else if (s.relation.kind === "\uC77C\uCE58") p.push(gapPill(COL.code.x + COL.code.w / 2, gy, L("\uAC19\uC740 \uADFC\uAC70", "same evidence"), ST.ok));
    const ta = A.perReq[id].testStatus;
    const tb = B.perReq[id].testStatus;
    if (ta !== tb) p.push(gapPill(COL.test.x + COL.test.w / 2, gy, L("\uAC80\uC0AC \uACB0\uACFC \uB2E4\uB984", "test results differ"), ST.fail));
    const ba = A.perReq[id].evidence.boundary?.attempts;
    const bb = B.perReq[id].evidence.boundary?.attempts;
    if (ba != null && bb != null && ba !== bb) p.push(gapPill(COL.beh.x + COL.beh.w / 2, gy, L(`${Math.abs(ba - bb)}\uD68C \uCC28\uC774`, `off by ${Math.abs(ba - bb)}`), ST.diff));
  }
  p.push("</svg>");
  return p.join("");
}
var W2, LANE_H, GAP, TOP, COL;
var init_chain = __esm({
  "src/chain.ts"() {
    init_testedits();
    init_view();
    init_i18n();
    init_numeric();
    W2 = 1180;
    LANE_H = 98;
    GAP = 34;
    TOP = 6;
    COL = { req: { x: 0, w: 214 }, code: { x: 256, w: 292 }, test: { x: 590, w: 240 }, beh: { x: 872, w: 156 }, judge: { x: 1070, w: 110 } };
  }
});

// src/concept.ts
function info(report, set) {
  let changed = /* @__PURE__ */ new Map();
  const status = /* @__PURE__ */ new Map();
  let tree = Object.keys(set.files);
  try {
    changed = changedLines(report.repo, report.base, set.ref);
  } catch {
  }
  try {
    for (const l of git(report.repo, ["diff", "--name-status", "--no-renames", `${report.base}...${set.ref}`]).split("\n")) {
      const [st, f] = l.trim().split(/\t/);
      if (st && f) status.set(f, st[0]);
    }
  } catch {
  }
  try {
    tree = git(report.repo, ["ls-tree", "-r", "--name-only", set.ref]).split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
  }
  return { set, changed, status, tree };
}
function decos(report, set, file) {
  const out = [];
  for (const s of report.summaries) {
    const rr = set.perReq[s.req.id];
    const u = rr.evidence.unit;
    if (!u || u.file !== file) continue;
    const b = rr.evidence.boundary;
    let c;
    let text;
    if (b && b.attempts != null) {
      c = b.ok ? "ok" : "diff";
      text = `${s.req.id} ${b.ok ? "\uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC74C" : "\uB2E4\uB984"} \xB7 ${b.attempts}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0\uC11C \uB3D9\uC791${b.ok ? "" : ` \u2014 \uC694\uAD6C\uC0AC\uD56D\uC740 ${b.required}\uD68C`} \xB7 \uAC80\uC0AC ${rr.testStatus}`;
    } else if (rr.testStatus === "\uBBF8\uC2E4\uD589") {
      c = "unk";
      text = `${s.req.id} \uBBF8\uD655\uC778 \xB7 \uCF54\uB4DC\uB294 \uCC3E\uC558\uC9C0\uB9CC \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC5C6\uC74C`;
    } else if (rr.testStatus === "\uC2E4\uD328") {
      c = "fail";
      text = `${s.req.id} \uC2E4\uD328 \xB7 \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC2E4\uD328`;
    } else {
      c = "ok";
      text = `${s.req.id} \uD655\uC778\uB428 \xB7 ${u.kind === "function" ? `${u.fn}() \uD568\uC218 \uC804\uCCB4\uAC00 \uADFC\uAC70` : "\uC870\uAC74\uC774 \uADFC\uAC70"} \xB7 \uAC80\uC0AC \uD1B5\uACFC`;
    }
    const mark = b && b.ok === false || s.relation.kind === "\uBD88\uC77C\uCE58";
    out.push({ key: s.req.id, line: u.startLine, end: u.kind === "condition" ? u.endLine : u.startLine, c, text, expr: u.cond?.expr, op: mark ? u.cond?.op : void 0 });
  }
  for (const d of set.dyn) if (d.file === file) out.push({ key: "dyn", line: d.line, end: d.line, c: "unk", text: "\uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uD638\uCD9C \xB7 \uBB34\uC5C7\uC774 \uC2E4\uD589\uB420\uC9C0 \uC815\uC801 \uBD84\uC11D\uC73C\uB85C \uC54C \uC218 \uC5C6\uC74C" });
  return out;
}
function pane(report, si, file) {
  const set = si.set;
  const src = (set.files[file] ?? "").replace(/\n$/, "").split("\n");
  const ch = si.changed.get(file) ?? /* @__PURE__ */ new Set();
  const ds = decos(report, set, file);
  const rows = [];
  src.forEach((line, i) => {
    const n = i + 1;
    for (const d of ds.filter((x) => x.line === n)) rows.push(`<div class="lens ${d.c}" data-k="${d.key}"><span class="ln"></span><span class="lt">${d.key === "dyn" ? "?" : "\u25C6"} ${esc(d.text)}</span></div>`);
    const here2 = ds.filter((x) => n >= x.line && n <= x.end);
    const md = here2.find((x) => x.expr && x.line === n);
    const html = md ? hlMark(line, md.expr, md.op) : hl(line);
    const keys = here2.map((x) => x.key).join(" ");
    rows.push(`<div class="cl${ch.has(n) ? " add" : ""}"${keys ? ` data-k="${keys}" data-c="${here2[0].c}"` : ""}><span class="ln">${n}</span><span class="tx">${html || " "}</span></div>`);
  });
  return `<div class="pane" data-set="${set.key}"><div class="etab">${dot(set.key)}<b>${esc(file.split("/").pop())}</b><span class="tg" style="color:${ID[set.key]}">${set.label}</span><span class="rf">${esc(set.ref)} \xB7 ${set.sha}</span></div><div class="code">${rows.join("")}</div></div>`;
}
function explorer(infos, file) {
  const all = [...new Set(infos.flatMap((i) => i.tree))].sort((a, b) => a.localeCompare(b));
  const out = [];
  let dir = "";
  for (const f of all) {
    const parts = f.split("/");
    const d = parts.slice(0, -1).join("/");
    if (d !== dir) {
      dir = d;
      if (d) out.push(`<div class="fd">\u25BE ${esc(d)}</div>`);
    }
    const tags = infos.filter((i) => i.status.has(f)).map((i) => `<span class="ft" style="color:${ID[i.set.key]}">${i.set.key} ${i.status.get(f) === "A" ? "\uCD94\uAC00" : "\uBCC0\uACBD"}</span>`).join("");
    out.push(`<div class="fi${f === file ? " on" : ""}${d ? " in" : ""}"><span class="fn">${esc(parts[parts.length - 1])}</span>${tags}</div>`);
  }
  return `<div class="sh">\uD0D0\uC0C9\uAE30</div><div class="fr">\u25BE login-service</div>${out.join("")}`;
}
function miniTimeline(report, id) {
  const rows = report.sets.map((s) => ({ s, b: s.perReq[id].evidence.boundary })).filter((x) => x.b && x.b.attempts != null);
  if (!rows.length) return "";
  const req = rows[0].b.required;
  const N = Math.max(7, req + 2, ...rows.map((r) => r.b.attempts + 1));
  const head = Array.from({ length: N }, (_, i) => `<span class="mh${i + 1 === req ? " on" : ""}">${i + 1}</span>`).join("");
  const reqCells = Array.from({ length: N }, (_, i) => `<span class="mc${i + 1 >= req ? " qq" : ""}"></span>`).join("");
  const res = rows.map((r) => {
    const at = r.b.attempts;
    const good = at === req;
    const cells = Array.from({ length: N }, (_, i) => {
      const n = i + 1;
      const miss = !good && n === req && at > req;
      return `<span class="mc${n >= at ? good ? " gd" : " of" : ""}${miss ? " ms" : ""}">${miss ? "\xD7" : ""}</span>`;
    }).join("");
    return `<div class="mr"><span class="ml">${dot(r.s.key)}${r.s.key}</span>${cells}</div>`;
  }).join("");
  return `<div class="tlm"><div class="tlh">\uC2DC\uB3C4 \uD69F\uC218\uBCC4 \uC7A0\uAE08 \uC2DC\uC810</div><div class="mr"><span class="ml"></span>${head}</div><div class="mr"><span class="ml">\uC694\uAD6C</span>${reqCells}</div>${res}<div class="tln">\uCE60\uD55C \uCE78\uBD80\uD130 \uC7A0\uAE40 \xB7 <span class="msx">\xD7</span> \uC7A0\uACA8\uC57C \uD558\uB294\uB370 \uC548 \uC7A0\uAE40</div></div>`;
}
function detailOf(report, s) {
  const id = s.req.id;
  const lines2 = report.sets.map((set) => {
    const rr = set.perReq[id];
    const u = rr.evidence.unit;
    const b = rr.evidence.boundary;
    const what = u ? u.kind === "condition" ? `<code>${esc(u.cond?.expr ?? u.text)}</code>` : `<code>${esc(u.fn)}()</code> \uD568\uC218 \uC804\uCCB4` : "\uADFC\uAC70 \uC5C6\uC74C";
    const beh = b && b.attempts != null ? `<em class="${b.ok ? "ok" : "diff"}">${b.attempts}\uBC88\uC9F8</em> \uC2DC\uB3C4\uC5D0\uC11C \uB3D9\uC791 \xB7 ` : "";
    const fail = rr.tests.find((t) => t.status === "fail");
    const test = rr.tests.length ? `\uAC80\uC0AC ${tsMark(rr.testStatus)} ${rr.testStatus}` : `\uAC80\uC0AC ${tsMark("\uBBF8\uC2E4\uD589")} \uC5F0\uACB0\uB41C \uAC80\uC0AC \uC5C6\uC74C`;
    return `<div class="dl">${dot(set.key)}<b>${set.label}</b> ${what}<div class="ds">${beh}${test}</div>${fail ? `<div class="ds fm">${esc(fail.name)}</div>` : ""}</div>`;
  }).join("");
  const dyn = s.overall === "\uBBF8\uD655\uC778" ? report.sets.flatMap((set) => set.dyn.map((d) => `<div class="dl dn">${dot(set.key)}? <code>${esc(d.text)}</code> ${esc(d.file.split("/").pop())}:${d.line} \xB7 \uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uD638\uCD9C</div>`)).join("") : "";
  const tl = s.overall === "\uB2E4\uB984" ? miniTimeline(report, id) : "";
  return `<div class="dt" data-req="${id}" hidden>${lines2}${dyn}${tl}</div>`;
}
function vlPanel(report) {
  const c = counts(report);
  const two = report.sets.length === 2;
  const rows = report.summaries.map((s) => {
    const ab = report.sets.map((set) => `<span class="ab">${dot(set.key)}\uADFC\uAC70${evMark(set.perReq[s.req.id].evidence.status)} \uAC80\uC0AC${tsMark(set.perReq[s.req.id].testStatus)}</span>`).join("");
    return `<li class="rq" data-req="${s.req.id}"><div class="r1"><span class="pill ${cls(s.overall)}">${s.overall}</span><b class="rid">${s.req.id}</b><span class="rt">${esc(s.req.text)}</span></div><div class="r2">${ab}</div><div class="r3">\uD310\uB2E8 <span class="jd" data-j="${s.req.id}">\uBBF8\uAC80\uD1A0</span></div></li>`;
  }).join("");
  const logo = '<svg width="16" height="16" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="7"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="8.5" stroke-linecap="round"/></svg>';
  return `<div class="sh">${logo}<span>VerifyLens</span><small>\uC694\uAD6C\uC0AC\uD56D ${report.summaries.length} \xB7 ${two ? "\uACB0\uACFC A\xB7B \uBE44\uAD50" : "\uACB0\uACFC 1\uAC1C"}</small></div>
<div class="scanbar"><div class="sb1">\uC694\uAD6C\uC0AC\uD56D ${report.summaries.length}\uAC1C\uB97C \uCF54\uB4DC\uC640 \uB9DE\uCDB0 \uBCF4\uB294 \uC911\u2026</div><div class="sb2"><i></i></div><div class="sb3">\uCF54\uB4DC \uADFC\uAC70 \uCC3E\uAE30 \u2192 \uAC80\uC0AC \uACB0\uACFC \uC77D\uAE30 \u2192 \uACB0\uACFC \uBE44\uAD50</div></div>
<div class="cnts"><span class="ok">\uD655\uC778\uB428 <b>${c.\uD655\uC778\uB428}</b></span><span class="diff">\uB2E4\uB984 <b>${c.\uB2E4\uB984}</b></span><span class="fail">\uC2E4\uD328 <b>${c.\uC2E4\uD328}</b></span><span class="unk">\uBBF8\uD655\uC778 <b>${c.\uBBF8\uD655\uC778}</b></span></div>
<ul class="rqs">${rows}</ul>
${report.summaries.map((s) => detailOf(report, s)).join("")}
<div class="vf">\uC774 PC \uC548\uC5D0\uC11C \uADDC\uCE59\uC73C\uB85C \uBD84\uC11D \xB7 \uB124\uD2B8\uC6CC\uD06C \uC5C6\uC74C \xB7 AI \uCD94\uC815 \uC5C6\uC74C</div>`;
}
function bottom(infos) {
  const diff = infos.map((i) => {
    const files = [...i.changed].filter(([f]) => CODE_EXT2.test(f)).map(([f, s]) => `<span class="df">${esc(f)} <b>+${s.size}</b>${i.status.get(f) === "A" ? " <em>\uC0C8 \uD30C\uC77C</em>" : ""}</span>`).join("");
    return `<div class="trow">${dot(i.set.key)}<b class="tw">${i.set.label}</b><span class="tref">${esc(i.set.ref)}</span>${files}</div>`;
  }).join("");
  const tests = infos.map((i) => {
    const head = `<div class="trow th">$ node --test <span class="tref">\u2192 \uAC80\uC0AC \uBCF4\uACE0\uC11C \xB7 ${i.set.label} \xB7 ${i.set.sha}</span></div>`;
    const body = i.set.tests.map((t) => `<div class="trow${t.status === "fail" ? " fail" : ""}"><span class="tk ${t.status === "pass" ? "ok" : t.status === "fail" ? "no" : "na"}">${t.status === "pass" ? "\u2714" : t.status === "fail" ? "\u2716" : "\u2013"}</span>${esc(t.name)}${t.status === "fail" && t.message ? `<span class="tmsg">${esc(t.message)}</span>` : ""}</div>`).join("");
    return head + (body || '<div class="trow mute">\uAC80\uC0AC \uBCF4\uACE0\uC11C \uC5C6\uC74C</div>');
  }).join("");
  return `<div class="ttabs"><span class="tt" data-t="diff">\uBCC0\uACBD \uC694\uC57D</span><span class="tt" data-t="test">\uAC80\uC0AC \uACB0\uACFC</span><span class="tsp"></span><span class="tnote">\uD130\uBBF8\uB110</span></div>
<div class="tbody"><div class="tv" data-t="none"><div class="trow mute">$ <span class="cur"></span></div></div><div class="tv" data-t="diff">${diff}<div class="trow mute">AI\uAC00 \uBC14\uAFBC \uCF54\uB4DC \uC904 \uC218 (+\uB294 \uC0C8\uB85C \uC4F0\uAC70\uB098 \uACE0\uCE5C \uC904)</div></div><div class="tv" data-t="test">${tests}</div></div>`;
}
function chat(report, infos) {
  const reqs = report.reqs.map((r) => `<li>${esc(r.text)}</li>`).join("");
  const claims = report.reqs.map((r) => `<li><b class="ok">\u2713</b> ${esc(r.text)}</li>`).join("");
  const files = (i) => [...i.changed].filter(([f]) => CODE_EXT2.test(f) && !TEST_FILE2.test(f)).map(([f, s]) => `<code>${esc(f.split("/").pop())} +${s.size}</code>`).join(" ");
  const say = { A: "\uAD6C\uD604\uD588\uC2B5\uB2C8\uB2E4. \uC694\uAD6C\uC0AC\uD56D 3\uAC1C \uBAA8\uB450 \uBC18\uC601\uD588\uC5B4\uC694.", B: "\uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4! \uB85C\uADF8\uC778 \uC9C0\uD45C \uAE30\uB85D\uB3C4 \uAC19\uC774 \uCD94\uAC00\uD588\uC5B4\uC694." };
  const ai = infos.map((i, k) => `<div class="msg ai" data-n="${k + 2}"><div class="who">${dot(i.set.key)}AI \uC5D0\uC774\uC804\uD2B8 ${k + 1} <span>\u2192 ${i.set.label}</span></div><p>${say[i.set.key] ?? "\uAD6C\uD604\uD588\uC2B5\uB2C8\uB2E4."}</p><ul class="cl3">${claims}</ul><div class="mf">\uBC14\uAFBC \uD30C\uC77C ${files(i)}</div><div class="done">\u2713 \uC791\uC5C5 \uC644\uB8CC</div></div>`).join("");
  return `<div class="sh">AI \uCF54\uB529 \uB3C4\uC6B0\uBBF8<span class="vtag">\uAC00\uC0C1 \uB300\uD654</span></div><div class="msgs"><div class="msg me" data-n="1"><div class="who">\uAC1C\uBC1C\uC790</div><p>\uB85C\uADF8\uC778 \uC7A0\uAE08 \uAE30\uB2A5 \uCD94\uAC00\uD574 \uC918. \uC544\uB798 \uC694\uAD6C\uC0AC\uD56D \uC9C0\uCF1C\uC11C.</p><ul>${reqs}</ul></div>${ai}</div><div class="cin">AI\uC5D0\uAC8C \uC694\uCCAD\uD558\uAE30\u2026</div>`;
}
function cover() {
  return `<div class="ov ov-cover"><div class="cv">
<div class="kick">VerifyLens \uCEE8\uC149 \uC2DC\uC5F0</div>
<h1>AI \uC5C6\uC774\uB294 \uC77C\uD560 \uC218 \uC5C6\uC9C0\uB9CC,<br>AI\uAC00 \uB9CC\uB4E0 \uCF54\uB4DC\uB97C \uADF8\uB300\uB85C \uBBFF\uC744 \uC218\uB294 \uC5C6\uC2B5\uB2C8\uB2E4.</h1>
<p>\uADF8\uB798\uC11C \uAC1C\uBC1C\uC790\uB294 AI \uACB0\uACFC\uBB3C\uC744 <b>\uAC70\uAFB8\uB85C \uC77D\uC73C\uBA70 \uB2E4\uC2DC \uAC80\uC99D</b>\uD569\uB2C8\uB2E4.<br><b class="bl">VerifyLens</b>\uB294 \uADF8 \uC7AC\uAC80\uC99D\uC744 \uC694\uAD6C\uC0AC\uD56D\uBCC4 \uADFC\uAC70 \uD654\uBA74\uC73C\uB85C \uBC14\uAFD4, <b>\uAC80\uC99D\uC5D0 \uB4DC\uB294 \uC2DC\uAC04\uC744 \uC904\uC785\uB2C8\uB2E4.</b></p>
<div class="f3"><div><i>1</i><b>\uC694\uAD6C\uC0AC\uD56D</b><small>\uBB34\uC5C7\uC744 \uB9CC\uB4E4\uC5B4\uC57C \uD588\uB098</small></div><span>\u2192</span><div><i>2</i><b>\uADFC\uAC70</b><small>\uCF54\uB4DC \xB7 \uAC80\uC0AC \xB7 \uB3D9\uC791 \uC2DC\uC810</small></div><span>\u2192</span><div><i>3</i><b>\uC0AC\uB78C\uC758 \uD310\uB2E8</b><small>\uC4F8\uC9C0 \xB7 \uACE0\uCE60\uC9C0 \xB7 \uB354 \uBCFC\uC9C0</small></div></div>
<button class="go" data-go="1">\uC2DC\uC5F0 \uC2DC\uC791 \u2192</button>
<div class="note">\uAC00\uC0C1 \uC0AC\uB840(\uB85C\uADF8\uC778 \uC7A0\uAE08) \xB7 \uD654\uBA74 \uC18D \uBD84\uC11D \uACB0\uACFC\uB294 \uD504\uB85C\uD1A0\uD0C0\uC785\uC774 \uC2E4\uC81C \uCF54\uB4DC\uC640 \uC2E4\uD589\uD55C \uAC80\uC0AC\uC5D0\uC11C \uACC4\uC0B0\uD55C \uAC12\uC785\uB2C8\uB2E4 \xB7 \uD0A4\uBCF4\uB4DC \u2192 \uB85C \uB118\uAE41\uB2C8\uB2E4</div>
</div></div>`;
}
function where2(report, F, U) {
  const c = counts(report);
  const bad = report.sets.find((s) => s.perReq[F.req.id].evidence.boundary?.ok === false);
  const bb = bad?.perReq[F.req.id].evidence;
  const prLine = bad && bb?.unit ? `<b>${F.req.id} \uB2E4\uB984</b> \u2014 ${bad.label} <code>${esc(bb.unit.cond?.expr ?? "")}</code> \u2192 ${bb.boundary.attempts}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0\uC11C \uB3D9\uC791 (\uC694\uAD6C\uC0AC\uD56D ${bb.boundary.required}\uD68C)` : `<b>${F.req.id} ${F.overall}</b>`;
  const uLine = U ? `<b>${U.req.id} \uBBF8\uD655\uC778</b> \u2014 \uC5F0\uACB0\uB41C \uAC80\uC0AC \uC5C6\uC74C` : "";
  return `<div class="ov ov-where"><div class="wh">
<h2>\uAC19\uC740 \uBD84\uC11D \uC5D4\uC9C4\uC744, \uAC1C\uBC1C\uC790\uAC00 \uC774\uBBF8 \uC4F0\uB294 \uACF3\uC5D0 \uBD99\uC785\uB2C8\uB2E4</h2>
<div class="cards">
<div class="wc"><span class="wt">\uCCAB \uC81C\uD488 \uD6C4\uBCF4</span><h3>\uC5D0\uB514\uD130 \uD328\uB110</h3><p>VS Code\xB7Cursor \uD655\uC7A5. AI\uAC00 \uCF54\uB4DC\uB97C \uB9CC\uB4E0 \uC9C1\uD6C4 \uC606 \uD328\uB110\uC5D0\uC11C \uBC14\uB85C \uD655\uC778\uD569\uB2C8\uB2E4. \uBC29\uAE08 \uBCF4\uC2E0 \uD654\uBA74\uC785\uB2C8\uB2E4.</p>
<div class="mini mide"><div class="mi1"><span class="pill ok">\uD655\uC778\uB428</span> R1</div><div class="mi1"><span class="pill diff">\uB2E4\uB984</span> R2</div><div class="mi1"><span class="pill unk">\uBBF8\uD655\uC778</span> R3</div></div></div>
<div class="wc"><span class="wt">\uD300\uC6A9</span><h3>PR \uAC80\uC0AC</h3><p>PR\uC744 \uC62C\uB9AC\uBA74 \uC694\uAD6C\uC0AC\uD56D\uBCC4 \uC0C1\uD0DC\uC640 \uC694\uC57D\uC774 \uB313\uAE00\uB85C \uBD99\uACE0, \uB9AC\uBDF0\uC5B4\uB294 \uAC08\uB9AC\uB294 \uACF3\uBD80\uD130 \uBD05\uB2C8\uB2E4.</p>
<div class="mini mpr"><div class="mph"><span class="bot">VerifyLens</span> \uAC80\uC99D \uACB0\uACFC</div><div class="mpc">\uD655\uC778\uB428 ${c.\uD655\uC778\uB428} \xB7 \uB2E4\uB984 ${c.\uB2E4\uB984} \xB7 \uBBF8\uD655\uC778 ${c.\uBBF8\uD655\uC778}</div><div class="mpl">${prLine}</div>${uLine ? `<div class="mpl">${uLine}</div>` : ""}</div></div>
<div class="wc"><span class="wt">\uD655\uC7A5</span><h3>AI \uC5D0\uC774\uC804\uD2B8 \uB3C4\uAD6C</h3><p>AI\uAC00 "\uC644\uB8CC"\uB77C\uACE0 \uB9D0\uD558\uAE30 \uC804\uC5D0 VerifyLens \uACB0\uACFC\uB97C \uD568\uAED8 \uBCF4\uC5EC \uC90D\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uD560\uC9C0\uB294 \uC0AC\uB78C\uC774 \uC815\uD569\uB2C8\uB2E4.</p>
<div class="mini mag"><div class="mab">AI: \uC791\uC5C5\uC744 \uB9C8\uCCE4\uACE0 VerifyLens\uB85C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. <b>${F.req.id} \uB2E4\uB984</b>\uC774 \uC788\uC5B4\uC694. \uC5B4\uB5BB\uAC8C \uD560\uAE4C\uC694?</div><div class="mbt"><span>\uADFC\uAC70 \uBCF4\uAE30</span><span>\uC218\uC815 \uC694\uCCAD</span></div></div></div>
</div>
<div class="now">\uC9C0\uAE08(v0) \u2014 \uBA85\uB839\uC5B4 \uD55C \uC904\uB85C \uB9AC\uD3EC\uD2B8 \uD30C\uC77C\uC744 \uB9CC\uB4E4\uACE0, \uC774 PC \uC548\uC5D0\uC11C\uB9CC \uBD84\uC11D\uD569\uB2C8\uB2E4. \uAC19\uC740 \uC5D4\uC9C4\uC744 \uC5D0\uB514\uD130 \xB7 PR \xB7 AI \uB3C4\uAD6C\uC5D0 \uBD99\uC774\uB294 \uAC83\uC774 \uB2E4\uC74C \uB2E8\uACC4\uC785\uB2C8\uB2E4.</div>
<div class="acts"><a class="btn" href="report.html#${F.req.id}">\uC804\uCCB4 \uB9AC\uD3EC\uD2B8 \uC5F4\uAE30</a><button class="btn ghost" data-go="0">\uCC98\uC74C\uBD80\uD130</button></div>
</div></div>`;
}
function steps(report, infos, F, U) {
  const c = counts(report);
  const id = F.req.id;
  const nums = infos.map((i) => `${i.set.key} ${codeLinesAdded(i)}\uC904`).join(" \xB7 ");
  const conds = report.sets.map((s) => ({ s, e: s.perReq[id].evidence }));
  const condTxt = conds.map((x) => `${x.s.label}\uB294 <code>${esc(x.e.unit?.cond?.expr ?? x.e.unit?.text ?? "\uADFC\uAC70 \uC5C6\uC74C")}</code>`).join(", ");
  const bad = conds.find((x) => x.e.boundary?.ok === false);
  const failed = report.sets.filter((s) => s.perReq[id].testStatus === "\uC2E4\uD328");
  const passOff = !!bad && bad.s.perReq[id].testStatus === "\uD1B5\uACFC";
  const allGreen = report.sets.every((s) => s.tests.length > 0 && s.tests.every((t) => t.status !== "fail"));
  const maxLines = Math.max(...infos.map(codeLinesAdded));
  const S = [];
  S.push({ title: "VerifyLens \uCEE8\uC149 \uC2DC\uC5F0", body: "AI\uAC00 \uB9CC\uB4E0 \uCF54\uB4DC\uB97C \uC4F0\uAE30 \uC804, \uBB34\uC5C7\uC774 \uD655\uC778\uB410\uACE0 \uBB34\uC5C7\uC774 \uB2E4\uB974\uACE0 \uBB34\uC5C7\uC774 \uC544\uC9C1 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uB294\uC9C0\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uBD05\uB2C8\uB2E4.", side: "files", chat: 0, term: "none", focus: "", ov: "cover" });
  S.push({ title: "\uAC1C\uBC1C\uC790\uAC00 AI\uC5D0\uAC8C \uAE30\uB2A5\uC744 \uB9E1\uAE41\uB2C8\uB2E4", body: `"\uB85C\uADF8\uC778\uC5D0 \uC5F0\uC18D 5\uD68C \uC2E4\uD328\uD558\uBA74 \uACC4\uC815\uC744 \uC7A0\uAC00 \uC918." \uC774 \uC694\uCCAD \uC548\uC5D0\uB294 \uC9C0\uCF1C\uC57C \uD560 \uC694\uAD6C\uC0AC\uD56D\uC774 ${report.reqs.length}\uAC1C \uC788\uC2B5\uB2C8\uB2E4.`, side: "files", chat: 1, term: "none", focus: "chat" });
  S.push({ title: allGreen ? 'AI\uB294 \uB450 \uACB0\uACFC \uBAA8\uB450 "\uC644\uB8CC"\uB77C\uACE0 \uB2F5\uD558\uACE0, \uD14C\uC2A4\uD2B8\uB3C4 \uC804\uBD80 \uD1B5\uACFC\uD569\uB2C8\uB2E4' : 'AI\uB294 \uB450 \uACB0\uACFC \uBAA8\uB450 "\uC694\uAD6C\uC0AC\uD56D \uC804\uBD80 \uBC18\uC601, \uC644\uB8CC"\uB77C\uACE0 \uB2F5\uD569\uB2C8\uB2E4', body: `${allGreen ? "\uD14C\uC2A4\uD2B8\uAC00 \uD1B5\uACFC\uD588\uB2E4\uACE0 \uC694\uAD6C\uC0AC\uD56D\uB300\uB85C\uB77C\uB294 \uB73B\uC740 \uC544\uB2D9\uB2C8\uB2E4. AI\uAC00 \uCF54\uB4DC\uC640 \uD14C\uC2A4\uD2B8\uB97C \uAC19\uC740 \uC624\uD574\uB85C \uC4F0\uBA74 \uB458 \uB2E4 \uCD08\uB85D\uC0C9\uC785\uB2C8\uB2E4. " : ""}\uC815\uB9D0 \uADF8\uB7F0\uC9C0\uB294 AI\uC758 \uB9D0\uC774 \uC544\uB2C8\uB77C \uCF54\uB4DC\uB85C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4. \uBC14\uB010 \uCF54\uB4DC(${nums})\uB97C \uC0AC\uB78C\uC774 \uAC70\uAFB8\uB85C \uC77D\uC5B4 \uAC00\uBA70 \uB2E4\uC2DC \uAC80\uC99D\uD558\uB294 \uAC83 \u2014 \uC9C0\uAE08 \uAC1C\uBC1C\uC790\uB4E4\uC774 \uC2DC\uAC04\uC744 \uC4F0\uB294 \uACF3\uC774 \uC5EC\uAE30\uC785\uB2C8\uB2E4.`, side: "files", chat: 3, term: "diff", diff: 1, focus: "chat ed term" });
  S.push({ title: "VerifyLens\uAC00 \uC694\uAD6C\uC0AC\uD56D\uB9C8\uB2E4 \uCF54\uB4DC\uC640 \uAC80\uC0AC \uACB0\uACFC\uB97C \uB9DE\uCDB0 \uBD05\uB2C8\uB2E4", body: `AI\uB294 \uBAA8\uB450 \u2713\uB77C\uACE0 \uD588\uC9C0\uB9CC \uACB0\uACFC\uB294 <b class="ok">\uD655\uC778\uB428 ${c.\uD655\uC778\uB428}</b> \xB7 <b class="diff">\uB2E4\uB984 ${c.\uB2E4\uB984}</b> \xB7 <b class="unk">\uBBF8\uD655\uC778 ${c.\uBBF8\uD655\uC778}</b>\uC785\uB2C8\uB2E4. \uC774 PC \uC548\uC5D0\uC11C \uADDC\uCE59\uC73C\uB85C \uBD84\uC11D\uD558\uACE0, AI\uAC00 \uCD94\uC815\uD55C \uB0B4\uC6A9\uC740 \uB123\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`, side: "vl", chat: 3, term: "test", diff: 1, focus: "side", scan: 1 });
  S.push({ title: '"\uB2E4\uB984"\uC744 \uB204\uB974\uBA74 \uB450 \uACB0\uACFC\uAC00 \uAC08\uB9AC\uB294 \uCF54\uB4DC \uC904\uB85C \uBC14\uB85C \uAC11\uB2C8\uB2E4', body: `${condTxt}. \uBC14\uB010 \uCF54\uB4DC \uC218\uC2ED \uC904 \uAC00\uC6B4\uB370 \uC5F0\uC0B0\uC790 \uD55C \uAE00\uC790\uAC00 \uB2E4\uB985\uB2C8\uB2E4. \uC5D0\uB514\uD130 \uC548\uC5D0 \uC694\uAD6C\uC0AC\uD56D\uACFC\uC758 \uAD00\uACC4\uAC00 \uD568\uAED8 \uD45C\uC2DC\uB429\uB2C8\uB2E4.`, side: "vl", chat: 3, term: "test", diff: 1, focus: "ed side", show: id, sel: id });
  if (bad?.e.boundary)
    S.push({ title: `\uCF54\uB4DC \uAC12\uC73C\uB85C \uACC4\uC0B0\uD558\uBA74, ${bad.s.label}\uB294 ${bad.e.boundary.attempts}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0\uC11C\uC57C \uC7A0\uAE09\uB2C8\uB2E4`, body: `\uC694\uAD6C\uC0AC\uD56D\uC740 ${bad.e.boundary.required}\uBC88\uC9F8\uC785\uB2C8\uB2E4. ${failed.length ? `\uC2E4\uC81C\uB85C \uB3CC\uB9B0 \uAC80\uC0AC\uB3C4 ${failed.map((s) => s.label).join("\xB7")}\uC5D0\uC11C \uC2E4\uD328\uD574 \uC774 \uCC28\uC774\uB97C \uB4B7\uBC1B\uCE68\uD569\uB2C8\uB2E4. ` : passOff ? `\uADF8\uB7F0\uB370 ${bad.s.label}\uC758 \uAC80\uC0AC\uB294 \uD1B5\uACFC\uD588\uC2B5\uB2C8\uB2E4. \uAC80\uC0AC\uAC00 \uC694\uAD6C\uC0AC\uD56D\uACFC \uB2E4\uB978 \uD69F\uC218\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC5B4\uC11C, \uD14C\uC2A4\uD2B8\uB9CC \uB3CC\uB824\uC11C\uB294 \uBCF4\uC774\uC9C0 \uC54A\uB294 \uC5B4\uAE0B\uB0A8\uC785\uB2C8\uB2E4. ` : ""}"\uC644\uB8CC"\uB77C\uB358 AI\uC758 \uB9D0\uACFC \uB2E4\uB985\uB2C8\uB2E4.`, side: "vl", chat: 3, term: "test", diff: 1, focus: "side term", show: id, sel: id, tl: 1, failhi: 1 });
  if (U)
    S.push({ title: '\uD655\uC778\uB418\uC9C0 \uC54A\uC740 \uAC83\uC740 "\uBBF8\uD655\uC778"\uC73C\uB85C \uB0A8\uAE41\uB2C8\uB2E4', body: `${U.req.id}\uB294 \uCF54\uB4DC\uB294 \uCC3E\uC558\uC9C0\uB9CC \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC5C6\uC5B4 \uC2E4\uC81C \uB3D9\uC791\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. <code>hooks[event]?.()</code>\uCC98\uB7FC \uBB34\uC5C7\uC774 \uC2E4\uD589\uB420\uC9C0 \uC54C \uC218 \uC5C6\uB294 \uD638\uCD9C\uB3C4 \uB530\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uADFC\uAC70\uAC00 \uC5C6\uB294 \uACF3\uC744 \uC548\uC2EC\uC2DC\uD0A4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`, side: "vl", chat: 3, term: "test", diff: 1, focus: "ed side", show: `${U.req.id} dyn`, sel: U.req.id });
  const judge2 = {};
  for (const s of report.summaries) judge2[s.req.id] = s.overall === "\uD655\uC778\uB428" ? "\uC0AC\uC6A9" : s.overall === "\uBBF8\uD655\uC778" ? "\uCD94\uAC00 \uAC80\uC99D" : bad ? `${bad.s.key} \uC218\uC815` : "\uC218\uC815";
  S.push({ title: "\uBB34\uC5C7\uC744 \uC4F8\uC9C0\uB294 \uC0AC\uB78C\uC774 \uADFC\uAC70\uB97C \uBCF4\uACE0 \uC815\uD569\uB2C8\uB2E4", body: `\uCF54\uB4DC ${maxLines}\uC904\uC744 \uCC98\uC74C\uBD80\uD130 \uB2E4\uC2DC \uC77D\uB294 \uB300\uC2E0, \uAC08\uB9AC\uB294 \uD55C \uC904\uACFC \uADF8 \uADFC\uAC70\uB9CC \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uD310\uB2E8\uACFC \uC774\uC720\uB294 \uADFC\uAC70\uC640 \uD568\uAED8 \uAE30\uB85D\uC73C\uB85C \uB0A8\uC2B5\uB2C8\uB2E4.`, side: "vl", chat: 3, term: "test", diff: 1, focus: "side", show: id, sel: id, judge: judge2 });
  S.push({ title: "\uC81C\uD488\uC740 \uAC1C\uBC1C\uC790\uC758 \uC791\uC5C5 \uD750\uB984 \uC548\uC73C\uB85C \uB4E4\uC5B4\uAC11\uB2C8\uB2E4", body: "\uC9C0\uAE08 \uBCF4\uC2E0 \uAC83\uC740 v0(\uB85C\uCEEC \uBA85\uB839\uC5B4 + \uB9AC\uD3EC\uD2B8 \uD30C\uC77C)\uC785\uB2C8\uB2E4. \uC81C\uD488\uC740 \uAC19\uC740 \uBD84\uC11D \uC5D4\uC9C4\uC744 \uC5D0\uB514\uD130\xB7PR\xB7AI \uB3C4\uAD6C\uC5D0 \uBD99\uC774\uB294 \uD615\uD0DC\uC785\uB2C8\uB2E4.", side: "vl", chat: 3, term: "test", diff: 1, focus: "", show: id, sel: id, judge: judge2, ov: "where" });
  return S;
}
function renderConcept(report) {
  const F = report.summaries.find((s) => s.overall === "\uB2E4\uB984" || s.overall === "\uC2E4\uD328") ?? report.summaries[0];
  const U = report.summaries.find((s) => s.overall === "\uBBF8\uD655\uC778" && s !== F);
  const file = report.sets.map((s) => s.perReq[F.req.id].evidence.unit?.file).find(Boolean) ?? Object.keys(report.sets[0].files).find((f) => !TEST_FILE2.test(f)) ?? "";
  const infos = report.sets.map((s) => info(report, s));
  const S = steps(report, infos, F, U);
  const data = { steps: S, first: F.req.id, unc: U?.req.id ?? "", autoMs: 9e3 };
  const mark = '<svg width="22" height="22" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="6"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/></svg>';
  const ico = (p) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#AEBBD0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const keys = [...report.summaries.map((s) => s.req.id), "dyn"];
  const keyCss = keys.map((k) => `.app[data-show~="${k}"] .lens[data-k="${k}"]{display:flex}.app[data-show~="${k}"] .cl[data-k~="${k}"]{background:var(--hl);box-shadow:inset 3px 0 var(--hb)}.app[data-show~="${k}"] .cl[data-k~="${k}"] .ln{color:#E6EDF8}.app[data-show~="${k}"] .cl[data-k~="${k}"] mark.xm{background:rgba(251,191,36,.18);outline-color:rgba(251,191,36,.6)}.app[data-show~="${k}"] .cl[data-k~="${k}"] b.op{background:#FBBF24;color:#1A1203}`).join("");
  const dots = S.map((_, i) => `<button class="dot" aria-label="${i}\uB2E8\uACC4"></button>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VerifyLens \uCEE8\uC149 \uC2DC\uC5F0</title><style>${CSS}${keyCss}</style></head>
<body>
<div class="app" data-step="0">
<div class="top"><div class="logo">${mark}<div>Verify<span>Lens</span></div></div><div class="meta">\uCEE8\uC149 \uC2DC\uC5F0 \xB7 \uAC00\uC0C1 \uC0AC\uB840(\uB85C\uADF8\uC778 \uC7A0\uAE08)</div><span class="sp"></span><span class="badge">\uBD84\uC11D \uACB0\uACFC\uB294 \uD504\uB85C\uD1A0\uD0C0\uC785\uC774 \uC2E4\uC81C\uB85C \uACC4\uC0B0\uD55C \uAC12 \xB7 AI \uCD94\uC815 \uC5C6\uC74C</span><a href="report.html#${F.req.id}">\uC804\uCCB4 \uB9AC\uD3EC\uD2B8 \u2192</a></div>
<div class="frame">
<div class="tb"><i></i><i></i><i></i><b>login-service \u2014 ${esc(file)}</b><span class="sp"></span>\uACB0\uACFC A \xB7 B \uBE44\uAD50 \uBCF4\uAE30</div>
<div class="act"><span class="a-files" title="\uD0D0\uC0C9\uAE30">${ico('<path d="M4 4h6l2 2h8v13H4z"/>')}</span><span title="\uAC80\uC0C9">${ico('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>')}</span><span title="\uC18C\uC2A4 \uC81C\uC5B4">${ico('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4-6 3-11 6"/>')}</span><span class="a-vl" title="VerifyLens">${mark.replace('width="22" height="22"', 'width="20" height="20"')}</span></div>
<div class="side z" data-z="side"><div class="sv sv-files">${explorer(infos, file)}</div><div class="sv sv-vl">${vlPanel(report)}</div></div>
<div class="ed z" data-z="ed">${infos.map((i) => pane(report, i, file)).join("")}</div>
<div class="term z" data-z="term">${bottom(infos)}</div>
<div class="chat z" data-z="chat">${chat(report, infos)}</div>
${cover()}${where2(report, F, U)}
</div>
<div class="nar"><div class="nno" id="nno"></div><div class="ntx"><h2 id="nt"></h2><p id="nb"></p></div><div class="nav"><div class="nbt"><button id="prev">\u2190</button><button id="next">\uB2E4\uC74C \u2192</button><button id="auto">\u25B6 \uC790\uB3D9</button></div><div class="dots">${dots}</div></div></div>
</div>
<script type="application/json" id="cd">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>${SCRIPT}</script>
</body></html>`;
}
var TEST_FILE2, CODE_EXT2, codeLinesAdded, cls, dot, evMark, tsMark, CSS, SCRIPT;
var init_concept = __esm({
  "src/concept.ts"() {
    init_git();
    init_summary();
    init_view();
    TEST_FILE2 = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/)/;
    CODE_EXT2 = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
    codeLinesAdded = (si) => [...si.changed].filter(([f]) => CODE_EXT2.test(f) && !TEST_FILE2.test(f)).reduce((n, [, s]) => n + s.size, 0);
    cls = (o) => o === "\uD655\uC778\uB428" ? "ok" : o === "\uB2E4\uB984" ? "diff" : o === "\uC2E4\uD328" ? "fail" : "unk";
    dot = (k) => `<i class="idd" style="background:${ID[k]}"></i>`;
    evMark = (s) => `<b class="${s === "\uBC1C\uACAC" ? "ok" : s === "\uC77C\uBD80 \uBC1C\uACAC" ? "diff" : "unk"}">${s === "\uBC1C\uACAC" ? "\u25CF" : s === "\uC77C\uBD80 \uBC1C\uACAC" ? "\u25D0" : "\u25CB"}</b>`;
    tsMark = (s) => `<b class="${s === "\uD1B5\uACFC" ? "ok" : s === "\uC2E4\uD328" ? "fail" : "unk"}">${s === "\uD1B5\uACFC" ? "\u2713" : s === "\uC2E4\uD328" ? "\u2717" : "\u2013"}</b>`;
    CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--fs:13px;--code:12.5px;--lh:20px;--side:clamp(280px,21vw,380px);--chat:clamp(290px,21vw,400px);--term:clamp(150px,19vh,220px)}
@media (min-width:1700px){:root{--fs:14.5px;--code:14px;--lh:23px}}
html,body{height:100%}
body{background:#060D18;color:#C9D5E8;font:var(--fs)/1.5 'Pretendard Variable','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;overflow:hidden;min-width:1180px}
code,.code,.tbody,.rf,.tref{font-family:'Cascadia Mono',Consolas,monospace}
code{font-size:.92em;color:#BFD3F2;background:#14223A;padding:0 5px;border-radius:4px}
.ok{color:#6EE7B7}.diff{color:#FCD34D}.fail{color:#FCA5A5}.unk{color:#CBD5E1}
.idd{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;flex:none}
.pill{display:inline-flex;align-items:center;height:20px;padding:0 9px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap}
.pill.ok{background:rgba(52,211,153,.15)}.pill.diff{background:rgba(251,191,36,.16)}.pill.fail{background:rgba(248,113,113,.16)}.pill.unk{background:rgba(148,163,184,.16)}
.app{height:100vh;display:flex;flex-direction:column}
.top{height:44px;flex:none;display:flex;align-items:center;gap:12px;padding:0 18px;background:#050B15;border-bottom:1px solid #16243C}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:#fff}.logo span{color:#8DB5F4}
.top .meta{color:#7D8FAB;font-size:12px}.sp{flex:1}
.badge{height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:12px;border:1px solid rgba(52,211,153,.45);color:#6EE7B7;font-size:11.5px;font-weight:700;white-space:nowrap}
.top a{color:#9DB7E0;font-size:12.5px;text-decoration:none;border:1px solid #27406B;border-radius:7px;padding:4px 10px}.top a:hover{background:#10213D}
.frame{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:46px var(--side) minmax(0,1fr) var(--chat);grid-template-rows:30px minmax(0,1fr) var(--term);background:#0A1424}
.tb{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0 12px;background:#07101C;border-bottom:1px solid #16243C;color:#7D8FAB;font-size:12px}.tb i{width:11px;height:11px;border-radius:50%;background:#26354F;display:inline-block}.tb b{color:#AEBBD0;font-weight:600;margin-left:10px}
.act{grid-row:2/4;background:#07101C;border-right:1px solid #16243C;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:8px}
.act span{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;opacity:.45}
.app[data-side=files] .act .a-files,.app[data-side=vl] .act .a-vl{opacity:1;background:#12213B;box-shadow:inset 2px 0 #4285E8}
.z{position:relative;transition:opacity .35s ease;min-width:0;min-height:0}
.z.dim{opacity:.3}
.z.hot::after{content:'';position:absolute;inset:1px;border:2px solid #4285E8;border-radius:6px;pointer-events:none;z-index:20;box-shadow:0 0 0 3px rgba(66,133,232,.2),0 0 26px rgba(66,133,232,.18)}
.side{grid-row:2/4;background:#0B1526;border-right:1px solid #16243C;overflow:hidden;display:flex;flex-direction:column}
.sh{height:34px;flex:none;display:flex;align-items:center;gap:7px;padding:0 14px;font-size:11.5px;font-weight:800;letter-spacing:.04em;color:#8A9BB8;border-bottom:1px solid #14223A}.sh small{margin-left:auto;font-weight:500;letter-spacing:0;color:#5E7091}
.sv{display:none;flex:1;min-height:0;overflow:auto;flex-direction:column}
.app[data-side=files] .sv-files,.app[data-side=vl] .sv-vl{display:flex}
.fr,.fd{padding:4px 14px;color:#AEBBD0;font-weight:700;font-size:12px}.fd{padding-left:22px;color:#8A9BB8}
.fi{display:flex;align-items:center;gap:6px;padding:3px 14px 3px 22px;font-size:12.5px;color:#AEBBD0}.fi.in{padding-left:36px}.fi.on{background:#12213B;color:#fff}
.fi .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ft{font-size:10.5px;font-weight:800;opacity:0;transition:opacity .3s}
.app[data-diff="1"] .ft{opacity:1}
.sv-vl .sh span{color:#fff;font-size:13px;letter-spacing:0}
.scanbar{display:none;padding:18px 16px}.sb1{color:#E6EDF8;font-weight:700;margin-bottom:10px}.sb2{height:5px;border-radius:3px;background:#14223A;overflow:hidden}.sb2 i{display:block;height:100%;width:0;background:#4285E8}.sb3{margin-top:9px;color:#7D8FAB;font-size:11.5px}
.app.scanning .scanbar{display:block}.app.scanning .sb2 i{animation:bar 1.3s ease forwards}
.app.scanning .cnts,.app.scanning .rqs,.app.scanning .dt,.app.scanning .vf{display:none}
@keyframes bar{to{width:100%}}
.cnts{display:flex;gap:12px;padding:10px 14px 6px;font-size:12px}.cnts b{font-size:15px;margin-left:2px}
.rqs{list-style:none;padding:4px 8px}
.rq{border:1px solid #16243C;border-radius:9px;padding:8px 10px;margin-bottom:6px;cursor:pointer;background:#0C182B;animation:rqIn .4s both}
.rq:nth-child(2){animation-delay:.12s}.rq:nth-child(3){animation-delay:.24s}.rq:nth-child(4){animation-delay:.36s}
.rq:hover{border-color:#27406B}.rq.on{border-color:#4285E8;background:#10213D}
@keyframes rqIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.r1{display:flex;align-items:flex-start;gap:7px}.rid{color:#8DB5F4;flex:none;line-height:20px}.rt{color:#E6EDF8;font-weight:600;font-size:12.5px;line-height:1.45;padding-top:1px}
.r2{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:11.5px;color:#8A9BB8}.ab{display:inline-flex;align-items:center;gap:4px}.ab b{font-size:12px;margin-right:2px}.ab b.unk{color:#64748B}
.r3{margin-top:5px;font-size:11.5px;color:#6B7D9A}.jd{display:inline-block;margin-left:4px;color:#7D8FAB;transition:all .3s}.jd.set{color:#fff;background:#1F57B5;border-radius:6px;padding:0 8px;font-weight:800}
.rq:nth-child(2) .jd.set{transition-delay:.35s}.rq:nth-child(3) .jd.set{transition-delay:.7s}
.dt{margin:2px 8px 6px;padding:9px 11px;border:1px dashed #27406B;border-radius:9px;background:#0A1424;font-size:12px;animation:rqIn .35s both}
.dl{margin-bottom:7px;color:#C9D5E8;line-height:1.55}.dl b{margin-right:4px}.ds{color:#8A9BB8;font-size:11.5px;padding-left:15px}.fm{color:#FCA5A5}.dl em{font-style:normal;font-weight:800}.dl em.ok{color:#6EE7B7}.dl em.diff{color:#FCD34D}.dn{color:#AEBBD0}
.tlm{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #16243C}.app[data-tl="1"] .tlm{display:block;animation:rqIn .4s both}
.tlh{font-size:11px;font-weight:800;color:#8A9BB8;margin-bottom:6px}
.mr{display:flex;align-items:center;gap:4px;margin-bottom:4px}.ml{width:38px;flex:none;font-size:11px;color:#AEBBD0;display:flex;align-items:center}
.mh{width:19px;text-align:center;font-size:10px;color:#6B7D9A}.mh.on{color:#8DB5F4;font-weight:800}
.mc{width:19px;height:19px;border-radius:50%;border:2px solid #2A3A58;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}
.mc.qq{background:#4285E8;border-color:#4285E8}.mc.gd{background:#34D399;border-color:#34D399}.mc.of{background:#FBBF24;border-color:#FBBF24}.mc.ms{border-color:#F87171;color:#F87171;background:rgba(248,113,113,.15)}
.tln{font-size:10.5px;color:#6B7D9A;margin-top:4px}.msx{color:#F87171;font-weight:900}
.vf{margin-top:auto;padding:10px 14px;font-size:11px;color:#5E7091;border-top:1px solid #14223A}
.ed{grid-row:2;display:grid;grid-template-columns:1fr 1fr;background:#0A1424;overflow:hidden}
.pane{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid #16243C}
.etab{height:34px;flex:none;display:flex;align-items:center;gap:2px;padding:0 12px;background:#0B1526;border-bottom:1px solid #16243C;font-size:12.5px;color:#E6EDF8;white-space:nowrap;overflow:hidden}.etab b{margin-right:8px}.etab .tg{font-weight:800;font-size:11.5px}.etab .rf{margin-left:auto;color:#5E7091;font-size:10.5px;padding-left:8px;overflow:hidden;text-overflow:ellipsis}
.code{position:relative;flex:1;min-height:0;overflow:auto;padding:6px 0 30px;font-size:var(--code)}
.cl{display:flex;min-height:var(--lh);line-height:var(--lh);transition:background .3s}
.cl .ln{width:42px;flex:none;text-align:right;padding-right:12px;color:#3F5070;user-select:none}
.cl .tx{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:10px;padding-left:2.2em;text-indent:-2.2em}
.app[data-diff="1"] .cl.add{background:rgba(46,163,107,.07)}.app[data-diff="1"] .cl.add .ln{box-shadow:inset -3px 0 #2EA36B;color:#5E8C77}
.cl[data-c=ok]{--hl:rgba(52,211,153,.13);--hb:#34D399}.cl[data-c=diff]{--hl:rgba(251,191,36,.15);--hb:#FBBF24}.cl[data-c=fail]{--hl:rgba(248,113,113,.15);--hb:#F87171}.cl[data-c=unk]{--hl:rgba(148,163,184,.14);--hb:#94A3B8}
.cl mark.xm{background:transparent;color:inherit;border-radius:4px;padding:1px 2px;outline:1px solid transparent;transition:all .3s}
.cl b.op{background:transparent;color:inherit;border-radius:3px;padding:0 3px;margin:0 1px;transition:all .3s}
.lens{display:none;align-items:center;min-height:calc(var(--lh) + 2px);font-family:'Pretendard Variable','Noto Sans KR','Malgun Gothic',sans-serif;font-size:11.5px;animation:lensIn .35s both}
.lens .ln{width:42px;flex:none}.lens .lt{padding:1px 9px;border-radius:5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 50px)}
.lens.ok .lt{background:rgba(52,211,153,.14);color:#6EE7B7}.lens.diff .lt{background:rgba(251,191,36,.16);color:#FCD34D}.lens.fail .lt{background:rgba(248,113,113,.16);color:#FCA5A5}.lens.unk .lt{background:rgba(148,163,184,.16);color:#CBD5E1}
@keyframes lensIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
.k{color:#C792EA}.s{color:#9ED8A6}.n{color:#F2A07B}.f{color:#82AAFF}.ty{color:#7FDBCA}.c{color:#5C6F8F;font-style:italic}.p{color:#9DB7E0}.pu{color:#7F93B8}
.term{grid-row:3;grid-column:3;background:#07101C;border-top:1px solid #16243C;display:flex;flex-direction:column;overflow:hidden}
.ttabs{height:30px;flex:none;display:flex;align-items:center;gap:16px;padding:0 14px;border-bottom:1px solid #14223A;font-size:11.5px;color:#6B7D9A}
.tt{padding:6px 0;border-bottom:2px solid transparent}.app[data-term=diff] .tt[data-t=diff],.app[data-term=test] .tt[data-t=test]{color:#E6EDF8;border-color:#4285E8}
.tsp{flex:1}.tnote{font-size:10.5px}
.tbody{flex:1;min-height:0;overflow:auto;padding:6px 14px;font-size:calc(var(--code) - .5px)}
.tv{display:none}.app[data-term=none] .tv[data-t=none],.app[data-term=diff] .tv[data-t=diff],.app[data-term=test] .tv[data-t=test]{display:block}
.trow{display:flex;align-items:center;gap:8px;line-height:1.75;color:#AEBBD0;flex-wrap:wrap;border-radius:5px;padding:0 6px;transition:background .3s}
.trow.th{color:#7D8FAB;margin-top:2px}.tref{color:#5E7091;font-size:.92em}.tw{color:#E6EDF8;min-width:52px}
.tbody .tw,.tbody .tref,.tbody em,.tbody .mute{font-family:'Pretendard Variable','Noto Sans KR','Malgun Gothic',sans-serif}
.df{color:#AEBBD0}.df b{color:#6EE7B7}.df em{font-style:normal;color:#C084FC;font-size:.9em}
.tk{width:14px;text-align:center;font-weight:900}.tk.ok{color:#34D399}.tk.no{color:#F87171}.tmsg{color:#FCA5A5;font-size:.92em}
.app[data-failhi="1"] .trow.fail{background:rgba(248,113,113,.14);box-shadow:inset 3px 0 #F87171}
.mute{color:#5E7091}.cur{display:inline-block;width:8px;height:15px;background:#5E7091;vertical-align:-2px;animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.chat{grid-row:2/4;grid-column:4;background:#0B1526;border-left:1px solid #16243C;display:flex;flex-direction:column;overflow:hidden}
.vtag{margin-left:auto;font-size:10.5px;letter-spacing:0;color:#FCD34D;border:1px solid rgba(251,191,36,.45);border-radius:8px;padding:0 7px;font-weight:700}
.msgs{flex:1;min-height:0;overflow:auto;padding:12px}
.msg{border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.55;animation:rqIn .45s both}
.msg.me{background:#13284A;color:#E6EDF8}.msg.me ul{margin:6px 0 0 18px;color:#C9D5E8}
.msg.ai{background:#0F1D33;border:1px solid #1C2B46}.msg.ai[data-n="3"]{animation-delay:.6s}
.who{font-size:11px;font-weight:800;color:#8A9BB8;margin-bottom:4px;display:flex;align-items:center}.who span{font-weight:600;margin-left:4px;color:#6B7D9A}
.msg p{color:#E6EDF8}.cl3{list-style:none;margin:6px 0 0;color:#C9D5E8;font-size:12px}.cl3 li{margin-bottom:2px}
.mf{margin-top:7px;font-size:11px;color:#7D8FAB}.mf code{font-size:10.5px;margin-left:3px}
.done{margin-top:7px;display:inline-block;font-size:11px;font-weight:800;color:#6EE7B7;background:rgba(52,211,153,.12);border-radius:7px;padding:1px 8px}
.app[data-chat="0"] .msg{display:none}.app[data-chat="1"] .msg[data-n="2"],.app[data-chat="1"] .msg[data-n="3"],.app[data-chat="2"] .msg[data-n="3"]{display:none}
.cin{margin:10px 12px 12px;border:1px solid #1C2B46;border-radius:9px;padding:9px 12px;color:#4F6283;font-size:12px}
.ov{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(5,11,21,.88);backdrop-filter:blur(3px);padding:24px}
.app[data-ov=cover] .ov-cover,.app[data-ov=where] .ov-where{display:flex;animation:fade .4s both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.cv{max-width:1000px;text-align:center}
.kick{display:inline-block;color:#8DB5F4;font-weight:800;font-size:13px;letter-spacing:.08em;border:1px solid #27406B;border-radius:14px;padding:3px 14px;margin-bottom:22px}
.cv h1{font-size:clamp(28px,2.6vw,44px);line-height:1.3;color:#fff;letter-spacing:-.02em;margin-bottom:18px}
.cv p{font-size:clamp(15px,1.15vw,19px);line-height:1.8;color:#C9D5E8;margin-bottom:30px}.cv p b{color:#fff}.cv p .bl{color:#8DB5F4}
.f3{display:flex;align-items:stretch;justify-content:center;gap:14px;margin-bottom:30px}.f3>span{align-self:center;color:#4A6591;font-size:22px}
.f3 div{width:230px;border:1px solid #27406B;border-radius:14px;background:#0C1628;padding:16px 14px;display:flex;flex-direction:column;align-items:center;gap:4px}
.f3 i{font-style:normal;width:26px;height:26px;border-radius:50%;background:#4285E8;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
.f3 b{color:#fff;font-size:16px}.f3 small{color:#8A9BB8;font-size:12.5px}
.go,.btn{display:inline-block;background:#4285E8;color:#fff;border:0;border-radius:10px;padding:11px 26px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;text-decoration:none}.go:hover,.btn:hover{background:#3274DA}
.btn.ghost{background:transparent;border:1px solid #27406B;color:#AEBBD0}
.note{margin-top:20px;color:#6B7D9A;font-size:12px}
.wh{max-width:1180px;width:100%}.wh h2{text-align:center;color:#fff;font-size:clamp(22px,1.9vw,32px);margin-bottom:22px;letter-spacing:-.01em}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.wc{border:1px solid #27406B;border-radius:14px;background:#0C1628;padding:18px 18px 16px;display:flex;flex-direction:column}
.wt{align-self:flex-start;font-size:11px;font-weight:800;color:#8DB5F4;border:1px solid #27406B;border-radius:10px;padding:1px 9px;margin-bottom:10px}
.wc h3{color:#fff;font-size:18px;margin-bottom:6px}.wc p{color:#AEBBD0;font-size:13px;line-height:1.65;margin-bottom:14px}
.mini{margin-top:auto;border:1px solid #1C2B46;border-radius:10px;background:#0A1424;padding:11px 12px;font-size:12px}
.mi1{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:#C9D5E8}
.mph{color:#E6EDF8;font-weight:700;margin-bottom:4px}.bot{background:#1F57B5;color:#fff;border-radius:5px;padding:0 6px;font-size:11px;margin-right:4px}.mpc{color:#8A9BB8;margin-bottom:6px}.mpl{color:#C9D5E8;line-height:1.55;margin-bottom:3px}.mpl b{color:#FCD34D}.mpl:last-child b{color:#CBD5E1}
.mab{background:#0F1D33;border-radius:8px;padding:8px 10px;color:#E6EDF8;line-height:1.55}.mab b{color:#FCD34D}.mbt{display:flex;gap:6px;margin-top:8px}.mbt span{border:1px solid #27406B;border-radius:7px;padding:2px 10px;color:#9DB7E0;font-size:11.5px}
.now{margin:18px auto 0;text-align:center;color:#9DB7E0;font-size:13.5px}
.acts{display:flex;justify-content:center;gap:10px;margin-top:16px}
.nar{flex:none;min-height:112px;display:flex;align-items:center;gap:22px;padding:14px 22px;background:#050B15;border-top:1px solid #16243C}
.nno{width:64px;flex:none;color:#5E7091;font-size:14px;text-align:center}.nno b{display:block;color:#8DB5F4;font-size:30px;line-height:1.1}
.ntx{flex:1;min-width:0;animation:fade .35s both}
.ntx h2{color:#fff;font-size:clamp(17px,1.35vw,23px);letter-spacing:-.01em;margin-bottom:5px}
.ntx p{color:#C9D5E8;font-size:clamp(13.5px,1vw,16.5px);line-height:1.65}.ntx p b.ok{color:#6EE7B7}.ntx p b.diff{color:#FCD34D}.ntx p b.unk{color:#CBD5E1}
.nav{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:9px}
.nbt{display:flex;gap:8px}.nbt button{background:#10213D;border:1px solid #27406B;color:#E6EDF8;border-radius:8px;padding:7px 14px;font:inherit;font-weight:700;cursor:pointer}.nbt button:disabled{opacity:.35;cursor:default}.nbt #next{background:#4285E8;border-color:#4285E8}
.nbt #auto.on{background:#1F57B5;border-color:#4285E8}
.dots{display:flex;gap:6px}.dot{width:22px;height:6px;border-radius:3px;background:#1C2B46;border:0;cursor:pointer;padding:0}.dot.past{background:#2F4D80}.dot.on{background:#4285E8}
`;
    SCRIPT = String.raw`
(function(){
var D=JSON.parse(document.getElementById('cd').textContent),S=D.steps,app=document.querySelector('.app'),cur=-1,auto=null;
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function scrollPanes(show){
  var keys=(show||'').split(' ').filter(Boolean);
  $$('.pane .code').forEach(function(c){
    var lo=Infinity,hi=-Infinity;
    keys.forEach(function(k){
      $$('.lens[data-k="'+k+'"],.cl[data-k~="'+k+'"]',c).forEach(function(el){
        if(!el.offsetHeight)return;
        lo=Math.min(lo,el.offsetTop);hi=Math.max(hi,el.offsetTop+el.offsetHeight);
      });
    });
    var top=0,h=c.clientHeight;
    if(lo<Infinity){top=hi-lo<h*0.85?lo-(h-(hi-lo))*0.4:lo-24;}
    top=Math.max(0,top);
    try{c.scrollTo({top:top,behavior:'smooth'});}catch(e){c.scrollTop=top;}
  });
}
function state(s){
  app.setAttribute('data-side',s.side);app.setAttribute('data-show',s.show||'');app.setAttribute('data-term',s.term||'none');
  app.setAttribute('data-diff',s.diff?'1':'0');app.setAttribute('data-tl',s.tl?'1':'0');app.setAttribute('data-ov',s.ov||'');
  app.setAttribute('data-chat',String(s.chat||0));app.setAttribute('data-failhi',s.failhi?'1':'0');
  var f=(s.focus||'').split(' ').filter(Boolean);
  $$('.z').forEach(function(z){var on=f.indexOf(z.getAttribute('data-z'))>=0;z.classList.toggle('hot',on);z.classList.toggle('dim',f.length>0&&!on);});
  $$('.rq').forEach(function(r){r.classList.toggle('on',r.getAttribute('data-req')===s.sel);});
  $$('.dt').forEach(function(d){d.hidden=d.getAttribute('data-req')!==s.sel;});
  $$('.jd').forEach(function(j){var v=s.judge&&s.judge[j.getAttribute('data-j')];j.textContent=v||'미검토';j.classList.toggle('set',!!v);});
  scrollPanes(s.show);
}
function go(i){
  i=Math.max(0,Math.min(S.length-1,i));var prev=cur;cur=i;var s=S[i];
  app.setAttribute('data-step',String(i));
  state(s);
  if(s.scan&&prev<i){app.classList.remove('scanning');void app.offsetWidth;app.classList.add('scanning');setTimeout(function(){app.classList.remove('scanning');},1450);}
  else app.classList.remove('scanning');
  var t=$('.ntx');t.style.animation='none';void t.offsetWidth;t.style.animation='';
  $('#nt').innerHTML=s.title;$('#nb').innerHTML=s.body;
  $('#nno').innerHTML=i===0?'':'<b>'+i+'</b>/ '+(S.length-1);
  $$('.dot').forEach(function(d,k){d.classList.toggle('on',k===i);d.classList.toggle('past',k<i);});
  $('#prev').disabled=i===0;$('#next').textContent=i===S.length-1?'처음으로':i===0?'시작 →':'다음 →';
  try{history.replaceState(null,'','#s'+i);}catch(e){}
  if(auto&&i===S.length-1)stopAuto();
}
function next(){go(cur===S.length-1?0:cur+1);}
function stopAuto(){clearInterval(auto);auto=null;$('#auto').classList.remove('on');$('#auto').textContent='▶ 자동';}
$('#next').addEventListener('click',next);
$('#prev').addEventListener('click',function(){go(cur-1);});
$('#auto').addEventListener('click',function(){
  if(auto){stopAuto();return;}
  if(cur===S.length-1)go(0);
  auto=setInterval(function(){cur<S.length-1?go(cur+1):stopAuto();},D.autoMs);
  this.classList.add('on');this.textContent='❚❚ 멈춤';
});
$$('.dot').forEach(function(d,k){d.addEventListener('click',function(){go(k);});});
$$('[data-go]').forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-go'));});});
$$('.rq').forEach(function(r){r.addEventListener('click',function(){
  var id=r.getAttribute('data-req'),s=S[cur],x={};for(var k in s)x[k]=s[k];
  x.side='vl';x.sel=id;x.show=id+(D.unc===id?' dyn':'');x.focus='ed side';x.ov='';x.diff=1;x.term='test';x.chat=3;x.tl=D.first===id?1:0;x.failhi=0;
  state(x);
});});
document.addEventListener('keydown',function(e){
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;
  var k=e.key;
  if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();next();}
  else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(cur-1);}
  else if(k==='Home')go(0);else if(k==='End')go(S.length-1);
  else if(/^[0-9]$/.test(k))go(+k);
});
var m=/^#s(\d+)$/.exec(location.hash||'');
go(m?+m[1]:0);
})();
`;
  }
});

// src/output.ts
var output_exports = {};
__export(output_exports, {
  renderHtml: () => renderHtml,
  writeOutputs: () => writeOutputs
});
import { readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";
function headline(report, s) {
  const id = s.req.id;
  const sets = report.sets;
  const bad = sets.filter((x) => x.perReq[id].evidence.boundary?.ok === false);
  const failed = sets.filter((x) => x.perReq[id].testStatus === "\uC2E4\uD328");
  const labels = (xs) => joinNames(xs.map((x) => x.label));
  if (s.overall === "\uB2E4\uB984") {
    const parts = [];
    for (const x of bad) {
      const b = x.perReq[id].evidence.boundary;
      const u = x.perReq[id].evidence.unit;
      parts.push(
        b.attempts !== null ? L(
          `${x.label}\uC758 \uC870\uAC74 <code>${esc(u.cond?.expr ?? "")}</code>\uC740 <b>${b.attempts}\uBC88\uC9F8 \uC2DC\uB3C4</b>\uC5D0\uC11C \uB3D9\uC791\uD574 \uC694\uAD6C\uC0AC\uD56D(${b.required}\uD68C)\uACFC \uB2E4\uB985\uB2C8\uB2E4.`,
          `The condition <code>${esc(u.cond?.expr ?? "")}</code> in ${x.label} acts on <b>attempt ${b.attempts}</b>, which differs from the requirement (${b.required}).`
        ) : L(`${x.label}\uC758 \uC870\uAC74 <code>${esc(u.cond?.expr ?? "")}</code>: <b>${esc(boundaryLine(b))}</b>.`, `The condition <code>${esc(u.cond?.expr ?? "")}</code> in ${x.label}: <b>${esc(boundaryLine(b))}</b>.`)
      );
    }
    if (!bad.length && s.relation.kind === "\uBD88\uC77C\uCE58") parts.push(L(`\uB450 \uACB0\uACFC\uC758 \uC870\uAC74\uC774 \uB2E4\uB985\uB2C8\uB2E4 (${esc(s.relation.detail)}).`, `The two results use different conditions (${esc(s.relation.detail)}).`));
    if (failed.length) parts.push(L(`${labels(failed)}\uC5D0\uC11C \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC2E4\uD328\uD574 \uC774 \uCC28\uC774\uB97C \uB4B7\uBC1B\uCE68\uD569\uB2C8\uB2E4.`, `A linked test fails in ${labels(failed)}, which supports this difference.`));
    const passOff = bad.filter((x) => x.perReq[id].testStatus === "\uD1B5\uACFC");
    if (passOff.length) {
      const pb = passOff[0].perReq[id].evidence.boundary;
      parts.push(
        L(
          `\uADF8\uB7F0\uB370 ${labels(passOff)}\uC5D0\uC11C \uC5F0\uACB0\uB41C \uAC80\uC0AC\uB294 <b>\uD1B5\uACFC</b>\uD588\uC2B5\uB2C8\uB2E4. \uAC80\uC0AC\uAC00 \uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC740 ${checkWord(pb, "ko")}\uC744 \uD655\uC778\uD558\uB294\uC9C0 \uAC80\uC0AC \uCF54\uB4DC\uB97C \uBCF4\uC138\uC694.`.replace("\uD69F\uC218\uC744", "\uD69F\uC218\uB97C"),
          `Yet the linked test <b>passes</b> in ${labels(passOff)}. Check in the test code that it exercises the same ${checkWord(pb, "en")} as the requirement.`
        )
      );
    }
    return parts.join(" ");
  }
  if (s.overall === "\uC2E4\uD328") return L(`${labels(failed)}\uC5D0\uC11C \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC2E4\uD328 \uC774\uC720\uBD80\uD130 \uD655\uC778\uD558\uC138\uC694.`, `A linked test fails in ${labels(failed)}. Start with the failure message.`);
  if (s.overall === "\uBBF8\uD655\uC778") {
    const open = sets.flatMap((x) => (x.perReq[id].evidence.boundaries ?? []).filter((b) => b.ok === null).map((b) => `${sets.length > 1 ? `${x.label}: ` : ""}${boundaryLine(b)}`));
    if (open.length) return L(`\uC22B\uC790 \uC870\uAC74\uC744 \uD655\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ${esc(open.join(" / "))}`, `The numeric condition could not be confirmed. ${esc(open.join(" / "))}`);
    const noEv = sets.filter((x) => x.perReq[id].evidence.status === "\uBBF8\uBC1C\uACAC");
    if (noEv.length) return L(`${labels(noEv)}\uC5D0\uC11C \uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uCF54\uB4DC \uC704\uCE58\uB97C \uC0AC\uB78C\uC774 \uC9C1\uC811 \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.`, `No implementation evidence was found in ${labels(noEv)}. Someone has to locate the code by hand.`);
    return L(
      "\uAD00\uB828 \uCF54\uB4DC\uB294 \uCC3E\uC558\uC9C0\uB9CC <b>\uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC5C6\uC5B4</b> \uC2E4\uC81C \uB3D9\uC791\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uADFC\uAC70\uAC00 \uC788\uB2E4\uACE0 \uC548\uC2EC\uD558\uC9C0 \uB9C8\uC138\uC694.",
      "Related code was found, but <b>no test is linked</b>, so the actual behavior is not confirmed. Finding the code is not the same as verifying it."
    );
  }
  const broad = sets.some((x) => x.perReq[id].evidence.unit?.kind === "function");
  return L(
    `\uBAA8\uB4E0 \uACB0\uACFC\uC5D0\uC11C \uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC558\uACE0 \uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uD1B5\uACFC\uD588\uC2B5\uB2C8\uB2E4.${broad ? " \uB2E4\uB9CC \uADFC\uAC70\uAC00 <b>\uD568\uC218 \uC804\uCCB4 \uB2E8\uC704</b>\uB77C \uC138\uBD80 \uC870\uAC74\uC740 \uC0AC\uB78C\uC774 \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4." : ""}`,
    `Implementation evidence was found in every result and the linked tests pass.${broad ? " The evidence is a <b>whole function</b>, though, so check the exact condition yourself." : ""}`
  );
}
function matrixCell(set, id) {
  const rr = set.perReq[id];
  const e = rr.evidence;
  const u = e.unit;
  const loc = u ? ` <code>${esc(u.file.split("/").pop())}:${u.startLine}</code>${u.kind === "function" ? `<em>${L("\uD568\uC218 \uC804\uCCB4", "whole function")}</em>` : ""}` : "";
  const b = e.boundary ? ` <span class="bd ${e.boundary.ok ? "ok" : e.boundary.ok === null ? "unk" : "diff"}">${esc(e.boundary.attempts !== null ? L(`${e.boundary.attempts}\uD68C\uC9F8 \uB3D9\uC791`, `acts on attempt ${e.boundary.attempts}`) : boundaryShort(e.boundary))}</span>` : "";
  return `<div class="mc"><div><span class="mk ${evCls(e.status)}"></span>${L(`\uADFC\uAC70 ${e.status}`, `evidence ${wEvidence(e.status)}`)}${loc}</div><div><span class="mk ${tsCls(rr.testStatus)}"></span>${L(`\uAC80\uC0AC ${rr.testStatus}`, `tests ${wTest(rr.testStatus)}`)}${b}</div></div>`;
}
function overview(report) {
  const c = counts(report);
  const two = report.sets.length === 2;
  const head = `<tr><th>${L("\uC694\uAD6C\uC0AC\uD56D", "Requirement")}</th>${report.sets.map((s) => `<th>${idDot(s.key)}${s.label}<small>${esc(s.ref)} \xB7 ${s.sha}</small></th>`).join("")}${two ? "<th>A\xB7B</th>" : ""}<th>${L("\uC0C1\uD0DC", "Status")}</th><th>${L("\uC0AC\uB78C\uC758 \uD310\uB2E8", "Your decision")}</th></tr>`;
  const rows = report.summaries.map((s) => `<tr class="row" data-req="${s.req.id}"><td class="rq"><button class="req-select" type="button"><b>${s.req.id}</b>${esc(s.req.text)}</button></td>${report.sets.map((set) => `<td>${matrixCell(set, s.req.id)}</td>`).join("")}${two ? `<td><span class="rel ${s.relation.kind === "\uC77C\uCE58" ? "same" : "diffs"}">${wRelation(s.relation.kind)}</span></td>` : ""}<td>${pill(s.overall)}</td><td class="jc" data-jcell="${s.req.id}">${wJudge("\uBBF8\uAC80\uD1A0")}</td></tr>`).join("");
  const unc = [];
  for (const s of report.summaries) {
    const miss = report.sets.filter((x) => x.perReq[s.req.id].testStatus === "\uBBF8\uC2E4\uD589" || x.perReq[s.req.id].evidence.status === "\uBBF8\uBC1C\uACAC");
    if (miss.length) unc.push(`<span><b>${s.req.id}</b> ${miss.map((x) => `${x.key} ${x.perReq[s.req.id].evidence.status === "\uBBF8\uBC1C\uACAC" ? L("\uADFC\uAC70 \uC5C6\uC74C", "no evidence") : L("\uAC80\uC0AC \uBBF8\uC2E4\uD589", "no test run")}`).join(" \xB7 ")}</span>`);
  }
  for (const set of report.sets) for (const d of set.dyn) unc.push(`<span><b>${set.key}</b> ${L("\uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uD638\uCD9C", "unresolved call")} <code>${esc(d.file.split("/").pop())}:${d.line}</code> <code>${esc(d.text)}</code></span>`);
  return `<section class="ov"><div class="ovh"><h2>${L("\uC694\uAD6C\uC0AC\uD56D\uBCC4 \uAC80\uC99D \uC0C1\uD0DC", "Verification status by requirement")}</h2><div class="cnt"><span class="ok">${wOverall("\uD655\uC778\uB428")} <b>${c.\uD655\uC778\uB428}</b></span><span class="diff">${wOverall("\uB2E4\uB984")} <b>${c.\uB2E4\uB984}</b></span><span class="fail">${wOverall("\uC2E4\uD328")} <b>${c.\uC2E4\uD328}</b></span><span class="unk">${wOverall("\uBBF8\uD655\uC778")} <b>${c.\uBBF8\uD655\uC778}</b></span></div><div class="hint">${L("\uC694\uAD6C\uC0AC\uD56D\uC744 \uC120\uD0DD\uD574 \uADFC\uAC70 \uBCF4\uAE30", "Select a requirement to see its evidence")}</div></div>
<table class="mx"><thead>${head}</thead><tbody>${rows}</tbody></table>
<div class="unc"><b>${L("\uAC80\uC0AC \uBBF8\uC2E4\uD589 \xB7 \uADFC\uAC70 \uC5C6\uC74C", "No test run \xB7 no evidence")}</b>${unc.join("") || `<span>${L("\uC5C6\uC74C", "none")}</span>`}</div></section>`;
}
function codePane(set, ev, mark) {
  const head = `<div class="ph">${idDot(set.key)}<b>${set.label}</b><span class="sub">${esc(set.ref)} \xB7 ${set.sha}</span></div>`;
  const u = ev.unit;
  if (!u) return `<div class="pane">${head}<div class="empty">${L("\uC774 \uACB0\uACFC\uC5D0\uC11C \uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", "No implementation evidence was found in this result.")}</div></div>`;
  const src = (set.files[u.file] ?? "").split("\n");
  const long = u.kind === "function" && u.endLine - u.startLine > 12;
  const from = Math.max(1, u.startLine - (u.kind === "condition" ? 3 : 0));
  const to = long ? u.startLine + 11 : Math.min(src.length, u.endLine + (u.kind === "condition" ? 3 : 0));
  const rows = [];
  for (let n = from; n <= Math.min(to, from + 30); n++) {
    const hit = u.kind === "condition" && n >= u.startLine && n <= u.endLine;
    const html = hit && n === u.startLine ? hlMark(src[n - 1] ?? "", u.cond?.expr, mark ? u.cond?.op : void 0) : hl(src[n - 1] ?? "");
    rows.push(`<div class="cl${hit ? " hit" : ""}"><span class="ln">${n}</span><span class="tx">${html}</span></div>`);
  }
  if (long) rows.push(`<div class="cl"><span class="ln"></span><span class="tx c">${L("\u2026 \uD568\uC218\uC758 \uB098\uBA38\uC9C0\uB294 \uC0DD\uB7B5 (\uADFC\uAC70\uAC00 \uD568\uC218 \uC804\uCCB4 \uB2E8\uC704)", "\u2026 rest of the function omitted (the evidence is the whole function)")}</span></div>`);
  return `<div class="pane">${head}<div class="loc">${esc(u.file)}:${u.startLine}${u.kind === "condition" && u.endLine > u.startLine ? "\u2013" + u.endLine : ""}</div><div class="code">${rows.join("")}</div></div>`;
}
function timeline(report, id) {
  const rows = report.sets.map((s) => ({ set: s, b: s.perReq[id].evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return "";
  const req = rows[0].b.required;
  let chk = null;
  let chkName = "";
  for (const s of report.sets)
    for (const t of s.perReq[id].tests) {
      const m = t.name.match(/\b(\d+)(?:st|nd|rd|th)?\b/);
      if (m && chk === null) {
        chk = Number(m[1]);
        chkName = t.name;
      }
    }
  const data = attemptDots(report, id);
  const plot = data ? attemptChart(data.max, data.required, data.rows.map((r) => ({
    label: report.sets.length > 1 ? r.key : L("\uCF54\uB4DC", "Code"),
    at: r.at
  })), getLang()) : "";
  const N = Math.max(7, req + 2, ...rows.map((r) => r.b.attempts + 1));
  const lock = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0B1423" stroke-width="2.6" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2" fill="#0B1423" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  let head = '<div class="tr"><div class="tl"></div><div class="tcs">';
  for (let n = 1; n <= N; n++) head += `<span class="th${n === req ? " on" : ""}${n === chk ? " chk" : ""}">${L(`${n}\uD68C`, `${n}`)}${n === chk ? `<i>${L("\uAC80\uC0AC", "test")}</i>` : ""}</span>`;
  head += "</div></div>";
  const reqRow = (() => {
    let cells = "";
    for (let n = 1; n <= N; n++) cells += `<span class="tc${n >= req ? " lk req" : ""}">${n >= req ? lock : n}</span>`;
    return `<div class="tr"><div class="tl"><b>${L("\uC694\uAD6C\uC0AC\uD56D", "Requirement")}</b><small>${L(`${req}\uBC88\uC9F8\uC5D0\uC11C \uC7A0\uAE08`, `locks on attempt ${req}`)}</small></div><div class="tcs">${cells}</div></div>`;
  })();
  const resRows = rows.map((r) => {
    const at = r.b.attempts;
    const good = at === req;
    const ts3 = r.set.perReq[id].testStatus;
    let cells = "";
    for (let n = 1; n <= N; n++) {
      const locked = n >= at;
      const miss = !good && n === req && at > req;
      const mark = n === chk ? `<i class="tk ${ts3 === "\uD1B5\uACFC" ? "ok" : ts3 === "\uC2E4\uD328" ? "no" : "na"}">${ts3 === "\uD1B5\uACFC" ? "\u2713" : ts3 === "\uC2E4\uD328" ? "\u2717" : "?"}</i>` : "";
      cells += `<span class="tc${locked ? ` lk ${good ? "good" : "off"}` : ""}${miss ? " miss" : ""}">${miss ? "\xD7" : locked ? lock : n}${mark}</span>`;
    }
    return `<div class="tr"><div class="tl"><b>${idDot(r.set.key)}${r.set.label}</b><small>${esc(r.set.perReq[id].evidence.unit?.cond?.expr ?? "")}</small></div><div class="tcs">${cells}</div></div>`;
  }).join("");
  const before = rows.every((r) => r.b.before === true);
  const offSets = rows.filter((r) => r.set.perReq[id].testStatus === "\uD1B5\uACFC" && r.b.ok === false);
  const offNote = offSets.length ? L(
    ` ${offSets.map((r) => r.set.label).join("\xB7")}\uB294 \uACC4\uC0B0\uC73C\uB85C\uB294 ${offSets.map((r) => r.b.attempts).join("\xB7")}\uBC88\uC9F8\uC5D0 \uB3D9\uC791\uD558\uB294\uB370\uB3C4 \uAC80\uC0AC\uAC00 \uD1B5\uACFC\uD588\uC2B5\uB2C8\uB2E4. \uAC80\uC0AC\uAC00 \uC2E4\uC81C\uB85C \uBA87 \uBC88\uC9F8 \uC2DC\uB3C4\uB97C \uBCF4\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.`,
    ` By the computed condition, ${joinNames(offSets.map((r) => r.set.label))} acts on attempt ${offSets.map((r) => r.b.attempts).join(" / ")}, yet its test passes. Check which attempt the test actually looks at.`
  ) : "";
  const marks2 = report.sets.map((s) => `${s.key} ${wTest(s.perReq[id].testStatus)}`).join(" \xB7 ");
  const cap = chk !== null ? L(`\u300C${esc(chkName)}\u300D \uAC80\uC0AC\uB294 \uC774\uB984\uC73C\uB85C \uBCF4\uBA74 ${chk}\uBC88\uC9F8 \uC2DC\uB3C4 \uB4A4\uC758 \uC7A0\uAE08\uC744 \uD655\uC778\uD569\uB2C8\uB2E4 \u2014 ${marks2}.${offNote}`, `Going by its name, the test "${esc(chkName)}" checks the lock after attempt ${chk} \u2014 ${marks2}.${offNote}`) : L("\uC774 \uC870\uAC74\uC744 \uC9C1\uC811 \uD655\uC778\uD558\uB294 \uAC80\uC0AC\uAC00 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", "No test that checks this condition directly is linked.");
  const order = before ? L(" \uCE74\uC6B4\uD130\uB97C \uC62C\uB9B0 \uB4A4 \uBE44\uAD50\uD558\uB294 \uCF54\uB4DC\uB85C \uC77D\uC5C8\uC2B5\uB2C8\uB2E4.", " Read as code that increments the counter before comparing.") : L(" \uCE74\uC6B4\uD130 \uC99D\uAC00 \uC21C\uC11C\uB294 \uCF54\uB4DC\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.", " Check in the code whether the counter is incremented before the comparison.");
  return `<div class="card"><h4>${L("\uC2DC\uB3C4 \uD69F\uC218\uBCC4 \uC7A0\uAE08 \uC2DC\uC810", "When it locks, attempt by attempt")} <span class="mini">${L("\uC870\uAC74 \uAC12\uC5D0\uC11C \uACC4\uC0B0\uD55C \uC0AC\uC2E4", "computed from the condition")}</span></h4>${plot}<details class="comparison" ${plot ? "" : "open"}><summary>${L("\uC2DC\uB3C4\uBCC4 \uAC80\uC0AC\uC640 \uC7A0\uAE08 \uC0C1\uD0DC", "Test and lock state by attempt")}</summary><div class="tline">${head}${reqRow}${resRows}</div></details><div class="cap">${cap}${order}</div><div class="lg"><span><i class="sw" style="background:#4285E8"></i>${L("\uC694\uAD6C\uC0AC\uD56D", "requirement")}</span><span><i class="sw" style="background:var(--vl-ok)"></i>${L("\uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC740 \uC2DC\uC810", "same attempt as the requirement")}</span><span><i class="sw" style="background:var(--vl-diff)"></i>${L("\uB2E4\uB978 \uC2DC\uC810", "a different attempt")}</span><span><i class="sw miss"></i>${L("\uC7A0\uACA8\uC57C \uD558\uB294\uB370 \uC548 \uC7A0\uAE40", "should be locked, but is not")}</span></div></div>`;
}
function pickFlow(set, ev) {
  const u = ev.unit;
  if (!u) return null;
  let best = null;
  for (const a of set.analyses) {
    if (a.file !== u.file) continue;
    for (const f of a.flows) if (u.startLine >= f.startLine && u.startLine <= f.endLine && (!best || f.endLine - f.startLine < best.endLine - best.startLine)) best = f;
  }
  return best;
}
function flowCard(report, id) {
  const flows = report.sets.map((set) => ({ set, g: pickFlow(set, set.perReq[id].evidence) }));
  const avail = flows.filter((x) => x.g);
  if (!avail.length) return `<div class="card"><h4>${L("\uCF54\uB4DC \uD750\uB984 \uC9C0\uB3C4", "Code flow map")}</h4><div class="empty">${L("\uADFC\uAC70\uAC00 \uC788\uB294 \uD568\uC218\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", "No function with evidence was found.")}</div></div>`;
  const tabs = avail.length > 1 ? `<div class="ftabs">${avail.map((x, i) => `<button class="ftab${i === 0 ? " on" : ""}" data-set="${x.set.key}">${idDot(x.set.key)}${x.set.label}</button>`).join("")}</div>` : "";
  const boxes = avail.map((x, i) => {
    const other = avail.find((o) => o.set !== x.set && o.g.fn === x.g.fn);
    const onlyHere = other ? diffFlow(x.g, other.g) : void 0;
    const u = x.set.perReq[id].evidence.unit;
    const svg = renderFlowSvg(x.g, { hi: u.kind === "condition" ? { start: u.startLine, end: u.endLine } : null, onlyHere, onlyKey: x.set.key, idColor: ID[x.set.key] });
    return `<div class="flowbox" data-set="${x.set.key}"${i === 0 ? "" : " hidden"}><div class="fnn">${esc(x.g.fn)}() \xB7 ${esc(x.g.file)}</div>${svg}</div>`;
  }).join("");
  return `<div class="card"><h4>${L("\uCF54\uB4DC \uD750\uB984 \uC9C0\uB3C4", "Code flow map")} <span class="mini">${L("\uC2DC\uC791 \u2192 \uBCC0\uACBD\uB41C \uC870\uAC74 \uACBD\uB85C\uB97C \uAC15\uC870", "path from the start to the changed condition is highlighted")}</span></h4>${tabs}${boxes}<div class="lg"><span><i class="sw" style="background:var(--vl-diff)"></i>${L("\uC774 \uC694\uAD6C\uC0AC\uD56D\uC758 \uC870\uAC74", "this requirement's condition")}</span><span><i class="sw line"></i>${L("\uC2DC\uC791\uBD80\uD130 \uC870\uAC74\uAE4C\uC9C0\uC758 \uACBD\uB85C", "path from the start to the condition")}</span><span><i class="sw dash"></i>${L("\uB2E4\uB978 \uACB0\uACFC\uC5D0\uB294 \uC5C6\uB294 \uBB38\uC7A5\uC774 \uB4E0 \uB2E8\uACC4", "step with statements the other result lacks")}</span><span><i class="sw dim"></i>${L("\uD750\uB9B0 \uB2E8\uACC4\uB294 \uC774 \uC694\uAD6C\uC0AC\uD56D\uACFC \uBB34\uAD00", "dimmed steps are unrelated to this requirement")}</span></div></div>`;
}
function evidenceFocus(report, s) {
  const id = s.req.id;
  const lanes = report.sets.map((set, index) => {
    const rr = set.perReq[id];
    const steps2 = chainSteps(report, id, getLang(), index);
    const test = steps2.find((step) => step.kind === "test");
    const boundary = rr.evidence.boundary;
    const label = report.sets.length > 1 ? L(`\uCF54\uB4DC \xB7 ${set.label}`, `Code \xB7 ${set.label}`) : L("\uCF54\uB4DC \uB3D9\uC791", "Code acts");
    const comparison = boundary?.attempts != null ? attemptComparison(boundary.required, boundary.attempts, label, test, getLang(), rr.testStatus) : report.sets.length > 1 ? `<b class="lane-label">${esc(label)}</b>` : "";
    const priority = rr.testStatus === "\uC2E4\uD328" || boundary?.ok === false ? 0 : test?.changed ? 1 : 2;
    return { label: set.label, priority, html: comparison + evidenceChain(steps2, s.overall) };
  }).sort((a, b) => a.priority - b.priority);
  const [primary, ...others] = lanes;
  return `<section class="det focus-card focus-${cls2(s.overall)}" data-req="${id}" hidden>
<header class="focus-heading">${pill(s.overall)}<span class="rid">${id}</span><h2>${esc(s.req.text)}</h2></header>
${primary?.html ?? ""}
${others.map((lane) => `<details class="comparison"><summary>${esc(lane.label)} \xB7 ${L("\uADFC\uAC70 \uC0AC\uC2AC", "Evidence chain")}</summary>${lane.html}</details>`).join("")}
<details class="comparison"><summary>${L("\uADFC\uAC70 \uC0C1\uC138\uC640 \uC0AC\uB78C\uC758 \uD310\uB2E8", "Detailed evidence and your decision")}</summary>${renderChain(report, s)}</details>
<div class="focus-next">${headline(report, s)} <span class="next">${L("\uB2E4\uC74C \uD589\uB3D9", "Next step")} \xB7 ${esc(nextAction(s, report))}</span></div>
</section>`;
}
function detail(report, s) {
  const id = s.req.id;
  const mark = s.relation.kind === "\uBD88\uC77C\uCE58" || report.sets.some((x) => x.perReq[id].evidence.boundary?.ok === false);
  const panes = report.sets.map((set) => codePane(set, set.perReq[id].evidence, mark)).join("");
  const tests = report.sets.map((set) => {
    const rr = set.perReq[id];
    if (!rr.tests.length) return `<tr><td>${idDot(set.key)}${set.label}</td><td colspan="2" class="mute">${L("\uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4 \u2192 \uBBF8\uC2E4\uD589", "No linked test \u2192 not run")}</td></tr>`;
    return rr.tests.map((t) => `<tr><td>${idDot(set.key)}${set.label}</td><td>${esc(t.name)}</td><td><span class="pill ${t.status === "pass" ? "ok" : t.status === "fail" ? "fail" : "unk"}">${t.status === "pass" ? L("\uD1B5\uACFC", "passed") : t.status === "fail" ? L("\uC2E4\uD328", "failed") : L("\uAC74\uB108\uB700", "skipped")}</span>${t.message ? `<div class="msg">${esc(t.message)}</div>` : ""}</td></tr>`).join("");
  }).join("");
  const why = report.sets.map((set, i) => {
    const e = set.perReq[id].evidence;
    return `<div class="ev"><span class="eid">E${i + 1}</span><span>${idDot(set.key)}<b>${set.label}</b> ${e.unit ? `<code>${esc(e.unit.file)}:${e.unit.startLine}</code> \xB7 ${e.unit.kind === "function" ? L("\uD568\uC218 \uC804\uCCB4 \uB2E8\uC704", "whole function") : L("\uC870\uAC74 \uB2E8\uC704", "single condition")}` : L("\uADFC\uAC70 \uC5C6\uC74C", "no evidence")}<br><small>${esc(e.why.join(" \xB7 ") || L("\uC77C\uCE58\uD558\uB294 \uB2E8\uC5B4\xB7\uC22B\uC790 \uC5C6\uC74C", "no matching words or numbers"))} \xB7 ${L("\uC810\uC218", "score")} ${e.score}</small></span></div>`;
  }).join("");
  const opts = ["\uBBF8\uAC80\uD1A0", "\uC0AC\uC6A9", "\uC218\uC815", "\uCD94\uAC00 \uAC80\uC99D", "\uBCF4\uB958"].map((v) => `<option value="${v}">${wJudge(v)}</option>`).join("");
  const judge2 = `<div class="card judge" data-req="${id}"><h4>${L("\uC0AC\uB78C\uC758 \uD310\uB2E8", "Your decision")} <span class="mini">${L("\uADFC\uAC70\uB97C \uBCF4\uACE0 \uC9C1\uC811 \uC815\uD569\uB2C8\uB2E4", "you decide from the evidence")}</span></h4><div class="jrow"><select>${opts}</select></div><textarea rows="3" placeholder="${L("\uC774\uC720\uB098 \uB0A8\uC740 \uD655\uC778 \uC0AC\uD56D", "Reason, or what is left to check")}"></textarea></div>`;
  return `<section class="det" data-req="${id}" hidden>
<div class="dh"><span class="rid">${id}</span><h2>${L("\uCF54\uB4DC\uC640 \uAC80\uC0AC", "Code and tests")}</h2></div>
<div class="g2"><div>
<div class="card"><h4>${L("\uCF54\uB4DC \uBE44\uAD50", "Code comparison")} <span class="mini">${mark ? L("\uB2E4\uB978 \uBD80\uBD84\uC744 \uD45C\uC2DC", "differences are marked") : L("\uADFC\uAC70\uAC00 \uB41C \uCF54\uB4DC", "the code used as evidence")}</span></h4><div class="panes">${panes}</div></div>
<div class="card"><h4>${L("\uAC80\uC0AC \uACB0\uACFC", "Test results")} <span class="mini">${L("\uC2E4\uD589\uB41C \uAC80\uC0AC \uBCF4\uACE0\uC11C(JUnit)\uC5D0\uC11C \uC77D\uC74C", "read from the executed test report (JUnit)")}</span></h4><table class="tt"><tbody>${tests}</tbody></table></div>
<div class="card"><h4>${L("\uC5F0\uACB0 \uADFC\uAC70", "Why this code")} <span class="mini">${L("\uC65C \uC774 \uCF54\uB4DC\uB97C \uADFC\uAC70\uB85C \uACE8\uB790\uB294\uAC00", "why this code was picked as evidence")}</span></h4>${why}</div>
${judge2}
</div><div>
${timeline(report, id)}${flowCard(report, id)}
</div></div></section>`;
}
function mdToHtml(md) {
  const out = [];
  let list2 = false;
  const close = () => {
    if (list2) {
      out.push("</ul>");
      list2 = false;
    }
  };
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      close();
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith("# ")) {
      close();
      out.push(`<h2>${inline(line.slice(2))}</h2>`);
    } else if (line.startsWith("- ")) {
      if (!list2) {
        out.push("<ul>");
        list2 = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.startsWith("> ")) {
      close();
      out.push(`<p class="q">${inline(line.slice(2))}</p>`);
    } else if (!line.trim()) close();
    else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}
function renderHtml(report, summaryMd) {
  const id = String(Math.abs([...report.generatedAt + report.sets.map((s) => s.sha).join("")].reduce((h, ch) => h * 31 + ch.charCodeAt(0) | 0, 7)));
  const first = report.summaries.find((s) => s.overall === "\uB2E4\uB984" || s.overall === "\uC2E4\uD328") ?? report.summaries.find((s) => s.overall === "\uBBF8\uD655\uC778") ?? report.summaries[0];
  const meta = { generatedAt: report.generatedAt, base: report.base, results: report.sets.map((s) => ({ label: s.label, ref: s.ref, sha: s.sha })) };
  const t = { jl: JUDGE_LABELS(), text: L("\uAE00", "text"), viz: L("\uC2DC\uAC01\uD654", "visual"), stop: L("\uC885\uB8CC", "Stop"), start: L("\uC2DC\uC791", "Start"), rec: L("\uAE30\uB85D", "recorded") };
  const data = { id, first: first?.req.id, meta, t, reqs: report.summaries.map((s) => ({ id: s.req.id, text: s.req.text, status: s.overall })) };
  const mark = '<svg width="24" height="24" viewBox="0 0 64 64"><circle cx="27" cy="27" r="19" fill="none" stroke="#fff" stroke-width="6"/><path d="M18 27.5 L24.5 34 L36.5 20" fill="none" stroke="#4285E8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M41.5 41.5 L56 56" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/></svg>';
  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${L("VerifyLens \uAC80\uC99D \uB9AC\uD3EC\uD2B8", "VerifyLens verification report")}</title><style>${CSS2}
:root{${palette(dark)}}${evidenceCSS}
.wrap{max-width:1480px}.focus-card{--edge:var(--vl-miss);border:1px solid #2a3950;border-inline-start:4px solid var(--edge);border-radius:14px;background:#101d30;padding:clamp(14px,2vw,27px);margin:0 0 18px;scroll-margin-top:64px}
.focus-diff{--edge:var(--vl-diff)}.focus-ok{--edge:var(--vl-ok)}.focus-fail{--edge:var(--vl-fail)}
.focus-heading{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.focus-heading h2{font-size:clamp(18px,2vw,27px);line-height:1.28;letter-spacing:-.02em;color:#f3f6fa}
.focus-card .vl-chain{margin-block:12px 16px}.focus-card .vl-step{font-size:14px;line-height:1.45}
.focus-card .vl-compare{margin-top:14px}.focus-next{border-top:1px solid #314158;padding-top:10px;margin-top:12px;color:#d4dfed;line-height:1.65}
.req-select{background:none;border:0;padding:0;text-align:left;color:inherit;font:inherit;cursor:pointer}
button:focus-visible,summary:focus-visible{outline:2px solid #92bfff;outline-offset:3px}
.wrap .ovh{flex-wrap:wrap}.ov .mx tr.on .rq{color:white}.card h4{font-size:14px;color:#dbe6f4}.card .mini,.lg,.flowbox .fnn,.pane .loc,.pane .ph .sub{color:#a3b4cc}
.card:has(.flowbox) .ftabs,.card:has(.pane) .panes{margin-top:12px}
.comparison svg.chain{min-width:900px}.focus-card .comparison{border-top:1px solid #28374d;padding-top:8px}
@media(max-width:700px){.focus-card{scroll-margin-top:110px}.focus-card .vl-compare{margin-top:8px}.focus-heading h2{flex-basis:100%}.focus-card .vl-step{font-size:13px}.focus-next{font-size:12px}}

body{font-variant-ligatures:none}.comparison{margin:8px 0;overflow:auto}.comparison summary{cursor:pointer;color:#b1c3df}
@media(max-width:700px){
.top,.ovh,.dh,.cnt{flex-wrap:wrap}.top{height:auto;padding:6px 12px;gap:5px 12px}.top .meta{margin-right:auto}
.wrap{padding:10px}.ov{overflow-x:auto}.g2,.panes{grid-template-columns:minmax(0,1fr)}.g2>div{min-width:0}
.bar{overflow-x:auto;white-space:nowrap}.card h4{flex-wrap:wrap}.mini{margin-left:0}.text{overflow-wrap:anywhere}
.comparison svg.chain{min-width:850px}
}
.lane-label{display:block;color:#aab8ca;margin-top:8px}.lane-label+.vl-chain{margin-top:4px}
${["ok", "diff", "fail", "miss"].map((k) => `.pill.${k === "miss" ? "unk" : k}{color:var(--vl-${k});background:var(--vl-${k}-bg)}`).join("")}
</style></head>
<body data-view="viz">
<div class="top"><div class="logo">${mark}<div>Verify<span>Lens</span></div></div><div class="meta">${L("\uAC80\uC99D \uB9AC\uD3EC\uD2B8 \xB7 \uAE30\uC900", "Verification report \xB7 base")} <code>${esc(report.base)}</code></div><span class="sp"></span><span class="badge g">${L("\uB85C\uCEEC\uC5D0\uC11C \uC0DD\uC131 \xB7 \uB124\uD2B8\uC6CC\uD06C \uC0AC\uC6A9 \uC5C6\uC74C \xB7 AI \uCD94\uC815 \uC5C6\uC74C", "Generated locally \xB7 no network \xB7 no AI inference")}</span><div class="vt"><button class="vtab on" data-view="viz">${L("\uC2DC\uAC01\uD654", "Visual")}</button><button class="vtab" data-view="text">${L("\uAE00 \uC694\uC57D", "Text summary")}</button></div></div>
<div class="wrap">${report.summaries.map((s) => evidenceFocus(report, s)).join("")}${overview(report)}${report.summaries.map((s) => detail(report, s)).join("")}</div>
<div class="text"><div class="doc">${mdToHtml(summaryMd)}</div></div>
<div class="bar"><b>${L("\uACFC\uC81C \uC2DC\uAC04", "Task timer")}</b><select id="task"><option>T1</option><option>T2</option><option>T3</option><option>${L("\uC790\uC720", "Free")}</option></select><button id="tstart">${L("\uC2DC\uC791", "Start")}</button><span id="tlabel">0:00</span><span id="tlog" style="opacity:.85"></span><span class="sp"></span><span>${L("\uC0AC\uB78C\uC758 \uD310\uB2E8", "Decisions")} <b id="judged">0</b></span><button id="export">${L("\uD310\uB2E8\xB7\uC2DC\uAC04 \uB0B4\uBCF4\uB0B4\uAE30", "Export decisions and times")}</button></div>
<script type="application/json" id="vl-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>${SCRIPT2}</script>
</body></html>`;
}
function writeOutputs(report, out, prFile, concept = false) {
  const md = renderSummaryMd(report);
  const files = [];
  const put = (name, text) => {
    writeFileSync(join3(out, name), text, "utf8");
    files.push(join3(out, name));
  };
  put("report.html", renderHtml(report, md));
  put("summary.md", md);
  if (concept) put("concept.html", renderConcept(report));
  if (prFile) put("requirements.draft.md", extractFromPrBody(readFileSync2(prFile, "utf8")));
  return files;
}
var cls2, pill, evCls, tsCls, idDot, CSS2, SCRIPT2;
var init_output = __esm({
  "src/output.ts"() {
    init_verdictStyle();
    init_evidenceSteps();
    init_evidenceView();
    init_flowsvg();
    init_chain();
    init_summary();
    init_requirements();
    init_concept();
    init_view();
    init_i18n();
    init_numeric();
    cls2 = (o) => o === "\uD655\uC778\uB428" ? "ok" : o === "\uB2E4\uB984" ? "diff" : o === "\uC2E4\uD328" ? "fail" : "unk";
    pill = (o) => `<span class="pill ${cls2(o)}">${marks[o]} ${wOverall(o)}</span>`;
    evCls = (s) => s === "\uBC1C\uACAC" ? "ok" : s === "\uC77C\uBD80 \uBC1C\uACAC" ? "diff" : "unk";
    tsCls = (s) => s === "\uD1B5\uACFC" ? "ok" : s === "\uC2E4\uD328" ? "fail" : "unk";
    idDot = (k) => `<i class="idd" style="background:${ID[k]}"></i>`;
    CSS2 = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A1220;color:#C9D5E8;font:13px/1.55 'Pretendard Variable','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;padding-bottom:52px}
code,.cl,.loc{font-family:'Cascadia Mono',Consolas,monospace}
code{font-size:12px;color:#BFD3F2;background:#14223A;padding:0 5px;border-radius:4px}
.top{position:sticky;top:0;z-index:5;height:54px;display:flex;align-items:center;gap:12px;padding:0 22px;background:#07101C;border-bottom:1px solid #1C2B46}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px;color:#fff;letter-spacing:-.02em}.logo span{color:#8DB5F4}
.top .meta{color:#7D8FAB;font-size:12px}.sp{flex:1}
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:12px;border:1px solid #2A4372;color:#9DB7E0;font-size:11.5px;font-weight:700;white-space:nowrap}
.badge.g{border-color:rgba(52,211,153,.5);color:var(--vl-ok)}
.vt{display:flex;border:1px solid #27406B;border-radius:8px;overflow:hidden}.vt button{background:transparent;border:0;color:#9DAEC8;padding:5px 14px;font:inherit;cursor:pointer}.vt button.on{background:#16294A;color:#fff;font-weight:700}
.wrap{max-width:1560px;margin:0 auto;padding:18px 22px 24px}
.idd{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}
.pill{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:11px;font-size:11.5px;font-weight:800;white-space:nowrap}
.pill.ok{background:rgba(52,211,153,.15);color:var(--vl-ok)}.pill.diff{background:rgba(251,191,36,.16);color:var(--vl-diff)}.pill.fail{background:rgba(248,113,113,.16);color:var(--vl-fail)}.pill.unk{background:rgba(148,163,184,.16);color:var(--vl-miss)}
.ov{border:1px solid #1C2B46;border-radius:12px;background:#0C1628;padding:14px 16px 12px;margin-bottom:18px}
.ovh{display:flex;align-items:center;gap:18px;margin-bottom:10px}.ovh h2{font-size:15px;color:#fff}
.cnt{display:flex;gap:14px;font-size:12.5px}.cnt b{font-size:15px;margin-left:3px}.cnt .ok b{color:var(--vl-ok)}.cnt .diff b{color:var(--vl-diff)}.cnt .fail b{color:var(--vl-fail)}.cnt .unk b{color:var(--vl-miss)}
.hint{margin-left:auto;color:#6B7D9A;font-size:12px}
table.mx{width:100%;border-collapse:separate;border-spacing:0}
.mx th{text-align:left;font-size:11.5px;color:#7D8FAB;font-weight:700;padding:8px 12px;border-bottom:1px solid #1C2B46}.mx th small{display:block;font-weight:500;color:#5E7091;font-family:'Cascadia Mono',Consolas,monospace;font-size:10.5px}
.mx td{padding:10px 12px;border-bottom:1px solid #14223A;vertical-align:middle}
.mx tr.row{cursor:pointer}.mx tr.row:hover td{background:#0F1D35}.mx tr.row.on td{background:#11223F}.mx tr.row.on td:first-child{box-shadow:inset 3px 0 #4285E8}
.mx .rq{color:#E6EDF8;font-weight:600;max-width:340px}.mx .rq b{color:#8DB5F4;margin-right:8px}
.mc{display:flex;flex-direction:column;gap:3px;font-size:12px}.mc em{font-style:normal;color:var(--vl-diff);font-size:10.5px;margin-left:6px;border:1px solid rgba(251,191,36,.45);border-radius:8px;padding:0 6px}
.mk{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.mk.ok{background:var(--vl-ok)}.mk.diff{background:var(--vl-diff)}.mk.fail{background:var(--vl-fail)}.mk.unk{background:#64748B}
.bd{font-size:11px;font-weight:700;margin-left:6px}.bd.ok{color:var(--vl-ok)}.bd.diff{color:var(--vl-diff)}.bd.unk{color:var(--vl-miss)}
.rel{font-size:12px;font-weight:700}.rel.same{color:var(--vl-ok)}.rel.diffs{color:var(--vl-diff)}
.jc{color:#7D8FAB;font-size:12px}.jc.done{color:#E6EDF8;font-weight:700}
.unc{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:12px;color:#AEBBD0}.unc>b{color:#7D8FAB}
.det{margin-bottom:18px}
.dh{display:flex;align-items:center;gap:12px;margin:4px 0 8px}.dh h2{font-size:19px;color:#fff;letter-spacing:-.01em}.rid{font-weight:800;color:#8DB5F4;font-size:17px}
.lead{font-size:14px;line-height:1.75;color:#E6EDF8;background:#0E1A2E;border:1px solid #1C2B46;border-left:4px solid #4285E8;border-radius:10px;padding:11px 16px;margin-bottom:14px}
.lead code{font-size:12.5px}.next{display:block;color:#9DB7E0;font-size:12.5px;margin-top:3px}
.card{border:1px solid #1C2B46;border-radius:12px;background:#0C1628;padding:13px 15px;margin-bottom:14px}
.card h4{font-size:11.5px;letter-spacing:.04em;color:#8A9BB8;font-weight:800;margin-bottom:10px;display:flex;gap:8px;align-items:center}.mini{margin-left:auto;font-weight:500;letter-spacing:0;color:#5E7091}
svg.chain{display:block}.ct{font-size:11px;font-weight:700;fill:#8A9BB8}.cl2{font-size:13px;fill:#EAF0F8;font-weight:600}.cm{font-size:13px;fill:#EAF0F8;font-weight:700;font-family:'Cascadia Mono',Consolas,monospace}.cs{font-size:11px;fill:#8A9BB8}.cb{font-size:11px;font-weight:800;fill:#07101C}.cp{font-size:11px;font-weight:800}.ck{font-size:11.5px;fill:#9DB7E0;font-family:'Cascadia Mono',Consolas,monospace}
.g2{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:16px}
@media (max-width:1280px){.g2{grid-template-columns:1fr}.hint{display:none}}
.panes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.pane{border:1px solid #1C2B46;border-radius:10px;background:#0A1424;overflow:hidden}
.ph{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#0F1B30;border-bottom:1px solid #1C2B46;font-size:12px;color:#E6EDF8}.ph .sub{margin-left:auto;color:#5E7091;font-family:'Cascadia Mono',Consolas,monospace;font-size:10.5px}
.loc{padding:6px 12px 2px;color:#5E7091;font-size:11px}
.code{padding:4px 0 8px;overflow:auto}
.cl{display:flex;min-height:21px;line-height:21px;font-size:12px}.cl .ln{width:40px;flex:none;text-align:right;padding-right:12px;color:#3F5070}.cl .tx{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:10px;padding-left:2.2em;text-indent:-2.2em}.cl.hit{background:rgba(251,191,36,.10);box-shadow:inset 3px 0 var(--vl-diff)}.cl.hit .ln{color:#E6EDF8}
mark.xm{background:rgba(251,191,36,.18);color:inherit;border-radius:4px;outline:1px solid rgba(251,191,36,.55);padding:1px 2px}
b.op{background:var(--vl-diff);color:#1A1203;border-radius:3px;padding:0 3px;margin:0 1px}
.k{color:#C792EA}.s{color:#9ED8A6}.n{color:#F2A07B}.f{color:#82AAFF}.ty{color:#7FDBCA}.c{color:#5C6F8F;font-style:italic}.p{color:#9DB7E0}.pu{color:#7F93B8}
.empty{padding:16px 14px;color:#7D8FAB}
table.tt{width:100%;border-collapse:collapse;font-size:12.5px}.tt td{padding:8px 8px;border-bottom:1px solid #14223A;vertical-align:top}.mute{color:#7D8FAB}.msg{margin-top:4px;color:var(--vl-fail);font-size:11.5px}
.ev{display:flex;gap:10px;margin-bottom:9px;font-size:12.5px}.eid{flex:none;width:26px;height:19px;border-radius:5px;background:#16294A;color:#8DB5F4;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}.ev small{color:#7D8FAB}
.tline .tr{display:flex;align-items:center;gap:10px;margin-bottom:8px}.tl{width:118px;flex:none}.tl b{font-size:12.5px;color:#E6EDF8;display:block;white-space:nowrap}.tl small{display:block;color:#6B7D9A;font-size:10.5px;font-family:'Cascadia Mono',Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcs{display:flex;gap:7px}.tc{position:relative;width:30px;height:30px;border-radius:50%;border:2px solid #2A3A58;color:#6B7D9A;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.tc.lk.req{background:#4285E8;border-color:#4285E8}.tc.lk.good{background:var(--vl-ok);border-color:var(--vl-ok)}.tc.lk.off{background:var(--vl-diff);border-color:var(--vl-diff)}.tc.miss{border-color:var(--vl-fail);color:var(--vl-fail);background:rgba(248,113,113,.12);font-size:14px}
.tk{position:absolute;right:-6px;top:-7px;width:16px;height:16px;border-radius:50%;font-style:normal;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #0C1628}.tk.ok{background:var(--vl-ok);color:#062016}.tk.no{background:var(--vl-fail);color:#2A0707}.tk.na{background:#64748B;color:#0B1423}
.th{position:relative;width:30px;text-align:center;font-size:10.5px;color:#6B7D9A}.th.on{color:#8DB5F4;font-weight:800}.th i{position:absolute;left:50%;transform:translateX(-50%);top:-15px;font-style:normal;font-size:9.5px;color:#0B1423;background:#9DB7E0;border-radius:6px;padding:0 4px;white-space:nowrap}
.tline{padding-top:12px}.cap{margin-top:6px;color:#AEBBD0;font-size:12px;line-height:1.6}
.lg{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:11px;color:#7D8FAB}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}.sw.miss{border:2px solid var(--vl-fail);border-radius:50%}.sw.line{height:3px;width:14px;background:#8DB5F4;vertical-align:2px}.sw.dash{border:1.5px dashed #C084FC;background:transparent}.sw.dim{background:#3E5784;opacity:.45}
.ftabs{display:flex;gap:6px;margin-bottom:8px}.ftab{background:#10213D;border:1px solid #27406B;color:#AEBBD0;border-radius:7px;padding:4px 12px;font:inherit;cursor:pointer}.ftab.on{background:#16294A;border-color:#4285E8;color:#fff;font-weight:700}
.flowbox{overflow:auto;padding-top:4px}.fnn{color:#6B7D9A;font-size:11px;margin-bottom:8px;font-family:'Cascadia Mono',Consolas,monospace}
svg.flow{display:block;max-width:none}.fl{fill:#E6EDF8;font-size:11.5px;font-weight:600;font-family:'Cascadia Mono',Consolas,monospace}.fl.hot{fill:var(--vl-diff)}.fn2{fill:#5E7091;font-size:9.5px}.fe{fill:#7D8FAB;font-size:10.5px}.fo{font-size:9.5px;font-weight:800}
.judge select,.judge textarea{width:100%;background:#0A1424;border:1px solid #27406B;border-radius:7px;color:#E6EDF8;font:inherit;padding:7px 9px;margin-bottom:8px}
.bar{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;gap:12px;padding:0 22px;background:#1F57B5;color:#E6EDF8;font-size:12.5px;z-index:6}.bar select,.bar button{background:#16294A;border:1px solid #3B63A6;color:#fff;border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer}
.text{display:none}.text .doc{max-width:900px;margin:0 auto;padding:26px 22px;color:#E6EDF8;font-size:14px;line-height:1.85}.text h2{font-size:18px;margin:0 0 14px}.text h3{font-size:15px;margin:22px 0 6px;color:#fff}.text ul{margin:0 0 4px 20px}.text .q{margin-top:22px;color:#9DAEC8}
body[data-view=text] .wrap{display:none}body[data-view=text] .text{display:block}
@media print{.bar,.vt{display:none}.top{position:static}.det[hidden]{display:block!important}}
`;
    SCRIPT2 = String.raw`
(function(){
var DATA=JSON.parse(document.getElementById('vl-data').textContent);
var KEY='vl:'+DATA.id,store={};
try{store=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){}
store.timings=store.timings||[];
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function fit(){
  $$('.det:not([hidden]) .flowbox:not([hidden])').forEach(function(box){
    var svg=$('svg',box); if(!svg)return;
    var vb=svg.getAttribute('viewBox').split(' '),w=+vb[2],h=+vb[3],avail=box.clientWidth||w;
    var k=Math.max(0.8,Math.min(1,avail/w));
    svg.style.width=Math.round(w*k)+'px'; svg.style.height=Math.round(h*k)+'px';
  });
}
function select(id,scroll){
  $$('.mx tr.row').forEach(function(el){el.classList.toggle('on',el.getAttribute('data-req')===id);});
  $$('.det').forEach(function(el){el.hidden=el.getAttribute('data-req')!==id;});
  fit();
  try{history.replaceState(null,'','#'+id);}catch(e){}
  if(scroll){var d=$('.det[data-req="'+id+'"]');if(d)d.scrollIntoView({behavior:'smooth',block:'start'});}
}
$$('.mx tr.row').forEach(function(el){el.addEventListener('click',function(){select(el.getAttribute('data-req'),true);});});
$$('.ftab').forEach(function(b){b.addEventListener('click',function(){
  var card=b.closest('.card'),k=b.getAttribute('data-set');
  $$('.ftab',card).forEach(function(x){x.classList.toggle('on',x===b);});
  $$('.flowbox',card).forEach(function(f){f.hidden=f.getAttribute('data-set')!==k;});
  fit();
});});
function show(id){
  var j=(store[id]||{}).judge||'미검토',jl=DATA.t.jl[j]||j;
  $$('[data-jcell="'+id+'"]').forEach(function(c){c.textContent=jl;c.classList.toggle('done',j!=='미검토');});
  $$('[data-judge-of="'+id+'"]').forEach(function(t){t.textContent=jl;});
}
function refresh(){
  var n=0;
  DATA.reqs.forEach(function(r){var j=(store[r.id]||{}).judge;if(j&&j!=='미검토')n++;show(r.id);});
  $('#judged').textContent=n+' / '+DATA.reqs.length;
}
$$('.judge').forEach(function(box){
  var id=box.getAttribute('data-req'),rec=store[id]||{},sel=$('select',box),note=$('textarea',box);
  if(rec.judge)sel.value=rec.judge; if(rec.note)note.value=rec.note;
  function upd(){store[id]=store[id]||{};store[id].judge=sel.value;store[id].note=note.value;save();refresh();}
  sel.addEventListener('change',upd); note.addEventListener('input',upd);
});
refresh();
function setView(v){document.body.setAttribute('data-view',v);$$('.vtab').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-view')===v);});if(v==='viz')fit();}
$$('.vtab').forEach(function(b){b.addEventListener('click',function(){setView(b.getAttribute('data-view'));});});
var running=null,tick=null,btn=$('#tstart'),label=$('#tlabel');
function fmt(s){return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
function log(){$('#tlog').textContent=store.timings.map(function(x){return x.task+'/'+(x.view==='text'?DATA.t.text:DATA.t.viz)+' '+fmt(x.seconds);}).join(' · ');}
btn.addEventListener('click',function(){
  if(!running){
    running={t:Date.now(),task:$('#task').value,view:document.body.getAttribute('data-view')};
    btn.textContent=DATA.t.stop; tick=setInterval(function(){label.textContent=fmt(Math.round((Date.now()-running.t)/1000));},500);
  }else{
    var sec=Math.round((Date.now()-running.t)/1000);
    store.timings.push({task:running.task,view:running.view,seconds:sec}); save();
    clearInterval(tick); running=null; btn.textContent=DATA.t.start; label.textContent=DATA.t.rec+' '+fmt(sec); log();
  }
});
log();
$('#export').addEventListener('click',function(){
  var out={report:DATA.meta,judgments:{},timings:store.timings,exportedAt:new Date().toISOString()};
  DATA.reqs.forEach(function(r){out.judgments[r.id]={status:r.status,judge:(store[r.id]||{}).judge||'미검토',note:(store[r.id]||{}).note||''};});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  a.download='verifylens-judgments.json'; a.click();
});
window.addEventListener('resize',fit);
var h=(location.hash||'').slice(1).split(':');
if(h[0]==='text'){setView('text');select(DATA.first,false);}
else{
  var rid=/^R\d+$/.test(h[0])&&$('.det[data-req="'+h[0]+'"]')?h[0]:DATA.first;
  select(rid,false);
  if(h[1]){var t=$('.det[data-req="'+rid+'"] .ftab[data-set="'+h[1]+'"]');if(t)t.click();}
}
})();
`;
  }
});

// vscode/src/model.ts
function changedTests(report, reqId) {
  return report.sets.flatMap((set) => (set.perReq[reqId]?.edits ?? []).filter(suspicious).map((e) => ({ set, e })));
}
function changedTestLine(e, lang = getLang()) {
  return `"${e.full}" (${e.file}:${e.line}) \u2014 ${editText(e, lang)}`;
}
function chainText(steps2) {
  const mark = { ok: "\u2713", diff: "\u2717", miss: "?", plain: "" };
  return steps2.slice(1).map((x) => `${x.title}: ${x.text}${mark[x.tone] && !x.text.includes("\u2717") ? ` ${mark[x.tone]}` : ""}`).join(" \u2192 ");
}
function chainMermaid(reqId, steps2, overall) {
  const safe = (s) => s.replace(/&/g, "#amp;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/[`|]/g, "'");
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  const key = reqId.replace(/[^A-Za-z0-9]/g, "");
  const ids = steps2.map((_, i) => `${key}_${i}`);
  const node = (x, i) => `  ${ids[i]}["${safe(x.title)}<br/>${safe(short(x.text, x.kind === "req" ? 46 : 52))}"]`;
  const lines2 = ["```mermaid", "flowchart LR", ...steps2.map(node), `  ${ids.join(" --> ")}`];
  for (const tone of ["ok", "diff", "fail", "miss", "plain"]) {
    const [ink, fill] = light[tone];
    lines2.push(`  classDef ${tone} fill:${fill},stroke:${ink},color:${ink}${tone === "miss" ? ",stroke-dasharray:5 4" : ""}`);
  }
  for (const tone of ["ok", "diff", "fail", "miss", "plain"]) {
    const of = steps2.map((x, i) => stepTone(x, overall) === tone ? ids[i] : "").filter(Boolean);
    if (of.length) lines2.push(`  class ${of.join(",")} ${tone}`);
  }
  lines2.push("```");
  return lines2;
}
function alignLabels(labels) {
  const wide = Math.max(...labels.map(wideCount));
  const narrow = Math.max(...labels.map((l) => [...l].length - wideCount(l)));
  return labels.map((l) => l + "\u3000".repeat(wide - wideCount(l)) + " ".repeat(narrow - ([...l].length - wideCount(l))));
}
function attemptLines(report, reqId, lang = getLang()) {
  const rows = report.sets.map((set) => ({ set, b: set.perReq[reqId]?.evidence.boundary })).filter((x) => x.b && x.b.attempts !== null);
  if (!rows.length) return [];
  const req = rows[0].b.required;
  const max = Math.max(req, ...rows.map((x) => x.b.attempts));
  if (max > 12) return [];
  const two = report.sets.length > 1;
  const strip = (at) => Array.from({ length: max }, (_, i) => i + 1 === at ? `[${i + 1}]` : ` ${i + 1} `).join("");
  const lines2 = [[lang === "ko" ? "\uC694\uAD6C\uC0AC\uD56D" : "required", strip(req), ""]];
  for (const { set, b } of rows) {
    const at = b.attempts;
    const d = Math.abs(at - req);
    const note = at === req ? lang === "ko" ? "\u2713 \uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC74C" : "\u2713 matches" : lang === "ko" ? `\u2717 ${d}\uD68C ${at > req ? "\uB2A6\uC74C" : "\uBE60\uB984"}` : `\u2717 ${d} ${at > req ? "late" : "early"}`;
    lines2.push([two ? lang === "ko" ? `\uACB0\uACFC ${set.key}` : `result ${set.key}` : lang === "ko" ? "\uCF54\uB4DC" : "code", strip(at), note]);
  }
  const labels = alignLabels(lines2.map((l) => l[0]));
  return lines2.map(([, s, note], i) => `${labels[i]}  ${s}${note ? "  " + note : ""}`.trimEnd());
}
function verifiedLine(report, lang = getLang()) {
  const n = report.summaries.length;
  const v = report.summaries.filter((s) => s.overall === "\uD655\uC778\uB428").length;
  if (lang === "en") {
    if (v === 0) return `None of the ${n} requirements is verified by evidence and tests yet`;
    return v === n ? `All ${n} requirements verified by evidence and tests` : `${v} of ${n} requirements verified by evidence and tests`;
  }
  if (v === 0) return `\uC694\uAD6C\uC0AC\uD56D ${n}\uAC1C \uC911 \uADFC\uAC70\uC640 \uAC80\uC0AC\uB85C \uD655\uC778\uB41C \uAC83\uC774 \uC544\uC9C1 \uC5C6\uC74C`;
  return v === n ? `\uC694\uAD6C\uC0AC\uD56D ${n}\uAC1C \uBAA8\uB450 \uADFC\uAC70\uC640 \uAC80\uC0AC\uB85C \uD655\uC778\uB428` : `\uC694\uAD6C\uC0AC\uD56D ${n}\uAC1C \uC911 ${v}\uAC1C\uB9CC \uADFC\uAC70\uC640 \uAC80\uC0AC\uB85C \uD655\uC778\uB428`;
}
function boundaryText(set, id) {
  return boundaryLine(set.perReq[id].evidence.boundary);
}
function summaryLine(report, s) {
  const id = s.req.id;
  if (s.overall === "\uB2E4\uB984") {
    const bad = report.sets.filter((x) => x.perReq[id].evidence.boundary?.ok === false);
    if (bad.length) {
      const line = bad.map((x) => (report.sets.length > 1 ? `${x.label}: ` : "") + boundaryText(x, id)).join(" \xB7 ");
      return bad.every((x) => passButOff(x.perReq[id])) ? `${line} \u2014 ${L("\uAC80\uC0AC\uB294 \uD1B5\uACFC", "but the test passes")}` : line;
    }
    if (s.relation.kind === "\uBD88\uC77C\uCE58") return L(`\uB450 \uACB0\uACFC\uC758 \uC870\uAC74\uC774 \uB2E4\uB984 (${s.relation.detail})`, `the two results use different conditions (${s.relation.detail})`);
    return L("\uACB0\uACFC \uC0AC\uC774\uC5D0 \uAC80\uC0AC \uACB0\uACFC\uAC00 \uB2E4\uB984", "the test results differ between the results");
  }
  if (s.overall === "\uC2E4\uD328") return L("\uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC2E4\uD328", "a linked test fails");
  if (s.overall === "\uBBF8\uD655\uC778") {
    if (report.sets.some((x) => x.perReq[id].evidence.status === "\uBBF8\uBC1C\uACAC")) return L("\uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD568", "no implementation evidence found");
    const open = report.sets.flatMap((x) => {
      const e = x.perReq[id].evidence;
      const tag = report.sets.length > 1 ? `${x.label}: ` : "";
      return [...(e.boundaries ?? []).filter((b) => b.ok === null).map((b) => tag + boundaryLine(b)), ...e.caveat ? [tag + pick(e.caveat)] : []];
    });
    if (open.length) return open.join(" \xB7 ");
    const why = undecidedReasons(report, s).filter((k) => k !== "no-test" && k !== "stale");
    if (why.length) {
      const what = why.map((k) => undecidedLabel(k)).join(" \xB7 ");
      const passed = report.sets.every((x) => x.perReq[id].testStatus === "\uD1B5\uACFC");
      const untested = report.sets.some((x) => x.perReq[id].testStatus === "\uBBF8\uC2E4\uD589");
      if (passed) return L(`\uAC80\uC0AC\uB294 \uD1B5\uACFC\uD588\uC9C0\uB9CC ${what}`, `the test passes, but ${what}`);
      return untested ? L(`${what} \xB7 \uC5F0\uACB0\uB41C \uAC80\uC0AC \uC5C6\uC74C`, `${what} \xB7 no linked test`) : what;
    }
    if (report.testsStale) return L("\uD14C\uC2A4\uD2B8 \uACB0\uACFC\uAC00 \uCF54\uB4DC\uBCF4\uB2E4 \uC624\uB798\uB418\uC5B4 \uC4F0\uC9C0 \uC54A\uC74C \u2014 \uD14C\uC2A4\uD2B8\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD574\uC57C \uD568", "test results are older than the code and were not used \u2014 run the tests again");
    return L("\uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC5C6\uC5B4 \uB3D9\uC791\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD568", "no linked test, so the behavior is not confirmed");
  }
  return L("\uADFC\uAC70\uB97C \uCC3E\uC558\uACE0 \uAC80\uC0AC\uAC00 \uD1B5\uACFC", "evidence found and the tests pass");
}
function allLenses(report) {
  const out = [];
  for (const set of report.sets) {
    for (const s of report.summaries) {
      const rr = set.perReq[s.req.id];
      const u = rr.evidence.unit;
      if (!u) continue;
      const bt = boundaryText(set, s.req.id);
      const notes = [bt, testWord(rr)].filter(Boolean);
      const other = report.sets.find((x) => x.key !== set.key);
      if (other && s.relation.kind === "\uBD88\uC77C\uCE58") notes.push(L(`${other.key}\uC640 \uC870\uAC74 \uB2E4\uB984`, `condition differs from ${other.key}`));
      const bad = rr.testStatus === "\uC2E4\uD328" || rr.evidence.boundary?.ok === false;
      const long = [`VerifyLens ${s.req.id} \xB7 ${wOverall(s.overall)}`, bt, testWord(rr), other && s.relation.kind === "\uBD88\uC77C\uCE58" ? L("A\xB7B \uC870\uAC74 \uB2E4\uB984", "A and B use different conditions") : ""].filter(Boolean);
      out.push({
        setKey: set.key,
        file: u.file,
        line: u.startLine,
        endLine: u.kind === "condition" ? u.endLine : u.startLine,
        reqId: s.req.id,
        reqText: s.req.text,
        overall: s.overall,
        severity: bad ? "warn" : s.overall === "\uD655\uC778\uB428" ? "ok" : "info",
        head: `${s.req.id} \xB7 ${wOverall(s.overall)}`,
        note: notes.join(" \xB7 "),
        title: long.join(" \xB7 ")
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
function prSummary(r, judgments = {}, opts = {}) {
  const lang = opts.lang ?? getLang();
  const t = TXT[lang];
  const { report } = r;
  const two = report.sets.length > 1;
  const c = counts(report);
  const out = [`## ${t.title}`, "", `**${verifiedLine(report, lang)}**`, ""];
  const ref = (s) => `\`${s.ref}\` (\`${s.sha}\`${s.wip ? `, ${t.wip}` : ""})`;
  const scope = two ? `A ${ref(report.sets[0])} \u2194 B ${ref(report.sets[1])} \xB7 ${t.base} \`${report.base}\`` : `${ref(report.sets[0])} \u2190 \`${report.base}\``;
  out.push(`${r.kind === "demo" ? `${t.sample} \xB7 ` : ""}${scope}`, "");
  out.push(["\uD655\uC778\uB428", "\uB2E4\uB984", "\uC2E4\uD328", "\uBBF8\uD655\uC778"].map((k) => `${t.count[k]} ${c[k]}`).join(" \xB7 "), "");
  const head = [`| ${t.cols.join(" | ")} |`, `|${t.cols.map(() => "---").join("|")}|`];
  const fixRows = [];
  const otherRows = [];
  const fixStrips = [];
  const otherStrips = [];
  const failed = [];
  const passOff = [];
  const look = [];
  const lookIds = [];
  const testsOnly = [];
  const points = [];
  const edited = [];
  const fixChains = [];
  const lookChains = [];
  const otherChains = [];
  for (const s of report.summaries) {
    const id = s.req.id;
    const kind = attention(report, s);
    if (!two && s.overall !== "\uD655\uC778\uB428") (kind === "fix" ? fixChains : kind === "look" ? lookChains : otherChains).push(`**${id}**`, ...chainMermaid(id, chainSteps(report, id, lang), s.overall), "");
    const ev = [];
    const tests = [];
    const notRun = [];
    const notes = [];
    let noImpl = false;
    for (const set of report.sets) {
      const rr = set.perReq[id];
      const u = rr.evidence.unit;
      const b = rr.evidence.boundary;
      const pre = two ? `${set.key} ` : "";
      let e = u ? `\`${cell(`${u.file}:${u.startLine}`)}\`${u.cond?.expr ? ` \`${cell(u.cond.expr)}\`` : u.kind === "function" ? ` ${t.whole}` : ""}` : t.noEvidence;
      if (b && b.attempts !== null) e += ` \u2192 ${t.attempt(b.attempts, b.required, b.ok)}`;
      else if (b) e += ` \u2192 ${cell(boundaryLine(b, lang))}`;
      ev.push(pre + e);
      tests.push(pre + (t.test[rr.testStatus] ?? rr.testStatus));
      if (rr.testStatus === "\uBBF8\uC2E4\uD589") notRun.push(set.key);
      if (passButOff(rr)) passOff.push(`- ${id}${two ? ` \xB7 ${set.key}` : ""}: ${t.passOffLine}`);
      for (const x of rr.evidence.boundaries ?? []) if (x.ok === null) notes.push(`- ${id}${two ? ` \xB7 ${set.key}` : ""}: ${boundaryLine(x, lang)}`);
      if (rr.evidence.caveat) notes.push(`- ${id}${two ? ` \xB7 ${set.key}` : ""}: ${pick(rr.evidence.caveat, lang)}`);
      if (!u) noImpl = true;
      for (const tc of rr.tests) {
        if (tc.status !== "fail") continue;
        const why = tc.message.split("\n").map((x) => x.trim()).filter(Boolean).join(" ").slice(0, 160);
        failed.push(`- ${id}${two ? ` \xB7 ${set.key}` : ""} \xB7 \`${tc.name.replace(/`/g, "'")}\`${why ? ` \u2014 ${why}` : ""}`);
      }
    }
    const changed = changedTests(report, id);
    for (const { set, e } of changed) edited.push(`- **${id}**${two ? ` \xB7 ${set.key}` : ""} \`${e.full.replace(/`/g, "'")}\` (\`${e.file}:${e.line}\`) \u2014 ${editText(e, lang)}`);
    const j = judgments[id];
    const decision = isJudged(j) ? `**${t.judge[j.judge] ?? j.judge}**${j.note ? ` \u2014 ${cell(j.note)}` : ""}` : s.overall === "\uD655\uC778\uB428" ? "\u2014" : t.judge.\uBBF8\uAC80\uD1A0;
    const row = `| **${id}** ${cell(s.req.text)} | ${t.status[s.overall]}${changed.length ? `<br>\u26A0\uFE0F ${t.editedCell}` : ""} | ${ev.join("<br>")} | ${tests.join("<br>")} | ${decision} |`;
    (kind === "fix" ? fixRows : otherRows).push(row);
    const strip = attemptLines(report, id, lang);
    if (strip.length && (s.overall !== "\uD655\uC778\uB428" || two)) (kind === "fix" ? fixStrips : otherStrips).push(`${id}`, ...strip, "");
    if (noImpl) notes.push(`- ${id}: ${t.noImpl}`);
    const pts = kind === "ok" ? "" : testPointsLine(s.req, lang);
    if (pts && kind === "fix") points.push(`- ${id}: ${pts}`);
    const untested = notRun.length ? `- ${id}: ${t.notRun}${two ? ` (${notRun.join(", ")})` : ""}${pts ? ` \u2014 ${t.tryValues} ${pts}` : ""}` : "";
    if (kind === "tests") {
      if (untested) testsOnly.push(untested);
      continue;
    }
    if (kind === "look") lookIds.push(id);
    look.push(...notes);
    if (untested && !noImpl && kind === "look") look.push(untested);
  }
  for (const set of report.sets) {
    for (const d of set.dyn) {
      const line = `- ${t.dyn}${two ? ` (${set.key})` : ""}: \`${d.file}:${d.line}\` \`${d.text.replace(/`/g, "'")}\``;
      if (!look.includes(line)) look.push(line);
    }
  }
  if (report.testsStale) look.unshift(`- ${t.stale}`);
  const code = (lines2) => ["```", ...lines2.slice(0, -1), "```"];
  if (fixRows.length) {
    out.push(`### ${t.fix(fixRows.length)}`, "", ...head, ...fixRows);
    if (fixChains.length) out.push("", `**${t.chain}**`, "", ...fixChains.slice(0, -1));
    if (fixStrips.length) out.push("", `**${t.when}**`, ...code(fixStrips));
    if (failed.length) out.push("", `**${t.failed}**`, ...failed);
    if (passOff.length) out.push("", `**${t.passOff}**`, ...passOff);
    if (points.length) out.push("", `**${t.points}**`, ...points);
  } else {
    out.push(`**${t.none}**`);
  }
  if (edited.length) out.push("", `### \u26A0\uFE0F ${t.edited(edited.length)}`, "", ...edited, "", t.editedHint);
  if (look.length || lookChains.length) out.push("", "<details>", `<summary>${t.look(lookIds.join(", "), look.length)}</summary>`, "", ...look, ...lookChains.length ? ["", `**${t.chain}**`, "", ...lookChains.slice(0, -1)] : [], "", "</details>");
  if (otherRows.length) {
    out.push("", "<details>", `<summary>${fixRows.length ? t.others(otherRows.length) : t.all(otherRows.length)}</summary>`, "", ...head, ...otherRows);
    if (otherStrips.length) out.push("", `**${t.when}**`, ...code(otherStrips));
    if (testsOnly.length) out.push("", `**${t.testsOnly}**`, ...testsOnly);
    if (otherChains.length) out.push("", `**${t.chain}**`, "", ...otherChains.slice(0, -1));
    out.push("", "</details>");
  }
  const autoIds = report.summaries.filter((x) => x.req.auto).map((x) => x.req.id);
  out.push("", `<sub>${t.notOpinion}<br>${autoIds.length ? t.autoLink(autoIds.join(", ")) + "<br>" : ""}${t.footer(opts.version ?? "")}</sub>`, "");
  return out.join("\n");
}
var isWide, wideCount, passButOff, testWord, TXT, cell, isJudged;
var init_model = __esm({
  "vscode/src/model.ts"() {
    "use strict";
    init_evidenceSteps();
    init_verdictStyle();
    init_evidenceView();
    init_evidenceSteps();
    init_engine();
    init_requirements();
    init_demo();
    init_output();
    init_summary();
    init_git();
    init_i18n();
    init_numeric();
    init_testpoints();
    init_testedits();
    init_i18n();
    isWide = (ch) => /[ᄀ-ᇿ　-鿿가-힣＀-￯]/.test(ch);
    wideCount = (s) => [...s].filter(isWide).length;
    passButOff = (rr) => rr.testStatus === "\uD1B5\uACFC" && rr.evidence.boundary?.ok === false;
    testWord = (rr) => passButOff(rr) ? L("\uAC80\uC0AC\uB294 \uD1B5\uACFC", "but the test passes") : testPhrase(rr.testStatus);
    TXT = {
      ko: {
        title: "VerifyLens \uAC80\uC99D \uC694\uC57D",
        sample: "\uC0D8\uD50C(\uAC00\uC0C1 \uC0AC\uB840)",
        base: "\uAE30\uC900",
        wip: "\uCEE4\uBC0B \uC548 \uB41C \uBCC0\uACBD \uD3EC\uD568",
        stale: "\uD14C\uC2A4\uD2B8 \uACB0\uACFC\uAC00 \uCF54\uB4DC\uBCF4\uB2E4 \uC624\uB798\uB418\uC5B4 \uC4F0\uC9C0 \uC54A\uC74C \u2014 \uB2E4\uC2DC \uC2E4\uD589 \uD544\uC694",
        status: { \uD655\uC778\uB428: `${marks.\uD655\uC778\uB428} \uD655\uC778\uB428`, \uB2E4\uB984: `${marks.\uB2E4\uB984} \uB2E4\uB984`, \uC2E4\uD328: `${marks.\uC2E4\uD328} \uC2E4\uD328`, \uBBF8\uD655\uC778: `${marks.\uBBF8\uD655\uC778} \uBBF8\uD655\uC778` },
        count: { \uD655\uC778\uB428: "\uD655\uC778\uB428", \uB2E4\uB984: "\uB2E4\uB984", \uC2E4\uD328: "\uC2E4\uD328", \uBBF8\uD655\uC778: "\uBBF8\uD655\uC778" },
        test: { \uD1B5\uACFC: "\uD1B5\uACFC", \uC2E4\uD328: "\uC2E4\uD328", \uBBF8\uC2E4\uD589: "\uBBF8\uC2E4\uD589" },
        judge: { \uC0AC\uC6A9: "\uC0AC\uC6A9", \uC218\uC815: "\uC218\uC815", "\uCD94\uAC00 \uAC80\uC99D": "\uCD94\uAC00 \uAC80\uC99D", \uBCF4\uB958: "\uBCF4\uB958", \uBBF8\uAC80\uD1A0: "\uBBF8\uAC80\uD1A0" },
        cols: ["\uC694\uAD6C\uC0AC\uD56D", "\uC0C1\uD0DC", "\uADFC\uAC70\uC640 \uB3D9\uC791 (\uCF54\uB4DC \uBD84\uC11D \xB7 \uACC4\uC0B0)", "\uAC80\uC0AC (\uC2E4\uD589 \uAE30\uB85D)", "\uD310\uB2E8 (\uC791\uC131\uC790)"],
        notOpinion: "AI\uAC00 \uC4F4 \uC758\uACAC\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uC774 \uC694\uC57D\uC758 \uD56D\uBAA9\uC740 \uBAA8\uB450 \uCF54\uB4DC \uC904\uACFC \uC2E4\uD589\uB41C \uAC80\uC0AC \uAE30\uB85D\uC5D0\uC11C \uB098\uC654\uACE0, \uD655\uC778\uD558\uC9C0 \uBABB\uD55C \uAC83\uC740 \uD1B5\uACFC\uB85C \uCE58\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
        when: "\uB3D9\uC791 \uC2DC\uC810 (\uC870\uAC74 \uAC12\uC5D0\uC11C \uACC4\uC0B0, [n] = \uB3D9\uC791\uD558\uB294 \uC2DC\uB3C4)",
        chain: "\uADFC\uAC70 \uC0AC\uC2AC (\uC694\uAD6C\uC0AC\uD56D \u2192 \uCF54\uB4DC \uC904 \u2192 \uAC80\uC0AC \u2192 \uB3D9\uC791 \xB7 \uD68C\uC0C9 \uC810\uC120 = \uBE44\uC5B4 \uC788\uB294 \uCE78)",
        attempt: (n, req, ok) => ok === false ? `${n}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0 \uB3D9\uC791 (\uC694\uAD6C\uC0AC\uD56D ${req}\uD68C)` : `${n}\uBC88\uC9F8 \uC2DC\uB3C4\uC5D0 \uB3D9\uC791`,
        noEvidence: "\uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD568",
        whole: "\uD568\uC218 \uC804\uCCB4",
        failed: "\uC2E4\uD328\uD55C \uAC80\uC0AC",
        passOff: "\uAC80\uC0AC\uB294 \uD1B5\uACFC\uD588\uC9C0\uB9CC \uACC4\uC0B0\uACFC \uB2E4\uB978 \uAC83",
        edited: (n) => `\uC774\uBC88 \uBCC0\uACBD\uC5D0\uC11C \uBC14\uB010 \uAC80\uC0AC ${n}\uAC1C \u2014 \uD1B5\uACFC\uAC00 \uC774 \uBCC0\uACBD \uB355\uC77C \uC218 \uC788\uC74C`,
        editedHint: "\uAC80\uC0AC\uAC00 \uCF54\uB4DC\uAC00 \uC544\uB2C8\uB77C \uC694\uAD6C\uC0AC\uD56D\uC744 \uD655\uC778\uD558\uB294\uC9C0 \uBCFC \uAC83. \uC694\uAD6C\uC0AC\uD56D\uC774 \uBC14\uB010 \uAC83\uC774\uBA74 \uC694\uAD6C\uC0AC\uD56D \uD30C\uC77C\uB3C4 \uAC19\uC774 \uACE0\uCE60 \uAC83.",
        editedCell: "\uAC80\uC0AC \uBC14\uB01C",
        passOffLine: "\uAC80\uC0AC\uAC00 \uD1B5\uACFC\uD588\uC9C0\uB9CC, \uC870\uAC74 \uAC12\uC5D0\uC11C \uACC4\uC0B0\uD55C \uB3D9\uC791 \uC2DC\uC810\uC774 \uC694\uAD6C\uC0AC\uD56D\uACFC \uB2E4\uB984 \u2014 \uAC80\uC0AC\uAC00 \uC694\uAD6C\uC0AC\uD56D\uACFC \uAC19\uC740 \uD69F\uC218\uB97C \uD655\uC778\uD558\uB294\uC9C0 \uBCFC \uAC83",
        fix: (n) => `\uACE0\uCCD0\uC57C \uD560 \uAC83 ${n}\uAC1C (\uB2E4\uB984 \xB7 \uC2E4\uD328)`,
        none: "\uB2E4\uB984 \xB7 \uC2E4\uD328\uC778 \uC694\uAD6C\uC0AC\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
        look: (ids, n) => ids ? `\uC0AC\uB78C\uC774 \uBCFC \uAC83 \u2014 \uBBF8\uD655\uC778 \uC911 \uCF54\uB4DC\uB098 \uBB38\uC7A5\uC744 \uBD10\uC57C \uD558\uB294 \uAC83 (${ids})` : `\uC0AC\uB78C\uC774 \uBCFC \uAC83 ${n}\uAC1C`,
        others: (n) => `\uB098\uBA38\uC9C0 \uC694\uAD6C\uC0AC\uD56D ${n}\uAC1C`,
        all: (n) => `\uC694\uAD6C\uC0AC\uD56D ${n}\uAC1C \uD45C`,
        testsOnly: "\uAC80\uC0AC\uAC00 \uC5C6\uC5B4\uC11C\uB9CC \uBBF8\uD655\uC778\uC778 \uAC83",
        points: "\uACBD\uACC4\uC5D0\uC11C \uC2DC\uD5D8\uD560 \uAC12 (\uC694\uAD6C\uC0AC\uD56D\uC758 \uC22B\uC790\uC5D0\uC11C \uBF51\uC74C)",
        tryValues: "\uC2DC\uD5D8\uD560 \uAC12:",
        notRun: "\uC5F0\uACB0\uB41C \uAC80\uC0AC\uAC00 \uC2E4\uD589\uB418\uC9C0 \uC54A\uC74C",
        noImpl: "\uAD6C\uD604 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD568",
        dyn: "\uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uD638\uCD9C",
        autoLink: (ids) => `${ids}: \uD0A4\uC6CC\uB4DC \uC5C6\uC774 \uC6A9\uC5B4\uC9D1\uC73C\uB85C \uCF54\uB4DC\uC640 \uC5F0\uACB0\uD568 \u2014 \uADFC\uAC70 \uC904\uC740 \uC791\uC131\uC790\uAC00 \uD655\uC778`,
        footer: (v) => `VerifyLens${v ? " " + v : ""} \xB7 \uC815\uC801 \uBD84\uC11D\uACFC \uC2E4\uD589\uB41C \uAC80\uC0AC \uACB0\uACFC\uB9CC \uC0AC\uC6A9 (AI \uCD94\uC815 \uC5C6\uC74C) \xB7 \uD310\uB2E8\uC740 \uC791\uC131\uC790\uAC00 \uC9C1\uC811 \uAE30\uB85D`
      },
      en: {
        title: "VerifyLens verification summary",
        sample: "Sample (fictional case)",
        base: "base",
        wip: "includes uncommitted changes",
        stale: "test results are older than the code and were not used \u2014 re-run the tests",
        status: { \uD655\uC778\uB428: `${marks.\uD655\uC778\uB428} Verified`, \uB2E4\uB984: `${marks.\uB2E4\uB984} Different`, \uC2E4\uD328: `${marks.\uC2E4\uD328} Failed`, \uBBF8\uD655\uC778: `${marks.\uBBF8\uD655\uC778} Not verified` },
        count: { \uD655\uC778\uB428: "Verified", \uB2E4\uB984: "Different", \uC2E4\uD328: "Failed", \uBBF8\uD655\uC778: "Not verified" },
        test: { \uD1B5\uACFC: "Passed", \uC2E4\uD328: "Failed", \uBBF8\uC2E4\uD589: "Not run" },
        judge: { \uC0AC\uC6A9: "Use", \uC218\uC815: "Fix", "\uCD94\uAC00 \uAC80\uC99D": "Verify more", \uBCF4\uB958: "Hold", \uBBF8\uAC80\uD1A0: "Not reviewed" },
        cols: ["Requirement", "Status", "Evidence and behavior (code analysis \xB7 computed)", "Tests (executed)", "Decision (author)"],
        notOpinion: "This is not an AI opinion. Every item in this summary comes from a code line or an executed test, and anything that could not be checked is not counted as passing.",
        when: "When it acts (computed from the condition, [n] = the attempt that triggers it)",
        chain: "Evidence chain (requirement \u2192 code line \u2192 tests \u2192 when it acts \xB7 grey dashed = missing)",
        attempt: (n, req, ok) => ok === false ? `acts on attempt ${n} (requirement: ${req})` : `acts on attempt ${n}`,
        noEvidence: "no evidence found",
        whole: "whole function",
        failed: "Failed tests",
        passOff: "Tests pass, but the computed behavior differs",
        edited: (n) => `Tests changed in this change: ${n} \u2014 they may pass because of the change`,
        editedHint: "Check that each test still checks the requirement, not the code. If the requirement itself changed, update the requirements file too.",
        editedCell: "test changed",
        passOffLine: "the linked test passes, but the attempt computed from the condition differs from the requirement \u2014 check that the test exercises the same count as the requirement",
        fix: (n) => `Needs a fix: ${n} (Different or Failed)`,
        none: "No requirement is Different or Failed.",
        look: (ids, n) => ids ? `Worth a look \u2014 not verified, and the code or the wording needs a check (${ids})` : `Worth a look (${n})`,
        others: (n) => `Other requirements (${n})`,
        all: (n) => `All requirements (${n})`,
        testsOnly: "Not verified only because no test ran",
        points: "Values to test at the boundary (from the requirement's numbers)",
        tryValues: "try",
        notRun: "no linked test was run",
        noImpl: "no implementation evidence found",
        dyn: "Unresolved call",
        autoLink: (ids) => `${ids}: linked to code by a fixed glossary (no keywords given) \u2014 evidence lines checked by the author`,
        footer: (v) => `VerifyLens${v ? " " + v : ""} \xB7 static analysis and executed test results only (no AI inference) \xB7 decisions recorded by the author`
      }
    };
    cell = (s) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    isJudged = (j) => !!j && !!j.judge && j.judge !== "\uBBF8\uAC80\uD1A0";
  }
});

// src/ci.ts
var ci_exports = {};
__export(ci_exports, {
  UsageError: () => UsageError,
  checkRerun: () => checkRerun,
  parseFailOn: () => parseFailOn,
  runCi: () => runCi
});
import { appendFileSync, existsSync as existsSync3, readFileSync as readFileSync3, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join4, relative, resolve } from "node:path";
function parseFailOn(value) {
  const words2 = (value ?? "different,failed").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = words2.filter((w) => !FAIL_WORDS[w]);
  if (unknown.length) throw new UsageError(L(`--fail-on \uC5D0 \uBAA8\uB974\uB294 \uAC12\uC774 \uC788\uC2B5\uB2C8\uB2E4: ${unknown.join(", ")} (different \xB7 failed \xB7 unverified)`, `Unknown --fail-on value: ${unknown.join(", ")} (use different, failed, unverified)`));
  return new Set(words2.map((w) => FAIL_WORDS[w]));
}
function hookKind(v) {
  if (v === void 0) return void 0;
  if (v === "claude" || v === "cursor") return v;
  throw new UsageError(L(`--hook \uC740 claude \uB610\uB294 cursor \uC785\uB2C8\uB2E4: ${v}`, `--hook must be claude or cursor: ${v}`));
}
function parseHookInput(text) {
  if (!text?.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function hookDir(hook, input) {
  if (hook === "claude") return str(process.env.CLAUDE_PROJECT_DIR) ?? str(input.cwd);
  if (hook === "cursor") return str(process.env.CURSOR_PROJECT_DIR) ?? (Array.isArray(input.workspace_roots) ? str(input.workspace_roots[0]) : void 0);
  return void 0;
}
function topLevel(dir) {
  try {
    return resolve(git(dir, ["rev-parse", "--show-toplevel"]).trim());
  } catch {
    throw new UsageError(L(`git \uC800\uC7A5\uC18C\uAC00 \uC544\uB2D9\uB2C8\uB2E4: ${dir}`, `Not a git repository: ${dir}`));
  }
}
function refExists(repo, ref) {
  try {
    git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
function pickBase(repo, given, worktree) {
  if (given) {
    if (!refExists(repo, given)) throw new UsageError(L(`\uBE44\uAD50 \uAE30\uC900\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${given} (--base \uC5D0 \uC788\uB294 \uBE0C\uB79C\uCE58\uB098 \uCEE4\uBC0B\uC744 \uC8FC\uC138\uC694)`, `The base was not found: ${given} (give --base an existing branch or commit)`));
    return given;
  }
  const tries = worktree ? ["origin/main", "main", "origin/master", "master"] : ["origin/main"];
  const found = tries.find((r) => refExists(repo, r));
  if (!found) throw new UsageError(L(`\uBE44\uAD50 \uAE30\uC900\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4 (${tries.join(", ")}). --base \uB85C \uC815\uD574 \uC8FC\uC138\uC694.`, `No base was found (${tries.join(", ")}). Set one with --base.`));
  return found;
}
function agentMessage(blocking, why, lenses, reqPath, report) {
  const lines2 = [
    L(`VerifyLens: \uCF54\uB4DC\uAC00 ${reqPath} \uC758 \uC694\uAD6C\uC0AC\uD56D ${blocking.length}\uAC1C\uC640 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`, `VerifyLens: the code does not match ${blocking.length} requirement(s) in ${reqPath}.`)
  ];
  for (const s of blocking) {
    const lens = lenses.find((l) => l.reqId === s.req.id);
    lines2.push(`- ${s.req.id} \xB7 ${wOverall(s.overall)}: ${s.req.text}`);
    const detail2 = [why(s), lens ? `${lens.file}:${lens.line}` : ""].filter(Boolean).join(" \u2014 ");
    if (detail2) lines2.push(`  ${detail2}`);
    lines2.push(`  ${chainText(chainSteps(report, s.req.id))}`);
    const failed = (report.sets[0]?.perReq[s.req.id]?.tests ?? []).filter((t) => t.status === "fail").map((t) => t.name);
    if (failed.length) lines2.push(`  ${L("\uC2E4\uD328\uD55C \uAC80\uC0AC(\uACE0\uCE5C \uB4A4 \uB2E4\uC2DC \uB3CC\uB9B4 \uAC83)", "Failed tests (run them again after the fix)")}: ${quoteList(failed)}`);
    const points = testPointsLine(s.req);
    if (points) lines2.push(`  ${L("\uACBD\uACC4\uC5D0\uC11C \uC2DC\uD5D8\uD560 \uAC12", "Values to test at the boundary")}: ${points}`);
  }
  lines2.push(
    L(
      "\uC694\uAD6C\uC0AC\uD56D\uC774 \uB9D0\uD558\uB294 \uB300\uB85C \uCF54\uB4DC\uB97C \uACE0\uCCD0 \uC8FC\uC138\uC694. \uC694\uAD6C\uC0AC\uD56D \uC790\uCCB4\uAC00 \uD2C0\uB824 \uBCF4\uC774\uBA74 \uC694\uAD6C\uC0AC\uD56D \uD30C\uC77C\uC774\uB098 \uAC80\uC0AC\uB97C \uBC14\uAFB8\uC9C0 \uB9D0\uACE0 \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uBB3C\uC5B4\uBCF4\uC138\uC694.",
      "Fix the code so it does what each requirement says. If a requirement itself looks wrong, ask the user instead of changing the requirements file or the check."
    )
  );
  return lines2.join("\n");
}
function editedMessage(items) {
  return [
    L(
      "VerifyLens: \uC774\uBC88 \uBCC0\uACBD\uC5D0\uC11C \uC694\uAD6C\uC0AC\uD56D\uC5D0 \uC774\uC5B4\uC9C4 \uAC80\uC0AC\uB97C \uBC14\uAFB8\uAC70\uB098 \uC9C0\uC6E0\uC2B5\uB2C8\uB2E4. \uAC80\uC0AC\uAC00 \uD1B5\uACFC\uD558\uB294 \uAC83\uC774 \uC774 \uBCC0\uACBD \uB355\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      "VerifyLens: tests linked to requirements were changed or removed in this change. They may pass only because of that change."
    ),
    ...items.map(({ s, e }) => `- ${s.req.id} \xB7 ${s.req.text}: ${changedTestLine(e)}`),
    L(
      "\uAC80\uC0AC\uAC00 \uCF54\uB4DC\uAC00 \uD558\uB294 \uC77C\uC774 \uC544\uB2C8\uB77C \uC694\uAD6C\uC0AC\uD56D\uC774 \uB9D0\uD558\uB294 \uAC83\uC744 \uD655\uC778\uD558\uB3C4\uB85D \uB418\uB3CC\uB824 \uC8FC\uC138\uC694. \uC694\uAD6C\uC0AC\uD56D\uC774 \uBC14\uB010 \uAC83\uC774\uB77C\uBA74 \uAC80\uC0AC\uB97C \uACE0\uCE58\uAE30 \uC804\uC5D0 \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uBB3C\uC5B4\uBCF4\uC138\uC694.",
      "Make each test check what the requirement says, not what the code does. If the requirement itself changed, ask the user before changing the test."
    )
  ].join("\n");
}
function failedStatePath(repo) {
  return resolve(repo, git(repo, ["rev-parse", "--git-path", "verifylens-failed-tests.json"]).trim());
}
function readFailedState(file) {
  try {
    const v = JSON.parse(readFileSync3(file, "utf8"));
    const tests = v && typeof v === "object" ? v.tests : void 0;
    return Array.isArray(tests) ? tests.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}
function checkRerun(stateFile, fresh, staleFailed) {
  const before = readFailedState(stateFile);
  let notRun;
  let passedNow = [];
  let failingNow = [];
  if (!fresh) {
    notRun = [.../* @__PURE__ */ new Set([...before, ...staleFailed])];
  } else {
    const status = new Map(fresh.map((t) => [t.name, t.status]));
    notRun = before.filter((n) => !status.has(n));
    passedNow = before.filter((n) => status.get(n) === "pass");
    failingNow = fresh.filter((t) => t.status === "fail").map((t) => t.name);
  }
  const keep = [.../* @__PURE__ */ new Set([...failingNow, ...notRun])];
  try {
    if (keep.length) writeFileSync2(stateFile, JSON.stringify({ tests: keep, at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2) + "\n");
    else rmSync(stateFile, { force: true });
  } catch {
  }
  return { notRun, passedNow };
}
function rerunMessage(notRun) {
  return L(
    `VerifyLens: \uC804\uC5D0 \uC2E4\uD328\uD55C \uAC80\uC0AC\uB97C \uCF54\uB4DC\uAC00 \uBC14\uB010 \uB4A4 \uB2E4\uC2DC \uB3CC\uB9AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4: ${quoteList(notRun)}. \uADF8 \uAC80\uC0AC\uB97C \uB2E4\uC2DC \uB3CC\uB824 \uACB0\uACFC\uB97C \uBCF8 \uB4A4\uC5D0 \uB05D\uB0B4\uC138\uC694 (\uD14C\uC2A4\uD2B8 \uACB0\uACFC \uD30C\uC77C\uB3C4 \uC0C8\uB85C \uC368\uC57C \uD569\uB2C8\uB2E4).`,
    `VerifyLens: tests that failed before were not run again after the code changed: ${quoteList(notRun)}. Run them again and look at the result before you finish (the test report must be written again too).`
  );
}
function runCi(opts, hookInput, io = consoleIO) {
  let hook;
  try {
    hook = hookKind(opts.hook);
    return check(opts, hook, parseHookInput(hookInput), io);
  } catch (e) {
    if (!(e instanceof UsageError) && !hook) throw e;
    io.err(e instanceof Error ? e.message : String(e));
    return hook ? 1 : 2;
  }
}
function check(opts, hook, input, io) {
  const worktree = !!hook || opts.worktree === "true";
  const say = hook ? io.err : io.out;
  const pass = () => {
    if (hook === "cursor") io.out("{}");
    return 0;
  };
  if (hook === "cursor" && str(input.status) && input.status !== "completed") return pass();
  const dir = resolve(opts.repo ?? hookDir(hook, input) ?? ".");
  const reqFile = resolve(dir, opts.requirements ?? ".verifylens/requirements.md");
  const failOn = parseFailOn(opts["fail-on"]);
  if (!existsSync3(reqFile)) {
    if (hook) {
      say(L(`\uC694\uAD6C\uC0AC\uD56D \uD30C\uC77C\uC774 \uC5C6\uC5B4 \uAC74\uB108\uB701\uB2C8\uB2E4: ${reqFile}`, `No requirements file, so nothing is checked: ${reqFile}`));
      return pass();
    }
    throw new UsageError(L(`\uC694\uAD6C\uC0AC\uD56D \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ${reqFile}`, `The requirements file does not exist: ${reqFile}`));
  }
  const reqs = parseRequirements(readFileSync3(reqFile, "utf8"));
  if (!reqs.length) throw new UsageError(L("\uC694\uAD6C\uC0AC\uD56D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \u300C- R1: \uBB38\uC7A5\u300D \uD615\uC2DD\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694.", 'No requirements could be read. Each line must look like "- R1: sentence".'));
  const repo = topLevel(dir);
  if (hook && !uncommittedFiles(repo).some((f) => CODE_EXT3.test(f))) return pass();
  const base2 = pickBase(repo, opts.base, worktree);
  const head = opts.head ?? "HEAD";
  let junit = opts.junit ? resolve(dir, opts.junit) : void 0;
  if (junit && !existsSync3(junit)) {
    say(L(`\uD14C\uC2A4\uD2B8 \uACB0\uACFC \uD30C\uC77C\uC774 \uC5C6\uC5B4 \uAC80\uC0AC \uC5C6\uC774 \uD310\uB2E8\uD569\uB2C8\uB2E4: ${junit}`, `The test report was not found, so tests are not used: ${junit}`));
    junit = void 0;
  }
  let staleFailed = [];
  if (junit && worktree) {
    const newest = Math.max(0, ...worktreeChangedFiles(repo, mergeBase(repo, base2)).filter((f) => CODE_EXT3.test(f)).map((f) => mtime(join4(repo, f))));
    if (mtime(junit) + 1500 < newest) {
      say(L(`\uD14C\uC2A4\uD2B8 \uACB0\uACFC\uAC00 \uCF54\uB4DC\uBCF4\uB2E4 \uC624\uB798\uB3FC \uC4F0\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4: ${junit} (\uD14C\uC2A4\uD2B8\uB97C \uB2E4\uC2DC \uB3CC\uB9AC\uC138\uC694)`, `The test report is older than the code, so it is not used: ${junit} (run the tests again)`));
      try {
        staleFailed = parseTestReport(readFileSync3(junit, "utf8")).filter((t) => t.status === "fail").map((t) => t.name);
      } catch {
        staleFailed = [];
      }
      junit = void 0;
    }
  }
  const set = analyzeResult({ key: "A", repo, base: base2, ref: worktree ? "HEAD" : head, junit, worktree });
  const report = evaluate([set], reqs, repo, base2);
  const rerun = worktree && opts.junit ? checkRerun(failedStatePath(repo), junit ? set.tests : null, staleFailed) : { notRun: [], passedNow: [] };
  if (rerun.notRun.length) say(rerunMessage(rerun.notRun));
  if (rerun.passedNow.length) say(L(`\uC804\uC5D0 \uC2E4\uD328\uD55C \uAC80\uC0AC\uAC00 \uC774\uC81C \uD1B5\uACFC\uD569\uB2C8\uB2E4: ${quoteList(rerun.passedNow)}`, `Tests that failed before pass now: ${quoteList(rerun.passedNow)}`));
  if (!set.analyses.length) {
    say(
      worktree ? L(`${base2}\uC640 \uBE44\uAD50\uD574 \uBC14\uB010 TypeScript \xB7 JavaScript \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4 (\uCEE4\uBC0B \uC804 \uBCC0\uACBD \uD3EC\uD568).`, `No TypeScript or JavaScript files changed compared to ${base2} (uncommitted changes included).`) : L(`${base2}\uC640 \uBE44\uAD50\uD574 ${head}\uC5D0\uC11C \uBC14\uB010 TypeScript \xB7 JavaScript \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`, `No TypeScript or JavaScript files changed in ${head} compared to ${base2}.`)
    );
  }
  const github = !hook && (!!process.env.GITHUB_ACTIONS || opts.github === "true");
  const workspace = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : repo;
  const lenses = allLenses(report);
  const why = (s) => summaryLine(report, s);
  for (const s of report.summaries) {
    if (hook) continue;
    const reasons = undecidedReasons(report, s).map((k) => undecidedLabel(k));
    say(`${s.req.id} \xB7 ${wOverall(s.overall)}${reasons.length ? ` (${reasons.join(", ")})` : ""} \u2014 ${s.req.text}${why(s) ? `
    ${why(s)}` : ""}`);
    const changed = changedTests(report, s.req.id);
    for (const { e } of changed) say(`    \u26A0 ${changedTestLine(e)}`);
    if (github) {
      for (const { e } of changed) {
        const at = e.kind === "removed" ? "" : `file=${escProp(slash(relative(workspace, join4(repo, e.file))))},line=${e.line},`;
        io.out(`::warning ${at}title=${escProp(`VerifyLens ${s.req.id} \xB7 ${L("\uAC80\uC0AC \uBC14\uB01C", "test changed")}`)}::${escData(`${s.req.text} \u2014 ${changedTestLine(e)}`)}`);
      }
    }
    if (!github || s.overall === "\uD655\uC778\uB428") continue;
    const level = s.overall === "\uBBF8\uD655\uC778" ? "warning" : "error";
    const lens = lenses.find((l) => l.reqId === s.req.id);
    const where3 = lens ? `file=${escProp(slash(relative(workspace, join4(repo, lens.file))))},line=${lens.line},` : "";
    const title = `VerifyLens ${s.req.id} \xB7 ${wOverall(s.overall)}`;
    const message2 = [s.req.text, why(s), reasons.join(", ")].filter(Boolean).join(" \u2014 ");
    io.out(`::${level} ${where3}title=${escProp(title)}::${escData(message2)}`);
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && !hook) appendFileSync(summaryFile, prSummary({ kind: "repo", repo, report, notes: [] }) + "\n");
  const blocking = report.summaries.filter((s) => failOn.has(s.overall));
  const names = [...failOn].map((o) => wOverall(o)).join(L(" \xB7 ", " or "));
  if (!hook) {
    say(
      blocking.length ? L(`
${names} \uC778 \uC694\uAD6C\uC0AC\uD56D\uC774 ${blocking.length}\uAC1C \uC788\uC5B4 \uC2E4\uD328\uB85C \uB05D\uB0C5\uB2C8\uB2E4: ${blocking.map((s) => s.req.id).join(", ")}`, `
${blocking.length} requirement(s) are ${names}, so this check fails: ${blocking.map((s) => s.req.id).join(", ")}`) : L(`
${names} \uC778 \uC694\uAD6C\uC0AC\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`, `
No requirement is ${names}.`)
    );
    return blocking.length ? 1 : 0;
  }
  const edited = report.summaries.filter((s) => !blocking.includes(s)).flatMap((s) => changedTests(report, s.req.id).map(({ e }) => ({ s, e })));
  if (!blocking.length && !rerun.notRun.length && !edited.length) return pass();
  const message = [
    blocking.length ? agentMessage(blocking, why, lenses, slash(relative(dir, reqFile)), report) : "",
    rerun.notRun.length ? rerunMessage(rerun.notRun) : "",
    edited.length ? editedMessage(edited) : ""
  ].filter(Boolean).join("\n\n");
  const retried = hook === "claude" ? input.stop_hook_active === true : Number(input.loop_count ?? 0) >= 1;
  if (retried) {
    io.err(message);
    if (hook === "cursor") io.out("{}");
    return 1;
  }
  io.out(JSON.stringify(hook === "claude" ? { decision: "block", reason: message } : { followup_message: message }));
  return 0;
}
var FAIL_WORDS, CODE_EXT3, escData, escProp, UsageError, consoleIO, str, mtime, slash, quoteList;
var init_ci = __esm({
  "src/ci.ts"() {
    init_engine();
    init_git();
    init_requirements();
    init_tests();
    init_testpoints();
    init_summary();
    init_numeric();
    init_i18n();
    init_model();
    FAIL_WORDS = { different: "\uB2E4\uB984", failed: "\uC2E4\uD328", unverified: "\uBBF8\uD655\uC778" };
    CODE_EXT3 = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
    escData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    escProp = (s) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
    UsageError = class extends Error {
    };
    consoleIO = { out: (s) => console.log(s), err: (s) => console.error(s) };
    str = (v) => typeof v === "string" && v ? v : void 0;
    mtime = (p) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return 0;
      }
    };
    slash = (p) => p.split("\\").join("/");
    quoteList = (names) => names.map((n) => `"${n}"`).join(", ");
  }
});

// src/cli.ts
init_engine();
init_requirements();
init_demo();
init_i18n();
import { mkdirSync as mkdirSync2, readFileSync as readFileSync4 } from "node:fs";
import { resolve as resolve2 } from "node:path";
import { spawn } from "node:child_process";
function openInBrowser(file) {
  const [cmd, cmdArgs, verbatim] = process.platform === "win32" ? ["cmd", ["/c", "start", '""', `"${file}"`], true] : process.platform === "darwin" ? ["open", [file], false] : ["xdg-open", [file], false];
  spawn(cmd, cmdArgs, { detached: true, stdio: "ignore", windowsVerbatimArguments: verbatim }).unref();
}
function args(argv) {
  const [cmd = "help", ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const k = rest[i].slice(2);
      const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
      opts[k] = v;
    }
  }
  return { cmd, opts };
}
var HELP_EN = `VerifyLens \u2014 your code never leaves this machine (no network use)

  node src/cli.ts demo [--out dir] [--open] [--lang en|ko]
      Builds a report from the sample (a made-up login-lockout case). --open opens it in the browser.

  node src/cli.ts extract --pr-body pr.md
      Extracts requirement candidates from a PR description and prints a requirements.md draft.

  node src/cli.ts report --repo repo --base main --a branchA [--b branchB]
        --requirements requirements.md [--junit-a a.xml --junit-b b.xml] [--out dir] [--open] [--lang en|ko]
      Analyzes base..branch and writes report.html and summary.md.

  node src/cli.ts ci --repo repo --base origin/main [--head HEAD] --requirements .verifylens/requirements.md
        [--junit report.xml] [--fail-on different,failed] [--lang en|ko]
      For CI (GitHub Actions). Prints one line per requirement, marks the deciding lines on the pull request
      (when GITHUB_ACTIONS is set), writes the summary to GITHUB_STEP_SUMMARY, and exits with 1 when a
      requirement is Different or Failed (--fail-on also accepts unverified).
      --worktree checks the working folder instead of a commit: committed, uncommitted and new files
      compared to --base (origin/main, main, origin/master or master when not given). For git hooks.
      --hook claude|cursor runs as an AI agent's stop hook: reads the hook's JSON on stdin, checks only
      when code has uncommitted changes, and asks the agent once to fix a Different or Failed requirement.

  node src/cli.ts check   (engine check: prints the sample result as text)
`;
var HELP = `VerifyLens \u2014 \uCF54\uB4DC\uB294 \uC774 PC \uBC16\uC73C\uB85C \uB098\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 (\uB124\uD2B8\uC6CC\uD06C \uC0AC\uC6A9 \uC5C6\uC74C)

  node src/cli.ts demo [--out \uD3F4\uB354] [--open]
      \uC0D8\uD50C(\uB85C\uADF8\uC778 \uC7A0\uAE08 \uAC00\uC0C1 \uC0AC\uB840)\uB85C \uB9AC\uD3EC\uD2B8\uB97C \uB9CC\uB4ED\uB2C8\uB2E4. --open \uC740 \uCEE8\uC149 \uC2DC\uC5F0\uC744 \uBE0C\uB77C\uC6B0\uC800\uB85C \uC5FD\uB2C8\uB2E4.

  node src/cli.ts extract --pr-body PR\uC124\uBA85.md
      PR \uC124\uBA85\uC5D0\uC11C \uC694\uAD6C\uC0AC\uD56D \uD6C4\uBCF4\uB97C \uBF51\uC544 requirements.md \uCD08\uC548\uC744 \uCD9C\uB825\uD569\uB2C8\uB2E4.

  node src/cli.ts report --repo \uC800\uC7A5\uC18C --base main --a \uBE0C\uB79C\uCE58A [--b \uBE0C\uB79C\uCE58B]
        --requirements requirements.md [--junit-a a.xml --junit-b b.xml] [--out \uD3F4\uB354] [--open]
      \uC800\uC7A5\uC18C\uC758 base..\uBE0C\uB79C\uCE58 \uBCC0\uACBD\uC744 \uBD84\uC11D\uD574 \uB9AC\uD3EC\uD2B8(report.html, summary.md)\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.

  node src/cli.ts ci --repo \uC800\uC7A5\uC18C --base origin/main [--head HEAD] --requirements .verifylens/requirements.md
        [--junit report.xml] [--fail-on different,failed] [--lang en|ko]
      CI(GitHub Actions)\uC6A9. \uC694\uAD6C\uC0AC\uD56D\uB9C8\uB2E4 \uD55C \uC904\uC529 \uCD9C\uB825\uD558\uACE0, GITHUB_ACTIONS \uAC00 \uC788\uC73C\uBA74 PR \uC758 \uADFC\uAC70 \uC904\uC5D0 \uD45C\uC2DC\uB97C \uB0A8\uAE30\uBA70,
      \uC694\uC57D\uC744 GITHUB_STEP_SUMMARY \uC5D0 \uC4F4\uB2E4. \u300C\uB2E4\uB984\u300D \xB7 \u300C\uC2E4\uD328\u300D\uAC00 \uC788\uC73C\uBA74 \uC885\uB8CC \uCF54\uB4DC 1 (--fail-on \uC5D0 unverified \uB3C4 \uB123\uC744 \uC218 \uC788\uB2E4).
      --worktree \uB294 \uCEE4\uBC0B \uB300\uC2E0 \uC791\uC5C5 \uD3F4\uB354\uB97C \uBCF8\uB2E4: --base(\uC5C6\uC73C\uBA74 origin/main \xB7 main \xB7 origin/master \xB7 master)\uC640 \uBE44\uAD50\uD574
      \uCEE4\uBC0B\uD55C \uAC83 \xB7 \uCEE4\uBC0B \uC804 \uC218\uC815 \xB7 \uC0C8 \uD30C\uC77C. git \uD6C5\uC6A9.
      --hook claude|cursor \uB294 AI \uC5D0\uC774\uC804\uD2B8\uAC00 \uBA48\uCD9C \uB54C \uB3C4\uB294 \uD6C5\uC6A9: \uD45C\uC900 \uC785\uB825\uC758 \uD6C5 JSON \uC744 \uC77D\uACE0, \uCEE4\uBC0B \uC804 \uCF54\uB4DC \uBCC0\uACBD\uC774 \uC788\uC744 \uB54C\uB9CC
      \uAC80\uC0AC\uD574 \u300C\uB2E4\uB984\u300D \xB7 \u300C\uC2E4\uD328\u300D\uAC00 \uC788\uC73C\uBA74 \uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uD55C \uBC88 \uACE0\uCE58\uB77C\uACE0 \uB3CC\uB824\uBCF4\uB0B8\uB2E4.

  node src/cli.ts check   (\uC5D4\uC9C4 \uC810\uAC80: \uC0D8\uD50C \uACB0\uACFC\uB97C \uD45C\uB85C \uCD9C\uB825)
`;
function systemLang() {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
  const loc = /^(C|POSIX)?(\.|$)/i.test(env) ? Intl.DateTimeFormat().resolvedOptions().locale : env;
  return /^ko/i.test(loc) ? "ko" : "en";
}
async function main(argv) {
  const { cmd, opts } = args(argv);
  const lang = opts.lang ?? process.env.VERIFYLENS_LANG ?? systemLang();
  if (lang === "en" || lang === "ko") setLang(lang);
  if (cmd === "extract") {
    if (!opts["pr-body"]) throw new Error(L("--pr-body \uD30C\uC77C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", "--pr-body <file> is required."));
    process.stdout.write(extractFromPrBody(readFileSync4(opts["pr-body"], "utf8")));
    return;
  }
  if (cmd === "ci") {
    const { runCi: runCi2 } = await Promise.resolve().then(() => (init_ci(), ci_exports));
    let input;
    if (opts.hook && !process.stdin.isTTY) {
      try {
        input = readFileSync4(0, "utf8");
      } catch {
        input = void 0;
      }
    }
    process.exitCode = runCi2(opts, input);
    return;
  }
  if (cmd === "check" || cmd === "demo" || cmd === "report") {
    let repo, base2, a, b, reqFile, ja, jb;
    let pr;
    if (cmd === "report") {
      repo = resolve2(opts.repo ?? ".");
      base2 = opts.base ?? "main";
      a = opts.a ?? opts.head;
      b = opts.b;
      reqFile = opts.requirements;
      ja = opts["junit-a"];
      jb = opts["junit-b"];
      if (!a || !reqFile) throw new Error(L("--a(\uB610\uB294 --head) \uC640 --requirements \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.", "--a (or --head) and --requirements are required."));
    } else {
      const env = buildSampleRepo();
      repo = env.repo;
      base2 = "main";
      a = "feature/lockout-a";
      b = "feature/lockout-b";
      reqFile = env.reqFile;
      ja = env.junitA;
      jb = env.junitB;
      pr = env.prFile;
    }
    const reqs = parseRequirements(readFileSync4(reqFile, "utf8"));
    if (!reqs.length) throw new Error(L('\uC694\uAD6C\uC0AC\uD56D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. "- R1: \uBB38\uC7A5" \uD615\uC2DD\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694.', 'No requirements could be read. Each line must look like "- R1: sentence".'));
    const sets = [analyzeResult({ key: "A", repo, base: base2, ref: a, junit: ja })];
    if (b) sets.push(analyzeResult({ key: "B", repo, base: base2, ref: b, junit: jb }));
    const report = evaluate(sets, reqs, repo, base2);
    if (cmd === "check") {
      for (const s of report.summaries) {
        console.log(`${s.req.id} ${s.req.text}
  \u2192 ${s.overall} \xB7 \uAD00\uACC4 ${s.relation.kind} ${s.relation.detail}`);
        for (const set of report.sets) {
          const rr = set.perReq[s.req.id];
          const u = rr.evidence.unit;
          console.log(`  ${set.key}: \uADFC\uAC70 ${rr.evidence.status}(${rr.evidence.score}) ${u ? `${u.file}:${u.startLine} [${u.kind}] ${u.cond?.expr ?? u.text}` : "-"} \xB7 \uAC80\uC0AC ${rr.testStatus}${rr.evidence.boundary ? ` \xB7 \uACBD\uACC4 ${JSON.stringify(rr.evidence.boundary)}` : ""}`);
        }
        for (const n of s.notes) console.log(`  ! ${n}`);
      }
      for (const set of report.sets) console.log(`${set.key} dyn:`, set.dyn.map((d) => `${d.file}:${d.line} ${d.text}`).join(" | "));
      return;
    }
    const { writeOutputs: writeOutputs2 } = await Promise.resolve().then(() => (init_output(), output_exports));
    const out = resolve2(opts.out ?? (cmd === "demo" ? "out" : "verifylens-out"));
    mkdirSync2(out, { recursive: true });
    const files = writeOutputs2(report, out, pr, cmd === "demo" && lang !== "en");
    console.log(L("\uB9AC\uD3EC\uD2B8\uB97C \uB9CC\uB4E4\uC5C8\uC2B5\uB2C8\uB2E4 (\uCF54\uB4DC\uB294 \uC774 PC \uBC16\uC73C\uB85C \uB098\uAC00\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4):", "Report written (your code did not leave this machine):"));
    for (const f of files) console.log("  " + f);
    if (opts.open) {
      const page = files.find((f) => f.endsWith(cmd === "demo" && lang !== "en" ? "concept.html" : "report.html"));
      if (page) openInBrowser(page);
    }
    if (cmd === "demo") {
      console.log(L("\n\uC0D8\uD50C \uC800\uC7A5\uC18C\uC640 \uAC80\uC0AC \uACB0\uACFC\uB294 report \uBA85\uB839 \uC5F0\uC2B5\uC6A9\uC73C\uB85C \uB0A8\uACA8 \uB450\uC5C8\uC2B5\uB2C8\uB2E4:", "\nThe sample repository and test results are kept so you can try the report command:"));
      console.log(`  node src/cli.ts report --repo "${repo}" --base main --a ${a} --b ${b} --requirements "${reqFile}" --junit-a "${ja}" --junit-b "${jb}"`);
    }
    return;
  }
  const viaNpx = /dist[\\/]cli\.mjs$/.test(process.argv[1] ?? "");
  console.log(L(HELP, HELP_EN).replaceAll("node src/cli.ts", viaNpx ? "npx -y github:DamunKorea/verifylens" : "node src/cli.ts"));
}
main(process.argv.slice(2)).catch((e) => {
  console.error(L("\uC624\uB958:", "Error:"), e instanceof Error ? e.message : e);
  process.exit(1);
});
export {
  main
};

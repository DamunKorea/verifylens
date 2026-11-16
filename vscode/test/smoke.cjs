// 번들(dist/extension.js)을 가짜 vscode API 위에서 실제로 켜고 명령을 돌려 보는 연기 시험.
// 진짜 VS Code 화면은 아니지만, 활성화 · 명령 · 트리 · 웹뷰 · 코드렌즈 · 가상 문서 연결이 실제 코드로 도는지 본다.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

const ext = path.join(__dirname, '..');
const log = { errors: [], warnings: [], infos: [], opened: [], shown: [], posted: [], exec: [], diffs: [], clipboard: [], decorations: 0 };
let answers = { warning: undefined, quickPick: [], input: '' };
const reg = { commands: {}, tree: null, view: null, lens: null, content: {}, panel: null, status: null, diags: null };
const config = { nodePath: process.execPath, requirementsFile: '.verifylens/requirements.md', baseBranch: '', junitPath: '' };
const disp = { dispose() {} };

class EventEmitter {
  constructor() { this.l = []; this.event = (f) => { this.l.push(f); return disp; }; }
  fire(x) { for (const f of this.l) f(x); }
}
class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
class Range { constructor(a, b, c, d) { if (typeof a === 'object') { this.start = a; this.end = b; } else { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } } }
class Position { constructor(l, c) { this.line = l; this.character = c; } }
const Uri = {
  file: (p) => ({ scheme: 'file', fsPath: path.resolve(p), path: '/' + path.resolve(p).replace(/\\/g, '/'), query: '', toString() { return 'file://' + this.path; } }),
  from: (o) => ({ scheme: o.scheme, path: o.path, query: o.query || '', fsPath: o.path, toString() { return `${o.scheme}:${o.path}?${o.query}`; } }),
};
const editorFor = (document) => ({ document, decos: [], setDecorations(_t, opts) { log.decorations++; this.decos.push(...opts); }, revealRange() {} });

const vscode = {
  EventEmitter, TreeItem, Range, Position, Uri,
  Selection: class { constructor(a, b) { this.anchor = a; this.active = b; } },
  CodeLens: class { constructor(range, command) { this.range = range; this.command = command; } },
  ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  MarkdownString: class { constructor(v) { this.value = v; } appendMarkdown(t) { this.value += t; return this; } },
  Hover: class { constructor(contents) { this.contents = contents; } },
  Diagnostic: class { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ViewColumn: { One: 1, Beside: -2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15 },
  OverviewRulerLane: { Right: 4 },
  TextEditorRevealType: { InCenter: 2 },
  window: {
    visibleTextEditors: [],
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createTextEditorDecorationType: () => ({ dispose() {} }),
    createStatusBarItem: () => (reg.status = { text: '', show() { this.visible = true; }, dispose() {} }),
    createTreeView: (_id, o) => { reg.tree = o.treeDataProvider; return (reg.view = { dispose() {} }); },
    showInputBox: async () => answers.input,
    withProgress: async (_o, fn) => fn(),
    createWebviewPanel: (_id, title) => (reg.panel = {
      title,
      webview: { html: '', cspSource: 'vscode-webview:', onDidReceiveMessage(f) { this.recv = f; return disp; }, postMessage(m) { log.posted.push(m); return Promise.resolve(true); } },
      onDidDispose() { return disp; }, reveal() {}, dispose() {},
    }),
    showErrorMessage: async (m) => { log.errors.push(m); },
    showWarningMessage: async (m) => { log.warnings.push(m); return answers.warning; },
    showInformationMessage: async (m) => { log.infos.push(m); },
    showQuickPick: async (items) => { const want = answers.quickPick.shift(); const hit = items.find((i) => (i.label ?? i) === want); assert.ok(hit, `quick pick offers ${want}`); return hit; },
    showTextDocument: async (docOrUri) => {
      const doc = docOrUri.getText ? docOrUri : await vscode.workspace.openTextDocument(docOrUri);
      log.shown.push(doc.uri);
      return editorFor(doc);
    },
    onDidChangeVisibleTextEditors: () => disp,
  },
  workspace: {
    isTrusted: true,
    workspaceFolders: [],
    getConfiguration: () => ({ get: (k) => config[k] }),
    onDidChangeConfiguration: () => disp,
    registerTextDocumentContentProvider: (scheme, p) => { reg.content[scheme] = p; return disp; },
    openTextDocument: async (uri) => {
      log.opened.push(uri);
      const text = uri.scheme === 'file' ? fs.readFileSync(uri.fsPath, 'utf8') : reg.content[uri.scheme].provideTextDocumentContent(uri);
      const lines = text.split('\n');
      return { uri, getText: () => text, lineCount: lines.length, lineAt: (i) => ({ range: { end: new Position(i, lines[i].length) } }) };
    },
  },
  env: { clipboard: { writeText: async (t) => { log.clipboard.push(t); }, readText: async () => answers.clipboard || '' } },
  languages: {
    registerCodeLensProvider: (_s, p) => { reg.lens = p; return disp; },
    registerHoverProvider: (_s, p) => { reg.hover = p; return disp; },
    createDiagnosticCollection: () => (reg.diags = { map: new Map(), clear() { this.map.clear(); }, set(uri, list) { this.map.set(uri.toString(), list); }, dispose() {} }),
  },
  commands: {
    registerCommand: (id, f) => { reg.commands[id] = f; return disp; },
    executeCommand: async (id, ...a) => { log.exec.push(id); if (id === 'vscode.diff') log.diffs.push(a); return reg.commands[id] ? reg.commands[id](...a) : undefined; },
  },
};

const load = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? vscode : load.call(this, req, ...rest); };

(async () => {
  const mod = require(path.join(ext, 'dist', 'extension.js'));
  const store = new Map();
  const ctx = { subscriptions: [], asAbsolutePath: (p) => path.join(ext, p), workspaceState: { get: (k, d) => (store.has(k) ? store.get(k) : d), update: async (k, v) => { store.set(k, v); } } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  mod.activate(ctx);
  for (const id of ['verifylens.runDemo', 'verifylens.checkBranch', 'verifylens.compareBranches', 'verifylens.openReport', 'verifylens.createRequirements', 'verifylens.rerun', 'verifylens.focusRequirement', 'verifylens.openLocation', 'verifylens.openDiff', 'verifylens.recordJudgment', 'verifylens.copySummary', 'verifylens.importRequirements'])
    assert.ok(reg.commands[id], `registered ${id}`);
  assert.deepEqual(reg.tree.getChildren(), [], 'empty tree before a run (welcome view shows)');

  // 1) 데모
  await reg.commands['verifylens.runDemo']();
  assert.deepEqual(log.errors, [], 'no errors during demo');
  const roots = reg.tree.getChildren();
  assert.equal(roots.length, 3);
  const items = roots.map((n) => reg.tree.getTreeItem(n));
  assert.match(items[1].label, /^R2/);
  assert.equal(items[1].description, '다름');
  assert.match(items[1].tooltip.value, /결과 B: 6번째 시도에 동작/);
  assert.equal(items[1].collapsibleState, 2, 'R2 expanded');
  const kids = reg.tree.getChildren(roots[1]).map((n) => reg.tree.getTreeItem(n));
  assert.equal(kids.length, 2);
  assert.deepEqual(kids[1].command.arguments, ['B', 'src/auth.ts', 21]);
  assert.equal(kids[1].label, 'B  auth.ts:21');
  assert.equal(kids[1].description, '6번째 동작 · 검사 실패');
  assert.equal(reg.status.text, '$(search) VerifyLens  $(pass) 1  $(diff) 1  $(question) 1');
  assert.match(reg.status.tooltip, /다름 1/);
  assert.ok(reg.status.backgroundColor, 'warning color when something differs');
  assert.ok(reg.status.visible);
  assert.deepEqual(reg.view.badge.value, 2, 'badge: R2 and R3 need attention');
  assert.equal(reg.view.message, '요구사항 3개 중 1개만 근거와 검사로 확인됨 · 샘플 · 결과 A ↔ 결과 B (기준 main) · 판단 0/3');
  assert.ok(log.infos.some((m) => /AI는 두 결과 모두 「요구사항 전부 반영, 완료」라고 답했습니다\. 근거와 검사로 확인된 것은 3개 중 1개입니다/.test(m)), 'demo says what the AI claimed vs what was verified');
  assert.equal(reg.tree.getTreeItem(roots[2]).description, '미확인 · 검사 없음', 'the list says why R3 is not verified');
  assert.match(reg.status.tooltip, /AI 추정 없음/);
  const warn = [...reg.diags.map.entries()].find(([k]) => k.includes('/B/src/auth.ts'))[1].find((d) => d.code === 'R2');
  assert.equal(warn.severity, 1, 'B line is a warning in Problems');
  assert.match(warn.message, /^R2 · 다름 — 6번째 시도에 동작 \(요구사항 5회\) · 검사 실패/);
  const infoA = [...reg.diags.map.entries()].find(([k]) => k.includes('/A/src/auth.ts'))[1].find((d) => d.code === 'R2');
  assert.equal(infoA.severity, 2, 'A line is only information');
  assert.match(reg.panel.webview.html, /nonce="/);
  assert.match(reg.panel.title, /VerifyLens/);
  assert.ok(log.exec.includes('setContext') && log.exec.includes('verifylens.requirements.focus'));

  // 2) 트리에서 B 의 근거를 누르면 가상 문서(그 브랜치의 파일)가 열린다
  await reg.commands['verifylens.openLocation'](...kids[1].command.arguments);
  const uriB = log.opened.at(-1);
  assert.equal(uriB.scheme, 'verifylens');
  assert.equal(uriB.path, '/B/src/auth.ts');
  const docB = await vscode.workspace.openTextDocument(uriB);
  assert.match(docB.getText().split('\n')[20], /failures > 5/, 'line 21 of B is the > 5 condition');
  const lensB = reg.lens.provideCodeLenses(docB);
  const r2 = lensB.filter((l) => l.command.arguments[0] === 'R2');
  assert.equal(r2[0].range.start.line, 20);
  assert.equal(r2[0].command.title, 'VerifyLens R2 · 다름');
  assert.match(r2[0].command.tooltip, /6번째 시도에 동작 \(요구사항 5회\) · 검사 실패 · A·B 조건 다름/);
  assert.deepEqual(r2.map((l) => l.command.command), ['verifylens.focusRequirement', 'verifylens.openDiff', 'verifylens.recordJudgment']);
  // 줄 끝 설명 · 마우스 올리면 근거: 보이는 에디터에 표시를 붙인다
  const edB = editorFor(docB);
  vscode.window.visibleTextEditors = [edB];
  await reg.commands['verifylens.rerun']();
  const noteB = edB.decos.find((d) => d.renderOptions && /R2/.test(d.renderOptions.after.contentText));
  assert.equal(noteB.renderOptions.after.contentText, '← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사 실패 · A와 조건 다름');
  assert.equal(noteB.range.start.line, 20);
  assert.ok(noteB.range.start.character > 10, 'note sits at the end of the line');
  const hov = reg.hover.provideHover(docB, new Position(20, 5)).contents[0];
  assert.match(hov.value, /\| B \| `auth\.ts:21` `user\.failures > 5` \| 6번째/);
  assert.deepEqual(hov.isTrusted.enabledCommands.length, 3);
  assert.equal(reg.hover.provideHover(docB, new Position(2, 0)), undefined, 'no hover on unrelated lines');
  vscode.window.visibleTextEditors = [];
  // 나란히 비교: VS Code 기본 비교 화면에 A 와 B 를 넘긴다
  await reg.commands['verifylens.openDiff']('R2');
  const [dl, dr, dtitle, dopts] = log.diffs.at(-1);
  assert.deepEqual([dl.path, dr.path, dtitle], ['/A/src/auth.ts', '/B/src/auth.ts', 'R2 · A ↔ B · auth.ts']);
  assert.equal(dopts.selection.start.line, 20);
  // 판단 기록: 목록에 표시되고 리포트에도 전해진다
  answers = { warning: undefined, quickPick: ['수정'], input: 'B 조건 고치기' };
  await reg.commands['verifylens.recordJudgment'](reg.tree.getChildren()[1]);
  assert.equal(reg.tree.getTreeItem(reg.tree.getChildren()[1]).description, '다름 → 수정');
  assert.match(reg.tree.getTreeItem(reg.tree.getChildren()[1]).tooltip.value, /사람의 판단: 수정\*\* — B 조건 고치기/);
  assert.match(reg.view.message, /판단 1\/3$/);
  assert.deepEqual(log.posted.at(-1), { type: 'judgments', state: { R2: { judge: '수정', note: 'B 조건 고치기' } } });
  await reg.panel.webview.recv({ type: 'judge', id: 'R3', judge: '추가 검증', note: '' });
  assert.equal(reg.tree.getTreeItem(reg.tree.getChildren()[2]).description, '미확인 · 검사 없음 → 추가 검증');
  // PR 요약 복사: 기록한 판단이 들어가고, 판단이 다 있으면 미검토 경고가 없다
  const sum = await reg.commands['verifylens.copySummary']();
  assert.equal(log.clipboard.at(-1), sum);
  assert.match(sum, /^## VerifyLens 검증 요약\n\n\*\*요구사항 3개 중 1개만 근거와 검사로 확인됨\*\*/);
  assert.match(sum, /\*\*수정\*\* — B 조건 고치기 \|/);
  assert.match(sum, /\| \*\*추가 검증\*\* \|/);
  assert.match(log.infos.at(-1), /검증 요약을 복사했습니다\. PR 설명이나 댓글에 붙여 넣으세요/);
  const n = log.clipboard.length;
  assert.equal(await reg.commands['verifylens.copySummary']({ dryRun: true }), sum, 'dry run returns the same text');
  assert.equal(log.clipboard.length, n, 'and does not touch the clipboard');
  await reg.panel.webview.recv({ type: 'copy' });
  await sleep(20);
  assert.equal(log.clipboard.length, n + 1, 'report button copies too');
  await reg.panel.webview.recv({ type: 'diff', id: 'R2' });
  assert.equal(log.diffs.length, 2, 'report button opens the diff too');

  // 3) 리포트에서 코드 줄을 누른 것처럼 메시지를 보내면 A 파일로 간다
  await reg.panel.webview.recv({ type: 'open', set: 'A', file: 'src/auth.ts', line: 17 });
  assert.equal(log.opened.at(-1).path, '/A/src/auth.ts');
  await reg.commands['verifylens.focusRequirement']('R3');
  assert.deepEqual(log.posted.at(-1), { type: 'select', id: 'R3' });
  await reg.commands['verifylens.rerun']();
  assert.match(reg.panel.webview.html, /"R2":\{"judge":"수정"/, 'after a re-run the report still carries the stored decision');
  assert.match(reg.panel.webview.html, /"focus":"R3"/, 'and stays on the requirement you were looking at');
  assert.equal(reg.tree.getTreeItem(reg.tree.getChildren()[1]).description, '다름 → 수정');

  // 4) 실제 저장소 흐름: 요구사항 파일이 없으면 만들고, 다시 실행하면 지금 브랜치를 확인한다
  const repo = new URLSearchParams(uriB.query).get('repo');
  execFileSync('git', ['-C', repo, 'checkout', '-q', 'feature/lockout-b']);
  vscode.workspace.workspaceFolders = [{ uri: Uri.file(repo) }];
  answers = { warning: '요구사항 파일 만들기', quickPick: ['main'] };
  await reg.commands['verifylens.checkBranch']();
  const reqFile = path.join(repo, '.verifylens', 'requirements.md');
  assert.ok(fs.existsSync(reqFile), 'template created');
  assert.ok(log.warnings.some((w) => /요구사항 파일/.test(w)));
  answers = { warning: undefined, quickPick: ['main'] };
  await reg.commands['verifylens.checkBranch']();
  assert.deepEqual(log.errors, [], 'no errors on branch check');
  const rows = reg.tree.getChildren().map((n) => reg.tree.getTreeItem(n));
  assert.equal(rows.length, 2, 'template has R1, R2');
  assert.equal(rows[1].description, '다름');
  // 지금 체크아웃된 브랜치라서 실제 파일로 열리고, 실제 파일에도 렌즈가 붙는다
  const real = await vscode.workspace.openTextDocument(Uri.file(path.join(repo, 'src', 'auth.ts')));
  const lensReal = reg.lens.provideCodeLenses(real);
  assert.ok(lensReal.some((l) => /R2 · 다름/.test(l.command.title)), 'lens on the real working-tree file');
  const kid = reg.tree.getChildren(reg.tree.getChildren()[1]).map((n) => reg.tree.getTreeItem(n))[0];
  await reg.commands['verifylens.openLocation'](...kid.command.arguments);
  assert.equal(log.opened.at(-1).scheme, 'file');
  assert.ok(log.warnings.some((w) => /미실행/.test(w)), 'warns that tests were not given');

  assert.equal(reg.view.message, '요구사항 2개 중 0개만 근거와 검사로 확인됨 · feature/lockout-b ← main · 판단 0/2');
  config.summaryLanguage = 'en';
  const en = await reg.commands['verifylens.copySummary']();
  assert.match(en, /^## VerifyLens verification summary/);
  assert.match(log.infos.at(-1), /판단을 기록하지 않은 항목 2개는 「미검토」로 들어갔습니다/);
  config.summaryLanguage = 'ko';
  // 한 브랜치만 볼 때의 비교는 기준(main) ↔ 지금 파일
  await reg.commands['verifylens.openDiff']('R2');
  assert.deepEqual([log.diffs.at(-1)[0].path, log.diffs.at(-1)[1].scheme], ['/base/src/auth.ts', 'file']);

  // 5) 다시 분석
  await reg.commands['verifylens.rerun']();
  assert.deepEqual(log.errors, []);

  // 5-1) 고쳐서 커밋하면 스스로 다시 분석한다
  const authFile = path.join(repo, 'src', 'auth.ts');
  fs.writeFileSync(authFile, fs.readFileSync(authFile, 'utf8').replace('user.failures > 5', 'user.failures >= 5'));
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-am', 'fix lockout']);
  let auto = '';
  for (let i = 0; i < 60 && !/^미확인/.test(auto); i++) { await sleep(150); auto = reg.tree.getTreeItem(reg.tree.getChildren()[1]).description; }
  assert.equal(auto, '미확인 · 검사 없음', 'after the fix R2 is no longer 다름 (no test report here, so 미확인)');
  assert.equal(reg.status.backgroundColor, undefined, 'warning color cleared');
  assert.deepEqual(log.errors, []);

  // 5-2) 복사한 이슈 글에서 요구사항 가져오기: 있던 것 뒤에 붙고, 파일이 바뀌면 스스로 다시 분석한다
  answers = { warning: '뒤에 추가', quickPick: ['$(clippy) 복사한 글 (클립보드)'], input: '', clipboard: '## 요구사항\n- 연속 5회 실패하면 계정을 잠근다\n- 잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다\n\n## 참고\n- 스키마 변경 없음\n' };
  const imported = await reg.commands['verifylens.importRequirements']();
  assert.deepEqual(log.errors, []);
  assert.match(imported, /# ↓ 복사한 글에서 추가\n- R3: 잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다\n$/, 'the one that was already there is not added twice');
  assert.equal(fs.readFileSync(reqFile, 'utf8'), imported);
  assert.equal(log.opened.at(-1).fsPath, path.resolve(reqFile), 'the file is opened for the author to read');
  assert.match(log.infos.at(-1), /복사한 글에서 요구사항 1개를 가져왔습니다/);
  let n3 = 0;
  for (let i = 0; i < 60 && n3 !== 3; i++) { await sleep(150); n3 = reg.tree.getChildren().length; }
  assert.equal(n3, 3, 'the list picked up R3 by itself');
  assert.equal(reg.tree.getTreeItem(reg.tree.getChildren()[2]).description, '미확인 · 검사 없음');
  answers = { warning: undefined, quickPick: ['$(clippy) 복사한 글 (클립보드)'], input: '', clipboard: '회의록: 다음 주에 다시 봅니다' };
  assert.equal(await reg.commands['verifylens.importRequirements'](), undefined);
  assert.match(log.warnings.at(-1), /요구사항으로 볼 문장을 찾지 못했습니다/);
  assert.match(await reg.commands['verifylens.importRequirements']({ dryRun: true, text: '- 가나다라마바\n- 사아자차카타\n' }), /- R1: 가나다라마바\n- R2: 사아자차카타\n$/);

  // 6) 제한 모드: 브랜치 확인은 신뢰를 요청하고 멈추며, 샘플은 그대로 된다
  vscode.workspace.isTrusted = false;
  const before = log.exec.length;
  answers = { warning: undefined, quickPick: [] };
  await reg.commands['verifylens.checkBranch']();
  await reg.commands['verifylens.compareBranches']();
  await reg.commands['verifylens.createRequirements']();
  await reg.commands['verifylens.importRequirements']();
  assert.ok(log.warnings.filter((w) => /제한 모드/.test(w)).length >= 4, 'asks for trust');
  answers = { warning: '이 폴더 신뢰하기', quickPick: [] };
  await reg.commands['verifylens.checkBranch']();
  assert.ok(log.exec.slice(before).includes('workbench.trust.manage'), 'opens trust dialog');
  await reg.commands['verifylens.runDemo']();
  assert.deepEqual(log.errors, [], 'demo still works in restricted mode');
  assert.match(reg.status.text, /\$\(diff\) 1/);
  mod.deactivate();
  console.log('smoke OK —', reg.status.text);
})().catch((e) => {
  console.error('smoke FAILED:', e);
  process.exit(1);
});

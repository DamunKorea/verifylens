import * as vscode from 'vscode';
import * as path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as M from './model.ts';
import { showFile } from '../../src/git.ts';
import type { Overall } from '../../src/types.ts';

const SCHEME = 'verifylens';
let run: M.Run | undefined;
let again: (() => M.Run) | undefined;
let panel: vscode.WebviewPanel | undefined;
let out: vscode.OutputChannel;

const ICON: Record<Overall, [string, string]> = {
  확인됨: ['pass', 'testing.iconPassed'],
  다름: ['diff', 'list.warningForeground'],
  실패: ['error', 'testing.iconFailed'],
  미확인: ['question', 'disabledForeground'],
};
const SET_COLOR: Record<string, string> = { A: 'charts.blue', B: 'charts.purple' };

// ---------------------------------------------------------------- 옆 패널: 요구사항 목록
type Node = { kind: 'req'; row: M.ReqRow } | { kind: 'ev'; row: M.EvidenceRow; reqId: string };

class ReqTree implements vscode.TreeDataProvider<Node> {
  private ch = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.ch.event;
  refresh() {
    this.ch.fire(undefined);
  }
  getChildren(n?: Node): Node[] {
    if (!run) return [];
    if (!n) return M.treeModel(run.report).map((row) => ({ kind: 'req', row }));
    if (n.kind === 'req') return n.row.children.map((row) => ({ kind: 'ev', row, reqId: n.row.id }));
    return [];
  }
  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === 'req') {
      const r = n.row;
      const open = r.overall === '다름' || r.overall === '실패';
      const it = new vscode.TreeItem(`${r.id}  ${r.text}`, open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      it.description = `${r.overall} · ${r.summary}`;
      it.tooltip = new vscode.MarkdownString(`**${r.id} · ${r.overall}**\n\n${r.text}\n\n${r.summary}`);
      it.iconPath = new vscode.ThemeIcon(ICON[r.overall][0], new vscode.ThemeColor(ICON[r.overall][1]));
      it.command = { command: 'verifylens.focusRequirement', title: '리포트에서 보기', arguments: [r.id] };
      it.contextValue = 'requirement';
      return it;
    }
    const e = n.row;
    const it = new vscode.TreeItem(e.label, vscode.TreeItemCollapsibleState.None);
    it.description = e.detail;
    it.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(SET_COLOR[e.setKey] ?? 'foreground'));
    if (e.file && e.line) {
      it.command = { command: 'verifylens.openLocation', title: '코드로 이동', arguments: [e.setKey, e.file, e.line] };
      it.tooltip = `${e.label} · ${e.file}:${e.line} — 눌러서 코드로 이동`;
    }
    return it;
  }
}

// ---------------------------------------------------------------- 문서 ↔ 결과 연결
/** 이 문서가 어느 결과의 어느 파일인지. verifylens: 가상 문서이거나, 지금 체크아웃된 브랜치의 실제 파일. */
function target(doc: vscode.TextDocument): { setKey: string; file: string } | null {
  if (!run) return null;
  if (doc.uri.scheme === SCHEME) {
    const [, key, ...rest] = doc.uri.path.split('/');
    return { setKey: key, file: rest.join('/') };
  }
  if (doc.uri.scheme !== 'file' || run.kind !== 'repo' || !run.workingRef) return null;
  const set = run.report.sets.find((s) => s.ref === run!.workingRef);
  if (!set) return null;
  const rel = path.relative(path.resolve(run.repo), doc.uri.fsPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return { setKey: set.key, file: rel.split(path.sep).join('/') };
}

function locationUri(setKey: string, file: string): vscode.Uri {
  const set = run!.report.sets.find((s) => s.key === setKey)!;
  const real = path.join(run!.repo, file);
  if (run!.kind === 'repo' && run!.workingRef === set.ref && existsSync(real)) return vscode.Uri.file(real);
  const query = new URLSearchParams({ repo: run!.repo, ref: set.ref }).toString();
  return vscode.Uri.from({ scheme: SCHEME, path: `/${setKey}/${file}`, query });
}

class Lenses implements vscode.CodeLensProvider {
  private ch = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.ch.event;
  refresh() {
    this.ch.fire();
  }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const t = target(doc);
    if (!t || !run) return [];
    return M.lensesFor(run.report, t.setKey, t.file).map(
      (l) => new vscode.CodeLens(new vscode.Range(l.line - 1, 0, l.line - 1, 0), { title: l.title, command: 'verifylens.focusRequirement', arguments: [l.reqId] }),
    );
  }
}

const DECO: Record<Overall, vscode.TextEditorDecorationType> = {} as never;
function makeDecorations(ctx: vscode.ExtensionContext) {
  const spec: Record<Overall, [string, string]> = {
    확인됨: ['rgba(52,211,153,0.10)', 'rgba(52,211,153,0.8)'],
    다름: ['rgba(251,191,36,0.18)', 'rgba(251,191,36,0.9)'],
    실패: ['rgba(248,113,113,0.16)', 'rgba(248,113,113,0.9)'],
    미확인: ['rgba(148,163,184,0.12)', 'rgba(148,163,184,0.8)'],
  };
  for (const k of Object.keys(spec) as Overall[]) {
    DECO[k] = vscode.window.createTextEditorDecorationType({ isWholeLine: true, backgroundColor: spec[k][0], overviewRulerColor: spec[k][1], overviewRulerLane: vscode.OverviewRulerLane.Right });
    ctx.subscriptions.push(DECO[k]);
  }
}
function decorate(editors: readonly vscode.TextEditor[]) {
  for (const ed of editors) {
    const t = target(ed.document);
    const lenses = t && run ? M.lensesFor(run.report, t.setKey, t.file) : [];
    for (const k of Object.keys(DECO) as Overall[]) {
      ed.setDecorations(
        DECO[k],
        lenses.filter((l) => l.overall === k).map((l) => new vscode.Range(l.line - 1, 0, l.endLine - 1, 0)),
      );
    }
  }
}

// ---------------------------------------------------------------- 리포트 웹뷰
function showReport(focusId?: string) {
  if (!run) return;
  if (!panel) {
    panel = vscode.window.createWebviewPanel('verifylens.report', 'VerifyLens 리포트', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage((m: { type: string; set: string; file: string; line: number }) => {
      if (m?.type === 'open') void openLocation(m.set, m.file, m.line);
    });
    renderPanel();
  } else panel.reveal(undefined, true);
  if (focusId) void panel.webview.postMessage({ type: 'select', id: focusId });
}
function renderPanel() {
  if (!panel || !run) return;
  panel.webview.html = M.webviewHtml(run.report, randomBytes(16).toString('base64'), panel.webview.cspSource);
}

async function openLocation(setKey: string, file: string, line: number) {
  if (!run) return;
  try {
    const doc = await vscode.workspace.openTextDocument(locationUri(setKey, file));
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: true, selection: new vscode.Selection(pos, pos) });
    ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } catch (e) {
    fail(e);
  }
}

// ---------------------------------------------------------------- 실행
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  out.appendLine(`[오류] ${e instanceof Error && e.stack ? e.stack : msg}`);
  void vscode.window.showErrorMessage(`VerifyLens: ${msg}`);
}

async function execute(title: string, job: () => M.Run, ui: { tree: ReqTree; lenses: Lenses; status: vscode.StatusBarItem }) {
  try {
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `VerifyLens: ${title}` }, async () => {
      await new Promise((res) => setTimeout(res, 30)); // 알림이 먼저 그려지게
      return job();
    });
    run = r;
    again = job;
    await vscode.commands.executeCommand('setContext', 'verifylens.hasRun', true);
    ui.tree.refresh();
    ui.lenses.refresh();
    decorate(vscode.window.visibleTextEditors);
    ui.status.text = `$(verified) ${M.statusText(r.report)}`;
    ui.status.tooltip = 'VerifyLens 리포트 열기';
    ui.status.show();
    renderPanel();
    showReport();
    void vscode.commands.executeCommand('verifylens.requirements.focus');
    for (const n of r.notes) void vscode.window.showWarningMessage(`VerifyLens: ${n}`);
    out.appendLine(`[${new Date().toLocaleTimeString()}] ${title} → ${M.statusText(r.report)}`);
  } catch (e) {
    fail(e);
  }
}

/** 제한 모드(신뢰하지 않은 폴더)에서는 저장소를 읽지 않는다. 신뢰하라고 안내하고 true 를 돌려준다. */
async function needTrust(): Promise<boolean> {
  if (vscode.workspace.isTrusted) return false;
  const pick = await vscode.window.showWarningMessage('VerifyLens: 이 폴더는 아직 신뢰하지 않은 상태(제한 모드)입니다. 내 브랜치를 확인하려면 폴더를 신뢰해야 합니다. 샘플은 지금도 해 볼 수 있습니다.', '이 폴더 신뢰하기');
  if (pick) await vscode.commands.executeCommand('workbench.trust.manage');
  return true;
}

async function pickRepo(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const roots = [...new Set(folders.map((f) => M.gitRoot(f.uri.fsPath)).filter((x): x is string => !!x))];
  if (!roots.length) {
    void vscode.window.showWarningMessage('VerifyLens: 열린 폴더에서 git 저장소를 찾지 못했습니다. 저장소 폴더를 연 뒤 다시 실행하세요.');
    return undefined;
  }
  if (roots.length === 1) return roots[0];
  return vscode.window.showQuickPick(roots, { placeHolder: '어느 저장소를 확인할까요?' });
}

async function pickBase(repo: string, current: string): Promise<string | undefined> {
  const fixed = vscode.workspace.getConfiguration('verifylens').get<string>('baseBranch')?.trim();
  if (fixed) return fixed;
  const items = M.orderBases(M.localBranches(repo), current);
  if (!items.length) {
    void vscode.window.showWarningMessage('VerifyLens: 비교할 기준 브랜치가 없습니다. main 같은 브랜치가 있어야 합니다.');
    return undefined;
  }
  return vscode.window.showQuickPick(items, { placeHolder: `무엇과 비교할까요? (지금 브랜치: ${current})` });
}

function reqPath(repo: string) {
  const rel = vscode.workspace.getConfiguration('verifylens').get<string>('requirementsFile') || '.verifylens/requirements.md';
  return path.join(repo, rel);
}

async function ensureReqs(repo: string): Promise<string | undefined> {
  const file = reqPath(repo);
  if (existsSync(file)) return file;
  const pick = await vscode.window.showWarningMessage(`VerifyLens: 요구사항 파일(${path.relative(repo, file)})이 없습니다. 이번 작업의 요구사항을 적어야 확인할 수 있습니다.`, '요구사항 파일 만들기');
  if (pick) await createReqs(repo);
  return undefined;
}

async function createReqs(repo?: string) {
  repo = repo ?? (await pickRepo());
  if (!repo) return;
  const file = reqPath(repo);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, M.REQ_TEMPLATE, 'utf8');
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
  void vscode.window.showInformationMessage('VerifyLens: 요구사항을 적고 저장한 뒤 「Check current branch」를 실행하세요.');
}

function junitFor(repo: string): string | undefined {
  const rel = vscode.workspace.getConfiguration('verifylens').get<string>('junitPath')?.trim();
  return rel ? path.join(repo, rel) : undefined;
}

// ---------------------------------------------------------------- 시작
export function activate(ctx: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel('VerifyLens');
  makeDecorations(ctx);
  const tree = new ReqTree();
  const lenses = new Lenses();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'verifylens.openReport';
  const ui = { tree, lenses, status };

  ctx.subscriptions.push(
    out,
    status,
    vscode.window.registerTreeDataProvider('verifylens.requirements', tree),
    vscode.languages.registerCodeLensProvider([{ scheme: 'file' }, { scheme: SCHEME }], lenses),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      provideTextDocumentContent(uri) {
        const q = new URLSearchParams(uri.query);
        const file = uri.path.split('/').slice(2).join('/');
        return showFile(q.get('repo') ?? '', q.get('ref') ?? '', file) ?? `// ${file} 은(는) 이 결과에 없습니다.`;
      },
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => decorate(eds)),

    vscode.commands.registerCommand('verifylens.runDemo', () => {
      const cfg = vscode.workspace.getConfiguration('verifylens').get<string>('nodePath') || 'node';
      const node = M.nodeSupportsTs(cfg) ? cfg : null;
      const sampleDir = ctx.asAbsolutePath(path.join('samples', 'login-lockout'));
      const fallbackJunit = { a: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-a.xml')), b: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-b.xml')) };
      return execute('샘플(로그인 잠금 가상 사례) 분석', () => M.runDemo({ sampleDir, node, fallbackJunit }), ui);
    }),

    vscode.commands.registerCommand('verifylens.checkBranch', async () => {
      if (await needTrust()) return;
      const repo = await pickRepo();
      if (!repo) return;
      const current = M.currentBranch(repo);
      if (current === 'HEAD') return void vscode.window.showWarningMessage('VerifyLens: 브랜치에 있지 않습니다(detached HEAD). 브랜치를 체크아웃한 뒤 실행하세요.');
      const base = await pickBase(repo, current);
      if (!base) return;
      const reqFile = await ensureReqs(repo);
      if (!reqFile) return;
      const junitA = junitFor(repo);
      return execute(`${current} 확인 (기준 ${base})`, () => M.runRepo({ repo, base, a: current, reqFile, junitA, workingRef: current }), ui);
    }),

    vscode.commands.registerCommand('verifylens.compareBranches', async () => {
      if (await needTrust()) return;
      const repo = await pickRepo();
      if (!repo) return;
      const current = M.currentBranch(repo);
      const branches = M.localBranches(repo);
      const base = await pickBase(repo, current);
      if (!base) return;
      const others = branches.filter((b) => b !== base);
      if (others.length < 2) return void vscode.window.showWarningMessage('VerifyLens: 비교하려면 기준 말고 브랜치가 두 개 있어야 합니다.');
      const a = await vscode.window.showQuickPick(others, { placeHolder: '결과 A 브랜치' });
      if (!a) return;
      const b = await vscode.window.showQuickPick(others.filter((x) => x !== a), { placeHolder: '결과 B 브랜치' });
      if (!b) return;
      const reqFile = await ensureReqs(repo);
      if (!reqFile) return;
      return execute(`${a} ↔ ${b} 비교 (기준 ${base})`, () => M.runRepo({ repo, base, a, b, reqFile, workingRef: current }), ui);
    }),

    vscode.commands.registerCommand('verifylens.rerun', async () => {
      if (!again || run?.kind === 'repo') if (await needTrust()) return;
      return again ? execute('다시 분석', again, ui) : vscode.commands.executeCommand('verifylens.checkBranch');
    }),
    vscode.commands.registerCommand('verifylens.openReport', () => (run ? showReport() : vscode.window.showInformationMessage('VerifyLens: 먼저 분석을 실행하세요.'))),
    vscode.commands.registerCommand('verifylens.createRequirements', async () => {
      if (await needTrust()) return;
      return createReqs();
    }),
    vscode.commands.registerCommand('verifylens.focusRequirement', (id: string) => showReport(id)),
    vscode.commands.registerCommand('verifylens.openLocation', (setKey: string, file: string, line: number) => openLocation(setKey, file, line)),
  );
}

export function deactivate() {
  panel?.dispose();
}

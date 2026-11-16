import * as vscode from 'vscode';
import * as path from 'node:path';
import { existsSync, mkdirSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as M from './model.ts';
import { showFile } from '../../src/git.ts';
import type { Overall } from '../../src/types.ts';

const SCHEME = 'verifylens';
const JUDGE_OPTIONS = ['사용', '수정', '추가 검증', '보류'];

type RunOpts = { silent?: boolean; watch?: M.WatchSpec };
type Job = { title: string; fn: () => M.Run; watch?: M.WatchSpec };

let ctx: vscode.ExtensionContext;
let run: M.Run | undefined;
let again: Job | undefined;
let panel: vscode.WebviewPanel | undefined;
let out: vscode.OutputChannel;
let tree: ReqTree;
let view: vscode.TreeView<Node>;
let lenses: Lenses;
let status: vscode.StatusBarItem;
let diags: vscode.DiagnosticCollection;
let noteDeco: vscode.TextEditorDecorationType;
let watcher: { dispose(): void } | undefined;
let focusId: string | undefined;

const cfg = <T>(key: string, fallback: T): T => vscode.workspace.getConfiguration('verifylens').get<T>(key) ?? fallback;

const ICON: Record<Overall, [string, string]> = {
  확인됨: ['pass', 'testing.iconPassed'],
  다름: ['diff', 'list.warningForeground'],
  실패: ['error', 'testing.iconFailed'],
  미확인: ['question', 'descriptionForeground'],
};
const NOTE_COLOR: Record<Overall, string> = { 확인됨: 'testing.iconPassed', 다름: 'editorWarning.foreground', 실패: 'editorError.foreground', 미확인: 'descriptionForeground' };
const SET_COLOR: Record<string, string> = { A: 'charts.blue', B: 'charts.purple' };

// ---------------------------------------------------------------- 사람의 판단 (작업 영역에 저장)
type Stored = M.Judgment & { sig: string };
const judgeKey = () => `verifylens.judgments:${run?.kind === 'demo' ? 'demo' : (run?.repo ?? '')}`;
/** 지금 분석한 코드에 대한 판단만 돌려준다. 코드가 바뀌면(커밋) 이전 판단은 쓰지 않는다. */
function judgments(): Record<string, M.Judgment> {
  if (!run) return {};
  const sig = M.reportSig(run.report);
  const all = ctx.workspaceState.get<Record<string, Stored>>(judgeKey(), {});
  const res: Record<string, M.Judgment> = {};
  for (const [id, j] of Object.entries(all)) if (j.sig === sig) res[id] = { judge: j.judge, note: j.note };
  return res;
}
async function setJudgment(id: string, j: M.Judgment, fromWebview = false) {
  if (!run) return;
  const sig = M.reportSig(run.report);
  const all = { ...ctx.workspaceState.get<Record<string, Stored>>(judgeKey(), {}) };
  if ((!j.judge || j.judge === '미검토') && !j.note) delete all[id];
  else all[id] = { judge: j.judge || '미검토', note: j.note, sig };
  await ctx.workspaceState.update(judgeKey(), all);
  tree.refresh();
  updateViewMeta();
  if (!fromWebview && panel) void panel.webview.postMessage({ type: 'judgments', state: judgments() });
}

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
      const j = judgments()[r.id];
      const judged = j && j.judge && j.judge !== '미검토';
      const open = r.overall === '다름' || r.overall === '실패';
      const it = new vscode.TreeItem(`${r.id}  ${r.text}`, open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      it.description = judged ? `${r.overall} → ${j.judge}` : r.overall;
      const md = new vscode.MarkdownString(run ? (M.hoverMarkdown(run.report, r.id, false) ?? '') : '');
      if (judged) md.appendMarkdown(`\n\n**사람의 판단: ${j.judge}**${j.note ? ` — ${j.note}` : ''}`);
      it.tooltip = md;
      it.iconPath = new vscode.ThemeIcon(ICON[r.overall][0], new vscode.ThemeColor(ICON[r.overall][1]));
      it.command = { command: 'verifylens.focusRequirement', title: '근거 보기', arguments: [r.id] };
      it.contextValue = 'requirement';
      return it;
    }
    const e = n.row;
    const it = new vscode.TreeItem(e.label, vscode.TreeItemCollapsibleState.None);
    it.description = e.detail;
    it.tooltip = e.tooltip;
    it.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(SET_COLOR[e.setKey] ?? 'foreground'));
    if (e.file && e.line) {
      it.command = { command: 'verifylens.openLocation', title: '코드로 이동', arguments: [e.setKey, e.file, e.line] };
      it.tooltip = `${e.tooltip} — 눌러서 코드로 이동`;
    }
    return it;
  }
}

function updateViewMeta() {
  if (!run) return;
  const n = M.attentionCount(run.report);
  view.badge = n ? { value: n, tooltip: `확인이 필요한 요구사항 ${n}개` } : undefined;
  const judged = Object.values(judgments()).filter((j) => j.judge && j.judge !== '미검토').length;
  view.message = `${M.contextLine(run)} · 판단 ${judged}/${run.report.summaries.length}`;
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

function virtualUri(key: string, ref: string, file: string): vscode.Uri {
  return vscode.Uri.from({ scheme: SCHEME, path: `/${key}/${file}`, query: new URLSearchParams({ repo: run!.repo, ref }).toString() });
}
/** 결과의 파일을 여는 주소. 지금 체크아웃된 브랜치면 실제 파일(고칠 수 있음), 아니면 그 브랜치의 읽기 전용 사본. */
function locationUri(setKey: string, file: string): vscode.Uri {
  const set = run!.report.sets.find((s) => s.key === setKey)!;
  const real = path.join(run!.repo, file);
  if (run!.kind === 'repo' && run!.workingRef === set.ref && existsSync(real)) return vscode.Uri.file(real);
  return virtualUri(setKey, set.ref, file);
}

// ---------------------------------------------------------------- 에디터 안 표시: 줄 위 동작, 줄 끝 설명, 줄 번호 옆 아이콘, 마우스 올리면 근거
class Lenses implements vscode.CodeLensProvider {
  private ch = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.ch.event;
  refresh() {
    this.ch.fire();
  }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const t = target(doc);
    if (!t || !run) return [];
    const res: vscode.CodeLens[] = [];
    const two = run.report.sets.length > 1;
    for (const l of M.lensesFor(run.report, t.setKey, t.file)) {
      const at = new vscode.Range(l.line - 1, 0, l.line - 1, 0);
      res.push(new vscode.CodeLens(at, { title: `VerifyLens ${l.head}`, tooltip: l.title, command: 'verifylens.focusRequirement', arguments: [l.reqId] }));
      res.push(new vscode.CodeLens(at, { title: two ? 'A ↔ B 비교' : '기준과 비교', command: 'verifylens.openDiff', arguments: [l.reqId] }));
      res.push(new vscode.CodeLens(at, { title: '판단 기록', command: 'verifylens.recordJudgment', arguments: [l.reqId] }));
    }
    return res;
  }
}

const DECO: Record<Overall, vscode.TextEditorDecorationType> = {} as never;
function makeDecorations() {
  // 확인됨 · 미확인은 줄 번호 옆 아이콘만, 다름 · 실패는 줄 배경까지 칠해서 눈에 띄게 한다.
  const spec: Record<Overall, { slug: string; bg?: string; ruler: string }> = {
    확인됨: { slug: 'ok', ruler: 'rgba(52,211,153,0.7)' },
    다름: { slug: 'diff', bg: 'rgba(251,191,36,0.14)', ruler: 'rgba(251,191,36,0.9)' },
    실패: { slug: 'fail', bg: 'rgba(248,113,113,0.14)', ruler: 'rgba(248,113,113,0.9)' },
    미확인: { slug: 'unk', ruler: 'rgba(148,163,184,0.7)' },
  };
  for (const k of Object.keys(spec) as Overall[]) {
    DECO[k] = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: spec[k].bg,
      overviewRulerColor: spec[k].ruler,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      gutterIconPath: vscode.Uri.file(ctx.asAbsolutePath(path.join('media', `gutter-${spec[k].slug}.svg`))),
      gutterIconSize: '80%',
    });
    ctx.subscriptions.push(DECO[k]);
  }
  noteDeco = vscode.window.createTextEditorDecorationType({ after: { margin: '0 0 0 3ch', fontStyle: 'italic' } });
  ctx.subscriptions.push(noteDeco);
}

function hoverFor(reqId: string): vscode.MarkdownString | undefined {
  const text = run && M.hoverMarkdown(run.report, reqId, true);
  if (!text) return undefined;
  const md = new vscode.MarkdownString(text);
  md.isTrusted = { enabledCommands: ['verifylens.focusRequirement', 'verifylens.openDiff', 'verifylens.recordJudgment'] };
  return md;
}

function decorate(editors: readonly vscode.TextEditor[]) {
  const inline = cfg('inlineNotes', true);
  for (const ed of editors) {
    const t = target(ed.document);
    const ls = t && run ? M.lensesFor(run.report, t.setKey, t.file) : [];
    for (const k of Object.keys(DECO) as Overall[]) {
      ed.setDecorations(
        DECO[k],
        ls.filter((l) => l.overall === k).map((l) => new vscode.Range(l.line - 1, 0, l.endLine - 1, 0)),
      );
    }
    const last = ed.document.lineCount - 1;
    ed.setDecorations(
      noteDeco,
      inline
        ? ls
            .filter((l) => l.line - 1 <= last)
            .map((l) => {
              const end = ed.document.lineAt(l.line - 1).range.end;
              return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: `← ${l.head} · ${l.note}`, color: new vscode.ThemeColor(NOTE_COLOR[l.overall]) } } };
            })
        : [],
    );
  }
}

/** 문제(Problems) 목록에 올린다. F8 로 다음 항목으로 넘어갈 수 있다. 확인된 줄은 올리지 않는다. */
function publishDiagnostics() {
  diags.clear();
  if (!run || !cfg('problems', true)) return;
  const by = new Map<string, { uri: vscode.Uri; list: vscode.Diagnostic[] }>();
  for (const l of M.allLenses(run.report)) {
    if (l.severity === 'ok') continue;
    const uri = locationUri(l.setKey, l.file);
    const d = new vscode.Diagnostic(
      new vscode.Range(l.line - 1, 0, l.endLine - 1, 1000),
      `${l.head} — ${l.note} (${l.reqText})`,
      l.severity === 'warn' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information,
    );
    d.source = 'VerifyLens';
    d.code = l.reqId;
    const key = uri.toString();
    if (!by.has(key)) by.set(key, { uri, list: [] });
    by.get(key)!.list.push(d);
  }
  for (const { uri, list } of by.values()) diags.set(uri, list);
}

// ---------------------------------------------------------------- 리포트 웹뷰
function showReport(id?: string) {
  if (!run) return;
  if (id) focusId = id;
  if (!panel) {
    panel = vscode.window.createWebviewPanel('verifylens.report', 'VerifyLens 리포트', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage((m: { type: string; set: string; file: string; line: number; id: string; judge: string; note: string }) => {
      if (m?.type === 'open') void openLocation(m.set, m.file, m.line);
      else if (m?.type === 'diff') void openDiff(m.id);
      else if (m?.type === 'judge') void setJudgment(m.id, { judge: m.judge, note: m.note }, true);
    });
    renderPanel();
  } else {
    panel.reveal(undefined, true);
    if (id) void panel.webview.postMessage({ type: 'select', id });
  }
}
function renderPanel() {
  if (!panel || !run) return;
  const focus = focusId && run.report.summaries.some((s) => s.req.id === focusId) ? focusId : undefined;
  panel.webview.html = M.webviewHtml(run.report, randomBytes(16).toString('base64'), panel.webview.cspSource, { judgments: judgments(), focus });
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

/** 명령 인자로 요구사항 번호를 얻는다: 문자열, 목록의 항목, 없으면 고르게 한다. */
async function resolveReq(arg: unknown, placeHolder: string): Promise<string | undefined> {
  if (!run) {
    void vscode.window.showInformationMessage('VerifyLens: 먼저 분석을 실행하세요.');
    return undefined;
  }
  if (typeof arg === 'string') return arg;
  const n = arg as Node | undefined;
  if (n && n.kind === 'req') return n.row.id;
  if (n && n.kind === 'ev') return n.reqId;
  const items = run.report.summaries.map((s) => ({ label: `${s.req.id}  ${s.req.text}`, description: s.overall, id: s.req.id }));
  return (await vscode.window.showQuickPick(items, { placeHolder }))?.id;
}

/** VS Code 기본 비교 화면으로 두 결과(또는 기준과 결과)를 나란히 연다. */
async function openDiff(arg?: unknown) {
  const id = await resolveReq(arg, '어느 요구사항의 코드를 나란히 비교할까요?');
  if (!id || !run) return;
  const t = M.diffTarget(run.report, id);
  if (!t) return void vscode.window.showInformationMessage(`VerifyLens: ${id}는 연결된 코드 근거가 없어 비교할 수 없습니다.`);
  const uri = (s: M.DiffSide) => (s.key === 'base' ? virtualUri('base', s.ref, s.file) : locationUri(s.key, s.file));
  try {
    const at = new vscode.Range(t.right.line - 1, 0, t.right.line - 1, 0);
    await vscode.commands.executeCommand('vscode.diff', uri(t.left), uri(t.right), t.title, { viewColumn: vscode.ViewColumn.One, preview: true, selection: at });
  } catch (e) {
    fail(e);
  }
}

async function recordJudgment(arg?: unknown) {
  const id = await resolveReq(arg, '어느 요구사항에 판단을 기록할까요?');
  if (!id || !run) return;
  const cur = judgments()[id];
  const pick = await vscode.window.showQuickPick(
    [...JUDGE_OPTIONS.map((label) => ({ label, description: cur?.judge === label ? '지금 판단' : '' })), { label: '미검토', description: '판단 지우기' }],
    { placeHolder: `${id} — 근거를 보고 어떻게 할지 정합니다` },
  );
  if (!pick) return;
  let note = '';
  if (pick.label !== '미검토') {
    const typed = await vscode.window.showInputBox({ prompt: `${id} · ${pick.label} — 이유나 남은 확인 사항 (비워 둬도 됩니다)`, value: cur?.note ?? '' });
    if (typed === undefined) return;
    note = typed;
  }
  await setJudgment(id, { judge: pick.label, note });
}

// ---------------------------------------------------------------- 실행
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  out.appendLine(`[오류] ${e instanceof Error && e.stack ? e.stack : msg}`);
  void vscode.window.showErrorMessage(`VerifyLens: ${msg}`);
}

function applyRun(r: M.Run) {
  run = r;
  tree.refresh();
  updateViewMeta();
  lenses.refresh();
  decorate(vscode.window.visibleTextEditors);
  publishDiagnostics();
  const n = r.report.summaries.filter((s) => s.overall === '다름' || s.overall === '실패').length;
  status.text = M.statusIcons(r.report);
  status.tooltip = `VerifyLens · ${M.contextLine(r)}\n${M.statusText(r.report)}\n눌러서 리포트 열기`;
  status.backgroundColor = n ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  status.show();
  renderPanel();
}

async function execute(job: Job, opts: RunOpts = {}) {
  try {
    let r: M.Run;
    if (opts.silent) {
      status.text = '$(sync~spin) VerifyLens';
      await new Promise((res) => setTimeout(res, 20));
      r = job.fn();
    } else {
      r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `VerifyLens: ${job.title}` }, async () => {
        await new Promise((res) => setTimeout(res, 30)); // 알림이 먼저 그려지게
        return job.fn();
      });
    }
    again = job;
    await vscode.commands.executeCommand('setContext', 'verifylens.hasRun', true);
    applyRun(r);
    out.appendLine(`[${new Date().toLocaleTimeString()}] ${opts.silent ? '변경 감지 → ' : ''}${job.title} → ${M.statusText(r.report)}`);
    if (opts.silent) return;
    arm(job.watch);
    showReport();
    void vscode.commands.executeCommand('verifylens.requirements.focus');
    for (const n of r.notes) void vscode.window.showWarningMessage(`VerifyLens: ${n}`);
  } catch (e) {
    if (!opts.silent) return fail(e);
    // 저장 도중의 파일처럼 잠깐 읽을 수 없는 상태일 수 있다. 조용히 기록만 하고 이전 결과를 둔다.
    out.appendLine(`[다시 분석 실패] ${e instanceof Error ? e.message : String(e)}`);
    if (run) status.text = M.statusIcons(run.report);
  }
}

/** 커밋 · 브랜치 이동 · 요구사항 파일 · 테스트 보고서가 바뀌면 조용히 다시 분석한다. */
function arm(spec?: M.WatchSpec) {
  watcher?.dispose();
  watcher = undefined;
  if (!spec || !cfg('autoRerun', true)) return;
  let sig: string;
  try {
    sig = M.signature(spec);
  } catch {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      let now: string;
      try {
        now = M.signature(spec);
      } catch {
        return;
      }
      if (now === sig || !again) return;
      sig = now;
      void execute(again, { silent: true });
    }, 800);
  };
  const ws: FSWatcher[] = [];
  const dirs = new Set<string>();
  try {
    dirs.add(M.gitDir(spec.repo));
  } catch {
    /* git 폴더를 못 찾으면 파일만 본다 */
  }
  for (const f of spec.files) dirs.add(path.dirname(f));
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    try {
      const w = watch(d, kick);
      w.on('error', () => undefined);
      w.unref();
      ws.push(w);
    } catch {
      /* 볼 수 없는 폴더는 건너뛴다 */
    }
  }
  watcher = {
    dispose() {
      if (timer) clearTimeout(timer);
      for (const w of ws) w.close();
    },
  };
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
  const fixed = cfg('baseBranch', '').trim();
  if (fixed) return fixed;
  const items = M.orderBases(M.localBranches(repo), current);
  if (!items.length) {
    void vscode.window.showWarningMessage('VerifyLens: 비교할 기준 브랜치가 없습니다. main 같은 브랜치가 있어야 합니다.');
    return undefined;
  }
  return vscode.window.showQuickPick(items, { placeHolder: `무엇과 비교할까요? (지금 브랜치: ${current})` });
}

function reqPath(repo: string) {
  return path.join(repo, cfg('requirementsFile', '') || '.verifylens/requirements.md');
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
  const rel = cfg('junitPath', '').trim();
  return rel ? path.join(repo, rel) : undefined;
}

// ---------------------------------------------------------------- 시작
export function activate(context: vscode.ExtensionContext) {
  ctx = context;
  out = vscode.window.createOutputChannel('VerifyLens');
  makeDecorations();
  tree = new ReqTree();
  view = vscode.window.createTreeView('verifylens.requirements', { treeDataProvider: tree });
  lenses = new Lenses();
  diags = vscode.languages.createDiagnosticCollection('verifylens');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'verifylens.openReport';

  ctx.subscriptions.push(
    out,
    status,
    view,
    diags,
    { dispose: () => watcher?.dispose() },
    vscode.languages.registerCodeLensProvider([{ scheme: 'file' }, { scheme: SCHEME }], lenses),
    vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: SCHEME }], {
      provideHover(doc, pos) {
        const t = target(doc);
        if (!t || !run) return undefined;
        const hits = M.lensesFor(run.report, t.setKey, t.file).filter((l) => pos.line >= l.line - 1 && pos.line <= l.endLine - 1);
        const mds = hits.map((l) => hoverFor(l.reqId)).filter((m): m is vscode.MarkdownString => !!m);
        return mds.length ? new vscode.Hover(mds) : undefined;
      },
    }),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      provideTextDocumentContent(uri) {
        const q = new URLSearchParams(uri.query);
        const file = uri.path.split('/').slice(2).join('/');
        return showFile(q.get('repo') ?? '', q.get('ref') ?? '', file) ?? `// ${file} 은(는) 이 결과에 없습니다.`;
      },
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => decorate(eds)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('verifylens')) return;
      decorate(vscode.window.visibleTextEditors);
      publishDiagnostics();
      arm(again?.watch);
    }),

    vscode.commands.registerCommand('verifylens.runDemo', () => {
      const node = cfg('nodePath', 'node') || 'node';
      const sampleDir = ctx.asAbsolutePath(path.join('samples', 'login-lockout'));
      const fallbackJunit = { a: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-a.xml')), b: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-b.xml')) };
      return execute({ title: '샘플(로그인 잠금 가상 사례) 분석', fn: () => M.runDemo({ sampleDir, node: M.nodeSupportsTs(node) ? node : null, fallbackJunit }) });
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
      return execute({
        title: `${current} 확인 (기준 ${base})`,
        fn: () => M.runRepo({ repo, base, a: current, reqFile, junitA: junitA && existsSync(junitA) ? junitA : undefined, workingRef: M.currentBranch(repo) }),
        watch: { repo, refs: [base, current, 'HEAD'], files: [reqFile, ...(junitA ? [junitA] : [])] },
      });
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
      return execute({
        title: `${a} ↔ ${b} 비교 (기준 ${base})`,
        fn: () => M.runRepo({ repo, base, a, b, reqFile, workingRef: M.currentBranch(repo) }),
        watch: { repo, refs: [base, a, b, 'HEAD'], files: [reqFile] },
      });
    }),

    vscode.commands.registerCommand('verifylens.rerun', async () => {
      if (!again || run?.kind === 'repo') if (await needTrust()) return;
      return again ? execute(again) : vscode.commands.executeCommand('verifylens.checkBranch');
    }),
    vscode.commands.registerCommand('verifylens.openReport', () => (run ? showReport() : vscode.window.showInformationMessage('VerifyLens: 먼저 분석을 실행하세요.'))),
    vscode.commands.registerCommand('verifylens.createRequirements', async () => {
      if (await needTrust()) return;
      return createReqs();
    }),
    vscode.commands.registerCommand('verifylens.focusRequirement', async (arg?: unknown) => {
      const id = await resolveReq(arg, '어느 요구사항의 근거를 볼까요?');
      if (id) showReport(id);
    }),
    vscode.commands.registerCommand('verifylens.openDiff', (arg?: unknown) => openDiff(arg)),
    vscode.commands.registerCommand('verifylens.recordJudgment', (arg?: unknown) => recordJudgment(arg)),
    vscode.commands.registerCommand('verifylens.openLocation', (setKey: string, file: string, line: number) => openLocation(setKey, file, line)),
  );
}

export function deactivate() {
  watcher?.dispose();
  panel?.dispose();
}

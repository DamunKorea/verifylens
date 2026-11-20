import * as vscode from 'vscode';
import * as path from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import * as cp from 'node:child_process';
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
const L = M.L;
/** 화면 글의 언어를 정한다: 설정 verifylens.language (auto 면 VS Code 화면 언어를 따른다). 바뀌었으면 true. */
function applyLang(): boolean {
  const next = M.resolveLang(cfg<string>('language', 'auto'), vscode.env.language);
  if (next === M.getLang()) return false;
  M.setLang(next);
  return true;
}

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
type Node = { kind: 'req'; row: M.ReqRow } | { kind: 'ev'; row: M.EvidenceRow; reqId: string } | { kind: 'rest'; rows: M.ReqRow[]; note: string };

class ReqTree implements vscode.TreeDataProvider<Node> {
  private ch = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.ch.event;
  refresh() {
    this.ch.fire(undefined);
  }
  getChildren(n?: Node): Node[] {
    if (!run) return [];
    if (!n) {
      // 다름 · 실패와 사람이 볼 미확인만 위에 펼치고, 나머지는 한 줄로 접는다 (사람이 다 읽지 않아도 되게)
      const g = M.treeGroups(M.treeModel(run.report));
      const req = (row: M.ReqRow): Node => ({ kind: 'req', row });
      if (!g.top.length || !g.rest.length) return [...g.top, ...g.rest].map(req);
      return [...g.top.map(req), { kind: 'rest', rows: g.rest, note: g.restNote }];
    }
    if (n.kind === 'rest') return n.rows.map((row) => ({ kind: 'req', row }));
    if (n.kind === 'req') return n.row.children.map((row) => ({ kind: 'ev', row, reqId: n.row.id }));
    return [];
  }
  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === 'rest') {
      const it = new vscode.TreeItem(L(`나머지 ${n.rows.length}개`, `Other ${n.rows.length}`), vscode.TreeItemCollapsibleState.Collapsed);
      it.description = n.note;
      it.tooltip = L('확인됨이거나, 검사가 없어서만 미확인인 요구사항', 'Verified, or not verified only because no test ran');
      it.iconPath = new vscode.ThemeIcon('fold', new vscode.ThemeColor('descriptionForeground'));
      return it;
    }
    if (n.kind === 'req') {
      const r = n.row;
      const j = judgments()[r.id];
      const judged = j && j.judge && j.judge !== '미검토';
      const open = r.overall === '다름' || r.overall === '실패';
      const it = new vscode.TreeItem(`${r.id}  ${r.text}`, open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      const state = r.reason ? `${M.wOverall(r.overall)} · ${r.reason}` : M.wOverall(r.overall);
      it.description = judged ? `${state} → ${M.wJudge(j.judge)}` : state;
      const md = new vscode.MarkdownString(run ? (M.hoverMarkdown(run.report, r.id, false) ?? '') : '');
      if (judged) md.appendMarkdown(`\n\n**${L('사람의 판단', 'Your decision')}: ${M.wJudge(j.judge)}**${j.note ? ` — ${j.note}` : ''}`);
      it.tooltip = md;
      it.iconPath = new vscode.ThemeIcon(ICON[r.overall][0], new vscode.ThemeColor(ICON[r.overall][1]));
      it.command = { command: 'verifylens.focusRequirement', title: L('근거 보기', 'Show evidence'), arguments: [r.id] };
      it.contextValue = 'requirement';
      return it;
    }
    const e = n.row;
    const it = new vscode.TreeItem(e.label, vscode.TreeItemCollapsibleState.None);
    it.description = e.detail;
    it.tooltip = e.tooltip;
    it.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(SET_COLOR[e.setKey] ?? 'foreground'));
    if (e.file && e.line) {
      it.command = { command: 'verifylens.openLocation', title: L('코드로 이동', 'Go to code'), arguments: [e.setKey, e.file, e.line] };
      it.tooltip = `${e.tooltip} — ${L('눌러서 코드로 이동', 'click to go to the code')}`;
    }
    return it;
  }
}

function updateViewMeta() {
  if (!run) return;
  const n = M.attentionCount(run.report);
  view.badge = n ? { value: n, tooltip: L(`확인이 필요한 요구사항 ${n}개`, `${n} requirement(s) need attention`) } : undefined;
  const judged = Object.values(judgments()).filter((j) => j.judge && j.judge !== '미검토').length;
  view.message = `${M.verifiedLine(run.report)} · ${M.contextLine(run)} · ${L('판단', 'decisions')} ${judged}/${run.report.summaries.length}`;
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
      res.push(new vscode.CodeLens(at, { title: two ? L('A ↔ B 비교', 'Compare A ↔ B') : L('기준과 비교', 'Compare with base'), command: 'verifylens.openDiff', arguments: [l.reqId] }));
      res.push(new vscode.CodeLens(at, { title: L('판단 기록', 'Record decision'), command: 'verifylens.recordJudgment', arguments: [l.reqId] }));
    }
    return res;
  }
}

const DECO: Record<Overall, vscode.TextEditorDecorationType> = {} as never;
/** 줄 번호 옆 아이콘은 근거의 첫 줄에만 붙인다 (여러 줄 조건에 아이콘이 줄줄이 붙지 않게). */
const GUTTER: Record<Overall, vscode.TextEditorDecorationType> = {} as never;
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
    });
    GUTTER[k] = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(ctx.asAbsolutePath(path.join('media', `gutter-${spec[k].slug}.svg`))),
      gutterIconSize: '80%',
    });
    ctx.subscriptions.push(DECO[k], GUTTER[k]);
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
      ed.setDecorations(
        GUTTER[k],
        ls.filter((l) => l.overall === k).map((l) => new vscode.Range(l.line - 1, 0, l.line - 1, 0)),
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
      new vscode.Range(l.line - 1, 0, l.line - 1, 1000),
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
    panel = vscode.window.createWebviewPanel('verifylens.report', L('VerifyLens 리포트', 'VerifyLens report'), { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage((m: { type: string; set: string; file: string; line: number; id: string; judge: string; note: string }) => {
      if (m?.type === 'open') void openLocation(m.set, m.file, m.line);
      else if (m?.type === 'diff') void openDiff(m.id);
      else if (m?.type === 'copy') void copySummary();
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
  panel.webview.html = M.webviewHtml(run.report, randomBytes(16).toString('base64'), panel.webview.cspSource, { judgments: judgments(), focus, demo: run.kind === 'demo' });
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

const runFirst = () => L('VerifyLens: 먼저 분석을 실행하세요.', 'VerifyLens: run a check first.');

/** 명령 인자로 요구사항 번호를 얻는다: 문자열, 목록의 항목, 없으면 고르게 한다. */
async function resolveReq(arg: unknown, placeHolder: string): Promise<string | undefined> {
  if (!run) {
    void vscode.window.showInformationMessage(runFirst());
    return undefined;
  }
  if (typeof arg === 'string') return arg;
  const n = arg as Node | undefined;
  if (n && n.kind === 'req') return n.row.id;
  if (n && n.kind === 'ev') return n.reqId;
  const items = run.report.summaries.map((s) => ({ label: `${s.req.id}  ${s.req.text}`, description: M.wOverall(s.overall), id: s.req.id }));
  return (await vscode.window.showQuickPick(items, { placeHolder }))?.id;
}

/** VS Code 기본 비교 화면으로 두 결과(또는 기준과 결과)를 나란히 연다. */
async function openDiff(arg?: unknown) {
  const id = await resolveReq(arg, L('어느 요구사항의 코드를 나란히 비교할까요?', 'Which requirement do you want to compare side by side?'));
  if (!id || !run) return;
  const t = M.diffTarget(run.report, id);
  if (!t) return void vscode.window.showInformationMessage(L(`VerifyLens: ${id}는 연결된 코드 근거가 없어 비교할 수 없습니다.`, `VerifyLens: ${id} has no linked code evidence, so there is nothing to compare.`));
  const uri = (s: M.DiffSide) => (s.key === 'base' ? virtualUri('base', s.ref, s.file) : locationUri(s.key, s.file));
  try {
    const at = new vscode.Range(t.right.line - 1, 0, t.right.line - 1, 0);
    await vscode.commands.executeCommand('vscode.diff', uri(t.left), uri(t.right), t.title, { viewColumn: vscode.ViewColumn.One, preview: true, selection: at });
  } catch (e) {
    fail(e);
  }
}

async function recordJudgment(arg?: unknown) {
  const id = await resolveReq(arg, L('어느 요구사항에 판단을 기록할까요?', 'Which requirement do you want to record a decision for?'));
  if (!id || !run) return;
  const cur = judgments()[id];
  const pick = await vscode.window.showQuickPick(
    [
      ...JUDGE_OPTIONS.map((value) => ({ label: M.wJudge(value), value, description: cur?.judge === value ? L('지금 판단', 'current decision') : '' })),
      { label: M.wJudge('미검토'), value: '미검토', description: L('판단 지우기', 'clear the decision') },
    ],
    { placeHolder: L(`${id} — 근거를 보고 어떻게 할지 정합니다`, `${id} — decide what to do after reading the evidence`) },
  );
  if (!pick) return;
  let note = '';
  if (pick.value !== '미검토') {
    const typed = await vscode.window.showInputBox({ prompt: L(`${id} · ${pick.label} — 이유나 남은 확인 사항 (비워 둬도 됩니다)`, `${id} · ${pick.label} — reason, or what is left to check (may be left empty)`), value: cur?.note ?? '' });
    if (typed === undefined) return;
    note = typed;
  }
  // 저장하는 값은 언어와 상관없이 같다 (사용 · 수정 · 추가 검증 · 보류).
  await setJudgment(id, { judge: pick.value, note });
}

/**
 * PR 설명이나 댓글에 붙여 넣을 검증 요약을 클립보드에 복사한다. 요약 글을 돌려준다.
 * { dryRun: true } 를 주면 복사하지 않고 글만 돌려준다 (시험용).
 */
async function copySummary(arg?: unknown): Promise<string | undefined> {
  if (!run) {
    void vscode.window.showInformationMessage(runFirst());
    return undefined;
  }
  // auto 면 화면 글의 언어를 따른다.
  const sl = cfg<string>('summaryLanguage', 'auto');
  const lang: M.SummaryLang = sl === 'en' || sl === 'ko' ? sl : M.getLang();
  const js = judgments();
  const text = M.prSummary(run, js, { lang, version: String(ctx.extension?.packageJSON?.version ?? '') });
  if ((arg as { dryRun?: boolean } | undefined)?.dryRun) return text;
  await vscode.env.clipboard.writeText(text);
  const pending = M.pendingDecisions(run.report, js);
  const msg = pending
    ? L(`VerifyLens: 검증 요약을 복사했습니다. 판단을 기록하지 않은 항목 ${pending}개는 「미검토」로 들어갔습니다.`, `VerifyLens: verification summary copied. ${pending} item(s) without a recorded decision are listed as "Not reviewed".`)
    : L('VerifyLens: 검증 요약을 복사했습니다. PR 설명이나 댓글에 붙여 넣으세요.', 'VerifyLens: verification summary copied. Paste it into the PR description or a comment.');
  const preview = L('미리 보기', 'Preview');
  const record = L('판단 기록', 'Record decision');
  void vscode.window.showInformationMessage(msg, preview, ...(pending ? [record] : [])).then(async (pick) => {
    if (pick === preview) {
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: text });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: true });
    } else if (pick === record) await recordJudgment();
  });
  return text;
}

// ---------------------------------------------------------------- 실행
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  out.appendLine(`[${L('오류', 'error')}] ${e instanceof Error && e.stack ? e.stack : msg}`);
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
  status.tooltip = `VerifyLens · ${M.verifiedLine(r.report)}\n${M.contextLine(r)}\n${M.statusText(r.report)} · ${L('AI 추정 없음', 'no AI inference')}\n${L('눌러서 리포트 열기', 'Click to open the report')}`;
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
    out.appendLine(`[${new Date().toLocaleTimeString()}] ${opts.silent ? L('변경 감지 → ', 'change detected → ') : ''}${job.title} → ${M.statusText(r.report)}`);
    if (opts.silent) return;
    arm(job.watch);
    showReport();
    void vscode.commands.executeCommand('verifylens.requirements.focus');
    for (const n of r.notes) {
      const runThem = L('테스트 실행', 'Run tests');
      const offer = r.kind === 'repo' && /테스트|\btests?\b/i.test(n) ? [runThem] : [];
      void vscode.window.showWarningMessage(`VerifyLens: ${n}`, ...offer).then((pick) => (pick === runThem ? vscode.commands.executeCommand('verifylens.runTests') : undefined));
    }
    if (r.kind === 'demo') void vscode.window.showInformationMessage(`VerifyLens: ${M.demoHeadline(r.report)}`);
  } catch (e) {
    if (!opts.silent) return fail(e);
    // 저장 도중의 파일처럼 잠깐 읽을 수 없는 상태일 수 있다. 조용히 기록만 하고 이전 결과를 둔다.
    out.appendLine(`[${L('다시 분석 실패', 're-check failed')}] ${e instanceof Error ? e.message : String(e)}`);
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
  const subs: vscode.Disposable[] = [];
  if (spec.worktree) {
    // 커밋 전 변경을 보고 있을 때: 저장하거나, 에디터 밖에서(AI 에이전트 등) 파일이 바뀌면 다시 본다.
    const inRepo = (f: string) => !path.relative(spec.repo, f).startsWith('..');
    subs.push(vscode.workspace.onDidSaveTextDocument((d) => (d.uri.scheme === 'file' && inRepo(d.uri.fsPath) ? kick() : undefined)));
    const fw = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(spec.repo, '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'));
    fw.onDidChange(kick);
    fw.onDidCreate(kick);
    fw.onDidDelete(kick);
    subs.push(fw);
  }
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
      for (const s of subs) s.dispose();
    },
  };
}

/** 제한 모드(신뢰하지 않은 폴더)에서는 저장소를 읽지 않는다. 신뢰하라고 안내하고 true 를 돌려준다. */
async function needTrust(): Promise<boolean> {
  if (vscode.workspace.isTrusted) return false;
  const pick = await vscode.window.showWarningMessage(
    L('VerifyLens: 이 폴더는 아직 신뢰하지 않은 상태(제한 모드)입니다. 내 브랜치를 확인하려면 폴더를 신뢰해야 합니다. 샘플은 지금도 해 볼 수 있습니다.', 'VerifyLens: this folder is not trusted yet (Restricted Mode). Checking your branch needs a trusted folder. The demo works as it is.'),
    L('이 폴더 신뢰하기', 'Trust this folder'),
  );
  if (pick) await vscode.commands.executeCommand('workbench.trust.manage');
  return true;
}

async function pickRepo(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const roots = [...new Set(folders.map((f) => M.gitRoot(f.uri.fsPath)).filter((x): x is string => !!x))];
  if (!roots.length) {
    void vscode.window.showWarningMessage(L('VerifyLens: 열린 폴더에서 git 저장소를 찾지 못했습니다. 저장소 폴더를 연 뒤 다시 실행하세요.', 'VerifyLens: no git repository was found in the open folder. Open a repository folder and run this again.'));
    return undefined;
  }
  if (roots.length === 1) return roots[0];
  return vscode.window.showQuickPick(roots, { placeHolder: L('어느 저장소를 확인할까요?', 'Which repository do you want to check?') });
}

async function pickBase(repo: string, current: string): Promise<string | undefined> {
  const fixed = cfg('baseBranch', '').trim();
  if (fixed) return fixed;
  const auto = M.defaultBase(repo, current);
  if (auto) return auto;
  const items = M.orderBases(M.localBranches(repo), current);
  if (!items.length) {
    void vscode.window.showWarningMessage(L('VerifyLens: 비교할 기준 브랜치가 없습니다. main 같은 브랜치가 있어야 합니다.', 'VerifyLens: there is no base branch to compare against. A branch such as main is needed.'));
    return undefined;
  }
  return vscode.window.showQuickPick(items, { placeHolder: L(`무엇과 비교할까요? (지금 브랜치: ${current})`, `Compare against which branch? (current branch: ${current})`) });
}

function reqPath(repo: string) {
  return path.join(repo, cfg('requirementsFile', '') || '.verifylens/requirements.md');
}

async function ensureReqs(repo: string): Promise<string | undefined> {
  const file = reqPath(repo);
  if (existsSync(file)) return file;
  const imp = L('이슈 · PR에서 가져오기', 'Import from issue / PR');
  const pick = await vscode.window.showWarningMessage(
    L(`VerifyLens: 요구사항 파일(${path.relative(repo, file)})이 없습니다. 이슈나 PR 글에서 가져오거나 직접 적을 수 있습니다.`, `VerifyLens: there is no requirements file (${path.relative(repo, file)}). Import the requirements from an issue or PR, or write them yourself.`),
    imp,
    L('요구사항 파일 만들기', 'Create requirements file'),
  );
  if (pick === imp) await importRequirements(undefined, repo);
  else if (pick) await createReqs(repo);
  return undefined;
}

async function createReqs(repo?: string) {
  repo = repo ?? (await pickRepo());
  if (!repo) return;
  const file = reqPath(repo);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, M.reqTemplate(), 'utf8');
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
  void vscode.window.showInformationMessage(L('VerifyLens: 요구사항을 적고 저장한 뒤 「Check my changes」를 실행하세요.', 'VerifyLens: write the requirements, save, then run "Check my changes".'));
}

/**
 * 이슈 · PR · 복사한 글에서 요구사항을 뽑아 요구사항 파일에 넣는다 (규칙 기반, AI 없음).
 * GitHub 에서는 글만 읽어 온다. 코드는 보내지 않는다.
 * { text, dryRun: true } 를 주면 파일을 건드리지 않고 초안 글만 돌려준다 (시험용).
 */
async function importRequirements(arg?: unknown, repoArg?: string): Promise<string | undefined> {
  const a = arg as { text?: string; dryRun?: boolean } | undefined;
  if (a?.dryRun) return M.mergeRequirementsFile(null, M.requirementsFrom([{ label: L('글', 'text'), url: '', title: '', body: a.text ?? '' }]).requirements, L('붙여 넣은 글', 'pasted text'), 'replace').text;
  if (await needTrust()) return undefined;
  const repo = repoArg ?? (await pickRepo());
  if (!repo) return undefined;
  const src = await vscode.window.showQuickPick(
    [
      { label: L('$(git-pull-request) 지금 브랜치의 GitHub PR', "$(git-pull-request) This branch's GitHub PR"), detail: L('PR 설명과 PR이 닫는 이슈의 글을 gh로 읽어 옵니다. 글만 읽고 코드는 보내지 않습니다.', 'Reads the PR description and the issues it closes through gh. Only the text is read; your code is not sent.'), id: 'pr' },
      { label: L('$(issues) GitHub 이슈 번호나 주소', '$(issues) GitHub issue number or URL'), detail: L('예: 123 또는 https://github.com/owner/repo/issues/123', 'For example 123 or https://github.com/owner/repo/issues/123'), id: 'issue' },
      { label: L('$(clippy) 복사한 글 (클립보드)', '$(clippy) Copied text (clipboard)'), detail: L('Jira · Linear · 메신저 등 어디서든 복사한 요구사항 글. 네트워크를 쓰지 않습니다.', 'Requirement text copied from anywhere: Jira, Linear, chat. No network use.'), id: 'clip' },
    ],
    { placeHolder: L('요구사항을 어디서 가져올까요?', 'Where should the requirements come from?') },
  );
  if (!src) return undefined;
  let texts: M.SourceText[];
  try {
    if (src.id === 'clip') {
      texts = [{ label: L('복사한 글', 'copied text'), url: '', title: '', body: await vscode.env.clipboard.readText() }];
    } else {
      const run = M.ghRunner(repo, cfg('ghPath', 'gh') || 'gh');
      if (src.id === 'issue') {
        const ref = await vscode.window.showInputBox({ prompt: L('이슈 번호나 주소', 'Issue number or URL'), placeHolder: '123' });
        if (!ref) return undefined;
        texts = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: L('VerifyLens: GitHub에서 이슈를 읽는 중', 'VerifyLens: reading the issue from GitHub') }, async () => M.fetchIssue(run, ref));
      } else {
        texts = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: L('VerifyLens: GitHub에서 PR과 이슈를 읽는 중', 'VerifyLens: reading the PR and its issues from GitHub') }, async () => M.fetchPr(run));
      }
    }
  } catch (e) {
    out.appendLine(`[${L('가져오기 실패', 'import failed')}] ${e instanceof Error ? e.message : String(e)}`);
    void vscode.window.showErrorMessage(`VerifyLens: ${M.ghError(e)}`);
    return undefined;
  }
  const { requirements, sources } = M.requirementsFrom(texts);
  if (!requirements.length) {
    void vscode.window.showWarningMessage(
      L(
        `VerifyLens: ${texts.map((t) => t.label).join(', ')}에서 요구사항으로 볼 문장을 찾지 못했습니다. 목록(- 항목)이나 「~해야 한다」 꼴 문장이 있어야 합니다.`,
        `VerifyLens: nothing that reads like a requirement was found in ${texts.map((t) => t.label).join(', ')}. It needs a list (- item) or sentences with "must" / "should".`,
      ),
    );
    return undefined;
  }
  const file = reqPath(repo);
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : null;
  let mode: 'replace' | 'append' = 'replace';
  if (existing && M.treeCount(existing) > 0) {
    const replace = L('바꾸기', 'Replace');
    const pick = await vscode.window.showWarningMessage(
      L(`VerifyLens: 요구사항 파일에 이미 ${M.treeCount(existing)}개가 있습니다. 가져온 ${requirements.length}개를 어떻게 넣을까요?`, `VerifyLens: the requirements file already has ${M.treeCount(existing)}. What should happen with the ${requirements.length} imported?`),
      { modal: true },
      L('뒤에 추가', 'Append'),
      replace,
    );
    if (!pick) return undefined;
    mode = pick === replace ? 'replace' : 'append';
  }
  const label = sources.join(' · ');
  const merged = M.mergeRequirementsFile(existing, requirements, label, mode);
  if (!merged.added) {
    void vscode.window.showInformationMessage(L('VerifyLens: 가져온 요구사항이 이미 모두 들어 있습니다.', 'VerifyLens: every imported requirement is already in the file.'));
    return merged.text;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, merged.text, 'utf8');
  await vscode.window.showTextDocument(vscode.Uri.file(file));
  void vscode.window
    .showInformationMessage(L(`VerifyLens: ${label}에서 요구사항 ${merged.added}개를 가져왔습니다. 읽어 보고 고친 뒤 확인을 실행하세요.`, `VerifyLens: imported ${merged.added} requirement(s) from ${label}. Read them, fix them, then run the check.`), L('지금 브랜치 확인', 'Check my changes'))
    .then((pick) => (pick ? vscode.commands.executeCommand('verifylens.checkBranch') : undefined));
  return merged.text;
}

/**
 * 테스트를 돌려 결과 파일을 만들고 다시 분석한다. 명령은 설정(verifylens.testCommand)이나 package.json 에서 정한다.
 * 테스트가 실패해 종료 코드가 0 이 아닌 것은 정상이다. 결과 파일이 새로 생겼는지만 본다.
 */
async function runTests(): Promise<void> {
  if (await needTrust()) return;
  const repo = run?.kind === 'repo' ? run.repo : await pickRepo();
  if (!repo) return;
  const plan = M.detectTestPlan(repo, cfg('testCommand', ''), cfg('junitPath', ''), cfg('nodePath', 'node') || 'node');
  if (!plan) {
    const pick = await vscode.window.showWarningMessage(
      L(
        'VerifyLens: 테스트 실행 방법을 알아내지 못했습니다 (Vitest · Jest · node:test 를 찾습니다). 설정에 명령을 적어 주세요. 예: npx mocha --reporter xunit --reporter-option output=${report}',
        'VerifyLens: could not tell how to run your tests (it looks for Vitest, Jest and node:test). Put the command in the settings, for example: npx mocha --reporter xunit --reporter-option output=${report}',
      ),
      L('설정 열기', 'Open settings'),
    );
    if (pick) await vscode.commands.executeCommand('workbench.action.openSettings', 'verifylens.testCommand');
    return;
  }
  mkdirSync(path.dirname(plan.report), { recursive: true });
  const started = Date.now();
  out.appendLine(`[${L('테스트', 'tests')} · ${plan.framework}] ${plan.command}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.ELECTRON_RUN_AS_NODE;
  const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: L(`VerifyLens: 테스트 실행 중 (${plan.framework})`, `VerifyLens: running tests (${plan.framework})`), cancellable: true }, (_p, token) => {
    return new Promise<{ code: number | null; text: string; cancelled: boolean }>((resolve) => {
      let cancelled = false;
      const child = cp.exec(plan.command, { cwd: repo, windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, env }, (err, stdout, stderr) => {
        resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, text: `${stdout}\n${stderr}`, cancelled });
      });
      token?.onCancellationRequested(() => {
        cancelled = true;
        if (process.platform === 'win32' && child.pid) cp.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        else child.kill();
      });
    });
  });
  out.appendLine(res.text.split('\n').slice(-40).join('\n'));
  if (res.cancelled) return;
  const fresh = existsSync(plan.report) && statSync(plan.report).mtimeMs >= started - 2000;
  if (!fresh) {
    out.show(true);
    void vscode.window.showErrorMessage(
      L(
        `VerifyLens: 테스트를 실행했지만 결과 파일(${path.relative(repo, plan.report)})이 만들어지지 않았습니다. 출력 창의 내용을 확인하세요. 명령: ${plan.command}`,
        `VerifyLens: the tests ran, but the report file (${path.relative(repo, plan.report)}) was not written. See the Output panel. Command: ${plan.command}`,
      ),
    );
    return;
  }
  if (again && run?.kind === 'repo') await execute(again, { silent: true });
  else await vscode.commands.executeCommand('verifylens.checkBranch');
  if (run) void vscode.window.showInformationMessage(L(`VerifyLens: 테스트 결과를 반영했습니다 (${plan.framework}) · ${M.statusText(run.report)}`, `VerifyLens: test results included (${plan.framework}) · ${M.statusText(run.report)}`));
}

// ---------------------------------------------------------------- 시작
export function activate(context: vscode.ExtensionContext) {
  ctx = context;
  applyLang();
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
        return showFile(q.get('repo') ?? '', q.get('ref') ?? '', file) ?? L(`// ${file} 은(는) 이 결과에 없습니다.`, `// ${file} does not exist in this result.`);
      },
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => decorate(eds)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('verifylens')) return;
      // 언어가 바뀌면 분석 결과에 들어 있는 글도 다시 만들어야 한다.
      if (applyLang()) {
        if (again) void execute(again, { silent: true });
        else tree.refresh();
      }
      decorate(vscode.window.visibleTextEditors);
      publishDiagnostics();
      arm(again?.watch);
    }),

    vscode.commands.registerCommand('verifylens.runDemo', () => {
      const node = cfg('nodePath', 'node') || 'node';
      const sampleDir = ctx.asAbsolutePath(path.join('samples', 'login-lockout'));
      const fallbackJunit = { a: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-a.xml')), b: ctx.asAbsolutePath(path.join('samples', 'junit', 'junit-b.xml')) };
      return execute({ title: L('샘플(로그인 잠금 가상 사례) 분석', 'Analyzing the sample (a made-up login-lockout case)'), fn: () => M.runDemo({ sampleDir, node: M.nodeSupportsTs(node) ? node : null, fallbackJunit }) });
    }),

    vscode.commands.registerCommand('verifylens.checkBranch', async () => {
      if (await needTrust()) return;
      const repo = await pickRepo();
      if (!repo) return;
      const current = M.currentBranch(repo);
      if (current === 'HEAD') return void vscode.window.showWarningMessage(L('VerifyLens: 브랜치에 있지 않습니다(detached HEAD). 브랜치를 체크아웃한 뒤 실행하세요.', 'VerifyLens: you are not on a branch (detached HEAD). Check out a branch and run this again.'));
      const base = await pickBase(repo, current);
      if (!base) return;
      const reqFile = await ensureReqs(repo);
      if (!reqFile) return;
      // 커밋 전 변경까지 본다 (AI 가 방금 고친 코드를 커밋하기 전에 확인하려는 것이므로). 체크아웃을 바꾸면 그 브랜치를 따라간다.
      const worktree = cfg('includeUncommitted', true);
      const setting = cfg('junitPath', '');
      return execute({
        title: L(`${current} 확인 (기준 ${base})`, `Checking ${current} (base ${base})`),
        fn: () => {
          const now = worktree ? M.currentBranch(repo) : current;
          return M.runRepo({ repo, base, a: now, reqFile, junitA: M.findReport(repo, setting), workingRef: M.currentBranch(repo), worktree });
        },
        watch: { repo, refs: [base, current, 'HEAD'], files: [reqFile, ...M.reportCandidates(repo, setting)], worktree },
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
      if (others.length < 2) return void vscode.window.showWarningMessage(L('VerifyLens: 비교하려면 기준 말고 브랜치가 두 개 있어야 합니다.', 'VerifyLens: comparing needs two branches besides the base.'));
      const a = await vscode.window.showQuickPick(others, { placeHolder: L('결과 A 브랜치', 'Branch for result A') });
      if (!a) return;
      const b = await vscode.window.showQuickPick(others.filter((x) => x !== a), { placeHolder: L('결과 B 브랜치', 'Branch for result B') });
      if (!b) return;
      const reqFile = await ensureReqs(repo);
      if (!reqFile) return;
      return execute({
        title: L(`${a} ↔ ${b} 비교 (기준 ${base})`, `Comparing ${a} ↔ ${b} (base ${base})`),
        fn: () => M.runRepo({ repo, base, a, b, reqFile, workingRef: M.currentBranch(repo) }),
        watch: { repo, refs: [base, a, b, 'HEAD'], files: [reqFile] },
      });
    }),

    vscode.commands.registerCommand('verifylens.rerun', async () => {
      if (!again || run?.kind === 'repo') if (await needTrust()) return;
      return again ? execute(again) : vscode.commands.executeCommand('verifylens.checkBranch');
    }),
    vscode.commands.registerCommand('verifylens.openReport', () => (run ? showReport() : vscode.window.showInformationMessage(runFirst()))),
    vscode.commands.registerCommand('verifylens.createRequirements', async () => {
      if (await needTrust()) return;
      return createReqs();
    }),
    vscode.commands.registerCommand('verifylens.focusRequirement', async (arg?: unknown) => {
      const id = await resolveReq(arg, L('어느 요구사항의 근거를 볼까요?', 'Which requirement do you want to see the evidence for?'));
      if (id) showReport(id);
    }),
    vscode.commands.registerCommand('verifylens.openDiff', (arg?: unknown) => openDiff(arg)),
    vscode.commands.registerCommand('verifylens.recordJudgment', (arg?: unknown) => recordJudgment(arg)),
    vscode.commands.registerCommand('verifylens.copySummary', (arg?: unknown) => copySummary(arg)),
    vscode.commands.registerCommand('verifylens.importRequirements', (arg?: unknown) => importRequirements(arg)),
    vscode.commands.registerCommand('verifylens.runTests', () => runTests()),
    vscode.commands.registerCommand('verifylens.openLocation', (setKey: string, file: string, line: number) => openLocation(setKey, file, line)),
  );
}

export function deactivate() {
  watcher?.dispose();
  panel?.dispose();
}

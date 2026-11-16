// 진짜 VS Code 안에서 시연 흐름을 차례로 실행한다. 화면은 capture.mjs 가 CDP 로 찍는다.
const vscode = require('vscode');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.VL_OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = (name) => fs.writeFileSync(path.join(OUT, 'stage.txt'), name);
const cmd = (...a) => vscode.commands.executeCommand(...a);

async function showAuth(ws, line) {
  const doc = await vscode.workspace.openTextDocument(path.join(ws, 'src', 'auth.ts'));
  const pos = new vscode.Position(line - 1, 0);
  const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Selection(pos, pos) });
  ed.revealRange(new vscode.Range(line - 9, 0, line + 8, 0), vscode.TextEditorRevealType.InCenter);
  return ed;
}
async function closeTabs(pred) {
  for (const g of vscode.window.tabGroups.all) for (const t of g.tabs) if (pred(t)) await vscode.window.tabGroups.close(t);
}

exports.run = async function run() {
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const only = process.env.VL_ONLY || '';
  try {
    stage('0-boot');
    await sleep(3500);
    await cmd('workbench.action.closeAllEditors');
    await cmd('workbench.view.explorer');
    let ed = await showAuth(ws, 21);
    stage('1-code');
    await sleep(3000);

    // 지금 브랜치 확인
    stage('2-checked');
    await cmd('verifylens.checkBranch');
    await sleep(1200);
    await closeTabs((t) => t.input && /verifylens\.report/.test(t.input.viewType || ''));
    await cmd('verifylens.requirements.focus');
    await cmd('notifications.clearAll').then(undefined, () => undefined);
    ed = await showAuth(ws, 21);
    await sleep(4500);

    // 마우스를 올리면 근거 표
    await cmd('workbench.action.focusActiveEditorGroup');
    ed.selection = new vscode.Selection(20, 12, 20, 12);
    stage('3-hover');
    await cmd('editor.action.showHover');
    await sleep(5500);
    await cmd('editor.action.hideHover').then(undefined, () => undefined);
    ed.selection = new vscode.Selection(19, 0, 19, 0);

    // 기준과 나란히 비교
    stage('4-diff');
    await cmd('verifylens.openDiff', 'R2');
    await sleep(4000);
    await closeTabs((t) => t.input && t.input.original && t.input.modified);

    if (only !== 'short') {
      // 고쳐서 커밋하고 테스트를 다시 돌리면 스스로 갱신된다
      ed = await showAuth(ws, 21);
      const line = ed.document.lineAt(20);
      const at = line.text.indexOf('> 5');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(ed.document.uri, new vscode.Range(20, at, 20, at + 3), '>= 5');
      stage('5-fix');
      await sleep(900);
      await vscode.workspace.applyEdit(edit);
      await ed.document.save();
      await sleep(1800);
      cp.execFileSync('git', ['-C', ws, 'commit', '-q', '-am', 'fix lockout'], { stdio: 'ignore' });
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      delete env.ELECTRON_RUN_AS_NODE;
      try {
        cp.execFileSync(process.env.VL_NODE, ['--test', '--test-reporter=junit', '--test-reporter-destination=.verifylens/junit.xml', 'test/lockout.test.ts'], { cwd: ws, stdio: 'ignore', env });
      } catch {
        /* 실패한 테스트가 있으면 종료 코드 1 */
      }
      stage('6-verified');
      await sleep(6000);
    }

    // PR 요약 미리 보기 (클립보드는 건드리지 않는다)
    stage('7-summary');
    const sum = await cmd('verifylens.copySummary', { dryRun: true });
    const file = path.join(OUT, 'PR-summary.md');
    fs.writeFileSync(file, sum, 'utf8');
    await cmd('markdown.showPreview', vscode.Uri.file(file));
    await sleep(6000);
    fs.writeFileSync(path.join(OUT, 'result.txt'), 'ok');
  } catch (e) {
    fs.writeFileSync(path.join(OUT, 'result.txt'), 'error: ' + (e && e.stack ? e.stack : e));
    throw e;
  } finally {
    stage('done');
    await sleep(800);
  }
};

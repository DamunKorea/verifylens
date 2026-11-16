// 진짜 VS Code 안에서 도는 시험. run.cjs 가 VS Code 를 띄우고 이 파일의 run() 을 부른다.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

exports.run = async function run() {
  const log = [];
  const ext = vscode.extensions.getExtension('damun.verifylens');
  assert.ok(ext, 'extension is loaded');
  await ext.activate();
  log.push(`activated ${ext.id} ${ext.packageJSON.version} on VS Code ${vscode.version} · trusted=${vscode.workspace.isTrusted}`);

  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['verifylens.runDemo', 'verifylens.checkBranch', 'verifylens.compareBranches', 'verifylens.requirements.focus']) assert.ok(cmds.includes(c), `command ${c}`);

  await vscode.commands.executeCommand('verifylens.runDemo');
  const tab = await waitFor(
    () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => t.input && /verifylens\.report/.test(t.input.viewType || '')),
    'report tab',
  );
  log.push(`report tab: "${tab.label}"`);

  await vscode.commands.executeCommand('verifylens.openLocation', 'B', 'src/auth.ts', 21);
  const ed = await waitFor(() => vscode.window.activeTextEditor?.document.uri.scheme === 'verifylens' && vscode.window.activeTextEditor, 'B document');
  assert.equal(ed.document.uri.path, '/B/src/auth.ts');
  assert.match(ed.document.lineAt(20).text, /failures > 5/);
  assert.equal(ed.selection.active.line, 20);
  assert.equal(ed.document.languageId, 'typescript');
  log.push(`opened ${ed.document.uri.path} line 21: ${ed.document.lineAt(20).text.trim()} (${ed.document.languageId})`);

  const lenses = await waitFor(async () => {
    const ls = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', ed.document.uri, 10);
    return ls && ls.length ? ls : null;
  }, 'code lenses');
  const titles = lenses.map((l) => l.command && l.command.title).filter(Boolean);
  assert.ok(titles.some((t) => /R2 · 다름 · 6번째 시도에 동작 \(요구사항 5회\) · 검사 실패/.test(t)), titles.join(' | '));
  log.push(...titles.map((t) => `lens: ${t}`));

  await vscode.commands.executeCommand('verifylens.focusRequirement', 'R3');
  await vscode.commands.executeCommand('verifylens.requirements.focus');
  log.push('focused requirements view and R3 in report');

  fs.writeFileSync(path.join(process.env.VL_OUT || __dirname, 'integration-result.txt'), log.join('\n') + '\n', 'utf8');
};

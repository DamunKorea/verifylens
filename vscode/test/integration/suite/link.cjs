// 링크(junction · 심볼릭 링크)로 연 폴더에서 「Check my changes」를 돌린다. run.cjs 가 그 폴더로 VS Code 를 띄운다.
// git 은 저장소 뿌리를 실제 경로로 알려 주지만, 표시 · 문제 목록 · 파일 열기는 편집기가 연 경로에 붙어야 한다.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const low = (p) => path.resolve(p).toLowerCase();
const under = (p, root) => low(p).startsWith(low(root) + path.sep);

exports.run = async function run() {
  const log = [];
  const opened = process.env.VL_LINK;
  const real = process.env.VL_REAL;
  const ext = vscode.extensions.getExtension('damun.verifylens');
  await ext.activate();
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  assert.equal(low(folder), low(opened), 'VS Code keeps the link path as the folder');
  log.push(`opened folder: ${folder} (a link to ${real})`);

  await vscode.commands.executeCommand('verifylens.checkBranch');
  const diags = await waitFor(() => {
    const d = vscode.languages.getDiagnostics().filter(([u, list]) => u.scheme === 'file' && list.some((x) => x.source === 'VerifyLens'));
    return d.length ? d : null;
  }, 'problems on files');
  for (const [u] of diags) assert.ok(under(u.fsPath, opened), `problem is on the opened path, not the real one: ${u.fsPath}`);
  log.push(`problems on: ${diags.map(([u]) => path.relative(opened, u.fsPath)).join(', ')} (all under the opened path)`);

  // 연 경로의 파일에 줄 위 표시가 붙는다
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(opened, 'src', 'auth.ts')));
  await vscode.window.showTextDocument(doc);
  const titles = await waitFor(async () => {
    const ls = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', doc.uri, 10);
    const ts = (ls || []).map((l) => l.command && l.command.title).filter((t) => /^VerifyLens R\d/.test(t || ''));
    return ts.length ? ts : null;
  }, 'code lenses on the opened file');
  log.push(`lenses on ${path.relative(opened, doc.uri.fsPath)}: ${[...new Set(titles)].join(' | ')}`);

  // 결과에서 파일을 열면 같은 (연 경로의) 파일이 열린다. 실제 경로로 두 번째 창이 열리지 않는다.
  await vscode.commands.executeCommand('verifylens.openLocation', 'A', 'src/auth.ts', 1);
  const ed = await waitFor(() => vscode.window.activeTextEditor, 'editor');
  assert.equal(ed.document.uri.scheme, 'file');
  assert.ok(under(ed.document.uri.fsPath, opened), `opened ${ed.document.uri.fsPath}`);
  const sameFile = vscode.workspace.textDocuments.filter((d) => d.uri.scheme === 'file' && path.basename(d.uri.fsPath) === 'auth.ts');
  assert.equal(sameFile.length, 1, sameFile.map((d) => d.uri.fsPath).join(' | '));
  log.push(`openLocation → ${path.relative(opened, ed.document.uri.fsPath)} (one editor for auth.ts)`);

  fs.writeFileSync(path.join(process.env.VL_OUT, 'integration-link-result.txt'), log.join('\n') + '\n', 'utf8');
};

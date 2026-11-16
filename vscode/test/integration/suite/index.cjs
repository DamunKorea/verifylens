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
  assert.ok(titles.includes('VerifyLens R2 · 다름'), titles.join(' | '));
  assert.ok(titles.includes('A ↔ B 비교') && titles.includes('판단 기록'), titles.join(' | '));
  log.push(`lenses: ${[...new Set(titles)].join(' | ')}`);

  // 문제(Problems) 목록: B 의 21번째 줄은 경고, A 의 17번째 줄은 정보
  const diags = vscode.languages.getDiagnostics().filter(([u]) => u.scheme === 'verifylens');
  const find = (key, code) => (diags.find(([u]) => u.path === `/${key}/src/auth.ts`) || [null, []])[1].find((d) => d.code === code);
  const dB = find('B', 'R2');
  assert.ok(dB, 'diagnostic on B');
  assert.equal(dB.severity, vscode.DiagnosticSeverity.Warning);
  assert.equal(dB.range.start.line, 20);
  assert.equal(dB.source, 'VerifyLens');
  assert.equal(find('A', 'R2').severity, vscode.DiagnosticSeverity.Information);
  log.push(`problem: [${dB.source}] ${dB.message}`);

  // 마우스를 올리면 근거 표가 나온다 (표시의 hoverMessage 를 VS Code 가 hover 로 돌려준다)
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', ed.document.uri, new vscode.Position(20, 8));
  const hoverText = (hovers || []).flatMap((h) => h.contents).map((c) => (typeof c === 'string' ? c : c.value)).join('\n');
  assert.match(hoverText, /VerifyLens · R2 · 다름/);
  assert.match(hoverText, /`auth\.ts:21` `user\.failures > 5`/);
  log.push('hover: evidence table with `auth.ts:21` `user.failures > 5` and command links');

  // 나란히 비교: VS Code 기본 비교 화면이 A | B 로 열린다
  await vscode.commands.executeCommand('verifylens.openDiff', 'R2');
  const diffTab = await waitFor(
    () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => t.input && t.input.original && t.input.modified),
    'diff tab',
  );
  assert.equal(diffTab.input.original.path, '/A/src/auth.ts');
  assert.equal(diffTab.input.modified.path, '/B/src/auth.ts');
  assert.equal(diffTab.label, 'R2 · A ↔ B · auth.ts');
  log.push(`diff tab: "${diffTab.label}" (${diffTab.input.original.path} | ${diffTab.input.modified.path})`);

  // PR 요약: 사용자의 클립보드를 건드리지 않도록 dryRun 으로 글만 받는다
  const sum = await vscode.commands.executeCommand('verifylens.copySummary', { dryRun: true });
  assert.match(sum, /^## VerifyLens 검증 요약\n\n\*\*요구사항 3개 중 1개만 근거와 검사로 확인됨\*\*/);
  assert.match(sum, /결과 B     1  2  3  4  5 \[6\]  ✗ 1회 늦음/);
  assert.match(sum, new RegExp('<sub>VerifyLens ' + ext.packageJSON.version.replace(/\./g, '\\.')));
  log.push(`PR summary: ${sum.split('\n').length} lines, starts "${sum.split('\n')[2]}"`);

  await vscode.commands.executeCommand('verifylens.focusRequirement', 'R3');
  await vscode.commands.executeCommand('verifylens.requirements.focus');
  log.push('focused requirements view and R3 in report');

  fs.writeFileSync(path.join(process.env.VL_OUT || __dirname, 'integration-result.txt'), log.join('\n') + '\n', 'utf8');
};

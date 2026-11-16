// 설치된 VS Code(Code.exe)를 별도 프로필로 띄워 확장을 시험한다. 사용자의 설정·확장은 건드리지 않는다.
// Cursor 로 시험하려면: VSCODE_EXE=<Cursor.exe 경로> VSCODE_ARGS=--classic  (Cursor 3 의 에이전트 창에서는 확장이 읽히지 않아 에디터 창으로 띄운다)
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { runTests } = require('@vscode/test-electron');

const code = process.env.VSCODE_EXE || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-vscode-test-'));
const outDir = process.env.VL_OUT || tmp;
const args = ['--disable-extensions', '--user-data-dir', path.join(tmp, 'user'), '--extensions-dir', path.join(tmp, 'ext'), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--new-window', ...(process.env.VSCODE_ARGS || '').split(' ').filter(Boolean)];
(async () => {
  await runTests({
    vscodeExecutablePath: code,
    extensionDevelopmentPath: path.join(__dirname, '..', '..'),
    extensionTestsPath: path.join(__dirname, 'suite', 'index.cjs'),
    extensionTestsEnv: { VL_OUT: outDir },
    launchArgs: args,
  });
  // 시험이 끝까지 가야 결과 파일이 생긴다. 실패해도 종료 코드 0 을 주는 에디터가 있어서 파일로 판정한다.
  const result = path.join(outDir, 'integration-result.txt');
  if (!fs.existsSync(result)) throw new Error('the suite did not finish (no integration-result.txt)');
  console.log('INTEGRATION OK');
  console.log(fs.readFileSync(result, 'utf8'));
})().catch((e) => {
  console.error('INTEGRATION FAILED', e);
  process.exit(1);
});

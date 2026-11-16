// 설치된 VS Code(Code.exe)를 별도 프로필로 띄워 확장을 시험한다. 사용자의 설정·확장은 건드리지 않는다.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { runTests } = require('@vscode/test-electron');

const code = process.env.VSCODE_EXE || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-vscode-test-'));
const outDir = process.env.VL_OUT || tmp;
(async () => {
  await runTests({
    vscodeExecutablePath: code,
    extensionDevelopmentPath: path.join(__dirname, '..', '..'),
    extensionTestsPath: path.join(__dirname, 'suite', 'index.cjs'),
    extensionTestsEnv: { VL_OUT: outDir },
    launchArgs: ['--disable-extensions', '--user-data-dir', path.join(tmp, 'user'), '--extensions-dir', path.join(tmp, 'ext'), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--new-window'],
  });
  console.log('INTEGRATION OK');
  console.log(fs.readFileSync(path.join(outDir, 'integration-result.txt'), 'utf8'));
})().catch((e) => {
  console.error('INTEGRATION FAILED', e);
  process.exit(1);
});

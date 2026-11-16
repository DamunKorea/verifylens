// 시연용 VS Code 를 별도 프로필로 띄우고(원격 디버깅 포트 포함) suite 를 실행한다.
// node record.cjs <vscode 확장 폴더> <작업 폴더> <결과 폴더>
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const [extDir, ws, out] = process.argv.slice(2);
const { runTests } = require(path.join(extDir, 'node_modules', '@vscode', 'test-electron'));

const code = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-gif-'));
fs.mkdirSync(path.join(tmp, 'user', 'User'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'user', 'User', 'settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'workbench.colorTheme': 'Dark Modern',
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.commandCenter.enabled': false,
    'chat.disableAIFeatures': true,
    'workbench.layoutControl.enabled': false,
    'window.commandCenter': false,
    'editor.minimap.enabled': false,
    'editor.fontSize': 15,
    'editor.lineHeight': 24,
    'editor.codeLensFontSize': 13,
    'workbench.tips.enabled': false,
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    'git.openRepositoryInParentFolders': 'never',
    'workbench.sideBar.location': 'left',
    'breadcrumbs.enabled': false,
    'window.zoomLevel': 0.5,
    'security.workspace.trust.enabled': false,
  }),
);
(async () => {
  await runTests({
    vscodeExecutablePath: code,
    extensionDevelopmentPath: extDir,
    extensionTestsPath: path.join(__dirname, 'suite', 'index.cjs'),
    extensionTestsEnv: { VL_OUT: out, VL_NODE: process.execPath, VL_ONLY: process.env.VL_ONLY || '' },
    launchArgs: [ws, '--user-data-dir', path.join(tmp, 'user'), '--extensions-dir', path.join(tmp, 'ext'), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--new-window', '--remote-debugging-port=9339', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
  });
  console.log('RECORD OK', fs.readFileSync(path.join(out, 'result.txt'), 'utf8'));
})().catch((e) => {
  console.error('RECORD FAILED', e && e.message);
  try { console.error(fs.readFileSync(path.join(out, 'result.txt'), 'utf8')); } catch {}
  process.exit(1);
});

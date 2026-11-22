// 설치된 VS Code(Code.exe)를 별도 프로필로 띄워 확장을 시험한다. 사용자의 설정·확장은 건드리지 않는다.
// Cursor 로 시험하려면: VSCODE_EXE=<Cursor.exe 경로> VSCODE_ARGS=--classic  (Cursor 3 의 에이전트 창에서는 확장이 읽히지 않아 에디터 창으로 띄운다)
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { runTests } = require('@vscode/test-electron');

/** 샘플(로그인 잠금)로 저장소를 만들어 결과 A 브랜치를 체크아웃해 두고, 그 저장소를 가리키는 링크를 만든다. */
function linkedRepo(dir) {
  const sample = path.join(__dirname, '..', '..', 'samples', 'login-lockout');
  const real = path.join(dir, 'real', 'repo');
  fs.mkdirSync(real, { recursive: true });
  const g = (...a) => execFileSync('git', ['-c', 'user.name=VerifyLens Test', '-c', 'user.email=test@example.invalid', '-c', 'core.autocrlf=false', '-C', real, ...a], { stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  fs.cpSync(path.join(sample, 'base'), real, { recursive: true });
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  g('checkout', '-q', '-b', 'feature/lockout');
  for (const part of ['shared', 'a']) fs.cpSync(path.join(sample, part), real, { recursive: true });
  g('add', '-A');
  g('commit', '-q', '-m', 'lockout');
  fs.mkdirSync(path.join(real, '.verifylens'));
  fs.copyFileSync(path.join(sample, 'requirements.en.md'), path.join(real, '.verifylens', 'requirements.md'));
  const opened = path.join(dir, 'opened');
  fs.symlinkSync(real, opened, 'junction');
  return { real, opened };
}

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

  // 두 번째: 링크(Windows 는 junction)로 연 저장소. git 은 실제 경로를 알려 준다 (0.22.0 에서 고침).
  const { real, opened } = linkedRepo(path.join(tmp, 'linked'));
  await runTests({
    vscodeExecutablePath: code,
    extensionDevelopmentPath: path.join(__dirname, '..', '..'),
    extensionTestsPath: path.join(__dirname, 'suite', 'link.cjs'),
    extensionTestsEnv: { VL_OUT: outDir, VL_LINK: opened, VL_REAL: real },
    launchArgs: [opened, ...args],
  });
  const linkResult = path.join(outDir, 'integration-link-result.txt');
  if (!fs.existsSync(linkResult)) throw new Error('the linked-folder suite did not finish (no integration-link-result.txt)');
  console.log('INTEGRATION (linked folder) OK');
  console.log(fs.readFileSync(linkResult, 'utf8'));
})().catch((e) => {
  console.error('INTEGRATION FAILED', e);
  process.exit(1);
});

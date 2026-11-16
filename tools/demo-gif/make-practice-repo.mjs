// 연습용 저장소 만들기: node practice.mjs <oss폴더> <만들 폴더> [--rehearse]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [oss, target, flag] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(join(oss, p)).href);
const { buildSampleRepo, SAMPLE } = await imp('src/demo.ts');

if (existsSync(target)) throw new Error('target exists: ' + target);
const env = buildSampleRepo();
cpSync(env.repo, target, { recursive: true });
const g = (...a) => execFileSync('git', ['-C', target, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
g('config', 'user.name', 'VerifyLens 연습');
g('config', 'user.email', 'practice@example.invalid');
g('checkout', '-q', 'feature/lockout-b');

mkdirSync(join(target, '.verifylens'), { recursive: true });
cpSync(join(SAMPLE, 'requirements.md'), join(target, '.verifylens', 'requirements.md'));
mkdirSync(join(target, '.vscode'), { recursive: true });
writeFileSync(join(target, '.vscode', 'settings.json'), JSON.stringify({ 'verifylens.baseBranch': 'main', 'verifylens.junitPath': '.verifylens/junit.xml' }, null, 2) + '\n');
const testCmd = 'node --test --test-reporter=junit --test-reporter-destination=.verifylens/junit.xml test/lockout.test.ts';
writeFileSync(join(target, '.vscode', 'tasks.json'), JSON.stringify({
  version: '2.0.0',
  tasks: [{ label: 'VerifyLens: 테스트 돌리기', type: 'shell', command: testCmd, problemMatcher: [], presentation: { reveal: 'always', panel: 'shared' } }],
}, null, 2) + '\n');
// 이 파일들은 커밋하지 않는다 (분석은 커밋된 코드 변경만 본다)
writeFileSync(join(target, '.git', 'info', 'exclude'), '.verifylens/\n.vscode/\n따라_해_보기.md\n', { flag: 'a' });

const runTests = () => {
  const e = { ...process.env }; delete e.NODE_TEST_CONTEXT;
  try { execFileSync(process.execPath, testCmd.split(' ').slice(1), { cwd: target, stdio: 'pipe', env: e }); } catch {}
};
runTests();
console.log('created', target, '| branch', g('rev-parse', '--abbrev-ref', 'HEAD').trim(), '| junit', existsSync(join(target, '.verifylens', 'junit.xml')));

if (flag === '--rehearse') {
  const M = await import(pathToFileURL(join(oss, 'vscode', 'src', 'model.ts')).href);
  const reqFile = join(target, '.verifylens', 'requirements.md');
  const junitA = join(target, '.verifylens', 'junit.xml');
  const st = (r) => r.report.summaries.map((s) => `${s.req.id}:${s.overall}`).join(' ');
  const r1 = M.runRepo({ repo: target, base: 'main', a: 'feature/lockout-b', reqFile, junitA, workingRef: 'feature/lockout-b' });
  console.log('before fix:', st(r1));
  const c = M.runRepo({ repo: target, base: 'main', a: 'feature/lockout-a', b: 'feature/lockout-b', reqFile, workingRef: 'feature/lockout-b' });
  console.log('compare A/B:', st(c));
  const f = join(target, 'src', 'auth.ts');
  const src = readFileSync(f, 'utf8');
  console.log('line 21 before:', src.split('\n')[20].trim());
  writeFileSync(f, src.replace('user.failures > 5', 'user.failures >= 5'));
  g('commit', '-q', '-am', 'fix lockout');
  runTests();
  const r2 = M.runRepo({ repo: target, base: 'main', a: 'feature/lockout-b', reqFile, junitA, workingRef: 'feature/lockout-b' });
  console.log('after fix:', st(r2));
  rmSync(target, { recursive: true, force: true });
}

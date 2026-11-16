import { cpSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SAMPLE = join(here, '..', 'samples', 'login-lockout');

export type DemoEnv = { root: string; repo: string; junitA: string; junitB: string; reqFile: string; prFile: string };

/** 샘플 저장소(main + 결과 A·B 두 브랜치)를 임시 폴더에 만들고, 두 결과에서 테스트를 실제로 실행해 JUnit 보고서를 만든다. */
export function buildSampleRepo(): DemoEnv {
  const root = mkdtempSync(join(tmpdir(), 'verifylens-demo-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  const g = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=VerifyLens Demo', '-c', 'user.email=demo@example.invalid', '-C', repo, ...a], { stdio: 'pipe', encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  cpSync(join(SAMPLE, 'base'), repo, { recursive: true });
  g('add', '-A');
  g('commit', '-q', '-m', 'base: login without lockout');
  for (const v of ['a', 'b']) {
    g('checkout', '-q', '-b', `feature/lockout-${v}`, 'main');
    cpSync(join(SAMPLE, v), repo, { recursive: true });
    cpSync(join(SAMPLE, 'shared'), repo, { recursive: true });
    g('add', '-A');
    g('commit', '-q', '-m', `feature: lockout (${v.toUpperCase()})`);
    g('checkout', '-q', 'main');
  }
  const junit: Record<string, string> = {};
  for (const v of ['a', 'b']) {
    const dir = join(root, `run-${v}`);
    mkdirSync(dir);
    cpSync(join(SAMPLE, 'base'), dir, { recursive: true });
    cpSync(join(SAMPLE, v), dir, { recursive: true });
    cpSync(join(SAMPLE, 'shared'), dir, { recursive: true });
    const out = join(root, `junit-${v}.xml`);
    try {
      execFileSync(process.execPath, ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, 'test/lockout.test.ts'], { cwd: dir, stdio: 'pipe' });
    } catch {
      // 실패한 테스트가 있으면 종료 코드가 1이다. 보고서 파일은 그대로 만들어진다.
    }
    if (!existsSync(out)) throw new Error(`테스트 보고서를 만들지 못했습니다: ${out}`);
    junit[v] = out;
  }
  return { root, repo, junitA: junit.a, junitB: junit.b, reqFile: join(SAMPLE, 'requirements.md'), prFile: join(SAMPLE, 'pr.md') };
}

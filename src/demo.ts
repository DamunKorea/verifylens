import { cpSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SAMPLE = join(here, '..', 'samples', 'login-lockout');

/** 샘플 커밋의 날짜를 고정해 실행할 때마다 같은 커밋 번호가 나오게 한다 (다시 실행해도 기록한 판단이 유지된다). */
const DEMO_DATE = '2026-01-01T00:00:00Z';

export type DemoEnv = { root: string; repo: string; junitA: string; junitB: string; reqFile: string; prFile: string; testsFromFallback: boolean };

/**
 * sampleDir: 샘플 폴더(기본은 이 저장소의 samples/login-lockout).
 * node: 테스트를 돌릴 Node 실행 파일. 기본은 지금 실행 중인 Node. null 이면 테스트를 돌리지 않고 fallbackJunit 을 쓴다.
 * fallbackJunit: 테스트를 돌릴 수 없을 때 대신 읽을 미리 만든 JUnit 보고서(에디터 확장처럼 Node 가 없을 수 있는 곳에서 쓴다).
 */
export type DemoOptions = { sampleDir?: string; node?: string | null; fallbackJunit?: { a: string; b: string } };

/** 샘플 저장소(main + 결과 A·B 두 브랜치)를 임시 폴더에 만들고, 두 결과에서 테스트를 실제로 실행해 JUnit 보고서를 만든다. */
export function buildSampleRepo(o: DemoOptions = {}): DemoEnv {
  const sample = o.sampleDir ?? SAMPLE;
  const root = mkdtempSync(join(tmpdir(), 'verifylens-demo-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  const g = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=VerifyLens Demo', '-c', 'user.email=demo@example.invalid', '-c', 'core.autocrlf=false', '-C', repo, ...a], { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: DEMO_DATE, GIT_COMMITTER_DATE: DEMO_DATE } });
  g('init', '-q', '-b', 'main');
  cpSync(join(sample, 'base'), repo, { recursive: true });
  g('add', '-A');
  g('commit', '-q', '-m', 'base: login without lockout');
  for (const v of ['a', 'b']) {
    g('checkout', '-q', '-b', `feature/lockout-${v}`, 'main');
    cpSync(join(sample, v), repo, { recursive: true });
    cpSync(join(sample, 'shared'), repo, { recursive: true });
    g('add', '-A');
    g('commit', '-q', '-m', `feature: lockout (${v.toUpperCase()})`);
    g('checkout', '-q', 'main');
  }
  const junit: Record<string, string> = {};
  let testsFromFallback = false;
  for (const v of ['a', 'b']) {
    const dir = join(root, `run-${v}`);
    mkdirSync(dir);
    cpSync(join(sample, 'base'), dir, { recursive: true });
    cpSync(join(sample, v), dir, { recursive: true });
    cpSync(join(sample, 'shared'), dir, { recursive: true });
    const out = join(root, `junit-${v}.xml`);
    if (o.node !== null) {
      // node --test 안에서 실행될 때 물려받는 NODE_TEST_CONTEXT 가 있으면 자식이 보고서 파일을 쓰지 않는다.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      try {
        execFileSync(o.node ?? process.execPath, ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, 'test/lockout.test.ts'], { cwd: dir, stdio: 'pipe', windowsHide: true, env });
      } catch {
        // 실패한 테스트가 있으면 종료 코드가 1이다. 보고서 파일은 그대로 만들어진다.
      }
    }
    const fallback = o.fallbackJunit?.[v as 'a' | 'b'];
    if (!existsSync(out) && fallback && existsSync(fallback)) {
      cpSync(fallback, out);
      testsFromFallback = true;
    }
    if (!existsSync(out)) throw new Error(`테스트 보고서를 만들지 못했습니다: ${out}`);
    junit[v] = out;
  }
  return { root, repo, junitA: junit.a, junitB: junit.b, reqFile: join(sample, 'requirements.md'), prFile: join(sample, 'pr.md'), testsFromFallback };
}

// VerifyLens JetBrains 판: 분석 엔진을 Node 용 한 파일로 묶는다 (vscode/build.mjs 와 같은 방식).
//   build/engine/verifylens-engine.cjs   — 플러그인이 사용자 PC 의 Node 로 실행하는 명령
//   build/engine/samples/…               — 「샘플로 해 보기」에 쓰는 로그인 잠금 예와 미리 만든 테스트 결과
// Node 22.18 이상에서 실행한다 (../src 의 TypeScript 를 바로 읽는다). esbuild 는 vscode/ 에 설치된 것을 쓴다.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSampleRepo } from '../src/demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// 출력 폴더는 첫 인자로 바꿀 수 있다 (Gradle 이 빌드 폴더를 옮겼을 때).
const out = process.argv[2] ? resolve(process.argv[2]) : join(here, 'build', 'engine');

let esbuild;
try {
  esbuild = createRequire(join(root, 'vscode', 'package.json'))('esbuild');
} catch {
  console.error('esbuild 를 찾지 못했습니다. 먼저 저장소 맨 위와 vscode/ 폴더에서 npm install 을 실행하세요.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'samples', 'junit'), { recursive: true });

// 1) 샘플을 플러그인 안으로 복사
cpSync(join(root, 'samples'), join(out, 'samples'), { recursive: true });

// 2) Node 22.18 미만인 PC 를 위해 샘플의 테스트 결과를 미리 만들어 넣는다. 임시 폴더 경로는 지운다.
const env = buildSampleRepo();
const roots = [env.root, env.root.replace(/\\/g, '/'), pathToFileURL(env.root).href];
for (const [k, f] of [['a', env.junitA], ['b', env.junitB]]) {
  let x = readFileSync(f, 'utf8');
  for (const r of roots) x = x.split(r).join('sample');
  writeFileSync(join(out, 'samples', 'junit', `junit-${k}.xml`), x, 'utf8');
}
rmSync(env.root, { recursive: true, force: true });

// 3) 엔진(TypeScript 컴파일러 API 포함)을 한 파일로. import.meta.url 은 CJS 에서 __filename 으로 바꾼다.
await esbuild.build({
  entryPoints: [join(here, 'engine', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: join(out, 'verifylens-engine.cjs'),
  define: { 'import.meta.url': '__vl_import_meta_url' },
  banner: { js: "const __vl_import_meta_url = require('url').pathToFileURL(__filename).href;" },
  minify: true,
  keepNames: true,
  legalComments: 'linked',
  logLevel: 'info',
});

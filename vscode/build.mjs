// VerifyLens VS Code 확장 빌드: 샘플 복사 → 미리 만든 테스트 결과(JUnit) → esbuild 번들
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSampleRepo } from '../src/demo.ts';

// 1) 데모 샘플을 확장 안으로 복사 (확장은 저장소의 samples 폴더를 볼 수 없다)
rmSync('samples', { recursive: true, force: true });
cpSync('../samples', 'samples', { recursive: true });

// 2) Node 22.18+ 가 없는 PC 를 위해 데모 테스트 결과를 미리 만들어 넣는다. 임시 폴더 경로는 지운다.
const env = buildSampleRepo();
mkdirSync('samples/junit', { recursive: true });
const roots = [env.root, env.root.replace(/\\/g, '/'), pathToFileURL(env.root).href];
for (const [k, f] of [['a', env.junitA], ['b', env.junitB]]) {
  let x = readFileSync(f, 'utf8');
  for (const r of roots) x = x.split(r).join('sample');
  writeFileSync(`samples/junit/junit-${k}.xml`, x, 'utf8');
}

// 3) 번들: 엔진(TypeScript 컴파일러 API 포함)까지 한 파일로. import.meta.url 은 CJS 에서 __filename 으로 바꾼다.
rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  define: { 'import.meta.url': '__vl_import_meta_url' },
  banner: { js: "const __vl_import_meta_url = require('url').pathToFileURL(__filename).href;" },
  minify: true,
  keepNames: true,
  legalComments: 'linked',
  logLevel: 'info',
});

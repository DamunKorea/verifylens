// 설치 없이 해 보는 페이지를 web/dist 에 만든다. esbuild 는 vscode/ 에 설치된 것을 쓴다.
//   node web/build.mjs
// 엔진에 들어 있는 git · 파일 시스템 코드는 이 페이지에서 부르지 않으므로, Node 모듈은 빈 껍데기로 바꿔 묶는다.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'dist');

let esbuild;
try {
  esbuild = createRequire(join(root, 'vscode', 'package.json'))('esbuild');
} catch {
  console.error('esbuild 를 찾지 못했습니다. 먼저 vscode/ 폴더에서 npm install 을 실행하세요.');
  process.exit(1);
}

const NODE_MODULES = /^(node:)?(fs|path|os|crypto|child_process|url|module|inspector|perf_hooks|util|buffer|stream|events|worker_threads|readline|assert|tty|net|v8|vm)$/;
const STUB_NAMES = [
  'execFileSync', 'spawn', 'spawnSync', 'createHash', 'cpSync', 'mkdirSync', 'mkdtempSync', 'existsSync', 'readFileSync', 'statSync', 'writeFileSync',
  'readdirSync', 'rmSync', 'copyFileSync', 'tmpdir', 'homedir', 'dirname', 'join', 'resolve', 'relative', 'basename', 'isAbsolute', 'extname',
  'fileURLToPath', 'pathToFileURL', 'createRequire', 'realpathSync', 'sep',
];
const nodeStub = {
  name: 'node-stub',
  setup(build) {
    build.onResolve({ filter: NODE_MODULES }, (args) => ({ path: args.path, namespace: 'node-stub' }));
    // 엔진이 가져오는 이름마다 빈 값을 돌려주는 함수를 둔다. 이 페이지에서는 불리지 않는다.
    // 이름이 빠지면 esbuild 가 「No matching export」로 멈추므로, 새 이름이 생기면 여기에 더한다.
    build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
      contents: [
        'const noop = function () { return ""; };',
        `export const ${STUB_NAMES.map((n) => `${n} = noop`).join(', ')};`,
        'export default new Proxy({}, { get: () => noop });',
      ].join('\n'),
      loader: 'js',
    }));
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(here, 'main.ts')],
  outfile: join(out, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'external',
  plugins: [nodeStub],
  logLevel: 'warning',
  metafile: true,
});

copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
copyFileSync(join(root, 'jetbrains', 'src', 'main', 'resources', 'META-INF', 'pluginIcon.svg'), join(out, 'icon.svg'));

const size = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`web/dist 를 만들었습니다 (${(size / 1024 / 1024).toFixed(1)} MB)`);

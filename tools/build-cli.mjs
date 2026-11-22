// 명령줄을 자바스크립트 파일 하나(dist/cli.mjs)로 묶는다. `npx github:DamunKorea/verifylens …` 가 이 파일을 실행한다.
//   node tools/build-cli.mjs          만든다
//   node tools/build-cli.mjs --check  저장소의 dist/cli.mjs 가 src 와 맞는지만 본다 (맞지 않으면 종료 코드 1)
// Node 는 node_modules 안의 .ts 파일을 바로 실행하지 않으므로(타입 지우기를 하지 않음), npx 로 받은 패키지에는 묶은 파일이 필요하다.
// typescript 는 묶지 않고 의존성으로 둔다 (묶으면 저장소에 수 MB 파일이 판마다 쌓인다).
// esbuild 는 vscode/ 에 설치된 것을 쓴다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'dist', 'cli.mjs');
const check = process.argv.includes('--check');

let esbuild;
try {
  esbuild = createRequire(join(root, 'vscode', 'package.json'))('esbuild');
} catch {
  console.error('esbuild 를 찾지 못했습니다. 먼저 vscode/ 폴더에서 npm install 을 실행하세요.');
  process.exit(2);
}

const result = await esbuild.build({
  // 묶은 파일 안의 경로 주석이 어디서 돌려도 같게 (그래야 --check 가 맞는다)
  absWorkingDir: root,
  entryPoints: [join(root, 'src', 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['typescript'],
  banner: { js: '#!/usr/bin/env node\n// VerifyLens command line, bundled from src/ by tools/build-cli.mjs. Do not edit; edit src/ and rebuild.' },
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});
const code = result.outputFiles[0].text.replace(/\r\n/g, '\n');

if (check) {
  const now = existsSync(outfile) ? readFileSync(outfile, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== code) {
    console.error('dist/cli.mjs 가 src 와 맞지 않습니다. node tools/build-cli.mjs 로 다시 만들어 커밋하세요.');
    process.exit(1);
  }
  console.log('dist/cli.mjs 가 src 와 맞습니다.');
} else {
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, code);
  console.log(`dist/cli.mjs 를 만들었습니다 (${(code.length / 1024).toFixed(0)} KB)`);
}

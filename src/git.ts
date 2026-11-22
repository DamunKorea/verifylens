import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', '-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** 저장소 뿌리. 폴더를 연 경로 그대로 돌려준다 (inCallerSpelling). */
export function topLevel(dir: string): string {
  const root = git(dir, ['rev-parse', '--show-toplevel']).trim();
  return root ? inCallerSpelling(dir, root) : root;
}

/**
 * git 은 저장소 뿌리를 실제 경로(C:/…)로 알려 준다. subst 드라이브(V:) · junction · 심볼릭 링크로 연 폴더면
 * 편집기가 쓰는 경로와 어긋나서, 열린 파일이 결과와 이어지지 않는다.
 * 실제 경로로 몇 단계 아래인지 세어 부른 쪽 경로에서 그만큼 올라간다. 어긋나지 않으면 git 이 준 그대로.
 * Node 의 realpathSync(JS 판)는 subst 드라이브를 풀지 못해 .native 를 쓴다.
 */
export function inCallerSpelling(start: string, root: string): string {
  const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  try {
    const from = resolve(start);
    const realRoot = realpathSync.native(root);
    const below = relative(realRoot, realpathSync.native(from));
    if (below === '..' || below.startsWith('..' + sep) || isAbsolute(below)) return root;
    let dir = from;
    for (const part of below.split(sep)) if (part) dir = dirname(dir);
    if (same(dir, resolve(root))) return root;
    return same(realpathSync.native(dir), realRoot) ? dir : root;
  } catch {
    return root;
  }
}

export function shortSha(repo: string, ref: string): string {
  return git(repo, ['rev-parse', '--short', ref]).trim();
}

export function changedFiles(repo: string, base: string, head: string): string[] {
  return git(repo, ['diff', '--name-only', '--diff-filter=AMR', `${base}...${head}`]).split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * 바뀐 파일과 그 전 경로 (지운 파일 · 이름 바꾼 파일 포함).
 * head 를 주면 base...head(갈라진 지점부터), 주지 않으면 base 커밋과 지금 작업 폴더를 견준다.
 */
export function changedPaths(repo: string, base: string, head?: string): { path: string; old: string; deleted: boolean }[] {
  const out = git(repo, ['diff', '--name-status', '-M', '--no-color', head ? `${base}...${head}` : base]);
  const rows: { path: string; old: string; deleted: boolean }[] = [];
  for (const line of out.split('\n')) {
    const p = line.split('\t');
    if (p.length < 2) continue;
    const st = p[0].trim();
    if (st.startsWith('R') && p.length >= 3) rows.push({ path: p[2].trim(), old: p[1].trim(), deleted: false });
    else if (st === 'D') rows.push({ path: p[1].trim(), old: p[1].trim(), deleted: true });
    else if (st === 'M') rows.push({ path: p[1].trim(), old: p[1].trim(), deleted: false });
  }
  return rows;
}

export function changedLines(repo: string, base: string, head: string): Map<string, Set<number>> {
  return parseDiffLines(git(repo, ['diff', '-U0', '--no-color', '--diff-filter=AMR', `${base}...${head}`]));
}

const list = (out: string) => out.split('\n').map((s) => s.trim()).filter(Boolean);

/** 그 시점의 저장소 파일 목록 (경로 별칭으로 가져온 파일을 찾을 때 쓴다) */
export function trackedFiles(repo: string, ref: string): string[] {
  return list(git(repo, ['ls-tree', '-r', '--name-only', ref]));
}

/** base 와 갈라진 지점. 작업 폴더(커밋 전 변경 포함)를 이 커밋과 비교한다. */
export function mergeBase(repo: string, base: string, head = 'HEAD'): string {
  return git(repo, ['merge-base', base, head]).trim();
}
/** 아직 git 이 모르는 새 파일 (.gitignore 에 걸린 것은 뺀다) */
export function untrackedFiles(repo: string): string[] {
  // .gitignore 에 없더라도 node_modules 는 사용자의 변경이 아니다.
  return list(git(repo, ['ls-files', '--others', '--exclude-standard'])).filter((f) => !/(^|\/)node_modules\//.test(f));
}
/** 작업 폴더가 from 커밋과 다른 파일: 커밋한 것 + 커밋 전 수정 + 새 파일 */
export function worktreeChangedFiles(repo: string, from: string): string[] {
  return [...new Set([...list(git(repo, ['diff', '--name-only', '--diff-filter=AMR', from])), ...untrackedFiles(repo)])];
}
/** 작업 폴더에서 from 커밋 이후 바뀐 줄. 새 파일은 여기 없다(전체가 바뀐 것으로 본다). */
export function worktreeChangedLines(repo: string, from: string): Map<string, Set<number>> {
  return parseDiffLines(git(repo, ['diff', '-U0', '--no-color', '--diff-filter=AMR', from]));
}
/** 마지막 커밋 뒤로 손댄 파일 (커밋 전 수정 + 새 파일) */
export function uncommittedFiles(repo: string): string[] {
  return [...new Set([...list(git(repo, ['diff', '--name-only', 'HEAD'])), ...untrackedFiles(repo)])];
}

function parseDiffLines(out: string): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  let file = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : '';
      if (file) map.set(file, new Set());
    } else if (line.startsWith('@@') && file) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) map.get(file)!.add(start + i);
    }
  }
  return map;
}

export function showFile(repo: string, ref: string, path: string): string | null {
  try {
    return git(repo, ['show', `${ref}:${path}`]);
  } catch {
    return null;
  }
}

import { execFileSync } from 'node:child_process';

export function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', '-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function shortSha(repo: string, ref: string): string {
  return git(repo, ['rev-parse', '--short', ref]).trim();
}

export function changedFiles(repo: string, base: string, head: string): string[] {
  return git(repo, ['diff', '--name-only', '--diff-filter=AMR', `${base}...${head}`]).split('\n').map((s) => s.trim()).filter(Boolean);
}

export function changedLines(repo: string, base: string, head: string): Map<string, Set<number>> {
  return parseDiffLines(git(repo, ['diff', '-U0', '--no-color', '--diff-filter=AMR', `${base}...${head}`]));
}

const list = (out: string) => out.split('\n').map((s) => s.trim()).filter(Boolean);

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

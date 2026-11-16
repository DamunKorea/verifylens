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
  const out = git(repo, ['diff', '-U0', '--no-color', '--diff-filter=AMR', `${base}...${head}`]);
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

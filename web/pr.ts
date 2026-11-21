// 공개 GitHub PR 을 브라우저에서 읽어 온다: PR 글 · PR 이 닫는 이슈의 글 · PR 이 바꾼 TypeScript/JavaScript 파일.
// GitHub 의 공개 API(api.github.com)와 파일 주소(raw.githubusercontent.com)만 부른다. 로그인 · 토큰 · 우리 서버는 없다.
// 로그인하지 않은 API 는 한 시간에 60번까지라서, PR 하나에 몇 번만 부르도록 짠다(PR 1 · 파일 목록 1~3 · 이슈 0~3 · 갈라진 지점 0~1).
import { requirementsFrom, type SourceText } from '../vscode/src/model.ts';
import { L } from '../src/i18n.ts';

export type PrRef = { owner: string; repo: string; number: number };

/** github.com/o/r/pull/12 (뒤에 /files 같은 것이 붙어도 됨) 또는 o/r#12 */
export function parsePrUrl(s: string): PrRef | null {
  const t = s.trim();
  const m =
    t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i) ??
    t.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, ''), number: Number(m[3]) };
}

export const prUrl = (r: PrRef) => `https://github.com/${r.owner}/${r.repo}/pull/${r.number}`;

export type SkipWhy = 'not-code' | 'generated' | 'removed' | 'too-large' | 'limit' | 'failed';
export type LoadedPr = {
  ref: PrRef;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  headSha: string;
  /** 요구사항 후보 (PR 이 닫는 이슈 → PR 글 → 글에 목록이 없으면 제목) */
  requirements: string[];
  /** 요구사항을 가져온 곳 (「issue #3」, 「PR #12」, 「PR #12 title」) */
  sources: string[];
  /** PR 끝의 파일 내용 (바뀐 코드 파일만) */
  files: Record<string, string>;
  /** 갈라진 지점의 검사 파일 내용 (바뀐 · 지운 검사를 보려고) */
  baseFiles: Record<string, string>;
  /** 파일마다 PR 이 바꾼 줄. null 은 새 파일이거나 줄을 알 수 없음(파일 전체를 바뀐 것으로 본다) */
  changed: Record<string, number[] | null>;
  skipped: { path: string; why: SkipWhy }[];
  /** PR 이 바꾼 파일 수 (코드가 아닌 것까지) */
  totalFiles: number;
};

export type PrErrorKind = 'bad-url' | 'not-found' | 'rate-limit' | 'network' | 'no-code' | 'http';
export class PrError extends Error {
  readonly kind: PrErrorKind;
  /** rate-limit 일 때 다시 쓸 수 있는 시각 */
  readonly resetAt?: Date;
  constructor(kind: PrErrorKind, message: string, resetAt?: Date) {
    super(message);
    this.kind = kind;
    this.resetAt = resetAt;
  }
}

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
// 엔진과 같은 검사 파일 모양 (맨 앞의 test/ 도 검사 폴더로 본다)
const TEST_FILE = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/)/;
const GENERATED = /(^|\/)(node_modules|dist|build|out|vendor|coverage|\.next)\/|\.min\.[cm]?js$|\.d\.[cm]?ts$/;
/** 내용을 읽어 오는 코드 파일 수의 한도 (큰 PR 에서 브라우저가 멈추지 않게) */
export const MAX_CODE_FILES = 80;
const MAX_BYTES = 400_000;
const MAX_ISSUES = 3;

/** GitHub 의 patch(맥락 줄이 있는 diff)에서 새 쪽의 바뀐 줄 번호 */
export function patchLines(patch: string | undefined): number[] | null {
  if (!patch) return null;
  const out: number[] = [];
  let n = 0;
  for (const l of patch.split('\n')) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      n = Number(h[1]);
      continue;
    }
    if (l.startsWith('+')) out.push(n++);
    else if (l.startsWith('-') || l.startsWith('\\')) continue;
    else n++;
  }
  return out;
}

/** PR 글에서 「closes #3」 · 「fixes o/r#4」 · 「resolves https://github.com/o/r/issues/5」 */
export function closingIssues(body: string, ref: PrRef): PrRef[] {
  const out: PrRef[] = [];
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+)\/([\w.-]+)#(\d+)|#(\d+)|https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+))/gi;
  for (const m of body.matchAll(re)) {
    const r = m[4] ? { owner: ref.owner, repo: ref.repo, number: Number(m[4]) } : m[3] ? { owner: m[1], repo: m[2], number: Number(m[3]) } : { owner: m[5], repo: m[6], number: Number(m[7]) };
    if (!out.some((x) => x.owner === r.owner && x.repo === r.repo && x.number === r.number)) out.push(r);
  }
  return out.slice(0, MAX_ISSUES);
}

const rawUrl = (fullName: string, sha: string, path: string) => `https://raw.githubusercontent.com/${fullName}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;

type GhPull = {
  title?: string;
  body?: string | null;
  html_url?: string;
  state?: string;
  merged_at?: string | null;
  head?: { sha?: string; repo?: { full_name?: string } | null };
  base?: { sha?: string; repo?: { full_name?: string } | null };
};
type GhFile = { filename: string; status: string; previous_filename?: string; patch?: string };

export async function loadPr(input: string, fetchImpl: Fetch = (u, i) => fetch(u, i)): Promise<LoadedPr> {
  const ref = parsePrUrl(input);
  if (!ref) throw new PrError('bad-url', input);
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;

  const get = async (url: string): Promise<Response> => {
    let res: Response;
    try {
      res = await fetchImpl(url, url.startsWith('https://api.github.com/') ? { headers: { Accept: 'application/vnd.github+json' } } : undefined);
    } catch (e) {
      throw new PrError('network', e instanceof Error ? e.message : String(e));
    }
    if (res.ok) return res;
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      throw new PrError('rate-limit', `HTTP ${res.status}`, reset ? new Date(reset * 1000) : undefined);
    }
    if (res.status === 404 || res.status === 451) throw new PrError('not-found', `HTTP ${res.status}`);
    throw new PrError('http', `HTTP ${res.status}`);
  };
  const json = async <T>(url: string) => (await (await get(url)).json()) as T;

  const pull = await json<GhPull>(`${api}/pulls/${ref.number}`);
  const headSha = pull.head?.sha ?? '';
  const baseSha = pull.base?.sha ?? '';
  const baseRepo = pull.base?.repo?.full_name ?? `${ref.owner}/${ref.repo}`;
  // 포크가 지워졌으면 PR 끝 커밋은 원래 저장소에서도 읽을 수 있다
  const headRepo = pull.head?.repo?.full_name ?? baseRepo;

  // 요구사항: PR 이 닫는 이슈의 글을 앞에 둔다 (확장의 「요구사항 가져오기」와 같은 차례)
  const texts: SourceText[] = [];
  for (const issue of closingIssues(pull.body ?? '', ref)) {
    try {
      const it = await json<{ number?: number; title?: string; body?: string | null; html_url?: string; pull_request?: unknown }>(`https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`);
      if (it.pull_request) continue;
      const same = issue.owner === ref.owner && issue.repo === ref.repo;
      const num = `${same ? '' : `${issue.owner}/${issue.repo}`}#${it.number ?? issue.number}`;
      texts.push({ label: L(`이슈 ${num}`, `issue ${num}`), url: it.html_url ?? '', title: it.title ?? '', body: it.body ?? '' });
    } catch (e) {
      if (e instanceof PrError && e.kind === 'rate-limit') throw e;
      /* 읽지 못한 이슈는 건너뛴다 */
    }
  }
  texts.push({ label: `PR #${ref.number}`, url: pull.html_url ?? prUrl(ref), title: pull.title ?? '', body: pull.body ?? '' });
  const { requirements, sources } = requirementsFrom(texts);

  // 바뀐 파일 목록 (한 쪽에 100개, 300개까지)
  const list: GhFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const part = await json<GhFile[]>(`${api}/pulls/${ref.number}/files?per_page=100&page=${page}`);
    list.push(...part);
    if (part.length < 100) break;
  }

  const skipped: LoadedPr['skipped'] = [];
  const heads: GhFile[] = [];
  const bases: GhFile[] = [];
  for (const f of list) {
    if (!CODE_EXT.test(f.filename)) skipped.push({ path: f.filename, why: 'not-code' });
    else if (GENERATED.test(f.filename)) skipped.push({ path: f.filename, why: 'generated' });
    else {
      const test = TEST_FILE.test(f.filename);
      if (f.status === 'removed') {
        if (test) bases.push(f);
        else skipped.push({ path: f.filename, why: 'removed' });
        continue;
      }
      if (heads.length >= MAX_CODE_FILES) {
        skipped.push({ path: f.filename, why: 'limit' });
        continue;
      }
      heads.push(f);
      if (test && f.status !== 'added') bases.push(f);
    }
  }
  if (!heads.length && !bases.length) throw new PrError('no-code', `${list.length}`);

  // 검사 파일을 견줄 기준은 갈라진 지점이다. 못 읽으면 기준 브랜치의 끝을 쓴다.
  let fork = baseSha;
  if (bases.length && baseSha && headSha) {
    try {
      fork = (await json<{ merge_base_commit?: { sha?: string } }>(`${api}/compare/${baseSha}...${headSha}?per_page=1`)).merge_base_commit?.sha ?? baseSha;
    } catch (e) {
      if (e instanceof PrError && e.kind === 'rate-limit') throw e;
    }
  }

  const files: Record<string, string> = {};
  const baseFiles: Record<string, string> = {};
  const changed: Record<string, number[] | null> = {};
  const text = async (url: string): Promise<string | null> => {
    const res = await get(url);
    const body = await res.text();
    return body.length > MAX_BYTES ? null : body.replace(/\r\n/g, '\n');
  };
  type Job = () => Promise<void>;
  const jobs: Job[] = [
    ...heads.map((f): Job => async () => {
      try {
        const body = await text(rawUrl(headRepo, headSha, f.filename));
        if (body === null) return void skipped.push({ path: f.filename, why: 'too-large' });
        files[f.filename] = body;
        changed[f.filename] = f.status === 'added' ? null : patchLines(f.patch);
      } catch {
        skipped.push({ path: f.filename, why: 'failed' });
      }
    }),
    ...bases.map((f): Job => async () => {
      try {
        // 이름을 바꾼 검사 파일은 옛 이름으로 읽어 새 이름에 둔다 (확장과 같다)
        const body = await text(rawUrl(baseRepo, fork, f.previous_filename ?? f.filename));
        if (body !== null) baseFiles[f.filename] = body;
      } catch {
        /* 기준 쪽을 못 읽으면 그 파일의 바뀐 검사는 보이지 않는다 */
      }
    }),
  ];
  // 한꺼번에 여섯 개씩
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
  // 바뀌지 않은 검사 파일이 기준 쪽에만 있으면 엔진이 「지운 검사」로 보므로, 끝 쪽에도 있는 파일은 그대로 둔다.
  // 끝 쪽을 못 읽은 검사 파일은 기준 쪽도 뺀다 (못 읽은 것을 지운 것으로 보지 않게).
  for (const f of Object.keys(baseFiles)) if (!(f in files) && !list.some((x) => x.filename === f && x.status === 'removed')) delete baseFiles[f];

  if (!Object.keys(files).length && !Object.keys(baseFiles).length) throw new PrError('no-code', `${list.length}`);
  return {
    ref,
    url: pull.html_url ?? prUrl(ref),
    title: pull.title ?? '',
    state: pull.merged_at ? 'merged' : pull.state === 'closed' ? 'closed' : 'open',
    headSha,
    requirements,
    sources,
    files,
    baseFiles,
    changed,
    skipped: skipped.sort((a, b) => a.path.localeCompare(b.path)),
    totalFiles: list.length,
  };
}

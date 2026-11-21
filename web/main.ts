import { palette, light, dark, tones, marks } from '../src/verdictStyle.ts';
import { evidenceChain, attemptComparison, attemptChart, evidenceCSS } from '../src/evidenceView.ts';
// 설치 없이 해 보는 페이지의 화면. 입력이 바뀌면 같은 엔진으로 다시 판정한다.
import { codeFileName, runCheck, type TryResult, type TryRow, type TryTest } from './check.ts';
import { EXAMPLES, type Example } from './examples.ts';

type Lang = 'en' | 'ko';

const LINKS = {
  vscode: 'https://marketplace.visualstudio.com/items?itemName=damun.verifylens',
  openvsx: 'https://open-vsx.org/extension/damun/verifylens',
  jetbrains: 'https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.4.1',
  github: 'https://github.com/DamunKorea/verifylens',
};

// 고정 문구만 담는다. 사용자가 넣은 글은 이 표를 거치지 않고 textContent 로만 그린다.
const T: Record<string, { en: string; ko: string }> = {
  title: { en: 'Check code against a requirement', ko: '요구사항대로 동작하는지 확인하세요' },
  lead: { en: 'Follow the code line and test result behind each verdict.', ko: '각 판정의 근거가 된 코드 줄과 테스트 결과를 따라가 보세요.' },
  edit: { en: 'Try your own code', ko: '내 코드로 해 보기' },
  privacy: {
    en: '🔒 Runs entirely in this page. Nothing you paste is sent anywhere, and no LLM is used.',
    ko: '🔒 이 페이지 안에서만 돌아갑니다. 넣은 내용은 어디로도 보내지 않고, AI 판정도 쓰지 않습니다.',
  },
  examples: { en: 'Examples:', ko: '예제:' },
  input: { en: 'Input', ko: '입력' },
  reqLabel: { en: '1. Requirements', ko: '1. 요구사항' },
  reqHint: {
    en: 'One per line. Optionally add “| keywords: words that appear in the code”.',
    ko: '한 줄에 하나씩 적습니다. 필요하면 「| keywords: 코드에 나오는 영어 단어」를 붙입니다.',
  },
  codeLabel: { en: '2. Code', ko: '2. 코드' },
  codeHint: { en: 'One TypeScript or JavaScript file. Edit it and the result updates.', ko: 'TypeScript나 JavaScript 파일 하나입니다. 고치면 결과가 바로 바뀝니다.' },
  testLabel: { en: '3. Tests you ran (optional)', ko: '3. 돌린 테스트 (선택)' },
  testHint: {
    en: 'Test names and whether they passed. A requirement without a linked test stays Unverified.',
    ko: '테스트 이름과 통과 여부입니다. 이어진 테스트가 없는 요구사항은 「미확인」으로 남습니다.',
  },
  addTest: { en: '+ Add a test', ko: '+ 테스트 추가' },
  testName: { en: 'test name', ko: '테스트 이름' },
  pass: { en: 'passed', ko: '통과' },
  fail: { en: 'failed', ko: '실패' },
  remove: { en: 'Remove this test', ko: '이 테스트 지우기' },
  result: { en: 'Result', ko: '결과' },
  loading: { en: 'Loading the analysis engine…', ko: '분석 엔진을 불러오는 중…' },
  noReqs: { en: 'Write at least one requirement.', ko: '요구사항을 한 줄 이상 적어 주세요.' },
  testsCleared: {
    en: 'Your requirements or code no longer match the example, so its tests were removed. Add the tests you ran, if any.',
    ko: '요구사항이나 코드가 예제와 달라져서 예제의 테스트를 뺐습니다. 직접 돌린 테스트가 있으면 적어 주세요.',
  },
  jump: { en: 'See results ↓', ko: '결과 보기 ↓' },
  error: { en: 'Could not analyze this input: ', ko: '이 입력은 분석하지 못했습니다: ' },
  codecap: { en: 'each verdict is shown under the line it is based on', ko: '판정은 근거가 된 줄 바로 아래에 있습니다' },
  linked: { en: 'Linked tests: ', ko: '이어진 테스트: ' },
  noLinked: { en: 'No linked test', ko: '이어진 테스트 없음' },
  nextTitle: { en: 'Use it on your own repository', ko: '내 저장소에서 쓰기' },
  nextBody: {
    en: `The extension checks your whole working tree against the base branch and reads your real test reports: <a href="${LINKS.vscode}">VS Code</a> · <a href="${LINKS.openvsx}">Cursor (Open VSX)</a> · <a href="${LINKS.jetbrains}">JetBrains (preview)</a> · <a href="${LINKS.github}">GitHub</a>`,
    ko: `확장은 작업 폴더 전체를 기준 브랜치와 비교하고 실제 테스트 결과를 읽습니다: <a href="${LINKS.vscode}">VS Code</a> · <a href="${LINKS.openvsx}">Cursor (Open VSX)</a> · <a href="${LINKS.jetbrains}">JetBrains (미리 보기)</a> · <a href="${LINKS.github}">GitHub</a>`,
  },
  limits: { en: 'What this page does not do', ko: '이 페이지가 하지 않는 것' },
  limit1: {
    en: 'It reads one file and the test names you type. The extension reads your repository and real test results.',
    ko: '파일 하나와 직접 적은 테스트 이름만 봅니다. 확장은 저장소 전체와 실제 테스트 결과를 읽습니다.',
  },
  limit2: {
    en: 'The analysis is rule-based, so it can miss or misread code shapes it has not seen. Unverified means it could not decide, not that the code is fine.',
    ko: '규칙으로 분석하므로 처음 보는 코드 모양은 놓치거나 잘못 읽을 수 있습니다. 「미확인」은 판단하지 못했다는 뜻이지 괜찮다는 뜻이 아닙니다.',
  },
  limit3: {
    en: `TypeScript and JavaScript only. MIT licensed, <a href="${LINKS.github}">source on GitHub</a>.`,
    ko: `TypeScript · JavaScript만 분석합니다. MIT 라이선스이고 <a href="${LINKS.github}">소스는 GitHub</a>에 있습니다.`,
  },
};

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const reqsEl = $<HTMLTextAreaElement>('reqs');
const codeEl = $<HTMLTextAreaElement>('code');
const fileEl = $<HTMLInputElement>('file');
const testsEl = $('tests');
const statusEl = $('status');
const headlineEl = $('headline');
const cardsEl = $('cards');
const codewrapEl = $('codewrap');
const codecapEl = $('codecap');
const codeviewEl = $('codeview');
const testsNoteEl = $('tests-note');
const jumpbarEl = $('jumpbar');
const jumpwhatEl = $('jumpwhat');
const outEl = $('out');

let lang: Lang = initialLang();
let current: Example | null = null;
let tests: TryTest[] = [];
/** 지금 테스트 칸이 어느 예제에서 온 그대로인가. 사용자가 테스트를 고치면 null */
let testsFrom: Example | null = null;

function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'ko') return q;
  try {
    const saved = localStorage.getItem('verifylens.try.lang');
    if (saved === 'en' || saved === 'ko') return saved;
  } catch {
    // 저장소를 못 쓰는 창에서는 브라우저 언어를 따른다
  }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function applyTexts() {
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll<HTMLElement>('[data-t]')) {
    const s = T[node.dataset.t!]?.[lang] ?? '';
    // 링크가 들어 있는 고정 문구만 HTML 로 넣는다
    if (s.includes('<a ')) node.innerHTML = s;
    else node.textContent = s;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.lang button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  document.title = lang === 'ko' ? 'VerifyLens 해 보기' : 'Try VerifyLens';
  renderExamples();
  renderTests();
}

function renderExamples() {
  const box = $('examples');
  for (const old of box.querySelectorAll('button')) old.remove();
  for (const ex of EXAMPLES) {
    const b = el('button', 'chip', ex.label[lang]);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(current?.id === ex.id));
    b.addEventListener('click', () => load(ex));
    box.append(b);
  }
}

function load(ex: Example) {
  clearTimeout(timer);
  current = ex;
  reqsEl.value = ex.requirements[lang];
  fileEl.value = ex.fileName;
  codeEl.value = ex.code;
  tests = ex.tests[lang].map((t) => ({ ...t }));
  testsFrom = ex;
  testsNoteEl.hidden = true;
  renderExamples();
  renderTests();
  run();
}

function renderTests() {
  testsEl.replaceChildren();
  tests.forEach((t, i) => {
    const row = el('div', 'test');
    const name = el('input');
    name.type = 'text';
    name.value = t.name;
    name.placeholder = T.testName[lang];
    name.setAttribute('aria-label', T.testName[lang]);
    name.spellcheck = false;
    name.addEventListener('input', () => {
      tests[i].name = name.value;
      testsFrom = null;
      edited();
    });
    const status = el('select');
    status.setAttribute('aria-label', `${T.pass[lang]} / ${T.fail[lang]}`);
    for (const v of ['pass', 'fail'] as const) {
      const o = el('option', undefined, T[v][lang]);
      o.value = v;
      o.selected = t.status === v;
      status.append(o);
    }
    status.addEventListener('change', () => {
      tests[i].status = status.value as TryTest['status'];
      testsFrom = null;
      edited();
    });
    const del = el('button', 'icon-btn', '×');
    del.type = 'button';
    del.setAttribute('aria-label', T.remove[lang]);
    del.addEventListener('click', () => {
      tests.splice(i, 1);
      testsFrom = null;
      renderTests();
      edited();
    });
    row.append(name, status, del);
    testsEl.append(row);
  });
}

let timer: number | undefined;
/** 두 글에 같은 줄(짧은 줄 · 괄호만 있는 줄은 빼고)이 하나라도 있는가 */
function sharesLine(text: string, example: string): boolean {
  const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 8);
  const mine = new Set(lines(text));
  return lines(example).some((l) => mine.has(l));
}

function edited() {
  // 요구사항이나 코드를 예제와 전혀 다르게 바꿨으면, 예제의 테스트가 남아 엉뚱한 요구사항에 이어지지 않게 뺀다
  if (testsFrom && tests.length && (!sharesLine(reqsEl.value, testsFrom.requirements[lang]) || !sharesLine(codeEl.value, testsFrom.code))) {
    tests = [];
    testsFrom = null;
    renderTests();
    testsNoteEl.textContent = T.testsCleared[lang];
    testsNoteEl.hidden = false;
  }
  // 고친 뒤에는 예제 선택 표시를 지운다 (예제 그대로가 아니므로)
  if (current) {
    current = null;
    renderExamples();
  }
  clearTimeout(timer);
  timer = window.setTimeout(() => run(true), 300);
}

function diagram(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup; // The shared renderer escapes all evidence and labels.
  return t.content.firstElementChild as HTMLElement;
}

const priority = (s: TryResult['rows'][number]['overall']) => s === '다름' || s === '실패' ? 0 : s === '미확인' ? 1 : 2;

let lastRows: TryRow[] = [];
let renderedCode = '';
let renderedFile = '';

function editEvidence(line: number, expression: string) {
  const lines = codeEl.value.split('\n');
  const source = lines[line - 1];
  if (source === undefined) return;
  const offset = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);
  const column = expression ? source.indexOf(expression) : -1;
  // Select the comparison when it ends in a simple operand. Otherwise select the evidence.
  const comparison = expression.match(/(?:===?|!==?|>=?|<=?)\s*(?:-?[\d.]+|[\w.$]+)$/);
  const start = column < 0 ? source.length - source.trimStart().length : column + (comparison?.index ?? 0);
  const end = column < 0 ? source.length : column + expression.length;
  codeEl.focus({ preventScroll: true });
  codeEl.setSelectionRange(offset + start, offset + end);
  codeEl.scrollTop = Math.max(0, (line - 0.5) * parseFloat(getComputedStyle(codeEl).lineHeight) - codeEl.clientHeight / 2);
  codeEl.scrollIntoView({ block: 'center' });
}

function linkEvidence(card: HTMLElement, r: TryRow) {
  const code = card.querySelector('.vl-code');
  const line = r.line;
  if (!code || !line) return;
  const location = `${renderedFile}:${line}`;
  const text = code.textContent ?? '';
  if (text !== location && !text.startsWith(location + ' ')) return;
  const expression = text.slice(location.length).trimStart();
  const button = el('button', 'evidence-location', location);
  button.type = 'button';
  button.setAttribute('aria-label', lang === 'ko' ? `${location} 편집` : `Edit ${location}`);
  button.addEventListener('click', () => {
    if (codeEl.value !== renderedCode || codeFileName(fileEl.value) !== renderedFile) {
      clearTimeout(timer);
      run(true);
      cardsEl.querySelector<HTMLButtonElement>(`[data-req="${CSS.escape(r.id)}"] .evidence-location`)?.click();
      return;
    }
    editEvidence(line, expression);
  });
  code.replaceChildren(button, document.createTextNode(expression ? ' ' : ''), el('span', 'evidence-expression', expression));
}

// Start the short highlight when the edited evidence is actually on screen.
function revealChange(node: HTMLElement) {
  node.classList.add('just-changed');
  window.setTimeout(() => {
    node.classList.remove('just-changed');
    node.querySelector('.previous-attempt')?.remove();
  }, 2400);
}
const changesInView = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    changesInView!.unobserve(entry.target);
    revealChange(entry.target as HTMLElement);
  }
}) : null;

function highlight(node: HTMLElement | null) {
  if (!node) return;
  if (changesInView) changesInView.observe(node);
  else revealChange(node);
}

function highlightChanges(card: HTMLElement, row: TryRow, prior: TryRow) {
  for (const step of row.chain) {
    const old = prior.chain.find(s => s.kind === step.kind);
    if (old?.text === step.text && old.tone === step.tone) continue;
    const cell = card.querySelector<HTMLElement>(`[data-step="${step.kind}"]`);
    if (!cell) continue;
    if (step.kind === 'code') {
      const expr = cell.querySelector('.evidence-expression');
      const current = expr?.textContent ?? '';
      const oldExpr = old?.text.slice((cell.querySelector('.evidence-location')?.textContent?.length ?? 0) + 1);
      const token = [...current.matchAll(/[<>=!]+/g)].find(m => {
        const left = current.slice(0, m.index), right = current.slice(m.index + m[0].length);
        if (!oldExpr?.startsWith(left) || !oldExpr.endsWith(right)) return false;
        const before = oldExpr.slice(left.length, oldExpr.length - right.length);
        return before !== m[0] && /^[<>=!]+$/.test(before);
      });
      if (token && expr) {
        const mark = el('span', 'changed-token', token[0]);
        expr.replaceChildren(document.createTextNode(current.slice(0, token.index)), mark,
          document.createTextNode(current.slice(token.index + token[0].length)));
        highlight(mark);
        continue;
      }
    }
    if (step.kind === 'act' && prior.dots && row.dots && prior.dots.at !== row.dots.at) {
      const change = el('small', 'previous-attempt', `${prior.dots.at} → ${row.dots.at}`);
      cell.lastElementChild?.prepend(change);
    }
    highlight(cell);
  }
  if (row.dots && prior.dots) {
    if (row.dots.at !== prior.dots.at) highlight(card.querySelector('.vl-row:last-child .vl-active'));
    if (row.dots.required !== prior.dots.required) highlight(card.querySelector('.vl-row:first-child .vl-active'));
  }
}

function run(compare = false) {
  let res: TryResult;
  try {
    res = runCheck({ requirements: reqsEl.value, fileName: fileEl.value, code: codeEl.value, tests, lang });
  } catch (e) {
    lastRows = [];
    cardsEl.replaceChildren();
    codewrapEl.hidden = true;
    headlineEl.textContent = '';
    showJump('');
    statusEl.textContent = T.error[lang] + (e instanceof Error ? e.message : String(e));
    return;
  }
  statusEl.textContent = '';
  changesInView?.disconnect();
  const previous = new Map((compare ? lastRows : []).map(row => [row.id, row]));
  lastRows = res.rows;
  renderedCode = codeEl.value;
  renderedFile = codeFileName(fileEl.value);
  showJump(res.rows.length ? res.headline : '');
  if (!res.rows.length) {
    headlineEl.textContent = '';
    cardsEl.replaceChildren(el('p', 'empty', T.noReqs[lang]));
    codewrapEl.hidden = true;
    return;
  }
  headlineEl.textContent = res.headline;
  cardsEl.replaceChildren(
    ...[...res.rows].sort((a, b) => priority(a.overall) - priority(b.overall)).map((r) => {
      const card = el('article', `card ${tones[r.overall]}`);
      card.dataset.req = r.id;
      const top = el('div', 'top');
      top.append(el('span', `badge ${tones[r.overall]}`, marks[r.overall] + ' ' + r.verdict + (r.reason ? ` · ${r.reason}` : '')), el('span', 'rid', r.id), el('span', 'rtext', r.text));
      card.append(top);
      if (r.dots) card.append(diagram(attemptComparison(r.dots.required, r.dots.at, lang === 'ko' ? '코드 동작' : 'Code acts', r.chain.find(st => st.kind === 'test'), lang)));
      else card.append(el('p', 'summary', r.summary));
      // 근거 사슬 그림: 어느 칸이 어긋났는지(주황) · 비었는지(회색 점선)를 한눈에
      if (r.chain.length) card.append(diagram(evidenceChain(r.chain, r.overall)));
      if (r.dots) card.append(el('p', 'summary', r.summary));
      const meta = [r.where, r.tests.length ? T.linked[lang] + r.tests.join(', ') : T.noLinked[lang]].filter(Boolean).join(' · ');
      const details = el('p', 'meta', meta);
      if (r.line) {
        const view = el('button', 'view-line', lang === 'ko' ? '근거 줄 보기' : 'View evidence line');
        view.type = 'button';
        view.addEventListener('click', () => jump(r.line!));
        details.append(' · ', view);
      }
      card.append(details);
      // 몇 번째에 동작하는지 점 그림. 그릴 수 없으면 글자 줄
      if (r.dots) card.append(diagram(attemptChart(r.dots.max, r.dots.required, [{ label: lang === 'ko' ? '코드' : 'Code', at: r.dots.at }], lang)));
      else if (r.strip.length) card.append(el('div', 'strip', r.strip.join('\n')));
      if (r.todo.length) {
        const todo = el('ul', 'todo');
        for (const t of r.todo) {
          const li = el('li');
          li.append(el('b', undefined, t.label), document.createTextNode(` — ${t.action}`));
          todo.append(li);
        }
        card.append(todo);
      }
      card.addEventListener('click', event => {
        if (r.line && !(event.target as Element).closest('button')) jump(r.line);
      });
      linkEvidence(card, r);
      const prior = previous.get(r.id);
      if (prior?.text === r.text) highlightChanges(card, r, prior);
      return card;
    }),
  );
  renderCode(res);
}

// 결과 칸이 화면에 보이면 막대를 숨긴다 (좁은 화면에서만 보이는 막대다)
let outInView = false;
let jumpText = '';
function showJump(text: string) {
  jumpText = text;
  jumpwhatEl.textContent = text;
  jumpbarEl.hidden = !text || outInView;
  document.body.classList.toggle('has-jumpbar', !jumpbarEl.hidden);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    outInView = entries.some((e) => e.isIntersecting);
    showJump(jumpText);
  }, { threshold: 0.15 }).observe(outEl);
}

function renderCode(res: TryResult) {
  const lines = codeEl.value.replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const byLine = new Map<number, TryResult['notes']>();
  for (const n of res.notes) byLine.set(n.line, [...(byLine.get(n.line) ?? []), n]);
  if (!res.notes.length) {
    codewrapEl.hidden = true;
    return;
  }
  codewrapEl.hidden = false;
  codecapEl.textContent = `${fileEl.value.trim() || 'src/feature.ts'} · ${T.codecap[lang]}`;
  codeviewEl.replaceChildren(
    ...lines.map((text, i) => {
      const no = i + 1;
      const notes = byLine.get(no) ?? [];
      const worst = [...notes].sort((a, b) => priority(a.overall) - priority(b.overall))[0];
      const row = el('div', `ln${worst ? ' hl-' + tones[worst.overall] : ''}`);
      row.id = `L${no}`;
      row.append(el('span', 'no', String(no)), el('span', 'tx', text || ' '));
      if (!notes.length) return [row];
      // 좁은 화면에서도 잘리지 않게, 판정은 그 줄 바로 아래에 줄을 바꿔 보여 준다
      return [row, ...notes.map((n) => el('div', `ln-note ${tones[n.overall]}`, `↑ ${n.head}${n.note ? ` · ${n.note}` : ''}`))];
    }).flat(),
  );
}

function jump(line: number) {
  const row = document.getElementById(`L${line}`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1200);
}

function setLangTo(next: Lang) {
  if (next === lang) return;
  // 예제를 그대로 보고 있었으면 같은 예제의 다른 언어 판을 연다
  const same = current;
  clearTimeout(timer);
  lang = next;
  try {
    localStorage.setItem('verifylens.try.lang', lang);
  } catch {
    // 저장하지 못해도 화면은 바뀐다
  }
  applyTexts();
  if (same) load(same);
  else run();
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.lang button')) b.addEventListener('click', () => setLangTo(b.dataset.lang as Lang));
for (const input of [reqsEl, codeEl, fileEl]) input.addEventListener('input', edited);
$('add-test').addEventListener('click', () => {
  tests.push({ name: '', status: 'pass' });
  testsFrom = null;
  testsNoteEl.hidden = true;
  renderTests();
  (testsEl.lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus();
});
// 코드 칸에서 Tab 은 들여쓰기로 쓴다 (Shift+Tab 이나 Esc 다음 Tab 으로 칸을 벗어난다)
let escaped = false;
codeEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    escaped = true;
    return;
  }
  if (e.key !== 'Tab' || e.shiftKey || escaped) {
    escaped = false;
    return;
  }
  e.preventDefault();
  const { selectionStart: s, selectionEnd: t, value } = codeEl;
  codeEl.value = value.slice(0, s) + '  ' + value.slice(t);
  codeEl.selectionStart = codeEl.selectionEnd = s + 2;
  edited();
});

const style = el('style');
style.textContent = `:root{${palette(light)}}@media(prefers-color-scheme:dark){:root{${palette(dark)}}}${evidenceCSS}`;
document.head.append(style);
applyTexts();
statusEl.textContent = T.loading[lang];
load(EXAMPLES[0]);

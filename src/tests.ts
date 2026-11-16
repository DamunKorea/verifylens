import type { TestCase } from './types.ts';

const decode = (s: string) => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** node:test 의 JUnit 보고서( <testcase name="..."> + 선택적 <failure>/<skipped> )를 읽는다. */
export function parseJunit(xml: string): TestCase[] {
  const out: TestCase[] = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[3] ?? '';
    const name = decode((attrs.match(/\bname="([^"]*)"/) ?? [])[1] ?? '');
    const hasFail = /\bfailure=/.test(attrs) || /<failure\b/.test(body);
    const skipped = /<skipped\b/.test(body) || /\bskipped=/.test(attrs);
    let message = '';
    const fm = body.match(/<failure[^>]*message="([^"]*)"/) ?? attrs.match(/\bfailure="([^"]*)"/);
    if (fm) message = decode(fm[1]).split('\n').filter((x) => x.trim()).join(' · ');
    out.push({ name, status: hasFail ? 'fail' : skipped ? 'skip' : 'pass', message });
  }
  return out;
}

const ANSI = /\u001b\[[0-9;]*m/g;

/** Jest · Vitest 의 JSON 보고서 (--json / --reporter=json) */
function parseJestJson(text: string): TestCase[] {
  const j = JSON.parse(text) as { testResults?: { assertionResults?: { fullName?: string; title?: string; ancestorTitles?: string[]; status?: string; failureMessages?: string[] }[] }[] };
  const out: TestCase[] = [];
  for (const f of j.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      const name = a.fullName || [...(a.ancestorTitles ?? []), a.title ?? ''].join(' ').trim();
      const message = (a.failureMessages ?? []).join('\n').replace(ANSI, '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3).join(' · ');
      out.push({ name, status: a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skip', message });
    }
  }
  return out;
}

/** 테스트 보고서를 읽는다: JUnit XML (node:test · Vitest · jest-junit · Mocha xunit) 또는 Jest · Vitest JSON. */
export function parseTestReport(text: string): TestCase[] {
  const t = text.replace(/^﻿/, '').trimStart();
  if (t.startsWith('{')) return parseJestJson(t);
  return parseJunit(t).map((c) => ({ ...c, name: c.name.replace(ANSI, ''), message: c.message.replace(ANSI, '') }));
}

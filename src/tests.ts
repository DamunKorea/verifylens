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

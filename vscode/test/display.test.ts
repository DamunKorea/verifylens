// 표시 글: 한 줄 요약이 근거 줄과 어긋나지 않는가 · 영어 화면에 한국어 단위가 섞이지 않는가 (JetBrains 세션이 0.11.0 시험 중 찾음, 11/21)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles, evaluate } from '../../src/engine.ts';
import { parseRequirements } from '../../src/requirements.ts';
import { setLang } from '../../src/i18n.ts';
import { boundaryLine } from '../../src/numeric.ts';
import { testPointsLine } from '../../src/testpoints.ts';
import { summaryLine } from '../src/model.ts';

function run(files: Record<string, string>, req: string, test: string) {
  const set = analyzeFiles({ key: 'A', ref: 'x', sha: 'x', files, tests: [{ name: test, status: 'pass', message: '' }] });
  const report = evaluate([set], parseRequirements(req), '.', 'main');
  return { report, s: report.summaries[0], rr: report.sets[0].perReq.R1 };
}

const SIGNUP = "export function subscribe(email: string) {\n  if (!/^[^@]+@[^@]+$/.test(email)) throw new Error('INVALID_EMAIL');\n  return list.add(email);\n}\nexport function signup(email: string, password: string) {\n  return users.create({ email, password });\n}\n";
const INVITE = "export function sendInvite(user: { invites: Date[] }, to: string) {\n  if (user.invites.length >= 3) throw new Error('LIMIT');\n  user.invites.push(new Date());\n  return mail.send(to);\n}\n";

test('display: when a linked test passes, the summary names what stopped the verdict, not "no linked test"', () => {
  setLang('en');
  const a = run({ 'src/signup.ts': SIGNUP }, '- R1: Sign-up rejects an invalid email', 'sign-up rejects an invalid email');
  assert.equal(a.s.overall, '미확인');
  assert.equal(a.rr.testStatus, '통과');
  assert.equal(summaryLine(a.report, a.s), 'the test passes, but no deciding check');
  const b = run({ 'src/invite.ts': INVITE }, '- R1: 초대는 하루에 최대 3번까지 보낼 수 있다 | keywords: invite, invites', '하루에 네 번째 초대는 거부한다');
  assert.equal(summaryLine(b.report, b.s), 'the test passes, but no time window');
  setLang('ko');
  assert.equal(summaryLine(a.report, a.s), '검사는 통과했지만 확인하는 조건 못 찾음');
  // 검사가 없으면 예전처럼 검사 없음을 말한다
  const c = run({ 'src/signup.ts': SIGNUP }, '- R1: Sign-up rejects an invalid email', 'unrelated test name');
  assert.match(summaryLine(c.report, c.s), /연결된 검사 없음|연결된 검사가 없어/);
});

test('display: Korean units read in English on an English screen', () => {
  const b = run({ 'src/invite.ts': INVITE }, '- R1: 초대는 하루에 최대 3번까지 보낼 수 있다 | keywords: invite, invites', '하루에 네 번째 초대는 거부한다');
  const line = boundaryLine(b.rr.evidence.boundaries![0], 'en');
  assert.equal(line, 'allows up to 3 times');
  assert.equal(boundaryLine(b.rr.evidence.boundaries![0], 'ko'), '최대 3번까지 들어감');
  const fee = run({ 'src/fee.ts': 'export function fee(total: number) {\n  return total >= 50000 ? 0 : 3000;\n}\n' }, '- R1: 5만원 이상 주문은 배송비가 무료다 | keywords: total, fee', '5만원 이상이면 배송비 무료');
  assert.doesNotMatch(testPointsLine(fee.s.req, 'en'), /[가-힣]/);
  assert.match(testPointsLine(fee.s.req, 'en'), /50,000 won/);
  assert.match(testPointsLine(fee.s.req, 'ko'), /50,000원/);
});

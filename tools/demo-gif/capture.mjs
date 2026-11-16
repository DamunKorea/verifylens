// VS Code(Electron) 창을 CDP 로 일정 간격으로 찍는다. node capture.mjs <결과 폴더> [폭] [높이]
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [out, W = '1280', H = '800'] = process.argv.slice(2);
const frames = join(out, 'frames');
mkdirSync(frames, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 150 && !target; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:9339/json/list')).json();
    target = list.find((t) => t.type === 'page' && /workbench/.test(t.url));
  } catch {}
  if (!target) await sleep(400);
}
if (!target) { console.log('no target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
let closed = false;
ws.onclose = () => { closed = true; };
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
const stageFile = join(out, 'stage.txt');
let n = 0;
const log = [];
const t0 = Date.now();
while (!closed) {
  const stage = existsSync(stageFile) ? readFileSync(stageFile, 'utf8') : 'none';
  if (stage === 'done') break;
  const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(4000).then(() => null)]);
  if (r && r.result && r.result.data) {
    const name = `f${String(++n).padStart(4, '0')}.png`;
    writeFileSync(join(frames, name), Buffer.from(r.result.data, 'base64'));
    log.push({ name, stage, t: Date.now() - t0 });
  }
  await sleep(300);
}
writeFileSync(join(out, 'frames.json'), JSON.stringify(log));
console.log('frames', n);
try { ws.close(); } catch {}
process.exit(0);

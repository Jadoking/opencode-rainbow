import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RainbowEngine } from "../src/engine.js";
import { frameBackground, processNativeFrame, readFrame, writeFrame, type Planes, type Region } from "../src/native-frame.js";
import { applyScope } from "../src/layout.js";
import { normalizeSettings, type RainbowSettings } from "../src/settings.js";

const W = Number(process.env.W ?? 200), H = Number(process.env.H ?? 55), N = Number(process.env.N ?? 300);
const stored = JSON.parse(readFileSync(join(homedir(), ".local/state/opencode/latest/tui/plugin.opencode.rainbow.settings.json"), "utf8")).settings;

function fixture(): Planes {
  const n = W * H;
  const p = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) };
  const text = "The quick brown fox jumps over the lazy dog; const x = await foo(bar) // comment ";
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    p.fg.set([210, 220, 230, 255], i * 4);
    p.bg.set([16, 17, 22, 255], i * 4);
    if (x > 2 && x < W * 0.7 && y % 3 !== 2) p.char[i] = text.charCodeAt((x + y * 7) % text.length);
    if (y >= 10 && y < 18 && x >= 4 && x < W - 4) p.bg.set([30, 32, 40, 255], i * 4); // tool box
  }
  for (let x = 0; x < W; x++) p.char[(H - 6) * W + x] = 0x2500; // rule
  return p;
}
const regions: Region[] = [
  { x: 2, y: H - 5, width: W - 4, height: 2, kind: "input" },
  { x: 2, y: H - 3, width: W - 4, height: 1, kind: "footer" },
];

function bench(name: string, s: RainbowSettings) {
  const engine = new RainbowEngine(s);
  const base = fixture();
  const p = fixture();
  const phases = { read: 0, process: 0, write: 0, total: 0 };
  for (let i = 0; i < N + 30; i++) {
    p.char.set(base.char); p.fg.set(base.fg); p.bg.set(base.bg); p.attributes.set(base.attributes);
    const t0 = performance.now();
    const frame = readFrame(p, W, H, engine.bg, s, regions);
    const t1 = performance.now();
    engine.processFrame(frame, { width: W, height: H, fullscreen: true, cursor: { x: 5, y: H - 4 }, overlayVisible: false });
    const t2 = performance.now();
    writeFrame(p, frame, s);
    const t3 = performance.now();
    if (i >= 30) { phases.read += t1 - t0; phases.process += t2 - t1; phases.write += t3 - t2; phases.total += t3 - t0; }
  }
  const f = (v: number) => (v / N).toFixed(2).padStart(6);
  console.log(`${name.padEnd(28)} read ${f(phases.read)}  process ${f(phases.process)}  write ${f(phases.write)}  total ${f(phases.total)} ms/frame  quality=${engine.getStats().quality.toFixed(2)}`);
}

console.log(`${W}x${H}, ${N} frames`);
const user = normalizeSettings(stored);
bench("user settings", { ...user, frameBudgetMs: 0 });
bench("user, no fx", { ...user, fx: {}, frameBudgetMs: 0 });
bench("user, minContrast off", { ...user, minContrast: 1, frameBudgetMs: 0 });
for (const id of Object.keys(user.fx)) bench(`only ${id}`, { ...user, fx: { [id]: 1 }, frameBudgetMs: 0 });
bench("user, vibrance 1", { ...user, vibrance: 1, frameBudgetMs: 0 });
bench("defaults", normalizeSettings({ frameBudgetMs: 0 } as Partial<RainbowSettings>));

// isolate sub-steps
{
  const s = { ...user, fx: {}, frameBudgetMs: 0 };
  const p = fixture();
  let t = 0;
  for (let i = 0; i < N; i++) { const a = performance.now(); frameBackground(p); t += performance.now() - a; }
  console.log(`frameBackground (overlay only)   ${(t / N).toFixed(2)} ms`);
  t = 0;
  for (let i = 0; i < N; i++) { const fr = readFrame(p, W, H, { r: 16, g: 17, b: 22 }, s, regions); const a = performance.now(); applyScope(fr, s.scope, true, true); t += performance.now() - a; }
  console.log(`applyScope/analyzeLayout         ${(t / N).toFixed(2)} ms`);
}

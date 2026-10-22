import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RainbowEngine } from "../src/engine.js";
import { FrameCache, processNativeFrame, type Region } from "../src/native-frame.js";
import { normalizeSettings } from "../src/settings.js";

// One animation tick at a real pane size, with the stored settings, through the same path as the plugin.
const W = Number(process.env.W ?? 225), H = Number(process.env.H ?? 69), N = Number(process.env.N ?? 200);
const s = normalizeSettings(JSON.parse(readFileSync(join(homedir(), ".local/state/opencode/latest/tui/plugin.opencode.rainbow.settings.json"), "utf8")).settings);
const text = "The quick brown fox jumps over the lazy dog; const x = await foo(bar) // comment ";
const source = () => {
  const n = W * H, p = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; p.fg.set([210, 220, 230, 255], i * 4); p.bg.set([16, 17, 22, 255], i * 4);
    if (x > 2 && x < W - 45 && y % 3 !== 2) p.char[i] = text.charCodeAt((x + y * 7) % text.length);
    if (y >= 10 && y < 30 && x >= 4 && x < W - 45) p.bg.set([30, 32, 40, 255], i * 4);
    if (x >= W - 42) p.bg.set([21, 21, 28, 255], i * 4);
  }
  return p;
};
const regions: Region[] = [{ x: W - 42, y: 0, width: 42, height: H, kind: "sidebar" }, { x: 2, y: H - 5, width: W - 46, height: 2, kind: "input" }];
const engine = new RainbowEngine(s);
let now = 10;
Object.defineProperty(engine, "now", { get: () => now });
const cache = new FrameCache();
const base = source();
let total = 0;
for (let i = 0; i < N + 20; i++) {
  now += 1 / 12;
  const p = { char: base.char.slice(), fg: base.fg.slice(), bg: base.bg.slice(), attributes: base.attributes.slice() };
  const t0 = performance.now();
  processNativeFrame({ buffers: p, width: W, height: H }, engine, s, { inputMode: "base", regions, advance: true, cache });
  if (i >= 20) total += performance.now() - t0;
}
console.log(`${W}x${H} tick: ${(total / N).toFixed(2)} ms`);

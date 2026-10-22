import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RainbowEngine } from "../src/engine.js";
import { allFx } from "../src/fx.js";
import { FrameCache, processNativeFrame, type Region } from "../src/native-frame.js";
import { DEFAULT_SETTINGS, normalizeSettings, type RainbowSettings } from "../src/settings.js";

// Fingerprints the exact native output over many ticks and redraws. Performance
// work must leave every fingerprint unchanged.
const W = 120, H = 40;
const stored = join(homedir(), ".local/state/opencode/latest/tui/plugin.opencode.rainbow.settings.json");
const user = normalizeSettings(JSON.parse(readFileSync(stored, "utf8")).settings);
const text = "The quick brown fox jumps over the lazy dog; const x = await foo(bar) // ─│┌┐ ";
const source = (t: number) => {
  const n = W * H, p = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; p.fg.set([210, 220, 230, 255], i * 4); p.bg.set([16, 17, 22, 255], i * 4);
    if (x > 2 && x < W - 30 && y % 3 !== 2) p.char[i] = text.codePointAt((x + y * 7) % text.length)!;
    if (y >= 8 && y < 16 && x >= 4 && x < W - 30) p.bg.set([30, 32, 40, 255], i * 4);
    if (x >= W - 28) p.bg.set([21, 21, 28, 255], i * 4);
    if (y === 20 && x > 2 && x < W - 30) p.char[i] = 0x2500;
    if (y === 2 && x % 7 === 0) p.attributes[i] = 1 | 4;
  }
  // Streaming text: one row changes between redraws.
  for (let x = 4; x < 4 + (t % 40); x++) p.char[30 * W + x] = 0x2588;
  return p;
};
const regions: Region[] = [{ x: W - 28, y: 0, width: 28, height: H, kind: "sidebar" }, { x: 2, y: H - 4, width: W - 32, height: 2, kind: "input" },
  { x: 2, y: H - 2, width: W - 32, height: 1, kind: "footer" }];
const cases: [string, RainbowSettings][] = [
  ["user", user],
  ["user screen", { ...user, scope: "screen" }],
  ["user text", { ...user, scope: "text" }],
  ["user chrome", { ...user, scope: "chrome" }],
  ["defaults", normalizeSettings(DEFAULT_SETTINGS)],
  ["bright+vivid", { ...user, brightness: 0.2, vibrance: 0.6, mode: "plasma", motion: "wave" }],
  ["all fx", { ...user, scope: "screen", fx: Object.fromEntries(allFx().map((f) => [f.id, 0.7])) }],
];
for (const [name, s] of cases) {
  const hash = createHash("sha256");
  const engine = new RainbowEngine({ ...s, frameBudgetMs: 0 });
  let now = 10;
  Object.defineProperty(engine, "now", { get: () => now });
  const cache = new FrameCache();
  for (let t = 0; t < 36; t++) {
    const advance = t % 4 === 0;
    if (advance) now += 1 / 12;
    if (t === 17) engine.setPreset("ocean");
    const p = source(t);
    processNativeFrame({ buffers: p, width: W, height: H }, engine, { ...s, frameBudgetMs: 0 },
      { inputMode: t > 28 ? "dialog" : "base", regions, advance, cache, cursor: { x: 5, y: H - 4 } });
    for (const plane of [p.char, p.fg, p.bg, p.attributes]) hash.update(new Uint8Array(plane.buffer));
  }
  console.log(name.padEnd(14), hash.digest("hex").slice(0, 16));
}

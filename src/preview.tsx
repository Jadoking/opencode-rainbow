import type { Context } from "@opencode/plugin/tui/context";
import { createEffect, createSignal, For, onCleanup, type Accessor } from "solid-js";
import { rgbToOklch, sampleRamp, saturate, shade, type RGB } from "./color.js";
import { RainbowEngine } from "./engine.js";
import { processNativeFrame, type Planes, type Region } from "./native-frame.js";
import { rampFor } from "./presets.js";
import { AnimationPump } from "./pump.js";
import type { RainbowSettings } from "./settings.js";

type Theme = Context["theme"];
type Float = { r: number; g: number; b: number };
const to8 = (c: Float): RGB => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) });
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => (v & 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * The `Match OpenCode` palette: the theme's syntax and accent colours that
 * read as text on its background, ordered by hue so the gradient flows.
 */
export function opencodePalette(theme: Theme): RGB[] {
  const candidates = [theme.syntax.keyword, theme.syntax.function, theme.syntax.type, theme.syntax.string,
    theme.syntax.number, theme.hue.accent[400], theme.hue.interactive[400]].map(to8);
  const kept: { c: RGB; h: number; l: number; ch: number }[] = [];
  for (const c of candidates) {
    const { L, C, h } = rgbToOklch(c);
    if (L < 0.55 || C < 0.05) continue;
    if (kept.some((k) => Math.abs(k.l - L) < 0.04 && Math.abs(k.ch - C) < 0.03 && Math.min(Math.abs(k.h - h), 1 - Math.abs(k.h - h)) < 0.03)) continue;
    kept.push({ c, h, l: L, ch: C });
  }
  return kept.sort((a, b) => a.h - b.h).map((k) => k.c);
}

/** Palette colours as they will be drawn, for a swatch. */
export function paletteSamples(preset: string, count: number, vibrance = 1, brightness = 0): RGB[] {
  const ramp = rampFor(preset);
  return Array.from({ length: count }, (_, i) => {
    let c = sampleRamp(ramp, i / count);
    if (vibrance !== 1) c = saturate(c, vibrance);
    if (brightness !== 0) c = shade(c, brightness);
    return c;
  });
}

export function Swatch(props: { preset: string; vibrance?: number; brightness?: number; width: number }) {
  return <text wrapMode="none"><For each={paletteSamples(props.preset, props.width, props.vibrance, props.brightness)}>{(c) =>
    <span style={{ fg: hex(c.r, c.g, c.b) }}>█</span>
  }</For></text>;
}

/** A small OpenCode screen in OpenTUI's native planes, drawn with the active theme's colours. */
export function mockScreen(width: number, height: number, theme: Theme): { planes: Planes; regions: Region[] } {
  const n = width * height;
  const planes = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) } as unknown as Planes;
  const bg = to8(theme.background.base), raised = to8(theme.background.raised.base);
  const text = to8(theme.text.base), muted = to8(theme.text.muted);
  const ok = to8(theme.text.feedback.success.base), accent = to8(theme.hue.accent[400]);
  const paint = (x: number, y: number, fg: RGB, back: RGB, ch = 32, bold = false) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    planes.char[i] = ch;
    planes.fg.set([fg.r, fg.g, fg.b, 255], i * 4);
    planes.bg.set([back.r, back.g, back.b, 255], i * 4);
    planes.attributes[i] = bold ? 1 : 0;
  };
  const put = (x: number, y: number, s: string, fg: RGB, back = bg, bold = false) =>
    [...s].forEach((ch, k) => paint(x + k, y, fg, back, ch.codePointAt(0)!, bold));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(x, y, text, bg);

  const sideW = width >= 64 ? 24 : 0;
  const main = width - sideW - (sideW ? 2 : 0);
  const lines: ((y: number) => void)[] = [
    () => {},
    (y) => put(2, y, "The build passes. Here is what changed:".slice(0, main - 2), text),
    () => {},
    (y) => { for (let x = 2; x < main; x++) paint(x, y, text, raised); put(2, y, "┃", accent, raised); put(4, y, "$ npm test", muted, raised); },
    (y) => { for (let x = 2; x < main; x++) paint(x, y, text, raised); put(2, y, "┃", accent, raised); put(4, y, "✓", ok, raised); put(6, y, "44 passed · 0 failed", text, raised); },
    () => {},
    (y) => put(2, y, "┌──────────┬───────────┐", muted),
    (y) => { put(2, y, "│ Theme    │ Effects   │", muted); put(4, y, "Theme", text, bg, true); put(15, y, "Effects", text, bg, true); },
    (y) => put(2, y, "├──────────┼───────────┤", muted),
    (y) => { put(2, y, "│ Nord     │ none      │", muted); put(4, y, "Nord", text); put(15, y, "none", text); },
    (y) => { put(2, y, "│ Winter   │ snow      │", muted); put(4, y, "Winter", text); put(15, y, "snow", text); },
    (y) => put(2, y, "└──────────┴───────────┘", muted),
    () => {},
    (y) => put(2, y, "Next I'll tune the preview so it matches.".slice(0, main - 2), text),
  ];
  for (let y = 0; y < height && y < lines.length; y++) lines[y]!(y);

  const regions: Region[] = [];
  if (sideW) {
    const x0 = width - sideW;
    for (let y = 0; y < height; y++) for (let x = x0; x < width; x++) paint(x, y, text, raised);
    put(x0 + 2, 1, "Theme preview", text, raised, true);
    put(x0 + 2, 3, "Context", text, raised, true);
    put(x0 + 2, 4, "24,118 tokens", muted, raised);
    put(x0 + 2, 6, "MCP", text, raised, true);
    put(x0 + 2, 7, "•", ok, raised);
    put(x0 + 4, 7, "cua", text, raised);
    put(width - 11, 7, "Connected", muted, raised);
    regions.push({ x: x0, y: 0, width: sideW, height, kind: "sidebar" });
  }
  return { planes, regions };
}

type Chunk = { text: string; fg: string; bg: string; attributes: number };

function chunks(planes: Planes, width: number, height: number): Chunk[][] {
  const rows: Chunk[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Chunk[] = [];
    for (let x = 0; x < width; x++) {
      const i = y * width + x, at = i * 4;
      const fg = hex(planes.fg[at]!, planes.fg[at + 1]!, planes.fg[at + 2]!);
      const bg = hex(planes.bg[at]!, planes.bg[at + 1]!, planes.bg[at + 2]!);
      const attributes = planes.attributes[i]! & 15;
      const ch = String.fromCodePoint(planes.char[i]! || 32);
      const last = row.at(-1);
      if (last && last.fg === fg && last.bg === bg && last.attributes === attributes) last.text += ch;
      else row.push({ text: ch, fg, bg, attributes });
    }
    rows.push(row);
  }
  return rows;
}

/** The mock screen, animated through the same native pipeline as the real one. */
export function ScreenPreview(props: { ctx: Context; settings: Accessor<RainbowSettings>; width: Accessor<number>; height: number; working: () => boolean }) {
  const engine = new RainbowEngine(props.settings());
  const [rows, setRows] = createSignal<Chunk[][]>([]);
  const draw = () => {
    const width = props.width(), height = props.height;
    const theme = props.ctx.theme;
    engine.setTheme(to8(theme.background.base), to8(theme.text.base));
    const { planes, regions } = mockScreen(width, height, theme);
    processNativeFrame({ buffers: planes, width, height }, engine, props.settings(), { inputMode: "base", regions });
    setRows(chunks(planes, width, height));
  };
  const pump = new AnimationPump(engine, props.settings, props.working, draw);
  createEffect(() => { engine.updateSettings(props.settings()); props.width(); pump.activity(); draw(); });
  onCleanup(() => pump.dispose());
  return <box flexDirection="column"><For each={rows()}>{(row) =>
    <text wrapMode="none"><For each={row}>{(c) => <span style={{ fg: c.fg, bg: c.bg, attributes: c.attributes }}>{c.text}</span>}</For></text>
  }</For></box>;
}

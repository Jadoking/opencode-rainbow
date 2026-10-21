import { useTerminalDimensions } from "@opentui/solid";
import type { Context } from "@opencode/plugin/tui/context";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js";
import { parseAnsiLine } from "./ansi-grid.js";
import { controls } from "./controls.js";
import { RainbowEngine } from "./engine.js";
import { GRADIENT_MODES } from "./field.js";
import { allFx } from "./fx.js";
import { PRESETS } from "./presets.js";
import { AnimationPump } from "./pump.js";
import { DEFAULT_SETTINGS, type RainbowSettings } from "./settings.js";

function styled(lines: string[]) {
  const chunks: { text: string; fg?: string; bg?: string; attributes?: number }[] = [];
  const hex = (c: { r: number; g: number; b: number }) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  for (let y = 0; y < lines.length; y++) {
    if (y) chunks.push({ text: "\n" });
    for (const cell of parseAnsiLine(lines[y]).cells) chunks.push({ text: cell.text,
      fg: cell.fg ? hex(cell.fg) : undefined,
      bg: cell.bg ? hex(cell.bg) : undefined,
      attributes: Number(cell.style.bold) | Number(cell.style.dim) << 1,
    });
  }
  return chunks;
}

function previewLines(width: number) {
  const side = Math.max(3, Math.floor((width - 2) / 2));
  const fill = (text: string) => `\x1b[48;2;28;30;38m${text.slice(0, side).padEnd(side)}\x1b[0m`;
  const edge = "─".repeat(side - 2);
  return [fill(" Filled tool") + `  ╭${edge}╮`, fill(" npm run build") + `  │${" Outline".slice(0, side - 2).padEnd(side - 2)}│`,
    fill(" complete") + `  ╰${edge}╯`, "Assistant text · live engine preview".slice(0, width)];
}

function LivePreview(props: { ctx: Context; settings: Accessor<RainbowSettings>; lines: (width: number) => string[]; width: Accessor<number>; working: () => boolean }) {
  const engine = new RainbowEngine(props.settings());
  const width = props.width;
  const [tick, setTick] = createSignal(0);
  const pump = new AnimationPump(engine, props.settings, props.working, () => setTick((n) => n + 1));
  const wake = () => { pump.activity(.2); setTick((n) => n + 1); };
  props.ctx.renderer.keyInput.on("keypress", wake);
  const stop = props.ctx.data.listen(() => { if (props.working()) wake(); });
  createEffect(() => { engine.updateSettings(props.settings()); pump.activity(); setTick((n) => n + 1); });
  onCleanup(() => { pump.dispose(); props.ctx.renderer.keyInput.off("keypress", wake); stop(); });
  const content = createMemo(() => {
    tick();
    const lines = props.lines(width());
    return styled(engine.process(lines, { width: width(), height: lines.length, fullscreen: true }));
  });
  return <text wrapMode="none"><For each={content()}>{(chunk) =>
    <span style={{ fg: chunk.fg, bg: chunk.bg, attributes: chunk.attributes }}>{chunk.text}</span>
  }</For></text>;
}

export function SettingsDialog(props: { ctx: Context; settings: Accessor<RainbowSettings>; apply: (s: Partial<RainbowSettings>) => void; working: () => boolean }) {
  const opening = structuredClone(props.settings());
  const rows = controls();
  const [cursor, setCursor] = createSignal(0);
  const size = useTerminalDimensions();
  const showPreview = () => size().height >= 22;
  const slots = () => Math.max(1, Math.min(12, size().height - (showPreview() ? 16 : 11)));
  const start = () => Math.max(0, Math.min(cursor() - Math.floor(slots() / 2), rows.length - slots()));
  const move = (dir: number) => setCursor((n) => (n + dir + rows.length) % rows.length);
  const adjust = (dir: number, toggle = false) => props.apply(rows[cursor()].step(props.settings(), dir, toggle));
  props.ctx.keymap.layer(() => ({ mode: "global", priority: 100, commands: [
    { bind: "up", run: () => { move(-1); } }, { bind: "down", run: () => { move(1); } },
    { bind: "left", run: () => adjust(-1) }, { bind: "right", run: () => adjust(1) },
    { bind: "space", run: () => adjust(1, true) },
    { bind: "pageup", run: () => { move(-8); } }, { bind: "pagedown", run: () => { move(8); } },
    { bind: "home", run: () => { setCursor(0); } }, { bind: "end", run: () => { setCursor(rows.length - 1); } },
    { bind: "r", run: () => props.apply(opening) },
    { bind: "escape", run: () => props.ctx.ui.dialog.clear() }, { bind: "return", run: () => props.ctx.ui.dialog.clear() },
  ] }));
  return <box paddingX={2} paddingY={1} gap={1}>
    <text fg={props.ctx.theme.text.base}>Rainbow settings · live · {cursor() + 1}/{rows.length}</text>
    <Show when={showPreview()}>
      <LivePreview ctx={props.ctx} settings={props.settings} lines={previewLines} width={() => Math.max(8, Math.min(64, size().width - 10))} working={props.working} />
    </Show>
    <box onMouseScroll={(event) => { move(event.scroll?.direction === "up" ? -1 : 1); }}>
      <For each={rows.slice(start(), start() + slots())}>{(row, index) =>
        <box flexDirection="row" height={1} onMouseDown={() => { setCursor(start() + index()); adjust(1, true); }}>
          <text fg={props.ctx.theme.text.base} wrapMode="none">{cursor() === start() + index() ? "› " : "  "}{row.label.padEnd(20)} {row.read(props.settings())}</text>
        </box>
      }</For>
    </box>
    <text fg={props.ctx.theme.text.muted} wrapMode="none">{rows[cursor()].group} · {rows[cursor()].hint}</text>
    <text fg={props.ctx.theme.text.muted} wrapMode="word">{size().width < 70
      ? "↑↓ select  ←→ adjust  space toggle  esc close"
      : "↑↓ select  ←→ adjust  space toggle  PgUp/Dn  r restore opening values  esc close"}</text>
  </box>;
}

const BANNER = [
  "██████╗  █████╗ ██╗███╗   ██╗██████╗  ██████╗ ██╗    ██╗",
  "██╔══██╗██╔══██╗██║████╗  ██║██╔══██╗██╔═══██╗██║    ██║",
  "██████╔╝███████║██║██╔██╗ ██║██████╔╝██║   ██║██║ █╗ ██║",
  "██╔══██╗██╔══██║██║██║╚██╗██║██╔══██╗██║   ██║██║███╗██║",
  "██║  ██║██║  ██║██║██║ ╚████║██████╔╝╚██████╔╝╚███╔███╔╝",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝  ╚══╝╚══╝",
];

export function SplashDialog(props: { ctx: Context; settings: RainbowSettings }) {
  const size = useTerminalDimensions();
  const s = { ...DEFAULT_SETTINGS, preset: props.settings.preset, reducedMotion: props.settings.reducedMotion,
    animateInTmux: props.settings.animateInTmux, scope: "screen" as const, speed: .5, turns: 1.4, blend: 1,
    fx: { starfield: .45, shine: .7, bloom: .5, neon: .6, vignette: .4 } };
  const close = () => props.ctx.ui.dialog.clear();
  const timer = setTimeout(close, 2800);
  props.ctx.renderer.keyInput.on("keypress", close);
  onCleanup(() => { clearTimeout(timer); props.ctx.renderer.keyInput.off("keypress", close); });
  return <box padding={1} onMouseDown={close}>
    <LivePreview ctx={props.ctx} settings={() => s} width={() => Math.max(8, Math.min(64, size().width - 8))} working={() => false}
      lines={(w) => ["", ...(w >= 55 && size().height >= 18 ? BANNER : ["RAINBOW"]), "",
        `${PRESETS.length} palettes · ${GRADIENT_MODES.length} fields · ${allFx().length} effects`, "Any key to dismiss"]
        .map((line) => " ".repeat(Math.max(0, Math.floor((w - line.length) / 2))) + line.slice(0, w))} />
  </box>;
}

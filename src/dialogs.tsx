import { useTerminalDimensions } from "@opentui/solid";
import type { Context } from "@opencode/plugin/tui/context";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js";
import { parseAnsiLine } from "./ansi-grid.js";
import type { Renderable } from "@opentui/core";
import { controls, PAGES, type Control, type Page } from "./controls.js";
import { RainbowEngine } from "./engine.js";
import { GRADIENT_MODES, MOTION_MODES } from "./field.js";
import { allFx, getFx } from "./fx.js";
import { ScreenPreview, Swatch } from "./preview.js";
import { AnimationPump } from "./pump.js";
import { DEFAULT_SETTINGS, type RainbowSettings } from "./settings.js";
import { FAMILIES, findTheme, isCustomized, THEMES, themeLook, type Theme } from "./themes.js";

const SHAPES: Record<string, string> = Object.fromEntries(GRADIENT_MODES.map((m) => [m.id, m.label]));
const MOTIONS: Record<string, string> = Object.fromEntries(MOTION_MODES.map((m) => [m.id, m.label]));

type Row = { kind: "header"; text: string } | { kind: "theme"; theme: Theme } | { kind: "control"; control: Control };

function rowsFor(page: Page): Row[] {
  if (page === "themes") return FAMILIES.flatMap((family) => [
    { kind: "header" as const, text: family.name },
    ...THEMES.filter((t) => t.family === family.id).map((theme) => ({ kind: "theme" as const, theme })),
  ]);
  const out: Row[] = [];
  for (const control of controls(page)) {
    if ((out.at(-1) as { control?: Control } | undefined)?.control?.section !== control.section) out.push({ kind: "header", text: control.section });
    out.push({ kind: "control", control });
  }
  return out;
}

const slider = (level: number, width: number) => {
  const filled = Math.round(Math.max(0, Math.min(1, level)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

export function SettingsDialog(props: { ctx: Context; settings: Accessor<RainbowSettings>; apply: (s: Partial<RainbowSettings>) => void;
  working: () => boolean; page?: Page }) {
  const opening = structuredClone(props.settings());
  const theme = props.ctx.theme;
  const size = useTerminalDimensions();
  const [page, setPage] = createSignal<Page>(props.page ?? "themes");
  const rows = createMemo(() => rowsFor(page()));
  const selectable = createMemo(() => rows().flatMap((row, i) => row.kind === "header" ? [] : [i]));
  const startAt = (p: Page) => {
    if (p !== "themes") return 0;
    const at = selectable().findIndex((i) => { const r = rows()[i]!; return r.kind === "theme" && r.theme.id === findTheme(props.settings().theme)?.id; });
    return Math.max(0, at);
  };
  const [cursor, setCursor] = createSignal(startAt(page()));
  const current = () => rows()[selectable()[cursor()]!]!;
  const highlighted = () => { const r = current(); return r.kind === "theme" ? r.theme : undefined; };

  // On the themes page the preview shows the highlighted theme before it is applied.
  const preview = createMemo<RainbowSettings>(() => {
    const t = highlighted();
    return t ? { ...props.settings(), ...themeLook(t), theme: t.id } : props.settings();
  });

  // The dialog decides its own width; measure it rather than guessing from the terminal.
  const [boxWidth, setBoxWidth] = createSignal(0);
  const width = () => Math.max(40, boxWidth() > 4 ? boxWidth() - 4 : size().width - 12);
  const previewHeight = () => size().height >= 44 ? 14 : size().height >= 32 ? 10 : size().height >= 24 ? 6 : 0;
  // One line is kept for the "more" indicator below the list.
  const slots = () => Math.max(4, size().height - previewHeight() - 15);
  const start = () => {
    const at = selectable()[cursor()] ?? 0;
    return Math.max(0, Math.min(at - Math.floor(slots() / 2), rows().length - slots()));
  };

  const switchPage = (dir: number) => {
    const ids = PAGES.map((p) => p.id);
    const next = ids[(ids.indexOf(page()) + dir + ids.length) % ids.length]!;
    setPage(next);
    setCursor(startAt(next));
  };
  const move = (dir: number) => setCursor((n) => Math.max(0, Math.min(selectable().length - 1, n + dir)));
  const applyTheme = (t: Theme) => props.apply({ theme: t.id, ...themeLook(t) });
  const adjust = (dir: number, toggle = false) => {
    const row = current();
    if (row.kind === "control") props.apply(row.control.step(props.settings(), dir, toggle));
    else if (row.kind === "theme" && toggle) applyTheme(row.theme);
  };

  props.ctx.keymap.layer(() => ({ mode: "global", priority: 100, commands: [
    { bind: "up", run: () => { move(-1); } }, { bind: "down", run: () => { move(1); } },
    { bind: "left", run: () => { if (page() === "themes") move(-1); else adjust(-1); } },
    { bind: "right", run: () => { if (page() === "themes") move(1); else adjust(1); } },
    { bind: "space", run: () => adjust(1, true) },
    { bind: "return", run: () => { if (page() === "themes") adjust(1, true); else props.ctx.ui.dialog.clear(); } },
    { bind: "tab", run: () => switchPage(1) }, { bind: "shift+tab", run: () => switchPage(-1) },
    ...PAGES.map((p, i) => ({ bind: String(i + 1), run: () => { setPage(p.id); setCursor(startAt(p.id)); } })),
    { bind: "pageup", run: () => { move(-8); } }, { bind: "pagedown", run: () => { move(8); } },
    { bind: "home", run: () => { setCursor(0); } }, { bind: "end", run: () => { setCursor(selectable().length - 1); } },
    { bind: "r", run: () => props.apply(opening) },
    { bind: "escape", run: () => props.ctx.ui.dialog.clear() },
  ] }));

  const status = () => {
    const s = props.settings();
    const t = findTheme(s.theme);
    return `${t?.name ?? "Custom"}${isCustomized(s) ? " · customized" : ""}${s.enabled ? "" : " · off"}`;
  };
  // Names what is scrolled out of view, so nothing in the list is silently hidden.
  const more = () => {
    const label = (list: Row[]) => {
      const items = list.filter((r) => r.kind !== "header").length;
      const sections = list.flatMap((r) => r.kind === "header" ? [r.text] : []);
      return items ? `${items} more${sections.length ? `: ${sections.join(", ")}` : ""}` : "";
    };
    const above = label(rows().slice(0, start())), below = label(rows().slice(start() + slots()));
    return [above && `↑ ${above}`, below && `↓ ${below}`].filter(Boolean).join("   ");
  };
  const hint = () => {
    const row = current();
    if (row.kind === "theme") {
      const look = themeLook(row.theme);
      const fx = Object.keys(look.fx).map((id) => getFx(id)?.name.toLowerCase()).filter(Boolean);
      return `${SHAPES[look.mode]} shape · ${MOTIONS[look.motion]?.toLowerCase()} motion · ${fx.length ? fx.join(", ") : "no effects"}`;
    }
    if (row.kind === "control") return row.control.hint;
    return "";
  };
  const keys = () => page() === "themes"
    ? "↑↓ browse  enter apply  tab next page  r undo  esc close"
    : "↑↓ select  ←→ adjust  space toggle  tab next page  r undo  esc close";

  let root: Renderable | undefined;
  return <box paddingX={2} paddingY={1} gap={1} ref={(r: Renderable) => { root = r; }} onSizeChange={() => { if (root) setBoxWidth(root.width); }}>
    <box flexDirection="row" justifyContent="space-between">
      <text wrapMode="none"><For each={PAGES}>{(p, i) =>
        <span style={{ fg: p.id === page() ? theme.text.base : theme.text.muted, attributes: p.id === page() ? 1 | 8 : 0 }}>{`${i() + 1} ${p.name}`}{"   "}</span>
      }</For></text>
      <text fg={theme.text.muted} wrapMode="none">{status()}</text>
    </box>
    <Show when={previewHeight() > 0}>
      <ScreenPreview ctx={props.ctx} settings={preview} width={width} height={previewHeight()} working={props.working} />
    </Show>
    <box onMouseScroll={(event) => { move(event.scroll?.direction === "up" ? -1 : 1); }}>
      <For each={rows().slice(start(), start() + slots())}>{(row, index) => {
        const at = () => start() + index();
        const selected = () => selectable()[cursor()] === at();
        const pick = () => { const k = selectable().indexOf(at()); if (k >= 0) { setCursor(k); adjust(1, true); } };
        if (row.kind === "header") return <text fg={theme.text.muted} wrapMode="none" attributes={1}>{row.text}</text>;
        if (row.kind === "theme") {
          const active = () => findTheme(props.settings().theme)?.id === row.theme.id;
          return <box flexDirection="row" height={1} gap={2} onMouseDown={pick}>
            <text fg={theme.text.base} wrapMode="none" flexShrink={0}>{selected() ? "›" : " "} {active() ? "●" : " "} {row.theme.name.padEnd(16)}</text>
            <box flexShrink={0}><Swatch preset={row.theme.id} vibrance={row.theme.look.vibrance} brightness={row.theme.look.brightness} width={16} /></box>
            <text fg={theme.text.muted} wrapMode="none" truncate flexShrink={1} minWidth={0}>{row.theme.blurb}</text>
          </box>;
        }
        const c = row.control;
        return <box flexDirection="row" height={1} gap={1} onMouseDown={pick}>
          <text fg={theme.text.base} wrapMode="none" flexShrink={0}>{selected() ? "›" : " "} {c.label.padEnd(20)}</text>
          <Show when={c.kind === "number" && c.level} fallback={
            <text fg={theme.text.base} wrapMode="none">{c.kind === "choice" ? `‹ ${c.read(props.settings())} ›` : c.read(props.settings())}</text>}>
            <text fg={selected() ? theme.text.base : theme.text.muted} wrapMode="none">{slider(c.level!(props.settings()), 16)}</text>
            <text fg={theme.text.base} wrapMode="none">{c.read(props.settings())}</text>
          </Show>
          <Show when={c.key === "preset"}>
            <Swatch preset={props.settings().preset} vibrance={props.settings().vibrance} brightness={props.settings().brightness} width={16} />
          </Show>
        </box>;
      }}</For>
    </box>
    <text fg={theme.text.muted} wrapMode="none" truncate>{more()}</text>
    <text fg={theme.text.muted} wrapMode="word">{hint()}</text>
    <text fg={theme.text.muted} wrapMode="none">{keys()}</text>
  </box>;
}

/* ------------------------------------------------------------------ *
 * Splash
 * ------------------------------------------------------------------ */

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

function BannerPreview(props: { ctx: Context; settings: Accessor<RainbowSettings>; lines: (width: number) => string[]; width: Accessor<number> }) {
  const engine = new RainbowEngine(props.settings());
  const width = props.width;
  const [tick, setTick] = createSignal(0);
  const pump = new AnimationPump(engine, props.settings, () => false, () => setTick((n) => n + 1));
  createEffect(() => { engine.updateSettings(props.settings()); pump.activity(); setTick((n) => n + 1); });
  onCleanup(() => pump.dispose());
  const content = createMemo(() => {
    tick();
    const lines = props.lines(width());
    return styled(engine.process(lines, { width: width(), height: lines.length, fullscreen: true }));
  });
  return <text wrapMode="none"><For each={content()}>{(chunk) =>
    <span style={{ fg: chunk.fg, bg: chunk.bg, attributes: chunk.attributes }}>{chunk.text}</span>
  }</For></text>;
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
    <BannerPreview ctx={props.ctx} settings={() => s} width={() => Math.max(8, Math.min(64, size().width - 8))}
      lines={(w) => ["", ...(w >= 55 && size().height >= 18 ? BANNER : ["RAINBOW"]), "",
        `${THEMES.length} themes · ${allFx().length} effects`, "Any key to dismiss"]
        .map((line) => " ".repeat(Math.max(0, Math.floor((w - line.length) / 2))) + line.slice(0, w))} />
  </box>;
}

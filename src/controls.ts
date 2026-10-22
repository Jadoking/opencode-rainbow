import { GRADIENT_MODES, MOTION_MODES } from "./field.js";
import { allFx, getFx } from "./fx.js";
import { SCOPES } from "./layout.js";
import { DEFAULT_SETTINGS, type RainbowSettings } from "./settings.js";
import { findTheme, THEMES } from "./themes.js";

export type Page = "themes" | "customize" | "effects" | "advanced";
export const PAGES: { id: Page; name: string }[] = [
  { id: "themes", name: "Themes" }, { id: "customize", name: "Customize" },
  { id: "effects", name: "Effects" }, { id: "advanced", name: "Advanced" },
];

export type Control = {
  key: string; label: string; section: string; hint: string;
  kind: "number" | "choice" | "toggle";
  read: (s: RainbowSettings) => string;
  /** Position on a slider, 0..1, for numeric controls. */
  level?: (s: RainbowSettings) => number;
  step: (s: RainbowSettings, direction: number, toggle?: boolean) => Partial<RainbowSettings>;
};

export const ranges: Partial<Record<keyof RainbowSettings, [number, number, number]>> = {
  presetFade: [0, 5, .1], presetCycle: [0, 3600, 10], minContrast: [1, 21, .2],
  speed: [0, 3, .02], turns: [.1, 16, .25], angle: [0, 1, 1 / 24],
  blend: [0, 1, .05], boxBlend: [0, 1, .05], vibrance: [0, 2, .05], brightness: [-.5, .5, .05],
  chaos: [0, 2, .05], fps: [1, 60, 1], idleFps: [0, 60, 1], idleAfter: [1, 600, 30], frameBudgetMs: [0, 500, 2],
};

const SCOPE_NAMES: Record<string, string> = { panels: "Panels and text", screen: "Whole screen", chrome: "Borders only", text: "Text only" };
const named = <T extends { id: string; label: string }>(list: T[]) => Object.fromEntries(list.map((m) => [m.id, m.label]));
const SHAPES = named(GRADIENT_MODES), MOTIONS = named(MOTION_MODES);

export const choices: Partial<Record<keyof RainbowSettings, { value: string; label: string }[]>> = {
  preset: THEMES.map((t) => ({ value: t.id, label: t.name })),
  scope: SCOPES.map((s) => ({ value: s.id, label: SCOPE_NAMES[s.id] ?? s.id })),
  mode: GRADIENT_MODES.map((m) => ({ value: m.id, label: m.label })),
  motion: MOTION_MODES.map((m) => ({ value: m.id, label: m.label })),
  regularMode: ["off", "viewport", "full"].map((v) => ({ value: v, label: v })),
};

type Field = [keyof RainbowSettings, string, string];
const PAGE_FIELDS: Record<Exclude<Page, "themes" | "effects">, [string, Field[]][]> = {
  customize: [
    ["Palette", [["preset", "Palette", "Colours only; keeps the shape, motion and effects you have"]]],
    ["Pattern", [
      ["mode", "Shape", "How colour is laid across the screen"],
      ["motion", "Motion", "How the pattern moves over time"],
      ["speed", "Speed", "Palette cycles per second; 0 holds still"],
      ["turns", "Repeats", "How many times the palette repeats across the screen"],
      ["angle", "Angle", "Rotates the pattern"],
    ]],
    ["Colour", [
      ["blend", "Text colour", "How strongly text takes the palette"],
      ["boxBlend", "Panel tint", "How strongly filled panels such as tool output and the sidebar take the palette"],
      ["vibrance", "Vibrance", "Below 1 mutes the palette, above 1 makes it more vivid"],
      ["brightness", "Brightness", "Lightens or darkens the palette"],
      ["minContrast", "Contrast floor", "Lifts text that would be hard to read; 1 turns this off"],
      ["chaos", "Effect strength", "Scales every effect at once"],
    ]],
    ["Where colour goes", [
      ["scope", "Colour area", "Which parts of the screen are coloured"],
      ["colorText", "App text", "Colour text in the transcript"],
      ["colorInput", "Prompt text", "Colour what you type; characters and background stay as they are"],
      ["colorFooter", "Footer and sidebar", "Colour the status line and sidebar"],
      ["colorBackground", "Backgrounds", "Tint panel backgrounds"],
      ["preserveDim", "Keep dim text dim", "Secondary text stays quieter than the rest"],
      ["fullBleed", "Fill to the edge", "Include empty space to the right edge"],
    ]],
  ],
  advanced: [
    ["Animation", [
      ["enabled", "Rainbow", "Turn the whole plugin on or off"],
      ["fps", "Frame rate", "Animation updates per second"],
      ["reducedMotion", "Reduced motion", "Slower, gentler, capped at 12 fps"],
      ["reactive", "React to activity", "Speed up and brighten while the agent works or you type"],
      ["alwaysAnimate", "Pause when idle", "Stop animating after the idle time; typing and agent work wake it"],
      ["idleAfter", "Idle after", "Seconds without activity before pausing"],
      ["idleFps", "Idle frame rate", "Frame rate when idle pausing is off"],
      ["calmOnOverlay", "Calm under menus", "Quieter while a menu or dialog is open"],
      ["presetFade", "Theme crossfade", "Seconds to blend from one palette to the next"],
      ["presetCycle", "Rotate palettes", "Switch to a random palette every N seconds; 0 turns this off"],
    ]],
    ["Performance", [
      ["frameBudgetMs", "Frame budget", "Drop expensive effects when a frame takes longer than this (ms); 0 turns this off"],
      ["animateInTmux", "Animate in tmux", "Animate inside tmux, which can be heavy"],
    ]],
    ["Display", [
      ["showStatus", "Footer status", "Show the current theme in the footer"],
      ["splashOnStart", "Splash on start", "Show the banner when OpenCode starts"],
      ["regularMode", "Main-screen mode", "For hosts that render outside the full-screen view"],
    ]],
  ],
};

const round = (n: number) => Math.round(n * 10000) / 10000;

function field([key, label, hint]: Field, section: string): Control {
  const range = ranges[key], list = choices[key];
  const isBool = typeof DEFAULT_SETTINGS[key] === "boolean";
  return {
    key, label, section, hint, kind: isBool ? "toggle" : list ? "choice" : "number",
    read: (s) => {
      const v = s[key];
      if (key === "alwaysAnimate") return s.alwaysAnimate ? "off" : "on";
      if (isBool) return v ? "on" : "off";
      if (key === "preset") return findTheme(String(v))?.name ?? "Custom colours";
      if (key === "mode") return SHAPES[String(v)] ?? String(v);
      if (key === "motion") return MOTIONS[String(v)] ?? String(v);
      if (list) return list.find((c) => c.value === v)?.label ?? String(v);
      if (key === "angle") return `${Math.round(s.angle * 360)}°`;
      if (key === "presetCycle" || key === "idleAfter") return v ? `${v}s` : "off";
      return `${round(Number(v))}`;
    },
    level: range ? (s) => (Number(s[key]) - range[0]) / (range[1] - range[0]) : undefined,
    step: (s, dir) => {
      if (isBool) return { [key]: !s[key] };
      if (list) {
        const values = list.map((c) => c.value);
        return { [key]: values[(Math.max(0, values.indexOf(String(s[key]))) + dir + values.length) % values.length] };
      }
      const [min, max, step] = range!;
      return { [key]: round(Math.max(min, Math.min(max, Number(s[key]) + dir * step))) };
    },
  };
}

/** Effects by what they do, not how they are built. */
const EFFECT_SECTIONS: [string, string[]][] = [
  ["Backgrounds", ["starfield", "aurora", "plasmafield", "gridfloor", "tunnelrings"]],
  ["Weather and particles", ["rain", "snow", "sakura", "bubbles", "fireflies", "confetti", "comet", "fire", "matrix"]],
  ["Reacts to activity", ["ripples", "heat", "waveform", "spotlight", "lightning"]],
  ["Light and glow", ["shine", "neon", "bloom", "shadow", "breathing", "vignette"]],
  ["Retro and distortion", ["scanlines", "noisegrain", "interlace", "dither", "wobble", "glitch", "aberration", "strobe"]],
];

function effect(id: string, section: string): Control {
  const fx = getFx(id)!;
  return {
    key: `fx.${id}`, label: fx.name, section, hint: fx.blurb, kind: "number",
    read: (s) => s.fx[id] ? `${Math.round(s.fx[id]! * 100)}%` : "off",
    level: (s) => s.fx[id] ?? 0,
    step: (s, dir, toggle) => {
      const current = s.fx[id] ?? 0;
      const level = toggle ? current > 0 ? 0 : fx.defaultIntensity : Math.max(0, Math.min(1, Math.round((current + dir * .05) * 100) / 100));
      const next = { ...s.fx };
      if (level) next[id] = level; else delete next[id];
      return { fx: next };
    },
  };
}

export function controls(page: Exclude<Page, "themes">): Control[] {
  if (page === "effects") return EFFECT_SECTIONS.flatMap(([section, ids]) => ids.filter(getFx).map((id) => effect(id, section)));
  return PAGE_FIELDS[page].flatMap(([section, fields]) => fields.map((f) => field(f, section)));
}

/** Effects that exist but are not offered (they have no effect in OpenCode). */
export const HIDDEN_EFFECTS = allFx().map((f) => f.id).filter((id) => !EFFECT_SECTIONS.some(([, ids]) => ids.includes(id)));

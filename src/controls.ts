import { GRADIENT_MODES, MOTION_MODES } from "./field.js";
import { allFx } from "./fx.js";
import { SCOPES } from "./layout.js";
import { PRESETS } from "./presets.js";
import { DEFAULT_SETTINGS, type RainbowSettings } from "./settings.js";

export type Control = {
  key: string; label: string; group: string; hint: string;
  read: (s: RainbowSettings) => string;
  step: (s: RainbowSettings, direction: number, toggle?: boolean) => Partial<RainbowSettings>;
};
const cycle = (list: string[], value: string, dir: number) => list[(Math.max(0, list.indexOf(value)) + dir + list.length) % list.length];
const labels: Record<string, string> = {
  colorText: "App text", colorInput: "Input text", colorFooter: "Footer text", boxBlend: "Box strength",
  blend: "Text blend", colorBackground: "Background", showStatus: "Footer status", alwaysAnimate: "Idle pause",
};
export const ranges: Partial<Record<keyof RainbowSettings, [number, number, number]>> = {
  presetFade: [0, 5, .1], presetCycle: [0, 3600, 10], minContrast: [1, 21, .2],
  speed: [0, 3, .02], turns: [.1, 16, .25], angle: [0, 1, 1 / 24],
  blend: [0, 1, .05], boxBlend: [0, 1, .05], vibrance: [0, 2, .05], brightness: [-.5, .5, .05],
  chaos: [0, 2, .05], fps: [1, 60, 1], idleFps: [0, 60, 1], idleAfter: [1, 600, 30], frameBudgetMs: [0, 500, 2],
};
export const choices: Partial<Record<keyof RainbowSettings, string[]>> = {
  preset: PRESETS.map((p) => p.id), scope: SCOPES.map((s) => s.id), mode: GRADIENT_MODES.map((m) => m.id),
  motion: MOTION_MODES.map((m) => m.id), regularMode: ["off", "viewport", "full"],
};
const hints: Record<string, string> = {
  presetFade: "Crossfade duration in seconds", presetCycle: "Auto-change palette every N seconds; 0 disables",
  minContrast: "Minimum text/background contrast; 1 disables", speed: "Palette cycles per second",
  angle: "Gradient rotation, stored as turns", boxBlend: "0% original fill, 100% palette; effects still apply",
  colorInput: "Tint prompt text; preserve characters and background", colorFooter: "Tint model and status text only",
  alwaysAnimate: "Stop animation after the idle timeout; input and agent activity wake it",
  idleAfter: "Idle timeout in seconds; active agent work never times out", frameBudgetMs: "Drop expensive effects when over budget; 0 disables",
  regularMode: "Main-screen renderer policy; the full-screen TUI always uses its visible frame",
  fullBleed: "Include empty cells to the right edge", calmOnOverlay: "Reduce intensity while a menu is open",
  reducedMotion: "Reduce speed and intensity; cap animation at 12 fps", reactive: "React to typing, tools, and agent work",
};
const groups: [string, (keyof RainbowSettings)[]][] = [
  ["What and where", ["enabled", "scope", "preset", "presetFade", "presetCycle"]],
  ["Gradient", ["mode", "motion", "speed", "turns", "angle"]],
  ["Colour", ["blend", "boxBlend", "vibrance", "brightness", "minContrast", "colorText", "colorInput", "colorFooter", "colorBackground", "preserveDim", "fullBleed"]],
  ["Animation", ["chaos", "fps", "alwaysAnimate", "idleAfter", "idleFps", "animateInTmux", "reactive", "calmOnOverlay", "reducedMotion", "frameBudgetMs"]],
  ["Display", ["regularMode", "showStatus", "splashOnStart"]],
];
export function controls(): Control[] {
  const fields = groups.flatMap(([group, keys]) => keys.map((key): Control => ({
    key, group, label: labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
    hint: hints[key] ?? key,
    read: (s) => key === "alwaysAnimate" ? s.alwaysAnimate ? "off" : `${s.idleAfter}s` :
      key === "angle" ? `${Math.round(s.angle * 360)}°` : typeof s[key] === "boolean" ? s[key] ? "on" : "off" :
      typeof s[key] === "number" ? `${Math.round((s[key] as number) * 100) / 100}` : String(s[key]),
    step: (s, dir) => {
      if (typeof DEFAULT_SETTINGS[key] === "boolean") return { [key]: !s[key] };
      const list = choices[key];
      if (list) return { [key]: cycle(list, String(s[key]), dir) };
      const [min, max, step] = ranges[key]!;
      return { [key]: Math.round(Math.max(min, Math.min(max, Number(s[key]) + dir * step)) * 10000) / 10000 };
    },
  })));
  const effects = allFx().map((fx): Control => ({
    key: `fx.${fx.id}`, label: fx.id, group: `Effects / ${fx.group}`, hint: `${fx.name}: ${fx.blurb}`,
    read: (s) => (s.fx[fx.id] ?? 0).toFixed(2),
    step: (s, dir, toggle) => {
      const current = s.fx[fx.id] ?? 0;
      const level = toggle ? current > 0 ? 0 : fx.defaultIntensity : Math.max(0, Math.min(1, Math.round((current + dir * .05) * 100) / 100));
      const next = { ...s.fx };
      if (level) next[fx.id] = level; else delete next[fx.id];
      return { fx: next };
    },
  }));
  fields.splice(21, 0, ...effects);
  return fields;
}

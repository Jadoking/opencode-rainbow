import assert from "node:assert/strict";
import test from "node:test";
import { commands, settingPatch, themePatch } from "../src/commands.js";
import { controls, HIDDEN_EFFECTS } from "../src/controls.js";
import { parseHex, rgbToOklch } from "../src/color.js";
import { RainbowEngine } from "../src/engine.js";
import { allFx, getFx } from "../src/fx.js";
import { AnimationPump } from "../src/pump.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.js";
import { findTheme, isCustomized, THEMES } from "../src/themes.js";
import { isRainbowAnimationDisabled } from "../src/terminal.js";
import type { Context } from "@opencode/plugin/tui/context";

test("every persisted setting has a control; every theme applies cleanly", () => {
  assert.ok(THEMES.length >= 18 && THEMES.length <= 24, `${THEMES.length} themes`);
  const keys = new Set([...controls("customize"), ...controls("advanced"), ...controls("effects")].map((c) => c.key));
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key !== "fx" && key !== "theme") assert.ok(keys.has(key), key);
  }
  for (const fx of allFx()) assert.ok(keys.has(`fx.${fx.id}`) || HIDDEN_EFFECTS.includes(fx.id), fx.id);
  assert.deepEqual(HIDDEN_EFFECTS, ["typewriter"], "only effects with no effect in OpenCode are hidden");
  for (const theme of THEMES) {
    const s = normalizeSettings({ ...DEFAULT_SETTINGS, ...themePatch(theme) });
    assert.equal(s.theme, theme.id);
    assert.ok(!isCustomized(s), `${theme.id} applies exactly`);
    for (const id of Object.keys(theme.look.fx ?? {})) assert.ok(getFx(id), `${theme.id}: ${id}`);
    const engine = new RainbowEngine(s);
    const rows = engine.process(["╭──────────────────────────────╮", "│ A whole look                 │", "╰──────────────────────────────╯"], { width: 32, height: 3, fullscreen: true });
    assert.ok(!rows.join("").includes("NaN"));
  }
  assert.ok(!isCustomized(normalizeSettings(DEFAULT_SETTINGS)), "defaults are the default theme, unmodified");
});

test("theme palettes read as text and editor themes keep their identity", () => {
  // Smallest arc of the hue circle holding every clearly coloured stop.
  const arc = (colors: string[]) => {
    const hues = colors.map((c) => rgbToOklch(parseHex(c))).filter((c) => c.C >= 0.05).map((c) => c.h).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 0; i < hues.length; i++) gap = Math.max(gap, (i + 1 < hues.length ? hues[i + 1]! : hues[0]! + 1) - hues[i]!);
    return 1 - gap;
  };
  for (const theme of THEMES) {
    for (const c of theme.colors) assert.ok(rgbToOklch(parseHex(c)).L >= 0.5, `${theme.id} ${c} is too dark for text`);
    if (theme.family === "editor") assert.ok(arc(theme.colors) < 0.5, `${theme.id} spans ${arc(theme.colors).toFixed(2)} of the hue circle`);
  }
  assert.ok(arc(findTheme("classic")!.colors) > 0.6, "the classic rainbow still is one");
});

test("old palette names map to the theme that replaced them", () => {
  assert.equal(normalizeSettings({ preset: "ice" }).preset, "winter");
  assert.equal(normalizeSettings({ preset: "ice" }).theme, "winter");
  assert.equal(normalizeSettings({ preset: "nord" }).theme, "nord");
  assert.equal(normalizeSettings({ preset: "commodore" }).theme, "tokyo-night");
  // Every palette from the original 81, except the pride flags, lands on a theme.
  const old = `classic spectrum pastel neon double-rainbow prism catppuccin catppuccin-latte dracula gruvbox gruvbox-light nord
    tokyo-night rose-pine kanagawa everforest solarized monokai one-dark ayu night-owl github-dark zenburn synthwave outrun vaporwave
    miami phosphor amber matrix tron commodore gameboy teletext sunset sunrise ocean deep-sea lava ice toxic blood candy cotton unicorn
    galaxy nebula aurora holographic oil-slick chrome gold thermal ultraviolet mono sepia duotone fire-and-ice forest autumn sakura
    desert mint peach storm hazard traffic glitch acid blacklight plasma-tv infrared static`.split(/\s+/);
  assert.equal(old.length, 73);
  for (const id of old) assert.ok(findTheme(id), id);
  assert.equal(normalizeSettings({ preset: "bi" }).preset, DEFAULT_SETTINGS.preset, "removed pride palettes fall back to the default");
  assert.equal(normalizeSettings({ preset: "#112233,#445566" }).preset, "#112233,#445566");
});

test("commands accept both argument-only and full slash input", async () => {
  let s = normalizeSettings(DEFAULT_SETTINGS);
  const errors: string[] = [];
  const opened: (string | undefined)[] = [];
  const ctx = { ui: { toast: { show: (v: { variant?: string; message: string }) => { if (v.variant === "error") errors.push(v.message); } } } } as unknown as Context;
  const entries = commands(ctx, () => s, (patch) => { s = normalizeSettings({ ...s, ...patch }); },
    { settings: (page) => { opened.push(page); }, splash() {}, status: () => "" });
  const run = (name: string, input?: string) => entries.find((c) => c.slash?.name === name)!.run(input);
  assert.equal(entries.filter((c) => c.slash).length, 8);
  await run("rainbow-theme"); assert.deepEqual(opened, ["themes"]);
  await run("rainbow-theme", "/rainbow-theme Nord"); assert.equal(s.theme, "nord"); assert.equal(s.preset, "nord"); assert.deepEqual(s.fx, {});
  await run("rainbow-theme", "winter"); assert.deepEqual({ ...s.fx }, { snow: 0.55 });
  await run("rainbow-theme", "next"); assert.notEqual(s.theme, "winter");
  await run("rainbow-theme", "nope"); assert.equal(errors.length, 1);
  await run("rainbow-fx"); assert.deepEqual(opened, ["themes", "effects"]);
  await run("rainbow-fx", "none"); assert.deepEqual(s.fx, {});
  await run("rainbow-fx", "rain 0.8"); assert.equal(s.fx.rain, .8);
  await run("rainbow-fx", "rain"); assert.deepEqual(s.fx, {});
  await run("rainbow-fx", "rain nope"); assert.equal(errors.length, 2); assert.deepEqual(s.fx, {});
  await run("rainbow-set", "mode spiral"); assert.equal(s.mode, "spiral");
  await run("rainbow", "off"); assert.equal(s.enabled, false);
  await run("rainbow-reset"); assert.deepEqual(s, normalizeSettings(DEFAULT_SETTINGS));
});

test("angle controls use turns and custom palette/numeric validation rejects invalid inputs", () => {
  const angle = controls("customize").find((c) => c.key === "angle")!;
  const patch = angle.step(normalizeSettings({ angle: 0 }), 1);
  assert.ok(patch.angle! > 0 && patch.angle! < .05);
  assert.equal(settingPatch("preset", "#f00,#00f").preset, "#f00,#00f");
  assert.throws(() => settingPatch("preset", "#nope,#nah"));
  assert.throws(() => settingPatch("fps", "NaN"));
  assert.throws(() => settingPatch("brightness", "1"));
  assert.throws(() => settingPatch("__proto__", "true"));
});

test("idle pump stops, wakes without polling, exempts ongoing work, and disposes", () => {
  const s = normalizeSettings({ idleAfter: 1, reducedMotion: true, fps: 60 });
  const engine = new RainbowEngine(s);
  let working = false;
  let now = 0;
  Object.defineProperty(engine, "now", { get: () => now });
  const pump = new AnimationPump(engine, () => s, () => working, () => {});
  pump.activity(); assert.equal(pump.fps, 12);
  now = 2; pump.refresh(); assert.equal(pump.fps, 0);
  pump.activity(); assert.equal(pump.fps, 12);
  now = 4; working = true; pump.refresh(); assert.equal(pump.fps, 12);
  pump.suspended = true; pump.refresh(); assert.equal(pump.fps, 0);
  pump.suspended = false; s.alwaysAnimate = true; s.idleFps = 3; working = false; now = 8;
  pump.refresh(); assert.equal(pump.fps, 3);
  pump.dispose(); pump.activity(); assert.equal(pump.fps, 0);
});

test("tmux and legacy/new motion environment overrides preserve precedence", () => {
  assert.ok(isRainbowAnimationDisabled({}, { TMUX: "/test" }));
  assert.ok(!isRainbowAnimationDisabled({ animateInTmux: true }, { TMUX: "/test" }));
  assert.ok(!isRainbowAnimationDisabled({}, { TMUX: "/test", PI_RAINBOW_FORCE_ANIMATION: "1" }));
  assert.ok(isRainbowAnimationDisabled({}, { OPENCODE_RAINBOW_DISABLE_ANIMATION: "1", PI_RAINBOW_FORCE_ANIMATION: "1" }));
});

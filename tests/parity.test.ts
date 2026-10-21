import assert from "node:assert/strict";
import test from "node:test";
import { commands, settingPatch } from "../src/commands.js";
import { controls } from "../src/controls.js";
import { RainbowEngine } from "../src/engine.js";
import { GRADIENT_MODES, MOTION_MODES } from "../src/field.js";
import { allFx } from "../src/fx.js";
import { PRESETS } from "../src/presets.js";
import { AnimationPump } from "../src/pump.js";
import { BUNDLES, DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.js";
import { isRainbowAnimationDisabled } from "../src/terminal.js";
import type { Context } from "@opencode/plugin/tui/context";

test("complete Pi catalogues and every persisted setting have live controls", () => {
  assert.equal(PRESETS.length, 81); assert.equal(allFx().length, 34); assert.equal(BUNDLES.length, 13);
  assert.equal(GRADIENT_MODES.length, 16); assert.equal(MOTION_MODES.length, 8);
  const keys = new Set(controls().map((c) => c.key));
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key !== "fx") assert.ok(keys.has(key), key);
  }
  for (const fx of allFx()) assert.ok(keys.has(`fx.${fx.id}`));
  for (const bundle of BUNDLES) {
    const s = normalizeSettings({ ...DEFAULT_SETTINGS, ...bundle.settings });
    const engine = new RainbowEngine(s);
    const rows = engine.process(["╭──────────────────────────────╮", "│ A whole look                 │", "╰──────────────────────────────╯"], { width: 32, height: 3, fullscreen: true });
    assert.equal(rows.length, 3);
    assert.ok(!rows.join("").includes("NaN"));
  }
});

test("commands accept both argument-only and full slash input; speed query is non-mutating", async () => {
  let s = normalizeSettings(DEFAULT_SETTINGS);
  const errors: string[] = [];
  const ctx = { ui: { toast: { show: (v: { variant?: string; message: string }) => { if (v.variant === "error") errors.push(v.message); } } } } as unknown as Context;
  const entries = commands(ctx, () => s, (patch) => { s = normalizeSettings({ ...s, ...patch }); }, { settings() {}, splash() {}, status: () => "" });
  const run = (name: string, input?: string) => entries.find((c) => c.slash?.name === name)!.run(input);
  assert.equal(entries.filter((c) => c.slash).length, 12);
  await run("rainbow-speed"); assert.equal(s.speed, DEFAULT_SETTINGS.speed);
  await run("rainbow-preset", "/rainbow-preset holographic"); assert.equal(s.preset, "holographic");
  await run("rainbow-fx", "none"); assert.deepEqual(s.fx, {});
  await run("rainbow-fx", "rain 0.8"); assert.equal(s.fx.rain, .8);
  await run("rainbow-fx", "rain"); assert.deepEqual(s.fx, {});
  await run("rainbow-fx", "rain nope"); assert.equal(errors.length, 1); assert.deepEqual(s.fx, {});
  await run("rainbow-bundle", "winter"); assert.equal(s.preset, "ice");
  await run("rainbow-mode", "spiral"); assert.equal(s.mode, "spiral");
  await run("rainbow-mode", "orbit"); assert.equal(s.motion, "orbit");
  await run("rainbow", "off"); assert.equal(s.enabled, false);
  await run("rainbow-reset"); assert.deepEqual(s, normalizeSettings(DEFAULT_SETTINGS));
});

test("angle controls use turns and custom palette/numeric validation rejects invalid inputs", () => {
  const angle = controls().find((c) => c.key === "angle")!;
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

import type { Context, KeymapCommand } from "@opencode/plugin/tui/context";
import { choices, ranges } from "./controls.js";
import { GRADIENT_MODES, MOTION_MODES } from "./field.js";
import { allFx, getFx } from "./fx.js";
import { SCOPES } from "./layout.js";
import { findPreset, nextPresetId, PRESETS, prevPresetId } from "./presets.js";
import { BUNDLES, DEFAULT_SETTINGS, getBundle, type RainbowSettings } from "./settings.js";

export function settingPatch(key: string, value: string): Partial<RainbowSettings> {
  if (!Object.hasOwn(DEFAULT_SETTINGS, key) || key === "fx") throw new Error("Unknown setting. Use /rainbow-settings or /rainbow-fx.");
  const k = key as keyof RainbowSettings;
  if (typeof DEFAULT_SETTINGS[k] === "boolean") {
    if (!["on", "off", "true", "false"].includes(value)) throw new Error("Expected on or off.");
    return { [key]: value === "on" || value === "true" };
  }
  if (ranges[k]) {
    const n = Number(value);
    const [min, max] = ranges[k]!;
    if (!value || !Number.isFinite(n) || n < min || n > max) throw new Error(`Expected a number from ${min} to ${max}.`);
    return { [key]: n };
  }
  if (k === "preset") {
    const preset = findPreset(value);
    if (preset) return { preset: preset.id };
    if (/^#[\da-f]{3}(?:[\da-f]{3})?(?:[ ,]+#[\da-f]{3}(?:[\da-f]{3})?)+$/i.test(value)) return { preset: value };
    throw new Error("Unknown palette. Use a palette name or two or more #hex colours.");
  }
  if (!choices[k]?.includes(value)) throw new Error(`Expected ${choices[k]?.join(", ")}.`);
  return { [key]: value };
}

export function commands(ctx: Context, get: () => RainbowSettings,
  apply: (patch: Partial<RainbowSettings>, message?: string) => void,
  ui: { settings: () => void; splash: () => void; status: () => string }): KeymapCommand[] {
  const notify = (message: string) => ctx.ui.toast.show({ title: "Rainbow", message });
  const definitions: [string, string, (args: string) => void | Promise<void>][] = [
    ["rainbow", "Toggle Rainbow", (q) => apply({ enabled: q === "on" ? true : q === "off" ? false : !get().enabled }, "Rainbow updated")],
    ["rainbow-status", "Rainbow renderer diagnostics", () => ctx.ui.dialog.alert({ title: "Rainbow status", message: ui.status() })],
    ["rainbow-settings", "Rainbow live settings", ui.settings],
    ["rainbow-preset", "Rainbow palette", async (q) => {
      let id: string | undefined;
      if (!q || q === "list") id = await ctx.ui.dialog.select({ title: `${PRESETS.length} Rainbow palettes`, current: get().preset,
        options: PRESETS.map((p) => ({ title: p.name, value: p.id, category: p.group, description: p.id })) });
      else if (q === "next") id = nextPresetId(get().preset);
      else if (q === "prev" || q === "previous") id = prevPresetId(get().preset);
      else if (q === "random") id = PRESETS[Math.floor(Math.random() * PRESETS.length)].id;
      else id = settingPatch("preset", q).preset;
      if (id) apply({ preset: id }, `Palette: ${findPreset(id)?.name ?? id}`);
    }],
    ["rainbow-bundle", "Rainbow whole-look bundle", async (q) => {
      if (!q || q === "list") q = await ctx.ui.dialog.select({ title: "Rainbow bundles", options: BUNDLES.map((b) => ({ title: b.name, value: b.id, description: b.blurb })) }) ?? "";
      if (!q) return;
      const bundle = getBundle(q);
      if (!bundle) throw new Error(`Unknown bundle "${q}". Try /rainbow-bundle list.`);
      apply(bundle.settings, bundle.name);
    }],
    ["rainbow-fx", "Rainbow effects", async (q) => {
      if (!q || q === "list") q = await ctx.ui.dialog.select({ title: "Rainbow effects, select to toggle", options: allFx().map((f) => ({
        title: `${get().fx[f.id] ? "●" : "○"} ${f.name}`, value: f.id, category: f.group, description: `${(get().fx[f.id] ?? 0).toFixed(2)} · ${f.blurb}`,
      })) }) ?? "";
      if (!q) return;
      if (q === "none" || q === "clear") { apply({ fx: {} }, "All effects off"); return; }
      const [name, value] = q.split(/\s+/);
      const effect = getFx(name);
      if (!effect) throw new Error(`Unknown effect "${name}". Try /rainbow-fx list.`);
      if (value !== undefined && !Number.isFinite(Number(value))) throw new Error("Effect intensity must be a number from 0 to 1.");
      const n = value === undefined ? get().fx[name] ? 0 : effect.defaultIntensity : Math.max(0, Math.min(1, Number(value)));
      const fx = { ...get().fx };
      if (n) fx[name] = n; else delete fx[name];
      apply({ fx }, `${effect.name}: ${n || "off"}`);
    }],
    ["rainbow-mode", "Rainbow gradient or motion", async (q) => {
      if (!q || q === "list") q = await ctx.ui.dialog.select({ title: "Rainbow field and motion", options: [
        ...GRADIENT_MODES.map((m) => ({ title: m.id, value: m.id, category: "Field" })),
        ...MOTION_MODES.map((m) => ({ title: m.id, value: m.id, category: "Motion" })),
      ] }) ?? "";
      if (!q) return;
      const field = GRADIENT_MODES.find((m) => m.id === q);
      const motion = MOTION_MODES.find((m) => m.id === q);
      if (field) apply({ mode: field.id }, `Field: ${q}`);
      else if (motion) apply({ motion: motion.id }, `Motion: ${q}`);
      else throw new Error(`Unknown mode "${q}". Try /rainbow-mode list.`);
    }],
    ["rainbow-scope", "Rainbow colour scope", async (q) => {
      if (!q || q === "list") q = await ctx.ui.dialog.select({ title: "Rainbow scope", current: get().scope,
        options: SCOPES.map((s) => ({ title: s.id, value: s.id, description: s.blurb })) }) ?? "";
      if (q) apply(settingPatch("scope", q), `Scope: ${q}`);
    }],
    ["rainbow-speed", "Rainbow animation speed", (q) => {
      if (!q) { notify(`Speed: ${get().speed} cycles/s`); return; }
      apply(settingPatch("speed", q), `Speed: ${q}`);
    }],
    ["rainbow-reset", "Reset Rainbow to defaults", () => apply({ ...DEFAULT_SETTINGS, fx: { ...DEFAULT_SETTINGS.fx } }, "Rainbow reset to defaults")],
    ["rainbow-splash", "Show Rainbow splash", ui.splash],
    ["rainbow-set", "Set any Rainbow setting", (q) => {
      const [key, ...value] = q.split(/\s+/);
      apply(settingPatch(key, value.join(" ")), `${key} updated`);
    }],
  ];
  const result: KeymapCommand[] = definitions.map(([name, title, run]) => ({ id: name.replace("rainbow-", "rainbow."),
    title, group: "Rainbow", palette: true, slash: { name,
      ...["rainbow-status", "rainbow-settings", "rainbow-reset", "rainbow-splash"].includes(name) ? {} : { arguments: true as const } },
    run: async (input = "") => {
      const raw = input.replace(new RegExp(`^/?${name}(?:\\s+|$)`), "").trim();
      const q = name === "rainbow-set" ? raw : raw.toLowerCase();
      try { await run(q); } catch (error) { ctx.ui.toast.show({ title: "Rainbow", variant: "error", message: String(error instanceof Error ? error.message : error) }); }
    },
  }));
  result.push({ id: "rainbow.next", title: "Rainbow: next palette", group: "Rainbow", palette: true, bind: "ctrl+shift+r",
    run: () => { const preset = nextPresetId(get().preset); apply({ preset }, `Palette: ${preset}`); } });
  result[0] = { ...result[0], bind: "ctrl+shift+e" };
  return result;
}

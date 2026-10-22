/**
 * Palette resolution. Each theme in `themes.ts` owns one palette under its id;
 * a `#aabbcc,#001122,...` list is a custom palette. The ramp builder
 * interpolates the stops in OKLab and wraps the last back to the first, so
 * scrolling gradients have no seam.
 */

import { buildRamp, parseHex, type Ramp, type RGB } from "./color.js";
import { DEFAULT_THEME, findTheme, OPENCODE_THEME, THEMES } from "./themes.js";

export const DEFAULT_PRESET = DEFAULT_THEME;

const isCustom = (value: string) => value.includes("#") || value.includes(",");

/** True for a theme palette name (or alias); custom colour lists are checked separately. */
export function hasPreset(id: string): boolean {
	return findTheme(id) !== undefined;
}

export function presetIds(): string[] {
	return THEMES.map((theme) => theme.id);
}

/** Colours taken from the running OpenCode theme for the `opencode` palette. */
let live: { colors: RGB[]; key: string } | undefined;

/** Replaces the `opencode` palette. Returns true when the colours changed. */
export function setLivePalette(colors: RGB[]): boolean {
	const key = colors.map((c) => `${c.r},${c.g},${c.b}`).join(";");
	if (colors.length < 2 || key === live?.key) return false;
	live = { colors, key };
	return true;
}

/** Resolve a palette name (or a custom colour list) to its stop colours. */
export function resolveStops(idOrCustom: string): RGB[] {
	if (isCustom(idOrCustom)) {
		const parts = idOrCustom.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
		const cols = parts.filter((p) => /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(p)).map(parseHex);
		if (cols.length >= 2) return cols;
	}
	const theme = findTheme(idOrCustom) ?? findTheme(DEFAULT_PRESET)!;
	if (theme.id === OPENCODE_THEME && live) return live.colors;
	return theme.colors.map(parseHex);
}

const rampCache = new Map<string, Ramp>();

/** Cached ramp for a palette name or custom colour list. */
export function rampFor(idOrCustom: string): Ramp {
	let key = idOrCustom.trim().toLowerCase();
	if (!isCustom(key)) key = findTheme(key)?.id ?? DEFAULT_PRESET;
	if (key === OPENCODE_THEME && live) key = `${OPENCODE_THEME}:${live.key}`;
	const cached = rampCache.get(key);
	if (cached) return cached;
	const ramp = buildRamp(resolveStops(idOrCustom), true);
	if (rampCache.size > 64) rampCache.clear();
	rampCache.set(key, ramp);
	return ramp;
}

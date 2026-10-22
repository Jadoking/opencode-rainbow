/**
 * Curated themes. A theme is a whole look: a palette plus the gradient shape,
 * motion, strength and effects that suit it. Picking a theme applies all of
 * it; Customize then tweaks any part.
 *
 * Every palette stop must read as text on a dark terminal background. Editor
 * themes use the colours that give that theme its identity, not its full
 * accent set in hue order (which turns every theme into a rainbow).
 */

import type { RainbowSettings } from "./settings.js";

export type ThemeFamily = "spectrum" | "editor" | "nature" | "retro";

export const FAMILIES: { id: ThemeFamily; name: string }[] = [
	{ id: "editor", name: "Editor themes" },
	{ id: "spectrum", name: "Spectrum" },
	{ id: "nature", name: "Nature & mood" },
	{ id: "retro", name: "Retro" },
];

/** The settings a theme decides. Everything else (where colour goes, performance) is yours. */
export const LOOK_KEYS = ["preset", "mode", "motion", "speed", "turns", "angle", "blend", "boxBlend", "vibrance", "brightness", "fx", "chaos"] as const;
export type Look = Pick<RainbowSettings, (typeof LOOK_KEYS)[number]>;

export type Theme = {
	id: string;
	name: string;
	family: ThemeFamily;
	blurb: string;
	/** Palette stops. The `opencode` theme replaces them with the active OpenCode theme's colours. */
	colors: string[];
	/** Old palette names that now map to this theme. */
	aliases?: string[];
	look: Partial<Omit<Look, "preset">>;
};

/** What every theme starts from; a theme lists only what it changes. */
const BASE: Omit<Look, "preset"> = {
	mode: "diagonal", motion: "scroll", speed: 0.1, turns: 1.5, angle: 0,
	blend: 0.85, boxBlend: 0.2, vibrance: 1, brightness: 0, fx: {}, chaos: 1,
};

/** Calm, slow, effect-free: right for editor themes you live in all day. */
const CALM: Theme["look"] = { motion: "drift", speed: 0.06, turns: 1 };

export const OPENCODE_THEME = "opencode";

export const THEMES: Theme[] = [
	/* ---------------- editor themes ---------------- */
	{
		id: OPENCODE_THEME, name: "Match OpenCode", family: "editor",
		blurb: "built from your current OpenCode theme's accent and syntax colours",
		colors: ["#7aa2f7", "#bb9af7", "#7dcfff"], look: CALM,
	},
	{
		id: "nord", name: "Nord", family: "editor", blurb: "frost blues and snow on polar night",
		colors: ["#88c0d0", "#81a1c1", "#5e81ac", "#81a1c1", "#8fbcbb", "#d8dee9", "#b48ead"], aliases: ["github-dark"],
		look: CALM,
	},
	{
		id: "catppuccin", name: "Catppuccin", family: "editor", blurb: "Mocha: mauve, lavender and sapphire pastels",
		colors: ["#cba6f7", "#f5c2e7", "#b4befe", "#89b4fa", "#74c7ec", "#94e2d5"], aliases: ["catppuccin-latte"], look: CALM,
	},
	{
		id: "tokyo-night", name: "Tokyo Night", family: "editor", blurb: "electric blue and violet over deep navy",
		colors: ["#7aa2f7", "#bb9af7", "#9d7cd8", "#7dcfff", "#2ac3de"], aliases: ["tokyo", "one-dark", "night-owl", "commodore"], look: CALM,
	},
	{
		id: "dracula", name: "Dracula", family: "editor", blurb: "purple and pink with a cyan edge",
		colors: ["#bd93f9", "#ff79c6", "#ff92df", "#bd93f9", "#8be9fd"], aliases: ["monokai", "ultraviolet", "blacklight"],
		look: CALM,
	},
	{
		id: "gruvbox", name: "Gruvbox", family: "editor", blurb: "warm retro yellow, orange and aqua",
		colors: ["#fabd2f", "#fe8019", "#d3869b", "#8ec07c", "#b8bb26"], aliases: ["gruvbox-light", "ayu"], look: CALM,
	},
	{
		id: "rose-pine", name: "Rosé Pine", family: "editor", blurb: "rose, iris and foam on a muted base",
		colors: ["#ebbcba", "#eb6f92", "#c4a7e7", "#9ccfd8", "#c4a7e7"], look: CALM,
	},
	{
		id: "kanagawa", name: "Kanagawa", family: "editor", blurb: "ink blue and Fuji white, with violet and sakura",
		colors: ["#7e9cd8", "#7fb4ca", "#dcd7ba", "#957fb8", "#d27e99"], look: CALM,
	},
	{
		id: "everforest", name: "Everforest", family: "editor", blurb: "soft greens and aqua with a warm accent",
		colors: ["#a7c080", "#83c092", "#7fbbb3", "#a7c080", "#dbbc7f"], aliases: ["zenburn"],
		look: CALM,
	},

	/* ---------------- spectrum ---------------- */
	{
		id: "classic", name: "Classic Rainbow", family: "spectrum", blurb: "the full spectrum, red to violet",
		colors: ["#ff0000", "#ff8800", "#ffee00", "#33dd33", "#0099ff", "#4433ff", "#aa33ff"], aliases: ["rainbow", "spectrum", "neon", "prism", "double-rainbow", "teletext", "traffic", "plasma-tv"],
		look: { turns: 2, speed: 0.12, fx: { shine: 0.3 } },
	},
	{
		id: "pastel", name: "Pastel", family: "spectrum", blurb: "the spectrum, softened",
		colors: ["#ffb3ba", "#ffdfba", "#ffffba", "#baffc9", "#bae1ff", "#d7baff", "#ffbaf2"],
		look: { motion: "breathe", speed: 0.08, turns: 1.2 },
	},
	{
		id: "holographic", name: "Holographic", family: "spectrum", blurb: "trading-card foil that shifts as it moves",
		colors: ["#ffffff", "#ffd1f0", "#c4f0ff", "#d8ffd1", "#fff6c4", "#ffd1f0"], aliases: ["chrome", "unicorn", "oil-slick"],
		look: { mode: "plasma", motion: "drift", speed: 0.1, turns: 1, vibrance: 1.3, fx: { shine: 0.45 } },
	},

	/* ---------------- nature & mood ---------------- */
	{
		id: "sunset", name: "Sunset", family: "nature", blurb: "violet through coral to gold, with fireflies",
		colors: ["#a855f7", "#e94057", "#f27121", "#ffd166", "#f27121", "#e94057"], aliases: ["sunrise", "fire-and-ice", "desert"],
		look: { mode: "vertical", motion: "breathe", speed: 0.08, turns: 1, fx: { fireflies: 0.3, vignette: 0.3 } },
	},
	{
		id: "ocean", name: "Ocean", family: "nature", blurb: "turquoise shallows with rising bubbles",
		colors: ["#caf0f8", "#90e0ef", "#48cae4", "#00b4d8", "#0096c7", "#48cae4"], aliases: ["deep-sea", "tron", "solarized"],
		look: { mode: "horizontal", motion: "wave", speed: 0.1, fx: { bubbles: 0.45 } },
	},
	{
		id: "aurora", name: "Aurora", family: "nature", blurb: "green and violet curtains under the stars",
		colors: ["#06d6a0", "#8ce99a", "#5fd3e8", "#b197fc", "#8ce99a"], aliases: ["nebula", "galaxy"],
		look: { mode: "noise", motion: "drift", speed: 0.08, fx: { aurora: 0.5, starfield: 0.3 } },
	},
	{
		id: "forest", name: "Forest", family: "nature", blurb: "canopy greens and drifting fireflies",
		colors: ["#52b788", "#95d5b2", "#b7e4c7", "#74c69d", "#40916c", "#95d5b2"], aliases: ["mint", "gameboy"],
		look: { mode: "marble", motion: "drift", speed: 0.06, fx: { fireflies: 0.4 } },
	},
	{
		id: "sakura", name: "Sakura", family: "nature", blurb: "blossom pinks with falling petals",
		colors: ["#f4c2c2", "#ffe4e9", "#ffb7c5", "#e8a1b8", "#ffd1dc"], aliases: ["cotton", "candy", "peach"],
		look: { motion: "drift", speed: 0.08, fx: { sakura: 0.55 } },
	},
	{
		id: "winter", name: "Winter", family: "nature", blurb: "glacier blue and frost with drifting snow",
		colors: ["#e0fbfc", "#98c1d9", "#a9d6e5", "#61a5c2", "#caf0f8"], aliases: ["ice", "storm", "mono", "static"],
		look: { mode: "vertical", speed: 0.06, fx: { snow: 0.55 } },
	},
	{
		id: "ember", name: "Ember", family: "nature", blurb: "lava reds and white-hot gold, flames below",
		colors: ["#e5383b", "#ff6d00", "#ffb703", "#ffd60a", "#ff6d00"], aliases: ["lava", "fire", "autumn", "blood", "thermal", "infrared"],
		look: { mode: "vertical", speed: 0.12, fx: { fire: 0.45, heat: 0.35 } },
	},

	/* ---------------- retro ---------------- */
	{
		id: "synthwave", name: "Synthwave", family: "retro", blurb: "hot pink and cyan over a neon grid",
		colors: ["#ff7edb", "#fe4450", "#f97e72", "#ffcc00", "#72f1b8", "#36f9f6", "#b893ce"], aliases: ["outrun", "vaporwave", "miami", "duotone", "glitch"],
		look: { mode: "horizontal", speed: 0.12, fx: { gridfloor: 0.6, neon: 0.35 } },
	},
	{
		id: "matrix", name: "Matrix", family: "retro", blurb: "phosphor green and digital rain",
		colors: ["#008f11", "#00ff41", "#9dff9d", "#00ff41"], aliases: ["phosphor", "toxic", "acid"],
		look: { mode: "vertical", speed: 0.15, fx: { matrix: 0.65 } },
	},
	{
		id: "amber", name: "Amber CRT", family: "retro", blurb: "a warm monochrome monitor with scanlines",
		colors: ["#ff8c00", "#ffb000", "#ffd28a", "#ffb000"], aliases: ["crt", "gold", "sepia", "hazard"],
		look: { mode: "horizontal", motion: "breathe", speed: 0.06, turns: 1, fx: { scanlines: 0.4, noisegrain: 0.2, bloom: 0.25 } },
	},
];

export const DEFAULT_THEME = "classic";

const byName = new Map<string, Theme>();
for (const theme of THEMES) {
	byName.set(theme.id, theme);
	byName.set(theme.name.toLowerCase(), theme);
	for (const alias of theme.aliases ?? []) byName.set(alias, theme);
}

/** A theme by id, display name or alias. */
export function findTheme(name: string | undefined): Theme | undefined {
	return name ? byName.get(name.trim().toLowerCase()) : undefined;
}

/** Everything a theme sets, filled in from the base look. */
export function themeLook(theme: Theme): Look {
	return { ...BASE, ...theme.look, fx: { ...(theme.look.fx ?? BASE.fx) }, preset: theme.id };
}

/** True when the current look differs from the selected theme's. */
export function isCustomized(settings: RainbowSettings): boolean {
	const theme = findTheme(settings.theme);
	if (!theme) return true;
	const look = themeLook(theme);
	return LOOK_KEYS.some((key) => key === "fx"
		? JSON.stringify(Object.entries(settings.fx).sort()) !== JSON.stringify(Object.entries(look.fx).sort())
		: settings[key] !== look[key]);
}

/** The next or previous theme in menu order, wrapping. */
export function stepTheme(current: string, direction: number): Theme {
	const ordered = FAMILIES.flatMap((family) => THEMES.filter((theme) => theme.family === family.id));
	const index = Math.max(0, ordered.findIndex((theme) => theme.id === findTheme(current)?.id));
	return ordered[(index + direction + ordered.length) % ordered.length]!;
}

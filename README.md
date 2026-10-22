# OpenCode Rainbow

Animated colour themes for OpenCode V2, ported from the Pi Rainbow extension. 22 curated themes, each a whole look (palette, pattern, motion and effects), with a live-preview settings menu for customising any part.

## Install

Requires OpenCode 2.0.27 or a compatible V2 release.

```sh
cd /path/to/opencode-rainbow
npm install
```

Add the absolute package directory to `~/.config/opencode/cli.json`, preserving other settings:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [{ "package": "/path/to/opencode-rainbow" }]
}
```

OpenCode watches local plugins and configuration. Restart the TUI if it was open during installation and the commands have not appeared. The root `tui.ts` is required for directory installs; the package also exports `./tui` for packaged installs.

On first load, Rainbow imports `~/.pi/agent/state/pi-plugin-rainbow.json`, respecting `PI_CODING_AGENT_DIR`. After that, OpenCode owns the saved settings and synchronizes them across its terminal instances. Pi's file is never modified. Set plugin option `importPiSettings: false` to start a fresh installation with the original defaults.

## Themes

Themes come in four families. Picking one applies its whole look; Customize then changes any part, and the menu marks the theme as customized.

| Family | Themes |
| --- | --- |
| Editor themes | Match OpenCode, Nord, Catppuccin, Tokyo Night, Dracula, Gruvbox, Rosé Pine, Kanagawa, Everforest |
| Spectrum | Classic Rainbow, Pastel, Holographic |
| Nature & mood | Sunset, Ocean, Aurora, Forest, Sakura, Winter, Ember |
| Retro | Synthwave, Matrix, Amber CRT |

Editor themes use the colours that give each theme its identity, with calm motion and no effects. **Match OpenCode** builds its palette from the active OpenCode theme's syntax and accent colours and follows theme changes. Every palette stop is light enough to read as text on a dark background.

Palette names from earlier versions map to the closest theme, so saved settings keep working.

## Commands

All commands also appear under Rainbow in the command palette.

| Command | Action |
| --- | --- |
| `/rainbow [on\|off]` | Toggle or explicitly enable/disable |
| `/rainbow-settings` | Themes, Customize, Effects and Advanced, with a live preview |
| `/rainbow-theme [name\|next\|prev\|random]` | Browse themes, or apply one directly |
| `/rainbow-fx [id [0..1]\|none]` | Browse effects, toggle one, set its intensity, or turn all off |
| `/rainbow-reset` | Restore the defaults (Classic Rainbow) |
| `/rainbow-splash` | Show the animated banner for 2.8 seconds |
| `/rainbow-status` | Renderer, frame-rate, cost, quality and focus diagnostics |
| `/rainbow-set <setting> <value>` | Set any scalar setting by its stored name |

`Ctrl+Shift+R` moves to the next theme; `Ctrl+Shift+E` toggles Rainbow. Their OpenCode command IDs are `rainbow.next` and `rainbow`; keybindings can be changed in `cli.json`.

Custom palettes work with `/rainbow-set preset #ff8800,#8822ff,#44ccff`.

## Settings menu

The menu has four pages: **Themes**, **Customize**, **Effects** and **Advanced**. The preview at the top draws a small OpenCode screen (prose, a tool block, a table and the sidebar) in your OpenCode theme's colours, through the same renderer as the session. On the Themes page it shows the highlighted theme before you apply it.

- **Themes**: Up/Down browse, Enter or Space applies, each theme shows its palette as a swatch and its pattern, motion and effects below the list.
- **Customize**, **Effects**, **Advanced**: Up/Down select, Left/Right adjust, Space toggles. Numbers show as sliders.
- Tab and Shift+Tab, or 1 to 4, switch pages. `r` restores the values from when the menu opened. Escape closes. Changes save immediately. Mouse wheel and clicks also work.

The session's own animation pauses while the menu is open.

## Rendering and motion

- `panels` tints filled panels and borders, and colours adjacent prose without filling the surrounding space.
- `screen` applies the full-screen treatment. `text` changes foregrounds only. `chrome` changes border glyphs only.
- Input and footer text have separate switches. Their characters and backgrounds stay intact. Native Unicode graphemes, hyperlinks, inverse selections, image regions and embedded terminals retain their native representation.
- Autocomplete menus keep their native text, backgrounds and selection highlights. Opening slash suggestions keeps the surrounding palette steady.
- Palette crossfades, auto-cycling, reactive effects, contrast correction, dim-text restraint, box strength, full bleed and adaptive frame budgets use the original engine.
- An unfocused terminal pane keeps its colours but stops animating; focus resumes it. Terminals that don't report focus keep animating.
- Idle pause stops the animation timer after the configured interval. Typing, pasting, mouse activity or work events wake it. Active session work stays animated. Reduced motion caps animation at 12 fps and reduces speed and intensity.
- `animateInTmux` controls multiplexer animation. `OPENCODE_RAINBOW_DISABLE_ANIMATION=1` forces static rendering; `OPENCODE_RAINBOW_FORCE_ANIMATION=1` overrides tmux suppression. Disable wins. The equivalent `PI_RAINBOW_*` variables remain accepted.

OpenCode renders only its visible framebuffer, so animation doesn't rebuild terminal scrollback. `regularMode` is retained for main-screen OpenTUI hosts; `viewport` and `full` both operate on the frame those hosts supply. OpenCode Mini, web and desktop clients do not load terminal UI plugins.

## Development

```sh
npm run typecheck
npm test
npm exec --yes --package=bun -- bun test tests/native-buffer.bun.test.ts
npm pack --dry-run
```

The Node suite checks the inherited engine plus command behaviour, every settings control, idle scheduling and native buffer protections. The Bun test exercises an actual OpenTUI native buffer with CJK, emoji, combining characters and indexed colours.

Live validation on OpenCode 2.0.27 covered command discovery, slash execution, settings changes and restoration, palette selection, the splash, the optional footer, session/home views, and resizing to a 50×18 terminal. See `NOTICE` for source attribution.

# OpenCode Rainbow

Port of the installed Pi Rainbow extension to OpenCode V2. Includes its 81 palettes, 16 gradient fields, 8 motion modes, 34 effects, 13 look bundles, and all current settings.

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

## Commands

All commands also appear under Rainbow in the command palette.

| Command | Action |
| --- | --- |
| `/rainbow [on\|off]` | Toggle or explicitly enable/disable |
| `/rainbow-settings` | Live settings, effects and animated preview |
| `/rainbow-preset [list\|next\|prev\|random\|name]` | Search palettes or switch directly |
| `/rainbow-bundle [list\|name]` | Search and apply whole-look bundles |
| `/rainbow-fx <id> [0..1]` | Toggle or set an effect's intensity |
| `/rainbow-fx list` | Search effects, including current intensities |
| `/rainbow-fx none` | Disable all effects |
| `/rainbow-mode [list\|field\|motion]` | Choose a gradient or motion mode |
| `/rainbow-scope [screen\|panels\|chrome\|text]` | Set where effects apply |
| `/rainbow-speed [number]` | Read or change palette cycles per second |
| `/rainbow-reset` | Restore the original defaults |
| `/rainbow-splash` | Show the animated banner for 2.8 seconds |
| `/rainbow-status` | Renderer, frame-rate, cost and quality diagnostics |
| `/rainbow-set <setting> <value>` | Set any scalar setting by its stored name |

`Ctrl+Shift+R` advances the palette; `Ctrl+Shift+E` toggles Rainbow. These follow the installed Pi implementation. Their OpenCode command IDs are `rainbow.next` and `rainbow`; keybindings can be changed in `cli.json`.

Custom palettes work with `/rainbow-preset #ff8800,#8822ff,#44ccff`.

In settings, use **Up/Down** to select, **Left/Right** to adjust, **Space** to toggle, **Page Up/Down** to jump, and **Escape** or **Enter** to close. Mouse wheel and row clicks also work. `r` restores the values from when the dialog opened. Changes save immediately. The preview uses the same engine as the session; the outer effect pauses while the settings or splash preview is open.

## Rendering and motion

- `panels` tints filled panels and borders, and colours adjacent prose without filling the surrounding space.
- `screen` applies the full-screen treatment. `text` changes foregrounds only. `chrome` changes border glyphs only.
- Input and footer text have separate switches. Their characters and backgrounds stay intact. Native Unicode graphemes, hyperlinks, inverse selections, image regions and embedded terminals retain their native representation.
- Autocomplete menus keep their native text, backgrounds and selection highlights. Opening slash suggestions keeps the surrounding palette steady.
- Palette crossfades, auto-cycling, reactive effects, contrast correction, dim-text restraint, box strength, full bleed and adaptive frame budgets use the original engine.
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

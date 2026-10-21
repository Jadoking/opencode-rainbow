import type { OptimizedBuffer, Renderable } from "@opentui/core";
import type { RGB } from "./color.js";
import type { ProcessOptions, RainbowEngine } from "./engine.js";
import { padCell, type Frame, type FrameCell, type FrameRow } from "./frame.js";
import { isChromeGlyph } from "./layout.js";
import type { RainbowSettings } from "./settings.js";

export type Region = { x: number; y: number; width: number; height: number; kind: "input" | "footer" | "sidebar" | "protected" };
export type Planes = OptimizedBuffer["buffers"];
const continuation = (cp: number) => (cp >>> 30) === 3;
/** OpenTUI's drawImage flags each covered cell in the top bits; the terminal draws the picture there. */
const imageCell = (cp: number) => (cp >>> 30) === 1;
const rgb = (plane: Uint16Array, at: number): RGB => ({ r: plane[at] & 255, g: plane[at + 1] & 255, b: plane[at + 2] & 255 });
const equal = (a: RGB | null, b: RGB | null) => a === b || !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b;
const code = (c: RGB) => `48;2;${c.r};${c.g};${c.b}`;

export function processNativeFrame(buffer: Pick<OptimizedBuffer, "buffers" | "width" | "height">,
  engine: RainbowEngine, settings: RainbowSettings,
  options: { inputMode: string; regions: Region[]; cursor?: ProcessOptions["cursor"]; advance?: boolean }) {
  // Autocomplete has no dimmed backdrop. Treating it like a modal makes the
  // entire palette jump each time '/' opens the suggestions.
  const overlayVisible = options.inputMode !== "base" && options.inputMode !== "autocomplete";
  const frame = readFrame(buffer.buffers, buffer.width, buffer.height,
    overlayVisible ? frameBackground(buffer.buffers) : engine.bg, settings, options.regions);
  engine.processFrame(frame, { width: buffer.width, height: buffer.height, fullscreen: true,
    cursor: options.cursor, overlayVisible, advance: options.advance });
  writeFrame(buffer.buffers, frame, settings);
}

/** Dialog backdrops change the base fill without changing the theme token. */
export function frameBackground(planes: Planes): RGB {
  const counts = new Map<number, number>();
  let best = 0, count = 0;
  for (let at = 0; at < planes.bg.length; at += 4) {
    const key = (planes.bg[at] & 255) << 16 | (planes.bg[at + 1] & 255) << 8 | planes.bg[at + 2] & 255;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > count) { best = key; count = n; }
  }
  return { r: best >>> 16, g: best >>> 8 & 255, b: best & 255 };
}

/** Keep native grapheme IDs and hyperlink attributes in OpenTUI's ownership. */
export function readFrame(planes: Planes, width: number, height: number, background: RGB,
  settings: RainbowSettings, regions: Region[] = []): Frame {
  const rows: FrameRow[] = [];
  for (let y = 0; y < height; y++) {
    const cells: FrameCell[] = [];
    const byCol: (FrameCell | undefined)[] = new Array(width);
    const bands = regions.filter((r) => y >= r.y && y < r.y + r.height);
    let used = width;
    if (!settings.fullBleed) {
      while (used > 0 && [0, 32].includes(planes.char[y * width + used - 1]) &&
        equal(rgb(planes.bg, (y * width + used - 1) * 4), background)) used--;
    }
    for (let x = 0; x < used; x++) {
      const i = y * width + x;
      const cp = planes.char[i];
      if (continuation(cp) || imageCell(cp)) continue;
      const region = bands.findLast((r) => x >= r.x && x < r.x + r.width)?.kind;
      const attrs = planes.attributes[i];
      if (region === "protected" || (attrs & (32 | 64)) ||
        region === "input" && (!settings.colorText || !settings.colorInput || settings.scope === "chrome") ||
        (region === "footer" || region === "sidebar") && (!settings.colorText || !settings.colorFooter || settings.scope === "chrome")) continue;
      const cell = padCell(x);
      // Opaque pooled graphemes are treated as ink; their IDs are never rewritten.
      cell.text = cell.outText = cp === 0 ? " " : cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffc";
      cell.blank = !cell.text.trim();
      while (x + cell.width < width && continuation(planes.char[i + cell.width])) cell.width++;
      cell.fg = cell.outFg = rgb(planes.fg, i * 4);
      cell.bg = cell.outBg = rgb(planes.bg, i * 4);
      cell.bgCode = cell.style.bgCode = equal(cell.bg, background) ? null : code(cell.bg);
      cell.style.bold = cell.outBold = !!(attrs & 1);
      cell.style.dim = cell.outDim = !!(attrs & 2);
      cell.style.italic = cell.outItalic = !!(attrs & 4);
      cell.style.underline = cell.outUnderline = !!(attrs & 8);
      cell.style.blink = !!(attrs & 16);
      cell.style.strike = !!(attrs & 128);
      cell.region = region;
      cells.push(cell);
      for (let k = 0; k < cell.width; k++) byCol[x + k] = cell;
    }
    rows.push({ index: y, raw: "", line: { prefix: "", prefixNonSgr: "", cells: [], suffix: "", suffixNonSgr: "", visibleWidth: width },
      cells, byCol, used, skip: false, quiet: false, dirty: false });
  }
  return { native: true, width, height, rows, cursor: null };
}

function putColor(plane: Uint16Array, at: number, color: RGB) {
  // Low bytes are RGBA8. High bytes encode default/indexed colour intent.
  plane[at] = Math.max(0, Math.min(255, Math.round(color.r)));
  plane[at + 1] = Math.max(0, Math.min(255, Math.round(color.g)));
  plane[at + 2] = Math.max(0, Math.min(255, Math.round(color.b)));
  plane[at + 3] &= 255;
}

export function writeFrame(planes: Planes, frame: Frame, settings: RainbowSettings) {
  for (const row of frame.rows) {
    if (row.skip || !row.dirty) continue;
    for (const cell of row.cells) {
      if (settings.scope === "chrome" && !isChromeGlyph(cell.text)) continue;
      const textOnly = !!cell.region || settings.scope === "text" || settings.scope === "chrome";
      const i = row.index * frame.width + cell.col;
      // Effects only generate single-codepoint, single-column glyphs. Don't touch
      // pooled graphemes, continuations, or the upper hyperlink attribute bits.
      if (!textOnly && cell.width === 1 && planes.char[i] <= 0x10ffff && cell.outText !== cell.text && [...cell.outText].length === 1) {
        planes.char[i] = cell.outText.codePointAt(0)!;
      }
      for (let k = 0; k < cell.width; k++) {
        const at = (i + k) * 4;
        if (cell.outFg && !equal(cell.outFg, cell.fg)) putColor(planes.fg, at, cell.outFg);
        // The sidebar keeps its glyphs and styles but takes the panel tint.
        if ((!textOnly || cell.region === "sidebar") && cell.outBg && !equal(cell.outBg, cell.bg)) putColor(planes.bg, at, cell.outBg);
        if (!textOnly) planes.attributes[i + k] = (planes.attributes[i + k] & ~15) |
          Number(cell.outBold) | Number(cell.outDim) << 1 | Number(cell.outItalic) << 2 | Number(cell.outUnderline) << 3;
      }
    }
  }
}

export function collectRegions(root: Renderable, footers: Iterable<Renderable>, sidebars: Iterable<Renderable> = []): Region[] {
  const regions: Region[] = [];
  const rect = (node: Renderable, kind: Region["kind"]) => {
    if (node.visible && node.width > 0 && node.height > 0) regions.push({
      x: node.screenX, y: node.screenY, width: node.width, height: node.height, kind,
    });
  };
  // The session sidebar has no stable ID. Climb from a marker in its footer
  // slot through the same-width wrappers (the column adds 2+2 padding) to the
  // column itself; its parent is the full-width row holding the transcript.
  // Recorded first so popups and other protected regions found later win.
  for (const marker of sidebars) {
    let node = marker.parent;
    while (node?.parent && node.parent !== root && node.parent.width - node.width <= 4) node = node.parent;
    if (node && node !== root) rect(node, "sidebar");
  }
  const visit = (node: Renderable) => {
    if (!node.visible) return;
    // OpenCode's autocomplete popup has generated IDs: recognise its raised
    // scrollbox container instead. Protect the border and selection as well as
    // the text, and stop here so clipped rows cannot affect the prompt below.
    if (node.zIndex > 0 && node.getChildren().some((child) => /^scrollbox-/.test(child.id))) {
      rect(node, "protected");
      return;
    }
    // Production builds minify class names, so use stable IDs and capabilities.
    if ("editBuffer" in node && "editorView" in node) {
      if (/^textarea-/.test(node.id) && node.parent) {
        rect(node.parent, "input");
        for (const sibling of node.parent.getChildren()) {
          if (sibling !== node && sibling.screenY >= node.screenY + node.height) rect(sibling, "footer");
        }
        // Keep the prompt's bottom border below the Build/model row in its native colours.
        const body = node.parent.parent;
        const border = body?.parent?.getChildren().find((sibling) => sibling !== body &&
          sibling.height === 1 && sibling.screenY === body.screenY + body.height &&
          sibling.screenX === body.screenX && sibling.width === body.width);
        if (border) rect(border, "protected");
      }
      rect(node, "input");
    }
    if (node.id === "prompt.footer.location" && node.parent?.parent) rect(node.parent.parent, "footer");
    // Images are protected cell by cell in readFrame: an image element's box
    // can be left over other content once it scrolls out of view.
    if (/^terminal-/.test(node.id)) { rect(node, "protected"); return; }
    for (const child of node.getChildren()) visit(child);
  };
  visit(root);
  for (const marker of footers) {
    let node = marker.parent;
    while (node && !(node.height > 0 && node.width > 0)) node = node.parent;
    if (node) rect(node, "footer");
  }
  return regions;
}

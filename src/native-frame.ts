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
// A screen holds a few dozen distinct glyphs and backgrounds; build each string once.
const codes = new Map<number, string>();
const code = (c: RGB) => {
  const key = c.r << 16 | c.g << 8 | c.b;
  let s = codes.get(key);
  if (s === undefined) {
    if (codes.size > 4096) codes.clear();
    codes.set(key, s = `48;2;${c.r};${c.g};${c.b}`);
  }
  return s;
};
const glyphs = new Map<number, { text: string; blank: boolean }>();
const glyph = (cp: number) => {
  let g = glyphs.get(cp);
  if (g === undefined) {
    const text = cp === 0 ? " " : cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffc";
    if (glyphs.size > 4096) glyphs.clear();
    glyphs.set(cp, g = { text, blank: !text.trim() });
  }
  return g;
};

type PlaneCopy = { char: Uint32Array; fg: Uint16Array; bg: Uint16Array; attributes: Uint32Array };

/** Same colour intent and alpha, and every RGB channel within `hold` levels. */
function near(plane: Uint16Array, old: Uint16Array, at: number, hold: number): boolean {
  const r = plane[at]!, g = plane[at + 1]!, b = plane[at + 2]!, or = old[at]!, og = old[at + 1]!, ob = old[at + 2]!;
  return plane[at + 3] === old[at + 3] && r >> 8 === or >> 8 && g >> 8 === og >> 8 && b >> 8 === ob >> 8 &&
    Math.abs((r & 255) - (or & 255)) <= hold && Math.abs((g & 255) - (og & 255)) <= hold && Math.abs((b & 255) - (ob & 255)) <= hold;
}
const copyPlanes = (p: Planes): PlaneCopy =>
  ({ char: p.char.slice(), fg: p.fg.slice(), bg: p.bg.slice(), attributes: p.attributes.slice() });

/**
 * The last processed input and output, row by row. A redraw between ticks
 * draws the same scene, so a row whose input is unchanged gets its previous
 * output back and only rows the host actually changed are reprocessed.
 */
export class FrameCache {
  private key = "";
  private input?: PlaneCopy;
  private output?: PlaneCopy;

  /**
   * @param hold Colour levels a cell may drift before it is redrawn. Most
   * ticks move the gradient by a level or two, which no one can see but
   * which costs a full-screen repaint through the terminal.
   */
  constructor(readonly hold = 2) {}

  invalidate() { this.key = ""; }

  /**
   * Keeps the previous output colour of every cell in `rows` whose input is
   * unchanged and whose new colour is within `hold` levels of it.
   */
  holdColours(planes: Planes, input: PlaneCopy, width: number, rows: boolean[] | undefined) {
    const prevIn = this.input, prevOut = this.output, hold = this.hold;
    if (hold <= 0 || !prevIn || !prevOut || prevIn.char.length !== input.char.length) return;
    const { char: inChar, attributes: inAttr, fg: inFg, bg: inBg } = input;
    const { char: pChar, attributes: pAttr, fg: pFg, bg: pBg } = prevIn;
    const { char: oChar, fg: oFg, bg: oBg } = prevOut;
    const { char, fg, bg } = planes;
    const height = inChar.length / width;
    for (let y = 0; y < height; y++) {
      if (rows && !rows[y]) continue;
      for (let i = y * width, end = i + width; i < end; i++) {
        if (inChar[i] !== pChar[i] || inAttr[i] !== pAttr[i] || char[i] !== oChar[i]) continue;
        const at = i * 4;
        if (inFg[at] !== pFg[at] || inFg[at + 1] !== pFg[at + 1] || inFg[at + 2] !== pFg[at + 2] || inFg[at + 3] !== pFg[at + 3] ||
          inBg[at] !== pBg[at] || inBg[at + 1] !== pBg[at + 1] || inBg[at + 2] !== pBg[at + 2] || inBg[at + 3] !== pBg[at + 3]) continue;
        if (near(fg, oFg, at, hold)) { fg[at] = oFg[at]!; fg[at + 1] = oFg[at + 1]!; fg[at + 2] = oFg[at + 2]!; fg[at + 3] = oFg[at + 3]!; }
        if (near(bg, oBg, at, hold)) { bg[at] = oBg[at]!; bg[at + 1] = oBg[at + 1]!; bg[at + 2] = oBg[at + 2]!; bg[at + 3] = oBg[at + 3]!; }
      }
    }
  }

  /** Rows whose input differs from the cached input, or undefined when the cache can't be used. */
  changedRows(planes: Planes, width: number, key: string): boolean[] | undefined {
    const input = this.input;
    if (key !== this.key || !input || !this.output || input.char.length !== planes.char.length) return undefined;
    const rows = new Array<boolean>(planes.char.length / width);
    for (let y = 0; y < rows.length; y++) {
      const a = y * width, b = a + width;
      let changed = false;
      for (let i = a; i < b && !changed; i++) changed = planes.char[i] !== input.char[i] || planes.attributes[i] !== input.attributes[i];
      for (let i = a * 4; i < b * 4 && !changed; i++) changed = planes.fg[i] !== input.fg[i] || planes.bg[i] !== input.bg[i];
      rows[y] = changed;
    }
    return rows;
  }

  /** Puts the cached output back on one row. */
  restoreRow(planes: Planes, width: number, y: number) {
    const output = this.output!, a = y * width, b = a + width;
    planes.char.set(output.char.subarray(a, b), a);
    planes.attributes.set(output.attributes.subarray(a, b), a);
    planes.fg.set(output.fg.subarray(a * 4, b * 4), a * 4);
    planes.bg.set(output.bg.subarray(a * 4, b * 4), a * 4);
  }

  store(input: PlaneCopy, planes: Planes, key: string) {
    this.key = key;
    this.input = input;
    this.output = copyPlanes(planes);
  }
}

/** Processes the frame in place and returns how many rows went through the pipeline. */
export function processNativeFrame(buffer: Pick<OptimizedBuffer, "buffers" | "width" | "height">,
  engine: RainbowEngine, settings: RainbowSettings,
  options: { inputMode: string; regions: Region[]; cursor?: ProcessOptions["cursor"]; advance?: boolean; cache?: FrameCache }): number {
  const { buffers: planes, width, height } = buffer;
  const cache = options.cache;
  // Everything besides the planes that changes the output. Settings changes always tick.
  const key = cache ? JSON.stringify([options.inputMode, options.regions, options.cursor, engine.bg, engine.fg, width]) : "";
  const changed = cache && options.advance === false ? cache.changedRows(planes, width, key) : undefined;
  // Effects such as bloom reach across rows: rewrite every row a change can
  // affect, and read the rows those depend on so they come out complete.
  const reach = changed ? engine.rowReach() : 0;
  const near = (rows: boolean[], r: number) => rows.map((_, y) => rows.slice(Math.max(0, y - r), y + r + 1).some(Boolean));
  const written = changed && near(changed, reach);
  const read = changed && near(changed, 2 * reach);
  const input = cache ? copyPlanes(planes) : undefined;
  if (read) for (let y = 0; y < height; y++) if (!read[y]) cache!.restoreRow(planes, width, y);
  const count = read ? read.filter(Boolean).length : height;
  if (count > 0) {
    // Autocomplete has no dimmed backdrop. Treating it like a modal makes the
    // entire palette jump each time '/' opens the suggestions.
    const overlayVisible = options.inputMode !== "base" && options.inputMode !== "autocomplete";
    const frame = readFrame(planes, width, height,
      overlayVisible ? frameBackground(input ?? planes) : engine.bg, settings, options.regions, read);
    engine.processFrame(frame, { width, height, fullscreen: true,
      cursor: options.cursor, overlayVisible, advance: options.advance });
    writeFrame(planes, frame, settings);
    if (read && written) for (let y = 0; y < height; y++) if (read[y] && !written[y]) cache!.restoreRow(planes, width, y);
    if (cache && input) cache.holdColours(planes, input, width, written);
  }
  if (cache && input) cache.store(input, planes, key);
  return count;
}

/** Dialog backdrops change the base fill without changing the theme token. */
export function frameBackground(planes: Pick<Planes, "bg">): RGB {
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
  settings: RainbowSettings, regions: Region[] = [], only?: boolean[]): Frame {
  const rows: FrameRow[] = [];
  for (let y = 0; y < height; y++) {
    if (only && !only[y]) {
      rows.push({ index: y, raw: "", line: { prefix: "", prefixNonSgr: "", cells: [], suffix: "", suffixNonSgr: "", visibleWidth: width },
        cells: [], byCol: [], used: 0, skip: true, quiet: true, dirty: false });
      continue;
    }
    const cells: FrameCell[] = [];
    const byCol: (FrameCell | undefined)[] = new Array(width);
    // Region kind per column; later regions win, as they are found later in the tree.
    let kinds: (Region["kind"] | undefined)[] | undefined;
    for (const r of regions) {
      if (y < r.y || y >= r.y + r.height) continue;
      kinds ??= new Array(width);
      for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.width); x++) kinds[x] = r.kind;
    }
    let used = width;
    if (!settings.fullBleed) {
      while (used > 0 && [0, 32].includes(planes.char[y * width + used - 1]) &&
        equal(rgb(planes.bg, (y * width + used - 1) * 4), background)) used--;
    }
    for (let x = 0; x < used; x++) {
      const i = y * width + x;
      const cp = planes.char[i];
      if (continuation(cp) || imageCell(cp)) continue;
      const region = kinds?.[x];
      const attrs = planes.attributes[i];
      if (region === "protected" || (attrs & (32 | 64)) ||
        region === "input" && (!settings.colorText || !settings.colorInput || settings.scope === "chrome") ||
        (region === "footer" || region === "sidebar") && (!settings.colorText || !settings.colorFooter || settings.scope === "chrome")) continue;
      const cell = padCell(x);
      // Opaque pooled graphemes are treated as ink; their IDs are never rewritten.
      const g = glyph(cp);
      cell.text = cell.outText = g.text;
      cell.blank = g.blank;
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

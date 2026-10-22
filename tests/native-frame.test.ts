import assert from "node:assert/strict";
import test from "node:test";
import { RainbowEngine } from "../src/engine.js";
import { allFx } from "../src/fx.js";
import { collectRegions, FrameCache, frameBackground, processNativeFrame, readFrame, writeFrame, type Planes } from "../src/native-frame.js";
import { DEFAULT_SETTINGS, type RainbowSettings } from "../src/settings.js";
import type { Renderable } from "@opentui/core";

function fixture(width = 30, height = 6): Planes {
  const n = width * height;
  const p = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) };
  for (let i = 0; i < n; i++) { p.fg.set([210, 220, 230, 255], i * 4); p.bg.set([16, 17, 22, 255], i * 4); }
  return p;
}
const settings = (patch: Partial<RainbowSettings> = {}): RainbowSettings => ({ ...DEFAULT_SETTINGS, motion: "none", fx: {}, ...patch });
function render(p: Planes, s: RainbowSettings, regions: Parameters<typeof readFrame>[5] = []) {
  const engine = new RainbowEngine(s);
  const frame = readFrame(p, 30, 6, frameBackground(p), s, regions);
  engine.processFrame(frame, { width: 30, height: 6, fullscreen: true });
  writeFrame(p, frame, s);
}

test("native planes preserve pooled graphemes, wide continuations and hyperlink IDs", () => {
  const p = fixture();
  p.char.set([65, 2415984895, 3288400127, 2415984894, 3288400126]);
  p.attributes[0] = 0x7abc0089;
  const chars = p.char.slice();
  const attrs = p.attributes.slice();
  const fg = p.fg.slice();
  render(p, settings({ scope: "text", fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) }));
  assert.deepEqual(p.char, chars);
  assert.deepEqual(p.attributes, attrs);
  assert.notDeepEqual(p.fg, fg);
  assert.deepEqual(p.fg.slice(4, 8), p.fg.slice(8, 12), "wide glyph columns have one foreground");
});

test("input and footer preserve characters and backgrounds with every effect enabled", () => {
  for (const enabled of [false, true]) {
    const p = fixture();
    for (let x = 0; x < 30; x++) { p.char[60 + x] = 65 + x % 26; p.char[90 + x] = 97 + x % 26; }
    const original = structuredClone(p);
    render(p, settings({ scope: "screen", colorInput: enabled, colorFooter: enabled,
      fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) }), [
      { x: 0, y: 2, width: 30, height: 1, kind: "input" }, { x: 0, y: 3, width: 30, height: 1, kind: "footer" },
    ]);
    assert.deepEqual(p.char.slice(60, 120), original.char.slice(60, 120));
    assert.deepEqual(p.bg.slice(240, 480), original.bg.slice(240, 480));
    if (enabled) assert.notDeepEqual(p.fg.slice(240, 480), original.fg.slice(240, 480));
    else assert.deepEqual(p.fg.slice(240, 480), original.fg.slice(240, 480));
  }
});

test("panels scope doesn't mistake a dimmed dialog backdrop for a filled panel", () => {
  const p = fixture();
  for (let i = 0; i < p.bg.length; i += 4) p.bg.set([4, 5, 6, 255], i);
  for (let y = 1; y < 5; y++) for (let x = 8; x < 22; x++) p.bg.set([28, 30, 38, 255], (y * 30 + x) * 4);
  const original = structuredClone(p);
  render(p, settings({ fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) }));
  assert.deepEqual(p.char.slice(0, 30), original.char.slice(0, 30));
  assert.deepEqual(p.bg.slice(0, 120), original.bg.slice(0, 120));
  assert.notDeepEqual(p.bg.slice(152, 208), original.bg.slice(152, 208));
});

test("selected text and protected images are byte-for-byte unchanged", () => {
  const p = fixture();
  p.char[0] = 88; p.attributes[0] = 32;
  p.char[30] = 89;
  const original = structuredClone(p);
  render(p, settings({ scope: "screen", fx: { matrix: 1, glitch: 1 } }), [{ x: 0, y: 1, width: 30, height: 1, kind: "protected" }]);
  for (const i of [0, 30]) {
    assert.equal(p.char[i], original.char[i]);
    assert.equal(p.attributes[i], original.attributes[i]);
    assert.deepEqual(p.fg.slice(i * 4, i * 4 + 4), original.fg.slice(i * 4, i * 4 + 4));
    assert.deepEqual(p.bg.slice(i * 4, i * 4 + 4), original.bg.slice(i * 4, i * 4 + 4));
  }
});

// OpenTUI's drawImage marks every cell it covers: flag 0b01 in the top bits over a space.
const IMAGE_CELL = 0x40000020;

test("image cells are untouched wherever they are, and nothing else is held back", () => {
  const p = fixture();
  for (let y = 1; y < 4; y++) for (let x = 2; x < 8; x++) {
    p.char[y * 30 + x] = IMAGE_CELL;
    p.fg.set([255, 255, 255, 255], (y * 30 + x) * 4);
  }
  const original = structuredClone(p);
  render(p, settings({ scope: "screen", fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) }));
  for (let y = 1; y < 4; y++) {
    const start = y * 30 + 2, end = y * 30 + 8;
    assert.deepEqual(p.char.slice(start, end), original.char.slice(start, end), `row ${y} image glyphs`);
    assert.deepEqual(p.attributes.slice(start, end), original.attributes.slice(start, end), `row ${y} image styles`);
    assert.deepEqual(p.fg.slice(start * 4, end * 4), original.fg.slice(start * 4, end * 4), `row ${y} image fg`);
    assert.deepEqual(p.bg.slice(start * 4, end * 4), original.bg.slice(start * 4, end * 4), `row ${y} image bg`);
  }
  assert.notDeepEqual(p.bg.slice(4 * 30 * 4, 5 * 30 * 4), original.bg.slice(4 * 30 * 4, 5 * 30 * 4), "the row below the image is tinted");
});

test("an image element's layout box is not a protected region", () => {
  // Its reported box can sit over other content once it scrolls out of view.
  const image = { id: "image-3", screenX: 2, screenY: 0, width: 12, height: 8, zIndex: 0, visible: true,
    parent: null, getChildren: () => [] } as unknown as Renderable;
  assert.deepEqual(collectRegions(image, []), []);
});

test("region detection tolerates host elements without an ID", () => {
  // OpenCode's live tree has renderables whose `id` is undefined.
  const node = (id: string | undefined, children: Renderable[] = []) => ({ id, screenX: 0, screenY: 0, width: 10,
    height: 2, zIndex: 0, visible: true, parent: null, getChildren: () => children } as unknown as Renderable);
  const terminal = node("terminal-1");
  const regions = collectRegions(node("__root__", [node(undefined, [terminal])]), []);
  assert.deepEqual(regions.map((r) => r.kind), ["protected"]);
});

test("region detection works with minified OpenCode classes and model footer siblings", () => {
  const node = (id: string, y: number, h = 1) => ({ id, screenX: 2, screenY: y, width: 20, height: h,
    visible: true, parent: null, constructor: { name: "ph" }, getChildren: () => [] } as unknown as Renderable);
  const input = Object.assign(node("textarea-1", 3), { editBuffer: {}, editorView: {} });
  const footer = node("box-29", 4, 2);
  const panel = node("box-28", 2, 4);
  input.parent = panel; footer.parent = panel;
  panel.getChildren = () => [input, footer];
  const regions = collectRegions(panel, []);
  assert.ok(regions.some((r) => r.kind === "input" && r.y === 3));
  assert.ok(regions.some((r) => r.kind === "footer" && r.y === 4 && r.height === 2));
});

test("host redraws between animation ticks repeat the tick's colours exactly", () => {
  for (const fx of [...allFx().map((f) => ({ [f.id]: 1 })), Object.fromEntries(allFx().map((f) => [f.id, 0.8]))]) {
  for (const inputMode of ["base", "dialog"]) {
  const s = settings({ scope: "screen", motion: "scroll", speed: 1, reactive: true, frameBudgetMs: 0, fx });
  const label = `${Object.keys(fx).length > 1 ? "all" : Object.keys(fx)[0]} (${inputMode})`;
  const engine = new RainbowEngine(s);
  let now = 5;
  Object.defineProperty(engine, "now", { get: () => now });
  const source = fixture();
  for (let x = 0; x < 30; x++) { source.char[30 + x] = 65 + x % 26; source.char[90 + x] = 97 + x % 26; }
  const frame = (advance: boolean) => {
    const p = structuredClone(source);
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode, regions: [], advance });
    return p;
  };
  frame(true);
  now = 5.5;
  const tick = frame(true);
  for (const t of [5.52, 5.55, 5.58]) {
    now = t;
    engine.pulse(1);
    engine.emit({ kind: "ripple", x: 3, y: 2, strength: 1 });
    assert.deepEqual(frame(false), tick, `${label}: redraw at ${t}s`);
  }
  now = 5.6;
  assert.notDeepEqual(frame(true), tick, `${label}: the next tick still animates`);
  }
  }
});

test("cached redraws match a full redraw and only reprocess rows whose input changed", () => {
  const s = settings({ scope: "screen", motion: "scroll", speed: 1, frameBudgetMs: 0,
    fx: { rain: 1, snow: 1, matrix: 1, sakura: 1, starfield: 0.5, shine: 0.4, vignette: 0.4, glitch: 0.4 } });
  const source = fixture();
  for (let x = 0; x < 30; x++) { source.char[30 + x] = 65 + x % 26; source.char[90 + x] = 97 + x % 26; }
  const run = (cache: FrameCache | undefined) => {
    const engine = new RainbowEngine(s);
    let now = 5;
    Object.defineProperty(engine, "now", { get: () => now });
    const frame = (p: Planes, advance: boolean) =>
      processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode: "base", regions: [], advance, cache });
    frame(structuredClone(source), true);
    now = 5.5;
    frame(structuredClone(source), true);
    now = 5.55;
    const same = structuredClone(source);
    const sameRows = frame(same, false);
    const edited = structuredClone(source);
    for (let x = 4; x < 9; x++) edited.char[60 + x] = 0x2588; // streaming text lands on row 2
    const editedRows = frame(edited, false);
    return { same, edited, sameRows, editedRows };
  };
  const cached = run(new FrameCache(0));
  const full = run(undefined);
  assert.deepEqual(cached.same, full.same, "unchanged redraw");
  assert.deepEqual(cached.edited, full.edited, "redraw with one changed row");
  assert.equal(cached.sameRows, 0, "an unchanged redraw processes no rows");
  assert.equal(cached.editedRows, 1, "only the changed row is processed");
  assert.equal(full.editedRows, 6, "without a cache every row is processed");
});

test("cached redraws match full redraws for every effect, including ones that reach across rows", () => {
  const W = 40, H = 12;
  const source = () => {
    const n = W * H;
    const p = { char: new Uint32Array(n).fill(32), fg: new Uint16Array(n * 4), bg: new Uint16Array(n * 4), attributes: new Uint32Array(n) };
    for (let i = 0; i < n; i++) { p.fg.set([230, 235, 240, 255], i * 4); p.bg.set([16, 17, 22, 255], i * 4); }
    for (let y = 0; y < H; y += 2) for (let x = 2; x < 30; x++) p.char[y * W + x] = 65 + (x + y) % 26;
    return p;
  };
  for (const inputMode of ["base", "dialog"]) for (const fx of allFx()) {
    const s = settings({ scope: "screen", motion: "scroll", speed: 1, frameBudgetMs: 0, fx: { [fx.id]: 1 } });
    const run = (cache?: FrameCache) => {
      const engine = new RainbowEngine(s);
      let now = 5;
      Object.defineProperty(engine, "now", { get: () => now });
      const frame = (p: Planes, advance: boolean) =>
        processNativeFrame({ buffers: p, width: W, height: H }, engine, s, { inputMode, regions: [], advance, cache });
      frame(source(), true);
      now = 5.5;
      frame(source(), true);
      now = 5.55;
      const edited = source();
      for (let x = 4; x < 12; x++) edited.char[4 * W + x] = 0x2588;
      frame(edited, false);
      return edited;
    };
    assert.deepEqual(run(new FrameCache(0)), run(), `${fx.id} (${inputMode})`);
  }
});

test("ticks keep a cell's on-screen colour until it drifts past the threshold", () => {
  const s = settings({ scope: "screen", motion: "scroll", speed: 0.05, frameBudgetMs: 0 });
  const source = fixture();
  for (let x = 0; x < 30; x++) source.char[30 + x] = 65 + x % 26;
  const engine = new RainbowEngine(s);
  let now = 5;
  Object.defineProperty(engine, "now", { get: () => now });
  const cache = new FrameCache(2);
  const tick = (edit?: (p: Planes) => void) => {
    const p = structuredClone(source);
    edit?.(p);
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode: "base", regions: [], advance: true, cache });
    return p;
  };
  let shown = tick();
  let held = 0, moved = 0;
  for (let t = 1; t <= 24; t++) {
    now = 5 + t / 12;
    const next = tick();
    for (let cell = 0; cell < 30 * 6; cell++) {
      let d = 0;
      for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs((next.fg[cell * 4 + k]! & 255) - (shown.fg[cell * 4 + k]! & 255)));
      if (d === 0) continue;
      assert.ok(d > 2, `cell ${cell} moved by only ${d}`);
      moved++;
    }
    held += next.fg.filter((v, i) => i % 4 !== 3 && v === shown.fg[i]).length;
    shown = next;
  }
  assert.ok(moved > 0, "the gradient still moves");
  assert.ok(held > 0, "small steps are held");
  // A cell whose content changes is always redrawn from scratch.
  const edited = tick((p) => { p.char[33] = 0x2588; p.fg.set([90, 90, 90, 255], 33 * 4); });
  assert.notDeepEqual(edited.fg.slice(33 * 4, 34 * 4), shown.fg.slice(33 * 4, 34 * 4));
});

// A table in the transcript beside the session sidebar, which OpenCode paints
// with its own raised background.
function sidebarFixture(sidebarText: boolean) {
  const p = fixture();
  const table = ["┌──────────────────┐", "│ alpha    │ beta  │", "├──────────────────┤",
    "│ gamma    │ delta │", "└──────────────────┘", " plain prose here   "];
  const side = ["Title", "Context", "12% used", "MCP", "• cua", "Connected"];
  table.forEach((line, y) => [...line].forEach((ch, x) => { p.char[y * 30 + x] = ch.codePointAt(0)!; }));
  for (let y = 0; y < 6; y++) for (let x = 20; x < 30; x++) {
    p.bg.set([21, 21, 28, 255], (y * 30 + x) * 4);
    const ch = side[y]![x - 21];
    if (sidebarText && x > 20 && ch) p.char[y * 30 + x] = ch.codePointAt(0)!;
  }
  return p;
}
const sidebarRegion = [{ x: 20, y: 0, width: 10, height: 6, kind: "sidebar" as const }];

test("the session sidebar keeps its glyphs and takes the panel tint on every row beside tables", () => {
  const p = sidebarFixture(true);
  // The gap between two transcript blocks, beside empty sidebar padding: no text anywhere on the row.
  for (let x = 0; x < 30; x++) p.char[5 * 30 + x] = 32;
  const original = structuredClone(p);
  const s = settings({ scope: "panels", colorFooter: true, frameBudgetMs: 0, fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) });
  render(p, s, sidebarRegion);
  for (let y = 0; y < 6; y++) {
    const start = y * 30 + 20, end = start + 10;
    assert.deepEqual(p.char.slice(start, end), original.char.slice(start, end), `row ${y} sidebar glyphs`);
    assert.deepEqual(p.attributes.slice(start, end), original.attributes.slice(start, end), `row ${y} sidebar styles`);
    // Rows 0, 2 and 4 sit beside table rules: they must be tinted too, or the sidebar stripes.
    assert.notDeepEqual(p.bg.slice(start * 4, end * 4), original.bg.slice(start * 4, end * 4), `row ${y} sidebar tint`);
  }
  assert.notDeepEqual(p.fg.slice(21 * 4, 26 * 4), original.fg.slice(21 * 4, 26 * 4), "sidebar text still takes the gradient");
});

test("sidebar contents never change how the transcript beside it is classified", () => {
  const s = settings({ scope: "panels", colorFooter: true, frameBudgetMs: 0 });
  const [withText, blank] = [sidebarFixture(true), sidebarFixture(false)];
  for (const p of [withText, blank]) {
    const engine = new RainbowEngine(s);
    Object.defineProperty(engine, "now", { get: () => 1 });
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode: "base", regions: sidebarRegion });
  }
  for (let y = 0; y < 6; y++) {
    const start = y * 30, end = start + 20;
    assert.deepEqual(withText.fg.slice(start * 4, end * 4), blank.fg.slice(start * 4, end * 4), `row ${y} transcript text`);
    assert.deepEqual(withText.bg.slice(start * 4, end * 4), blank.bg.slice(start * 4, end * 4), `row ${y} transcript background`);
  }
});

test("tables in the transcript never change how sidebar text is coloured", () => {
  const s = settings({ scope: "panels", colorFooter: true, frameBudgetMs: 0 });
  const withTable = sidebarFixture(true);
  const without = sidebarFixture(true);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 20; x++) without.char[y * 30 + x] = 32;
  for (const p of [withTable, without]) {
    const engine = new RainbowEngine(s);
    Object.defineProperty(engine, "now", { get: () => 1 });
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode: "base", regions: sidebarRegion });
  }
  for (let y = 0; y < 6; y++) {
    const start = y * 30 + 20, end = start + 10;
    assert.deepEqual(withTable.fg.slice(start * 4, end * 4), without.fg.slice(start * 4, end * 4), `row ${y} sidebar text`);
    assert.deepEqual(withTable.bg.slice(start * 4, end * 4), without.bg.slice(start * 4, end * 4), `row ${y} sidebar tint`);
    assert.deepEqual(withTable.attributes.slice(start, end), without.attributes.slice(start, end), `row ${y} sidebar styles`);
  }
});

test("tables keep their own background while their text takes the gradient", () => {
  for (const scope of ["panels", "screen"] as const) {
    // The same text with its borders removed is plain prose: the table must get the same background.
    const [table, prose] = [sidebarFixture(false), sidebarFixture(false)];
    for (let i = 0; i < prose.char.length; i++) if (/[─│┌┐└┘├┤]/.test(String.fromCodePoint(prose.char[i]!))) prose.char[i] = 32;
    const original = structuredClone(table);
    const s = settings({ scope, boxBlend: 1, frameBudgetMs: 0 });
    for (const p of [table, prose]) {
      const engine = new RainbowEngine(s);
      Object.defineProperty(engine, "now", { get: () => 1 });
      processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode: "base", regions: sidebarRegion });
    }
    for (const y of [1, 3]) {
      const start = y * 30 + 1, end = y * 30 + 19;
      assert.deepEqual(table.bg.slice(start * 4, end * 4), prose.bg.slice(start * 4, end * 4), `${scope} row ${y} table fill`);
    }
    assert.notDeepEqual(table.fg.slice(32 * 4, 37 * 4), original.fg.slice(32 * 4, 37 * 4), `${scope} table text still coloured`);
  }
});

test("region detection finds the sidebar column from its slot marker", () => {
  const node = (id: string, x: number, y: number, width: number, height: number) => ({ id, screenX: x, screenY: y,
    width, height, zIndex: 0, visible: true, parent: null, getChildren: () => [] } as unknown as Renderable);
  const attach = (parent: Renderable, ...children: Renderable[]) => {
    parent.getChildren = () => children;
    for (const child of children) child.parent = parent;
  };
  const root = node("__root__", 0, 0, 120, 40);
  const row = node("box-5", 0, 0, 120, 38);
  const transcript = node("box-6", 0, 0, 78, 38);
  const sidebar = node("box-7", 78, 0, 42, 38);
  const footer = node("box-8", 80, 30, 38, 7);
  const slot = node("box-9", 80, 30, 38, 1);
  const marker = node("box-10", 80, 30, 0, 0);
  attach(root, row); attach(row, transcript, sidebar); attach(sidebar, footer); attach(footer, slot); attach(slot, marker);
  const regions = collectRegions(root, [], [marker]);
  assert.deepEqual(regions.filter((r) => r.kind === "sidebar"), [{ x: 78, y: 0, width: 42, height: 38, kind: "sidebar" }]);
});

// Reduced from OpenCode 2.0.27's live autocomplete tree. The popup is a raised
// sibling of the prompt body, with a scrollbox, and has no stable component ID.
function autocompleteTree() {
  const node = (id: string, x: number, y: number, width: number, height: number, zIndex = 0) =>
    ({ id, screenX: x, screenY: y, width, height, zIndex, visible: true,
      parent: null, getChildren: () => [] } as unknown as Renderable);
  const attach = (parent: Renderable, ...children: Renderable[]) => {
    parent.getChildren = () => children;
    for (const child of children) child.parent = parent;
  };
  const root = node("__root__", 0, 0, 30, 6);
  const host = node("box-11", 2, 3, 26, 3, 1000);
  const prompt = node("box-27", 2, 3, 26, 3);
  const body = node("box-28", 2, 3, 26, 3);
  const panel = node("box-29", 3, 3, 25, 3);
  const input = Object.assign(node("textarea-1", 4, 4, 22, 1), { editBuffer: {}, editorView: {} });
  const footer = node("box-30", 4, 5, 22, 1);
  const popup = node("box-38", 2, 1, 26, 2, 100);
  const scroll = node("scrollbox-1", 3, 1, 24, 2);
  attach(root, host); attach(host, prompt, popup); attach(prompt, body); attach(body, panel);
  attach(panel, input, footer); attach(popup, scroll);
  return { root, popup, scroll };
}

test("slash autocomplete preserves menu colours, selection and characters through native post-processing", () => {
  for (const scope of ["panels", "screen"] as const) for (const calmOnOverlay of [false, true]) {
    const p = fixture();
    const { root, popup } = autocompleteTree();
    for (let y = 1; y < 3; y++) for (let x = 2; x < 28; x++) {
      const i = y * 30 + x;
      p.bg.set(y === 1 ? [210, 165, 100, 255] : [30, 30, 30, 255], i * 4);
      if (x < 12) p.char[i] = "/models   "[x - 2]!.codePointAt(0)!;
    }
    const original = structuredClone(p);
    const s = settings({ scope, calmOnOverlay, frameBudgetMs: 0, fx: Object.fromEntries(allFx().map((f) => [f.id, 1])) });
    const engine = new RainbowEngine(s);
    Object.defineProperty(engine, "now", { get: () => 1 });
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s,
      { inputMode: "autocomplete", regions: collectRegions(root, []) });
    for (let y = popup.screenY; y < popup.screenY + popup.height; y++) {
      const start = y * 30 + popup.screenX, end = start + popup.width;
      assert.deepEqual(p.char.slice(start, end), original.char.slice(start, end), "menu glyphs");
      assert.deepEqual(p.bg.slice(start * 4, end * 4), original.bg.slice(start * 4, end * 4), "menu background/highlight");
      assert.deepEqual(p.fg.slice(start * 4, end * 4), original.fg.slice(start * 4, end * 4), "menu text");
      assert.deepEqual(p.attributes.slice(start, end), original.attributes.slice(start, end), "menu styles");
    }
  }
});

test("opening slash autocomplete does not dim the surrounding rainbow colours", () => {
  const s = settings({ scope: "screen" });
  const base = fixture(), open = fixture();
  base.char[0] = open.char[0] = 65;
  for (const [p, inputMode] of [[base, "base"], [open, "autocomplete"]] as const) {
    const engine = new RainbowEngine(s);
    Object.defineProperty(engine, "now", { get: () => 1 });
    processNativeFrame({ buffers: p, width: 30, height: 6 }, engine, s, { inputMode, regions: [] });
  }
  assert.deepEqual(open, base, "autocomplete has no dimmed backdrop; keep the surrounding frame steady");
});

test("closing autocomplete releases its region and leaves ordinary scroll panels colourable", () => {
  const { root, popup } = autocompleteTree();
  const protectedRegions = () => collectRegions(root, []).filter((r) => r.kind === "protected");
  assert.equal(protectedRegions().length, 1);
  popup.visible = false;
  assert.equal(protectedRegions().length, 0, "Escape must release the popup region");
  popup.visible = true;
  popup.height = 0;
  assert.equal(protectedRegions().length, 0, "an unlaid-out popup has no protected area");
  popup.height = 2;
  popup.zIndex = 0;
  assert.equal(protectedRegions().length, 0, "an ordinary scroll panel is not a popup");
});

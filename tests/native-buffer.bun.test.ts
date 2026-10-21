import assert from "node:assert/strict";
import test from "node:test";
import { RainbowEngine } from "../src/engine.js";
import { readFrame, writeFrame, frameBackground } from "../src/native-frame.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

test("real OpenTUI buffer keeps Unicode, style and native colour encoding", { skip: !process.versions.bun }, async () => {
  const { OptimizedBuffer, RGBA } = await import("@opentui/core");
  const b = OptimizedBuffer.create(60, 5, "unicode");
  try {
    b.clear(RGBA.fromHex("#101116"));
    b.drawText("A世界 👋🏽 é 👨‍👩‍👧‍👦 link", 2, 1, RGBA.fromIndex(7), undefined, 1 | 4 | 8);
    const text = b.getRealCharBytes(true).slice();
    const char = b.buffers.char.slice();
    const attrs = b.buffers.attributes.slice();
    const fg = b.buffers.fg.slice();
    const s = { ...DEFAULT_SETTINGS, fx: {}, scope: "text" as const };
    const frame = readFrame(b.buffers, b.width, b.height, frameBackground(b.buffers), s);
    new RainbowEngine(s).processFrame(frame, { width: b.width, height: b.height, fullscreen: true });
    writeFrame(b.buffers, frame, s);
    assert.deepEqual(b.getRealCharBytes(true), text);
    assert.deepEqual(b.buffers.char, char);
    assert.deepEqual(b.buffers.attributes, attrs);
    assert.notDeepEqual(b.buffers.fg, fg);
    const color = RGBA.fromArray(b.buffers.fg.slice((60 + 2) * 4, (60 + 3) * 4));
    assert.equal(color.intent, "rgb");
    assert.equal(color.a, 1);
  } finally { b.destroy(); }
});

test("cells covered by a real drawImage keep every plane", { skip: !process.versions.bun }, async () => {
  const { OptimizedBuffer, RGBA, NativeImage } = await import("@opentui/core");
  const b = OptimizedBuffer.create(30, 8, "unicode");
  const rgba = new Uint8Array(4 * 4 * 4).fill(200);
  const image = NativeImage.fromRgba(rgba, 4, 4);
  try {
    b.clear(RGBA.fromHex("#101116"));
    assert.ok(b.drawImage(image, 2, 1, 6, 4, 60, 80));
    const covered = (i: number) => (b.buffers.char[i]! >>> 30) === 1;
    const cells = [...b.buffers.char.keys()].filter(covered);
    assert.equal(cells.length, 24, "drawImage flags the cells it covers");
    const before = { char: b.buffers.char.slice(), fg: b.buffers.fg.slice(), bg: b.buffers.bg.slice(), attrs: b.buffers.attributes.slice() };
    const s = { ...DEFAULT_SETTINGS, scope: "screen" as const };
    const frame = readFrame(b.buffers, b.width, b.height, frameBackground(b.buffers), s);
    new RainbowEngine(s).processFrame(frame, { width: b.width, height: b.height, fullscreen: true });
    writeFrame(b.buffers, frame, s);
    for (const i of cells) {
      assert.equal(b.buffers.char[i], before.char[i]);
      assert.equal(b.buffers.attributes[i], before.attrs[i]);
      assert.deepEqual(b.buffers.fg.slice(i * 4, i * 4 + 4), before.fg.slice(i * 4, i * 4 + 4));
      assert.deepEqual(b.buffers.bg.slice(i * 4, i * 4 + 4), before.bg.slice(i * 4, i * 4 + 4));
    }
    assert.notDeepEqual(b.buffers.bg, before.bg, "the rest of the screen is still tinted");
  } finally { b.destroy(); image.dispose(); }
});

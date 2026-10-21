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

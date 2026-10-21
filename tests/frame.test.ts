import assert from "node:assert/strict";
import test from "node:test";
import { type AnsiGridLine, parseAnsiLine } from "../src/ansi-grid.js";
import { buildFrame, emitFrame } from "../src/frame.js";

test("parsed rows survive scrolling and resize without retaining effect output or old content", () => {
	const cache = new Map<string, AnsiGridLine>();
	const text = "\x1b[1;2;3;4;7;38;2;210;220;230;48;2;28;30;38mA世界 👋🏽 é\x1b[0m";
	const link = "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
	const image = "\x1b_Gf=32,s=1,v=1;AAAA\x1b\\";
	const first = buildFrame([text, text, link, image], 80, 24, true, cache);
	const parsed = cache.get(text);
	assert.ok(parsed);
	assert.deepEqual(parsed, parseAnsiLine(text));
	assert.notEqual(first.rows[0]!.cells[0], first.rows[1]!.cells[0], "duplicate rows need independent output");
	for (const row of first.rows) {
		row.skip = true;
		row.quiet = true;
		row.dirty = true;
		for (const cell of row.cells) {
			cell.outText = "X";
			cell.outFg = { r: 1, g: 2, b: 3 };
			cell.outBg = null;
			cell.claimed = true;
			for (const key of ["outBold", "outDim", "outItalic", "outUnderline", "outInverse"] as const) {
				cell[key] = !cell[key];
			}
		}
	}
	assert.deepEqual(parsed, parseAnsiLine(text), "effects must not mutate cached source cells");
	for (const width of [12, 40, 80]) for (const padTo of [false, true]) {
		const lines = [image, link, text, "", " > edited input"];
		const frame = buildFrame(lines, width, 10, padTo, cache);
		assert.equal(cache.get(text), parsed, "parsing is independent of row position, width and padding");
		assert.deepEqual(frame, buildFrame(lines, width, 10, padTo));
		assert.deepEqual(emitFrame(frame), emitFrame(buildFrame(lines, width, 10, padTo)));
		assert.equal(emitFrame(frame)[0], image);
		assert.ok(cache.size <= new Set(lines).size);
	}
	buildFrame(["new conversation"], 80, 24, true, cache);
	assert.deepEqual([...cache.keys()], ["new conversation"]);
	buildFrame([], 80, 24, true, cache);
	assert.equal(cache.size, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractPngPalette } from './png-palette.mjs';

test('extracts exact dominant colors from a PNG brand board', async () => {
  const image = await readFile(new URL('../evals/fixtures/brand-light-coral.png', import.meta.url), 'base64');
  const palette = extractPngPalette(image);
  assert.equal(palette.width, 720);
  assert.equal(palette.height, 480);
  assert.deepEqual(palette.colors.map((color) => color.hex).slice(0, 3), ['#FAFAF5', '#151515', '#FF5533']);
  assert.ok(palette.colors[0].ratio > palette.colors[1].ratio);
});

test('rejects non-PNG data without guessing', () => {
  assert.equal(extractPngPalette(Buffer.from('not an image').toString('base64')), null);
});

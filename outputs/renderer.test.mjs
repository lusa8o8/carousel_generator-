import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./renderer.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const renderer = sandbox.window.CarouselRenderer;

function createContext() {
  const context = {
    font: '16px sans-serif',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText() {},
    save() {},
    restore() {},
    translate() {},
    measureText(text) {
      const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16);
      return { width: String(text).length * size * 0.52 };
    }
  };
  return context;
}

function settings(overrides = {}) {
  return {
    seriesTag: 'FOCUS NOTES',
    handle: '@yourhandle',
    format: 'ig_square',
    palette: 'oat',
    showMargin: false,
    brand: {
      enabled: false,
      paper: '#EFE9DA',
      ink: '#212B21',
      accent: '#C08A28',
      headline: 'editorial',
      body: 'clean'
    },
    ...overrides
  };
}

test('uses the supplied format rather than global state', () => {
  const slide = { id: 'slide-1', title: 'A deterministic title', body: '', isCover: true, layout: { titleScale: 1, bodyScale: 1, align: 'left' } };
  const result = renderer.drawSlide(createContext(), slide, 0, 1, settings({ format: 'linkedin' }));
  assert.equal(result.measurements.width, 1200);
  assert.equal(result.measurements.height, 628);
});

test('returns identical measurements for identical inputs', () => {
  const slide = { id: 'slide-1', title: 'Repeatable rendering', body: 'The same document produces the same measurements.', isCover: false, layout: { titleScale: 1, bodyScale: 1, align: 'center' } };
  const first = renderer.drawSlide(createContext(), slide, 0, 1, settings());
  const second = renderer.drawSlide(createContext(), slide, 0, 1, settings());
  assert.deepEqual(first, second);
});

test('reports measured truncation for content that cannot fit', () => {
  const slide = {
    id: 'slide-long',
    title: Array.from({ length: 160 }, () => 'unusuallylongword').join(' '),
    body: '',
    isCover: false,
    layout: { titleScale: 1.8, bodyScale: 1, align: 'left' }
  };
  const result = renderer.drawSlide(createContext(), slide, 0, 1, settings({ format: 'twitter' }));
  assert.ok(result.issues.some((issue) => issue.code === 'text_truncated'));
});

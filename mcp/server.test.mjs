import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, handleMessage } from './server.mjs';

const baseUrl = process.env.CAROUSEL_TEST_URL || 'http://localhost:3101/api/carousel';

test('advertises the carousel tools', async () => {
  const result = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, baseUrl);
  assert.ok(result.tools.some((tool) => tool.name === 'apply_operations'));
  assert.ok(result.tools.some((tool) => tool.name === 'render_slide'));
  assert.ok(result.tools.some((tool) => tool.name === 'extract_brand_from_prompt'));
  assert.ok(result.tools.some((tool) => tool.name === 'preview_brand'));
  assert.ok(result.tools.some((tool) => tool.name === 'apply_brand'));
});

test('extracts and previews a deterministic brand through agent tools', async () => {
  const current = (await callTool('get_carousel', {}, baseUrl)).structuredContent;
  const extracted = await callTool('extract_brand_from_prompt', {
    prompt: 'Use #F8F4EA paper, #182018 ink, and #EF5B3F accent.',
    currentBrand: current.document.theme.brand
  }, baseUrl);
  assert.equal(extracted.structuredContent.method, 'deterministic-prompt');

  const preview = await callTool('preview_brand', {
    profile: extracted.structuredContent.profile,
    baseRevision: current.revision
  }, baseUrl);
  assert.equal(preview.structuredContent.committed, false);
  assert.equal((await callTool('get_carousel', {}, baseUrl)).structuredContent.revision, current.revision);
});

test('reads the current carousel through the shared API', async () => {
  const result = await callTool('get_carousel', {}, baseUrl);
  assert.equal(result.structuredContent.document.version, 1);
  assert.ok(result.structuredContent.document.slides.length > 0);
});

test('returns an uncommitted explore candidate', async () => {
  const current = (await callTool('get_carousel', {}, baseUrl)).structuredContent;
  const slide = current.document.slides[0];
  const result = await callTool('apply_operations', {
    baseRevision: current.revision,
    mode: 'explore',
    operations: [{
      type: 'update_slide',
      slideId: slide.id,
      changes: { layout: { align: 'center', titleScale: 1.1 } }
    }]
  }, baseUrl);

  assert.equal(result.structuredContent.committed, false);
  const unchanged = (await callTool('get_carousel', {}, baseUrl)).structuredContent;
  assert.equal(unchanged.revision, current.revision);
});

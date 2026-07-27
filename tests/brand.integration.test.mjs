import test from 'node:test';
import assert from 'node:assert/strict';

const brandUrl = process.env.CAROUSEL_BRAND_TEST_URL || 'http://localhost:3000/api/brand';
const carouselUrl = brandUrl.replace(/\/api\/brand\/?$/, '/api/carousel');

async function jsonRequest(url, body) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  assert.equal(response.ok, true, result.error);
  return result;
}

test('returns the same deterministic profile for the same explicit instruction', async () => {
  const payload = {
    sourceType: 'prompt',
    prompt: 'Use #FAFAF5 paper, #151515 ink, and #FF5533 accent with a modern sans headline.',
    currentBrand: { paper: '#EFE9DA', ink: '#212B21', accent: '#C08A28', headline: 'editorial', body: 'clean' }
  };
  const first = await jsonRequest(`${brandUrl}/extract`, payload);
  const second = await jsonRequest(`${brandUrl}/extract`, payload);
  assert.equal(first.method, 'deterministic-prompt');
  assert.deepEqual(second.profile, first.profile);
  assert.equal(second.cached, true);
});

test('previews without committing and applies without changing slide copy', async () => {
  const before = await jsonRequest(carouselUrl);
  const profile = (await jsonRequest(`${brandUrl}/extract`, {
    sourceType: 'prompt',
    prompt: 'Use #F7F5EE paper, #171A18 ink, and #E84F3D accent.',
    currentBrand: before.document.theme.brand
  })).profile;

  const preview = await jsonRequest(`${brandUrl}/apply`, {
    profile,
    baseRevision: before.revision,
    mode: 'explore'
  });
  assert.equal(preview.committed, false);
  assert.equal((await jsonRequest(carouselUrl)).revision, before.revision);

  const applied = await jsonRequest(`${brandUrl}/apply`, {
    profile,
    baseRevision: before.revision,
    mode: 'edit',
    description: 'Brand API integration verification'
  });
  assert.equal(applied.document.theme.brand.accent, '#E84F3D');
  assert.deepEqual(applied.document.slides, before.document.slides);

  const restored = await jsonRequest(`${carouselUrl}/undo`, {});
  assert.deepEqual(restored.document.theme.brand, before.document.theme.brand);
});

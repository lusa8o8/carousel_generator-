import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../outputs/index.html', import.meta.url), 'utf8');

test('editor reacts to Firebase auth changes and partitions workspace caches', () => {
  assert.match(html, /carousel-auth-changed/);
  assert.match(html, /workspace:\$\{cloudSession\.workspaceId\}/);
  assert.match(html, /authSessionVersion/);
  assert.match(html, /scopes: visibleCarouselScopes\(\)/);
});

test('editor syncs cloud documents only through authenticated API routes', () => {
  assert.match(html, /\/api\/account/);
  assert.match(html, /\/api\/cloud\/carousels/);
  assert.match(html, /'Authorization': `Bearer \$\{token\}`/);
  assert.doesNotMatch(html, /\bsetDoc\s*\(/);
  assert.doesNotMatch(html, /\bonSnapshot\s*\(/);
});

test('every browser AI call supplies an idempotency key and displays credit balances', () => {
  assert.equal((html.match(/'X-Idempotency-Key'/g) || []).length, 2);
  assert.match(html, /creditsRemaining/);
  assert.match(html, /applyBillingStatus/);
});

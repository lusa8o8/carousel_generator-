import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.CAROUSEL_TEST_URL || 'http://localhost:3000/api/carousel';

async function request(path = '', options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  return { response, body };
}

test('serves a valid versioned carousel', async () => {
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.equal(body.document.version, 1);
  assert.ok(body.document.slides.length > 0);
  assert.ok(Array.isArray(body.validation));
});

test('keeps explore candidates uncommitted', async () => {
  const current = (await request()).body;
  const slide = current.document.slides[0];
  const explored = (await request('/operations', {
    method: 'POST',
    body: {
      baseRevision: current.revision,
      mode: 'explore',
      operations: [{ type: 'update_slide', slideId: slide.id, changes: { layout: { align: 'center' } } }]
    }
  })).body;
  assert.equal(explored.committed, false);
  assert.equal((await request()).body.revision, current.revision);
});

test('rejects stale writes and undo restores committed edits', async () => {
  const current = (await request()).body;
  const slide = current.document.slides[1] || current.document.slides[0];
  const originalTitle = slide.title;
  const committed = await request('/operations', {
    method: 'POST',
    body: {
      baseRevision: current.revision,
      description: 'API integration verification',
      operations: [{ type: 'update_slide', slideId: slide.id, changes: { title: `${originalTitle} [verification]` } }]
    }
  });
  assert.equal(committed.response.status, 200);

  const stale = await request('/operations', {
    method: 'POST',
    body: {
      baseRevision: current.revision,
      operations: [{ type: 'update_slide', slideId: slide.id, changes: { title: 'Stale write' } }]
    }
  });
  assert.equal(stale.response.status, 409);

  const undone = await request('/undo', { method: 'POST' });
  assert.equal(undone.body.document.slides.find((entry) => entry.id === slide.id).title, originalTitle);
});

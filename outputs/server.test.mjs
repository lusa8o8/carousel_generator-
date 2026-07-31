import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';

const { requestHandler } = await import('./server.mjs');

function request(path) {
  const headers = new Map();
  const response = {
    status: null,
    body: '',
    writeHead(status, values = {}) {
      this.status = status;
      Object.entries(values).forEach(([key, value]) => headers.set(key.toLowerCase(), value));
    },
    end(value = '') {
      this.body += value;
    }
  };
  return requestHandler({ method: 'GET', url: path, headers: {} }, response).then(() => ({ response, headers }));
}

test('serves the editor without eagerly initializing Firebase Admin', async () => {
  const { response } = await request('/');
  assert.equal(response.status, 200);
  assert.match(response.body, /window\.FIREBASE_CONFIG=/);
  assert.doesNotMatch(response.body, /AIza[0-9A-Za-z_-]{35}/);
});

test('answers favicon requests without invoking the application', async () => {
  for (const path of ['/favicon.ico', '/favicon.png']) {
    const { response } = await request(path);
    assert.equal(response.status, 204);
    assert.equal(response.body, '');
  }
});

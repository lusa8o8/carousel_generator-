import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const playwrightPackage = process.env.CODEX_PLAYWRIGHT_PACKAGE;
if (!playwrightPackage) throw new Error('Set CODEX_PLAYWRIGHT_PACKAGE to the runtime package.json beside node_modules/playwright.');
const require = createRequire(playwrightPackage);
const { chromium } = require('playwright');
const visualPort = Number(process.env.CAROUSEL_VISUAL_PORT || 3105);
const appUrl = process.env.CAROUSEL_VISUAL_URL || `http://localhost:${visualPort}`;
const localServer = process.env.CAROUSEL_VISUAL_URL ? null : spawn(process.execPath, [
  './outputs/server.mjs',
  `--port=${visualPort}`
], {
  cwd: new URL('../', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
if (localServer) await waitForServer(`${appUrl}/api/carousel`, localServer);
const executablePath = process.env.CHROME_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
const failedResponses = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('.brand-source-tab').count(), 3);
  const before = await (await fetch(`${appUrl}/api/carousel`)).json();
  const beforeSlides = JSON.stringify(before.document.slides);

  await page.locator('#brandDescription').fill('Use #0B0B0B paper, #F5F0E8 ink, and #FF5A45 accent with a modern sans headline.');
  await page.locator('#extractBrandBtn').click();
  await page.locator('#brandCandidate.visible').waitFor();
  assert.match(await page.locator('#candidatePaper').textContent(), /#0B0B0B/);
  assert.match(await page.locator('#candidateInk').textContent(), /#F5F0E8/);
  assert.match(await page.locator('#candidateAccent').textContent(), /#FF5A45/);

  await page.locator('#previewBrandBtn').click();
  const previewSnapshot = await (await fetch(`${appUrl}/api/carousel`)).json();
  assert.equal(previewSnapshot.revision, before.revision);
  const canvasSignal = await page.locator('#preview').evaluate((canvas) => {
    const context2d = canvas.getContext('2d');
    const points = [[4, 4], [canvas.width / 2, canvas.height / 2], [canvas.width - 4, canvas.height - 4]];
    return new Set(points.map(([x, y]) => [...context2d.getImageData(x, y, 1, 1).data].join(','))).size;
  });
  assert.ok(canvasSignal >= 1);
  await page.locator('#previewBrandBtn').click();

  await page.locator('#applyBrandBtn').click();
  const applied = await waitForRemoteBrand(`${appUrl}/api/carousel`, '#0B0B0B');
  assert.equal(applied.document.theme.brand.paper, '#0B0B0B');
  assert.equal(applied.document.theme.brand.ink, '#F5F0E8');
  assert.equal(applied.document.theme.brand.accent, '#FF5A45');
  assert.equal(JSON.stringify(applied.document.slides), beforeSlides);

  await page.locator('[data-source="image"]').click();
  assert.equal(await page.locator('[data-panel="image"]').isVisible(), true);
  await page.locator('#brandImageInput').setInputFiles(fileURLToPath(new URL('../evals/fixtures/brand-light-coral.png', import.meta.url)));
  await page.locator('#brandImageGuidance').fill('The large field is paper, the dark block is ink, and coral is the accent. Use a modern sans headline and clean body.');
  await page.locator('#extractBrandBtn').click();
  await page.waitForFunction(() => document.querySelector('#brandStatus')?.textContent?.includes('Candidate ready'));
  assert.match(await page.locator('#candidateAccent').textContent(), /#FF5533/);

  await page.locator('[data-source="url"]').click();
  assert.equal(await page.locator('[data-panel="url"]').isVisible(), true);
  assert.equal(await page.locator('#brandUrl').getAttribute('type'), 'url');
  await page.locator('[data-source="prompt"]').click();

  await page.screenshot({ path: fileURLToPath(new URL('../outputs/brand-ui-desktop.png', import.meta.url)), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const mobileLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sidebarWidth: document.querySelector('#sidebar').getBoundingClientRect().width,
    candidateRight: document.querySelector('#brandCandidate').getBoundingClientRect().right
  }));
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.viewport);
  assert.ok(mobileLayout.sidebarWidth <= mobileLayout.viewport);
  assert.ok(mobileLayout.candidateRight <= mobileLayout.viewport + 1);
  await page.screenshot({ path: fileURLToPath(new URL('../outputs/brand-ui-mobile.png', import.meta.url)), fullPage: true });

  const undoResponse = await fetch(`${appUrl}/api/carousel/undo`, { method: 'POST' });
  assert.equal(undoResponse.ok, true);
  await page.waitForTimeout(1200);
  const relevantResponses = failedResponses.filter((entry) => !entry.endsWith('/favicon.ico'));
  const relevantErrors = errors.filter((entry) => !entry.includes('Failed to load resource'));
  assert.deepEqual(relevantResponses, []);
  assert.deepEqual(relevantErrors, []);
  console.log(JSON.stringify({ desktop: 'outputs/brand-ui-desktop.png', mobile: 'outputs/brand-ui-mobile.png', mobileLayout, ignoredResponses: failedResponses.filter((entry) => entry.endsWith('/favicon.ico')) }, null, 2));
  await context.close();
} finally {
  await browser.close();
  localServer?.kill();
}

async function waitForServer(url, server) {
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Visual test server exited.\n${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Visual test server did not start.\n${output}`);
}

async function waitForRemoteBrand(url, paper) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const snapshot = await (await fetch(url, { cache: 'no-store' })).json();
    if (snapshot.document.theme.brand.paper === paper) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Brand ${paper} was not persisted.`);
}

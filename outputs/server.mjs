import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import {
  BRAND_EXTRACTOR_VERSION,
  brandThemePatch,
  createBrandProfile,
  extractCssBrandEvidence,
  extractDeterministicPromptBrand,
  extractHtmlBrandEvidence,
  fingerprintBrandInput,
  profileFromWebEvidence
} from '../core/brand.mjs';
import { createCarouselDocument } from '../core/document.mjs';
import { extractPngPalette } from '../core/png-palette.mjs';
import { CarouselStore } from '../core/store.mjs';
import { BRAND_EXTRACTION_SCHEMA, BRAND_EXTRACTION_SYSTEM_PROMPT, buildBrandExtractionBrief } from './brand-contract.mjs';
import { buildGenerationBrief, GENERATION_SYSTEM_PROMPT, OUTLINE_SCHEMA } from './prompt-contract.mjs';

function loadLocalEnv() {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  let envText = '';
  try {
    envText = readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }

  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) return;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadLocalEnv();

const portArgument = process.argv.find((argument) => argument.startsWith('--port='));
const PORT = Number(portArgument?.split('=')[1] || process.env.PORT || 3000);
const ALLOW_PRIVATE_URLS = process.argv.includes('--allow-private-urls') || process.env.CAROUSEL_ALLOW_PRIVATE_URLS === '1';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const indexPath = fileURLToPath(new URL('./index.html', import.meta.url));
const rendererPath = fileURLToPath(new URL('./renderer.js', import.meta.url));
const dataDirectory = fileURLToPath(new URL('../.carousel/', import.meta.url));
const documentPath = fileURLToPath(new URL('../.carousel/current.json', import.meta.url));
const brandCachePath = fileURLToPath(new URL('../.carousel/brand-cache.json', import.meta.url));
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_WEB_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const previews = new Map();
const layoutDiagnostics = new Map();
let persistenceQueue = Promise.resolve();
let brandCacheQueue = Promise.resolve();

async function loadSavedCarousel() {
  try {
    return JSON.parse(await readFile(documentPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not load saved carousel: ${error.message}`);
    return createCarouselDocument();
  }
}

function persistCarousel(snapshot) {
  persistenceQueue = persistenceQueue
    .then(() => mkdir(dataDirectory, { recursive: true }))
    .then(() => writeFile(documentPath, `${JSON.stringify(snapshot.document, null, 2)}\n`))
    .catch((error) => console.error(`Could not save carousel: ${error.message}`));
}

function handleCarouselChange(snapshot) {
  previews.clear();
  layoutDiagnostics.clear();
  persistCarousel(snapshot);
}

const carouselStore = new CarouselStore(await loadSavedCarousel(), {
  description: 'Loaded carousel',
  onChange: handleCarouselChange
});
const brandCache = await loadBrandCache();

function carouselSnapshot() {
  const snapshot = carouselStore.snapshot();
  return {
    ...snapshot,
    validation: [
      ...snapshot.validation,
      ...Array.from(layoutDiagnostics.values()).flatMap((diagnostic) => diagnostic.issues || [])
    ]
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) reject(new Error('Request is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Request must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendPng(res, preview) {
  const buffer = Buffer.from(preview.data, 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
    'X-Carousel-Revision': String(preview.revision)
  });
  res.end(buffer);
}

function errorStatus(error) {
  if (error.code === 'REVISION_CONFLICT') return 409;
  if (error.code === 'VERSION_NOT_FOUND') return 404;
  if (error.code === 'INVALID_OPERATION' || error.code === 'INVALID_CAROUSEL' || error.code === 'INVALID_BRAND_PROFILE' || error.code === 'INVALID_BRAND_SOURCE') return 400;
  if (error.code === 'BRAND_SOURCE_UNAVAILABLE') return 502;
  return 500;
}

function errorPayload(error) {
  return {
    error: error.message || 'Unexpected server error.',
    code: error.code,
    issues: error.issues,
    current: error.current
  };
}

function callAnthropic(requestBody) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(requestBody),
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(parsed.error?.message || 'Claude API request failed.');
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function imageBlocks(images) {
  if (!images) return [];
  if (!Array.isArray(images) || images.length > 3) throw new Error('Use up to 3 reference images.');
  return images.map((image) => {
    if (!ALLOWED_IMAGE_TYPES.has(image?.mediaType) || typeof image?.data !== 'string') throw new Error('Reference images must be PNG, JPEG, GIF, or WebP.');
    if (image.data.length > 5_600_000) throw new Error('Each reference image must be 4 MB or smaller.');
    return { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } };
  });
}

async function loadBrandCache() {
  try {
    const parsed = JSON.parse(await readFile(brandCachePath, 'utf8'));
    return new Map(Object.entries(parsed));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not load brand cache: ${error.message}`);
    return new Map();
  }
}

function persistBrandCache() {
  const entries = Object.fromEntries([...brandCache.entries()].slice(-200));
  brandCacheQueue = brandCacheQueue
    .then(() => mkdir(dataDirectory, { recursive: true }))
    .then(() => writeFile(brandCachePath, `${JSON.stringify(entries, null, 2)}\n`))
    .catch((error) => console.error(`Could not save brand cache: ${error.message}`));
}

function cacheBrandProfile(fingerprint, profile, method, usage) {
  const value = { profile, method, cachedAt: new Date().toISOString() };
  brandCache.set(fingerprint, value);
  persistBrandCache();
  return { ...value, cached: false, usage };
}

async function extractBrand(payload) {
  const sourceType = payload.sourceType;
  if (!['prompt', 'image', 'url'].includes(sourceType)) throw brandSourceError('sourceType must be prompt, image, or url.');
  const currentBrand = payload.currentBrand || carouselStore.snapshot().document.theme.brand;

  if (sourceType === 'prompt') {
    if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) throw brandSourceError('A brand description is required.');
    const fingerprint = fingerprintBrandInput({
      extractorVersion: BRAND_EXTRACTOR_VERSION,
      sourceType,
      prompt: payload.prompt.trim(),
      currentBrand
    });
    const cached = payload.bypassCache ? null : brandCache.get(fingerprint);
    if (cached) return { ...cached, cached: true };
    const deterministic = extractDeterministicPromptBrand(payload.prompt, currentBrand);
    if (deterministic) {
      const profile = createBrandProfile({ ...deterministic, fingerprint, confidence: 1 });
      return cacheBrandProfile(fingerprint, profile, 'deterministic-prompt');
    }
    return extractBrandWithClaude({ ...payload, currentBrand }, fingerprint, []);
  }

  if (sourceType === 'image') {
    const blocks = imageBlocks(payload.images);
    if (!blocks.length) throw brandSourceError('At least one reference image is required.');
    const imageEvidence = Array.isArray(payload.imageEvidence) && payload.imageEvidence.length
      ? payload.imageEvidence
      : payload.images.map((image) => image.mediaType === 'image/png' ? extractPngPalette(image.data) : null).filter(Boolean);
    const fingerprint = fingerprintBrandInput({
      extractorVersion: BRAND_EXTRACTOR_VERSION,
      sourceType,
      prompt: payload.prompt || '',
      currentBrand,
      images: payload.images
    });
    const cached = payload.bypassCache ? null : brandCache.get(fingerprint);
    if (cached) return { ...cached, cached: true };
    return extractBrandWithClaude({ ...payload, currentBrand, imageEvidence }, fingerprint, blocks);
  }

  const crawl = await crawlBrandUrl(payload.url);
  const fingerprint = fingerprintBrandInput({
    extractorVersion: BRAND_EXTRACTOR_VERSION,
    sourceType,
    url: crawl.url,
    snapshot: crawl.snapshot
  });
  const cached = payload.bypassCache ? null : brandCache.get(fingerprint);
  if (cached) return { ...cached, cached: true, crawl: crawl.summary };
  const deterministic = profileFromWebEvidence(crawl.evidence, currentBrand);
  if (deterministic) {
    const profile = createBrandProfile({ ...deterministic, fingerprint });
    return { ...cacheBrandProfile(fingerprint, profile, 'deterministic-web-evidence'), crawl: crawl.summary };
  }
  const result = await extractBrandWithClaude({
    ...payload,
    currentBrand,
    url: crawl.url,
    webEvidence: crawl.evidence
  }, fingerprint, []);
  return { ...result, crawl: crawl.summary };
}

async function extractBrandWithClaude(payload, fingerprint, mediaBlocks) {
  if (!API_KEY) {
    const error = new Error('Set ANTHROPIC_API_KEY before using model-based brand extraction.');
    error.code = 'BRAND_SOURCE_UNAVAILABLE';
    throw error;
  }
  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    temperature: 0,
    system: BRAND_EXTRACTION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        ...mediaBlocks,
        { type: 'text', text: buildBrandExtractionBrief(payload) }
      ]
    }],
    output_config: { format: { type: 'json_schema', schema: BRAND_EXTRACTION_SCHEMA } }
  });
  const response = await callAnthropic(requestBody);
  const extracted = repairExtractedBrand(
    JSON.parse(response.content?.find((block) => block.type === 'text')?.text || '{}'),
    payload.imageEvidence
  );
  const profile = createBrandProfile({
    ...extracted,
    sourceType: payload.sourceType,
    evidence: [...(payload.webEvidence || []), ...(extracted.evidence || [])],
    fingerprint
  });
  return cacheBrandProfile(fingerprint, profile, `claude-${payload.sourceType}`, response.usage);
}

function repairExtractedBrand(extracted, imageEvidence = []) {
  const result = { ...extracted };
  for (const role of ['paper', 'ink', 'accent']) {
    const direct = normalizeExtractedHex(result[role]);
    const evidence = (result.evidence || []).find((item) =>
      new RegExp(role, 'i').test(`${item?.kind || ''} ${item?.source || ''} ${item?.value || ''}`)
      && /#[0-9a-f]{6}\b/i.test(item?.value || '')
    );
    result[role] = direct || normalizeExtractedHex(evidence?.value);
  }

  const sampledColors = imageEvidence.flatMap((entry) => entry?.colors || []).map((entry) => entry.hex).filter(Boolean);
  if (sampledColors.length) {
    for (const role of ['paper', 'ink', 'accent']) {
      if (result[role]) result[role] = nearestColor(result[role], sampledColors);
    }
    result.evidence = [
      ...(result.evidence || []),
      ...imageEvidence.flatMap((entry, imageIndex) => (entry?.colors || []).map((color) => ({
        kind: 'sampled-palette',
        source: `image-${imageIndex + 1}`,
        value: `${color.hex} (${(color.ratio * 100).toFixed(1)}%)`
      })))
    ];
  }
  return result;
}

function normalizeExtractedHex(value) {
  const match = String(value || '').match(/#[0-9a-f]{6}\b/i);
  return match?.[0].toUpperCase();
}

function nearestColor(color, candidates) {
  const target = colorChannels(color);
  return candidates
    .map((candidate) => ({
      candidate: candidate.toUpperCase(),
      distance: colorChannels(candidate).reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0)
    }))
    .toSorted((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))[0].candidate;
}

function colorChannels(color) {
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
}

async function crawlBrandUrl(inputUrl) {
  const first = await fetchBrandResource(inputUrl, ['text/html', 'application/xhtml+xml']);
  const evidence = extractHtmlBrandEvidence(first.body, first.url);
  const stylesheetUrls = evidence
    .filter((item) => item.kind === 'stylesheet')
    .map((item) => item.value)
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .filter((value) => new URL(value).origin === new URL(first.url).origin)
    .slice(0, 4);
  const stylesheets = [];
  for (const url of stylesheetUrls) {
    try {
      const resource = await fetchBrandResource(url, ['text/css']);
      stylesheets.push(resource);
      evidence.push(...extractCssBrandEvidence(resource.body, resource.url));
    } catch (error) {
      evidence.push({ kind: 'crawl-warning', source: url, value: error.message });
    }
  }
  return {
    url: first.url,
    evidence,
    snapshot: {
      html: first.body,
      stylesheets: stylesheets.map((resource) => ({ url: resource.url, body: resource.body }))
    },
    summary: {
      url: first.url,
      stylesheets: stylesheets.length,
      evidence: evidence.length
    }
  };
}

async function fetchBrandResource(inputUrl, acceptedTypes, redirects = 0) {
  if (redirects > 3) throw brandUnavailableError('Brand URL redirected too many times.');
  const url = await validateBrandUrl(inputUrl);
  let response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent': 'CarouselMakerBrandExtractor/1.0',
        accept: acceptedTypes.join(', ')
      }
    });
  } catch (error) {
    throw brandUnavailableError(`Could not fetch brand URL: ${error.message}`);
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw brandUnavailableError('Brand URL redirected without a location.');
    return fetchBrandResource(new URL(location, url).href, acceptedTypes, redirects + 1);
  }
  if (!response.ok) throw brandUnavailableError(`Brand URL returned HTTP ${response.status}.`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !acceptedTypes.includes(contentType)) throw brandUnavailableError(`Unsupported brand resource type "${contentType}".`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_WEB_BYTES) throw brandUnavailableError('Brand resource exceeds the 2 MB limit.');
  return { url: response.url || url.href, body: bytes.toString('utf8'), contentType };
}

async function validateBrandUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw brandSourceError('Enter a valid absolute brand URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw brandSourceError('Brand URLs must use HTTP or HTTPS.');
  if (url.username || url.password) throw brandSourceError('Brand URLs cannot include credentials.');
  if (ALLOW_PRIVATE_URLS) return url;

  let records;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw brandUnavailableError('Could not resolve the brand URL hostname.');
  }
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw brandSourceError('Brand URL resolves to a private or reserved network address.');
  }
  return url;
}

function isPrivateAddress(address) {
  const value = String(address).toLowerCase();
  if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (/^\d+\.\d+\.\d+\.\d+$/.test(value) ? value : '');
  if (!ipv4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || a >= 224;
}

function brandSourceError(message) {
  const error = new Error(message);
  error.code = 'INVALID_BRAND_SOURCE';
  return error;
}

function brandUnavailableError(message) {
  const error = new Error(message);
  error.code = 'BRAND_SOURCE_UNAVAILABLE';
  return error;
}

function extractSources(content) {
  const sources = [];
  content.forEach((block) => {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) return;
    block.content.forEach((result) => {
      if (result.type === 'web_search_result' && result.url) sources.push({ title: result.title || result.url, url: result.url });
    });
  });
  return sources.filter((source, index, items) => items.findIndex((item) => item.url === source.url) === index);
}

async function researchWithClaude(payload) {
  if (!payload.research) return { summary: '', sources: [] };
  const researchRequest = {
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    system: 'Research only when it materially improves the requested carousel. Prefer current, authoritative sources. If the user explicitly asks for a brand treatment, prioritize official brand properties. Return a concise factual research brief for another writer. Do not create carousel copy.',
    messages: [{
      role: 'user',
      content: `Research this carousel request: ${payload.prompt}\nBrand updates are ${payload.allowBrandUpdate ? 'allowed' : 'not allowed'}.`
    }]
  };
  const response = await callAnthropic(JSON.stringify(researchRequest));
  return {
    summary: response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
    sources: extractSources(response.content)
  };
}

async function callClaude(payload, research) {
  const content = [
    ...imageBlocks(payload.images),
    {
      type: 'text',
      text: buildGenerationBrief(payload, research.summary)
    }
  ];
  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: OUTLINE_SCHEMA } }
  });
  const response = await callAnthropic(requestBody);
  return JSON.parse(response.content?.find((block) => block.type === 'text')?.text || '{}');
}

export async function requestHandler(req, res) {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = await readFile(indexPath, 'utf8');
      const configured = html.replace(
        '</head>',
        '<script>window.CAROUSEL_API_URL = "/api/generate-carousel";window.CAROUSEL_DOCUMENT_API_URL = "/api/carousel";window.CAROUSEL_BRAND_API_URL = "/api/brand";</script></head>'
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(configured);
      return;
    }
    if (req.method === 'GET' && req.url === '/renderer.js') {
      const renderer = await readFile(rendererPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(renderer);
      return;
    }
    if (req.method === 'GET' && req.url === '/api/carousel') {
      return sendJson(res, 200, carouselSnapshot());
    }
    if (req.method === 'GET' && req.url === '/api/carousel/validation') {
      const snapshot = carouselSnapshot();
      return sendJson(res, 200, { revision: snapshot.revision, issues: snapshot.validation });
    }
    if (req.method === 'GET' && req.url === '/api/carousel/versions') {
      return sendJson(res, 200, { revision: carouselStore.snapshot().revision, versions: carouselStore.versions() });
    }
    const slideMatch = req.method === 'GET' && req.url.match(/^\/api\/carousel\/slides\/([^/]+)$/);
    if (slideMatch) {
      const snapshot = carouselStore.snapshot();
      const slide = snapshot.document.slides.find((entry) => entry.id === decodeURIComponent(slideMatch[1]));
      if (!slide) return sendJson(res, 404, { error: 'Slide not found.' });
      return sendJson(res, 200, { revision: snapshot.revision, slide });
    }
    const previewMatch = req.method === 'GET' && req.url.match(/^\/api\/carousel\/slides\/([^/]+)\/preview$/);
    if (previewMatch) {
      const preview = previews.get(decodeURIComponent(previewMatch[1]));
      if (!preview) return sendJson(res, 404, { error: 'Preview is not ready. Keep the carousel app open so it can publish rendered slides.' });
      return sendPng(res, preview);
    }
    if (req.method === 'PUT' && req.url === '/api/carousel') {
      const payload = await readJson(req);
      const result = carouselStore.replace(payload.document, {
        baseRevision: payload.baseRevision,
        description: payload.description || 'Edited in browser'
      });
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && req.url === '/api/carousel/operations') {
      const payload = await readJson(req);
      const result = carouselStore.apply(payload.operations, {
        baseRevision: payload.baseRevision,
        description: payload.description,
        mode: payload.mode === 'explore' ? 'explore' : 'edit',
        commit: payload.commit
      });
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && req.url === '/api/carousel/undo') {
      return sendJson(res, 200, carouselStore.undo());
    }
    if (req.method === 'POST' && req.url === '/api/carousel/redo') {
      return sendJson(res, 200, carouselStore.redo());
    }
    if (req.method === 'POST' && req.url === '/api/carousel/restore') {
      const payload = await readJson(req);
      return sendJson(res, 200, carouselStore.restore(payload.versionId));
    }
    if (req.method === 'POST' && req.url === '/api/brand/extract') {
      const payload = await readJson(req);
      return sendJson(res, 200, await extractBrand(payload));
    }
    if (req.method === 'POST' && req.url === '/api/brand/apply') {
      const payload = await readJson(req);
      const patch = brandThemePatch(payload.profile);
      const result = carouselStore.apply([{
        type: 'update_theme',
        changes: { brand: patch }
      }], {
        baseRevision: payload.baseRevision,
        description: payload.description || `Applied ${payload.profile.sourceType || 'extracted'} brand profile`,
        mode: payload.mode === 'explore' ? 'explore' : 'edit',
        commit: payload.commit
      });
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && req.url === '/api/carousel/previews') {
      const payload = await readJson(req);
      if (!Array.isArray(payload.previews)) return sendJson(res, 400, { error: 'previews must be an array.' });
      const currentRevision = carouselStore.snapshot().revision;
      if (Number(payload.revision) !== currentRevision) {
        return sendJson(res, 409, { error: `Preview revision ${payload.revision} is stale; current revision is ${currentRevision}.` });
      }
      previews.clear();
      payload.previews.forEach((preview) => {
        const match = typeof preview.dataUrl === 'string' && preview.dataUrl.match(/^data:image\/png;base64,([a-z0-9+/=]+)$/i);
        if (typeof preview.slideId === 'string' && match) {
          previews.set(preview.slideId, { revision: Number(payload.revision) || 0, data: match[1] });
        }
      });
      layoutDiagnostics.clear();
      if (Array.isArray(payload.diagnostics)) {
        payload.diagnostics.forEach((diagnostic) => {
          if (typeof diagnostic?.slideId === 'string' && Array.isArray(diagnostic.issues)) {
            layoutDiagnostics.set(diagnostic.slideId, diagnostic);
          }
        });
      }
      return sendJson(res, 200, {
        stored: previews.size,
        diagnostics: layoutDiagnostics.size,
        issues: Array.from(layoutDiagnostics.values()).reduce((count, diagnostic) => count + diagnostic.issues.length, 0)
      });
    }
    if (req.method === 'POST' && req.url === '/api/generate-carousel') {
      if (!API_KEY) return sendJson(res, 503, { error: 'Set ANTHROPIC_API_KEY before using AI generation.' });
      const payload = await readJson(req);
      if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) return sendJson(res, 400, { error: 'A prompt is required.' });
      const research = await researchWithClaude(payload);
      const result = await callClaude(payload, research);
      return sendJson(res, 200, { ...result, sources: research.sources });
    }
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, errorStatus(error), errorPayload(error));
  }
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  createServer(requestHandler).listen(PORT, () => console.log(`Carousel Maker running at http://localhost:${PORT}`));
}

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const indexPath = fileURLToPath(new URL('./index.html', import.meta.url));
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    seriesTag: { type: 'string' },
    brand: {
      type: 'object',
      properties: {
        apply: { type: 'boolean' },
        paper: { type: 'string' },
        ink: { type: 'string' },
        accent: { type: 'string' },
        headline: { type: 'string', enum: ['editorial', 'modern', 'display'] },
        body: { type: 'string', enum: ['clean', 'mono'] }
      },
      required: ['apply', 'paper', 'ink', 'accent', 'headline', 'body'],
      additionalProperties: false
    },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          isCover: { type: 'boolean' }
        },
        required: ['title', 'body', 'isCover'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'seriesTag', 'brand', 'slides'],
  additionalProperties: false
};

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
      text: `Create an editable carousel result.\nPrompt: ${payload.prompt}\nRequested flow: ${payload.flow || 'auto'}\nAvailable visual systems: ${(payload.styles || []).join(', ')}\nCurrent brand: ${JSON.stringify(payload.brand || {})}\nBrand changes allowed: ${Boolean(payload.allowBrandUpdate)}\nBrand-only request: ${Boolean(payload.brandOnly)}\nResearch brief: ${research.summary || 'None'} `
    }
  ];
  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system: 'You are an expert social carousel strategist. Create a clear, useful outline with 5 to 8 slides when copy creation is requested. Slide 1 must hook attention, mid-carousel must renew attention or introduce a strong idea, and the final slide must contain a relevant call to action. Each slide must contain one idea. Keep body copy concise and never mention that you are an AI. Only set brand.apply true when brand changes are explicitly allowed and the prompt explicitly asks for colors, fonts, or a named brand treatment. If brand-only is true, return the requested brand patch but do not rewrite or improve slide copy; the client will preserve it. Always return valid values for the requested schema.',
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: OUTLINE_SCHEMA } }
  });
  const response = await callAnthropic(requestBody);
  return JSON.parse(response.content?.find((block) => block.type === 'text')?.text || '{}');
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = await readFile(indexPath, 'utf8');
      const configured = html.replace('</head>', '<script>window.CAROUSEL_API_URL = "/api/generate-carousel";</script></head>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(configured);
      return;
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
    sendJson(res, 500, { error: error.message || 'Unexpected server error.' });
  }
}).listen(PORT, () => console.log(`Carousel Maker running at http://localhost:${PORT}`));

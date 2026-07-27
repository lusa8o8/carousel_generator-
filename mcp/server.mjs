import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:3000/api/carousel';
const SERVER_INFO = { name: 'carousel-maker', version: '0.1.0' };

const TOOLS = [
  {
    name: 'get_carousel',
    description: 'Inspect the current versioned carousel document, revision, and validation issues.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_slide',
    description: 'Inspect one slide by stable slide id or zero-based index.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        index: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'render_slide',
    description: 'Get the latest deterministic PNG preview rendered by the open carousel app.',
    inputSchema: {
      type: 'object',
      properties: {
        slideId: { type: 'string' },
        index: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'apply_operations',
    description: 'Apply validated carousel operations atomically. Edit mode commits; explore mode returns an uncommitted candidate unless commit is true.',
    inputSchema: {
      type: 'object',
      required: ['operations'],
      properties: {
        operations: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            description: 'A domain operation such as update_document, update_theme, update_slide, add_slide, remove_slide, duplicate_slide, reorder_slide, or replace_slides.'
          }
        },
        mode: { type: 'string', enum: ['edit', 'explore'], default: 'edit' },
        commit: { type: 'boolean', default: false },
        description: { type: 'string' },
        baseRevision: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'validate_carousel',
    description: 'Return structural and likely-overflow issues for the current carousel.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'undo',
    description: 'Restore the previous committed carousel version.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'redo',
    description: 'Restore the next carousel version after an undo.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_versions',
    description: 'List available carousel versions and identify the current version.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'restore_version',
    description: 'Restore a named carousel version, creating a new restoration version.',
    inputSchema: {
      type: 'object',
      required: ['versionId'],
      properties: { versionId: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'extract_brand_from_prompt',
    description: 'Extract a normalized brand candidate from direct visual instructions. Explicit colors use a deterministic parser.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        currentBrand: { type: 'object' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'extract_brand_from_image',
    description: 'Extract a normalized brand candidate from up to three base64 PNG, JPEG, GIF, or WebP references.',
    inputSchema: {
      type: 'object',
      required: ['images'],
      properties: {
        prompt: { type: 'string' },
        images: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            required: ['mediaType', 'data'],
            properties: {
              mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] },
              data: { type: 'string' }
            },
            additionalProperties: false
          }
        },
        currentBrand: { type: 'object' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'extract_brand_from_url',
    description: 'Crawl a bounded public brand URL and extract a candidate from captured CSS, metadata, and official asset evidence.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        currentBrand: { type: 'object' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'preview_brand',
    description: 'Return an uncommitted carousel candidate with the supplied brand profile applied.',
    inputSchema: {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: { type: 'object' },
        baseRevision: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'apply_brand',
    description: 'Commit a validated brand profile to the versioned carousel without changing slide copy.',
    inputSchema: {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: { type: 'object' },
        baseRevision: { type: 'integer', minimum: 0 },
        description: { type: 'string' }
      },
      additionalProperties: false
    }
  }
];

export async function callTool(name, args = {}, baseUrl = process.env.CAROUSEL_SERVER_URL || DEFAULT_BASE_URL) {
  switch (name) {
    case 'get_carousel':
      return textResult(await requestJson(baseUrl));
    case 'get_slide': {
      const { slide, revision } = await resolveSlide(args, baseUrl);
      return textResult({ revision, slide });
    }
    case 'render_slide': {
      const { slide, revision } = await resolveSlide(args, baseUrl);
      const response = await fetch(`${baseUrl}/slides/${encodeURIComponent(slide.id)}/preview`);
      if (!response.ok) throw await responseError(response);
      const data = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        content: [
          { type: 'image', data, mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify({ revision, slideId: slide.id, title: slide.title }) }
        ]
      };
    }
    case 'apply_operations':
      return textResult(await requestJson(`${baseUrl}/operations`, {
        method: 'POST',
        body: {
          operations: args.operations,
          mode: args.mode || 'edit',
          commit: Boolean(args.commit),
          description: args.description,
          baseRevision: args.baseRevision
        }
      }));
    case 'validate_carousel':
      return textResult(await requestJson(`${baseUrl}/validation`));
    case 'undo':
      return textResult(await requestJson(`${baseUrl}/undo`, { method: 'POST' }));
    case 'redo':
      return textResult(await requestJson(`${baseUrl}/redo`, { method: 'POST' }));
    case 'list_versions':
      return textResult(await requestJson(`${baseUrl}/versions`));
    case 'restore_version':
      return textResult(await requestJson(`${baseUrl}/restore`, {
        method: 'POST',
        body: { versionId: args.versionId }
      }));
    case 'extract_brand_from_prompt':
      return textResult(await requestJson(`${brandBaseUrl(baseUrl)}/extract`, {
        method: 'POST',
        body: { sourceType: 'prompt', prompt: args.prompt, currentBrand: args.currentBrand }
      }));
    case 'extract_brand_from_image':
      return textResult(await requestJson(`${brandBaseUrl(baseUrl)}/extract`, {
        method: 'POST',
        body: { sourceType: 'image', prompt: args.prompt, images: args.images, currentBrand: args.currentBrand }
      }));
    case 'extract_brand_from_url':
      return textResult(await requestJson(`${brandBaseUrl(baseUrl)}/extract`, {
        method: 'POST',
        body: { sourceType: 'url', url: args.url, currentBrand: args.currentBrand }
      }));
    case 'preview_brand':
      return textResult(await requestJson(`${brandBaseUrl(baseUrl)}/apply`, {
        method: 'POST',
        body: { profile: args.profile, baseRevision: args.baseRevision, mode: 'explore' }
      }));
    case 'apply_brand':
      return textResult(await requestJson(`${brandBaseUrl(baseUrl)}/apply`, {
        method: 'POST',
        body: {
          profile: args.profile,
          baseRevision: args.baseRevision,
          description: args.description,
          mode: 'edit'
        }
      }));
    default:
      throw new Error(`Unknown carousel tool "${name}".`);
  }
}

function brandBaseUrl(baseUrl) {
  return String(baseUrl).replace(/\/api\/carousel\/?$/, '/api/brand');
}

async function resolveSlide(args, baseUrl) {
  const snapshot = await requestJson(baseUrl);
  let slide;
  if (args.slideId) slide = snapshot.document.slides.find((entry) => entry.id === args.slideId);
  else if (Number.isInteger(args.index)) slide = snapshot.document.slides[args.index];
  else throw new Error('Provide slideId or index.');
  if (!slide) throw new Error('Slide not found.');
  return { slide, revision: snapshot.revision };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

async function responseError(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || `Carousel server returned HTTP ${response.status}.`);
  error.code = body.code;
  error.data = body;
  return error;
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

export async function handleMessage(message, baseUrl) {
  if (message.jsonrpc !== '2.0') throw rpcError(-32600, 'Invalid JSON-RPC request.');

  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: message.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return callTool(message.params?.name, message.params?.arguments || {}, baseUrl);
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return undefined;
    default:
      throw rpcError(-32601, `Method "${message.method}" was not found.`);
  }
}

export function runStdioServer(options = {}) {
  const baseUrl = options.baseUrl || process.env.CAROUSEL_SERVER_URL || DEFAULT_BASE_URL;
  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) processLine(line, baseUrl);
      newline = buffer.indexOf('\n');
    }
  });
}

async function processLine(line, baseUrl) {
  let message;
  try {
    message = JSON.parse(line);
    const result = await handleMessage(message, baseUrl);
    if (message.id === undefined || result === undefined) return;
    writeMessage({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    if (message?.id === undefined) return;
    writeMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: error.rpcCode || -32603,
        message: error.message || 'Internal error.',
        data: error.data
      }
    });
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcError(code, message) {
  const error = new Error(message);
  error.rpcCode = code;
  return error;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runStdioServer();
}

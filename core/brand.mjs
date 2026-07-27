import { createHash } from 'node:crypto';

export const BRAND_PROFILE_VERSION = 1;
export const BRAND_EXTRACTOR_VERSION = 'brand-extractor-v2';

const HEX = /^#[0-9a-f]{6}$/i;
const HEADLINE_FONTS = new Set(['editorial', 'modern', 'display']);
const BODY_FONTS = new Set(['clean', 'mono']);

const NAMED_COLORS = new Map([
  ['black', '#000000'],
  ['near-black', '#15130F'],
  ['white', '#FFFFFF'],
  ['warm white', '#F5F0E8'],
  ['warm ivory', '#F4EFE3'],
  ['ivory', '#F4EFE3'],
  ['cream', '#F5F0E8'],
  ['charcoal', '#2B2B2B'],
  ['navy', '#0A1628'],
  ['red', '#E53935'],
  ['coral', '#FF6F61'],
  ['orange', '#F47A38'],
  ['amber', '#D4922A'],
  ['muted gold', '#B89445'],
  ['gold', '#C9972B'],
  ['yellow', '#F4C542'],
  ['lime', '#B7E21A'],
  ['green', '#2E7D32'],
  ['sage', '#B7C2A3'],
  ['teal', '#167D7F'],
  ['cyan', '#00A7C4'],
  ['blue', '#2563EB'],
  ['purple', '#7C3AED'],
  ['violet', '#7C3AED'],
  ['pink', '#EC4899'],
  ['brown', '#6B4423'],
  ['beige', '#E8DDCA'],
  ['tan', '#D2B48C'],
  ['gray', '#808080'],
  ['grey', '#808080']
]);

const COLOR_WORDS = [...NAMED_COLORS.keys()].sort((a, b) => b.length - a.length);
const COLOR_PATTERN = new RegExp(`#[0-9a-f]{3,6}\\b|\\b(?:${COLOR_WORDS.map(escapeRegExp).join('|')})\\b`, 'ig');
const ROLE_PATTERNS = {
  paper: /\b(paper|background|bg|canvas|surface)\b/i,
  ink: /\b(ink|text|type|typography|foreground|copy)\b/i,
  accent: /\b(accent|highlight|signal|primary|brand color)\b/i
};

export function fingerprintBrandInput(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function extractDeterministicPromptBrand(prompt, currentBrand = {}) {
  const text = String(prompt || '').trim();
  if (!text) return null;

  const colors = {};
  const evidence = [];
  const clauses = text.split(/[,;\n]|\band\b/gi).map((part) => part.trim()).filter(Boolean);
  for (const clause of clauses) {
    const role = Object.entries(ROLE_PATTERNS).find(([, pattern]) => pattern.test(clause))?.[0];
    const token = clause.match(COLOR_PATTERN)?.[0];
    if (!role || !token) continue;
    const color = normalizeColor(token);
    if (!color) continue;
    colors[role] = color;
    evidence.push({ kind: 'prompt', source: clause, value: `${role}=${color}` });
  }

  for (const [role, rolePattern] of Object.entries(ROLE_PATTERNS)) {
    if (colors[role]) continue;
    const roleSource = rolePattern.source.replace(/^\\b|\(\?:|\)$/g, '');
    const forward = new RegExp(`${roleSource}[^#a-z0-9]{0,20}(${COLOR_PATTERN.source})`, 'i');
    const backward = new RegExp(`(${COLOR_PATTERN.source})[^#a-z0-9]{0,20}${roleSource}`, 'i');
    const match = text.match(forward) || text.match(backward);
    const token = match?.[1];
    const color = normalizeColor(token);
    if (!color) continue;
    colors[role] = color;
    evidence.push({ kind: 'prompt', source: match[0], value: `${role}=${color}` });
  }

  if (!Object.keys(colors).length) return null;
  const mentionedRoles = Object.entries(ROLE_PATTERNS).filter(([, pattern]) => pattern.test(text)).map(([role]) => role);
  if (mentionedRoles.some((role) => !colors[role])) return null;
  const fontChoices = extractFontChoices(text, currentBrand);
  return createBrandProfile({
    ...currentBrand,
    ...colors,
    ...fontChoices,
    sourceType: 'prompt',
    evidence
  });
}

export function createBrandProfile(input = {}) {
  const paper = normalizeColor(input.paper) || '#FFFFFF';
  const ink = normalizeColor(input.ink) || '#111111';
  const accent = normalizeColor(input.accent) || '#2563EB';
  const warnings = Array.isArray(input.warnings) ? input.warnings.map(String) : [];
  const contrast = contrastRatio(paper, ink);
  if (contrast < 4.5 && !warnings.some((warning) => warning.startsWith('Low text contrast'))) {
    warnings.push(`Low text contrast (${contrast.toFixed(2)}:1); use at least 4.5:1 for normal text.`);
  }
  if (paper === accent && !warnings.includes('Accent matches the paper color.')) warnings.push('Accent matches the paper color.');
  if (ink === accent && !warnings.includes('Accent matches the ink color.')) warnings.push('Accent matches the ink color.');

  const profile = {
    version: BRAND_PROFILE_VERSION,
    paper,
    ink,
    accent,
    headline: HEADLINE_FONTS.has(input.headline) ? input.headline : 'editorial',
    body: BODY_FONTS.has(input.body) ? input.body : 'clean',
    sourceType: ['prompt', 'image', 'url'].includes(input.sourceType) ? input.sourceType : 'prompt',
    evidence: normalizeEvidence(input.evidence),
    warnings,
    confidence: clamp(Number(input.confidence ?? 1), 0, 1),
    extractorVersion: BRAND_EXTRACTOR_VERSION
  };
  profile.fingerprint = input.fingerprint || fingerprintBrandInput(profile);
  return profile;
}

export function assertValidBrandProfile(profile) {
  if (!profile || typeof profile !== 'object') throw brandError('Brand profile must be an object.');
  for (const key of ['paper', 'ink', 'accent']) {
    if (!HEX.test(profile[key] || '')) throw brandError(`${key} must be a six-digit hex color.`);
  }
  if (!HEADLINE_FONTS.has(profile.headline)) throw brandError(`Unsupported headline preset "${profile.headline}".`);
  if (!BODY_FONTS.has(profile.body)) throw brandError(`Unsupported body preset "${profile.body}".`);
  return profile;
}

export function brandThemePatch(profile) {
  assertValidBrandProfile(profile);
  return {
    enabled: true,
    paper: profile.paper.toUpperCase(),
    ink: profile.ink.toUpperCase(),
    accent: profile.accent.toUpperCase(),
    headline: profile.headline,
    body: profile.body
  };
}

export function extractHtmlBrandEvidence(html, baseUrl) {
  const evidence = [];
  const source = String(html || '');
  const metaTheme = source.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["'][^>]*>/i);
  if (normalizeColor(metaTheme?.[1])) evidence.push({ kind: 'theme-color', source: baseUrl, value: normalizeColor(metaTheme[1]) });

  for (const match of source.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    evidence.push({ kind: 'stylesheet', source: absoluteUrl(match[1], baseUrl), value: absoluteUrl(match[1], baseUrl) });
  }
  for (const match of source.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)) {
    evidence.push({ kind: 'stylesheet', source: absoluteUrl(match[1], baseUrl), value: absoluteUrl(match[1], baseUrl) });
  }
  for (const match of source.matchAll(/<(?:link|meta)[^>]+(?:href|content)=["']([^"']+)["'][^>]+(?:icon|logo|og:image)[^>]*>/gi)) {
    evidence.push({ kind: 'brand-asset', source: baseUrl, value: absoluteUrl(match[1], baseUrl) });
  }

  const inlineStyles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  inlineStyles.forEach((css) => evidence.push(...extractCssBrandEvidence(css, `${baseUrl}#inline-style`)));
  return dedupeEvidence(evidence);
}

export function extractCssBrandEvidence(css, source = 'stylesheet') {
  const evidence = [];
  const text = stripCssComments(String(css || ''));
  const rootVariables = extractCssVariables(text, /:root\s*{([^}]*)}/gi, 'css-variable-root', source, evidence);
  extractCssVariables(text, /\.dark\s*{([^}]*)}/gi, 'css-variable-dark', source, evidence);
  const allVariables = extractCssVariables(text, /(?:^|})\s*[^@][^{]*{([^}]*)}/gi, 'css-variable', source, evidence);
  const variables = new Map([...allVariables, ...rootVariables]);

  for (const match of text.matchAll(/(?:^|[}\s])(body|html|:root)\s*{([^}]*)}/gi)) {
    const declarations = match[2];
    const background = declarations.match(/(?:background-color|background)\s*:\s*([^;}]+)/i);
    const color = declarations.match(/(?:^|;)\s*color\s*:\s*([^;}]+)/i);
    const font = declarations.match(/font-family\s*:\s*([^;}]+)/i);
    const backgroundColor = resolveCssColor(background?.[1], variables);
    const textColor = resolveCssColor(color?.[1], variables);
    if (backgroundColor) evidence.push({ kind: 'page-background', source, value: backgroundColor });
    if (textColor) evidence.push({ kind: 'page-text', source, value: textColor });
    if (font?.[1]) evidence.push({ kind: 'font-family', source, value: font[1].trim().slice(0, 160) });
  }
  return dedupeEvidence(evidence);
}

export function profileFromWebEvidence(evidence, input = {}) {
  const items = normalizeEvidence(evidence);
  let paper = findEvidenceColor(items, ['page-background'], [
    /--(?:background|paper|surface|canvas)\b/i
  ]);
  let ink = findEvidenceColor(items, ['page-text'], [
    /--(?:foreground|text|ink|copy)\b/i
  ]);
  let accent = findEvidenceColor(items, ['theme-color'], [
    /--(?:brand|primary)\b/i,
    /--(?:accent|highlight|signal)\b/i
  ]);

  const allColors = items.map((item) => colorFromEvidence(item.value)).filter(Boolean);
  if (!paper && allColors.length) paper = allColors.toSorted((a, b) => luminance(b) - luminance(a))[0];
  if (!ink && allColors.length) ink = allColors.toSorted((a, b) => luminance(a) - luminance(b))[0];
  if (!accent) accent = allColors.find((color) => color !== paper && color !== ink);
  if (!paper || !ink || !accent) return null;

  const fontEvidence = items.filter((item) => item.kind === 'font-family').map((item) => item.value).join(' ');
  const usesMono = /mono/i.test(fontEvidence);
  const usesSans = /sans/i.test(fontEvidence);
  const usesSerif = /(?:^|[,\s"'])serif(?:$|[,\s"'])/i.test(fontEvidence.replace(/sans-serif/gi, ''));
  return createBrandProfile({
    paper,
    ink,
    accent,
    headline: (usesMono || usesSans) && !usesSerif ? 'modern' : (input.headline || 'editorial'),
    body: usesMono ? 'mono' : 'clean',
    sourceType: 'url',
    evidence: items,
    confidence: 0.88
  });
}

export function contrastRatio(first, second) {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

function extractFontChoices(text, currentBrand) {
  let headline = currentBrand.headline || 'editorial';
  let body = currentBrand.body || 'clean';
  if (/\bmodern sans|sans[- ]serif headline|geometric sans\b/i.test(text)) headline = 'modern';
  else if (/\bdisplay serif|bold serif|display type\b/i.test(text)) headline = 'display';
  else if (/\beditorial serif|classic serif|serif headline\b/i.test(text)) headline = 'editorial';
  if (/\bmono(?:space)?|monospaced\b/i.test(text)) body = 'mono';
  else if (/\bclean sans|sans[- ]serif body\b/i.test(text)) body = 'clean';
  return { headline, body };
}

function normalizeColor(value) {
  if (!value) return null;
  const token = String(value).trim().toLowerCase();
  if (NAMED_COLORS.has(token)) return NAMED_COLORS.get(token);
  if (/^#[0-9a-f]{3}$/i.test(token)) {
    return `#${token.slice(1).split('').map((character) => character.repeat(2)).join('')}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(token)) return token.toUpperCase();
  if (/^#[0-9a-f]{8}$/i.test(token)) return token.slice(0, 7).toUpperCase();
  return null;
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return dedupeEvidence(evidence.map((entry) => {
    if (typeof entry === 'string') return { kind: 'note', source: '', value: entry.slice(0, 500) };
    return {
      kind: String(entry?.kind || 'note').slice(0, 80),
      source: String(entry?.source || '').slice(0, 500),
      value: String(entry?.value || '').slice(0, 500)
    };
  }).filter((entry) => entry.value));
}

function findEvidenceColor(evidence, preferredKinds, variablePatterns) {
  const preferred = evidence.find((item) => preferredKinds.includes(item.kind) && colorFromEvidence(item.value));
  if (preferred) return colorFromEvidence(preferred.value);
  for (const pattern of variablePatterns) {
    const rootVariable = evidence.find((item) =>
      item.kind === 'css-variable-root' && pattern.test(item.value) && colorFromEvidence(item.value)
    );
    if (rootVariable) return colorFromEvidence(rootVariable.value);
    const variable = evidence.find((item) =>
      item.kind === 'css-variable' && pattern.test(item.value) && colorFromEvidence(item.value)
    );
    if (variable) return colorFromEvidence(variable.value);
  }
  return null;
}

function colorFromEvidence(value) {
  return normalizeColor(String(value || '').match(/#[0-9a-f]{3,8}\b/i)?.[0]);
}

function extractCssVariables(text, blockPattern, kind, source, evidence) {
  const variables = new Map();
  for (const block of text.matchAll(blockPattern)) {
    for (const match of block[1].matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}]+)/gi)) {
      const color = parseCssColor(match[2]);
      if (!color) continue;
      variables.set(`--${match[1]}`, color);
      evidence.push({ kind, source, value: `--${match[1]}=${color}` });
    }
  }
  return variables;
}

function resolveCssColor(value, variables) {
  const direct = parseCssColor(value);
  if (direct) return direct;
  const variableName = String(value || '').match(/var\(\s*(--[a-z0-9_-]+)\s*\)/i)?.[1];
  return variableName ? variables.get(variableName) || null : null;
}

function parseCssColor(value) {
  const text = String(value || '').trim();
  const hex = text.match(/#[0-9a-f]{3,8}\b/i)?.[0];
  if (hex) return normalizeColor(hex);

  const rgb = text.match(/rgba?\(\s*([\d.]+)%?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+)%?)?\s*\)/i);
  if (rgb) {
    const usesPercent = /%/.test(rgb[0].split(/[\/,)]/)[0]);
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[0].includes(`${rgb[4]}%`) ? 100 : 1);
    if (alpha <= 0) return null;
    const channels = [rgb[1], rgb[2], rgb[3]].map((channel) =>
      clamp(Math.round(Number(channel) * (usesPercent ? 2.55 : 1)), 0, 255)
    );
    return rgbToHex(channels);
  }

  const hsl = text.match(/(?:hsla?\(\s*)?(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,\/]+([\d.]+)%?)?\s*\)?$/i);
  if (!hsl) return null;
  const alpha = hsl[4] === undefined ? 1 : Number(hsl[4]) / (text.includes(`${hsl[4]}%`) ? 100 : 1);
  if (alpha <= 0) return null;
  return hslToHex(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
}

function hslToHex(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation / 100, 0, 1);
  const l = clamp(lightness / 100, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = h / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let channels;
  if (segment < 1) channels = [chroma, secondary, 0];
  else if (segment < 2) channels = [secondary, chroma, 0];
  else if (segment < 3) channels = [0, chroma, secondary];
  else if (segment < 4) channels = [0, secondary, chroma];
  else if (segment < 5) channels = [secondary, 0, chroma];
  else channels = [chroma, 0, secondary];
  const offset = l - chroma / 2;
  return rgbToHex(channels.map((channel) => Math.round((channel + offset) * 255)));
}

function rgbToHex(channels) {
  return `#${channels.map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function luminance(color) {
  const normalized = normalizeColor(color) || '#000000';
  const channels = [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return String(value || '');
  }
}

function dedupeEvidence(items) {
  return items.filter((item, index, all) => all.findIndex((candidate) =>
    candidate.kind === item.kind && candidate.source === item.source && candidate.value === item.value
  ) === index);
}

function stripCssComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function brandError(message) {
  const error = new Error(message);
  error.code = 'INVALID_BRAND_PROFILE';
  return error;
}

export const BRAND_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    paper: { type: 'string', description: 'Six-digit hex color for the main slide background.' },
    ink: { type: 'string', description: 'Six-digit hex color for readable primary text.' },
    accent: { type: 'string', description: 'Six-digit hex color for emphasis and small labels.' },
    headline: { type: 'string', enum: ['editorial', 'modern', 'display'] },
    body: { type: 'string', enum: ['clean', 'mono'] },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          source: { type: 'string' },
          value: { type: 'string' }
        },
        required: ['kind', 'source', 'value'],
        additionalProperties: false
      }
    },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' }
  },
  required: ['paper', 'ink', 'accent', 'headline', 'body', 'evidence', 'warnings', 'confidence'],
  additionalProperties: false
};

export const BRAND_EXTRACTION_SYSTEM_PROMPT = [
  'Extract one restrained carousel brand profile from the supplied source.',
  'Return colors as six-digit hex values.',
  'Paper is the primary slide background, ink is readable primary text, and accent is a distinct emphasis color.',
  'Preserve explicit colors exactly.',
  'For images, prioritize deliberate repeated brand colors over incidental photographic colors.',
  'For website evidence, prioritize declared CSS variables, page background/text rules, theme-color, and official assets.',
  'Map typography only to the supplied headline and body enums; do not claim exact font identification from pixels.',
  'Include short evidence records and disclose ambiguity in warnings.',
  'Always ensure paper and ink are readable together.'
].join(' ');

export function buildBrandExtractionBrief(payload) {
  const sourceType = payload.sourceType || 'prompt';
  const parts = [
    `Source type: ${sourceType}`,
    `Current brand: ${JSON.stringify(payload.currentBrand || {})}`
  ];
  if (sourceType === 'prompt') parts.push(`Brand direction: ${payload.prompt || ''}`);
  if (sourceType === 'image') parts.push(`Image guidance: ${payload.prompt || 'Extract the intentional visual identity from the supplied references.'}`);
  if (sourceType === 'image' && payload.imageEvidence?.length) {
    parts.push(`Deterministically sampled palettes: ${JSON.stringify(payload.imageEvidence)}`);
    parts.push('Choose paper, ink, and accent exactly from these sampled hex values. Do not estimate replacement hex values.');
  }
  if (sourceType === 'url') {
    parts.push(`Brand URL: ${payload.url || ''}`);
    parts.push(`Captured evidence: ${JSON.stringify(payload.webEvidence || [])}`);
  }
  return parts.join('\n');
}

export const OUTLINE_SCHEMA = {
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
          isCover: {
            type: 'boolean',
            description: 'True for exactly the first hook slide and final call-to-action slide; false for every middle slide.'
          }
        },
        required: ['title', 'body', 'isCover'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'seriesTag', 'brand', 'slides'],
  additionalProperties: false
};

export const GENERATION_SYSTEM_PROMPT = [
  'You are an expert social carousel strategist.',
  'Create a clear, useful outline with 5 to 8 slides.',
  'Slide 1 is the hook and must set isCover true.',
  'Every middle slide must set isCover false.',
  'The final slide is a dedicated call-to-action slide, must set isCover true, and must use an imperative action such as save, try, start, apply, share, or follow rather than introducing another lesson.',
  'The middle must renew attention or introduce a strong idea.',
  'Each slide must contain one idea.',
  'Keep body copy concise and never mention that you are an AI.',
  'Only set brand.apply true when brand changes are explicitly allowed and the prompt explicitly asks for colors, fonts, or a named brand treatment.',
  'If brand-only is true, return the requested brand patch but do not rewrite or improve slide copy; the client will preserve it.',
  'Always return valid values for the requested schema.'
].join(' ');

export function buildGenerationBrief(payload, researchSummary = '') {
  return [
    'Create an editable carousel result.',
    `Prompt: ${payload.prompt}`,
    `Requested flow: ${payload.flow || 'auto'}`,
    `Available visual systems: ${(payload.styles || []).join(', ')}`,
    `Current brand: ${JSON.stringify(payload.brand || {})}`,
    `Brand changes allowed: ${Boolean(payload.allowBrandUpdate)}`,
    `Brand-only request: ${Boolean(payload.brandOnly)}`,
    `Research brief: ${researchSummary || 'None'}`
  ].join('\n');
}

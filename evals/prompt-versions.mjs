import { GENERATION_SYSTEM_PROMPT, OUTLINE_SCHEMA } from '../outputs/prompt-contract.mjs';

const BASELINE_SYSTEM_PROMPT = [
  'You are an expert social carousel strategist.',
  'Create a clear, useful outline with 5 to 8 slides when copy creation is requested.',
  'Slide 1 must hook attention, the middle must renew attention or introduce a strong idea, and the final slide must contain a relevant call to action.',
  'Each slide must contain one idea.',
  'Keep body copy concise and never mention that you are an AI.',
  'Only set brand.apply true when brand changes are explicitly allowed and the prompt explicitly asks for colors, fonts, or a named brand treatment.',
  'If brand-only is true, return the requested brand patch but do not rewrite or improve slide copy; the client will preserve it.',
  'Always return valid values for the requested schema.'
].join(' ');

const EXPLICIT_STRUCTURE_SYSTEM_PROMPT = [
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

const baselineSchema = structuredClone(OUTLINE_SCHEMA);
delete baselineSchema.properties.slides.items.properties.isCover.description;

export const PROMPT_VERSIONS = {
  'baseline-v1': {
    label: 'baseline-v1',
    systemPrompt: BASELINE_SYSTEM_PROMPT,
    schema: baselineSchema,
    change: 'Original concise strategy prompt and schema.'
  },
  'explicit-structure-v2': {
    label: 'explicit-structure-v2',
    systemPrompt: EXPLICIT_STRUCTURE_SYSTEM_PROMPT,
    schema: baselineSchema,
    change: 'Adds explicit first/middle/final slide and CTA requirements.'
  },
  'contract-schema-v3': {
    label: 'contract-schema-v3',
    systemPrompt: GENERATION_SYSTEM_PROMPT,
    schema: OUTLINE_SCHEMA,
    change: 'Adds schema-level isCover role guidance to v2 while code graders enforce counts and lengths.'
  }
};

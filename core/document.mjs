import { randomUUID } from 'node:crypto';

export const DOCUMENT_VERSION = 1;
export const FORMATS = new Set(['ig_square', 'ig_portrait', 'ig_story', 'linkedin', 'pinterest', 'twitter', 'poster_a4', 'poster_letter', 'poster_18x24']);
export const PALETTES = new Set(['oat', 'ink', 'bone']);
export const HEADLINE_FONTS = new Set(['editorial', 'modern', 'display']);
export const BODY_FONTS = new Set(['clean', 'mono']);

const DEFAULT_SLIDES = [
  { title: '5 Ways to Actually Stick to a Morning Routine', body: '', isCover: true },
  { title: 'Prep the night before', body: 'Lay out clothes, pack your bag, decide breakfast. Remove every decision from your groggy 6am brain.', isCover: false },
  { title: 'Anchor it to something you already do', body: 'Attach the new habit to brushing your teeth or making coffee. Existing routines are free scaffolding.', isCover: false },
  { title: 'Make the first step tiny', body: 'Not "meditate for 20 minutes." Just "sit on the cushion." Momentum starts after you begin.', isCover: false },
  { title: 'Track streaks, not perfection', body: "One missed day isn't failure. Two in a row is the pattern to interrupt.", isCover: false },
  { title: 'Follow for more focus tips', body: '', isCover: true }
];

export function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function clone(value) {
  return structuredClone(value);
}

export function createSlide(input = {}) {
  return {
    id: typeof input.id === 'string' && input.id ? input.id : createId('slide'),
    title: String(input.title || 'Untitled slide'),
    body: String(input.body || ''),
    isCover: Boolean(input.isCover),
    layout: {
      titleScale: numberOr(input.layout?.titleScale, 1),
      bodyScale: numberOr(input.layout?.bodyScale, 1),
      align: ['left', 'center'].includes(input.layout?.align) ? input.layout.align : 'left'
    }
  };
}

export function createCarouselDocument(input = {}) {
  const slides = Array.isArray(input.slides) && input.slides.length ? input.slides : DEFAULT_SLIDES;
  return {
    version: DOCUMENT_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : createId('carousel'),
    title: String(input.title || 'Untitled carousel'),
    category: ['carousel', 'poster'].includes(input.category) ? input.category : 'carousel',
    seriesTag: String(input.seriesTag || 'FOCUS NOTES'),
    handle: String(input.handle || '@yourhandle'),
    format: FORMATS.has(input.format) ? input.format : 'ig_square',
    theme: {
      palette: PALETTES.has(input.theme?.palette) ? input.theme.palette : 'oat',
      style: 'editorial',
      showMargin: input.theme?.showMargin !== false,
      brand: {
        enabled: Boolean(input.theme?.brand?.enabled),
        paper: colorOr(input.theme?.brand?.paper, '#EFE9DA'),
        ink: colorOr(input.theme?.brand?.ink, '#212B21'),
        accent: colorOr(input.theme?.brand?.accent, '#C08A28'),
        headline: HEADLINE_FONTS.has(input.theme?.brand?.headline) ? input.theme.brand.headline : 'editorial',
        body: BODY_FONTS.has(input.theme?.brand?.body) ? input.theme.brand.body : 'clean'
      }
    },
    slides: slides.map(createSlide)
  };
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function colorOr(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

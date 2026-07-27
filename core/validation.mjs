import { BODY_FONTS, DOCUMENT_VERSION, FORMATS, HEADLINE_FONTS, PALETTES } from './document.mjs';

const COLOR = /^#[0-9a-f]{6}$/i;

export function validateCarousel(document) {
  const issues = [];
  const issue = (path, code, message, severity = 'error') => issues.push({ path, code, message, severity });

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    issue('$', 'invalid_document', 'Carousel must be an object.');
    return issues;
  }

  if (document.version !== DOCUMENT_VERSION) issue('version', 'unsupported_version', `Expected document version ${DOCUMENT_VERSION}.`);
  if (!nonEmpty(document.id)) issue('id', 'required', 'Carousel id is required.');
  if (!nonEmpty(document.title)) issue('title', 'required', 'Carousel title is required.');
  if (!nonEmpty(document.seriesTag)) issue('seriesTag', 'required', 'Series tag is required.');
  if (typeof document.handle !== 'string') issue('handle', 'invalid_type', 'Handle must be a string.');
  if (!FORMATS.has(document.format)) issue('format', 'invalid_format', `Unsupported format "${document.format}".`);

  const theme = document.theme;
  if (!theme || typeof theme !== 'object') {
    issue('theme', 'required', 'Theme is required.');
  } else {
    if (!PALETTES.has(theme.palette)) issue('theme.palette', 'invalid_palette', `Unsupported palette "${theme.palette}".`);
    if (theme.style !== 'editorial') issue('theme.style', 'invalid_style', 'Only the editorial visual system is supported.');
    if (typeof theme.showMargin !== 'boolean') issue('theme.showMargin', 'invalid_type', 'showMargin must be boolean.');
    validateBrand(theme.brand, issue);
  }

  if (!Array.isArray(document.slides) || !document.slides.length) {
    issue('slides', 'required', 'At least one slide is required.');
    return issues;
  }

  const ids = new Set();
  document.slides.forEach((slide, index) => {
    const path = `slides[${index}]`;
    if (!slide || typeof slide !== 'object') {
      issue(path, 'invalid_slide', 'Slide must be an object.');
      return;
    }
    if (!nonEmpty(slide.id)) issue(`${path}.id`, 'required', 'Slide id is required.');
    else if (ids.has(slide.id)) issue(`${path}.id`, 'duplicate_id', `Duplicate slide id "${slide.id}".`);
    else ids.add(slide.id);
    if (!nonEmpty(slide.title)) issue(`${path}.title`, 'required', 'Slide title is required.');
    if (typeof slide.body !== 'string') issue(`${path}.body`, 'invalid_type', 'Slide body must be a string.');
    if (typeof slide.isCover !== 'boolean') issue(`${path}.isCover`, 'invalid_type', 'isCover must be boolean.');
    if (slide.title?.length > 240) issue(`${path}.title`, 'likely_overflow', 'Title exceeds 240 characters.', 'warning');
    if (slide.body?.length > 700) issue(`${path}.body`, 'likely_overflow', 'Body exceeds 700 characters.', 'warning');
    validateLayout(slide.layout, path, issue);
  });

  if (document.category !== 'poster') {
    if (!document.slides[0]?.isCover) issue('slides[0].isCover', 'cover_expected', 'The first slide should use the cover layout.', 'warning');
    if (!document.slides.at(-1)?.isCover) issue(`slides[${document.slides.length - 1}].isCover`, 'cover_expected', 'The final slide should use the cover layout.', 'warning');
  }
  return issues;
}

export function assertValidCarousel(document) {
  const issues = validateCarousel(document);
  const errors = issues.filter((entry) => entry.severity === 'error');
  if (errors.length) {
    const error = new Error(errors.map((entry) => `${entry.path}: ${entry.message}`).join(' '));
    error.code = 'INVALID_CAROUSEL';
    error.issues = issues;
    throw error;
  }
  return issues;
}

function validateBrand(brand, issue) {
  if (!brand || typeof brand !== 'object') {
    issue('theme.brand', 'required', 'Brand settings are required.');
    return;
  }
  if (typeof brand.enabled !== 'boolean') issue('theme.brand.enabled', 'invalid_type', 'Brand enabled must be boolean.');
  for (const key of ['paper', 'ink', 'accent']) {
    if (!COLOR.test(brand[key] || '')) issue(`theme.brand.${key}`, 'invalid_color', `${key} must be a six-digit hex color.`);
  }
  if (!HEADLINE_FONTS.has(brand.headline)) issue('theme.brand.headline', 'invalid_font', `Unsupported headline font "${brand.headline}".`);
  if (!BODY_FONTS.has(brand.body)) issue('theme.brand.body', 'invalid_font', `Unsupported body font "${brand.body}".`);
}

function validateLayout(layout, slidePath, issue) {
  if (!layout || typeof layout !== 'object') {
    issue(`${slidePath}.layout`, 'required', 'Slide layout settings are required.');
    return;
  }
  if (!Number.isFinite(layout.titleScale) || layout.titleScale < 0.5 || layout.titleScale > 1.8) {
    issue(`${slidePath}.layout.titleScale`, 'out_of_range', 'Title scale must be between 0.5 and 1.8.');
  }
  if (!Number.isFinite(layout.bodyScale) || layout.bodyScale < 0.5 || layout.bodyScale > 1.8) {
    issue(`${slidePath}.layout.bodyScale`, 'out_of_range', 'Body scale must be between 0.5 and 1.8.');
  }
  if (!['left', 'center'].includes(layout.align)) issue(`${slidePath}.layout.align`, 'invalid_alignment', 'Alignment must be left or center.');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

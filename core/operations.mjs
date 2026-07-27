import { clone, createSlide } from './document.mjs';
import { assertValidCarousel } from './validation.mjs';

const DOCUMENT_FIELDS = new Set(['title', 'seriesTag', 'handle', 'format']);
const THEME_FIELDS = new Set(['palette', 'showMargin']);
const BRAND_FIELDS = new Set(['enabled', 'paper', 'ink', 'accent', 'headline', 'body']);
const SLIDE_FIELDS = new Set(['title', 'body', 'isCover', 'layout']);

export function applyOperations(source, operations) {
  if (!Array.isArray(operations) || !operations.length) throw operationError('At least one operation is required.');
  const document = clone(source);

  operations.forEach((operation, index) => {
    try {
      applyOperation(document, operation);
      assertValidCarousel(document);
    } catch (error) {
      error.operationIndex = index;
      error.operation = operation;
      throw error;
    }
  });

  return document;
}

export function applyOperation(document, operation) {
  if (!operation || typeof operation !== 'object') throw operationError('Operation must be an object.');

  switch (operation.type) {
    case 'update_document':
      assignAllowed(document, operation.changes, DOCUMENT_FIELDS);
      break;
    case 'update_theme':
      assignAllowed(document.theme, operation.changes, THEME_FIELDS);
      if (operation.changes?.brand) assignAllowed(document.theme.brand, operation.changes.brand, BRAND_FIELDS);
      break;
    case 'update_slide': {
      const slide = findSlide(document, operation.slideId);
      assignAllowed(slide, operation.changes, SLIDE_FIELDS);
      if (operation.changes?.layout) slide.layout = { ...slide.layout, ...operation.changes.layout };
      break;
    }
    case 'add_slide': {
      const slide = createSlide(operation.slide);
      const index = insertionIndex(document, operation.afterSlideId);
      document.slides.splice(index, 0, slide);
      break;
    }
    case 'remove_slide': {
      if (document.slides.length === 1) throw operationError('A carousel must keep at least one slide.');
      const index = slideIndex(document, operation.slideId);
      document.slides.splice(index, 1);
      break;
    }
    case 'duplicate_slide': {
      const index = slideIndex(document, operation.slideId);
      const duplicate = createSlide(clone(document.slides[index]));
      document.slides.splice(index + 1, 0, duplicate);
      break;
    }
    case 'reorder_slide': {
      const from = slideIndex(document, operation.slideId);
      const to = Number(operation.toIndex);
      if (!Number.isInteger(to) || to < 0 || to >= document.slides.length) throw operationError('toIndex is outside the slide range.');
      const [slide] = document.slides.splice(from, 1);
      document.slides.splice(to, 0, slide);
      break;
    }
    case 'replace_slides': {
      if (!Array.isArray(operation.slides) || !operation.slides.length) throw operationError('replace_slides requires at least one slide.');
      document.slides = operation.slides.map(createSlide);
      break;
    }
    default:
      throw operationError(`Unsupported operation type "${operation.type}".`);
  }

  return document;
}

function assignAllowed(target, changes, allowed) {
  if (!changes || typeof changes !== 'object') throw operationError('Operation changes must be an object.');
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'brand' || key === 'layout') continue;
    if (!allowed.has(key)) throw operationError(`Property "${key}" cannot be changed by this operation.`);
    target[key] = value;
  }
}

function findSlide(document, slideId) {
  return document.slides[slideIndex(document, slideId)];
}

function slideIndex(document, slideId) {
  const index = document.slides.findIndex((slide) => slide.id === slideId);
  if (index === -1) throw operationError(`Slide "${slideId}" was not found.`);
  return index;
}

function insertionIndex(document, afterSlideId) {
  if (!afterSlideId) return document.slides.length;
  return slideIndex(document, afterSlideId) + 1;
}

function operationError(message) {
  const error = new Error(message);
  error.code = 'INVALID_OPERATION';
  return error;
}

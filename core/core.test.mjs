import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarouselDocument } from './document.mjs';
import { applyOperations } from './operations.mjs';
import { CarouselStore } from './store.mjs';
import { validateCarousel } from './validation.mjs';

test('creates a valid versioned document', () => {
  const document = createCarouselDocument();
  assert.equal(document.version, 1);
  assert.equal(validateCarousel(document).filter((issue) => issue.severity === 'error').length, 0);
});

test('applies a scoped slide edit without changing unrelated fields', () => {
  const source = createCarouselDocument();
  const target = source.slides[1];
  const result = applyOperations(source, [{
    type: 'update_slide',
    slideId: target.id,
    changes: { title: 'A tighter title' }
  }]);

  assert.equal(result.slides[1].title, 'A tighter title');
  assert.equal(result.slides[1].body, source.slides[1].body);
  assert.equal(source.slides[1].title, target.title);
});

test('rejects invalid properties atomically', () => {
  const source = createCarouselDocument();
  assert.throws(() => applyOperations(source, [{
    type: 'update_slide',
    slideId: source.slides[0].id,
    changes: { executableCode: 'nope' }
  }]), /cannot be changed/);
});

test('supports undo, redo, restoration, and uncommitted exploration', () => {
  const store = new CarouselStore(createCarouselDocument());
  const slideId = store.snapshot().document.slides[0].id;
  const initialTitle = store.snapshot().document.slides[0].title;

  const explored = store.apply([{
    type: 'update_slide',
    slideId,
    changes: { title: 'Candidate title' }
  }], { mode: 'explore' });
  assert.equal(explored.committed, false);
  assert.equal(store.snapshot().document.slides[0].title, initialTitle);

  store.apply([{
    type: 'update_slide',
    slideId,
    changes: { title: 'Committed title' }
  }]);
  assert.equal(store.snapshot().document.slides[0].title, 'Committed title');
  store.undo();
  assert.equal(store.snapshot().document.slides[0].title, initialTitle);
  store.redo();
  assert.equal(store.snapshot().document.slides[0].title, 'Committed title');
});

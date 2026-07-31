import test from 'node:test';
import assert from 'node:assert/strict';

await import('../outputs/carousel-repository.js');

const {
  MemoryCarouselRepository,
  createCarouselRecord,
  duplicateCarouselRecord
} = globalThis.CarouselPersistence;

function document(id = 'carousel-1', title = 'First carousel') {
  return { version: 1, id, title, slides: [{ id: 'slide-1', title: 'Cover' }] };
}

test('carousel records retain stable creation timestamps across saves', async () => {
  const repository = new MemoryCarouselRepository();
  const first = await repository.save(document());
  const second = await repository.save({ ...document(), title: 'Changed' });
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.name, 'Changed');
});

test('repository lists the most recently updated carousel first', async () => {
  const repository = new MemoryCarouselRepository();
  await repository.save(document('older'), { updatedAt: '2026-01-01T00:00:00.000Z' });
  await repository.save(document('newer'), { updatedAt: '2026-02-01T00:00:00.000Z' });
  assert.deepEqual((await repository.list()).map((record) => record.id), ['newer', 'older']);
});

test('duplicate records receive a new document id and independent data', () => {
  const source = createCarouselRecord(document());
  const duplicate = duplicateCarouselRecord(source, 'carousel-2', 'Second carousel');
  duplicate.document.slides[0].title = 'Changed duplicate';
  assert.equal(duplicate.id, 'carousel-2');
  assert.equal(duplicate.document.title, 'Second carousel');
  assert.equal(source.document.slides[0].title, 'Cover');
});

test('repository metadata tracks active document and migrations', async () => {
  const repository = new MemoryCarouselRepository();
  await repository.setMeta('activeCarouselId', 'carousel-1');
  await repository.setMeta('legacyMigration', { completed: true });
  assert.equal(await repository.getMeta('activeCarouselId'), 'carousel-1');
  assert.deepEqual(await repository.getMeta('legacyMigration'), { completed: true });
});

import { clone, createCarouselDocument } from './document.mjs';
import { applyOperations } from './operations.mjs';
import { assertValidCarousel, validateCarousel } from './validation.mjs';

export class CarouselStore {
  #document;
  #revision = 0;
  #versions = [];
  #cursor = -1;
  #onChange;

  constructor(document, options = {}) {
    this.#document = createCarouselDocument(document);
    assertValidCarousel(this.#document);
    this.#onChange = options.onChange;
    this.#record(options.description || 'Initial carousel');
  }

  snapshot() {
    return {
      revision: this.#revision,
      document: clone(this.#document),
      validation: validateCarousel(this.#document)
    };
  }

  replace(document, options = {}) {
    this.#checkRevision(options.baseRevision);
    const next = createCarouselDocument(document);
    assertValidCarousel(next);
    this.#document = next;
    return this.#commit(options.description || 'Updated carousel');
  }

  apply(operations, options = {}) {
    this.#checkRevision(options.baseRevision);
    const candidate = applyOperations(this.#document, operations);
    const validation = validateCarousel(candidate);

    if (options.mode === 'explore' && options.commit !== true) {
      return {
        revision: this.#revision,
        committed: false,
        mode: 'explore',
        document: clone(candidate),
        validation
      };
    }

    this.#document = candidate;
    const snapshot = this.#commit(options.description || summarizeOperations(operations));
    return { ...snapshot, committed: true, mode: options.mode || 'edit' };
  }

  undo() {
    if (this.#cursor <= 0) return this.snapshot();
    this.#cursor -= 1;
    this.#document = clone(this.#versions[this.#cursor].document);
    return this.#changed();
  }

  redo() {
    if (this.#cursor >= this.#versions.length - 1) return this.snapshot();
    this.#cursor += 1;
    this.#document = clone(this.#versions[this.#cursor].document);
    return this.#changed();
  }

  restore(versionId) {
    const index = this.#versions.findIndex((version) => version.id === versionId);
    if (index === -1) {
      const error = new Error(`Version "${versionId}" was not found.`);
      error.code = 'VERSION_NOT_FOUND';
      throw error;
    }
    this.#document = clone(this.#versions[index].document);
    return this.#commit(`Restored ${versionId}`);
  }

  versions() {
    return this.#versions.map(({ document, ...version }, index) => ({
      ...version,
      current: index === this.#cursor
    }));
  }

  #checkRevision(baseRevision) {
    if (baseRevision === undefined || baseRevision === null) return;
    if (Number(baseRevision) !== this.#revision) {
      const error = new Error(`Revision conflict: expected ${this.#revision}, received ${baseRevision}.`);
      error.code = 'REVISION_CONFLICT';
      error.current = this.snapshot();
      throw error;
    }
  }

  #commit(description) {
    if (this.#cursor < this.#versions.length - 1) this.#versions.splice(this.#cursor + 1);
    this.#record(description);
    return this.#changed(false);
  }

  #record(description) {
    this.#revision += 1;
    const id = `version-${this.#revision}`;
    this.#versions.push({
      id,
      revision: this.#revision,
      description,
      createdAt: new Date().toISOString(),
      document: clone(this.#document)
    });
    this.#cursor = this.#versions.length - 1;
  }

  #changed(incrementRevision = true) {
    if (incrementRevision) this.#revision += 1;
    const snapshot = this.snapshot();
    this.#onChange?.(snapshot);
    return snapshot;
  }
}

function summarizeOperations(operations) {
  if (operations.length === 1) return operations[0].type.replaceAll('_', ' ');
  return `${operations.length} carousel edits`;
}

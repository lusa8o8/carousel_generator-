(function exposeCarouselRepository(root) {
  const DATABASE_NAME = 'carousel-maker';
  const DATABASE_VERSION = 1;
  const CAROUSEL_STORE = 'carousels';
  const META_STORE = 'meta';
  const ASSET_STORE = 'assets';
  const OUTBOX_STORE = 'outbox';

  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createCarouselRecord(document, metadata = {}, existing = null) {
    if (!document || typeof document !== 'object' || !document.id) {
      throw new Error('A carousel document with a stable id is required.');
    }
    const timestamp = nowIso();
    return {
      id: document.id,
      name: String(metadata.name || document.title || existing?.name || 'Untitled carousel').trim() || 'Untitled carousel',
      createdAt: existing?.createdAt || metadata.createdAt || timestamp,
      updatedAt: metadata.updatedAt || timestamp,
      source: metadata.source || existing?.source || 'local',
      document: clone(document)
    };
  }

  function duplicateCarouselRecord(record, id, name) {
    if (!record?.document || !id) throw new Error('A source record and new id are required.');
    const document = clone(record.document);
    document.id = id;
    document.title = String(name || `${record.name || 'Untitled carousel'} copy`);
    return createCarouselRecord(document, {
      name: document.title,
      source: 'duplicate'
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    });
  }

  function openDatabase(indexedDb = root.indexedDB) {
    if (!indexedDb) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CAROUSEL_STORE)) {
          const store = database.createObjectStore(CAROUSEL_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          database.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab.'));
    });
  }

  class IndexedDbCarouselRepository {
    constructor(options = {}) {
      this.indexedDb = options.indexedDB || root.indexedDB;
      this.databasePromise = null;
    }

    database() {
      if (!this.databasePromise) this.databasePromise = openDatabase(this.indexedDb);
      return this.databasePromise;
    }

    async list() {
      const database = await this.database();
      const transaction = database.transaction(CAROUSEL_STORE, 'readonly');
      const records = await requestResult(transaction.objectStore(CAROUSEL_STORE).getAll());
      await transactionDone(transaction);
      return records.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    async get(id) {
      if (!id) return null;
      const database = await this.database();
      const transaction = database.transaction(CAROUSEL_STORE, 'readonly');
      const record = await requestResult(transaction.objectStore(CAROUSEL_STORE).get(id));
      await transactionDone(transaction);
      return record ? clone(record) : null;
    }

    async save(document, metadata = {}) {
      const existing = await this.get(document.id);
      const record = createCarouselRecord(document, metadata, existing);
      const database = await this.database();
      const transaction = database.transaction(CAROUSEL_STORE, 'readwrite');
      transaction.objectStore(CAROUSEL_STORE).put(record);
      await transactionDone(transaction);
      return clone(record);
    }

    async remove(id) {
      const database = await this.database();
      const transaction = database.transaction(CAROUSEL_STORE, 'readwrite');
      transaction.objectStore(CAROUSEL_STORE).delete(id);
      await transactionDone(transaction);
    }

    async getMeta(key) {
      const database = await this.database();
      const transaction = database.transaction(META_STORE, 'readonly');
      const record = await requestResult(transaction.objectStore(META_STORE).get(key));
      await transactionDone(transaction);
      return record?.value;
    }

    async setMeta(key, value) {
      const database = await this.database();
      const transaction = database.transaction(META_STORE, 'readwrite');
      transaction.objectStore(META_STORE).put({ key, value: clone(value) });
      await transactionDone(transaction);
    }
  }

  class MemoryCarouselRepository {
    constructor() {
      this.records = new Map();
      this.metadata = new Map();
    }

    async list() {
      return [...this.records.values()]
        .map(clone)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    async get(id) {
      const record = this.records.get(id);
      return record ? clone(record) : null;
    }

    async save(document, metadata = {}) {
      const record = createCarouselRecord(document, metadata, this.records.get(document.id));
      this.records.set(record.id, record);
      return clone(record);
    }

    async remove(id) {
      this.records.delete(id);
    }

    async getMeta(key) {
      return clone(this.metadata.get(key));
    }

    async setMeta(key, value) {
      this.metadata.set(key, clone(value));
    }
  }

  root.CarouselPersistence = {
    IndexedDbCarouselRepository,
    MemoryCarouselRepository,
    createCarouselRecord,
    duplicateCarouselRecord
  };
})(globalThis);

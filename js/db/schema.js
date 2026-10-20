// IndexedDB schema definition and migrations.
import { CONFIG } from '../config.js';

export const DB_NAME = `${CONFIG.APP_ID}_pos`;
export const DB_VERSION = 1;

// Stores that make up the business data (included in backups).
export const DATA_STORES = ['customers', 'tickets', 'meta'];

const STORES = {
  meta: { keyPath: 'key', indexes: {} },
  customers: { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  // One ticket = one customer order (garments, service, pickup date, payments, status history).
  tickets: {
    indexes: {
      number: ['number', true], status: 'status', customerId: 'customerId', dueDate: 'dueDate', createdAt: 'createdAt',
    },
  },
};

export function upgrade(db, oldVersion, t) {
  if (oldVersion < 1) {
    for (const [name, def] of Object.entries(STORES)) {
      const os = db.createObjectStore(name, { keyPath: def.keyPath || 'id' });
      for (const [idx, spec] of Object.entries(def.indexes)) {
        const [keyPath, unique] = Array.isArray(spec) ? spec : [spec, false];
        os.createIndex(idx, keyPath, { unique: !!unique });
      }
    }
    const now = new Date().toISOString();
    t.objectStore('meta').put({ key: 'schemaVersion', value: 1 });
    t.objectStore('meta').put({ key: 'createdAt', value: now });
  }
  // Future migrations: if (oldVersion < 2) { ... }
}

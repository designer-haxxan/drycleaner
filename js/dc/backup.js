// Backup export, validation and restore (replace or merge) for customers and tickets.
import * as idb from '../db/idb.js';
import { DATA_STORES } from '../db/schema.js';
import { CONFIG } from '../config.js';
import { getSettings, replaceSettings } from '../core/settings.js';
import { nowISO, AppError } from '../core/utils.js';
import * as Auth from '../services/auth.js';

export const FORMAT = 'drycleaner-backup';

async function sha256(text) {
  if (!crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createBackup() {
  const data = await idb.read(DATA_STORES, async (t) => {
    const out = {};
    for (const s of DATA_STORES) out[s] = await t.getAll(s);
    return out;
  });
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const u = Auth.user();
  return {
    format: FORMAT, backupVersion: CONFIG.BACKUP_VERSION, appVersion: CONFIG.APP_VERSION, schemaVersion: CONFIG.SCHEMA_VERSION,
    createdAt: nowISO(), createdBy: u ? u.name : '',
    counts, checksum: await sha256(JSON.stringify(data)), settings: getSettings(), data,
  };
}

// Returns { ok, errors } — messages are plain English keys for the developer; the UI shows the first one.
export async function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) errors.push('This is not a Dry Cleaner backup file.');
  else if (obj.backupVersion > CONFIG.BACKUP_VERSION) errors.push('This backup was made by a newer version of the app.');
  else if (!obj.data || typeof obj.data !== 'object') errors.push('The backup has no data.');
  if (errors.length) return { ok: false, errors };
  for (const store of ['customers', 'tickets']) {
    const list = obj.data[store] || [];
    if (!Array.isArray(list)) { errors.push(`${store} is not a list.`); continue; }
    const ids = new Set();
    for (const r of list) {
      if (!r?.id || ids.has(r.id)) { errors.push(`${store} has a missing or duplicate id.`); break; }
      ids.add(r.id);
    }
    if (obj.counts && obj.counts[store] !== undefined && obj.counts[store] !== list.length) {
      errors.push(`${store}: record count does not match (the file may be damaged).`);
    }
  }
  if (!errors.length && obj.checksum && (await sha256(JSON.stringify(obj.data))) !== obj.checksum) {
    errors.push('The checksum does not match. The file was changed or damaged.');
  }
  return { ok: !errors.length, errors, counts: obj.counts || {}, createdAt: obj.createdAt };
}

// mode 'replace' clears local data first. mode 'merge' adds records that are missing locally, keeping local edits.
export async function restore(obj, mode) {
  const check = await validateBackup(obj);
  if (!check.ok) throw new AppError(check.errors[0]);
  const stores = ['customers', 'tickets'];
  let added = 0;
  await idb.write([...stores, 'meta'], async (t) => {
    if (mode === 'replace') {
      for (const s of stores) await t.clear(s);
    }
    for (const s of stores) {
      for (const r of obj.data[s] || []) {
        if (mode === 'merge') {
          const local = await t.get(s, r.id);
          if (local) continue;
          if (s === 'tickets' && (await t.getByIndex('tickets', 'number', r.number))) continue;
          if (s === 'customers' && r.phone && (await t.getByIndex('customers', 'phone', r.phone))) continue;
        }
        await t.put(s, r);
        added++;
      }
    }
    // Keep the ticket counter ahead of every imported number so new tickets never reuse one.
    const maxSeq = Math.max(0, ...(obj.data.tickets || []).map((tk) => Number(String(tk.number).replace(/\D/g, '')) || 0));
    const current = (await t.get('meta', 'ticketSeq'))?.value || 0;
    await t.put('meta', { key: 'ticketSeq', value: Math.max(current, maxSeq) });
  });
  if (mode === 'replace' && obj.settings) replaceSettings(obj.settings);
  return { added };
}

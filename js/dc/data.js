// Business data: customers and tickets. Every write is one IndexedDB transaction, so a ticket and its
// number and payments are saved together or not at all.
import * as idb from '../db/idb.js';
import { AppError, round2, uuid, nowISO, lc, clean, num, localDate } from '../core/utils.js';
import { normPhone, STATUS_ORDER, money } from './format.js';
import { t } from '../i18n/i18n.js';
import * as Auth from '../services/auth.js';

export const METHODS = ['cash', 'bank', 'mobile', 'card'];

// Business errors keep their translation key, and their message is already in the current language.
export function fail(key, vars = null) {
  const shown = vars && vars.balance !== undefined ? { ...vars, balance: money(vars.balance) } : vars;
  const e = new AppError(t(key, shown), 'BUSINESS');
  e.key = key;
  e.vars = shown;
  return e;
}

const ticketNumber = (seq) => `T-${String(seq).padStart(4, '0')}`;
const balanceOf = (total, paid) => round2(Math.max(0, total - paid));

// ---------- customers ----------
export const listCustomers = () => idb.getAll('customers');
export const getCustomer = (id) => idb.get('customers', id);

// Saves a customer. Phone numbers must be unique because they are how staff find a customer at the counter.
export async function saveCustomer(input) {
  const name = clean(input.name, 120);
  if (!name) throw fail('cust.needName');
  const phone = input.phone ? normPhone(input.phone) : '';
  if (input.phone && !phone) throw fail('cust.badPhone');
  const at = nowISO();
  return idb.write(['customers'], async (t) => {
    if (phone) {
      const same = await t.getByIndex('customers', 'phone', phone);
      if (same && same.id !== input.id) throw fail('cust.dupPhone', { name: same.name });
    }
    const existing = input.id ? await t.get('customers', input.id) : null;
    const rec = {
      id: existing?.id || input.id || uuid(), name, nameLc: lc(name), phone,
      address: clean(input.address, 200), note: clean(input.note, 300),
      createdAt: existing?.createdAt || at, updatedAt: at,
    };
    await t.put('customers', rec);
    return rec;
  });
}

// ---------- tickets ----------
export const listTickets = () => idb.getAll('tickets');
export const getTicket = (id) => idb.get('tickets', id);

// items: [{ garmentId, name: {en, ur}, service, qty, rate }]. The id is generated when the ticket is opened,
// so a double tap or retry after a refresh returns the ticket that was already saved.
export async function createTicket({ id, customer, items, urgent, urgentPercent, dueDate, advance, advanceMethod, note }) {
  if (!customer?.id) throw fail('new.needCustomer');
  if (!items?.length) throw fail('new.needItems');
  const lines = items.map((i) => ({
    id: uuid(), garmentId: i.garmentId, name: i.name, service: i.service,
    qty: Math.max(1, Math.round(num(i.qty, 1))), rate: round2(num(i.rate)),
    amount: round2(Math.max(1, Math.round(num(i.qty, 1))) * num(i.rate)),
  }));
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const surcharge = urgent ? round2(subtotal * (num(urgentPercent) / 100)) : 0;
  const total = round2(subtotal + surcharge);
  const paidNow = round2(Math.max(0, num(advance)));
  if (paidNow > total) throw fail('new.badAdvance');
  const at = nowISO();
  const user = Auth.user();

  return idb.write(['meta', 'tickets'], async (t) => {
    const existing = await t.get('tickets', id);
    if (existing) return existing;
    const seq = ((await t.get('meta', 'ticketSeq'))?.value || 0) + 1;
    await t.put('meta', { key: 'ticketSeq', value: seq });
    const payments = paidNow > 0 ? [{ id: uuid(), amount: paidNow, method: METHODS.includes(advanceMethod) ? advanceMethod : 'cash', at }] : [];
    const rec = {
      id: id || uuid(), number: ticketNumber(seq),
      customerId: customer.id, customerName: customer.name, customerPhone: customer.phone || '',
      items: lines, subtotal, urgent: !!urgent, surchargePct: urgent ? num(urgentPercent) : 0, surcharge, total,
      payments, paid: paidNow, balance: balanceOf(total, paidNow),
      status: 'received', statusHistory: [{ status: 'received', at }],
      dueDate: dueDate || '', note: clean(note, 300), createdAt: at, updatedAt: at, createdBy: user?.name || '',
    };
    await t.put('tickets', rec);
    return rec;
  });
}

export async function recordPayment(ticketId, { amount, method }) {
  const value = round2(num(amount));
  if (!(value > 0)) throw fail('tickets.badAmount');
  return idb.write(['tickets'], async (t) => {
    const tk = await t.get('tickets', ticketId);
    if (!tk) throw fail('tickets.notFound');
    if (value > tk.balance + 0.005) throw fail('tickets.overpay', { balance: tk.balance });
    const payments = [...tk.payments, { id: uuid(), amount: value, method: METHODS.includes(method) ? method : 'cash', at: nowISO() }];
    const paid = round2(tk.paid + value);
    const rec = { ...tk, payments, paid, balance: balanceOf(tk.total, paid), updatedAt: nowISO() };
    await t.put('tickets', rec);
    return rec;
  });
}

// Moves a ticket to another status. Delivering with an unpaid balance needs force = true (the UI asks first).
export async function setStatus(ticketId, status, { force = false } = {}) {
  if (!STATUS_ORDER.includes(status)) throw fail('common.error');
  return idb.write(['tickets'], async (t) => {
    const tk = await t.get('tickets', ticketId);
    if (!tk) throw fail('tickets.notFound');
    if (status === 'delivered' && tk.balance > 0.005 && !force) throw fail('tickets.deliverUnpaid', { balance: tk.balance });
    if (tk.status === status) return tk;
    const at = nowISO();
    const rec = { ...tk, status, statusHistory: [...tk.statusHistory, { status, at }], updatedAt: at };
    await t.put('tickets', rec);
    return rec;
  });
}

export async function deleteTicket(ticketId) {
  return idb.write(['tickets'], async (t) => {
    const tk = await t.get('tickets', ticketId);
    if (!tk) throw fail('tickets.notFound');
    if (tk.payments.length) throw fail('tickets.cancelBlocked');
    await t.delete('tickets', ticketId);
  });
}

// Used by reports and the home screen. Timestamps are stored in UTC; days are the phone's local calendar day.
export const dayOf = (iso) => (iso ? localDate(new Date(iso)) : '');
export const inRange = (iso, from, to) => !!iso && dayOf(iso) >= from && dayOf(iso) <= to;
export const deliveredAt = (tk) => tk.statusHistory.find((h) => h.status === 'delivered')?.at || '';
export const paymentsBetween = (tickets, from, to) => {
  const out = [];
  for (const tk of tickets) for (const p of tk.payments) if (inRange(p.at, from, to)) out.push({ ...p, ticket: tk });
  return out;
};

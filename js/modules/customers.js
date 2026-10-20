// Customers: list with search, add/edit, and each customer's ticket history.
import * as UI from '../core/ui.js';
import { esc } from '../core/utils.js';
import { listCustomers, getCustomer, saveCustomer, listTickets, dayOf } from '../dc/data.js';
import { money, phoneText, waLink, fmtDate, statusLabel, normPhone } from '../dc/format.js';
import { t } from '../i18n/i18n.js';

const $ = window.jQuery;

// Add/edit form. Resolves with the saved customer, or undefined if cancelled.
export function customerForm(existing = null) {
  const c = existing || {};
  return UI.formModal({
    title: existing ? t('cust.edit') : t('cust.add'),
    body: `<div class="row g-3">
      <div class="col-12"><label class="form-label fw-semibold">${t('cust.name')}</label>
        <input name="name" class="form-control form-control-lg" required maxlength="120" value="${esc(c.name)}" autocomplete="off"></div>
      <div class="col-12"><label class="form-label fw-semibold">${t('cust.phone')}</label>
        <input name="phone" type="tel" inputmode="tel" class="form-control form-control-lg" maxlength="16" value="${esc(phoneText(c.phone))}" placeholder="03xx-xxxxxxx"></div>
      <div class="col-12"><label class="form-label">${t('cust.address')}</label>
        <input name="address" class="form-control" maxlength="200" value="${esc(c.address)}"></div>
      <div class="col-12"><label class="form-label">${t('cust.note')}</label>
        <input name="note" class="form-control" maxlength="300" value="${esc(c.note)}"></div>
    </div>`,
    onSubmit: (v) => saveCustomer({ ...v, id: existing?.id }),
  });
}

function avatarFor(name) {
  return `<div class="avatar-lg">${esc(UI.initials(name))}</div>`;
}

async function renderList(el) {
  const $el = $(el);
  $el.html(UI.pageHeader(t('cust.title'), `<button class="btn btn-brand btn-sm btn-add"><i class="bi bi-person-plus"></i> ${t('cust.add')}</button>`) + `
    <div class="search-box mb-3"><i class="bi bi-search"></i><input type="search" class="form-control q" placeholder="${t('common.search')}"></div>
    <div class="list-card list"></div>`);
  const [customers, tickets] = await Promise.all([listCustomers(), listTickets()]);
  const stats = new Map();
  for (const tk of tickets) {
    const s = stats.get(tk.customerId) || { count: 0, owes: 0 };
    s.count++;
    if (tk.balance > 0.005) s.owes += tk.balance;
    stats.set(tk.customerId, s);
  }
  const draw = () => {
    const q = String($el.find('.q').val() || '').trim().toLowerCase();
    const list = customers
      .filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    $el.find('.list').html(list.length ? list.slice(0, 200).map((c) => {
      const s = stats.get(c.id) || { count: 0, owes: 0 };
      return `<a class="list-row" href="#/customers/${encodeURIComponent(c.id)}">
        ${UI.avatar(c.name, 'round')}
        <div class="main"><div class="title">${esc(c.name)}</div><div class="sub">${esc(phoneText(c.phone) || t('common.nophone'))} · ${s.count} ${t('cust.tickets')}</div></div>
        <div class="end">${s.owes > 0.005 ? `<span class="owe-chip">${t('cust.owes')} ${money(s.owes)}</span>` : ''}</div></a>`;
    }).join('') : UI.emptyState(t('cust.empty'), 'people', `<button class="btn btn-brand btn-sm mt-3 btn-add">${t('cust.add')}</button>`));
  };
  $el.on('input', '.q', draw);
  $el.on('click', '.btn-add', async () => {
    const c = await customerForm();
    if (c) { UI.toast(t('cust.saved')); location.hash = `#/customers/${encodeURIComponent(c.id)}`; }
  });
  draw();
}

async function renderDetail(el, id, setTitle) {
  const $el = $(el).off();
  const c = await getCustomer(id);
  if (!c) { $el.html(UI.pageHeader(t('cust.title'), '', '#/customers') + UI.emptyState(t('tickets.notFound'), 'exclamation-circle')); return; }
  setTitle(c.name);
  const tickets = (await listTickets()).filter((tk) => tk.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const owes = tickets.reduce((s, tk) => s + (tk.balance > 0.005 ? tk.balance : 0), 0);
  const wa = waLink(c.phone, '');
  $el.html(UI.pageHeader(c.name, `<button class="btn btn-outline-brand btn-sm btn-edit"><i class="bi bi-pencil"></i> ${t('common.edit')}</button>`, '#/customers') + `
    <div class="card card-soft p-3 mb-3 d-flex align-items-center gap-3">
      ${avatarFor(c.name)}
      <div class="flex-grow-1 min-w-0">
        <div class="fs-5 fw-bold text-truncate">${esc(c.name)}</div>
        <div class="text-body-secondary">${esc(phoneText(c.phone) || t('common.nophone'))}</div>
        ${c.address ? `<div class="small text-body-secondary text-truncate">${esc(c.address)}</div>` : ''}
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      ${normPhone(c.phone) ? `<a class="btn btn-outline-brand" href="tel:${esc(normPhone(c.phone))}"><i class="bi bi-telephone"></i> ${t('common.call')}</a>` : ''}
      ${wa ? `<a class="btn btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> ${t('common.whatsapp')}</a>` : ''}
    </div>
    <div class="stat-strip mb-3">
      <div><div class="k">${tickets.length}</div><div class="l">${t('cust.tickets')}</div></div>
      <div><div class="k ${owes > 0.005 ? 'text-danger' : ''}">${money(owes)}</div><div class="l">${t('cust.owes')}</div></div>
    </div>
    ${c.note ? `<div class="alert alert-light border small">${esc(c.note)}</div>` : ''}
    <h2 class="h6 mt-3 mb-2">${t('cust.history')}</h2>
    <div class="list-card">${tickets.length ? tickets.map((tk) => `<a class="list-row" href="#/tickets/${encodeURIComponent(tk.id)}">
      <div class="main"><div class="title">${esc(tk.number)} <span class="status-pill s-${tk.status}">${esc(statusLabel(tk.status))}</span></div>
      <div class="sub">${esc(fmtDate(dayOf(tk.createdAt)))} · ${money(tk.total)}</div></div>
      <div class="end small ${tk.balance > 0.005 ? 'text-danger fw-semibold' : 'text-body-secondary'}">${tk.balance > 0.005 ? money(tk.balance) : '✓'}</div></a>`).join('') : `<div class="p-3 text-body-secondary">${t('cust.noHistory')}</div>`}</div>`);
  $el.on('click', '.btn-edit', async () => {
    const updated = await customerForm(c);
    if (updated) { UI.toast(t('cust.saved')); renderDetail(el, id, setTitle); }
  });
}

export default {
  async render(el, { params, setTitle }) {
    if (params[0]) return renderDetail(el, params[0], setTitle);
    return renderList(el);
  },
};

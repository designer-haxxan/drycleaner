// Daily report: tickets received, garments, bills made, money received by method, and balances still owed.
import * as UI from '../core/ui.js';
import { esc } from '../core/utils.js';
import { t, pick2 } from '../i18n/i18n.js';
import { listTickets, inRange, paymentsBetween, deliveredAt, METHODS } from '../dc/data.js';
import { money, today, addDays, fmtDate } from '../dc/format.js';

const $ = window.jQuery;
const RANGES = [['today', 'rep.today'], ['week', 'rep.week'], ['month', 'rep.month']];

function rangeFor(key) {
  const td = today();
  if (key === 'week') return [addDays(-6), td];
  if (key === 'month') return [td.slice(0, 8) + '01', td];
  return [td, td];
}

function compute(tickets, from, to) {
  const made = tickets.filter((tk) => inRange(tk.createdAt, from, to));
  const delivered = tickets.filter((tk) => inRange(deliveredAt(tk), from, to));
  const payments = paymentsBetween(tickets, from, to);
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0]));
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
  const garments = new Map();
  for (const tk of made) for (const i of tk.items) {
    const g = garments.get(i.garmentId) || { name: i.name, qty: 0, amount: 0 };
    g.qty += i.qty;
    g.amount += i.amount;
    garments.set(i.garmentId, g);
  }
  return {
    received: made.length,
    garmentsIn: made.reduce((s, tk) => s + tk.items.reduce((n, i) => n + i.qty, 0), 0),
    billed: made.reduce((s, tk) => s + tk.total, 0),
    collected: payments.reduce((s, p) => s + p.amount, 0),
    deliveredCount: delivered.length,
    garmentsOut: delivered.reduce((s, tk) => s + tk.items.reduce((n, i) => n + i.qty, 0), 0),
    outstanding: tickets.reduce((s, tk) => s + (tk.balance > 0.005 ? tk.balance : 0), 0),
    byMethod,
    garments: [...garments.values()].sort((a, b) => b.qty - a.qty),
  };
}

function draw($el, tickets, from, to, rangeKey) {
  const r = compute(tickets, from, to);
  const card = (cls, icon, label, value, sub = '') => `<div class="stat-card ${cls}">
      <div class="stat-ico"><i class="bi bi-${icon}"></i></div>
      <div class="stat-val">${value}</div><div class="stat-lbl">${esc(label)}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const methodRows = METHODS.map((m) => `<div class="list-row"><div class="main">${esc(t(`tickets.${m}`))}</div><div class="end fw-semibold">${money(r.byMethod[m])}</div></div>`).join('');
  const garmentRows = r.garments.length
    ? r.garments.map((g) => `<div class="list-row"><div class="main"><div class="title">${esc(pick2(g.name))}</div></div><div class="end"><b>${g.qty}</b> ${esc(t('rep.pieces'))} · ${money(g.amount)}</div></div>`).join('')
    : `<div class="p-3 text-body-secondary small">${esc(t('rep.nothing'))}</div>`;

  $el.find('.rep-body').html(`
    <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
      <div class="btn-group" role="group">${RANGES.map(([k, label]) => `<button type="button" class="btn ${rangeKey === k ? 'btn-brand' : 'btn-outline-brand'}" data-range="${k}">${esc(t(label))}</button>`).join('')}</div>
    </div>
    <form class="row g-2 align-items-end mb-3 rep-form">
      <div class="col-6"><label class="form-label small mb-0">${esc(t('rep.from'))}</label><input type="date" name="from" class="form-control" value="${esc(from)}"></div>
      <div class="col-6"><label class="form-label small mb-0">${esc(t('rep.to'))}</label><input type="date" name="to" class="form-control" value="${esc(to)}"></div>
    </form>
    <div class="small text-body-secondary mb-3">${esc(fmtDate(from))} — ${esc(fmtDate(to))}</div>
    <div class="stat-grid mb-3">
      ${card('c-indigo', 'inbox', t('rep.received'), r.received)}
      ${card('c-teal', 'cash-stack', t('rep.collected'), money(r.collected))}
      ${card('c-green', 'hand-thumbs-up', t('rep.delivered'), `${r.deliveredCount}<small class="ms-1">(${r.garmentsOut} ${esc(t('rep.pieces'))})</small>`)}
      ${card('c-amber', 'receipt', t('rep.billed'), money(r.billed))}
    </div>
    <div class="bill-card mb-3 d-flex justify-content-between align-items-center">
      <div><div class="fw-semibold">${esc(t('rep.outstanding'))}</div><div class="small text-body-secondary">${r.garmentsIn} ${esc(t('rep.pieces'))} · ${esc(t('rep.received'))}: ${r.received}</div></div>
      <div class="fs-4 fw-bold text-danger">${money(r.outstanding)}</div>
    </div>
    <h2 class="section-h">${esc(t('rep.byMethod'))}</h2>
    <div class="list-card mb-3">${methodRows}</div>
    <h2 class="section-h">${esc(t('rep.byGarment'))}</h2>
    <div class="list-card">${garmentRows}</div>`);
}

export default {
  async render(el) {
    const $el = $(el).off();
    $el.html(UI.pageHeader(t('rep.title')) + '<div class="rep-body"></div>');
    const tickets = await listTickets();
    let [from, to] = rangeFor('today');
    let key = 'today';
    const refresh = () => draw($el, tickets, from, to, key);
    refresh();
    $el.on('click', '[data-range]', function () {
      key = this.dataset.range;
      [from, to] = rangeFor(key);
      refresh();
    });
    $el.on('change', '.rep-form input', function () {
      const f = $el.find('[name=from]').val() || from;
      const tt = $el.find('[name=to]').val() || to;
      from = f <= tt ? f : tt;
      to = f <= tt ? tt : f;
      key = '';
      refresh();
    });
  },
  destroy() {},
};

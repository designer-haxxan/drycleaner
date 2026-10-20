// Tickets: list with filters, and the ticket screen (status steps, payments, receipt, WhatsApp message).
import * as UI from '../core/ui.js';
import { esc, num } from '../core/utils.js';
import { t, pick2 } from '../i18n/i18n.js';
import { listTickets, getTicket, setStatus, recordPayment, deleteTicket, METHODS } from '../dc/data.js';
import { money, fmtDate, fmtDateTime, phoneText, waLink, normPhone, statusLabel, dueState, readyMessage, STATUS_ORDER, garmentCount, errText } from '../dc/format.js';
import { buildTicketReceipt } from '../printer/receipt.js';
import { printModel } from '../printer/printer.js';

const $ = window.jQuery;
const STEP_ICON = { received: 'inbox', processing: 'stars', ready: 'bag-check', delivered: 'hand-thumbs-up' };
const FILTERS = ['all', 'open', 'ready', 'late', 'delivered'];
const FILTER_LABEL = { all: 'tickets.all', open: 'tickets.open', ready: 'status.ready', late: 'status.overdue', delivered: 'status.delivered' };
const PAGE = 60;

const isOpen = (tk) => tk.status !== 'delivered';
const matchesFilter = (tk, f) => {
  if (f === 'all') return true;
  if (f === 'open') return isOpen(tk);
  if (f === 'late') return dueState(tk) === 'late';
  return tk.status === f;
};

const dueChip = (tk) => {
  const s = dueState(tk);
  if (!tk.dueDate) return '';
  const label = s === 'late' ? t('status.overdue') : s === 'today' ? t('status.due_today') : fmtDate(tk.dueDate);
  return `<span class="due-chip mini ${s}"><i class="bi bi-calendar-check"></i> ${esc(label)}</span>`;
};

function ticketCard(tk) {
  const s = dueState(tk);
  return `<a class="ticket-card s-${tk.status} ${s ? 'due-' + s : ''}" href="#/tickets/${encodeURIComponent(tk.id)}">
    <div class="tc-top">
      <span class="tc-no">${esc(tk.number)}</span>
      <span class="status-pill s-${tk.status}">${esc(statusLabel(tk.status))}</span>
    </div>
    <div class="tc-name text-truncate">${esc(tk.customerName)}</div>
    <div class="tc-items text-truncate">${esc(tk.items.map((i) => `${pick2(i.name)} ×${i.qty}`).join(', '))}</div>
    <div class="tc-bottom">
      <div class="d-flex flex-wrap gap-1 align-items-center">${dueChip(tk)}<span class="small text-body-secondary">${garmentCount(tk)} ${t('rep.pieces')}</span></div>
      <div class="tc-money ${tk.balance > 0.005 ? 'owing' : 'paid'}">${tk.balance > 0.005 ? `${esc(t('tickets.balance'))} <b>${money(tk.balance)}</b>` : '✓ ' + esc(t('tickets.paid'))}</div>
    </div>
  </a>`;
}

async function renderList(el) {
  const $el = $(el).off();
  $el.html(UI.pageHeader(t('tickets.title'), `<a class="btn btn-brand btn-sm" href="#/new"><i class="bi bi-plus-lg"></i> ${t('tickets.new')}</a>`) + `
    <div class="search-box mb-2"><i class="bi bi-search"></i><input type="search" class="form-control q" placeholder="${t('tickets.search')}" autocomplete="off"></div>
    <div class="filter-chips mb-3" role="tablist"></div>
    <div class="ticket-list"></div>
    <div class="more-wrap"></div>`);
  const tickets = (await listTickets()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let filter = 'open';
  let shown = PAGE;
  const draw = () => {
    const q = String($el.find('.q').val() || '').trim().toLowerCase();
    const chips = FILTERS.map((f) => {
      const n = tickets.filter((tk) => matchesFilter(tk, f)).length;
      return `<button type="button" class="filter-chip ${filter === f ? 'active' : ''} f-${f}" data-f="${f}">${esc(t(FILTER_LABEL[f]))} <span class="count">${n}</span></button>`;
    }).join('');
    $el.find('.filter-chips').html(chips);
    const list = tickets.filter((tk) => matchesFilter(tk, filter) && (!q || `${tk.number} ${tk.customerName} ${tk.customerPhone}`.toLowerCase().includes(q)));
    $el.find('.ticket-list').html(list.length ? list.slice(0, shown).map(ticketCard).join('') : UI.emptyState(t('tickets.empty'), 'receipt', `<a class="btn btn-brand btn-sm mt-3" href="#/new">${t('tickets.new')}</a>`));
    $el.find('.more-wrap').html(list.length > shown ? `<button class="btn btn-outline-brand w-100 mt-3 btn-more">${esc(t('common.more') || '+')} (${list.length - shown})</button>` : '');
  };
  $el.on('click', '.filter-chip', function () { filter = this.dataset.f; shown = PAGE; draw(); });
  $el.on('click', '.btn-more', () => { shown += PAGE; draw(); });
  $el.on('input', '.q', () => { shown = PAGE; draw(); });
  draw();
}

// Opens the WhatsApp message for a ready ticket. The message is only sent when the user presses send there.
function showReadyMessage(tk) {
  const link = waLink(tk.customerPhone, readyMessage(tk));
  UI.modal({
    title: t('tickets.sendReady'),
    fullscreenMobile: false,
    body: `<p class="small text-body-secondary mb-3">${esc(t('tickets.sendReadyHint'))}</p>
      <pre class="ready-msg">${esc(readyMessage(tk))}</pre>`,
    footer: link
      ? `<button class="btn btn-light" data-bs-dismiss="modal">${esc(t('common.close'))}</button>
         <a class="btn btn-whatsapp" href="${esc(link)}" target="_blank" rel="noopener" data-bs-dismiss="modal"><i class="bi bi-whatsapp"></i> ${esc(t('common.whatsapp'))}</a>`
      : `<button class="btn btn-light" data-bs-dismiss="modal">${esc(t('common.close'))}</button>`,
  });
}

function stepper(status) {
  const cur = STATUS_ORDER.indexOf(status);
  const progress = (cur / (STATUS_ORDER.length - 1)) * 76; // the bar runs between the first and last dot
  return `<ol class="stepper" style="--prog: ${progress}%" aria-label="${esc(statusLabel(status))}">${STATUS_ORDER.map((s, i) => `
    <li class="step ${i < cur ? 'done' : i === cur ? 'current' : ''} s-${s}">
      <span class="step-dot"><i class="bi bi-${STEP_ICON[s]}"></i></span>
      <span class="step-label">${esc(t(`status.${s}`))}</span>
    </li>`).join('')}</ol>`;
}

function actionsFor(tk) {
  if (tk.status === 'delivered') return '';
  if (tk.status === 'ready') {
    return `<button class="btn btn-success btn-lg w-100 action-main" data-act="deliver"><i class="bi bi-hand-thumbs-up"></i> ${esc(t('tickets.markDelivered'))}</button>
      <button class="btn btn-whatsapp btn-lg w-100 mt-2" data-act="wa"><i class="bi bi-whatsapp"></i> ${esc(t('tickets.sendReady'))}</button>`;
  }
  const next = tk.status === 'received' ? `<button class="btn btn-outline-brand btn-lg flex-fill" data-act="status" data-to="processing"><i class="bi bi-stars"></i> ${esc(t('status.processing'))}</button>` : '';
  return `<div class="d-flex gap-2">${next}<button class="btn btn-brand btn-lg flex-fill" data-act="status" data-to="ready"><i class="bi bi-bag-check"></i> ${esc(t('tickets.markReady'))}</button></div>`;
}

async function renderDetail(el, id, setTitle) {
  const $el = $(el).off();
  let tk = await getTicket(id);
  if (!tk) { $el.html(UI.pageHeader(t('tickets.title'), '', '#/tickets') + UI.emptyState(t('tickets.notFound'), 'exclamation-circle')); return; }
  setTitle(tk.number);
  const wa = waLink(tk.customerPhone, '');
  const late = dueState(tk) === 'late';
  const paidOrNot = tk.balance > 0.005;
  const history = tk.statusHistory.map((h) => `<li><span class="dot s-${h.status}"></span><span class="fw-semibold">${esc(statusLabel(h.status))}</span> <span class="text-body-secondary small">${esc(fmtDateTime(h.at))}</span></li>`).join('');

  $el.html(UI.pageHeader(tk.number, '', '#/tickets') + `
    <div class="ticket-hero mb-3 s-${tk.status}">
      <div class="th-top">
        <div><div class="th-label">${esc(t('tickets.number'))}</div><div class="th-no">${esc(tk.number)}</div></div>
        <span class="status-pill big s-${tk.status}">${esc(statusLabel(tk.status))}</span>
      </div>
      ${stepper(tk.status)}
      <div class="th-meta">
        <div><span class="k">${esc(t('tickets.received'))}</span><span class="v">${esc(fmtDateTime(tk.createdAt))}</span></div>
        <div><span class="k">${esc(t('tickets.due'))}</span><span class="v ${late ? 'text-danger' : ''}">${tk.dueDate ? esc(fmtDate(tk.dueDate)) : '—'}${late ? ` <small>(${esc(t('tickets.lateNote'))})</small>` : ''}</span></div>
        ${tk.urgent ? `<div><span class="urgent-badge"><i class="bi bi-lightning-charge-fill"></i> ${esc(t('tickets.urgent'))}</span></div>` : ''}
      </div>
    </div>

    <div class="mb-3">${actionsFor(tk)}</div>

    <section class="card card-soft p-3 mb-3 d-flex align-items-center gap-3">
      ${UI.avatar(tk.customerName, 'round')}
      <div class="flex-grow-1 min-w-0">
        <div class="fw-bold text-truncate">${esc(tk.customerName)}</div>
        <div class="small text-body-secondary">${esc(phoneText(tk.customerPhone) || t('common.nophone'))}</div>
      </div>
      ${normPhone(tk.customerPhone) ? `<a class="btn btn-icon btn-outline-brand" href="tel:${esc(normPhone(tk.customerPhone))}" aria-label="${esc(t('common.call'))}"><i class="bi bi-telephone"></i></a>` : ''}
      ${wa ? `<a class="btn btn-icon btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="${esc(t('common.whatsapp'))}"><i class="bi bi-whatsapp"></i></a>` : ''}
    </section>

    <section class="bill-card mb-3">
      <h2 class="h6 mb-2">${esc(t('tickets.items'))}</h2>
      ${tk.items.map((i) => `<div class="bill-row"><span>${esc(pick2(i.name))} <span class="text-body-secondary small">· ${esc(t(`svc.${i.service}`))} × ${i.qty}</span></span><span>${money(i.amount)}</span></div>`).join('')}
      ${tk.urgent ? `<div class="bill-row text-warning-emphasis"><span>${esc(t('tickets.urgent'))} (${tk.surchargePct}%)</span><span>${money(tk.surcharge)}</span></div>` : ''}
      <div class="bill-row bill-total"><span>${esc(t('tickets.total'))}</span><span>${money(tk.total)}</span></div>
      <div class="bill-row"><span>${esc(t('tickets.paid'))}</span><span>${money(tk.paid)}</span></div>
      <div class="bill-row bill-balance ${paidOrNot ? '' : 'is-paid'}"><span>${esc(t('tickets.balance'))}</span><span>${money(tk.balance)}</span></div>
      ${paidOrNot && tk.status !== 'delivered' ? `<button class="btn btn-brand w-100 mt-3" data-act="pay"><i class="bi bi-cash-coin"></i> ${esc(t('tickets.addPayment'))}</button>` : ''}
    </section>

    ${tk.note ? `<section class="alert alert-light border mb-3"><div class="small text-body-secondary">${esc(t('tickets.note'))}</div>${esc(tk.note)}</section>` : ''}

    <section class="mb-3">
      <h2 class="h6 mb-2">${esc(t('tickets.payments'))}</h2>
      <div class="list-card">${tk.payments.length ? tk.payments.map((p) => `<div class="list-row"><div class="main"><div class="title">${esc(t(`tickets.${p.method}`))}</div><div class="sub">${esc(fmtDateTime(p.at))}</div></div><div class="end fw-semibold">${money(p.amount)}</div></div>`).join('') : `<div class="p-3 text-body-secondary small">${esc(t('tickets.noPayments'))}</div>`}</div>
    </section>

    <section class="mb-3">
      <h2 class="h6 mb-2">${esc(t('tickets.history'))}</h2>
      <ul class="history">${history}</ul>
    </section>

    <div class="d-flex flex-wrap gap-2 mb-4">
      <button class="btn btn-outline-brand flex-fill" data-act="print"><i class="bi bi-printer"></i> ${esc(t('tickets.receipt'))}</button>
      ${tk.payments.length ? '' : `<button class="btn btn-outline-danger flex-fill" data-act="delete"><i class="bi bi-trash"></i> ${esc(t('tickets.cancel'))}</button>`}
    </div>`);

  const reload = () => renderDetail(el, id, setTitle);
  const run = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) UI.toast(okMsg);
      return r;
    } catch (e) {
      UI.toast(errText(e), 'danger', 5000);
      return undefined;
    }
  };

  $el.on('click', '[data-act]', async function () {
    const act = this.dataset.act;
    if (act === 'status') {
      const to = this.dataset.to;
      const updated = await run(() => setStatus(id, to));
      if (updated && to === 'ready') { UI.toast(t('tickets.readyDone')); showReadyMessage(updated); }
      return reload();
    }
    if (act === 'deliver') {
      try {
        await setStatus(id, 'delivered');
        UI.toast(t('tickets.deliverDone'));
      } catch (e) {
        if (e.key !== 'tickets.deliverUnpaid') { UI.toast(errText(e), 'danger', 5000); return reload(); }
        // Balance still open: the shop may hand over the clothes only after the customer confirms.
        if (await UI.confirmDialog(e.message, { okLabel: t('tickets.markDelivered'), okClass: 'btn-warning' })) {
          await run(() => setStatus(id, 'delivered', { force: true }), t('tickets.deliverDone'));
        }
      }
      return reload();
    }
    if (act === 'wa') return showReadyMessage(tk);
    if (act === 'pay') {
      const r = await UI.formModal({
        title: t('tickets.addPayment'),
        body: `<div class="mb-3 text-center"><div class="small text-body-secondary">${esc(t('tickets.balance'))}</div><div class="fs-2 fw-bold text-danger">${money(tk.balance)}</div></div>
          <div class="row g-2">
            <div class="col-6"><label class="form-label">${esc(t('tickets.amount'))}</label><input name="amount" type="number" inputmode="decimal" step="1" min="1" class="form-control form-control-lg" value="${tk.balance}" required></div>
            <div class="col-6"><label class="form-label">${esc(t('tickets.method'))}</label><select name="method" class="form-select form-select-lg">${METHODS.map((m) => `<option value="${m}">${esc(t(`tickets.${m}`))}</option>`).join('')}</select></div>
          </div>`,
        submitLabel: t('common.save'),
        onSubmit: async (v) => {
          const amount = num(v.amount);
          const updated = await recordPayment(id, { amount, method: v.method });
          UI.toast(t('tickets.paymentSaved', { amount: money(amount) }));
          return updated;
        },
      });
      if (r) reload();
      return undefined;
    }
    if (act === 'print') {
      await printModel(buildTicketReceipt(tk));
      return UI.toast(t('tickets.receiptSent'));
    }
    if (act === 'delete') {
      if (!(await UI.confirmDialog(t('tickets.cancelConfirm', { number: tk.number }), { okLabel: t('common.delete'), okClass: 'btn-danger' }))) return undefined;
      const ok = await run(() => deleteTicket(id), t('tickets.cancelled'));
      if (ok !== undefined) location.hash = '#/tickets';
      return undefined;
    }
    return undefined;
  });
}

export default {
  async render(el, { params, setTitle }) {
    if (params[0]) return renderDetail(el, params[0], setTitle);
    return renderList(el);
  },
  destroy() {},
};

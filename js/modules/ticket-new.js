// New ticket: choose the customer, the service, tap the garments, set the pickup date and take advance money.
// The draft is kept on this phone, so a refresh or a language change does not lose it.
import * as UI from '../core/ui.js';
import { esc, uuid, round2, num } from '../core/utils.js';
import { getSettings, pref } from '../core/settings.js';
import { t, pick2 } from '../i18n/i18n.js';
import { GARMENTS, SERVICES, rateFor, garment } from '../dc/catalog.js';
import { money, addDays, today, phoneText, errText } from '../dc/format.js';
import { createTicket, listCustomers, METHODS } from '../dc/data.js';
import { buildTicketReceipt } from '../printer/receipt.js';
import { printModel } from '../printer/printer.js';
import { customerForm } from './customers.js';

const $ = window.jQuery;
const DRAFT_KEY = 'draftTicket';
const SVC_ICON = { dry: '✨', wash: '🫧', press: '♨️' };
const DUE_CHIPS = [[0, 'new.today'], [1, 'new.tomorrow'], [3, 'new.days'], [7, 'new.week']];

let draft = null;
let popTile = null; // garment id to animate after the next redraw

function freshDraft() {
  return { id: uuid(), customer: null, service: 'dry', items: [], urgent: false, dueDate: addDays(3), advance: 0, method: 'cash', note: '' };
}
function loadDraft() {
  const d = pref.get(DRAFT_KEY);
  return d && d.id && Array.isArray(d.items) ? d : freshDraft();
}
const saveDraft = () => pref.set(DRAFT_KEY, draft);

// Totals from the cart. Urgent charge is a percentage of the items total.
function totals() {
  const subtotal = round2(draft.items.reduce((s, i) => s + i.qty * i.rate, 0));
  const pct = num(getSettings().urgentPercent);
  const surcharge = draft.urgent ? round2(subtotal * (pct / 100)) : 0;
  const total = round2(subtotal + surcharge);
  const advance = round2(Math.max(0, num(draft.advance)));
  return { subtotal, surcharge, total, advance, balance: round2(Math.max(0, total - advance)), pct };
}

function addGarment(garmentId) {
  const g = garment(garmentId);
  const service = draft.service;
  const rate = rateFor(garmentId, service);
  if (!g || rate <= 0) return;
  const line = draft.items.find((i) => i.garmentId === garmentId && i.service === service);
  if (line) line.qty += 1;
  else draft.items.push({ garmentId, service, qty: 1, rate, name: { en: g.en, ur: g.ur } });
  popTile = garmentId;
  saveDraft();
  draw();
}

function changeQty(idx, delta) {
  const line = draft.items[idx];
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) draft.items.splice(idx, 1);
  saveDraft();
  draw();
}

async function pickCustomer() {
  const r = await UI.pick({
    title: t('new.pickCustomer'),
    placeholder: t('common.search'),
    addNew: { label: t('new.addCustomer'), create: () => customerForm() },
    search: async (q) => {
      const needle = q.trim().toLowerCase();
      const all = await listCustomers();
      return all
        .filter((c) => !needle || `${c.name} ${c.phone}`.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 60)
        .map((c) => ({ id: c.id, title: c.name, subtitle: phoneText(c.phone), value: c }));
    },
  });
  if (r === undefined || r === null) return;
  const c = r.value || r;
  draft.customer = { id: c.id, name: c.name, phone: c.phone || '' };
  saveDraft();
  draw();
}

async function save(print) {
  if (!draft.customer) return UI.toast(t('new.needCustomer'), 'warning');
  if (!draft.items.length) return UI.toast(t('new.needItems'), 'warning');
  const c = totals();
  if (num(draft.advance) > c.total + 0.005) return UI.toast(t('new.badAdvance'), 'warning');
  try {
    const tk = await UI.withLoading(() => createTicket({
      id: draft.id,
      customer: draft.customer,
      items: draft.items.map((i) => ({ garmentId: i.garmentId, name: i.name, service: i.service, qty: i.qty, rate: i.rate })),
      urgent: draft.urgent,
      urgentPercent: c.pct,
      dueDate: draft.dueDate,
      advance: c.advance,
      advanceMethod: draft.method,
      note: draft.note,
    }), t('common.pending'));
    draft = freshDraft();
    pref.remove(DRAFT_KEY);
    UI.toast(t('new.saved', { number: tk.number }));
    if (print) await printModel(buildTicketReceipt(tk));
    location.hash = `#/tickets/${encodeURIComponent(tk.id)}`;
  } catch (e) {
    UI.toast(errText(e), 'danger', 5000);
  }
}

function draw() {
  const $el = $('#content');
  const c = totals();
  const cart = draft.items.map((line, idx) => {
    const g = garment(line.garmentId);
    return `<div class="cart-line">
      <div class="cl-icon">${esc(g?.icon || '🧺')}</div>
      <div class="cl-main">
        <div class="cl-name">${esc(pick2(line.name))}</div>
        <div class="cl-sub"><span class="svc-chip s-${esc(line.service)}">${SVC_ICON[line.service] || ''} ${esc(t(`svc.${line.service}`))}</span> · ${money(line.rate)}</div>
      </div>
      <div class="qty-ctl" role="group" aria-label="${esc(t('new.qty'))}">
        <button type="button" class="qty-btn" data-act="dec" data-idx="${idx}" aria-label="−">−</button>
        <span class="qty-val">${line.qty}</span>
        <button type="button" class="qty-btn" data-act="inc" data-idx="${idx}" aria-label="+">+</button>
      </div>
      <div class="cl-amt">${money(line.qty * line.rate)}</div>
    </div>`;
  }).join('');
  const countFor = (gid) => draft.items.filter((i) => i.garmentId === gid && i.service === draft.service).reduce((s, i) => s + i.qty, 0);
  const tiles = GARMENTS.map((g) => {
    const rate = rateFor(g.id, draft.service);
    const off = rate <= 0;
    const n = countFor(g.id);
    return `<button type="button" class="g-tile ${off ? 'is-off' : ''} ${popTile === g.id ? 'pop' : ''}" data-g="${esc(g.id)}" ${off ? 'disabled' : ''}>
      <span class="g-icon">${esc(g.icon)}</span>
      <span class="g-name">${esc(pick2(g))}</span>
      <span class="g-price">${off ? esc(t('new.notOffered')) : money(rate)}</span>
      ${n ? `<span class="g-qty">${n}</span>` : ''}
    </button>`;
  }).join('');
  popTile = null;

  $el.html(`<div class="ticket-new">
    ${UI.pageHeader(t('new.title'), draft.items.length || draft.customer ? `<button type="button" class="btn btn-light btn-sm" data-act="clear" aria-label="${esc(t('new.clear'))}"><i class="bi bi-arrow-counterclockwise"></i></button>` : '')}
    <p class="tip-line mb-3"><i class="bi bi-lightbulb"></i> ${esc(t('new.tip'))}</p>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">1</span>${esc(t('new.customer'))}</div>
      ${draft.customer ? `<div class="cust-pick chosen">
          ${UI.avatar(draft.customer.name, 'round')}
          <div class="flex-grow-1 min-w-0"><div class="fw-bold text-truncate">${esc(draft.customer.name)}</div>
          <div class="small text-body-secondary">${esc(phoneText(draft.customer.phone) || t('common.nophone'))}</div></div>
          <button type="button" class="btn btn-outline-brand btn-sm" data-act="customer">${esc(t('new.changeCustomer'))}</button>
        </div>`
        : `<button type="button" class="cust-pick empty" data-act="customer"><i class="bi bi-person-plus"></i><span>${esc(t('new.pickCustomer'))}</span></button>
           <button type="button" class="btn btn-link p-0 mt-2 small" data-act="newcust">${esc(t('new.addCustomer'))}</button>`}
    </section>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">2</span>${esc(t('new.service'))}</div>
      <div class="svc-seg" role="group">
        ${SERVICES.map((s) => `<button type="button" class="svc-btn s-${s} ${draft.service === s ? 'active' : ''}" data-act="svc" data-svc="${s}" aria-pressed="${draft.service === s}">
          <span class="svc-ico">${SVC_ICON[s]}</span><span>${esc(t(`svc.${s}`))}</span></button>`).join('')}
      </div>
    </section>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">3</span>${esc(t('new.garments'))}</div>
      <div class="small text-body-secondary mb-2">${esc(t('new.garmentsHint'))}</div>
      <div class="garment-grid">${tiles}</div>
    </section>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">4</span>${esc(t('new.items'))}</div>
      <div class="cart">${cart || `<div class="cart-empty"><div class="ce-ico">🧺</div>${esc(t('new.empty'))}</div>`}</div>
    </section>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">5</span>${esc(t('new.due'))}</div>
      <div class="small text-body-secondary mb-2">${esc(t('new.dueHint'))}</div>
      <div class="due-chips mb-2">${DUE_CHIPS.map(([d, key]) => `<button type="button" class="due-chip ${addDays(d) === draft.dueDate ? 'active' : ''}" data-act="due" data-days="${d}">${esc(t(key, d === 3 ? { n: 3 } : null))}</button>`).join('')}</div>
      <input type="date" id="due-date" class="form-control form-control-lg" min="${today()}" value="${esc(draft.dueDate)}">
      <div class="form-check form-switch mt-3 urgent-row">
        <input class="form-check-input" type="checkbox" id="urgent" ${draft.urgent ? 'checked' : ''}>
        <label class="form-check-label" for="urgent"><span class="fw-semibold"><i class="bi bi-lightning-charge-fill text-warning"></i> ${esc(t('new.urgent'))}</span>
          <div class="small text-body-secondary">${esc(t('new.urgentHint', { pct: num(getSettings().urgentPercent) }))}</div></label>
      </div>
    </section>

    <section class="step-card mb-3">
      <div class="step-title"><span class="step-no">6</span>${esc(t('new.advance'))}</div>
      <div class="row g-2">
        <div class="col-6"><input type="number" inputmode="decimal" min="0" step="1" id="advance" class="form-control form-control-lg" value="${draft.advance || ''}" placeholder="0"></div>
        <div class="col-6"><select id="method" class="form-select form-select-lg" aria-label="${esc(t('tickets.method'))}">
          ${METHODS.map((m) => `<option value="${m}" ${draft.method === m ? 'selected' : ''}>${esc(t(`tickets.${m}`))}</option>`).join('')}</select></div>
      </div>
      <label class="form-label small mt-3 mb-1">${esc(t('new.note'))}</label>
      <input id="note" class="form-control" maxlength="300" value="${esc(draft.note)}" placeholder="${esc(t('new.notePh'))}">
    </section>

    <section class="bill-card mb-3">
      <div class="bill-row"><span>${esc(t('new.subtotal'))}</span><span>${money(c.subtotal)}</span></div>
      ${draft.urgent ? `<div class="bill-row text-warning-emphasis"><span>${esc(t('new.surcharge'))} (${c.pct}%)</span><span>${money(c.surcharge)}</span></div>` : ''}
      <div class="bill-row bill-total"><span>${esc(t('new.total'))}</span><span class="bill-amt" data-count="${c.total}">${money(c.total)}</span></div>
      <div class="bill-row"><span>${esc(t('new.advance'))}</span><span>${money(c.advance)}</span></div>
      <div class="bill-row bill-balance ${c.balance > 0 ? '' : 'is-paid'}"><span>${esc(c.balance > 0 ? t('new.balance') : t('tickets.paid'))}</span><span>${money(c.balance)}</span></div>
    </section>

    <div class="sticky-actions">
      <button type="button" class="btn btn-outline-brand btn-lg flex-fill" data-act="save-print"><i class="bi bi-printer"></i> ${esc(t('new.saveAndPrint'))}</button>
      <button type="button" class="btn btn-brand btn-lg flex-fill" data-act="save"><i class="bi bi-check2-circle"></i> ${esc(t('new.save'))}</button>
    </div>
  </div>`);
  UI.countUp($el[0], (n) => money(n));
}

export default {
  render(el) {
    draft = loadDraft();
    const $el = $(el).off();
    $el.on('click', '[data-act]', async function () {
      const act = this.dataset.act;
      if (act === 'svc') { draft.service = this.dataset.svc; saveDraft(); return draw(); }
      if (act === 'due') { draft.dueDate = addDays(Number(this.dataset.days)); saveDraft(); return draw(); }
      if (act === 'inc') return changeQty(Number(this.dataset.idx), 1);
      if (act === 'dec') return changeQty(Number(this.dataset.idx), -1);
      if (act === 'customer') return pickCustomer();
      if (act === 'newcust') {
        const c = await customerForm();
        if (c) { draft.customer = { id: c.id, name: c.name, phone: c.phone || '' }; saveDraft(); draw(); }
        return undefined;
      }
      if (act === 'clear') {
        if (!(await UI.confirmDialog(t('new.clearConfirm'), { okLabel: t('new.clear'), okClass: 'btn-danger' }))) return undefined;
        draft = freshDraft(); pref.remove(DRAFT_KEY); return draw();
      }
      if (act === 'save') return save(false);
      if (act === 'save-print') return save(true);
      return undefined;
    });
    $el.on('click', '.g-tile:not([disabled])', function () { addGarment(this.dataset.g); });
    $el.on('change', '#due-date', function () { draft.dueDate = this.value || draft.dueDate; saveDraft(); draw(); });
    $el.on('change', '#urgent', function () { draft.urgent = this.checked; saveDraft(); draw(); });
    $el.on('change', '#advance', function () { draft.advance = Math.max(0, num(this.value)); saveDraft(); draw(); });
    $el.on('change', '#method', function () { draft.method = this.value; saveDraft(); });
    $el.on('change', '#note', function () { draft.note = this.value.trim(); saveDraft(); });
    draw();
  },
  destroy() { draft = null; },
};

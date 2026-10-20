// Home: today's numbers, tickets ready for pickup and pickups due today or late.
import * as UI from '../core/ui.js';
import { esc } from '../core/utils.js';
import { getSettings, pref } from '../core/settings.js';
import { t, pick2 } from '../i18n/i18n.js';
import { listTickets, inRange, paymentsBetween } from '../dc/data.js';
import { money, today, dueState, normPhone, waLink, readyMessage, statusLabel } from '../dc/format.js';

const $ = window.jQuery;
const BACKUP_DAYS = 7;

const isDue = (tk) => tk.status !== 'delivered' && dueState(tk) !== '';

function row(tk) {
  const wa = waLink(tk.customerPhone, readyMessage(tk));
  const s = dueState(tk);
  return `<div class="list-row home-row">
    <a class="main text-decoration-none text-reset" href="#/tickets/${encodeURIComponent(tk.id)}">
      <div class="title">${esc(tk.number)} · ${esc(tk.customerName)}</div>
      <div class="sub"><span class="status-pill s-${tk.status}">${esc(statusLabel(tk.status))}</span>
        ${s ? `<span class="due-chip mini ${s}">${esc(s === 'late' ? t('status.overdue') : t('status.due_today'))}</span>` : ''}
        ${tk.balance > 0.005 ? `<span class="text-danger fw-semibold">${esc(t('tickets.balance'))}: ${money(tk.balance)}</span>` : ''}</div>
    </a>
    <div class="row-actions">
      ${normPhone(tk.customerPhone) ? `<a class="btn btn-icon btn-outline-brand" href="tel:${esc(normPhone(tk.customerPhone))}" aria-label="${esc(t('common.call'))}"><i class="bi bi-telephone"></i></a>` : ''}
      ${wa && tk.status === 'ready' ? `<a class="btn btn-icon btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="${esc(t('common.whatsapp'))}"><i class="bi bi-whatsapp"></i></a>` : ''}
    </div>
  </div>`;
}

export default {
  async render(el) {
    const $el = $(el).off();
    const tickets = await listTickets();
    const td = today();
    const s = getSettings();
    const shop = pick2({ en: s.business.name, ur: s.business.nameUr || s.business.name }, t('app.name'));

    const madeToday = tickets.filter((tk) => inRange(tk.createdAt, td, td));
    const billedToday = madeToday.reduce((sum, tk) => sum + tk.total, 0);
    const ready = tickets.filter((tk) => tk.status === 'ready').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const due = tickets.filter(isDue).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const cashToday = paymentsBetween(tickets, td, td).reduce((sum, p) => sum + p.amount, 0);
    const lastBackup = pref.get('lastBackupAt');
    const backupOld = tickets.length && (!lastBackup || (Date.now() - Date.parse(lastBackup)) / 86400000 > BACKUP_DAYS);

    $el.html(`<div class="home">
      <section class="home-hero">
        <div class="hero-text">
          <div class="hero-hello">${esc(t('home.hello'))}</div>
          <div class="hero-shop">${esc(shop)}</div>
          <div class="hero-sub">${esc(t('home.sub'))}</div>
          <a href="#/new" class="btn btn-hero mt-3"><i class="bi bi-plus-circle-fill"></i> ${esc(t('home.newTicket'))}</a>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="washer">
            <div class="washer-door"><div class="drum"></div></div>
            <span class="bubble b1"></span><span class="bubble b2"></span><span class="bubble b3"></span>
          </div>
        </div>
      </section>

      ${backupOld ? `<a class="alert alert-warning d-flex align-items-center gap-2 small text-decoration-none mb-3" href="#/settings"><i class="bi bi-cloud-arrow-down fs-5"></i><span class="flex-grow-1">${esc(t('home.backupWarn'))}</span><span class="btn btn-sm btn-warning">${esc(t('home.backupNow'))}</span></a>` : ''}

      <div class="stat-grid mb-3">
        <a class="stat-card c-indigo" href="#/tickets">
          <div class="stat-ico"><i class="bi bi-inbox"></i></div>
          <div class="stat-val" data-count="${madeToday.length}">${madeToday.length}</div>
          <div class="stat-lbl">${esc(t('home.received'))}</div>
          <div class="stat-sub">${esc(t('home.receivedSub', { count: madeToday.length, amount: money(billedToday) }))}</div>
        </a>
        <a class="stat-card c-green" href="#/tickets">
          <div class="stat-ico"><i class="bi bi-bag-check"></i></div>
          <div class="stat-val" data-count="${ready.length}">${ready.length}</div>
          <div class="stat-lbl">${esc(t('home.ready'))}</div>
          <div class="stat-sub">${esc(t('home.readySub'))}</div>
        </a>
        <a class="stat-card c-amber" href="#/tickets">
          <div class="stat-ico"><i class="bi bi-calendar-check"></i></div>
          <div class="stat-val" data-count="${due.length}">${due.length}</div>
          <div class="stat-lbl">${esc(t('home.due'))}</div>
          <div class="stat-sub">${esc(t('home.dueSub'))}</div>
        </a>
        <a class="stat-card c-teal" href="#/reports">
          <div class="stat-ico"><i class="bi bi-cash-stack"></i></div>
          <div class="stat-val stat-money" data-count="${cashToday}">${money(cashToday)}</div>
          <div class="stat-lbl">${esc(t('home.cash'))}</div>
          <div class="stat-sub">${esc(t('home.cashSub'))}</div>
        </a>
      </div>

      <section class="mb-3">
        <h2 class="section-h"><i class="bi bi-bag-check text-success"></i> ${esc(t('home.readyList'))}</h2>
        <div class="list-card">${ready.length ? ready.slice(0, 8).map(row).join('') : `<div class="p-3 text-body-secondary small">${esc(t('home.emptyReady'))}</div>`}</div>
        ${ready.length > 8 ? `<a class="small d-block mt-2" href="#/tickets">${esc(t('home.seeAll'))} →</a>` : ''}
      </section>

      <section class="mb-4">
        <h2 class="section-h"><i class="bi bi-calendar-event text-warning"></i> ${esc(t('home.dueList'))}</h2>
        <div class="list-card">${due.length ? due.slice(0, 8).map(row).join('') : `<div class="p-3 text-body-secondary small">${esc(t('home.emptyDue'))}</div>`}</div>
      </section>
    </div>`);
    UI.countUp($el[0], (n, el) => (el.classList.contains('stat-money') ? money(n) : String(Math.round(n))));
  },
  destroy() {},
};

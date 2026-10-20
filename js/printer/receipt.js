// Builds a printer-independent ticket receipt and renders it to ESC/POS bytes or HTML.
import { getSettings } from '../core/settings.js';
import { fmtNum, fmtQty, esc } from '../core/utils.js';
import { EscPos, isPlain } from './escpos.js';
import * as Raster from './raster.js';
import { t, pick2 } from '../i18n/i18n.js';
import { fmtDate, fmtDateTime, phoneText, statusLabel } from '../dc/format.js';

// Ticket receipt: the customer's copy, shown in the language the counter is using.
export function buildTicketReceipt(tk) {
  const s = getSettings();
  const b = s.business;
  const shop = pick2({ en: b.name, ur: b.nameUr || b.name }, t('app.name'));
  const m = {
    header: [shop, b.address, b.phone ? `${t('common.phone')}: ${phoneText(b.phone)}` : ''].filter(Boolean),
    title: t('tickets.title') + ' — ' + t('tickets.number') + ' ' + tk.number,
    info: [
      [t('tickets.customer'), tk.customerName],
      [t('common.phone'), phoneText(tk.customerPhone)],
      [t('tickets.received'), fmtDateTime(tk.createdAt)],
      [t('tickets.due'), tk.dueDate ? fmtDate(tk.dueDate) : '—'],
      [t('tickets.status'), statusLabel(tk.status)],
    ],
    items: tk.items.map((i) => ({ name: pick2(i.name) + ' · ' + t(`svc.${i.service}`), qty: i.qty, unit: '', rate: i.rate, amount: i.amount })),
    totals: [],
    footer: b.footer || '',
    void: false,
  };
  if (tk.urgent) m.totals.push([t('tickets.urgent'), tk.surcharge]);
  m.totals.push([t('tickets.total'), tk.total, true]);
  m.totals.push([t('tickets.advance'), tk.paid]);
  m.totals.push([t('tickets.balance'), tk.balance, true]);
  if (tk.payments?.length) m.payment = tk.payments.map((p) => t(`tickets.${p.method}`)).join(', ');
  if (tk.note) m.note = tk.note;
  return m;
}

// Async because Urdu/non-Latin lines are rendered with the Jameel Noori Nastaleeq web font.
export async function toEscPos(m, width = 58) {
  await Raster.ensureFont();
  const p = new EscPos(width, Raster, { imageMode: getSettings().printer.imageMode });
  const cur = getSettings().currency;
  p.align('center');
  m.header.forEach((h, i) => { if (i === 0) p.bold(true).size(true).wrap(h, Math.floor(p.cols / 2)).size(false).bold(false); else p.wrap(h); });
  p.hr().bold(true).wrap(m.title).bold(false);
  p.align('left');
  m.info.forEach(([k, v]) => { if (k) p.lr(k + ':', String(v ?? '')); });
  if (m.items.length) {
    p.hr();
    m.items.forEach((i) => {
      p.wrap(i.name);
      p.lr(`  ${fmtQty(i.qty)} x ${fmtNum(i.rate)}`, fmtNum(i.amount));
    });
  }
  p.hr();
  m.totals.forEach(([k, v, strong]) => { if (strong) p.bold(true); p.lr(k, `${v < 0 ? '-' : ''}${cur} ${fmtNum(Math.abs(v))}`); if (strong) p.bold(false); });
  if (m.payment) p.lr(t('tickets.method'), m.payment);
  if (m.note) { p.hr(); p.wrap(m.note); }
  p.hr().align('center');
  if (m.footer) p.wrap(m.footer);
  p.feed(3).cut();
  return p.bytes();
}

// Urdu/RTL text is wrapped so it uses Jameel Noori Nastaleeq and right-to-left layout.
const tx = (s) => (isPlain(s) ? esc(s) : `<span class="ur" dir="auto">${esc(s)}</span>`);

export function toHTML(m, width = 58) {
  const cur = esc(getSettings().currency);
  const row = (l, r, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${r}</td></tr>`;
  return `<div class="receipt w${Number(width) === 80 ? 80 : 58}">
    ${m.header.map((h, i) => `<div class="c ${i === 0 ? 'b big' : ''}">${tx(h)}</div>`).join('')}
    <hr><div class="c b">${tx(m.title)}</div>
    <table>${m.info.filter(([k]) => k).map(([k, v]) => row(esc(k) + ':', tx(v))).join('')}</table>
    ${m.items.length ? '<hr><table>' + m.items.map((i) => `<tr><td colspan="2">${tx(i.name)}</td></tr>${row(`&nbsp;&nbsp;${fmtQty(i.qty)} x ${fmtNum(i.rate)}`, fmtNum(i.amount))}`).join('') + '</table>' : ''}
    <hr><table>${m.totals.map(([k, v, strong]) => row(tx(k), `${v < 0 ? '-' : ''}${cur} ${fmtNum(Math.abs(v))}`, strong ? 'b' : '')).join('')}</table>
    ${m.payment ? `<div>${esc(t('tickets.method'))}: ${tx(m.payment)}</div>` : ''}
    ${m.note ? `<hr><div>${tx(m.note)}</div>` : ''}
    <hr>${m.footer ? `<div class="c">${tx(m.footer)}</div>` : ''}</div>`;
}

// Formatting helpers for money, dates, phone numbers, ticket status and WhatsApp messages.
import { getSettings } from '../core/settings.js';
import { localDate, round2 } from '../core/utils.js';
import { t, lang, pick2 } from '../i18n/i18n.js';

const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const money = (n) => `${getSettings().currency} ${moneyFmt.format(round2(n || 0))}`;

export const today = () => localDate();
export function addDays(days, from = today()) {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

const dateFmt = () => new Intl.DateTimeFormat(lang() === 'ur' ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  return dateFmt().format(new Date(`${dateStr.slice(0, 10)}T00:00:00`));
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(lang() === 'ur' ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Phone numbers as Pakistani mobile numbers: 03xx-xxxxxxx. Returns the normalised 11-digit form or ''.
export function normPhone(s) {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  return /^03\d{9}$/.test(d) ? d : '';
}
export const phoneText = (s) => { const d = normPhone(s); return d ? `${d.slice(0, 4)}-${d.slice(4)}` : String(s ?? ''); };

// Opens a WhatsApp chat with a prefilled message (the user still presses send).
export function waLink(phone, text) {
  const d = normPhone(phone);
  if (!d) return null;
  return `https://wa.me/92${d.slice(1)}?text=${encodeURIComponent(text)}`;
}

export const STATUS_ORDER = ['received', 'processing', 'ready', 'delivered'];
export const statusLabel = (s) => t(`status.${s}`);

// 'late' | 'today' | '' for pickup-date highlighting. Delivered tickets never count as late.
export function dueState(ticket) {
  if (!ticket || ticket.status === 'delivered' || !ticket.dueDate) return '';
  const td = today();
  if (ticket.dueDate < td) return 'late';
  if (ticket.dueDate === td) return 'today';
  return '';
}

export const garmentCount = (ticket) => (ticket.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
export const itemsSummary = (ticket) => (ticket.items || []).map((i) => `${pick2(i.name)} ×${i.qty}`).join(', ');

// Message sent when clothes are ready. Uses the shop name in the current language.
export function readyMessage(ticket) {
  const s = getSettings().business;
  const shop = pick2({ en: s.name, ur: s.nameUr || s.name }, t('app.name'));
  const balance = ticket.balance > 0 ? `\n${t('tickets.balance')}: ${money(ticket.balance)}` : '';
  if (lang() === 'ur') {
    return `السلام علیکم ${ticket.customerName || ''}،\nآپ کے کپڑے تیار ہیں۔ ٹکٹ نمبر: ${ticket.number}${balance}\nبراہ کرم دکان ${shop} سے لے لیں۔${s.phone ? `\nفون: ${s.phone}` : ''}`;
  }
  return `Assalam o Alaikum ${ticket.customerName || ''},\nYour clothes are ready. Ticket no: ${ticket.number}${balance}\nPlease collect them from ${shop}.${s.phone ? `\nPhone: ${s.phone}` : ''}`;
}

// Message for an error thrown by dc/data.js (translated) or any other error (raw text).
export const errText = (e) => (e?.key ? t(e.key, e.vars) : (e?.message || String(e)));

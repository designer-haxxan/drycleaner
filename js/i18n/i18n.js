// Language handling: t(key) lookup, Urdu (RTL) / English (LTR) switch and static HTML translation.
import { STRINGS } from './strings.js';
import { pref } from '../core/settings.js';
import { CDN } from '../config.js';

export const LANGS = ['ur', 'en'];
const DEFAULT_LANG = 'ur';

let current = LANGS.includes(pref.get('lang')) ? pref.get('lang') : DEFAULT_LANG;

export const lang = () => current;
export const isUrdu = () => current === 'ur';

// Translate a key, filling {placeholders}. Falls back to English, then to the key itself.
export function t(key, vars = null) {
  let s = STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// Pick the Urdu or English value of a bilingual field such as { en, ur }.
export const pick2 = (obj, fallback = '') => {
  if (!obj) return fallback;
  if (typeof obj === 'string') return obj;
  return (isUrdu() ? obj.ur : obj.en) || obj.en || obj.ur || fallback;
};

// Sets <html lang/dir>, swaps the RTL Bootstrap stylesheet and translates elements marked with data-i18n.
export function applyLanguage() {
  const root = document.documentElement;
  root.lang = current;
  root.dir = isUrdu() ? 'rtl' : 'ltr';
  document.body?.classList.toggle('is-urdu', isUrdu());
  let link = document.getElementById('bs-rtl');
  if (isUrdu() && !link) {
    link = document.createElement('link');
    link.id = 'bs-rtl'; link.rel = 'stylesheet'; link.href = CDN.bootstrapRtl;
    document.head.appendChild(link);
  } else if (!isUrdu() && link) {
    link.remove();
  }
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  // The language button always names the other language.
  document.querySelectorAll('#lang-btn, #login-lang-btn').forEach((el) => { el.textContent = t('lang.switch'); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPh)); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.title = t('app.name');
}

export function setLanguage(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  pref.set('lang', next);
  applyLanguage();
  document.dispatchEvent(new CustomEvent('lang:changed', { detail: next }));
}

export function toggleLanguage() {
  setLanguage(isUrdu() ? 'en' : 'ur');
}

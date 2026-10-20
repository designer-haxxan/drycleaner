// Application bootstrap: service worker, database, authentication gate, navigation, language and routing.
import { applyTheme, getSettings } from './core/settings.js';
import * as UI from './core/ui.js';
import { esc } from './core/utils.js';
import { openDB } from './db/idb.js';
import * as Auth from './services/auth.js';
import { t, pick2, applyLanguage, toggleLanguage } from './i18n/i18n.js';

const $ = window.jQuery;

// Route table: name → [loader, title key, icon, menu section, in side menu]
const ROUTES = {
  home: [() => import('./modules/home.js'), 'nav.home', 'house-door-fill', 'main'],
  new: [() => import('./modules/ticket-new.js'), 'nav.new', 'plus-circle-fill', 'main'],
  tickets: [() => import('./modules/tickets.js'), 'nav.tickets', 'receipt', 'main'],
  customers: [() => import('./modules/customers.js'), 'nav.customers', 'people', 'main'],
  prices: [() => import('./modules/prices.js'), 'nav.prices', 'tags', 'manage'],
  reports: [() => import('./modules/reports.js'), 'nav.reports', 'bar-chart-line', 'manage'],
  settings: [() => import('./modules/settings.js'), 'nav.settings', 'gear', 'manage'],
};
const SECTIONS = ['main', 'manage'];
const SECTION_LABEL = { main: 'nav.main', manage: 'nav.manage' };

let currentModule = null;
let routeToken = 0;
let deferredInstall = null;
let expiryTimer = null;

function showView(name) {
  $('#splash').addClass('d-none');
  $('#view-login').toggleClass('d-none', name !== 'login');
  $('#view-app').toggleClass('d-none', name !== 'app');
}

function fatal(msg) {
  $('#splash-error').text(msg);
  $('#splash .spinner-border').addClass('d-none');
}

// ---------- Service worker & install ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  // New versions install and activate on their own (see service-worker.js); check whenever the app is opened.
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    const check = () => {
      if (!navigator.onLine) return;
      reg.update().catch(() => {});
      // Other apps on this origin can wipe our offline cache; ask the worker to rebuild it if needed.
      (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'ENSURE_CACHE' });
    };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch((e) => console.warn('Service worker registration failed:', e));
  // Reload when an update replaces an existing worker, so the page never mixes files from two versions.
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !reloading) { reloading = true; location.reload(); }
    controlled = true;
  });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#install-btn').removeClass('d-none'); });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('#install-btn').addClass('d-none'); UI.toast(t('install.done')); });
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null; $('#install-btn').addClass('d-none');
  return true;
}

// ---------- Connection badge & language button ----------
function renderConn(status) {
  const online = status === 'online';
  $('#conn-badge').attr('class', `badge rounded-pill conn-${online ? 'online' : 'offline'}`)
    .html(`<i class="bi bi-${online ? 'wifi' : 'wifi-off'}"></i> <span>${esc(t(online ? 'conn.online' : 'conn.offline'))}</span>`);
  $('#login-conn').html(navigator.onLine
    ? `<i class="bi bi-wifi text-success"></i> ${esc(t('login.online'))}`
    : `<i class="bi bi-wifi-off text-danger"></i> ${esc(t('login.offline'))}`);
}
window.addEventListener('online', () => renderConn('online'));
window.addEventListener('offline', () => renderConn('offline'));

const shopName = () => {
  const b = getSettings().business;
  return pick2({ en: b.name, ur: b.nameUr || b.name }, t('app.name'));
};

function updateBrand() {
  $('#brand-name, #login-brand').text(shopName());
}

// ---------- Navigation ----------
function buildMenu() {
  let html = '';
  for (const section of SECTIONS) {
    html += `<div class="nav-section">${esc(t(SECTION_LABEL[section]))}</div>`;
    for (const [name, [, title, icon, sec]] of Object.entries(ROUTES)) {
      if (sec !== section) continue;
      html += `<a class="nav-link" href="#/${name}" data-route="${name}"><i class="bi bi-${icon}"></i>${esc(t(title))}</a>`;
    }
  }
  $('.nav-menu').html(html);
  const u = Auth.user();
  $('#user-name').text(u?.name || '');
  $('#user-avatar').text(UI.initials(u?.name || 'DC'));
  $('#lang-btn').text(t('lang.switch')).attr('aria-label', t('lang.aria'));
  $('#install-btn span').text(t('install.btn'));
  updateBrand();
  applyTheme();
}

async function route() {
  if (!Auth.user()) return;
  if (checkExpiry()) return;
  const token = ++routeToken;
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/').map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'home';
  const [loader, titleKey] = ROUTES[name];
  try { currentModule?.destroy?.(); } catch (e) { console.warn(e); }
  currentModule = null;
  bootstrap.Offcanvas.getInstance('#menu-offcanvas')?.hide();
  $('.nav-menu .nav-link, #bottom-nav a').removeClass('active');
  $(`.nav-menu [data-route="${name}"], #bottom-nav [data-route="${name}"]`).addClass('active');
  $('#topbar-title').text(t(titleKey));
  const $c = $('#content').off();
  $c.html(UI.spinner());
  try {
    const mod = (await loader()).default;
    if (token !== routeToken) return;
    currentModule = mod;
    window.scrollTo(0, 0);
    $c.removeClass('page-enter');
    await mod.render($c[0], { route: name, params: parts.slice(1), setTitle: (x) => $('#topbar-title').text(x) });
    if (token === routeToken) { void $c[0].offsetWidth; $c.addClass('page-enter'); }
  } catch (e) {
    console.error(e);
    if (token === routeToken) $c.html(UI.errorState(e));
  }
}

// ---------- Auth gate ----------
async function startApp() {
  buildMenu();
  showView('app');
  renderConn(navigator.onLine ? 'online' : 'offline');
  clearInterval(expiryTimer);
  expiryTimer = setInterval(checkExpiry, 60000);
  if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  route();
}

async function doLogout(forced = false, reason = '') {
  if (!forced && !await UI.confirmDialog(t('auth.logoutConfirm'), { okLabel: t('auth.logoutOk'), okClass: 'btn-danger' })) return;
  clearInterval(expiryTimer);
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  Auth.logout();
  $('#content').empty();
  showLogin(reason);
}

// Sessions are valid until expiresAt (set by the server); after that an online sign-in is required.
function checkExpiry() {
  if (!Auth.sessionExpired()) return false;
  UI.toast(t('auth.expired'), 'warning', 6000);
  doLogout(true, t('auth.expired'));
  return true;
}

function showLogin(reason = '') {
  showView('login');
  renderConn(navigator.onLine ? 'online' : 'offline');
  $('#login-notice').toggleClass('d-none', !reason).text(reason);
  setTimeout(() => $('#login-username').trigger('focus'), 50);
}

$('#login-form').on('submit', async (e) => {
  e.preventDefault();
  const $btn = $('#login-btn').prop('disabled', true).html(`<span class="spinner-border spinner-border-sm"></span><span>${esc(t('login.busy'))}</span>`);
  $('#login-error').addClass('d-none');
  try {
    await Auth.login($('#login-username').val(), $('#login-password').val());
    $('#login-password').val('');
    await startApp();
  } catch (err) {
    $('#login-error').text(err.message || t('common.error')).removeClass('d-none');
    $('.auth-card').removeClass('shake'); void $('.auth-card')[0].offsetWidth; $('.auth-card').addClass('shake');
  } finally { $btn.prop('disabled', false).html(`<span>${esc(t('login.submit'))}</span><i class="bi bi-arrow-right"></i>`); }
});
$('#toggle-pw').on('click', () => {
  const $i = $('#login-password'); const show = $i.attr('type') === 'password';
  $i.attr('type', show ? 'text' : 'password');
  $('#toggle-pw i').attr('class', show ? 'bi bi-eye-slash' : 'bi bi-eye');
});
$('#lang-btn, #login-lang-btn').on('click', toggleLanguage);
$('#logout-btn').on('click', () => doLogout(false));
$('#install-btn').on('click', promptInstall);
window.addEventListener('hashchange', route);
document.addEventListener('settings:changed', () => { applyTheme(); if (Auth.user()) updateBrand(); });
document.addEventListener('lang:changed', () => {
  renderConn(navigator.onLine ? 'online' : 'offline');
  if (Auth.user()) { buildMenu(); route(); }
});
document.addEventListener('data:changed', () => { if (Auth.user()) route(); });
document.addEventListener('app:logout', () => doLogout(false));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- Boot ----------
(async function boot() {
  applyLanguage();
  applyTheme();
  registerSW();
  if (!window.jQuery || !window.bootstrap) return fatal(t('common.error'));
  try { await openDB(); } catch (e) { return fatal(e.message || String(e)); }
  const { user, reason } = Auth.restoreSession();
  if (user) {
    try { await startApp(); } catch (e) { console.error(e); fatal(e.message || String(e)); }
  } else showLogin(reason || '');
})();

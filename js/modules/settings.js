// Settings: shop details, language and theme, receipt printer, backup & restore, log out.
import * as UI from '../core/ui.js';
import { esc, downloadFile } from '../core/utils.js';
import { getSettings, saveSettings, pref } from '../core/settings.js';
import { t, lang, setLanguage } from '../i18n/i18n.js';
import * as Printer from '../printer/printer.js';
import * as Backup from '../dc/backup.js';
import { fmtDateTime } from '../dc/format.js';
import { CONFIG } from '../config.js';

const $ = window.jQuery;

const card = (icon, title, body) => `<section class="card card-soft p-3 mb-3">
  <h2 class="h6 mb-3 d-flex align-items-center gap-2"><span class="set-ico"><i class="bi bi-${icon}"></i></span>${esc(title)}</h2>${body}</section>`;

function printerBox() {
  const s = getSettings().printer;
  const cap = Printer.capabilities();
  return `<div class="alert ${cap.webBluetooth ? 'alert-info' : 'alert-secondary'} small py-2">${esc(cap.note)}</div>
    <form class="f-printer row g-2">
      <div class="col-12"><label class="form-label">${esc(t('set.printMethod'))}</label>
        <select name="method" class="form-select form-select-lg">
          <option value="browser" ${s.method === 'browser' ? 'selected' : ''}>${esc(t('set.printBrowser'))}</option>
          <option value="bluetooth" ${s.method === 'bluetooth' ? 'selected' : ''} ${cap.webBluetooth ? '' : 'disabled'}>${esc(t('set.printBt'))}</option>
          <option value="rawbt" ${s.method === 'rawbt' ? 'selected' : ''}>${esc(t('set.printRaw'))}</option>
        </select></div>
      <div class="col-6"><label class="form-label">${esc(t('set.paper'))}</label>
        <select name="width" class="form-select"><option value="58" ${s.width == 58 ? 'selected' : ''}>58 mm</option><option value="80" ${s.width == 80 ? 'selected' : ''}>80 mm</option></select></div>
      <div class="col-6"><label class="form-label">${esc(t('set.copies'))}</label>
        <input name="copies" type="number" min="1" max="5" class="form-control" value="${s.copies || 1}"></div>
    </form>
    <div class="d-flex flex-wrap gap-2 mt-3">
      ${s.method === 'bluetooth' ? `<button class="btn btn-outline-brand btn-bt-connect"><i class="bi bi-bluetooth"></i> ${esc(t('set.connect'))}</button>
        <button class="btn btn-outline-secondary btn-bt-disconnect">${esc(t('set.disconnect'))}</button>` : ''}
      <button class="btn btn-brand btn-test-print"><i class="bi bi-printer"></i> ${esc(t('set.testPrint'))}</button>
    </div>`;
}

function backupBox() {
  const last = pref.get('lastBackupAt');
  return `<p class="small text-body-secondary">${esc(t('set.backupHint'))}</p>
    <div class="small mb-3">${last ? esc(t('set.lastBackup', { date: fmtDateTime(last) })) : `<span class="text-danger">${esc(t('set.neverBackup'))}</span>`}</div>
    <div class="d-grid gap-2">
      <button class="btn btn-brand btn-lg btn-export"><i class="bi bi-cloud-arrow-down"></i> ${esc(t('set.export'))}</button>
      <label class="btn btn-outline-brand btn-lg mb-0"><i class="bi bi-cloud-arrow-up"></i> ${esc(t('set.import'))}
        <input type="file" accept="application/json,.json" class="d-none" id="backup-file"></label>
    </div>`;
}

async function importFile(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { return UI.toast(t('set.importBad', { error: 'JSON' }), 'danger', 6000); }
  const check = await Backup.validateBackup(obj);
  if (!check.ok) return UI.toast(t('set.importBad', { error: check.errors[0] }), 'danger', 6000);
  const c = check.counts;
  const result = await UI.formModal({
    title: t('set.import'),
    body: `<div class="small mb-3">${obj.createdAt ? esc(fmtDateTime(obj.createdAt)) : ''}<br>${esc(t('nav.customers'))}: <b>${c.customers || 0}</b> · ${esc(t('nav.tickets'))}: <b>${c.tickets || 0}</b></div>
      <label class="form-label fw-semibold">${esc(t('set.importMode'))}</label>
      <div class="form-check mb-2"><input class="form-check-input" type="radio" name="mode" id="m-merge" value="merge" checked><label class="form-check-label" for="m-merge">${esc(t('set.importMerge'))}</label></div>
      <div class="form-check"><input class="form-check-input" type="radio" name="mode" id="m-replace" value="replace"><label class="form-check-label" for="m-replace">${esc(t('set.importReplace'))}</label></div>
      <div class="replace-box mt-3 d-none"><label class="form-label small">${esc(t('set.importConfirm'))}</label><input name="confirm" class="form-control" autocomplete="off"></div>`,
    submitLabel: t('set.import'),
    submitClass: 'btn-warning',
    onShown: (m) => m.on('change', 'input[name=mode]', function () { m.find('.replace-box').toggleClass('d-none', this.value !== 'replace'); }),
    onSubmit: async (v) => {
      if (v.mode === 'replace' && v.confirm.trim() !== 'REPLACE') throw new Error(t('set.importConfirm'));
      await UI.withLoading(() => Backup.restore(obj, v.mode), t('common.pending'));
      return true;
    },
  });
  if (result) {
    UI.toast(t('set.importDone'));
    document.dispatchEvent(new CustomEvent('data:changed'));
  }
}

const page = {
  render(el) {
    const $el = $(el).off();
    const s = getSettings();
    const b = s.business;
    $el.html(UI.pageHeader(t('set.title')) + `
      ${card('shop', t('set.shop'), `<form class="f-shop row g-2">
        <div class="col-12"><label class="form-label">${esc(t('set.shopName'))}</label><input name="name" class="form-control" value="${esc(b.name)}"></div>
        <div class="col-12"><label class="form-label">${esc(t('set.shopNameUr'))}</label><input name="nameUr" class="form-control ur-input" dir="auto" value="${esc(b.nameUr)}"></div>
        <div class="col-12"><label class="form-label">${esc(t('set.address'))}</label><input name="address" class="form-control" value="${esc(b.address)}"></div>
        <div class="col-6"><label class="form-label">${esc(t('set.phone'))}</label><input name="phone" type="tel" class="form-control" value="${esc(b.phone)}"></div>
        <div class="col-6"><label class="form-label">${esc(t('set.footer'))}</label><input name="footer" class="form-control" value="${esc(b.footer)}"></div>
        <div class="col-12"><button class="btn btn-brand">${esc(t('common.save'))}</button></div></form>`)}

      ${card('translate', t('set.lang'), `<div class="lang-seg" role="group">
        <button class="lang-btn ${lang() === 'ur' ? 'active' : ''}" data-lang="ur">اردو</button>
        <button class="lang-btn ${lang() === 'en' ? 'active' : ''}" data-lang="en">English</button></div>`)}

      ${card('palette', t('set.theme'), `<select class="form-select f-theme">
        <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>${esc(t('set.themeAuto'))}</option>
        <option value="light" ${s.theme === 'light' ? 'selected' : ''}>${esc(t('set.themeLight'))}</option>
        <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>${esc(t('set.themeDark'))}</option></select>`)}

      ${card('printer', t('set.printer'), printerBox())}
      ${card('cloud-check', t('set.backup'), backupBox())}

      <section class="mb-4">
        <button class="btn btn-outline-danger w-100 btn-lg btn-logout"><i class="bi bi-box-arrow-right"></i> ${esc(t('set.logout'))}</button>
        <div class="small text-body-secondary text-center mt-2">${esc(t('set.logoutHint'))}</div>
        <div class="small text-body-secondary text-center mt-3">${esc(t('app.name'))} · v${esc(CONFIG.APP_VERSION)}</div>
      </section>`);

    $el.on('submit', '.f-shop', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.currentTarget).entries());
      saveSettings({ business: { name: v.name.trim(), nameUr: v.nameUr.trim(), address: v.address.trim(), phone: v.phone.trim(), footer: v.footer.trim() } });
      UI.toast(t('set.shopSaved'));
      document.dispatchEvent(new CustomEvent('settings:changed', { detail: getSettings() }));
    });
    $el.on('click', '.lang-btn', (e) => setLanguage(e.currentTarget.dataset.lang));
    $el.on('change', '.f-theme', function () { saveSettings({ theme: this.value }); });
    $el.on('change', '.f-printer', function () {
      const v = Object.fromEntries(new FormData(this).entries());
      saveSettings({ printer: { method: v.method, width: Number(v.width), copies: Math.min(5, Math.max(1, Number(v.copies) || 1)) } });
      page.render(el);
    });
    $el.on('click', '.btn-bt-connect', async () => {
      try { await Printer.connectBluetooth(); UI.toast(t('set.connect')); } catch (e) { UI.toast(e.message, 'danger', 6000); }
    });
    $el.on('click', '.btn-bt-disconnect', () => Printer.disconnect());
    $el.on('click', '.btn-test-print', async () => {
      try { await Printer.testPrint(); } catch (e) { UI.toast(e.message, 'danger', 6000); }
    });
    $el.on('click', '.btn-export', async () => {
      const b2 = await UI.withLoading(() => Backup.createBackup(), t('common.pending'));
      const stamp = b2.createdAt.slice(0, 10);
      downloadFile(`drycleaner-backup-${stamp}.json`, JSON.stringify(b2), 'application/json');
      pref.set('lastBackupAt', b2.createdAt);
      page.render(el);
    });
    $el.on('change', '#backup-file', function () {
      const file = this.files?.[0];
      this.value = '';
      if (file) importFile(file);
    });
    $el.on('click', '.btn-logout', () => document.dispatchEvent(new CustomEvent('app:logout')));
  },
  destroy() {},
};

export default page;

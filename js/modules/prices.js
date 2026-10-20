// Price list: the rate for every garment and service, plus the urgent surcharge.
import * as UI from '../core/ui.js';
import { esc, num, round2 } from '../core/utils.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { t, pick2 } from '../i18n/i18n.js';
import { GARMENTS, SERVICES, priceTable, defaultPrices } from '../dc/catalog.js';

const $ = window.jQuery;
const SVC_ICON = { dry: '✨', wash: '🫧', press: '♨️' };

function draw($el, table, urgent) {
  $el.html(UI.pageHeader(t('prices.title')) + `
    <p class="small text-body-secondary mb-3">${esc(t('prices.hint'))}</p>
    <form class="price-form">
      <div class="card card-soft p-3 mb-3">
        <label class="form-label fw-semibold mb-1" for="urgent-pct"><i class="bi bi-lightning-charge-fill text-warning"></i> ${esc(t('prices.urgentPct'))}</label>
        <input id="urgent-pct" name="urgentPercent" type="number" inputmode="decimal" min="0" max="300" step="1" class="form-control form-control-lg" value="${urgent}">
      </div>
      <div class="price-head d-none d-sm-grid">
        <span>${esc(t('prices.garment'))}</span>${SERVICES.map((s) => `<span>${SVC_ICON[s]} ${esc(t(`svc.${s}`))}</span>`).join('')}
      </div>
      <div class="price-list">
        ${table.map((g) => `<div class="price-row">
          <div class="pr-name"><span class="pr-ico">${esc(g.icon)}</span><span class="fw-semibold">${esc(pick2(g))}</span></div>
          <div class="pr-inputs">${SERVICES.map((s) => `<label class="pr-field">
            <span class="pr-label">${SVC_ICON[s]} ${esc(t(`svc.${s}`))}</span>
            <input type="number" inputmode="numeric" min="0" step="1" class="form-control text-end" name="${esc(g.id)}__${s}" value="${g.prices[s]}"></label>`).join('')}
          </div></div>`).join('')}
      </div>
      <div class="sticky-actions mt-3">
        <button type="button" class="btn btn-outline-secondary btn-lg flex-fill" data-act="reset">${esc(t('prices.reset'))}</button>
        <button type="submit" class="btn btn-brand btn-lg flex-fill"><i class="bi bi-check2-circle"></i> ${esc(t('common.save'))}</button>
      </div>
    </form>`);
}

export default {
  render(el) {
    const $el = $(el).off();
    const s = getSettings();
    draw($el, priceTable(), s.urgentPercent);

    $el.on('submit', '.price-form', (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
      const rates = {};
      for (const g of GARMENTS) {
        rates[g.id] = Object.fromEntries(SERVICES.map((svc) => [svc, round2(Math.max(0, num(fd[`${g.id}__${svc}`])))]));
      }
      saveSettings({ rates, urgentPercent: Math.max(0, num(fd.urgentPercent)) });
      UI.toast(t('prices.saved'));
    });

    $el.on('click', '[data-act="reset"]', async () => {
      if (!(await UI.confirmDialog(t('prices.resetConfirm'), { okLabel: t('prices.reset'), okClass: 'btn-warning' }))) return;
      saveSettings({ rates: defaultPrices() });
      UI.toast(t('prices.saved'));
      draw($el, priceTable(), getSettings().urgentPercent);
    });
  },
  destroy() {},
};

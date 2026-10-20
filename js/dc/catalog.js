// Garments, services and default prices. Shops change prices in Price list; overrides live in settings.rates.
import { getSettings } from '../core/settings.js';

// price 0 = service not offered for this garment.
export const GARMENTS = [
  { id: 'shalwar', en: 'Shalwar Kameez', ur: 'شلوار قمیض', icon: '👘', prices: { dry: 350, wash: 200, press: 80 } },
  { id: 'kameez', en: 'Shirt / Kameez', ur: 'قمیض / شرٹ', icon: '👕', prices: { dry: 250, wash: 150, press: 60 } },
  { id: 'pant', en: 'Trouser / Pant', ur: 'پینٹ / پتلون', icon: '👖', prices: { dry: 250, wash: 150, press: 70 } },
  { id: 'suit', en: 'Suit (2 piece)', ur: 'سوٹ (دو پیس)', icon: '🤵', prices: { dry: 900, wash: 400, press: 250 } },
  { id: 'coat', en: 'Coat / Waistcoat', ur: 'کوٹ / ویسٹ کوٹ', icon: '🧥', prices: { dry: 500, wash: 300, press: 150 } },
  { id: 'sherwani', en: 'Sherwani', ur: 'شیروانی', icon: '👔', prices: { dry: 1500, wash: 800, press: 400 } },
  { id: 'lehenga', en: 'Lehenga / Bridal', ur: 'لہنگا / برائیڈل', icon: '👗', prices: { dry: 2500, wash: 1200, press: 500 } },
  { id: 'saree', en: 'Saree', ur: 'ساڑھی', icon: '🥻', prices: { dry: 700, wash: 300, press: 200 } },
  { id: 'dress', en: 'Dress / Frock', ur: 'فراک / ڈریس', icon: '👚', prices: { dry: 500, wash: 250, press: 150 } },
  { id: 'shawl', en: 'Shawl / Dupatta', ur: 'شال / دوپٹہ', icon: '🧣', prices: { dry: 300, wash: 150, press: 80 } },
  { id: 'sweater', en: 'Sweater / Jacket', ur: 'سویٹر / جیکٹ', icon: '🧶', prices: { dry: 400, wash: 250, press: 0 } },
  { id: 'blanket', en: 'Blanket', ur: 'کمبل', icon: '🛏️', prices: { dry: 800, wash: 500, press: 0 } },
  { id: 'rajai', en: 'Rajai / Quilt', ur: 'رضائی / لحاف', icon: '🛌', prices: { dry: 1200, wash: 700, press: 0 } },
  { id: 'bedsheet', en: 'Bedsheet / Cover', ur: 'بیڈ شیٹ / چادر', icon: '🧺', prices: { dry: 350, wash: 200, press: 120 } },
  { id: 'curtain', en: 'Curtain (per panel)', ur: 'پردہ (فی پینل)', icon: '🪟', prices: { dry: 600, wash: 350, press: 200 } },
];

// Services in the order the counter staff should see them.
export const SERVICES = ['dry', 'wash', 'press'];

const byId = new Map(GARMENTS.map((g) => [g.id, g]));
export const garment = (id) => byId.get(id);

// Current price for a garment and service (settings override the default).
export function rateFor(garmentId, service) {
  const o = getSettings().rates?.[garmentId];
  if (o && o[service] !== undefined && o[service] !== null && o[service] !== '') return Number(o[service]) || 0;
  return byId.get(garmentId)?.prices[service] ?? 0;
}

// Full price table with overrides applied, for the Price list screen.
export function priceTable() {
  return GARMENTS.map((g) => ({ id: g.id, en: g.en, ur: g.ur, icon: g.icon, prices: Object.fromEntries(SERVICES.map((s) => [s, rateFor(g.id, s)])) }));
}

export const defaultPrices = () => Object.fromEntries(GARMENTS.map((g) => [g.id, { ...g.prices }]));

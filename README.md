# Dry Cleaner (ڈرائی کلین)

Offline-first dry cleaner shop app for Pakistan: tickets for every garment, pickup dates, pickup reminders,
advance and balance payments, receipts, customers, a price list and a daily report. Urdu (default, right-to-left)
and English, switchable from the top bar.

Static PWA, no build step: HTML5 · ES modules · jQuery · Bootstrap 5 · Bootstrap Icons · IndexedDB · Service Worker.

## Screens

| Screen | What it does |
|---|---|
| Home | Received today, ready for pickup, due today or late, cash collected today. Lists of ready and due tickets with call and WhatsApp buttons. |
| New ticket | Choose customer → service (dry clean / wash & iron / iron only) → tap garments (quantity goes up on each tap) → pickup date → urgent option → advance → save or save & print. The draft survives refresh. |
| Tickets | Filters (open, ready, late, delivered). Ticket screen: 4-step progress, payments, status changes, receipt, ready message on WhatsApp, cancel (only if no payments). |
| Customers | Name and phone (03xx), address, ticket history and balance owed. |
| Price list | Price per garment and service, urgent surcharge %. Enter 0 to hide a service for a garment. |
| Daily report | Today / last 7 days / this month / custom range: tickets, garments, bills, money received by method, garments by type, balances still owed. |
| Settings & backup | Shop name (English and Urdu), language, theme, receipt printer, backup file save/restore, log out. |

## Ticket rules

- Ticket numbers are `T-0001`, `T-0002`, … (counter stored with the data, never reused).
- Pickup dates: today, tomorrow, 3 days, 1 week, or any date. Tickets past their date show as late; today's show as due.
- Urgent adds the surcharge % (default 50) to the items total.
- A ticket cannot be marked delivered with a balance unless the shop confirms.
- Each save is one IndexedDB transaction, so a ticket, its number and its payments are saved together or not at all.

## Default prices

Starting prices in `js/dc/catalog.js` are **example values**, not market research. Change them in the Price list screen
before use. Overrides are stored in settings, so the defaults in the file are only the reset point.

## Structure

```
index.html            App shell (splash, login, layout, bilingual labels)
manifest.json         PWA manifest (Urdu/English name, shortcuts)
service-worker.js     Precache of the shell + CDN libraries; cache-first
css/app.css           Theme, animations (washing drum, steam, swinging garments), RTL, dark mode, receipt print styles
js/app.js             Boot, login gate, session expiry, routing, navigation, language switch
js/config.js          Login API base URL, support phone, app/schema/backup versions, APP_ID
js/i18n/              strings.js (all text, en + ur), i18n.js (t(), RTL switch, language change)
js/dc/                catalog.js (garments, services, prices), format.js (money, dates, phone, WhatsApp text),
                      data.js (customers and tickets, transactions), backup.js (export, validate, restore)
js/modules/           home, ticket-new, tickets, customers, prices, reports, settings
js/printer/           receipt builder, ESC/POS encoder, Bluetooth / RawBT / browser printing
js/services/auth.js   Login against the eposwala API (session kept on the device)
js/core/              settings (LocalStorage), UI helpers, utilities, link-login
js/db/                IndexedDB wrapper and schema
```

### Storage

- IndexedDB `drycleaner_pos`: `customers`, `tickets`, `meta` (ticket counter).
- LocalStorage: settings, language, session, and the in-progress ticket draft.
- The app namespace is `drycleaner` (`CONFIG.APP_ID`). It is separate from the old SaleAPP data on the same origin.

## Setup

1. Login uses the eposwala API (`CONFIG.AUTH_API_BASE`). The server has to allow the origin the app runs from (see the CORS note in the git history of the previous README).
2. Serve the folder over HTTP(S), for example `python -m http.server 8765`, then open http://localhost:8765. Service workers and the printer need HTTPS on a real device.
3. Deploy to any HTTPS host (for example GitHub Pages) once the login API allows that origin.

When you change any file, bump `VERSION` in `service-worker.js`. Installed apps update the next time they are opened online.

## Backup

Settings → Backup saves one JSON file with every customer and ticket. Restoring offers:

- **Add missing**: adds tickets and customers this phone does not have yet.
- **Replace**: deletes this phone's data and loads the file (you must type `REPLACE`).

Backups are checked before restoring: format, record counts, duplicate IDs and checksum.

## Printing

- **Browser print dialog**: any printer, PDF, AirPrint.
- **Bluetooth (Chrome on Android, Windows, Linux, ChromeOS)**: BLE thermal printers. iOS has no Web Bluetooth.
- **RawBT (Android)**: classic Bluetooth thermal printers.

Urdu receipt lines are drawn with the bundled Jameel Noori Nastaleeq font. Printed receipts use the current app language.

## Known limitations

- Data is stored on the phone. Use Backup regularly; the home screen reminds you after 7 days.
- Only one shop per login, no staff accounts or roles in this app (the login server has no such endpoints).
- Customers are identified by phone number, so each phone number can belong to one customer.
- SMS is not sent automatically; ready messages open WhatsApp with the text, and the shop presses send.
- The old POS modules (sales, purchases, stock, accounting) were removed from this version. They remain in git history.

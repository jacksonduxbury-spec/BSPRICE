# BS Pricing — Project Overview for Claude

> This document is intended as a high-level handoff guide for another Claude instance continuing development of this project. No personal data, buyer names, order details, or financial information is included.

---

## What It Is

A single-file progressive web app (PWA) for a jewellery brand. It handles three main workflows in one HTML file:

1. **Line Sheet Builder** — create buyer-ready A4 wholesale documents with product images, metal variants, and pricing
2. **Order Confirmation** — generate professional orders from line sheets with buyer details, terms, and bank details
3. **Production Sheet** — track each ordered piece through manufacturing with status, packaging, maker, and cost

Everything lives in `/public/linesheet.html` inside a Next.js 14 App Router project deployed on Vercel.

---

## Tech Stack

- **Next.js 14 App Router** — minimal wrapper only; the real app is a static HTML file
- **GitHub** → auto-deploys to **Vercel** on every push to `main`
- **No backend** — all data stored client-side in `localStorage` + `IndexedDB` (images only)
- **SES lockdown** (`lockdown-install.js`) is active — this is the most important constraint in the entire project

### ⚠️ Critical: SES Lockdown

The app runs under SES (Secure ECMAScript) lockdown which **silently blocks all inline event handlers**. This catches every developer who touches this project for the first time.

```html
<!-- WRONG — silently blocked, no error thrown -->
<button onclick="doSomething()">Click</button>
<input oninput="save(this.value)">

<!-- RIGHT — must use addEventListener or data-action delegation -->
<button data-action="doSomething">Click</button>
<input data-order-hdr="fieldName">
```

Every single event handler in the app must go through `addEventListener`. There are no exceptions.

---

## File Structure

```
/public/linesheet.html    ← The entire app (~3500 lines)
/public/guide-generator.html  ← Standalone API guide generator
/app/page.tsx             ← Next.js pricing calculator (separate tool)
/app/globals.css
/lib/                     ← Shared types and pricing logic
```

---

## Architecture Inside linesheet.html

The file is structured top-to-bottom as:

1. **CSS** — all styles including `@media print` overrides
2. **HTML shell** — topbar, view container, modals
3. **JavaScript** — everything else

### Global State

```js
const ST = {
  lineSheets: [],
  orders: [],
  activeId: null,
  activeOrderId: null,
  view: 'dashboard',  // 'dashboard' | 'editor' | 'order'
  prodMode: false,    // toggles production sheet within order view
};
```

Persisted via `saveST()` / `loadST()` to `localStorage` under key `bs_ls_v1`. Images are stripped from localStorage and stored separately in IndexedDB.

### Render Pattern

```js
function render() {
  const v = el('view');
  const ta = el('topbar-actions');
  if (ST.view === 'dashboard')   renderDashboard(v, ta);
  else if (ST.view === 'order')  renderOrder(v, ta);   // async
  else                           renderEditor(v, ta);
}
```

All views are full re-renders via `innerHTML`. There is no virtual DOM or diffing.

### Event Delegation — Click

All buttons use `data-action` attributes caught by a single document-level listener:

```js
document.addEventListener('click', e => {
  // Special cases first (non-data-action buttons)
  if (e.target.closest('#btn-edit-seller')) { editSellerDetails(); return; }
  if (e.target.closest('#btn-ring-sizer'))  { openRingSizer(); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a  = btn.dataset.action;
  const id = btn.dataset.id || btn.dataset.lsid;

  if (a === 'newLS')       { /* create line sheet */ }
  else if (a === 'edit')   { ST.activeId = id; ST.view = 'editor'; render(); }
  else if (a === 'back')   { ST.view = 'dashboard'; ST.activeId = null; render(); }
  else if (a === 'openOrder')   { openOrder(id); }
  else if (a === 'printOrder')  { printOrder(id); }
  else if (a === 'deleteOrder') { deleteOrder(id); }
  else if (a === 'toggleProd')  { ST.prodMode = !ST.prodMode; renderOrder(el('view'), el('topbar-actions')); }
  // ... etc
});
```

### Event Delegation — Input / Autosave

Order header fields and order item fields autosave via two patterns:

```js
// Pattern 1: Order header fields
// HTML: <input data-order-hdr="buyerName" value="...">
function _handleOrderHdr(t) {
  const field = t.dataset.orderHdr;
  if (!field) return false;
  const ord = ST.orders.find(o => o.id === ST.activeOrderId);
  if (!ord) return true;
  ord[field] = t.value;
  clearTimeout(_orderFieldTimer);
  if (t.dataset.orderHdrRerender) {
    _orderFieldTimer = setTimeout(() => { saveST(); renderOrder(el('view'), el('topbar-actions')); }, 100);
  } else {
    _orderFieldTimer = setTimeout(() => saveST(), 400);
  }
  return true;
}

// Pattern 2: Order item inline fields
// HTML: <input data-order-idx="3" data-order-field="unitWholesale" value="...">
document.addEventListener('input', e => {
  const t = e.target;
  if (_handleOrderHdr(t)) return;

  if (t.dataset.orderIdx !== undefined && t.dataset.orderField) {
    const idx   = parseInt(t.dataset.orderIdx, 10);
    const field = t.dataset.orderField;
    const ord   = ST.orders.find(o => o.id === ST.activeOrderId);
    if (ord && ord.items[idx]) {
      const numericFields = ['unitWholesale', 'qty'];
      ord.items[idx][field] = numericFields.includes(field)
        ? (parseFloat(t.value) || 0)
        : t.value;
      clearTimeout(_orderFieldTimer);
      _orderFieldTimer = setTimeout(() => saveST(), 400);
    }
  }
});
```

---

## Data Model

```
localStorage['bs_ls_v1']:
  ST.lineSheets[]:
    id, buyerName, collection, currency, deliveryDate, footerTerms
    products[]:
      id, pieceName, sku, description, images[null|base64]
      metalVariants[]:
        id, metalName, lineDescription, subtotalCost, subtotalWholesale, subtotalRRP
        rows[]:
          id, description, cost, wholesale, rrp

  ST.orders[]:
    id, createdAt, buyerName, buyerAddress, buyerTax
    orderNumber (format: OC-XXXXXX), orderDate, deliveryDate
    currency, paymentTerms, notes, orderTerms, prodInstructions
    items[]:
      id, sheetId, productId, pieceName, sku, metalName, lineDescription
      unitCost, unitWholesale, qty, included, image
      prodStatus, prodStone, prodMaker, prodCost
      prodPackaging[]  ← array of packaging option strings
      prodNotes

localStorage['bs-seller']:
  { name, details, abn, bankDetails }

localStorage['bs_ls_logo']:
  base64 encoded logo image

IndexedDB (db: 'bs-images', store: 'images'):
  key: 'img:{lsid}:{productIndex}:{imageIndex}'
  value: base64 data URL
```

---

## Image Handling

Images use `<label>` wrappers around hidden file inputs. This lets clicking trigger the file picker natively without any JavaScript click handlers (which would be blocked by SES).

```html
<!-- Clicking the label natively opens the file picker -->
<label class="ed-slot" data-imgslot="ed-prod" data-lsid="${ls.id}" data-pi="${pi}" data-ii="${ii}">
  <input type="file" accept="image/*" class="slot-file-input"
         data-lsid="${ls.id}" data-pi="${pi}" data-ii="${ii}"
         style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">
  <div class="slot-ui">...</div>
  ${img ? `<img src="${img}" alt="">` : ''}
</label>
```

File inputs are wired after every render via `bindSlots()`:

```js
function bindSlots() {
  document.querySelectorAll('.slot-file-input').forEach(function(inp) {
    if (inp._slotWired) return;
    inp._slotWired = true;
    inp.addEventListener('change', function() {
      const file = this.files && this.files[0];
      if (!file) return;
      // ⚠️ NEVER reset this.value = '' here before FileReader finishes
      // It causes NotReadableError on Chrome/Mac
      saveFileToSlot(this.dataset.lsid, +this.dataset.pi, +this.dataset.ii, file);
    });
  });
}
```

> **Known gotcha:** Never call `input.value = ''` before `FileReader.readAsDataURL()` completes. It revokes the file reference on Chrome/Mac and throws `NotReadableError`.

---

## PDF Generation

Both the Order Confirmation and Production Sheet generate PDFs by opening a new window and writing full HTML:

```js
async function printOrder(id) {
  const ord = ST.orders.find(o => o.id === id);
  // ... build HTML string ...
  const w = window.open('', '_blank', 'width=860,height=1100');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
```

### Critical Print CSS

Setting `@page { margin: 0 }` removes browser-generated headers/footers (date, URL, page numbers) from the PDF. Body padding replaces the margin:

```css
@page { margin: 0; size: A4; }
@media print {
  body { padding: 16mm 18mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

Production sheet uses `size: A4 landscape`.

---

## Key Features Summary

### Line Sheet Editor
- Dashboard listing all sheets and orders
- Per-sheet: buyer name, collection, currency, delivery date
- Per-product: piece name, SKU, description, 2 image slots, multiple metal variants
- Per-variant: cost / wholesale / RRP pricing, line description
- Live A4 preview panel (right side)
- `recomputeSubtotals()` recalculates variant totals from rows on every change
- CSV export, PDF export

### Order Confirmation
- Created from one or more line sheets via `mkOrder(primaryLS)`
- Order number format: `OC-XXXXXX` (random 6-digit suffix)
- Seller details stored separately in `bs-seller` localStorage key
- All fields inline-editable with debounced autosave
- Sections: buyer info, items table, totals, terms & conditions, payment details
- PDF prints clean A4 with no browser headers

### Production Sheet
- Toggled via `ST.prodMode` boolean — same order, different render
- Per-item fields: stone/material (pre-filled from `lineDescription`), maker, cost (pre-filled from `unitWholesale`), status, packaging, notes
- Status options: Not Started / In Progress / Complete / Dispatched (colour-coded)
- Packaging: multi-select chip system — each item can have multiple packaging types
- `PACKAGING_OPTIONS` array lists all available packaging from two suppliers
- Packaging summary at bottom totals all types × qty across the order
- Prints landscape A4, no wholesale prices shown

### Ring Size Converter
- Modal opened from topbar on any screen
- 40 sizes: US / UK-AU-NZ / EU / Japanese / diameter mm
- Live search highlights matching rows across all systems

---

## Seller Details Pattern

Seller info is stored separately from orders so it applies globally:

```js
function loadSeller() {
  try { return JSON.parse(localStorage.getItem('bs-seller') || '{}'); }
  catch(e) { return {}; }
}
function saveSeller(s) {
  localStorage.setItem('bs-seller', JSON.stringify(s));
}

// Schema: { name, details, abn, bankDetails }
// Edited via a series of window.prompt() calls in editSellerDetails()
// Button uses id="btn-edit-seller" wired via delegated click listener
```

---

## Packaging System

```js
const PACKAGING_OPTIONS = [
  '— Select packaging —',
  // TOBE Italy
  'TOBE: Box 3052 Black Velvet — Ring Tab (6×6×5.5cm)',
  'TOBE: Box 3053 Grey Suede — Earring Pillow/Ring Tab (7×7.5×6cm)',
  'TOBE: Box 3054 Black Velvet — Pendant (8.3×8.5×6.2cm)',
  // ... etc
  // New Directions
  'ND: Midnight A7 Box Black — Foldable (114×81×35mm)',
  'ND: Jewellery Pouch Black/Gold — Microfiber/Suede (111×70×70mm)',
  // ...
];

// Stored on order items as an array:
// item.prodPackaging = ['TOBE: Box 3054 Black Velvet — Pendant', 'ND: Jewellery Pouch Black/Gold']

// Summary calculation:
const pkgTotals = {};
for (const item of included) {
  const arr = Array.isArray(item.prodPackaging) ? item.prodPackaging : [];
  for (const p of arr) pkgTotals[p] = (pkgTotals[p] || 0) + (item.qty || 1);
}
```

---

## Deployment

```
git push origin main
→ GitHub webhook triggers Vercel build
→ Live at brohn-pricing.vercel.app within ~60 seconds
```

No build step is needed for `linesheet.html` changes — it's a static file served directly from `/public`. Next.js passes it through unchanged.

---

## Common Gotchas for New Developers

1. **SES blocks inline handlers** — use `data-action` delegation or `addEventListener`. No exceptions.
2. **Never `input.value = ''` before FileReader finishes** — causes `NotReadableError` on Chrome/Mac.
3. **`@page { margin: 0 }` is required** — otherwise browser prints date/URL in PDF margins.
4. **`renderOrder` is async** — it calls `idbGetAll()` to load images. Don't call it expecting synchronous results.
5. **`saveST()` strips images** — images are saved to IndexedDB separately. `loadST()` loads them back on init.
6. **`bindSlots()` must be called after every `renderEditor()`** — it wires the file input change listeners with a `_slotWired` guard to prevent double-binding.
7. **`ST.prodMode` must be reset to `false`** when navigating back to dashboard, otherwise the next order opens in production mode.

---

*This document was prepared for handoff to another Claude instance or external developer. It contains no personal data, buyer information, or financial records.*

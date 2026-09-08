# Admin API — Frontend Integration Guide

Reference for every endpoint under `/admin/*`, for wiring up the admin dashboard.

## Base setup

- **Base URL**: `{API_HOST}/api/v1` (global prefix `api` + URI versioning, default version `1`)
- **Auth**: every endpoint below requires `Authorization: Bearer <JWT>` for a user with `role: admin`. A non-admin or missing token gets `401`/`403`.
- **Content type**: `application/json` unless noted as `multipart/form-data` (file uploads).
- **Validation**: request bodies are strictly validated — unknown fields are rejected (`400`), not silently dropped.
- **Swagger**: live, browsable docs (with "Try it out") at `{API_HOST}/api/docs`.

### Response envelope

Every response — success or error — is wrapped by a global interceptor/filter. Don't unwrap `data` manually per-endpoint; do it once in your API client.

**Success:**
```json
{
  "success": true,
  "data": { /* the actual payload described below */ },
  "message": "Success",
  "timestamp": "2026-08-29T09:00:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "quoteId must be a UUID",
  "errors": ["quoteId must be a UUID"],
  "path": "/api/v1/admin/coupons",
  "timestamp": "2026-08-29T09:00:00.000Z"
}
```
`errors` is only present for validation failures (array of every failed field rule); business-logic errors (404/409/etc.) just have `message`.

### Pagination

Every list endpoint that supports paging returns the array under a named key plus a `meta`/pagination block alongside it (shape varies slightly per module — see each section). `page` is 1-indexed; omit `page`/`limit` to get page 1 of 20.

---

## Table of contents

1. [Dashboard](#1-dashboard)
2. [Products](#2-products)
3. [Categories](#3-categories)
4. [Orders](#4-orders)
5. [Quotations](#5-quotations)
6. [Coupons](#6-coupons)
7. [Users & Activity](#7-users--activity)
8. [API Logs](#8-api-logs)
9. [Brands](#9-brands)

---

## 1. Dashboard

Base path: `/admin/dashboard`

### `GET /admin/dashboard/stats`

Summary tiles for the dashboard home screen.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `period` | `today` \| `3d` \| `7d` \| `30d` | Default `7d`. Ignored if `from`/`to` given. |
| `from` | `YYYY-MM-DD` | Custom range start |
| `to` | `YYYY-MM-DD` | Custom range end |

**Response `data`**
```json
{
  "period": { "from": "2026-08-22T00:00:00.000Z", "to": "2026-08-29T23:59:59.999Z" },
  "totalSales": { "current": 450000, "previous": 380000, "changePercent": 18 },
  "totalOrders": { "current": 12, "previous": 9, "changePercent": 33 },
  "quotationsRaised": { "current": 8, "unattended": 3 },
  "users": { "total": 120, "newInPeriod": 6 }
}
```
`changePercent` is `null` when the previous period had zero activity (avoids divide-by-zero). `quotationsRaised.unattended` = count of quotes still in `pending` status, regardless of period.

### `GET /admin/dashboard/sales-by-category`

Same `period`/`from`/`to` query params. Returns an array for the bar chart:
```json
[
  { "categoryId": "uuid", "categoryName": "GNSS Antenna", "totalSales": 230000, "orderCount": 4, "quantitySold": 6 }
]
```
**Every active category is always included**, even with zero sales in the selected period (`totalSales`/`orderCount`/`quantitySold` all `0`) — this used to silently drop any category with no orders in the window instead of showing it at zero, which would make bars disappear from the chart rather than read as empty. Sorted by category `sortOrder`/`name` (stable chart ordering), not by sales value.

### `GET /admin/dashboard/recent-quotations`

Query: `limit` (default `10`).
```json
[
  {
    "id": "uuid",
    "quoteId": "Q-2026-00045",
    "status": "pending",
    "createdAt": "2026-08-17T16:49:46.083Z",
    "raisedBy": "NHAI Northern Zone",
    "productRequested": "AgAnt-3S-430x311",
    "quotedPrice": null
  }
]
```
`raisedBy` resolves the customer's company name from `CompanyProfile`, falling back to email if they haven't filled one in — same resolution as `/admin/quotes` and `/admin/users`.

---

## 2. Products

Base path: `/admin/products`

### `GET /admin/products`

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | number | Default `1`, `20` |
| `search` | string | Matches name or model number |
| `categoryId` | uuid | |
| `availability` | `website` \| `app` \| `hidden` \| `all` | `hidden` = not shown on either |

**Response `data`**
```json
{
  "products": [ /* Product entities incl. category, brand, images */ ],
  "total": 42, "page": 1, "limit": 20, "totalPages": 3
}
```

### `GET /admin/products/:id`
Full product incl. `category`, `brand`, `images[]`, `specs[]`, `documents[]`.

### `POST /admin/products`

```json
{
  "name": "AgAnt-3S-430x311",
  "headline": "High-precision GNSS antenna for survey applications",
  "description": "Full product description...",
  "keySpecification": "Free-text spec block, max 500 chars",
  "categoryId": "uuid",
  "brandId": "uuid",
  "originalPrice": 1100500,
  "price": 1050000,
  "stockStatus": "in_stock",
  "modelNumber": "AgAnt-3S-430x311",
  "salesRepName": "optional",
  "salesRepPhone": "optional",
  "isFeatured": false,
  "isNewArrival": false,
  "showOnWebsite": true,
  "showOnApp": false,
  "images": [
    { "url": "https://.../img1.jpg", "type": "image", "isPrimary": true, "sortOrder": 0 }
  ],
  "specs": [
    { "key": "Frequency", "value": "GPS L1/L2", "sortOrder": 0 }
  ],
  "documents": [
    { "name": "Product Brochure.pdf", "url": "https://.../brochure.pdf", "fileType": "pdf" }
  ]
}
```
Required: `name`, `description`, `categoryId`, `brandId`, `price`, `stockStatus` (enum: `in_stock` \| `limited_stock` \| `get_quote` \| `on_order`). Everything else optional.

Common validation mistakes (all rejected with a `400` naming exactly which field, per the global error shape at the top of this doc — none of these are backend bugs):
- `categoryId`/`brandId` must be **real UUIDs** from `GET /admin/categories` / your brands list — not placeholder text.
- `images[]` entries use `sortOrder`, not `order` — an unrecognized field name is rejected outright (`forbidNonWhitelisted` is on), not silently dropped.
- Every `images[]` entry needs a real `url` — get one from the upload endpoints above first; there's no way to send a raw file directly in the create/update body.
- Every `specs[]` entry needs both `key` and `value` filled in — filter out empty/incomplete spec rows client-side before submitting rather than sending a partial object.

- `price` = **listing/selling price** — this is what cart/checkout actually charge.
- `originalPrice` = MRP shown struck through. Optional, purely cosmetic.
- `images[].type` = `image` \| `video` (default `image`).
- A human-readable `productCode` (e.g. `Jnk26-0008419`) is generated server-side — don't send it.

Response: the created product (same shape as `GET /:id`).

### `PATCH /admin/products/:id`
Same body as create, all fields optional (`Partial<CreateProductDto>`). **`images`/`specs`/`documents` sent here are ignored** — manage those through the dedicated sub-resource endpoints below (this was a deliberate fix: blindly assigning array fields here used to risk duplicate rows on every unrelated edit).

### `DELETE /admin/products/:id`
`{ "message": "Product deleted" }`

### Uploading image/video and document files

`images[]`/`documents[]` everywhere (create, update, and the sub-resource endpoints below) only accept **URL strings**, not raw files. Upload the file(s) first to get URLs back:

**`POST /admin/products/upload-images`** — `multipart/form-data`, field name **`images`** (repeat the field for multiple files, up to 10). Accepts jpg/jpeg/png/webp images or mp4/mov/webm videos, max 20MB each.
```json
[
  { "url": "https://.../uploads/products/1735...-588991.png", "name": "front.png", "type": "image" },
  { "url": "https://.../uploads/products/1735...-405919.mp4", "name": "demo.mp4", "type": "video" }
]
```
`type` is inferred automatically from the file extension. `url` is a full absolute URL — use it directly.

**`POST /admin/products/upload-documents`** — same shape, field name **`documents`**, accepts pdf/doc/docx, max 20MB each.
```json
[{ "url": "https://.../uploads/product-documents/1735...-126860.pdf", "name": "brochure.pdf", "fileType": "pdf" }]
```

Take the `url`/`name`/`type` (or `fileType`) from these responses and drop them straight into the `images[]`/`documents[]` array of a create/update call, or the sub-resource `POST` endpoints below. Both upload endpoints return a clean `400` for an unsupported file type or if no file was sent — not a server error.

### Image / video sub-resource

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/admin/products/:id/images` | `{ "images": [{ "url", "name"?, "type"?, "isPrimary"?, "sortOrder"? }] }` | Appends; `sortOrder` auto-continues from existing count if omitted |
| `PATCH` | `/admin/products/:id/images/reorder` | `{ "imageIds": ["uuid", "uuid", ...] }` | Full ordered list of **all** image IDs for the product — sets `sortOrder` to array index |
| `DELETE` | `/admin/products/:id/images/:imageId` | — | `{ "message": "Image deleted" }` |

### Document sub-resource

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/admin/products/:id/documents` | `{ "documents": [{ "name", "url", "fileType"? }] }` | Appends |
| `DELETE` | `/admin/products/:id/documents/:documentId` | — | `{ "message": "Document deleted" }` |

All four sub-resource endpoints return the full updated product (same shape as `GET /:id`).

---

## 3. Categories

Base path: `/admin/categories`

### `GET /admin/categories`

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | number | Default `1`, `20` |
| `search` | string | Matches `categoryCode` or `name` |
| `availability` | `website` \| `app` \| `hidden` \| `all` | |

**Response `data`**
```json
{
  "categories": [
    {
      "id": "uuid",
      "categoryCode": "Jnk26-0008419",
      "name": "GNNS Antenna",
      "slug": "gnns-antenna",
      "image": "/uploads/category-images/173...-antenna.jpg",
      "isActive": true,
      "showOnWebsite": true,
      "showOnApp": true,
      "sortOrder": 0,
      "productQty": 5,
      "createdAt": "...", "updatedAt": "..."
    }
  ],
  "total": 12, "page": 1, "limit": 20, "totalPages": 1
}
```
`productQty` is computed on the fly (count of products with this category) — not a stored column.

### `GET /admin/categories/:id`
Single category, same shape (with `productQty`).

### `POST /admin/categories`
Accepts **either** `multipart/form-data` (upload the image file directly) **or** plain `application/json` (pass an image URL) — pick whichever fits your flow.

**Option A — multipart, upload the file directly:**
```
Content-Type: multipart/form-data
name=GNSS Antenna
isActive=true
showOnWebsite=true
showOnApp=false
sortOrder=0
image=<binary file, jpg/jpeg/png/webp, max 5MB>
```

**Option B — JSON, pass an existing image URL:**
```json
{
  "name": "GNSS Antenna",
  "image": "/uploads/category-images/173...-antenna.jpg",
  "isActive": true,
  "showOnWebsite": true,
  "showOnApp": false,
  "sortOrder": 0
}
```
If both an uploaded file and an `image` URL are somehow present in the same request, the uploaded file wins. Only `name` is required. `categoryCode` is auto-generated, don't send it. `slug` is derived from `name` server-side. Booleans/numbers sent via multipart arrive as strings (`"true"`, `"5"`) — these are coerced automatically, no special handling needed client-side.

### `PATCH /admin/categories/:id`
Same body/either-format rules as create, all fields optional.

### `DELETE /admin/categories/:id`
`{ "message": "Category deleted" }`

### `POST /admin/categories/upload-image` (optional standalone step)
`multipart/form-data`, field name **`image`** (jpg/jpeg/png/webp, max 5MB). You generally don't need this anymore — create/update accept the file directly now — but it's still there if you want to upload/preview an image before submitting the rest of the form (e.g. an "Upload Image" button that shows the picked file before "Add This Category" is clicked).

**Response:**
```json
{ "url": "/uploads/category-images/1735...-923.jpg", "name": "GNNS_Antenna.jpeg" }
```
`url` is a full absolute URL (e.g. `https://stagapi.janakgnss.com/uploads/category-images/...`), built from the `APP_URL` env var — use it directly, no concatenation needed. It's not under the `/api` prefix (static assets are mounted at the host root). Pass it into the `image` field of a subsequent JSON create/update call. Calling this without a file returns a clean `400`, not a `500`.

---

## 4. Orders

Base path: `/admin/orders`

### `GET /admin/orders`

| Param | Type | Notes |
|---|---|---|
| `tab` | `ongoing` \| `completed` | Default `ongoing`. Ignored if `status` given. |
| `page`, `limit` | number | Default `1`, `20` |
| `search` | string | Matches `orderId` |
| `from`, `to` | `YYYY-MM-DD` | Date range on `createdAt` |
| `status` | `OrderStatus` enum | Overrides `tab` — filters to one exact status |

`ongoing` = pending/advance-paid/processing/assigned/pending-balance/balance-paid/confirmed/shipped/out-for-delivery. `completed` = delivered/cancelled.

**Response `data`**
```json
{
  "orders": [
    {
      "id": "uuid",
      "orderId": "JP-2026-00001",
      "customerName": "john@example.com",
      "customerEmail": "john@example.com",
      "customerContact": "+91...",
      "bookingAmount": 50000,
      "orderStatus": "advance_paid",
      "paymentStatus": { "advancePaid": true, "balancePaid": false },
      "deliveryAddress": "123 Main St, Dehradun, Uttarakhand, 248001",
      "discountAmount": 500,
      "couponCode": "SAVE500",
      "totalAmount": 500000,
      "createdAt": "...",
      "items": [
        { "id": "uuid", "productName": "...", "productImage": "url|null", "quantity": 1, "unitPrice": 500000, "totalPrice": 500000 }
      ]
    }
  ],
  "total": 5, "page": 1, "limit": 20, "totalPages": 1,
  "tabCounts": { "ongoing": 12, "completed": 8 }
}
```
`tabCounts` is always the *global* count for both tabs regardless of the current filters/page — use it for the tab badges, same as quotations' `tabCounts`. `customerName`/`customerContact` now resolve from `CompanyProfile` (falls back to email/the order's stored shipping-address phone) — the old "always falls back to email" gap is fixed.

### `GET /admin/orders/export/excel`
Same query params as the list endpoint (`tab`, `search`, `from`, `to`, `status`) but **unpaginated** — every matching row is exported, not just the current page. Returns an `.xlsx` file (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment`), not the usual JSON envelope. Order-list-shaped columns (customer, status, booking/total amount, delivery address) — for a financial/invoice breakdown instead, see `export/invoices-excel` below.

### `GET /admin/orders/export/invoices-excel`
Query params: `from`, `to` (`YYYY-MM-DD` — the main filter for this one), plus `tab`/`status` for consistency. Also unpaginated, also an `.xlsx` file. Columns are invoice/financial-detail focused rather than order-list focused: Order ID, Invoice Date, Customer Name/Email/Contact, **GSTIN** (from `CompanyProfile`), Subtotal, GST, Shipping, **Discount, Coupon Code**, Total, Advance Amount + paid?, Balance Amount + paid?, Payment Method, Transaction ID, Status. Meant for accounting reconciliation over a date range rather than an operational orders list.

### `GET /admin/orders/:id`
Accepts either the UUID **or** the human `orderId` (e.g. `JP-2026-00001`) in the path. Returns the full `Order` entity with `user`, `items.product.images`, `tracking`.

### `GET /admin/orders/:id/invoice`
Same `:id` matching (UUID or `JP-2026-00001`-style). Returns a PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment`) — now a proper **GST Tax Invoice** in the standard Indian format, not a plain receipt:

- **Seller block**: hardcoded company registration details (name, address, GSTIN `09AABCJ0148A1Z5`, State Name/Code, CIN, contacts, emails, MSME reg. no.) — see `SELLER_INFO` in `src/common/constants/seller-info.constant.ts` if any of these ever need to change.
- **Invoice meta**: Invoice No. (`orderId`), Dated, Mode/Terms of Payment, Reference No. & Date (`transactionId`), Destination.
- **Buyer (Bill to / Ship to)**: one combined box (this storefront only captures a single delivery address per order, so a separate "Consignee" box would just duplicate it) — name from `CompanyProfile.companyName` (falls back to email), address from the order's shipping address snapshot, buyer's GSTIN/PAN from `CompanyProfile` (prints `—` if the buyer never filled that in), state name + GST state code.
- **Line items**: Sl No., description (+ model number, but only if it differs from the name), **HSN/SAC**, quantity, rate, `per` (always `Nos` — no per-product unit-of-measure field exists), amount.
- **Tax breakup**: Taxable Value → Discount (if a coupon was applied) → **CGST @ 9% + SGST @ 9%** if the buyer's state matches the seller's (Uttar Pradesh), or **IGST @ 18%** otherwise → Shipping → Total. The total tax charged is unchanged either way (still the existing flat 18%, computed exactly as before) — only how it's split/labelled differs by buyer state.
- **Amount Chargeable (in words)** and a separate **HSN/SAC-wise tax summary table** (grouped by each item's HSN code, with the order's GST amount allocated proportionally by taxable value per group — the group amounts always sum exactly to the order's real `gstAmount`, no independent-rounding drift), plus **Tax Amount (in words)** and the seller's PAN (derived from the GSTIN's characters 3–12, per the standard GSTIN format).
- Advance/balance payment status kept as a small note (this business ships an advance+balance payment flow, which a stock GST invoice template has no field for).
- Declaration + "Authorised Signatory" block, and the "SUBJECT TO ONLY DELHI JURISDICTION" / "Computer Generated Invoice" footer.
- Amounts are rendered as `Rs. 1,234.00` (en-IN digit grouping) rather than `₹` — PDFKit's standard fonts don't include the ₹ glyph and silently render it as a garbled character.

**HSN/SAC codes come from the product**: set `hsnCode` on a product (`POST`/`PATCH /admin/products`, see [admin-products-api.md](./admin-products-api.md)) for it to show up on future orders' invoices — it's snapshotted onto the order item at checkout, same as `productName`, so editing a product's HSN code later doesn't retroactively change past invoices. A product with no `hsnCode` set just prints `—` on both the line item and the HSN summary table; it doesn't block invoice generation.

> **Not built**: the "e-Invoice" IRN/Ack No./QR block seen on some GST invoice templates. That requires actually registering the invoice with a GST e-invoice portal (GSP) and getting a real IRN back — fabricating one would put a fake IRN on a real financial document, so it's left out entirely rather than faked. If/when e-invoicing is wired up, that block goes at the top next to "Tax Invoice".

> **Fixed**: `Order.discountAmount`/`Order.couponCode` didn't exist until now — a discounted order's invoice used to show `Subtotal + GST + Shipping ≠ Total` with no explanation (the coupon discount was applied to `totalAmount` at checkout but never persisted anywhere on the order itself). Both the invoice PDF and `export/invoices-excel` now show the discount and which coupon was used; the order-list endpoints (`GET /admin/orders`, `export/excel`) also return `discountAmount`/`couponCode` per order.

### `PATCH /admin/orders/:id/status`
```json
{ "status": "shipped" }
```
Appends a tracking event automatically if the order has a tracking record.

### `PATCH /admin/orders/:id/tracking`
```json
{ "courierName": "BlueDart", "awbNumber": "AWB123", "trackingUrl": "https://..." }
```
All fields optional; `404` if the order has no tracking record yet.

### `PATCH /admin/orders/:id/assign-shipping`
Same body shape as tracking. Moves order to `assigned_for_shipping`, appends a tracking event, and **sends the customer a balance-payment notification** with NEFT/QR details pulled from env config.

### `PATCH /admin/orders/:id/confirm-advance-neft`
```json
{ "neftReferenceNumber": "UTR123456" }
```
Marks `advancePaid: true`, status → `advance_paid`, notifies the customer.

### `PATCH /admin/orders/:id/confirm-balance-neft`
Same body shape. Marks `balancePaid: true`, status → `balance_paid`, notifies the customer.

---

## 5. Quotations

Base path: `/admin/quotes`

### `GET /admin/quotes`

| Param | Type | Notes |
|---|---|---|
| `tab` | `in-progress` \| `closed` | Default `in-progress`. `in-progress` = pending + quote_sent. `closed` = accepted + expired. |
| `page`, `limit` | number | Default `1`, `20` |
| `search` | string | Matches `quoteId` |
| `from`, `to` | `YYYY-MM-DD` | Date range on `createdAt` |
| `status` | `QuoteStatus` enum | Overrides `tab` |

**Response `data`**
```json
{
  "quotes": [
    {
      "id": "uuid",
      "quoteId": "Q-2026-00045",
      "customerName": "NHAI Northern Zone",
      "customerEmail": "connect.nhai@gov.in",
      "customerContact": "+91 8719283238",
      "currentValue": 1100500,
      "quotationValue": 1050000,
      "status": "quote_sent",
      "raisedOn": "2026-08-17T16:49:46.083Z",
      "itemCount": 2
    }
  ],
  "total": 3, "page": 1, "limit": 20, "totalPages": 1,
  "tabCounts": { "inProgress": 3, "closed": 0 }
}
```
- `customerName`/`customerContact` resolve from `CompanyProfile` (falls back to email/blank) — this module does it correctly, unlike the orders gap above.
- `currentValue` = live sum of `product.price × quantity` across the quote's items (recalculated at read time, not a snapshot).
- `quotationValue` = the negotiated `quotedPrice` on the quote (`null` until an admin sets one).
- `tabCounts` is always the *global* count for both tabs, regardless of the current page/filters — use it to render the tab badges.

### `GET /admin/quotes/:id`
Full detail view. Same fields as the list item, plus:
```json
{
  ...quote entity fields (status, intendedUse, budgetRange, timeline, notes, quotedPrice, validUntil, user, items[], createdAt, updatedAt),
  "customerName": "NHAI Northern Zone",
  "customerContact": "+91 8719283238",
  "customerEmail": "connect.nhai@gov.in",
  "currentValue": 1100500,
  "quotationValue": 1050000,
  "discountRequested": 50500
}
```
`items[].product` includes `images`, `brand`, `category` (for showing per-item thumbnails/category badges). `discountRequested = currentValue − quotationValue` (`null` if no `quotedPrice` set yet).

### `PATCH /admin/quotes/:id/status`
```json
{ "status": "quote_sent" }
```
For the quick status-dropdown in the list view. `QuoteStatus`: `pending` \| `quote_sent` \| `accepted` \| `expired`.

### `PATCH /admin/quotes/:id`
For the full edit/detail screen:
```json
{
  "quotedPrice": 1050000,
  "validUntil": "2026-12-31T23:59:59Z",
  "notes": "Special pricing for government tender",
  "status": "quote_sent"
}
```
All fields optional.

> **Not built**: "Export in Excel" / "Generate Invoices" actions seen in the UI mockups have no backend yet — no export library is wired in. Ask for these explicitly when needed.

---

## 6. Coupons

Base path: `/admin/coupons`

### `GET /admin/coupons`
No pagination — returns the full list, newest first.
```json
[
  {
    "id": "uuid",
    "code": "SAVE10",
    "discountType": "percentage",
    "discountValue": 10,
    "discountPercent": 10,
    "maxDiscountAmount": 1000,
    "additionalDiscountType": null,
    "minimumOrderValue": 5000,
    "freeProduct": null,
    "isPublic": true,
    "quote": null,
    "user": null,
    "expiresAt": null,
    "isActive": true,
    "createdAt": "...", "updatedAt": "..."
  }
]
```
`discountPercent` is a **legacy mirror** of `discountValue` for old percentage coupons/consumers — always read `discountType` + `discountValue` going forward; ignore `discountPercent` in new UI.

### `GET /admin/coupons/suggest-code?quoteId=<uuid>`
Powers the "Regenerate" button on the quote-linked coupon form. **Not persisted** — call again for a new suggestion.
```json
{ "code": "JNK-NHAI-321709" }
```
Format: `JNK-<first word of customer/company name, uppercased>-<6 digits>` — fully uppercase. (A prior version of this generator produced mixed-case codes like `Jnk-NHAI-321709`, which meant the coupon was silently unusable — every lookup matches on `code.toUpperCase()`. Fixed both in the generator and with a `@BeforeInsert`/`@BeforeUpdate` normalizer on the entity itself, so a mixed-case code can no longer be persisted from any code path. If you have any coupons predating this fix, check `SELECT code FROM coupons WHERE code != UPPER(code)` and re-save them.)

### `POST /admin/coupons`

**Public coupon (Flat example):**
```json
{
  "code": "SAVE500",
  "discountType": "flat",
  "discountValue": 500,
  "minimumOrderValue": 5000,
  "isPublic": true
}
```

**Public coupon (Percentage, capped):**
```json
{
  "code": "SAVE10PCT",
  "discountType": "percentage",
  "discountValue": 10,
  "maxDiscountAmount": 1000,
  "minimumOrderValue": 5000
}
```

**Free item, no stacked discount:**
```json
{
  "code": "FREEGIFT",
  "discountType": "free_item",
  "freeProductId": "uuid",
  "minimumOrderValue": 10000
}
```

**Free item + stacked percentage discount:**
```json
{
  "code": "FREEPLUS20",
  "discountType": "free_item",
  "freeProductId": "uuid",
  "additionalDiscountType": "percentage",
  "discountValue": 20,
  "maxDiscountAmount": 2000,
  "minimumOrderValue": 10000
}
```

**Custom / quote-linked (code auto-generated — omit `code`):**
```json
{
  "discountType": "flat",
  "discountValue": 5000,
  "minimumOrderValue": 10000,
  "isPublic": false,
  "quoteId": "uuid"
}
```
Server sets `quote` and `user` on the coupon automatically (from `quoteId`'s owner) — the coupon then only works for that customer. To show the code before submitting, call `suggest-code` first and send that value as `code` instead of omitting it.

**Field reference**

| Field | Required when | Notes |
|---|---|---|
| `code` | `isPublic` is `true`/omitted | Auto-uppercased. Auto-generated if omitted for `isPublic: false`. |
| `discountType` | always | `flat` \| `percentage` \| `free_item` |
| `discountValue` | `discountType !== 'free_item'`; also required if `additionalDiscountType` is set on a `free_item` coupon | % (1–100) or ₹ depending on type |
| `maxDiscountAmount` | never (optional) | Caps a percentage-based discount amount |
| `additionalDiscountType` | never (optional) | `flat` \| `percentage` only — stacks on top of `free_item` |
| `freeProductId` | `discountType === 'free_item'` | uuid |
| `minimumOrderValue` | never (optional) | Order subtotal floor |
| `isPublic` | never (optional, default `true`) | `false` requires `quoteId` |
| `quoteId` | `isPublic === false` | Scopes coupon to that quote's customer |
| `expiresAt` | never (optional) | ISO 8601 |

Errors you should handle explicitly: `409` code already exists, `400` percentage > 100, `400` missing `freeProductId`/`quoteId` per above rules.

### `PATCH /admin/coupons/:id`
Same body, all fields optional (`Partial<CreateCouponDto>`).

### `DELETE /admin/coupons/:id`
`{ "message": "Coupon deleted" }`

### `GET /coupons` — customer-facing, for an "available offers" list
New endpoint. Requires auth (`Authorization: Bearer <JWT>`, any logged-in customer). Returns every coupon the current user could actually apply right now:
- All active, non-expired coupons with `isPublic: true`
- Plus any active, non-expired `isPublic: false` coupon whose `user` is this customer (e.g. a quote-linked coupon) — nobody else's private coupons are ever included
- Already-expired or deactivated coupons are silently excluded (not returned with a flag — just absent)

Response is an array, same per-coupon shape as `validate`'s response minus `code` validity (there's no `400` case here — an empty array just means no offers apply):
```json
[
  {
    "code": "SAVE10",
    "discountType": "percentage",
    "discountValue": "10.00",
    "discountPercent": "10.00",
    "maxDiscountAmount": null,
    "additionalDiscountType": null,
    "minimumOrderValue": null,
    "isPublic": true,
    "expiresAt": null,
    "freeProduct": null
  }
]
```
Note this is separate from `GET /admin/coupons`, which is admin-only and returns literally every coupon (including other customers' private ones and inactive/expired ones) for management purposes.

### Where the discount actually applies
`POST /coupons/validate` (public), `POST /cart/coupon`, and `POST /checkout/place-order` all now branch on `discountType`/`maxDiscountAmount`/`additionalDiscountType` consistently. A coupon scoped to a `user` returns `400 "This coupon is not valid for your account"` for anyone else; below `minimumOrderValue` returns a `400` naming the required minimum.

`POST /coupons/validate`'s response also includes `maxDiscountAmount`, `additionalDiscountType`, `isPublic`, and `freeProduct` (`{ id, name } | null`) now — previously only `code`/`discountType`/`discountValue`/`discountPercent`/`minimumOrderValue` came back, which meant a `free_item` coupon validated successfully but didn't tell the frontend *which* product was free.

> **Fixed**: `validate()` didn't check the `user` restriction at all before — a quote-linked/private coupon would validate as "success" for any logged-in user, then get rejected later at `cart/coupon` or checkout for a reason `validate` never surfaced. Also fixed: the `suggest-code` generator produced mixed-case codes (`Jnk-NHAI-321709`) while every lookup matches on `code.toUpperCase()` — meaning **no quote-linked coupon was ever actually usable by a customer**. Codes are now generated uppercase, and `Coupon` has a `@BeforeInsert`/`@BeforeUpdate` hook that force-uppercases `code` on every save regardless of code path, so this can't silently regress. If any coupons predate this fix, find them with `SELECT code FROM coupons WHERE code != UPPER(code)` on the server and re-save them (a `PATCH` with the same `code` value is enough — the hook normalizes it).

> **Fixed**: `validate()` never actually checked `minimumOrderValue` against anything — it just echoed the coupon's own `minimumOrderValue` field back in the response without comparing it to the user's cart. A coupon with a ₹1,00,000 minimum would "validate" successfully for a cart worth ₹500; only the later `POST /cart/coupon` call caught it, with no way for the frontend to know in advance from `validate` alone. Fixed: `validate()` now loads the user's current cart, computes its subtotal, and returns the same `400 "Minimum order value of ₹X required for this coupon"` that `cart/coupon`/checkout already gave — consistent across all three endpoints now. Also added a `discountAmount` field to `validate`'s response (computed against the current cart subtotal) so the frontend doesn't need a second call just to show the rupee amount.

> **Fixed**: applying a coupon didn't stick to the cart at all. `POST /cart/coupon` computed and returned a discount for that one response only — it was never saved anywhere, so `discountAmount` was always `0` on a plain `GET /cart`, or after adding/updating/removing any item (all of which internally re-fetch the cart), or on `POST /checkout/initiate`. Calling `POST /coupons/validate` never touched the cart either way, which is why validate could show a discount while the cart showed none.
>
> Fixed by persisting the applied coupon on the `Cart` entity itself:
> - `POST /cart/coupon` now saves the coupon onto the cart, not just onto its own response.
> - `GET /cart` now returns a `coupon` field (`null` if none applied) and `summary.discountAmount` reflects it automatically — no need to re-apply after every fetch or every cart mutation.
> - New: `DELETE /cart/coupon` removes whatever coupon is currently applied.
> - `POST /checkout/initiate` and `POST /checkout/place-order` both honor the cart's persisted coupon automatically now. `place-order`'s `couponCode` body field still works and takes priority if sent — it's just no longer *required* to repeat the code you already applied to the cart. The coupon is cleared from the cart once the order is placed.
> - If a coupon on the cart has since expired or been deactivated, it's treated as if none were applied (`discountAmount: 0`, `coupon: null`) rather than erroring — it isn't auto-removed from the cart row, so it'll show again if it's ever reactivated before checkout.
>
> `POST /cart/coupon`'s response shape changed slightly as part of this — it now returns the same shape as `GET /cart` (full cart + `summary` + `coupon`) instead of a bespoke `{ ...summary, coupon }` object with no items. Read `coupon`/`summary` the same way either response; just don't rely on the old response *lacking* an `items` field.

> **Not built**: actual fulfillment of the free item at checkout (adding it as a ₹0 line item to the order) — only the discount math and data model exist so far.

---

## 7. Users & Activity

Base path: `/admin/users`

### `GET /admin/users`

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `CompanyProfile.companyName` or email |
| `hasCartItems` | `"true"` | String, not boolean — only users with items in cart |
| `abandoned` | `"true"` | Only users with an abandoned cart (see `idleHours`) |
| `idleHours` | number | Hours since cart update to count as abandoned (default `24`) |
| `locationState` | string | Matches default address `state` |
| `joinedWithinDays` | number | Only users created in the last N days |
| `activeWithinHours` | number | Hours since last activity to count as `active` (default `24`) |
| `activityStatus` | `active` \| `inactive` \| `all` | Default `all` |
| `page`, `limit` | number | Default `1`, `20` |

**Response `data`**
```json
{
  "items": [
    {
      "id": "uuid",
      "customerName": "NHAI Northern Zone",
      "customerContact": "+91 7290709983",
      "email": "connect.nhai@gov.in",
      "location": "Dehradun, Uttarakhand, 248001",
      "role": "customer",
      "isActive": true,
      "status": "active",
      "lastActivityAt": "2026-08-29T08:55:00.000Z",
      "joinedOn": "2026-06-15T12:41:12.700Z",
      "lastLoginAt": "2026-08-29T08:00:00.000Z",
      "lastLoginIp": "203.0.113.5",
      "ordersQty": 4,
      "lifetimeValue": 2300000,
      "cart": { "itemCount": 0, "lastUpdated": null, "isAbandoned": false, "idleSinceHours": null }
    }
  ],
  "stats": { "totalUsers": 120, "newInLastMonth": 36 },
  "meta": { "total": 120, "page": 1, "limit": 20, "totalPages": 6 }
}
```
- `customerName`/`customerContact`/`location` resolve from `CompanyProfile` + default `Address` — blank/email-fallback if the user hasn't filled those in.
- `status` is a derived "active/inactive" badge based on `lastActivityAt` vs. `activeWithinHours` — **not** the same as `isActive` (account-enabled flag, always `true` unless explicitly disabled).
- `stats` reflects the whole user base, not just the current page/filters — use it for the "Total users — 120 +36 from last month" header regardless of what filters are applied to the table.
- One tab, one endpoint: the "Users" tab and "Activity log" tab in the UI are the same data — just show/hide the `ordersQty`/`lifetimeValue` columns and pick which filters to expose per tab.

> ⚠️ **Known limitation** (pre-existing pattern, extended rather than fixed): `hasCartItems`, `abandoned`, and `activityStatus` are filtered *after* the page is fetched from the DB, so a filtered response can come back with fewer than `limit` rows even when more matches exist on later pages. `search`, `locationState`, and `joinedWithinDays` are proper SQL-level filters and don't have this issue. Don't rely on `meta.total`/`totalPages` being accurate when any of the three post-filters are active.

### `GET /admin/users/:userId`
```json
{
  "user": { /* User entity */ },
  "profile": { /* CompanyProfile | null */ },
  "addresses": [ /* Address[] */ ],
  "lifetimeValue": 2300000,
  "cart": { /* Cart with items.product.images, savedItems */ },
  "orders": [ /* last 10 orders */ ],
  "loginHistory": [ /* last 10 successful logins: createdAt, ip, userAgent, durationMs */ ],
  "recentActivity": [ /* last 20 API log entries: method, path, statusCode, ip, durationMs, createdAt */ ]
}
```

---

## 8. API Logs

Base path: `/admin/logs`

### `GET /admin/logs`

| Param | Type | Notes |
|---|---|---|
| `userId` | uuid | |
| `method` | `GET`\|`POST`\|`PATCH`\|`PUT`\|`DELETE` | |
| `path` | string | Partial match, e.g. `/products` |
| `startDate`, `endDate` | ISO date | Both required together to filter by date |
| `page`, `limit` | number | Default `1`, `20` |

**Response `data`**
```json
{
  "items": [ /* ApiLog rows */ ],
  "meta": { "total": 500, "page": 1, "limit": 20, "totalPages": 25 }
}
```

### `GET /admin/logs/:id`
Single `ApiLog` entity, or `null` if not found (this one doesn't 404 — check for `null`).

---

## 9. Brands

Base path: `/admin/brands`. Simple CRUD — a brand is just `name` (+ auto `slug`), with optional `logo`/`isActive`.

### `GET /admin/brands`
Query: `search` (optional, matches `name`). No pagination — returns the full list, ordered by name.

### `GET /admin/brands/:id`
Single brand.

### `POST /admin/brands`
```json
{ "name": "JANAK", "logo": "https://...", "isActive": true }
```
Only `name` is required. `slug` is derived from `name` server-side — don't send it.

### `PATCH /admin/brands/:id`
Same body, all fields optional.

### `DELETE /admin/brands/:id`
```json
{ "message": "Brand deleted" }
```
Deleting a brand that still has products assigned to it is rejected with a clean `409` (same pattern as category delete):
```json
{ "statusCode": 409, "message": "Cannot delete \"JANAK\" — one or more products still reference this brand. Move or delete them first." }
```

---

## Cross-cutting notes for frontend

- **Human-readable codes** (`productCode`, `categoryCode`): format `Jnk<YY>-<7 digits>`, e.g. `Jnk26-0008419`. Always server-generated on create — never send these fields.
- **`User` has no `name` field.** Anywhere you see a "customer name", it's resolved from `CompanyProfile.companyName` with an email fallback — orders, quotes, coupons, users, and dashboard (`recent-quotations`) all do this consistently now.
- **Static uploads** (category images) are served from the API host root, not under `/api` — e.g. `{API_HOST}/uploads/category-images/xxx.jpg`.
- Boolean query params (`hasCartItems`, `abandoned`) must be sent as the **string** `"true"`, not a JSON boolean — they're compared with `=== 'true'` server-side.

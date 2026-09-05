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
  { "categoryId": "uuid", "categoryName": "GNSS Antenna", "totalSales": 230000, "orderCount": 4 }
]
```
Sorted by `totalSales` descending.

### `GET /admin/dashboard/recent-quotations`

Query: `limit` (default `10`).
```json
[
  {
    "id": "uuid",
    "quoteId": "Q-2026-00045",
    "status": "pending",
    "createdAt": "2026-08-17T16:49:46.083Z",
    "raisedBy": "john@example.com",
    "productRequested": "AgAnt-3S-430x311",
    "quotedPrice": null
  }
]
```
> `raisedBy` is currently the customer's **email**, not a display name — `User` has no `name` column. For a proper customer name, cross-reference `/admin/users/:userId` or `/admin/quotes/:id` (both resolve the company name from `CompanyProfile`).

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

- `price` = **listing/selling price** — this is what cart/checkout actually charge.
- `originalPrice` = MRP shown struck through. Optional, purely cosmetic.
- `images[].type` = `image` \| `video` (default `image`).
- A human-readable `productCode` (e.g. `Jnk26-0008419`) is generated server-side — don't send it.

Response: the created product (same shape as `GET /:id`).

### `PATCH /admin/products/:id`
Same body as create, all fields optional (`Partial<CreateProductDto>`). **`images`/`specs`/`documents` sent here are ignored** — manage those through the dedicated sub-resource endpoints below (this was a deliberate fix: blindly assigning array fields here used to risk duplicate rows on every unrelated edit).

### `DELETE /admin/products/:id`
`{ "message": "Product deleted" }`

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

> Note: these endpoints accept `url` strings, not raw file uploads — upload the file to storage yourself first (or use the category image-upload pattern below as a model) and pass the resulting URL.

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
Only `name` required. `categoryCode` is auto-generated, don't send it. `slug` is derived from `name` server-side.

### `PATCH /admin/categories/:id`
Same body, all optional.

### `DELETE /admin/categories/:id`
`{ "message": "Category deleted" }`

### `POST /admin/categories/upload-image`
`multipart/form-data`, field name **`image`** (jpg/jpeg/png/webp, max 5MB).

**Response:**
```json
{ "url": "/uploads/category-images/1735...-923.jpg", "name": "GNNS_Antenna.jpeg" }
```
Call this first, then pass the returned `url` into the `image` field of create/update. The URL is served directly (relative to `API_HOST`, no `/api` prefix — static assets are mounted at root).

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
Same query params as the list endpoint (`tab`, `search`, `from`, `to`, `status`) but **unpaginated** — every matching row is exported, not just the current page. Returns an `.xlsx` file (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment`), not the usual JSON envelope.

### `GET /admin/orders/:id`
Accepts either the UUID **or** the human `orderId` (e.g. `JP-2026-00001`) in the path. Returns the full `Order` entity with `user`, `items.product.images`, `tracking`.

### `GET /admin/orders/:id/invoice`
Same `:id` matching (UUID or `JP-2026-00001`-style). Returns a PDF invoice (`Content-Type: application/pdf`, `Content-Disposition: attachment`) — order details, bill-to (from `CompanyProfile`/shipping address), line items, subtotal/GST/shipping/total, and advance/balance payment status. Amounts are rendered as `Rs. 1234.00` rather than `₹` — PDFKit's standard fonts don't include the ₹ glyph and silently render it as a garbled character, so this avoids that rather than shipping broken invoices.

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
{ "code": "Jnk-NHAI-321709" }
```
Format: `Jnk-<first word of customer/company name, uppercased>-<6 digits>`.

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

### Where the discount actually applies
`POST /coupons/validate` (public), `POST /cart/coupon`, and `POST /checkout/place-order` all now branch on `discountType`/`maxDiscountAmount`/`additionalDiscountType` consistently. A coupon scoped to a `user` returns `400 "This coupon is not valid for your account"` for anyone else; below `minimumOrderValue` returns a `400` naming the required minimum.

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

## Cross-cutting notes for frontend

- **Human-readable codes** (`productCode`, `categoryCode`): format `Jnk<YY>-<7 digits>`, e.g. `Jnk26-0008419`. Always server-generated on create — never send these fields.
- **`User` has no `name` field.** Anywhere you see a "customer name" that isn't explicitly resolved via `CompanyProfile` (orders list, recent-quotations), it's silently falling back to email. Quotes, coupons, and users modules all resolve the real company name correctly — orders does not (pre-existing, not fixed this round).
- **Static uploads** (category images) are served from the API host root, not under `/api` — e.g. `{API_HOST}/uploads/category-images/xxx.jpg`.
- Boolean query params (`hasCartItems`, `abandoned`) must be sent as the **string** `"true"`, not a JSON boolean — they're compared with `=== 'true'` server-side.

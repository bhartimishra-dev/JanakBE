# Admin Products API

Reference for `/admin/products/*` — for frontend integration. Written specifically to close out a recurring `400` error from creating a product with images — see [Creating a product with images](#creating-a-product-with-images-the-part-that-keeps-failing) below if that's what brought you here.

## Base setup

- **Base URL**: `{API_HOST}/api/v1/admin/products`
- **Auth**: every endpoint requires `Authorization: Bearer <JWT>` for a user with `role: admin`.
- **Response envelope**:
  ```json
  { "success": true, "data": { /* payload below */ }, "message": "Success", "timestamp": "..." }
  ```
  Errors:
  ```json
  { "success": false, "statusCode": 400, "message": "...", "errors": ["...", "..."], "path": "...", "timestamp": "..." }
  ```
  `errors` is an array with one entry per failed field when it's a validation error — read every entry, not just `message` (which is just the first one).

---

## `GET /admin/products`

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | number | Default `1`, `20` |
| `search` | string | Matches product `name` or `modelNumber` |
| `categoryId` | uuid | |
| `availability` | `website` \| `app` \| `hidden` \| `all` | `hidden` = shown on neither |

Response: `{ products: [...], total, page, limit, totalPages }`. Each product includes `category`, `brand`, `images[]`.

## `GET /admin/products/:id`

Full product: `category`, `brand`, `images[]`, `specs[]`, `documents[]`.

---

## Creating a product with images — the part that keeps failing

This is a **two-step process**. You cannot send a raw file inside the `POST /admin/products` JSON body — `images[]` only accepts URL strings, and a URL only ever comes from actually uploading the file first.

### Step 1 — upload the file(s)

```
POST /admin/products/upload-images
Content-Type: multipart/form-data

images: <binary file>          ← repeat this field for multiple files, up to 10
```
- Field name must be exactly `images` (plural), even for a single file.
- Accepts `.jpg`/`.jpeg`/`.png`/`.webp` (images) or `.mp4`/`.mov`/`.webm` (videos), max 20MB each.
- Wrong file type or no file at all → clean `400`, not a server error.

**Response:**
```json
{
  "success": true,
  "data": [
    { "url": "https://stagapi.janakgnss.com/uploads/products/1788770144642-134952.png", "name": "Experience.png", "type": "image" }
  ]
}
```
`url` is a full absolute URL — use it exactly as returned, don't modify it. `type` is auto-detected from the file extension.

Documents work identically via a separate endpoint: `POST /admin/products/upload-documents`, field name `documents`, accepts `.pdf`/`.doc`/`.docx`.

### Step 2 — create the product using the URL(s) from step 1

```json
POST /admin/products
Content-Type: application/json

{
  "name": "...",
  "description": "...",
  "categoryId": "<real category uuid>",
  "brandId": "<real brand uuid>",
  "price": 50000,
  "stockStatus": "in_stock",
  "images": [
    { "url": "https://stagapi.janakgnss.com/uploads/products/1788770144642-134952.png", "name": "Experience.png", "sortOrder": 1 }
  ]
}
```

### The exact mistakes that produced the `400` we were debugging

A real payload that failed, for reference — **do not build a request that looks like this**:
```json
{
  "brandId": "sdfbjsdbfjdb",
  "images": [{ "order": 1, "name": "Experience.png" }],
  "specs": [{ "value": "some spec text" }]
}
```
produced:
```json
{
  "message": "brandId must be a UUID",
  "errors": [
    "brandId must be a UUID",
    "images.0.property order should not exist",
    "images.0.url must be a string",
    "specs.0.key must be a string"
  ]
}
```

| What was wrong | Fix |
|---|---|
| `brandId: "sdfbjsdbfjdb"` — not a real id | Use an actual brand UUID from wherever the brand dropdown is populated (e.g. `GET /brands`) |
| `images[0]` had `order` and no `url` | The field is `sortOrder`, not `order` — and it needs a real `url` from step 1 above. There is no field for a raw filename with no URL. |
| `specs[0]` had `value` but no `key` | Every spec needs **both** `key` (the label) and `value` filled in. Don't submit a spec row that's still half-filled. |

**Validation is strict on purpose**: unknown fields (like `order`) are rejected outright rather than silently ignored, so a typo'd field name always surfaces as an error instead of silently doing nothing.

---

## `POST /admin/products` — full field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | **yes** | string | |
| `description` | **yes** | string | |
| `categoryId` | **yes** | uuid | Real category id |
| `brandId` | **yes** | uuid | Real brand id |
| `price` | **yes** | number | Listing/selling price — this is what cart & checkout actually charge |
| `stockStatus` | **yes** | enum | `in_stock` \| `limited_stock` \| `get_quote` \| `on_order` |
| `headline` | no | string, ≤150 chars | |
| `keySpecification` | no | string, ≤500 chars | Free-text spec block |
| `originalPrice` | no | number | MRP shown struck through |
| `modelNumber` | no | string | |
| `hsnCode` | no | string | GST HSN/SAC code, e.g. `"9015"`. Shown on the order invoice's line-item and HSN-summary tables — see the `GET /admin/orders/:id/invoice` section in `admin-api-integration.md`. Snapshotted onto the order item at checkout, so it's safe to correct later without affecting past invoices. Left unset, invoices print `—` for that product. |
| `salesRepName` / `salesRepPhone` | no | string | |
| `isFeatured` / `isNewArrival` / `showOnWebsite` / `showOnApp` | no | boolean | |
| `images` | no | array | See below |
| `specs` | no | array | See below |
| `documents` | no | array | See below |

`productCode` (e.g. `Jnk26-0008419`) and `slug` are generated server-side — never send them.

### `showOnWebsite` / `showOnApp` actually control the public storefront now

These flags are enforced on the **public, customer-facing** product endpoints (`GET /products`, `GET /products/:id`, `GET /products/:id/related` — not under `/admin`) via an optional `?platform=website|app` query param:

- `GET /products?platform=website` — only products with `showOnWebsite: true`
- `GET /products?platform=app` — only products with `showOnApp: true`
- Omit `platform` entirely and both flags are ignored (returns everything, `isActive` permitting) — this is the existing behavior, unchanged, for any caller not yet passing the param.

The website frontend should call every product endpoint with `platform=website`; the mobile app should always pass `platform=app`. This also applies to direct detail lookups — `GET /products/:id?platform=app` returns `404` for a product with `showOnApp: false`, not just omitting it from list results, so a hidden product can't be reached by guessing/deep-linking its id either.

**`images[]` entry**: `{ "url": "string (required)", "name"?: "string", "type"?: "image"|"video" (default image), "isPrimary"?: boolean, "sortOrder"?: number }`

**`specs[]` entry**: `{ "key": "string (required)", "value": "string (required)", "sortOrder"?: number }` — both `key` and `value` are required; don't send a partial row.

**`documents[]` entry**: `{ "name": "string (required)", "url": "string (required)", "fileType"?: "string" }`

**Response**: the created product (`201`), same shape as `GET /:id`.

---

## `PATCH /admin/products/:id`

Same fields as create, all optional — only send what changes.

⚠️ **`images`/`specs`/`documents` sent here are silently ignored.** Manage those exclusively through the sub-resource endpoints below. (This is deliberate: blindly overwriting these arrays on every unrelated field edit used to risk creating duplicate rows.)

## `DELETE /admin/products/:id`

`{ "message": "Product deleted" }`

---

## Image/video sub-resource (for an existing product)

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/admin/products/:id/images` | `{ "images": [ProductImageDto, ...] }` | Appends. `sortOrder` auto-continues from current count if omitted. |
| `PATCH` | `/admin/products/:id/images/reorder` | `{ "imageIds": ["uuid", "uuid", ...] }` | Full ordered list of **all** image ids for the product — sets `sortOrder` to array index |
| `DELETE` | `/admin/products/:id/images/:imageId` | — | `{ "message": "Image deleted" }` |

## Document sub-resource (for an existing product)

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/admin/products/:id/documents` | `{ "documents": [ProductDocumentDto, ...] }` | Appends |
| `DELETE` | `/admin/products/:id/documents/:documentId` | — | `{ "message": "Document deleted" }` |

All four return the full updated product. Same upload-first rule applies — get a `url` from `upload-images`/`upload-documents` before calling these.

---

## Why upload is a separate call instead of one multipart create request

Categories have a single `image` field, so their create endpoint accepts the file directly in the same request. Products don't work the same way on purpose: `images[]` is a whole gallery (each with its own `url`/`name`/`type`/`sortOrder`), plus a separate `documents[]` array — multipart form data can carry files and flat strings, but not a structured array of objects like that. The two-step flow (upload → get URLs → create/update with those URLs) is also what the original product form design called for: an "Image/Video" section with its own add/reorder/delete actions, distinct from the rest of the form.

## Cross-cutting notes

- **`productCode` format**: `Jnk<YY>-<7 digits>`, e.g. `Jnk26-0008419` — always server-generated, never client-supplied.
- Uploaded file URLs are full absolute URLs (e.g. `https://stagapi.janakgnss.com/uploads/products/...`) — use them exactly as returned.
- `price` vs `originalPrice`: `price` is what's actually charged at checkout; `originalPrice` is purely a cosmetic strikethrough MRP.

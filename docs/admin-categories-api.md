# Admin Categories API

Reference for `/admin/categories/*` — for frontend integration.

## Base setup

- **Base URL**: `{API_HOST}/api/v1/admin/categories`
- **Auth**: every endpoint requires `Authorization: Bearer <JWT>` for a user with `role: admin`. Missing/wrong role → `401`/`403`.
- **Response envelope**: every response is wrapped:
  ```json
  { "success": true, "data": { /* payload below */ }, "message": "Success", "timestamp": "..." }
  ```
  Errors look like:
  ```json
  { "success": false, "statusCode": 400, "message": "...", "errors": ["..."], "path": "...", "timestamp": "..." }
  ```
  (`errors` only appears for validation failures.) The two file-download-style responses in this API don't apply — categories has no file downloads, only the image upload described below.

---

## `GET /admin/categories`

List with pagination, search, and availability filtering.

| Param | Type | Notes |
|---|---|---|
| `page` | number | Default `1` |
| `limit` | number | Default `20` |
| `search` | string | Matches `categoryCode` **or** `name` (`ILIKE`, partial match) |
| `availability` | `website` \| `app` \| `hidden` \| `all` | `website`/`app` = that flag is `true`. `hidden` = both `showOnWebsite` and `showOnApp` are `false`. Omit or `all` = no filter. |

**Response `data`:**
```json
{
  "categories": [
    {
      "id": "uuid",
      "categoryCode": "Jnk26-0008419",
      "name": "GNSS Antenna",
      "slug": "gnss-antenna",
      "image": "/uploads/category-images/1735...-923.jpg",
      "icon": null,
      "isActive": true,
      "showOnWebsite": true,
      "showOnApp": true,
      "sortOrder": 0,
      "productQty": 5,
      "createdAt": "2026-06-16T09:00:00.000Z",
      "updatedAt": "2026-06-16T09:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

Notes on fields:
- `categoryCode` — human-readable id, format `Jnk<YY>-<7 digits>` (e.g. `Jnk26-0008419`). **Auto-generated server-side** — never send it, it's ignored/overwritten on create.
- `productQty` — computed on every request (count of products currently in this category), not a stored column. Don't cache it long-term.
- `icon` — legacy field, superseded by `image`. You'll basically never need to read or write this directly (see the fallback behavior below).

---

## `GET /admin/categories/:id`

Single category, same shape as a list row (including `productQty`). `404` if not found.

---

## `POST /admin/categories` — create

Accepts **either** `multipart/form-data` (upload the image file directly) **or** plain `application/json` (pass an image URL you already have) — pick whichever fits your flow. Both hit the same endpoint.

### Option A — multipart, upload the file directly (recommended for a file-picker UI)
```
POST /admin/categories
Content-Type: multipart/form-data

name: GNSS Antenna
isActive: true
showOnWebsite: true
showOnApp: false
sortOrder: 0
image: <binary file — jpg/jpeg/png/webp, max 5MB>
```

### Option B — JSON, pass an existing image URL
```json
POST /admin/categories
Content-Type: application/json

{
  "name": "GNSS Antenna",
  "image": "/uploads/category-images/173...-antenna.jpg",
  "isActive": true,
  "showOnWebsite": true,
  "showOnApp": false,
  "sortOrder": 0
}
```

### Field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | **yes** | string | |
| `image` | no | string (URL) | Ignored if a file is also uploaded in the same request — the uploaded file always wins. |
| `isActive` | no | boolean | Default `true` |
| `showOnWebsite` | no | boolean | Default `true` |
| `showOnApp` | no | boolean | Default `false` |
| `sortOrder` | no | number | Default `0` |

`categoryCode` and `slug` are generated server-side (slug derived from `name`) — don't send either.

**Multipart string coercion**: when sending multipart/form-data, non-file fields always arrive as raw strings (`"true"`, `"5"`) even though they're logically booleans/numbers — this is standard HTTP form behavior, not a bug. The API coerces these automatically server-side, so `isActive: "false"` and `isActive: false` behave identically. No special handling needed on your end — just send the values as strings in the form and they'll be interpreted correctly.

**Response**: the created category (`201`), same shape as a `GET` row.

**Errors**: `400` on validation failure (e.g. missing `name`, or an image file that isn't jpg/jpeg/png/webp, or over 5MB).

---

## `PATCH /admin/categories/:id` — update

Identical body rules to create (multipart-with-file **or** JSON-with-URL), every field optional. Only send what you want to change.

```json
PATCH /admin/categories/:id
Content-Type: application/json

{ "name": "GNSS Antenna (Updated)", "showOnApp": true }
```

Uploading a new file replaces the image the same way as create — the new file's URL overwrites whatever `image` was before. `404` if the category doesn't exist.

---

## `DELETE /admin/categories/:id`

```json
{ "message": "Category deleted" }
```
`404` if not found. This is a hard delete — no soft-delete/archive step. The `Product → Category` foreign key has no `onDelete` behavior configured, so **deleting a category that still has products in it is rejected**, with a clean `409`:
```json
{ "success": false, "statusCode": 409, "message": "Cannot delete \"GNSS Antenna\" — 5 product(s) still reference this category. Move or delete them first." }
```
Check `productQty` on the category first (from the list/detail response) and disable/warn on the delete button in the UI when it's non-zero, rather than relying on the error round trip.

---

## `POST /admin/categories/upload-image` — optional standalone upload

You generally **don't need this anymore** — `POST`/`PATCH /admin/categories` accept the file directly now (see above). This endpoint still exists for flows that want to upload/preview an image *before* the rest of the form is filled in or submitted — e.g. an "Upload Image" button that immediately shows the picked file's name, ahead of a separate "Add This Category" submit action.

```
POST /admin/categories/upload-image
Content-Type: multipart/form-data

image: <binary file — jpg/jpeg/png/webp, max 5MB>
```

**Response:**
```json
{ "url": "/uploads/category-images/1735...-923.jpg", "name": "GNNS_Antenna.jpeg" }
```

Pass the returned `url` into the `image` field of a subsequent **JSON** create/update call (Option B above). Note: the returned `url` is served from the API host's root, **not** under `/api` — e.g. `{API_HOST}/uploads/category-images/1735...-923.jpg`, not `{API_HOST}/api/v1/...`.

Calling this without a file returns a clean `400` ("No image file provided — send it as multipart/form-data field \"image\""), not a server error.

---

## Cross-cutting notes

- **`categoryCode` format**: `Jnk<YY>-<7 digits>`, e.g. `Jnk26-0008419` — same generator used for product codes, always server-side, never client-supplied.
- **`image` vs `icon`**: `icon` was the original field name before this API existed in its current form; some pre-existing rows may have `icon` set but `image` empty. The API automatically falls back to `icon`'s value when reading a category whose `image` is unset, so you'll never see a blank image for a row that actually has one — just always read/write `image` going forward and ignore `icon` entirely.
- **Static assets**: uploaded images are served from the API host's root (`{API_HOST}/uploads/category-images/...`), not under the `/api` prefix.
- **No pagination on the parent product list**: `productQty` tells you how many products reference a category, but doesn't return them — use `GET /admin/products?categoryId=<id>` to list them.

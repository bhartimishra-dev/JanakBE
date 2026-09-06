# Admin Users & Activity API

Reference for `/admin/users/*` — for frontend integration.

## Base setup

- **Base URL**: `{API_HOST}/api/v1/admin/users`
- **Auth**: every endpoint requires `Authorization: Bearer <JWT>` for a user with `role: admin`. Missing/wrong role → `401`/`403`.
- **Response envelope**: every response is wrapped:
  ```json
  { "success": true, "data": { /* payload below */ }, "message": "Success", "timestamp": "..." }
  ```

## One endpoint powers both the "Users" tab and the "Activity log" tab

Both tabs in the UI mockup are the **same** `GET /admin/users` call — they just show/hide different columns and expose different filter controls on the frontend:

- **Users tab** columns: Customer Name, Contact, Location, Status, Activity, Orders Qty., Lifetime Value, Joined On.
- **Activity log tab** columns: Customer Name, Contact, Location, Status, Activity, Joined On (no Orders Qty/Lifetime Value) — plus exposes the "Last active since" / "Activity Status" / "Joined us in last" / "location state" filter controls, which map directly to query params below.

There's no separate "activity log" endpoint to call — build both tab UIs against this one response shape.

---

## `GET /admin/users`

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `CompanyProfile.companyName` **or** email (`User` has no name column of its own) |
| `hasCartItems` | `"true"` | **String**, not a JSON boolean — compared with `=== 'true'` server-side. Only users with items currently in cart. |
| `abandoned` | `"true"` | Same string-boolean rule. Only users with an abandoned cart (see `idleHours`). |
| `idleHours` | number | Hours since cart's last update to count it as abandoned. Default `24`. |
| `locationState` | string | Matches the user's **default** address `state` (partial match) |
| `joinedWithinDays` | number | Only users created in the last N days — maps to the "Joined us in last" dropdown |
| `activeWithinHours` | number | Hours since last activity to count the user as `active`. Default `24`. Maps to the "Last active since" dropdown. |
| `activityStatus` | `active` \| `inactive` \| `all` | Default `all`. Maps to the "Activity Status" dropdown. |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

### Response `data`

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
      "lastActivityAt": "2026-09-06T11:15:05.903Z",
      "joinedOn": "2026-06-15T12:41:12.700Z",
      "lastLoginAt": "2026-09-06T08:00:00.000Z",
      "lastLoginIp": "203.0.113.5",
      "ordersQty": 4,
      "lifetimeValue": 2300000,
      "cart": {
        "itemCount": 0,
        "lastUpdated": null,
        "isAbandoned": false,
        "idleSinceHours": null
      }
    }
  ],
  "stats": { "totalUsers": 120, "newInLastMonth": 36 },
  "meta": { "total": 120, "page": 1, "limit": 20, "totalPages": 6 }
}
```

### Field reference

| Field | Source / meaning |
|---|---|
| `customerName` | `CompanyProfile.companyName`, falls back to `email` if the user hasn't filled one in |
| `customerContact` | `CompanyProfile.phone`, blank if not set |
| `location` | Default `Address` → `"City, State, Pincode"`, blank if no default address |
| `role` | `customer` \| `admin` — the account's actual role |
| `isActive` | Account-enabled flag (rarely `false` — set explicitly to disable a login). **Not** the same thing as `status` below. |
| `status` | **Derived** `active`/`inactive` badge based on `lastActivityAt` vs. `activeWithinHours` — this is what "5 Minutes Ago... Active" in the UI maps to |
| `lastActivityAt` | Timestamp of the most recent API call by this user (any endpoint), or their last successful login if no other activity is logged — whichever is more recent |
| `joinedOn` | `User.createdAt` |
| `lastLoginAt` / `lastLoginIp` | From the most recent successful `POST /auth/login` in the API log |
| `ordersQty` | Total order count, all statuses included |
| `lifetimeValue` | Sum of `totalAmount` across all **non-cancelled** orders |
| `cart.isAbandoned` | `true` when the cart has items, hasn't been updated in `idleHours`, and the user has never placed an order |
| `stats` | Reflects the **whole user base**, not just the current page/filters — use this for the "Total users - 120 +36 from last month" header regardless of what's currently filtered in the table |

### ⚠️ Known limitation — read before wiring up pagination

`hasCartItems`, `abandoned`, and `activityStatus` are filtered **after** the page is already fetched from the database (each user's cart/activity has to be individually resolved first, since none of it lives on the `User` row itself). This means:

- A response with any of these three filters active can come back with **fewer than `limit` rows**, even though more matches might exist on later pages.
- `meta.total`/`meta.totalPages` reflect the **pre-filter** count in that case — don't trust them as the true total when these filters are on.

`search`, `locationState`, and `joinedWithinDays` are proper SQL-level `WHERE` filters and don't have this issue — pagination is accurate when only these are used.

---

## `GET /admin/users/:userId`

Full detail view for one user (the "click into a user" screen).

```json
{
  "user": { "id": "uuid", "email": "connect.nhai@gov.in", "role": "customer", "isActive": true, "createdAt": "...", "updatedAt": "..." },
  "profile": { "id": "uuid", "companyName": "NHAI Northern Zone", "phone": "+91...", "panNumber": "...", "gstin": "...", "panCardFileUrl": "...", "gstCertificateFileUrl": "..." },
  "addresses": [ { "id": "uuid", "label": "HOME", "addressLine1": "...", "city": "...", "state": "...", "pincode": "...", "isDefault": true } ],
  "lifetimeValue": 2300000,
  "cart": { "items": [ { "quantity": 1, "product": { "name": "...", "images": [...] } } ], "savedItems": [...] },
  "orders": [ /* last 10 orders, newest first */ ],
  "loginHistory": [ { "createdAt": "...", "ip": "...", "userAgent": "...", "durationMs": 45 } /* last 10 */ ],
  "recentActivity": [ { "method": "GET", "path": "/api/v1/products", "statusCode": 200, "ip": "...", "durationMs": 12, "createdAt": "..." } /* last 20 */ ]
}
```

- `profile` is `null` if the user hasn't submitted a company profile yet.
- `lifetimeValue` here uses the same non-cancelled-orders rule as the list endpoint.
- `orders`/`loginHistory`/`recentActivity` are all capped (10/10/20 respectively) — this is a detail snapshot, not a paginated history browser. Build a separate view against `/admin/logs` if you need the full activity log for a user beyond the last 20 entries.

---

## Cross-cutting notes

- **`User` has no `name` field anywhere in the schema.** Every "customer name" you see across the admin API (here, orders, quotes, coupons) is resolved from `CompanyProfile.companyName` with an email fallback — there's no separate first/last name to display.
- Boolean query params (`hasCartItems`, `abandoned`) must be sent as the literal string `"true"` — a JSON `true` won't match the server-side `=== 'true'` check and will be silently treated as `false`/absent.
- If you need users list export or bulk actions (CSV download, mass status change, etc.), those don't exist yet — ask if you need them and they can be scoped similarly to the orders Excel export.

# Payment Gateway Integration (Frontend/App)

How to wire up the advance/balance payment flow against the existing checkout setup. Covers the full lifecycle: place order → pay advance online (ICICI) → order confirmed → pay balance via NEFT → order ships.

## Base setup

- **Base URL**: `{API_HOST}/api/v1`
- **Auth**: every endpoint below except the gateway callback requires `Authorization: Bearer <JWT>`.
- **Response envelope**: `{ success, data, message, timestamp }` on success; `{ success: false, statusCode, message, errors, path, timestamp }` on error — same as every other endpoint in this API.

---

## The two-stage payment model this business uses

Every order splits into two payments:

1. **Advance** — 10% of the total, capped at ₹50,000. Paid **online**, immediately after placing the order, via the ICICI payment gateway (UPI/card/net banking). This is what step 2–4 below cover.
2. **Balance** — the remainder. Collected via **NEFT bank transfer** — the customer wires the money directly to the company's account (details shown in `neftDetails`), and an **admin manually confirms** it arrived. There's no gateway/API step the frontend triggers for the balance — just display the bank details and wait for the order status to move to `balance_paid` (visible via `GET /orders/:id`).

If the order total is small enough that the advance covers 100% of it (`isFullPayment: true`), there's no balance stage at all — one online payment finishes the order.

---

## Step 1 — Place the order

```
POST /checkout/place-order
Content-Type: application/json

{
  "addressId": "<uuid, required>",
  "paymentMethod": "upi",
  "requiresGstBill": false,
  "couponCode": "SAVE500"
}
```
- `paymentMethod`: one of `upi` | `net_banking` | `credit_card` | `debit_card` | `neft` | `qr_code`. Optional — informational, doesn't affect which gateway flow runs (that's always ICICI for the advance).
- `couponCode`: optional. If omitted, falls back to whatever coupon is already applied to the cart via `POST /cart/coupon` — you don't have to repeat it here if it's already on the cart.
- `transactionId`: optional, leave unset — advance payment hasn't happened yet at this point.

**Response** (`201`):
```json
{
  "orderId": "JP-2026-00013",
  "id": "b5adefb2-3907-4e93-95fd-73104aa3a9f6",
  "invoiceUrl": "https://.../uploads/invoices/b5adefb2-....pdf",
  "totalAmount": 143048,
  "advanceAmount": 14304.80,
  "balanceAmount": 128743.20,
  "isFullPayment": false,
  "neftDetails": {
    "accountName": "...", "accountNumber": "...", "ifscCode": "...", "bankName": "...", "qrCodeUrl": "..."
  },
  "estimatedDeliveryStart": "2026-09-20T...",
  "estimatedDeliveryEnd": "2026-09-23T...",
  "message": "Order placed. Pay ₹14304.80 now via UPI. Remaining ₹128743.20 via NEFT before shipping."
}
```
`neftDetails` is only present when `isFullPayment: false` — hang onto it, you'll show it again later for the balance stage (also re-fetchable any time from the order).

> **The cart is not cleared at this point.** It stays exactly as it was — including any applied coupon — until the advance payment actually succeeds. If the customer abandons checkout here or the payment fails, their cart is untouched and they can just try again. Don't assume the cart is empty right after this call.

---

## Step 2 — Start the online advance payment

```
POST /payments/initiate
Content-Type: application/json

{
  "orderId": "JP-2026-00013",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerMobile": "919999999999",
  "addlParam1": "000",
  "addlParam2": "000"
}
```
- `orderId` is the **human** order id (`JP-2026-00013`), not the UUID.
- `customerName` must be a real name, not an email — validated server-side (`^[^@]+$`).
- `customerMobile` must be 10–12 digits, country code included, no `+` or spaces (e.g. `919999999999`).

**Response**:
```json
{ "paymentUrl": "https://<icici-gateway-host>/...?tranCtx=abc123", "merchantTxnNo": "1234567890JP202600013", "tranCtx": "abc123" }
```

**Redirect the browser/webview to `paymentUrl`.** This is a full page redirect (or open in an in-app browser/webview for mobile) — the customer completes payment on ICICI's own hosted page, not embedded in your app.

---

## Step 3 — Handle the return from the gateway

After the customer finishes paying (success or failure), ICICI redirects them to `POST /payments/callback` on **this backend** (not your frontend directly — that's an internal server-to-server-ish step). This backend then 302-redirects the browser onward to **your frontend**, at:

```
{PAYMENT_REDIRECT_URL}/payment/callback?status=success&orderId=JP-2026-00013&txnId=<icici-txn-id>
{PAYMENT_REDIRECT_URL}/payment/callback?status=failed&orderId=JP-2026-00013&code=<icici-response-code>
```

So your frontend needs a route at `/payment/callback` that reads `status`/`orderId`/`txnId`/`code` from the query string and shows the right screen. `PAYMENT_REDIRECT_URL` is an env var on this backend — confirm with backend what it's currently set to for your environment (staging vs prod) since that's literally the URL the gateway lands the customer on.

**On `status=success`**: the order is now `advance_paid`. The cart has just been cleared and any applied coupon consumed (see the note in Step 1 — this is the point that actually happens). Fetch `GET /orders/:id` (or by `orderId`) to show the confirmed order/invoice. If `isFullPayment` was `true`, the order is fully paid — nothing left to collect. Otherwise, show the balance/NEFT screen using the `neftDetails` from Step 1's response (or re-fetch — see below).

**On `status=failed`**: **the order has already been cancelled server-side** by this point — not left "pending." Show a failure screen and let the customer retry. Retrying means either:
- Calling `POST /payments/initiate` again with the *same* `orderId`, **before** it gets cancelled — there's a small window right after a failure where it's possible the order is still `pending_advance_payment` if this specific failure path hasn't finished processing, but don't rely on that. The robust approach: **assume it's cancelled and let the customer start over from the cart** (which still has all their items — see Step 1's note). A fresh `POST /checkout/place-order` creates a new order.

---

## Step 4 (optional) — Poll payment status directly

Useful if the redirect flow is unreliable (e.g. the customer closes the gateway tab manually instead of completing the redirect).

```
GET /payments/status/:merchantTxnNo
```
Use the `merchantTxnNo` returned from Step 2.

**Response**:
```json
{ "localStatus": "success", "iciciResponse": { "txnStatus": "SUC", ... } }
```
`localStatus` is one of `pending` | `success` | `failed`. If this comes back `failed`, the order has been cancelled server-side, same as the callback failure path above.

---

## Step 5 — List past payment attempts

```
GET /payments/my-transactions
```
Returns every `PaymentTransaction` for the current user (across all their orders), newest first — useful for a "payment history" screen. Each includes `merchantTxnNo`, `status`, `amount`, `paymentStage` (`advance`), and the linked `order`.

---

## The balance (NEFT) stage

There's no API call your frontend makes to "pay" the balance — it's a manual bank transfer. What the frontend needs to do:

1. Show the `neftDetails` (account name/number/IFSC/bank name/QR code) from the order.
2. Tell the customer to transfer `balanceAmount` and note the UTR/reference number.
3. Poll or just periodically re-fetch `GET /orders/:id` — once an admin confirms the transfer on their end, `order.status` moves to `balance_paid` and `order.balancePaid: true`. There's no customer-facing endpoint to submit the UTR yourself; that confirmation is admin-only (`PATCH /admin/orders/:id/confirm-balance-neft`).

---

## What happens if the customer just never pays at all

If a customer places an order and never attempts the advance payment (closes the tab, never opens the gateway), the order doesn't sit around forever: an hourly backend job auto-cancels any order still `pending_advance_payment` after 24 hours (`ORDER_ABANDON_TIMEOUT_HOURS`, configurable). The customer gets a notification, and — same as any cancellation — their cart is untouched, so they can just check out again.

---

## Order status reference

| Status | Meaning |
|---|---|
| `pending_advance_payment` | Order placed, waiting on the online advance payment |
| `advance_paid` | Advance succeeded — order confirmed, cart cleared, coupon (if any) consumed |
| `processing` / `confirmed` | Admin is preparing the order |
| `pending_balance_payment` | Balance NEFT expected, not yet confirmed |
| `assigned_for_shipping` | Ready to ship, balance payment being collected |
| `balance_paid` | Balance confirmed — fully paid |
| `shipped` / `out_for_delivery` / `delivered` | Fulfillment progress |
| `cancelled` | Either the advance payment failed, or the order was abandoned past the timeout — customer needs to place a new order |

## Cross-cutting notes

- **Amounts** are always plain numbers (rupees, not paise) — `advanceAmount: 14304.80` means ₹14,304.80.
- **`invoiceUrl`** is present on the order response as soon as the advance payment succeeds (it's generated right at that point) — a direct downloadable link, no separate API call needed. Also directly downloadable via `GET /orders/:id/invoice` if you'd rather force a fresh fetch through the API than link the static URL.
- The gateway amount sent to ICICI in UAT is currently hardcoded to a test value (`₹100.00`) rather than the real `advanceAmount` — this is a **known UAT-only stub** in `icici-payment.service.ts`'s integration, not something the frontend needs to account for; it'll use the real amount once switched to production credentials. Don't build any frontend logic around the *actual* amount charged by the gateway differing from `advanceAmount` — that's a backend/gateway-config detail, not something to reconcile client-side.

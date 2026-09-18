# Consumable API — E-commerce Catalog

Task 1 of the Five Engineering Tasks. A versioned REST API for an e-commerce catalog (categories, products, orders), deployed to a public URL, plus a minimal client that consumes it live.

**Live API:** _fill in after deploying — see Step 7 below_
**Live consumer:** _same deployment, root URL_

## Resource Model

| Resource | Belongs to / Contains |
|---|---|
| **Category** | has many Products |
| **Product** | belongs to one Category; appears in many OrderItems |
| **Order** | has many OrderItems |
| **OrderItem** | belongs to one Order and one Product; snapshots the product's price at order time |

```
Category --1:N-- Product --1:N-- OrderItem --N:1-- Order
```

All identifiers are UUIDs (`@default(uuid())` in Prisma), never sequential integers -- a sequential id lets anyone enumerate the entire table by counting up from 1; a UUID doesn't.

## Running It Locally

1. `cp .env.example .env`, fill in `DATABASE_URL` (a hosted Postgres -- Neon or Supabase recommended)
2. `npm install`
3. `npx prisma generate && npx prisma migrate dev --name init`
4. `npm run seed` -- populates ~8 categories, ~300+ products, ~150 orders. Repeatable: running it again clears and re-seeds rather than duplicating (see `prisma/seed.ts`'s own comment for the reasoning).
5. `npm run dev`
6. Open **http://localhost:3000** for the consumer page; hit `http://localhost:3000/api/v1/...` directly for the API itself.

## Endpoints

All responses use one envelope shape. Lists:
```json
{ "data": [...], "meta": { "total": 340, "limit": 20, "hasMore": true, "nextCursor": "eyJ..." } }
```
Single items: `{ "data": {...} }`. Errors, always with an honest status code, never 200:
```json
{ "error": { "code": "NOT_FOUND", "message": "Product not found" } }
```

### `GET /api/v1/categories`
List categories.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 20 | Clamped to 100 max |
| `cursor` | string | -- | Opaque cursor from a previous response's `meta.nextCursor` |
| `sort` | `name` \| `createdAt` | `createdAt` | |
| `order` | `asc` \| `desc` | `desc` | |

```bash
curl "https://YOUR-DEPLOYED-URL/api/v1/categories?limit=5&sort=name&order=asc"
```
```json
{
  "data": [{ "id": "b3f1...", "name": "Beauty", "slug": "beauty", "createdAt": "2026-09-18T..." }],
  "meta": { "total": 8, "limit": 5, "hasMore": true, "nextCursor": "eyJzb3J0VmFsdWUiOiJCZWF1dHkiLCJpZCI6ImIzZjEuLi4ifQ" }
}
```

### `GET /api/v1/categories/:id`
One category. `404` if it doesn't exist or `:id` is malformed.

### `GET /api/v1/categories/:id/products`
Products in one category -- a nested resource, paginated like any other list.

### `GET /api/v1/products`
List products, with filtering and sorting.

| Query param | Type | Notes |
|---|---|---|
| `limit`, `cursor` | as above | |
| `category` | string | Category **slug**, e.g. `electronics` |
| `minPrice`, `maxPrice` | integer (minor units) | e.g. `minPrice=1000` = $10.00 |
| `sort` | `price` \| `name` \| `createdAt` | Unknown values rejected with `400`, never silently ignored |
| `order` | `asc` \| `desc` | |

```bash
curl "https://YOUR-DEPLOYED-URL/api/v1/products?category=electronics&minPrice=1000&maxPrice=50000&sort=price&order=asc&limit=10"
```

### `GET /api/v1/products/:id`
One product, including its category.

### `GET /api/v1/orders`
List orders. `status` filter: `pending` | `paid` | `shipped` | `cancelled`. `sort`: `createdAt` | `totalMinorUnits`.

### `POST /api/v1/orders`
Create an order.
```bash
curl -X POST "https://YOUR-DEPLOYED-URL/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Jane Doe","customerEmail":"jane@example.com","items":[{"productId":"REAL_PRODUCT_ID","quantity":2}]}'
```
Returns `201` with the created order (including snapshotted `unitPriceMinorUnits` per item), or `422` naming the specific field if a product doesn't exist, stock is insufficient, or a required field is missing.

### `GET /api/v1/orders/:id`
One order with its items.

### `PATCH /api/v1/orders/:id`
Partial update -- currently just `{"status": "..."}`.

### `DELETE /api/v1/orders/:id`
Removes the order (and its items, via cascade).

## Handling Bad Input

- `limit=5000` -> clamped to 100, not honoured as-is
- `minPrice`/`maxPrice` below zero -> `400`
- `sort=bogus` -> `400`, never silently defaults to unsorted
- A malformed id (`/products/not-a-uuid`) -> `404`, never `500`
- `POST /orders` missing `customerEmail` -> `422` with `{"error":{"field":"customerEmail",...}}`

## Rate Limiting

100 requests/minute per IP, enforced on every `/api/v1/*` route via `rateLimitOrNull()` (see `src/lib/with-rate-limit.ts`), backed by a Postgres table rather than in-memory (survives restarts, works across multiple server instances). The number lives in `src/lib/api-config.ts`, not hardcoded in any handler. Exceeding it returns `429` with a `Retry-After` header.

```bash
# Fire 101 requests in a minute and watch the 101st return 429:
for i in $(seq 1 101); do curl -s -o /dev/null -w "%{http_code}\n" "https://YOUR-DEPLOYED-URL/api/v1/categories"; done
```

## Design Decisions

**Why these resources.** Categories, products, orders, and order items give three-to-four related resource types with real cardinality (1:N, N:1) rather than a single flat table -- enough to exercise nested resources, filtering across a relation, and price-snapshotting at write time.

**Why generated identifiers.** A sequential integer id lets anyone discover your entire dataset by counting (`/products/1`, `/products/2`, ...). A UUID doesn't reveal how many rows exist or let an outsider enumerate them.

**Why cursor pagination, not offset.** See the extended comment in `src/lib/pagination.ts` for the full reasoning; in short: offset pagination re-scans and discards every row before the requested page on every request, which gets slower the deeper a client pages (page 50 still walks past the first 980 rows). Cursor pagination jumps straight to "the row after this one" via the index, at a fixed cost regardless of depth. The real tradeoff: cursor pagination can't jump to an arbitrary page number, only step forward from where you are -- which costs nothing for a browse-forward product list or order history, but would be a real reason to prefer offset for something like a jump-to-page-N admin table.

**What the envelope shape is and why.** `{ data, meta }` for lists, `{ data }` for single items, `{ error: { code, message } }` for failures -- one shape, everywhere, so a client never has to special-case a specific endpoint's response structure. `meta.total` is included even though cursor pagination doesn't need it to page correctly, because a client showing "340 products" as a UI affordance shouldn't have to make a second request just to get a count.

## Evidence

- [ ] Live API URL (fill in after deploying)
- [ ] Screenshot: `curl` hitting the live URL, showing a paginated response
- [ ] Screenshot: the `429` response after exceeding the rate limit
- [ ] Screenshot: the consumer page showing live data
- [x] `prisma/seed.ts` -- committed, present in this repo

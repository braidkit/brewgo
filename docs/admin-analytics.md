# Admin analytics

The console reads existing BrewGo orders through FastAPI and SQLite. The backend remains Python, as agreed during implementation. No Node.js service or separate reporting database is required.

## Sign in

Create an admin account from a trusted terminal. Use the same `BREWGO_DB` setting as the server. The command prompts for a password of 12–256 characters; it never accepts a password on the command line.

```sh
.venv/bin/python -m backend.admin your-username
npm run dev
```

Open `http://127.0.0.1:5173/admin`. The built server also supports direct links to `/admin`, `/admin/sales`, `/admin/products`, `/admin/orders`, `/admin/customers`, and `/admin/stores`. Requests without an admin session go to `/admin/login`; successful sign-in returns to the requested report and filters.

Running the account command again resets that account's password and revokes its sessions. There is no default password, browser signup, or way to promote a sample customer profile. Admin credentials and sessions use separate database tables. Admin passwords use salted scrypt hashes. Sessions expire after eight hours, store only a SHA-256 token hash, and are revoked on sign-out.

## API

All report endpoints use `GET /api/admin/analytics/{report}`. Reports are `overview`, `sales`, `products`, `orders`, `customers`, and `stores`. `GET /api/admin/session` verifies the admin role and returns the admin identity and café choices. `POST /api/admin/session` signs in with JSON `username` and `password`; `DELETE /api/admin/session` signs out.

Browser requests use the HTTP-only `brewgo_admin` cookie with `SameSite=strict` and path `/api/admin`. The API also accepts an existing admin session token as `Authorization: Bearer <token>`. Credentials and tokens never enter localStorage or the audit log. Missing or expired sessions return 401; valid non-admin sessions return 403. Authorization runs before every report, including cached reports.

| Parameter | Accepted value | Default |
| --- | --- | --- |
| `from` | Inclusive date, `YYYY-MM-DD` | 29 days before `to` |
| `to` | Inclusive date, `YYYY-MM-DD` | Today in UTC |
| `granularity` | `day`, `week`, `month` | `day` |
| `storeId` | A catalog café ID | All cafés |

Ranges are limited to 366 days. Bad dates, reversed ranges, unknown cafés, and unsupported groupings return 422. Weeks start on Monday. Monthly labels use the first day of the month. A period that starts before the requested range includes only orders inside the range. Sales series include zero-value periods.

Responses include `range`, `storeId`, `currency`, `generatedAt`, and `cacheSeconds`, plus the report's metrics. Currency is USD; JSON monetary values are dollars. Integer cents remain the source for calculations.

## Metric definitions

| Report | Definition |
| --- | --- |
| Overview | Sales before tax, order count, average sales order value, and new saved customer profiles |
| Sales | Order counts and sales before tax by day, week, or month |
| Products | Units and line subtotals, ranked by revenue, with product variants combined by product ID and saved name |
| Orders | Actual stored statuses, including `confirmed`, `completed`, `cancelled`, and `refunded` |
| Customers | Saved profiles that ordered, new profiles, profiles with two or more orders, repeat rate, and guest orders |
| Stores | Each catalog café's order count, sales before tax, and average sales order value; zero-order cafés remain visible |

Sales and average order value exclude cancelled and refunded orders. Revenue excludes tax and includes the existing simulated payments; it does not represent settled payments. Order counts include all statuses. New orders in the current ordering app have status `confirmed`; analytics does not invent completion events.

A customer is a saved profile. Guest pickup names never identify a person. The repeat rate is the percentage of saved profiles with orders in the selected range that placed at least two orders in that same range, across all statuses. Guest orders are excluded. New profiles are counted by profile creation date; a café filter also requires an order at that café during the range. The customers report returns aggregate counts only.

## Storage, security, and operations

Schema setup adds tables and indexes without rewriting orders. Expression indexes cover the order date and café plus date; ordinary indexes cover customer lookup and profile creation date. SQLite uses WAL mode. Aggregation happens in SQL over the saved order JSON.

Each process caches up to 128 report results for five minutes, keyed by database, report, dates, grouping, and café. New orders can take up to five minutes to appear in a previously cached report. A retry uses the same cache. Admin HTTP responses use `Cache-Control: no-store` to prevent browser and proxy caching. Cache misses are serialized within each process to avoid duplicate queries.

SQLite enforces a shared limit of 120 authenticated requests per account per minute. Login also allows five attempts per normalized username and ten per source IP per minute. Exceeded limits return 429 with `Retry-After`. Configure trusted proxy addresses in Uvicorn correctly so client IPs and HTTPS are reliable; never trust forwarded headers from arbitrary public clients.

For deployment, terminate TLS at a trusted proxy and set `BREWGO_SECURE_COOKIES=1`. This enables secure cookies and rejects admin API traffic that reaches the app as HTTP. JSON session writes check the request origin to block cross-site requests. Local loopback HTTP remains available for development.

Every admin API request writes its UTC time, admin account ID when known, method, canonical route, and response status to `admin_audit`. Query values, credentials, cookies, pickup names, and order data are excluded. Keep database access restricted and apply an audit retention policy appropriate to the deployment. These logs are local database records, not a tamper-proof external audit service.

The console loads its report code and Recharts separately from the customer app. Charts have keyboard support and exact values in tables; sales values can be expanded below the chart. Loading states, empty ranges, validation errors, network retries, and expired sessions have explicit UI states.

## Validation

```sh
npm run build
npm run test:api
git diff --check
```

Tests cover every report's access checks, expiry and revocation, bearer sessions, authoritative metric totals, UTC boundaries, grouping and gaps, filters, empty ranges, cache separation, audit redaction, rate limits, HTTPS mode, cross-origin rejection, and 50 concurrent admin sessions. Existing customer ordering tests also run.

Browser checks covered all six reports, café and weekly grouping filters, date submission, empty and reversed ranges, recovery after an API outage, sign-out, protected direct links, and the original customer menu. Desktop and 390-pixel phone layouts were checked, including long currency values and tables contained within their own scroll regions.

On a local loopback server, an isolated database of 100,000 sample orders returned a cold one-month overview covering 50,001 orders in 0.20 seconds. Fifty concurrent admin sessions all received successful cached responses, with the slowest request taking 0.053 seconds. This is a local measurement; production capacity depends on hardware, workers, storage, and real order volume.

Chart sizing follows the [Recharts ResponsiveContainer API](https://recharts.github.io/en-US/api/ResponsiveContainer/).

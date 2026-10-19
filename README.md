# BrewGo Coffee

A working order-ahead application with a **React + TypeScript** frontend, **shadcn/ui** components, and a **FastAPI** backend. All stores, prices, hours, nutrition, and tax are sample data. Payments are simulated; no payment provider is contacted.

## Run locally

Requires Node.js 22.12+ (or 20.19+) and Python 3.10+ on macOS/Linux.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-lock.txt
npm run dev
```

Open **http://127.0.0.1:5173**. The dev script starts React on 5173 and FastAPI on 8000. Vite proxies `/api` to FastAPI, including session cookies. Keep the hostname consistent for storage and cookies.

To run the built application on a single server, stop the dev process first:

```sh
npm run build
npm start
```

Then open **http://127.0.0.1:8000**. FastAPI serves both the built React application and `/api`. API documentation is at **http://127.0.0.1:8000/docs**.

## Place an order

1. Choose a cafe in New York, Seattle, or Austin.
2. Browse categories or search the menu. Save favorites with the heart.
3. Add a drink, choose its size and milk, and optionally add an espresso shot. Add food as well.
4. Review the bag, adjust quantities, and enter a name for pickup.
5. Confirm the clearly labeled simulated payment to receive a pickup number and location.
6. Open **Your orders** or the account icon to see saved orders and try a sample customer profile.

You can order as a guest. A sample profile uses only a first name and a 24-hour HTTP-only session cookie. It does not implement production identity or cross-device login.

## Implementation

- `src/`: React UI, typed API client, and shadcn components.
- `backend/catalog.py`: menu, fictional cafes, and integer-cent prices.
- `backend/app.py`: orders, simulated payments, customer profiles, sessions, and SQLite persistence.
- `backend/tests/`: API behavior tests with temporary databases.
- `PRODUCT.md` and `DESIGN.md`: confirmed product context and implemented visual system.
- `docs/ui-audit.md`: Impeccable review and verification evidence.
- `docs/assets.md`: image sources and generation prompts.

Prices are recalculated on the server; client prices are not trusted. The signature oat latte includes oat milk. Size, milk, and extra-shot surcharges are explicit. The example 8.25% tax is calculated once on the order subtotal, rounded to the nearest cent. It is not a jurisdiction-specific tax engine.

Orders are idempotent per guest session and request key, including concurrent retries. Order history is scoped to a guest browser or its sample customer session. No public endpoint exposes individual orders.

SQLite defaults to `backend/brewgo.db`, which is ignored by Git. Set `BREWGO_DB` to use another database path. Set `BREWGO_SECURE_COOKIES=1` when running behind HTTPS. Browser bag, store, and favorites use localStorage, with a memory-only fallback if browser storage is blocked.

The app binds to loopback for local use. A public production service would need real authentication, CSRF protection, store hours/availability, tax rules, rate limits, and a payment provider. These are outside this application.

## Verify

```sh
npm run build
npm run test:api
git diff --check
```

The API tests cover authoritative prices, tax, simulated payment, duplicate requests, browser-private history, sample account lifecycle, unavailable stores, and invalid options. Manual browser checks cover desktop, tablet, phone, customization, checkout, history, favorites, search, persistence, keyboard focus, and loaded assets.

## References

The familiar order-ahead structure was informed by [Starbucks ordering](https://www.starbucks.com/stores-and-ordering). BrewGo has original branding and copy. Components follow the [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite). API structure follows the [FastAPI guide](https://fastapi.tiangolo.com/tutorial/).

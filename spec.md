Act as the parent coordinator for a small BrewGo admin analytics implementation.

Repo: BrewGo
Branch: claude/admin-analytics

## Context

- BrewGo has a React/TypeScript (Vite) frontend and a Python FastAPI backend.
- The API stores orders in SQLite: backend/brewgo.db, or the path in BREWGO_DB.
  The `orders` table keeps each order as JSON in its `payload` column.
- An order looks like { id, status, total, currency }. `total` is an integer in cents.
  The statuses are confirmed, completed, cancelled, and refunded.
- This task adds a new, standalone CommonJS analytics module that reads the SQLite
  store read-only. It does not connect the module to the FastAPI app or the React app.

## Before you make changes

- Confirm the repository root and the current branch.
- If claude/admin-analytics does not exist, create it from main.
- Work directly in this repository and branch.
- Do not create another worktree or use a temporary repository.
- Do not edit implementation files yourself.
- Check these facts. If one is not true, stop and ask me before you change anything:
  - package.json has "type": "module" and no "test" script.
  - None of the five owned files below exist.

## Setup (you do this before you start the agents)

Only you edit these four files:

- package.json: add "test": "node --test \"test/*.test.js\"".
  (The directory form `node --test test/` does not work.)
- src/backend/package.json, src/frontend/package.json, and test/package.json:
  each contains {"type": "commonjs"}. Without them, CommonJS .js files do not load,
  because the root package.json sets "type": "module".

## Shared contract (give it to both agents)

Both agents build against this contract. Neither agent reads or imports the other agent's files.

- Endpoint: GET /api/admin/analytics.
- Admin check: request.user.role === 'admin'.
- 200 body: { totalOrders, totalRevenueCents, averageOrderValueCents, ordersByStatus }.
  - totalOrders: the number of all orders.
  - totalRevenueCents: the sum of `total` for orders whose status is not cancelled or refunded.
  - averageOrderValueCents: Math.round(totalRevenueCents / number of revenue orders),
    or 0 when there are none.
  - ordersByStatus: { [status]: count }, with the keys in sorted order.
- Empty store: { totalOrders: 0, totalRevenueCents: 0, averageOrderValueCents: 0, ordersByStatus: {} }.
- Non-admin: { status: 403, body: { error: 'forbidden', message: 'Admin access required' } },
  as a new object for each call.

## Agents

- Launch exactly two agents at the same time, in one message.
- Wait for both agents to finish before you continue.
- The two tasks are independent and must not depend on each other.
- The agents must not commit, stage, stash, switch branches, or create worktrees.
- Each agent runs only its own test file with `node --test <file>`.
  `npm test` also runs the other agent's file while that agent still works on it.

### Backend agent

Owns:

- src/backend/analytics.js
- src/backend/app.js
- test/backend-analytics.test.js

Requirements:

- analytics.js exports a pure calculateAnalytics(orders) that follows the contract.
  It is deterministic: the same orders in any order give the same result.
  It uses no time and no random values.
- Define and document a small rule for malformed orders, such as a missing status
  or a total that is not an integer. A malformed order must not change the revenue
  or the average.
- app.js exports:
  - authorizeAdmin(request): true only for the admin role. False for a missing
    request or user. It never throws.
  - createOrderRepository(initialOrders = []): an in-memory store with list() and
    add(order). It copies orders in and out.
  - createSqliteOrderRepository(dbPath): a read-only store over the SQLite database.
    - The default path is BREWGO_DB, else backend/brewgo.db (the same rule as backend/app.py).
    - Each list() call opens the file with node:sqlite and { readOnly: true }, runs
      `SELECT payload FROM orders ORDER BY id`, parses the JSON, and closes the file.
    - It has no add().
    - Load node:sqlite inside this function, so the in-memory store works without it.
  - handleAdminAnalytics(request, repository): the 403 for a non-admin, with no read
    of the repository. For an admin: { status: 200, body: calculateAnalytics(repository.list()) }.
- If authorizeAdmin or createOrderRepository already exists, keep its export and its
  behavior backward compatible.
- Do not mutate requests, orders, or repository state.
- Use only CommonJS and Node.js built-ins.
- Add focused tests for: the totals; the cancelled and refunded rule; the rounding;
  the sorted status keys; an empty repository; the input order; malformed orders;
  no mutation (frozen inputs and structuredClone snapshots); the 403 for each
  non-admin case; the copy rules; and all the exports.
- Add SQLite tests on temporary databases. Make each database with fs.mkdtempSync in
  os.tmpdir(), and remove it after the test. Use the same orders table as init_db()
  in backend/app.py. Test that:
  - the orders come back in id order, and the admin analytics are correct;
  - an empty orders table gives the empty result;
  - a read does not change the database file;
  - on a WAL-mode database with an open writer, the read sees an order that is
    still only in the -wal file;
  - a missing file causes an error and is not created, and a non-admin request
    does not open the file;
  - BREWGO_DB sets the default path.
- Run the backend tests.
- Do not edit frontend, documentation, or package files.

### Frontend agent

Owns:

- src/frontend/admin.js
- test/frontend-admin.test.js

Requirements:

- Implement a testable admin analytics view with no DOM dependency.
- Consume analytics through an injected fetch-like client:
  client(url, options) returns a Promise of { ok, status, json() }.
- Render deterministic loading, success, empty, unauthorized, and error states:
  - success: a contract body with totalOrders > 0.
  - empty: a contract body with totalOrders === 0.
  - unauthorized: status 401 or 403. Do not read the body.
  - error: any other non-ok status, a rejected client, a json() failure, or a body
    with the wrong shape.
- Format cents as dollars with a fixed manual format, not the locale.
  Show the statuses in sorted order. Escape status names in HTML.
- Prevent stale requests from replacing newer results, for example with a request
  counter. This rule also applies to failed requests.
- Do not mutate the analytics response.
- Use only CommonJS and Node.js built-ins.
- Add focused tests with fake clients for: each state; the URL that the view sends;
  stale responses that arrive out of order; no mutation of the response; and the
  exact render output for each state.
- Run the frontend tests.
- Do not edit backend, documentation, or package files.

## After both agents finish

1. Verify that each agent changed only its owned files.
2. Verify that their ownership scopes remain disjoint, and that each agent's code
   requires only its own files and Node.js built-ins.
3. Run npm test.
4. If backend/brewgo.db exists, run the admin analytics on it once through
   createSqliteOrderRepository. Compare the SHA-256 hash of brewgo.db before and after.
   In WAL mode, SQLite updates brewgo.db-shm on each read. That is expected.
5. Commit only these nine files:
   - src/backend/analytics.js
   - src/backend/app.js
   - test/backend-analytics.test.js
   - src/frontend/admin.js
   - test/frontend-admin.test.js
   - package.json
   - src/backend/package.json
   - src/frontend/package.json
   - test/package.json
6. Use the commit message:
   feat: add BrewGo analytics with parallel agents
7. Confirm that the repository is clean.
8. Summarize each agent's result, the final test result, and the SQLite check.
   Say clearly what is not connected yet:
   - No FastAPI route serves /api/admin/analytics.
   - The React app does not import the admin view.
   - BrewGo has no admin role.

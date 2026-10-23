'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const app = require('../src/backend/app.js');
const analytics = require('../src/backend/analytics.js');

const { createOrderRepository, createSqliteOrderRepository, authorizeAdmin, handleAdminAnalytics } = app;
const { calculateAnalytics } = analytics;

const ADMIN = { user: { id: 'u-admin', role: 'admin' } };
const FORBIDDEN = { status: 403, body: { error: 'forbidden', message: 'Admin access required' } };
const EMPTY = { totalOrders: 0, totalRevenueCents: 0, averageOrderValueCents: 0, ordersByStatus: {} };

// Revenue orders: 1000 + 501 + 250 = 1751 over 3 orders, average 583.67 -> 584.
function sampleOrders() {
  return [
    { id: 'o1', status: 'completed', total: 1000, currency: 'USD', store: { id: 's1' } },
    { id: 'o2', status: 'confirmed', total: 501, currency: 'USD', store: { id: 's2' } },
    { id: 'o3', status: 'cancelled', total: 700, currency: 'USD', store: { id: 's1' } },
    { id: 'o4', status: 'refunded', total: 300, currency: 'USD', store: { id: 's3' } },
    { id: 'o5', status: 'completed', total: 250, currency: 'USD', store: { id: 's2' } },
  ];
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Same orders table as init_db() in backend/app.py.
const ORDERS_SCHEMA = `CREATE TABLE orders (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, request_key TEXT NOT NULL,
  customer_id TEXT, payload TEXT NOT NULL,
  UNIQUE(session_id, request_key)
)`;

function insertOrders(file, orders) {
  const db = new DatabaseSync(file);
  const insert = db.prepare(
    'INSERT INTO orders (id, session_id, request_key, customer_id, payload) VALUES (?, ?, ?, ?, ?)',
  );
  for (const order of orders) insert.run(order.id, 'session-1', `key-${order.id}`, null, JSON.stringify(order));
  db.close();
}

// A fresh database file in its own temp directory, removed after the test.
function createTempDatabase(t, orders = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brewgo-analytics-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'brewgo.db');
  const db = new DatabaseSync(file);
  db.exec(ORDERS_SCHEMA);
  db.close();
  insertOrders(file, orders);
  return { dir, file };
}

test('the public API is still exported', () => {
  for (const name of ['createOrderRepository', 'createSqliteOrderRepository', 'authorizeAdmin', 'handleAdminAnalytics']) {
    assert.equal(typeof app[name], 'function', name);
  }
  assert.equal(typeof analytics.calculateAnalytics, 'function');
});

test('calculateAnalytics counts all orders and sums revenue', () => {
  assert.deepEqual(calculateAnalytics(sampleOrders()), {
    totalOrders: 5,
    totalRevenueCents: 1751,
    averageOrderValueCents: 584,
    ordersByStatus: { cancelled: 1, completed: 2, confirmed: 1, refunded: 1 },
  });
});

test('cancelled and refunded orders earn no revenue', () => {
  const result = calculateAnalytics([
    { id: 'a', status: 'cancelled', total: 900 },
    { id: 'b', status: 'refunded', total: 400 },
  ]);
  assert.equal(result.totalOrders, 2);
  assert.equal(result.totalRevenueCents, 0);
  assert.equal(result.averageOrderValueCents, 0);
});

test('average order value rounds to the nearest cent', () => {
  const average = (totals) =>
    calculateAnalytics(totals.map((total, i) => ({ id: `o${i}`, status: 'completed', total }))).averageOrderValueCents;
  assert.equal(average([1000, 1000, 1001]), 1000); // 1000.33
  assert.equal(average([1000, 1001, 1001]), 1001); // 1000.67
  assert.equal(average([1, 2]), 2); // 1.5 rounds half up
  assert.equal(average([1000]), 1000);
});

test('ordersByStatus keys are in sorted order', () => {
  const result = calculateAnalytics(sampleOrders().reverse());
  assert.deepEqual(Object.keys(result.ordersByStatus), ['cancelled', 'completed', 'confirmed', 'refunded']);
  assert.equal(JSON.stringify(result.ordersByStatus), '{"cancelled":1,"completed":2,"confirmed":1,"refunded":1}');
});

test('empty input gives zero analytics', () => {
  assert.deepEqual(calculateAnalytics([]), EMPTY);
  assert.deepEqual(handleAdminAnalytics(ADMIN, createOrderRepository()), { status: 200, body: EMPTY });
});

test('result does not depend on input order', () => {
  const orders = sampleOrders();
  const expected = JSON.stringify(calculateAnalytics(orders));
  const permutations = [orders.slice().reverse(), [orders[2], orders[4], orders[0], orders[3], orders[1]], orders];
  for (const permutation of permutations) {
    assert.equal(JSON.stringify(calculateAnalytics(permutation)), expected);
  }
});

test('calculateAnalytics does not mutate its input', () => {
  const orders = sampleOrders();
  const snapshot = structuredClone(orders);
  // Frozen input makes any write inside the strict-mode module throw.
  calculateAnalytics(deepFreeze(orders));
  assert.deepEqual(orders, snapshot);
});

test('malformed orders count by status but add no revenue', () => {
  const result = calculateAnalytics([
    { id: 'ok', status: 'completed', total: 1000 },
    { id: 'no-status', total: 500 },
    { id: 'empty-status', status: '', total: 500 },
    { id: 'fraction', status: 'completed', total: 12.5 },
    { id: 'string-total', status: 'completed', total: '1000' },
    { id: 'negative', status: 'completed', total: -100 },
    { id: 'no-total', status: 'confirmed' },
    null,
  ]);
  assert.deepEqual(result, {
    totalOrders: 8,
    totalRevenueCents: 1000,
    averageOrderValueCents: 1000,
    ordersByStatus: { completed: 4, confirmed: 1, unknown: 3 },
  });
  assert.deepEqual(calculateAnalytics(undefined), EMPTY);
});

test('authorizeAdmin accepts only the admin role', () => {
  assert.equal(authorizeAdmin(ADMIN), true);
  const others = [
    undefined, null, {}, 'admin',
    { user: null }, { user: {} }, { user: { role: 'customer' } }, { user: { role: 'Admin' } },
  ];
  for (const request of others) {
    assert.equal(authorizeAdmin(request), false, JSON.stringify(request));
  }
});

test('non-admin requests get the same fresh 403 response', () => {
  // Any read of orders before the role check would throw here.
  const repository = { list() { throw new Error('orders must not be read'); } };
  const requests = [{ user: { role: 'customer' } }, { user: null }, {}, undefined, null];
  for (const request of requests) {
    const response = handleAdminAnalytics(request, repository);
    assert.deepEqual(response, FORBIDDEN);
    // A caller that edits one response must not change the next one.
    response.status = 200;
    response.body.message = 'changed';
  }
  assert.deepEqual(handleAdminAnalytics({}, repository), FORBIDDEN);
});

test('admin requests get analytics for the stored orders', () => {
  const repository = createOrderRepository(sampleOrders());
  assert.deepEqual(handleAdminAnalytics(ADMIN, repository), {
    status: 200,
    body: calculateAnalytics(sampleOrders()),
  });
});

test('handleAdminAnalytics does not mutate the request, orders, or repository', () => {
  const orders = deepFreeze(sampleOrders());
  const repository = createOrderRepository(orders);
  const request = deepFreeze({ user: { id: 'u-admin', role: 'admin' }, headers: { accept: 'application/json' } });
  const requestBefore = structuredClone(request);
  const listBefore = repository.list();

  handleAdminAnalytics(request, repository);
  handleAdminAnalytics({ user: { role: 'customer' } }, repository);

  assert.deepEqual(request, requestBefore);
  assert.deepEqual(repository.list(), listBefore);
  assert.deepEqual(orders, sampleOrders());
  assert.ok(Object.isFrozen(repository));
});

test('repository stores and returns copies', () => {
  assert.deepEqual(createOrderRepository().list(), []);

  const initial = sampleOrders();
  const repository = createOrderRepository(initial);

  // Changes to the caller's array or orders do not reach the store.
  initial.push({ id: 'extra', status: 'completed', total: 1 });
  initial[0].total = 1;
  initial[0].store.id = 'changed';
  assert.deepEqual(repository.list(), sampleOrders());

  // Changes to listed orders do not reach the store.
  const listed = repository.list();
  listed[1].status = 'cancelled';
  listed[1].store.id = 'changed';
  listed.pop();
  assert.deepEqual(repository.list(), sampleOrders());
  assert.notEqual(repository.list(), repository.list());

  // add() keeps its own copy.
  const order = { id: 'o6', status: 'confirmed', total: 450, store: { id: 's1' } };
  repository.add(order);
  order.total = 9;
  order.store.id = 'changed';
  assert.deepEqual(repository.list().at(-1), { id: 'o6', status: 'confirmed', total: 450, store: { id: 's1' } });
  assert.equal(handleAdminAnalytics(ADMIN, repository).body.totalOrders, 6);
  assert.equal(handleAdminAnalytics(ADMIN, repository).body.totalRevenueCents, 1751 + 450);
});

test('SQLite repository lists stored orders in id order', (t) => {
  const { file } = createTempDatabase(t, sampleOrders().reverse());
  assert.deepEqual(createSqliteOrderRepository(file).list(), sampleOrders());
});

test('SQLite repository gives admin analytics for the stored orders', (t) => {
  const { file } = createTempDatabase(t, sampleOrders());
  assert.deepEqual(handleAdminAnalytics(ADMIN, createSqliteOrderRepository(file)), {
    status: 200,
    body: calculateAnalytics(sampleOrders()),
  });
});

test('SQLite repository handles an empty orders table', (t) => {
  const { file } = createTempDatabase(t);
  const repository = createSqliteOrderRepository(file);
  assert.deepEqual(repository.list(), []);
  assert.deepEqual(handleAdminAnalytics(ADMIN, repository), { status: 200, body: EMPTY });
});

test('SQLite repository never writes to the database', (t) => {
  const { dir, file } = createTempDatabase(t, sampleOrders());
  const bytesBefore = fs.readFileSync(file);
  const repository = createSqliteOrderRepository(file);

  repository.list()[0].total = 1;
  handleAdminAnalytics(ADMIN, repository);
  handleAdminAnalytics({ user: { role: 'customer' } }, repository);

  assert.ok(Object.isFrozen(repository));
  assert.equal(repository.add, undefined);
  assert.deepEqual(fs.readFileSync(file), bytesBefore);
  // In the default rollback-journal mode, a read leaves no journal file behind.
  assert.deepEqual(fs.readdirSync(dir), ['brewgo.db']);
});

test('SQLite repository reads a WAL database while a writer has it open', (t) => {
  const { file } = createTempDatabase(t, sampleOrders());
  const writer = new DatabaseSync(file);
  t.after(() => writer.close());
  writer.exec('PRAGMA journal_mode=WAL');
  // This order stays in the -wal file until a checkpoint.
  writer.prepare('INSERT INTO orders (id, session_id, request_key, customer_id, payload) VALUES (?, ?, ?, ?, ?)')
    .run('o6', 'session-1', 'key-o6', null, JSON.stringify({ id: 'o6', status: 'confirmed', total: 450 }));
  const bytesBefore = fs.readFileSync(file);

  const repository = createSqliteOrderRepository(file);
  assert.deepEqual(repository.list().map((order) => order.id), ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']);
  assert.equal(handleAdminAnalytics(ADMIN, repository).body.totalRevenueCents, 1751 + 450);
  // SQLite updates its -shm index for WAL readers, but the order data does not change.
  assert.deepEqual(fs.readFileSync(file), bytesBefore);
});

test('SQLite repository returns fresh copies and sees new orders', (t) => {
  const { file } = createTempDatabase(t, sampleOrders());
  const repository = createSqliteOrderRepository(file);

  const listed = repository.list();
  listed[0].total = 1;
  listed[0].store.id = 'changed';
  assert.deepEqual(repository.list(), sampleOrders());

  // Another writer, like the Python API, adds an order after the repository exists.
  insertOrders(file, [{ id: 'o6', status: 'confirmed', total: 450, store: { id: 's1' } }]);
  assert.equal(repository.list().length, 6);
  assert.equal(handleAdminAnalytics(ADMIN, repository).body.totalRevenueCents, 1751 + 450);
});

test('SQLite repository does not create a missing database', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brewgo-analytics-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'missing.db');
  const repository = createSqliteOrderRepository(file);

  // Non-admin requests never open the file.
  assert.deepEqual(handleAdminAnalytics({ user: { role: 'customer' } }, repository), FORBIDDEN);
  assert.throws(() => handleAdminAnalytics(ADMIN, repository), /unable to open database file/);
  assert.equal(fs.existsSync(file), false);
});

test('SQLite repository uses BREWGO_DB when no path is given', (t) => {
  const { file } = createTempDatabase(t, sampleOrders());
  const previous = process.env.BREWGO_DB;
  t.after(() => {
    if (previous === undefined) delete process.env.BREWGO_DB;
    else process.env.BREWGO_DB = previous;
  });
  process.env.BREWGO_DB = file;
  assert.deepEqual(createSqliteOrderRepository().list(), sampleOrders());
});

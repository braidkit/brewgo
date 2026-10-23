'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/backend/app.js');
const analytics = require('../src/backend/analytics.js');

const { createOrderRepository, authorizeAdmin, handleAdminAnalytics } = app;
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

test('the public API is still exported', () => {
  for (const name of ['createOrderRepository', 'authorizeAdmin', 'handleAdminAnalytics']) {
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

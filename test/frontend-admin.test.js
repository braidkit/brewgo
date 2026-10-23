'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYTICS_URL,
  createAdminAnalyticsView,
  renderAdminAnalytics,
  formatCents,
  escapeHtml,
} = require('../src/frontend/admin.js');

// --- helpers ---------------------------------------------------------------

function sampleBody() {
  return {
    totalOrders: 12,
    totalRevenueCents: 123456,
    averageOrderValueCents: 10288,
    ordersByStatus: { pending: 2, completed: 9, cancelled: 1 },
  };
}

function response(status, body) {
  let jsonCalls = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      jsonCalls += 1;
      return body;
    },
    get jsonCalls() {
      return jsonCalls;
    },
  };
}

// Fake client that always answers with the same response and records calls.
function fixedClient(res) {
  const calls = [];
  const client = async (url, options) => {
    calls.push({ url, options });
    return res;
  };
  client.calls = calls;
  return client;
}

// Fake client that returns manually controlled promises, one per call.
function controlledClient() {
  const pending = [];
  const client = () =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  client.pending = pending;
  return client;
}

function recordingView(client) {
  const changes = [];
  const view = createAdminAnalyticsView({ client, onChange: (s) => changes.push(s) });
  return { view, changes };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const SUCCESS_DATA = {
  totalOrders: 12,
  totalRevenueCents: 123456,
  averageOrderValueCents: 10288,
  statusCounts: [
    { status: 'cancelled', count: 1 },
    { status: 'completed', count: 9 },
    { status: 'pending', count: 2 },
  ],
};

const SUCCESS_HTML = [
  '<section class="admin-analytics" data-state="success">',
  '<h2>Admin analytics</h2>',
  '<dl>',
  '<dt>Total orders</dt><dd>12</dd>',
  '<dt>Total revenue</dt><dd>$1,234.56</dd>',
  '<dt>Average order value</dt><dd>$102.88</dd>',
  '</dl>',
  '<h3>Orders by status</h3>',
  '<ul>',
  '<li data-status="cancelled">cancelled: 1</li>',
  '<li data-status="completed">completed: 9</li>',
  '<li data-status="pending">pending: 2</li>',
  '</ul>',
  '</section>',
].join('\n');

// --- controller ------------------------------------------------------------

test('requires a client function', () => {
  assert.throws(() => createAdminAnalyticsView({}), TypeError);
});

test('starts in loading before load() is called', () => {
  const view = createAdminAnalyticsView({ client: fixedClient(response(200, sampleBody())) });
  assert.deepEqual(view.getState(), { status: 'loading' });
});

test('load() goes loading -> success and passes the analytics URL', async () => {
  const client = fixedClient(response(200, sampleBody()));
  const { view, changes } = recordingView(client);

  const pending = view.load();
  assert.deepEqual(view.getState(), { status: 'loading' }, 'loading is set synchronously');
  const result = await pending;

  const expected = { status: 'success', data: SUCCESS_DATA };
  assert.deepEqual(result, expected);
  assert.deepEqual(view.getState(), expected);
  assert.deepEqual(changes, [{ status: 'loading' }, expected]);
  assert.equal(view.render(), SUCCESS_HTML);

  assert.equal(ANALYTICS_URL, '/api/admin/analytics');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].url, '/api/admin/analytics');
  assert.equal(client.calls[0].options.method, 'GET');
});

test('totalOrders of 0 gives the empty state', async () => {
  const body = { totalOrders: 0, totalRevenueCents: 0, averageOrderValueCents: 0, ordersByStatus: {} };
  const { view, changes } = recordingView(fixedClient(response(200, body)));
  assert.deepEqual(await view.load(), { status: 'empty' });
  assert.deepEqual(changes, [{ status: 'loading' }, { status: 'empty' }]);
});

for (const status of [401, 403]) {
  test(`${status} gives unauthorized without reading the body`, async () => {
    const res = response(status, { error: 'forbidden', message: 'Admin access required' });
    const { view, changes } = recordingView(fixedClient(res));
    assert.deepEqual(await view.load(), { status: 'unauthorized' });
    assert.deepEqual(changes, [{ status: 'loading' }, { status: 'unauthorized' }]);
    assert.equal(res.jsonCalls, 0);
  });
}

test('500 gives an error', async () => {
  const view = createAdminAnalyticsView({ client: fixedClient(response(500, { error: 'boom' })) });
  assert.deepEqual(await view.load(), { status: 'error', reason: 'http_error' });
});

test('a rejected client promise gives an error', async () => {
  const view = createAdminAnalyticsView({
    client: async () => {
      throw new Error('network down');
    },
  });
  assert.deepEqual(await view.load(), { status: 'error', reason: 'request_failed' });
});

test('a client that throws synchronously gives an error', async () => {
  const view = createAdminAnalyticsView({
    client: () => {
      throw new Error('sync failure');
    },
  });
  assert.deepEqual(await view.load(), { status: 'error', reason: 'request_failed' });
});

test('a json() failure gives an error', async () => {
  const res = {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  };
  const view = createAdminAnalyticsView({ client: fixedClient(res) });
  assert.deepEqual(await view.load(), { status: 'error', reason: 'invalid_json' });
});

test('malformed bodies give an error', async (t) => {
  const base = sampleBody();
  const cases = {
    'null body': null,
    'array body': [],
    'string body': 'ok',
    'missing totalOrders': { ...base, totalOrders: undefined },
    'string totalOrders': { ...base, totalOrders: '12' },
    'negative revenue': { ...base, totalRevenueCents: -1 },
    'fractional average': { ...base, averageOrderValueCents: 10288.5 },
    'missing ordersByStatus': { ...base, ordersByStatus: undefined },
    'null ordersByStatus': { ...base, ordersByStatus: null },
    'array ordersByStatus': { ...base, ordersByStatus: [2, 9, 1] },
    'string status count': { ...base, ordersByStatus: { pending: '2' } },
  };
  for (const [name, body] of Object.entries(cases)) {
    await t.test(name, async () => {
      const view = createAdminAnalyticsView({ client: fixedClient(response(200, body)) });
      assert.deepEqual(await view.load(), { status: 'error', reason: 'invalid_body' });
    });
  }
});

// --- stale requests --------------------------------------------------------

test('an older success that arrives after a newer success is ignored', async () => {
  const client = controlledClient();
  const { view, changes } = recordingView(client);

  const first = view.load();
  const second = view.load();
  const newer = { ...sampleBody(), totalOrders: 3, ordersByStatus: { completed: 3 } };

  client.pending[1].resolve(response(200, newer));
  const secondState = await second;
  client.pending[0].resolve(response(200, sampleBody()));
  const firstResult = await first;

  assert.equal(secondState.status, 'success');
  assert.equal(secondState.data.totalOrders, 3);
  assert.equal(view.getState(), secondState);
  assert.equal(firstResult, secondState, 'stale call resolves to the current state');
  assert.deepEqual(changes, [{ status: 'loading' }, { status: 'loading' }, secondState]);
});

test('an older failure that arrives after a newer success is ignored', async () => {
  const client = controlledClient();
  const { view, changes } = recordingView(client);

  const first = view.load();
  const second = view.load();

  client.pending[1].resolve(response(200, sampleBody()));
  const secondState = await second;
  client.pending[0].reject(new Error('late network error'));
  await first;

  assert.deepEqual(view.getState(), { status: 'success', data: SUCCESS_DATA });
  assert.deepEqual(changes, [{ status: 'loading' }, { status: 'loading' }, secondState]);
});

test('an older 401 that arrives after a newer success is ignored', async () => {
  const client = controlledClient();
  const view = createAdminAnalyticsView({ client });

  const first = view.load();
  const second = view.load();
  client.pending[1].resolve(response(200, sampleBody()));
  await second;
  client.pending[0].resolve(response(401, null));
  await first;

  assert.equal(view.getState().status, 'success');
});

test('an older result that arrives while a newer request is pending keeps loading', async () => {
  const client = controlledClient();
  const { view, changes } = recordingView(client);

  const first = view.load();
  const second = view.load();
  client.pending[0].resolve(response(200, sampleBody()));
  await first;
  assert.deepEqual(view.getState(), { status: 'loading' });

  client.pending[1].resolve(response(500, null));
  await second;
  assert.deepEqual(view.getState(), { status: 'error', reason: 'http_error' });
  assert.deepEqual(changes, [
    { status: 'loading' },
    { status: 'loading' },
    { status: 'error', reason: 'http_error' },
  ]);
});

// --- immutability ----------------------------------------------------------

test('the response body is not mutated', async () => {
  const body = deepFreeze({
    totalOrders: 12,
    totalRevenueCents: 123456,
    averageOrderValueCents: 10288,
    ordersByStatus: { pending: 2, completed: 9, cancelled: 1 },
  });
  const snapshot = structuredClone(body);

  const view = createAdminAnalyticsView({ client: fixedClient(response(200, body)) });
  const state = await view.load();

  assert.equal(state.status, 'success');
  assert.deepEqual(body, snapshot);
  assert.deepEqual(Object.keys(body.ordersByStatus), ['pending', 'completed', 'cancelled']);
  assert.notEqual(state.data, body, 'state holds a copy, not the response');
});

// --- rendering -------------------------------------------------------------

test('render output is exact for each state', () => {
  const wrap = (state, line) =>
    [
      `<section class="admin-analytics" data-state="${state}">`,
      '<h2>Admin analytics</h2>',
      line,
      '</section>',
    ].join('\n');

  assert.equal(
    renderAdminAnalytics({ status: 'loading' }),
    wrap('loading', '<p role="status">Loading analytics...</p>'),
  );
  assert.equal(renderAdminAnalytics({ status: 'empty' }), wrap('empty', '<p>No orders yet.</p>'));
  assert.equal(
    renderAdminAnalytics({ status: 'unauthorized' }),
    wrap('unauthorized', '<p role="alert">You need admin access to view analytics.</p>'),
  );
  const errorHtml = wrap('error', '<p role="alert">Could not load analytics. Try again.</p>');
  assert.equal(renderAdminAnalytics({ status: 'error', reason: 'http_error' }), errorHtml);
  assert.equal(renderAdminAnalytics({ status: 'bogus' }), errorHtml, 'unknown state renders as error');
  assert.equal(renderAdminAnalytics(undefined), errorHtml);
  assert.equal(renderAdminAnalytics({ status: 'success', data: SUCCESS_DATA }), SUCCESS_HTML);
});

test('render output does not depend on ordersByStatus key order', async () => {
  const orders = [
    { pending: 2, completed: 9, cancelled: 1 },
    { cancelled: 1, pending: 2, completed: 9 },
    { completed: 9, cancelled: 1, pending: 2 },
  ];
  const outputs = [];
  for (const ordersByStatus of orders) {
    const body = { ...sampleBody(), ordersByStatus };
    const view = createAdminAnalyticsView({ client: fixedClient(response(200, body)) });
    await view.load();
    outputs.push(view.render());
  }
  for (const html of outputs) assert.equal(html, SUCCESS_HTML);
});

test('status names are HTML-escaped', async () => {
  const body = {
    totalOrders: 1,
    totalRevenueCents: 500,
    averageOrderValueCents: 500,
    ordersByStatus: { '<b>"x"&\'y\'</b>': 1 },
  };
  const view = createAdminAnalyticsView({ client: fixedClient(response(200, body)) });
  await view.load();
  const safe = '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;';
  assert.ok(view.render().includes(`<li data-status="${safe}">${safe}: 1</li>`));
  assert.ok(!view.render().includes('<b>'));
  assert.equal(escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#39;');
});

test('formatCents uses a fixed dollar format', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(100), '$1.00');
  assert.equal(formatCents(99999), '$999.99');
  assert.equal(formatCents(100000), '$1,000.00');
  assert.equal(formatCents(123456789), '$1,234,567.89');
  assert.equal(formatCents(-2550), '-$25.50');
});

'use strict';

// Admin analytics view: a DOM-free controller plus a pure HTML renderer.
// The controller talks to GET /api/admin/analytics through an injected
// fetch-like client, so it can run in the browser or under node:test.

const ANALYTICS_URL = '/api/admin/analytics';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Integer cents -> "$1,234.56". Manual format, so output never depends on locale.
function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

// Validates the 200 body and returns a new normalized object, or null if the
// shape is wrong. The input is only read, never changed.
function toAnalyticsData(body) {
  if (!isPlainObject(body)) return null;
  const { totalOrders, totalRevenueCents, averageOrderValueCents, ordersByStatus } = body;
  if (![totalOrders, totalRevenueCents, averageOrderValueCents].every(isCount)) return null;
  if (!isPlainObject(ordersByStatus)) return null;

  // Object.keys returns a fresh array, so sorting it leaves the response alone.
  const statusCounts = Object.keys(ordersByStatus)
    .sort()
    .map((status) => ({ status, count: ordersByStatus[status] }));
  if (!statusCounts.every((entry) => isCount(entry.count))) return null;

  return { totalOrders, totalRevenueCents, averageOrderValueCents, statusCounts };
}

function errorState(reason) {
  return { status: 'error', reason };
}

// Runs one request and maps every outcome to a state object. Never throws.
async function fetchAnalyticsState(client) {
  let response;
  try {
    response = await client(ANALYTICS_URL, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (_) {
    return errorState('request_failed');
  }
  if (!response) return errorState('request_failed');
  if (response.status === 401 || response.status === 403) return { status: 'unauthorized' };
  if (!response.ok) return errorState('http_error');

  let body;
  try {
    body = await response.json();
  } catch (_) {
    return errorState('invalid_json');
  }

  const data = toAnalyticsData(body);
  if (!data) return errorState('invalid_body');
  if (data.totalOrders === 0) return { status: 'empty' };
  return { status: 'success', data };
}

// States: loading | success | empty | unauthorized | error.
// The view starts in `loading` because it exists only to show fetched data.
function createAdminAnalyticsView({ client, onChange } = {}) {
  if (typeof client !== 'function') throw new TypeError('client must be a function');

  let state = { status: 'loading' };
  let latestRequest = 0;

  function setState(next) {
    state = next;
    if (typeof onChange === 'function') onChange(next);
  }

  // Resolves to the state this call applied. A call that a newer load() made
  // stale applies nothing and resolves to the current state instead.
  async function load() {
    const requestId = ++latestRequest;
    setState({ status: 'loading' });
    const next = await fetchAnalyticsState(client);
    if (requestId !== latestRequest) return state;
    setState(next);
    return next;
  }

  return {
    load,
    getState: () => state,
    render: () => renderAdminAnalytics(state),
  };
}

function section(status, lines) {
  return [
    `<section class="admin-analytics" data-state="${status}">`,
    '<h2>Admin analytics</h2>',
    ...lines,
    '</section>',
  ].join('\n');
}

// Pure: the same state always gives the same HTML string.
function renderAdminAnalytics(state) {
  switch (state && state.status) {
    case 'loading':
      return section('loading', ['<p role="status">Loading analytics...</p>']);
    case 'empty':
      return section('empty', ['<p>No orders yet.</p>']);
    case 'unauthorized':
      return section('unauthorized', ['<p role="alert">You need admin access to view analytics.</p>']);
    case 'success': {
      const { totalOrders, totalRevenueCents, averageOrderValueCents, statusCounts } = state.data;
      return section('success', [
        '<dl>',
        `<dt>Total orders</dt><dd>${totalOrders}</dd>`,
        `<dt>Total revenue</dt><dd>${formatCents(totalRevenueCents)}</dd>`,
        `<dt>Average order value</dt><dd>${formatCents(averageOrderValueCents)}</dd>`,
        '</dl>',
        '<h3>Orders by status</h3>',
        '<ul>',
        ...statusCounts.map(({ status, count }) => {
          const name = escapeHtml(status);
          return `<li data-status="${name}">${name}: ${count}</li>`;
        }),
        '</ul>',
      ]);
    }
    default:
      // `error` and any unknown state show the same message.
      return section('error', ['<p role="alert">Could not load analytics. Try again.</p>']);
  }
}

module.exports = {
  ANALYTICS_URL,
  createAdminAnalyticsView,
  renderAdminAnalytics,
  formatCents,
  escapeHtml,
};

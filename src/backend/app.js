'use strict';

const path = require('node:path');
const { calculateAnalytics } = require('./analytics');

// Same default as backend/app.py: BREWGO_DB, else backend/brewgo.db.
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'backend', 'brewgo.db');

// Deep copy, so stored orders never share objects with callers.
const copyOrder = (order) => structuredClone(order);

/** In-memory order store. It keeps its own copies and hands out copies. */
function createOrderRepository(initialOrders = []) {
  const orders = initialOrders.map(copyOrder);
  return Object.freeze({
    list: () => orders.map(copyOrder),
    add(order) {
      orders.push(copyOrder(order));
    },
  });
}

/**
 * Read-only order store over the SQLite database that backend/app.py writes.
 * Each list() opens the file read-only, reads the JSON `payload` column in id
 * order, and closes it, so it sees current orders and never holds the file.
 * Orders are parsed fresh on each call, so callers cannot change the store.
 * In WAL mode SQLite still updates its -shm index file; order data is not written.
 */
function createSqliteOrderRepository(dbPath = process.env.BREWGO_DB ?? DEFAULT_DB_PATH) {
  // Loaded here, so the in-memory repository works without node:sqlite.
  const { DatabaseSync } = require('node:sqlite');
  return Object.freeze({
    list() {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        return db.prepare('SELECT payload FROM orders ORDER BY id').all().map((row) => JSON.parse(row.payload));
      } finally {
        db.close();
      }
    },
  });
}

/** True only when the request user has the 'admin' role. A missing request or user gives false. */
function authorizeAdmin(request) {
  return request?.user?.role === 'admin';
}

/**
 * Admin analytics endpoint. Read-only: it does not change the request, the
 * orders, or the repository. Orders are not read until the role check passes.
 */
function handleAdminAnalytics(request, repository) {
  if (!authorizeAdmin(request)) {
    // Built fresh on each call, so a caller cannot change a later response.
    return { status: 403, body: { error: 'forbidden', message: 'Admin access required' } };
  }
  return { status: 200, body: calculateAnalytics(repository.list()) };
}

module.exports = { createOrderRepository, createSqliteOrderRepository, authorizeAdmin, handleAdminAnalytics };

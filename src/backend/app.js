'use strict';

const { calculateAnalytics } = require('./analytics');

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

module.exports = { createOrderRepository, authorizeAdmin, handleAdminAnalytics };

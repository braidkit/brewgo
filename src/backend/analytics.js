'use strict';

// Orders with these statuses earn no revenue.
const NON_REVENUE_STATUSES = new Set(['cancelled', 'refunded']);
const UNKNOWN_STATUS = 'unknown';

/**
 * Summarise orders for the admin analytics view.
 *
 * Pure and deterministic: the input is only read, and the result does not
 * depend on input order. A non-array input is treated as no orders.
 *
 * Malformed orders:
 * - Every entry counts in `totalOrders` and `ordersByStatus`.
 * - An entry without a non-empty string `status` is grouped as 'unknown'.
 * - Only an entry with a real status other than cancelled/refunded, and a
 *   `total` that is a non-negative safe integer (cents), adds to revenue and
 *   the average. Other entries are skipped there, so one bad row cannot
 *   skew the money figures.
 */
function calculateAnalytics(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const statusCounts = new Map();
  let totalRevenueCents = 0;
  let revenueOrders = 0;

  for (const order of list) {
    const hasStatus = typeof order?.status === 'string' && order.status !== '';
    const status = hasStatus ? order.status : UNKNOWN_STATUS;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const total = order?.total;
    if (hasStatus && !NON_REVENUE_STATUSES.has(status) && Number.isSafeInteger(total) && total >= 0) {
      totalRevenueCents += total;
      revenueOrders += 1;
    }
  }

  // Plain sort compares code units, so key order does not depend on locale.
  const statuses = [...statusCounts.keys()].sort();

  return {
    totalOrders: list.length,
    totalRevenueCents,
    averageOrderValueCents: revenueOrders === 0 ? 0 : Math.round(totalRevenueCents / revenueOrders),
    ordersByStatus: Object.fromEntries(statuses.map((status) => [status, statusCounts.get(status)])),
  };
}

module.exports = { calculateAnalytics };

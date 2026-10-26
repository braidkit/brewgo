"""Deterministic admin totals over existing orders, without changing stored data."""
from collections import Counter
from contextlib import closing
import json
from pathlib import Path
import sqlite3


def aggregate_orders(orders):
    statuses = Counter()
    total_orders = completed_orders = revenue = 0
    for order in orders:
        total_orders += 1
        statuses[order["status"]] += 1
        # Completed sales exclude tax; other statuses contribute only to counts.
        if order["status"] == "completed":
            completed_orders += 1
            revenue += order["subtotal"]
    # Integer arithmetic rounds half cents up without floating-point drift.
    average = (2 * revenue + completed_orders) // (2 * completed_orders) if completed_orders else 0
    return {
        "total_orders": total_orders,
        "total_revenue_cents": revenue,
        "average_order_value_cents": average,
        "status_counts": dict(sorted(statuses.items())),
        "currency": "USD",
    }


def read_analytics(database_path):
    database_uri = Path(database_path).resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(database_uri, uri=True, timeout=10)) as db:
        rows = db.execute("SELECT payload FROM orders")
        return aggregate_orders(json.loads(row[0]) for row in rows)

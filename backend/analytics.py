"""Read-only aggregates over existing orders. Money is calculated in cents."""
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from threading import Lock
from time import monotonic

from fastapi import HTTPException

from . import database
from .catalog import STORES

DATE = "date(json_extract(o.payload, '$.created_at'))"
STORE = "json_extract(o.payload, '$.store.id')"
STATUS = "json_extract(o.payload, '$.status')"
SALE = f"{STATUS} NOT IN ('cancelled', 'refunded')"
REVENUE = f"CASE WHEN {SALE} THEN json_extract(o.payload, '$.subtotal') ELSE 0 END"
CACHE_SECONDS = 300
_cache = OrderedDict()
_cache_lock = Lock()


def average_value(cents, count):
    return ((2 * cents + count) // (2 * count)) / 100 if count else 0


def validate_filters(start, end, granularity, store_id):
    end = end or datetime.now(timezone.utc).date()
    start = start or date.fromordinal(max(1, end.toordinal() - 29))
    if start > end or (end - start).days > 365 or end == date.max:
        raise HTTPException(422, "Choose a date range of 1–366 days, with the start before the end.")
    if store_id and store_id not in {store['id'] for store in STORES}:
        raise HTTPException(422, "Choose a valid store.")
    return start, end, granularity, store_id


def customer_counts(db, where, params, store_id):
    # A customer is a saved profile, not an inferred identity from a pickup name.
    row = db.execute(f"""
        SELECT COUNT(*) AS customers, COALESCE(SUM(n > 1), 0) AS repeat_customers
        FROM (SELECT o.customer_id, COUNT(*) n FROM orders o
              WHERE {where} AND o.customer_id IS NOT NULL GROUP BY o.customer_id)
    """, params).fetchone()
    store_clause = f"AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND {where})" if store_id else ""
    new = db.execute(f"""
        SELECT COUNT(*) FROM customers c
        WHERE c.created_at >= :created_from AND c.created_at < :created_until {store_clause}
    """, params).fetchone()[0]
    guests = db.execute(f"SELECT COUNT(*) FROM orders o WHERE {where} AND o.customer_id IS NULL", params).fetchone()[0]
    count = row['customers']
    return {"customers": count, "newCustomers": new, "repeatCustomers": row['repeat_customers'],
            "repeatRate": round(row['repeat_customers'] / count * 100, 2) if count else 0,
            "guestOrders": guests}


def aggregate(metric, filters):
    start, end, granularity, store_id = filters
    # Bound the cache and serialize misses to avoid duplicate heavy queries.
    key = (database.DB_PATH, metric, *filters)
    with _cache_lock:
        cached = _cache.get(key)
        if cached and monotonic() - cached[0] < CACHE_SECONDS:
            _cache.move_to_end(key)
            return cached[1]
        where = f"{DATE} >= :start AND {DATE} <= :end"
        if store_id:
            where += f" AND {STORE} = :store"
        params = {"start": start.isoformat(), "end": end.isoformat(), "store": store_id,
                  "created_from": start.isoformat(), "created_until": (end + timedelta(days=1)).isoformat()}
        with database.connect() as db:
            if metric == 'overview':
                row = db.execute(f"SELECT COALESCE(SUM({REVENUE}), 0) revenue, COUNT(*) orders, COALESCE(SUM({SALE}), 0) sales FROM orders o WHERE {where}", params).fetchone()
                customers = customer_counts(db, where, params, store_id)
                result = {"totals": {"revenue": row['revenue'] / 100, "orders": row['orders'],
                                     "avgOrderValue": average_value(row['revenue'], row['sales']),
                                     "newCustomers": customers['newCustomers']}}
            elif metric == 'sales':
                group = {"day": DATE, "week": f"date({DATE}, 'weekday 0', '-6 days')", "month": f"strftime('%Y-%m-01', {DATE})"}[granularity]
                rows = db.execute(f"SELECT {group} date, SUM({REVENUE}) revenue, COUNT(*) orders FROM orders o WHERE {where} GROUP BY 1 ORDER BY 1", params).fetchall()
                values = {row['date']: {"date": row['date'], "revenue": row['revenue'] / 100, "orders": row['orders']} for row in rows}
                cursor = start if granularity == 'day' else start - timedelta(days=start.weekday()) if granularity == 'week' else start.replace(day=1)
                series = []
                while cursor <= end:
                    day = cursor.isoformat()
                    series.append(values.get(day, {"date": day, "revenue": 0, "orders": 0}))
                    if cursor.year == 9999 and cursor.month == 12:
                        break
                    cursor = ((cursor.replace(day=28) + timedelta(days=4)).replace(day=1) if granularity == 'month'
                              else cursor + timedelta(days=7 if granularity == 'week' else 1))
                result = {"granularity": granularity, "series": series}
            elif metric == 'products':
                rows = db.execute(f"""
                    SELECT json_extract(i.value, '$.product_id') id, json_extract(i.value, '$.name') name,
                           SUM(json_extract(i.value, '$.quantity')) units, SUM(json_extract(i.value, '$.line_total')) revenue
                    FROM orders o, json_each(o.payload, '$.items') i WHERE {where} AND {SALE}
                    GROUP BY 1, 2 ORDER BY revenue DESC, units DESC, id
                """, params).fetchall()
                result = {"products": [{**dict(row), "revenue": row['revenue'] / 100} for row in rows]}
            elif metric == 'orders':
                rows = db.execute(f"SELECT {STATUS} status, COUNT(*) count FROM orders o WHERE {where} GROUP BY 1 ORDER BY count DESC, status", params).fetchall()
                statuses = {row['status']: row['count'] for row in rows}
                for status in ('confirmed', 'completed', 'cancelled', 'refunded'):
                    statuses.setdefault(status, 0)
                result = {"statuses": [{"status": status, "count": count} for status, count in statuses.items()]}
            elif metric == 'customers':
                result = {"totals": customer_counts(db, where, params, store_id)}
            else:
                rows = db.execute(f"SELECT {STORE} id, COUNT(*) orders, SUM({REVENUE}) revenue, SUM({SALE}) sales FROM orders o WHERE {where} GROUP BY 1", params).fetchall()
                values = {row['id']: row for row in rows}
                stores = []
                for store in STORES:
                    if store_id and store['id'] != store_id:
                        continue
                    row = values.get(store['id'])
                    revenue, count, sales = (row['revenue'], row['orders'], row['sales']) if row else (0, 0, 0)
                    stores.append({"id": store['id'], "name": store['name'], "city": store['city'],
                                   "revenue": revenue / 100, "orders": count,
                                   "avgOrderValue": average_value(revenue, sales)})
                result = {"stores": sorted(stores, key=lambda store: (-store['revenue'], store['id']))}
        result.update({"range": {"from": start.isoformat(), "to": end.isoformat()}, "storeId": store_id,
                       "currency": "USD", "generatedAt": datetime.now(timezone.utc).isoformat(), "cacheSeconds": CACHE_SECONDS})
        _cache[key] = (monotonic(), result)
        _cache.move_to_end(key)
        while len(_cache) > 128:
            _cache.popitem(last=False)
        return result

"""Add a small, repeatable order history for local analytics work."""
from datetime import datetime, time, timedelta, timezone
import json
import random
from zoneinfo import ZoneInfo

from .app import CartItem, connect, init_db, price_line
from .catalog import MENU, STORES


def seed_orders():
    init_db()
    rng = random.Random(42)
    end = datetime.now(timezone.utc).date() - timedelta(days=1)
    start = end - timedelta(days=29)
    stores = [store for store in STORES if store["available"]]
    zones = {"New York": "America/New_York", "Seattle": "America/Los_Angeles", "Austin": "America/Chicago"}
    # Later days are a little busier, with less traffic on weekends.
    days = [start + timedelta(days=i) for i in range(30)]
    day_weights = [(1 + i / 60) * (0.75 if day.weekday() >= 5 else 1) for i, day in enumerate(days)]
    product_weights = [22, 14, 9, 14, 8, 9, 10, 7, 3, 12, 8, 6]
    inserted = 0
    with connect() as db:
        for i in range(40):
            db.execute(
                "INSERT OR IGNORE INTO customers (id, name, created_at) VALUES (?, ?, ?)",
                (f"sample-customer-v1-{i:03}", f"Sample customer {i + 1:02}",
                 datetime.combine(start + timedelta(days=i % 15), time(0), timezone.utc).isoformat()),
            )
        for i in range(300):
            store = rng.choices(stores, weights=[30, 24, 20, 12, 14])[0]
            day = rng.choices(days, weights=day_weights)[0]
            # One morning peak and a smaller afternoon peak, within cafe hours.
            hour = rng.choices([7, 8, 9, 10, 12, 14, 15, 16], weights=[15, 24, 20, 10, 8, 10, 8, 5])[0]
            created = datetime.combine(day, time(hour, rng.randrange(60)), ZoneInfo(zones[store["city"]])).astimezone(timezone.utc)
            eligible = [n for n in range(40) if start + timedelta(days=n % 15) <= day]
            customer = rng.choice(eligible) if rng.random() < 0.75 else None
            lines = []
            for product in rng.choices(MENU, weights=product_weights, k=rng.choices([1, 2, 3], weights=[55, 35, 10])[0]):
                food = product["category"] == "Bakery & food"
                item = CartItem(
                    product_id=product["id"], quantity=rng.choices([1, 2, 3], weights=[86, 12, 2])[0],
                    size="Small" if food else rng.choice(["Small", "Medium", "Large"]),
                    milk=rng.choice(["Whole milk", "Oat milk", "Almond milk", "Soy milk"]) if product["milk"] else "Whole milk",
                    extra_shot=product["category"] in ("Hot coffee", "Iced coffee") and rng.random() < 0.12,
                )
                lines.append(price_line(item))
            subtotal = sum(line["line_total"] for line in lines)
            tax = (subtotal * 825 + 5000) // 10000
            status = rng.choices(["completed", "cancelled", "refunded"], weights=[90, 6, 4])[0]
            name = f"Sample customer {customer + 1:02}" if customer is not None else f"Sample guest {i + 1:03}"
            order = {
                "id": f"sample-order-v1-{i:04}", "number": f"BG-S{i + 1:04}",
                "customer_name": name, "store": store, "items": lines,
                "subtotal": subtotal, "tax": tax, "total": subtotal + tax, "currency": "USD",
                "created_at": created.isoformat(),
                "ready_at": (created + timedelta(minutes=store["wait_minutes"])).isoformat(),
                "payment_status": "simulated_refunded" if status == "refunded" else "simulated_unpaid" if status == "cancelled" else "simulated_paid",
                "status": status,
            }
            saved = db.execute(
                "INSERT OR IGNORE INTO orders (id, session_id, request_key, customer_id, payload) VALUES (?, ?, ?, ?, ?)",
                (order["id"], f"sample-guest-v1-{i:04}", f"sample-request-v1-{i:04}",
                 f"sample-customer-v1-{customer:03}" if customer is not None else None, json.dumps(order)),
            )
            inserted += saved.rowcount
        rows = db.execute("SELECT payload FROM orders WHERE id GLOB 'sample-order-v1-*'").fetchall()
    orders = [json.loads(row["payload"]) for row in rows]
    return {
        "inserted": inserted, "sample_orders": len(orders),
        "from": min(order["created_at"] for order in orders)[:10],
        "to": max(order["created_at"] for order in orders)[:10],
        "stores": len({order["store"]["id"] for order in orders}),
        "status_counts": {status: sum(order["status"] == status for order in orders) for status in ("completed", "cancelled", "refunded")},
        "completed_sales_cents": sum(order["subtotal"] for order in orders if order["status"] == "completed"),
    }


if __name__ == "__main__":
    print(json.dumps(seed_orders(), indent=2))

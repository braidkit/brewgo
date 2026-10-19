from datetime import datetime
import json

from fastapi.testclient import TestClient

from backend import app as module
from backend.seed_orders import seed_orders


def test_small_order_history_is_valid_and_repeatable(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DB_PATH", str(tmp_path / "orders.db"))
    first = seed_orders()
    with module.connect() as db:
        original = db.execute("SELECT payload FROM orders ORDER BY id").fetchall()
        customers = {row["id"]: row["created_at"] for row in db.execute("SELECT * FROM customers")}
        assert db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert first["inserted"] == first["sample_orders"] == 300
    assert first["stores"] == 5
    assert all(count > 0 for count in first["status_counts"].values())
    product_ids = set()
    for row in original:
        order = json.loads(row["payload"])
        assert order["subtotal"] == sum(item["unit_price"] * item["quantity"] for item in order["items"])
        assert order["tax"] == (order["subtotal"] * 825 + 5000) // 10000
        assert order["total"] == order["subtotal"] + order["tax"]
        assert datetime.fromisoformat(order["created_at"]) < datetime.fromisoformat(order["ready_at"])
        assert order["store"]["available"]
        assert order["payment_status"].startswith("simulated_")
        product_ids.update(item["product_id"] for item in order["items"])
    assert len(product_ids) == 12
    second = seed_orders()
    assert second["inserted"] == 0
    with module.connect() as db:
        assert [row["payload"] for row in original] == [row["payload"] for row in db.execute("SELECT payload FROM orders ORDER BY id")]
        for order in db.execute("SELECT customer_id, payload FROM orders WHERE customer_id IS NOT NULL"):
            assert customers[order["customer_id"]] <= json.loads(order["payload"])["created_at"]


def test_seed_preserves_existing_orders_and_private_history(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DB_PATH", str(tmp_path / "orders.db"))
    with TestClient(module.app) as client:
        client.get("/api/catalog")
        existing = client.post("/api/orders", json={
            "store_id": "ny-flatiron", "customer_name": "Alex", "request_key": "existing-order-before-seeding",
            "items": [{"product_id": "flat-white", "quantity": 1}],
        }).json()
        seed_orders()
        assert client.get("/api/orders").json()["orders"] == [existing]
    with module.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 301

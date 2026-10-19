import pytest
from fastapi.testclient import TestClient
from backend import app as module
from backend import database


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "test.db"))
    with TestClient(module.app) as client:
        client.get("/api/catalog")
        yield client


def order(**overrides):
    return {
        "store_id": "ny-flatiron", "customer_name": "Alex", "request_key": "test-request-key-0001",
        "items": [{"product_id": "iced-oat-latte", "quantity": 2, "size": "Medium", "milk": "Oat milk", "extra_shot": True}],
        **overrides,
    }


def test_catalog_and_health(client):
    catalog = client.get("/api/catalog").json()
    assert len(catalog["menu"]) == 12
    assert {store["city"] for store in catalog["stores"]} == {"New York", "Seattle", "Austin"}
    assert catalog["currency"] == "USD"
    assert client.get("/api/health").json()["payments"] == "simulated"


def test_prices_are_calculated_on_server_and_payment_is_simulated(client):
    body = order()
    body["items"][0]["unit_price"] = 1
    response = client.post("/api/orders", json=body)
    assert response.status_code == 201
    saved = response.json()
    # Signature oat milk is included: $5.25 + $.60 medium + $1 extra shot.
    assert saved["items"][0]["unit_price"] == 685
    assert saved["subtotal"] == 1370
    assert saved["tax"] == 113
    assert saved["total"] == 1483
    assert saved["payment_status"] == "simulated_paid"
    assert saved["store"]["id"] == "ny-flatiron"
    assert saved["ready_at"] > saved["created_at"]


def test_checkout_retry_does_not_duplicate_order(client):
    first = client.post("/api/orders", json=order()).json()
    second = client.post("/api/orders", json=order()).json()
    assert first["id"] == second["id"]
    assert len(client.get("/api/orders").json()["orders"]) == 1


def test_concurrent_checkout_retry_does_not_duplicate_order(client):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/orders", json=order()), range(2)))
    assert all(response.status_code == 201 for response in responses)
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert len(client.get("/api/orders").json()["orders"]) == 1


def test_guest_history_is_private_to_browser(client):
    client.post("/api/orders", json=order())
    with TestClient(module.app) as other:
        other.get("/api/catalog")
        assert other.get("/api/orders").json()["orders"] == []
        other_order = other.post("/api/orders", json=order()).json()
    assert other_order["id"] != client.get("/api/orders").json()["orders"][0]["id"]


def test_profile_and_logout(client):
    assert client.get("/api/account").json()["customer"] is None
    profile = client.post("/api/account/profile", json={"name": "  Alex  "})
    assert profile.status_code == 200
    assert profile.json()["customer"]["name"] == "Alex"
    assert client.get("/api/account").json()["customer"] == profile.json()["customer"]
    client.post("/api/orders", json=order())
    assert len(client.get("/api/orders").json()["orders"]) == 1
    assert client.delete("/api/account/session").status_code == 204
    assert client.get("/api/account").json()["customer"] is None


@pytest.mark.parametrize("changes", [
    {"store_id": "au-downtown"}, {"store_id": "not-a-store"},
    {"customer_name": "   "}, {"items": []}, {"request_key": "short"},
    {"items": [{"product_id": "missing", "quantity": 1}]},
    {"items": [{"product_id": "flat-white", "quantity": -1}]},
    {"items": [{"product_id": "flat-white", "quantity": 21}]},
    {"items": [{"product_id": "flat-white", "quantity": 1, "size": "Giant"}]},
    {"items": [{"product_id": "croissant", "quantity": 1, "extra_shot": True}]},
    {"items": [{"product_id": "croissant", "quantity": 1, "size": "Large"}]},
    {"items": [{"product_id": "iced-matcha", "quantity": 1, "extra_shot": True}]},
    {"items": [{"product_id": "mint-tea", "quantity": 1, "milk": "Oat milk"}]},
])
def test_invalid_orders_do_not_save(client, changes):
    response = client.post("/api/orders", json=order(**changes))
    assert response.status_code == 422
    assert client.get("/api/orders").json()["orders"] == []


def test_food_has_no_drink_surcharges(client):
    response = client.post("/api/orders", json=order(items=[{"product_id": "croissant", "quantity": 1}]))
    assert response.status_code == 201
    assert response.json()["subtotal"] == 345


def test_blank_profile_rejected(client):
    assert client.post("/api/account/profile", json={"name": "  "}).status_code == 422


def test_guest_cookie_required():
    with TestClient(module.app) as client:
        assert client.post("/api/orders", json=order()).status_code == 400

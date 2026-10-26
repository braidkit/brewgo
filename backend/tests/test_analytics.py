from copy import deepcopy
import json
import sqlite3

from fastapi.testclient import TestClient
import pytest

from backend import app as module
from backend.analytics import aggregate_orders, read_analytics


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DB_PATH", str(tmp_path / "analytics.db"))
    monkeypatch.setenv("BREWGO_ADMIN_TOKEN", "test-admin-token")
    with TestClient(module.app) as client:
        yield client


def save_orders(orders):
    with module.connect() as db:
        for index, order in enumerate(orders):
            db.execute("INSERT INTO orders VALUES (?, ?, ?, ?, ?)", (
                f"order-{index}", f"guest-{index}", f"request-{index}", None, json.dumps(order),
            ))


def get_analytics(client):
    return client.get("/api/admin/analytics", headers={"Authorization": "Bearer test-admin-token"})


def test_completed_subtotals_only_with_alphabetical_status_counts(client):
    save_orders([
        {"status": "refunded", "subtotal": 900, "tax": 74, "total": 974},
        {"status": "completed", "subtotal": 100, "tax": 8, "total": 108, "customer_name": "Private"},
        {"status": "confirmed", "subtotal": 700, "tax": 58, "total": 758},
        {"status": "completed", "subtotal": 101, "tax": 8, "total": 109},
        {"status": "cancelled", "subtotal": 800, "tax": 66, "total": 866},
    ])
    response = get_analytics(client)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "total_orders": 5,
        "total_revenue_cents": 201,
        "average_order_value_cents": 101,
        "status_counts": {"cancelled": 1, "completed": 2, "confirmed": 1, "refunded": 1},
        "currency": "USD",
    }
    assert list(response.json()["status_counts"]) == ["cancelled", "completed", "confirmed", "refunded"]
    assert "Private" not in response.text


def test_empty_repository(client):
    assert get_analytics(client).json() == {
        "total_orders": 0, "total_revenue_cents": 0, "average_order_value_cents": 0,
        "status_counts": {}, "currency": "USD",
    }


def test_no_completed_orders_have_zero_revenue_and_average(client):
    save_orders([{"status": "confirmed", "subtotal": 999}])
    result = get_analytics(client).json()
    assert result["total_orders"] == 1
    assert result["total_revenue_cents"] == result["average_order_value_cents"] == 0


@pytest.mark.parametrize(("subtotals", "average"), [
    ([100, 101], 101), ([100, 100, 101], 100), ([100, 101, 101], 101),
    ([0], 0), ([2**60, 2**60 + 1], 2**60 + 1),
])
def test_average_rounding_uses_integer_half_up(subtotals, average):
    result = aggregate_orders({"status": "completed", "subtotal": subtotal} for subtotal in subtotals)
    assert result["average_order_value_cents"] == average


def test_aggregation_is_repeatable_order_independent_and_does_not_mutate_inputs():
    orders = [
        {"status": "completed", "subtotal": 100, "items": [{"quantity": 1}]},
        {"status": "cancelled", "subtotal": 999},
        {"status": "completed", "subtotal": 101},
    ]
    original = deepcopy(orders)
    first = aggregate_orders(orders)
    assert aggregate_orders(orders) == aggregate_orders(reversed(orders)) == first
    assert orders == original
    first["status_counts"]["completed"] = 1000
    assert aggregate_orders(orders)["status_counts"]["completed"] == 2
    assert orders == original


def test_reads_leave_database_bytes_and_all_tables_unchanged(client):
    save_orders([{"status": "completed", "subtotal": 345}])
    path = module.Path(module.DB_PATH)
    with module.connect() as db:
        original_tables = list(db.iterdump())
    original_bytes = path.read_bytes()
    first = get_analytics(client)
    second = get_analytics(client)
    assert first.content == second.content
    assert path.read_bytes() == original_bytes
    with module.connect() as db:
        assert list(db.iterdump()) == original_tables


def test_reader_never_creates_a_missing_database(tmp_path):
    database = tmp_path / "does-not-exist.db"
    with pytest.raises(sqlite3.OperationalError):
        read_analytics(database)
    assert not database.exists()


@pytest.mark.parametrize(("configured", "authorization"), [
    (None, None), (None, "Bearer test-admin-token"), ("", "Bearer test-admin-token"),
    ("test-admin-token", None), ("test-admin-token", ""),
    ("test-admin-token", "Basic test-admin-token"), ("test-admin-token", "Bearer"),
    ("test-admin-token", "Bearer "), ("test-admin-token", "Bearer wrong-token"),
    ("test-admin-token", "Bearer  test-admin-token"), ("test-admin-token", "Bearer test-admin-token "),
    ("test-admin-token", "Bearer test-admin-token extra"),
    ("test-admin-token", b"Bearer caf\xe9"), ("caf\xe9", "Bearer test-admin-token"),
])
def test_forbidden_is_stable_and_happens_before_repository_access(client, monkeypatch, configured, authorization):
    if configured is None:
        monkeypatch.delenv("BREWGO_ADMIN_TOKEN", raising=False)
    else:
        monkeypatch.setenv("BREWGO_ADMIN_TOKEN", configured)

    def no_access(*args, **kwargs):
        pytest.fail("Unauthorized requests must not access the database")

    monkeypatch.setattr(module, "read_analytics", no_access)
    monkeypatch.setattr(module, "connect", no_access)
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get("/api/admin/analytics", headers=headers)
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden"}
    assert response.headers["cache-control"] == "no-store"


def test_non_ascii_token_comparison_does_not_raise(monkeypatch):
    monkeypatch.setenv("BREWGO_ADMIN_TOKEN", "caf\xe9")
    assert module.authorize_admin("Bearer caf\xe9")
    assert not module.authorize_admin("Bearer wrong\xe9")


def test_authentication_leaves_request_headers_unchanged(client):
    headers = {"Authorization": "Bearer test-admin-token"}
    original = headers.copy()
    assert client.get("/api/admin/analytics", headers=headers).status_code == 200
    assert headers == original


def test_customer_profile_and_guest_cookies_never_grant_admin_access(client, monkeypatch):
    client.get("/api/catalog")
    assert client.post("/api/account/profile", json={"name": "Admin"}).status_code == 200
    assert "brewgo_session" in client.cookies
    assert "brewgo_guest" in client.cookies

    def no_access(*args, **kwargs):
        pytest.fail("Customer cookies must not be used to authorize analytics")

    monkeypatch.setattr(module, "read_analytics", no_access)
    monkeypatch.setattr(module, "connect", no_access)
    response = client.get("/api/admin/analytics")
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden"}


@pytest.mark.parametrize("url", ["/admin", "/admin/"])
def test_admin_page_serves_frontend_entry(client, tmp_path, monkeypatch, url):
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / "index.html").write_text("<!doctype html><div id='root'>BrewGo</div>")
    monkeypatch.setattr(module, "DIST", frontend)
    response = client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-store"
    assert response.text == "<!doctype html><div id='root'>BrewGo</div>"


def test_admin_page_explains_missing_frontend_build(client, tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DIST", tmp_path / "missing")
    response = client.get("/admin")
    assert response.status_code == 503
    assert response.json() == {"detail": "Frontend build is unavailable. Run npm run build."}

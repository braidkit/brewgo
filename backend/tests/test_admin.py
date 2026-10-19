from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json

from fastapi.testclient import TestClient
import pytest

from backend.app import app
from backend import database
from backend.admin import password_hash, token_hash

METRICS = ('overview', 'sales', 'products', 'orders', 'customers', 'stores')
RANGE = '?from=2026-07-01&to=2026-07-31'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', str(tmp_path / 'admin.db'))
    with TestClient(app) as client:
        with database.connect() as db:
            db.execute("INSERT INTO admin_accounts VALUES ('admin-1', 'alex', ?, 'admin')", (password_hash('test-password-123'),))
            db.executemany('INSERT INTO customers VALUES (?, ?, ?)', [
                ('c1', 'First customer', '2026-06-29T12:00:00+00:00'),
                ('c2', 'Second customer', '2026-07-02T12:00:00+00:00'),
                ('c3', 'Later customer', '2026-08-01T12:00:00+00:00'),
            ])
            fixtures = [
                ('1', '2026-07-01T00:00:00+00:00', 'ny-flatiron', 'c1', 'confirmed', 'coffee', 2, 1000),
                ('2', '2026-07-02T12:00:00+00:00', 'ny-flatiron', 'c1', 'completed', 'flat-white', 1, 700),
                ('3', '2026-07-03T12:00:00+00:00', 'se-fremont', 'c2', 'refunded', 'coffee', 1, 500),
                ('4', '2026-07-31T23:59:59+00:00', 'se-fremont', None, 'confirmed', 'coffee', 3, 1200),
                ('5', '2026-08-01T00:00:00+00:00', 'ny-flatiron', 'c3', 'confirmed', 'coffee', 1, 900),
                ('6', '2026-07-15T12:00:00+00:00', 'ny-flatiron', 'c2', 'cancelled', 'coffee', 1, 600),
            ]
            for id, created, store, customer, status, product, units, subtotal in fixtures:
                payload = {'created_at': created, 'store': {'id': store}, 'status': status, 'subtotal': subtotal,
                           'total': subtotal + 100, 'customer_name': 'Private pickup name',
                           'items': [{'product_id': product, 'name': product, 'quantity': units, 'line_total': subtotal}]}
                db.execute('INSERT INTO orders VALUES (?, ?, ?, ?, ?)', (id, 'guest-' + id, 'request-' + id, customer, json.dumps(payload)))
        yield client


def sign_in(client):
    response = client.post('/api/admin/session', json={'username': 'alex', 'password': 'test-password-123'})
    assert response.status_code == 200
    return client.cookies.get('brewgo_admin')


@pytest.mark.parametrize('metric', METRICS)
def test_every_metric_requires_admin_session(client, metric):
    assert client.get('/api/admin/analytics/' + metric + RANGE).status_code == 401
    client.post('/api/account/profile', json={'name': 'Customer'})
    assert client.get('/api/admin/analytics/' + metric + RANGE).status_code == 403
    sign_in(client)
    assert client.get('/api/admin/analytics/' + metric + RANGE).status_code == 200


def test_session_password_role_expiry_and_revocation(client):
    assert client.post('/api/admin/session', json={'username': 'alex', 'password': 'wrong'}).status_code == 401
    token = sign_in(client)
    assert client.get('/api/admin/session').json()['admin']['role'] == 'admin'
    with database.connect() as db:
        assert db.execute('SELECT token_hash FROM admin_sessions').fetchone()[0] == token_hash(token)
        db.execute("UPDATE admin_accounts SET role='staff'")
    assert client.get('/api/admin/analytics/overview' + RANGE).status_code == 403
    with database.connect() as db:
        db.execute("UPDATE admin_accounts SET role='admin'")
        db.execute('UPDATE admin_sessions SET expires_at=?', ((datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),))
    assert client.get('/api/admin/session').status_code == 401
    sign_in(client)
    assert client.delete('/api/admin/session').status_code == 204
    assert client.get('/api/admin/session').status_code == 401


def test_bearer_token_and_cookie_security(client):
    token = sign_in(client)
    cookie = client.post('/api/admin/session', json={'username': 'alex', 'password': 'test-password-123'}).headers['set-cookie']
    assert 'HttpOnly' in cookie and 'SameSite=strict' in cookie and 'Path=/api/admin' in cookie
    client.cookies.clear()
    headers = {'Authorization': 'Bearer ' + token}
    assert client.get('/api/admin/analytics/overview' + RANGE, headers=headers).status_code == 200
    assert client.delete('/api/admin/session', headers=headers).status_code == 204
    assert client.get('/api/admin/session', headers=headers).status_code == 401


def test_overview_totals_use_subtotals_and_inclusive_utc_dates(client):
    sign_in(client)
    response = client.get('/api/admin/analytics/overview' + RANGE)
    assert response.headers['cache-control'] == 'no-store'
    assert response.json()['totals'] == {'revenue': 29, 'orders': 5, 'avgOrderValue': 9.67, 'newCustomers': 1}
    assert response.json()['range'] == {'from': '2026-07-01', 'to': '2026-07-31'}
    assert 'Private pickup name' not in response.text


def test_sales_fill_gaps_and_group_by_monday_and_month(client):
    sign_in(client)
    daily = client.get('/api/admin/analytics/sales' + RANGE).json()['series']
    assert len(daily) == 31
    assert sum(row['revenue'] for row in daily) == 29
    assert daily[3] == {'date': '2026-07-04', 'revenue': 0, 'orders': 0}
    weekly = client.get('/api/admin/analytics/sales' + RANGE + '&granularity=week').json()['series']
    assert weekly[0] == {'date': '2026-06-29', 'revenue': 17, 'orders': 3}
    assert sum(row['revenue'] for row in weekly) == 29
    monthly = client.get('/api/admin/analytics/sales' + RANGE + '&granularity=month').json()['series']
    assert monthly == [{'date': '2026-07-01', 'revenue': 29, 'orders': 5}]


def test_products_orders_customers_and_stores(client):
    sign_in(client)
    products = client.get('/api/admin/analytics/products' + RANGE).json()['products']
    assert [(row['id'], row['units'], row['revenue']) for row in products] == [('coffee', 5, 22), ('flat-white', 1, 7)]
    statuses = client.get('/api/admin/analytics/orders' + RANGE).json()['statuses']
    assert {row['status']: row['count'] for row in statuses} == {'confirmed': 2, 'completed': 1, 'refunded': 1, 'cancelled': 1}
    customers = client.get('/api/admin/analytics/customers' + RANGE).json()['totals']
    assert customers == {'customers': 2, 'newCustomers': 1, 'repeatCustomers': 2, 'repeatRate': 100, 'guestOrders': 1}
    stores = client.get('/api/admin/analytics/stores' + RANGE).json()['stores']
    assert len(stores) == 6
    assert stores[0] == {'id': 'ny-flatiron', 'name': 'Flatiron', 'city': 'New York', 'orders': 3, 'revenue': 17, 'avgOrderValue': 8.5}
    assert sum(row['revenue'] for row in stores) == 29


@pytest.mark.parametrize('metric', METRICS)
def test_store_filters_and_empty_ranges(client, metric):
    sign_in(client)
    selected = client.get('/api/admin/analytics/' + metric + RANGE + '&storeId=ny-flatiron')
    assert selected.status_code == 200 and selected.json()['storeId'] == 'ny-flatiron'
    if metric == 'overview':
        assert selected.json()['totals']['revenue'] == 17
    if metric == 'stores':
        assert len(selected.json()['stores']) == 1
    empty = client.get('/api/admin/analytics/' + metric + '?from=2025-01-01&to=2025-01-02')
    assert empty.status_code == 200
    if metric in ('overview', 'customers'):
        assert all(value == 0 for value in empty.json()['totals'].values())


@pytest.mark.parametrize('query', [
    '?from=2026-07-32', '?from=bad', '?from=2026-08-01&to=2026-07-01',
    '?from=2020-01-01&to=2026-07-01', '?granularity=year', '?storeId=not-a-store', '?to=9999-12-31',
])
def test_invalid_filters(client, query):
    sign_in(client)
    assert client.get('/api/admin/analytics/sales' + query).status_code == 422


def test_cache_is_per_metric_and_filter(client):
    sign_in(client)
    first = client.get('/api/admin/analytics/overview' + RANGE).json()
    with database.connect() as db:
        db.execute("DELETE FROM orders WHERE id='1'")
    cached = client.get('/api/admin/analytics/overview' + RANGE).json()
    assert cached == first
    other_filter = client.get('/api/admin/analytics/overview' + RANGE + '&storeId=ny-flatiron').json()
    assert other_filter['totals']['revenue'] == 7


def test_average_rounds_half_cents_up():
    from backend.analytics import average_value
    assert average_value(1781, 2) == 8.91
    assert average_value(0, 0) == 0


def test_audit_trail_excludes_credentials_and_payloads(client):
    token = sign_in(client)
    client.get('/api/admin/analytics/overview' + RANGE)
    client.get('/api/admin/analytics/sales?from=bad-secret-query')
    with database.connect() as db:
        rows = [dict(row) for row in db.execute('SELECT * FROM admin_audit')]
    assert [row['status'] for row in rows] == [200, 200, 422]
    assert all(row['account_id'] == 'admin-1' for row in rows)
    assert rows[1]['path'] == '/api/admin/analytics/overview'
    encoded = json.dumps(rows)
    assert not any(secret in encoded for secret in ('test-password-123', token, 'Private pickup name', 'bad-secret-query'))


def test_rate_limits_login_and_admin_account(client):
    for _ in range(5):
        assert client.post('/api/admin/session', json={'username': 'alex', 'password': 'wrong'}).status_code == 401
    response = client.post('/api/admin/session', json={'username': 'alex', 'password': 'wrong'})
    assert response.status_code == 429 and int(response.headers['retry-after']) > 0
    with database.connect() as db:
        db.execute('DELETE FROM admin_rate_limits')
    sign_in(client)
    with database.connect() as db:
        db.execute("INSERT INTO admin_rate_limits VALUES ('account:admin-1', ?, 120)", (__import__('time').time(),))
    assert client.get('/api/admin/analytics/overview' + RANGE).status_code == 429


def test_cross_origin_writes_and_https_mode(client, monkeypatch):
    assert client.post('/api/admin/session', headers={'Origin': 'https://other.example'}, json={'username': 'alex', 'password': 'test-password-123'}).status_code == 403
    monkeypatch.setenv('BREWGO_SECURE_COOKIES', '1')
    assert client.get('/api/admin/session').status_code == 400
    with TestClient(app, base_url='https://testserver') as secure_client:
        response = secure_client.post('/api/admin/session', json={'username': 'alex', 'password': 'test-password-123'})
        assert response.status_code == 200 and 'Secure' in response.headers['set-cookie']


def test_fifty_concurrent_admin_sessions(client):
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    with database.connect() as db:
        for index in range(50):
            db.execute("INSERT INTO admin_accounts VALUES (?, ?, '', 'admin')", (f'concurrent-{index}', f'admin-{index}'))
            db.execute('INSERT INTO admin_sessions VALUES (?, ?, ?)', (token_hash(f'concurrent-token-{index}'), f'concurrent-{index}', expires))
    with ThreadPoolExecutor(max_workers=50) as pool:
        responses = list(pool.map(lambda index: client.get('/api/admin/analytics/overview' + RANGE, headers={'Authorization': f'Bearer concurrent-token-{index}'}), range(50)))
    assert all(response.status_code == 200 and response.json()['totals']['revenue'] == 29 for response in responses)

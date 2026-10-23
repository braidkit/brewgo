"""Separate admin credentials and revocable, eight-hour sessions. No public signup."""
from datetime import date, datetime, timedelta, timezone
from hashlib import scrypt, sha256
import hmac
import os
import secrets
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .analytics import aggregate, validate_filters
from .catalog import STORES
from .database import connect, init_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"{salt}:{digest}"


def token_hash(token):
    return sha256(token.encode()).hexdigest()


def rate_limit(key, limit, seconds=60):
    now = time.time()
    with connect() as db:
        db.execute("DELETE FROM admin_rate_limits WHERE window_start < ?", (now - seconds,))
        db.execute("""INSERT INTO admin_rate_limits VALUES (?, ?, 1)
            ON CONFLICT(key) DO UPDATE SET count=count+1""", (key, now))
        row = db.execute("SELECT count, window_start FROM admin_rate_limits WHERE key=?", (key,)).fetchone()
    if row['count'] > limit:
        raise HTTPException(429, "Too many requests. Please try again in a minute.",
                            headers={"Retry-After": str(max(1, int(seconds - (now - row['window_start']))))})


async def audit_admin_request(request: Request, call_next):
    if not request.url.path.startswith('/api/admin'):
        return await call_next(request)
    if os.environ.get('BREWGO_SECURE_COOKIES') == '1' and request.url.scheme != 'https':
        response = JSONResponse({"detail": "Admin access requires HTTPS."}, status_code=400)
    elif request.method not in ('GET', 'HEAD', 'OPTIONS') and (
        request.headers.get('sec-fetch-site') == 'cross-site' or
        request.headers.get('origin', str(request.base_url).rstrip('/')) != str(request.base_url).rstrip('/')
    ):
        response = JSONResponse({"detail": "Use the BrewGo admin site to make this request."}, status_code=403)
    else:
        try:
            response = await call_next(request)
        except Exception:
            record_audit(request, 500)
            raise
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    record_audit(request, response.status_code)
    return response


def record_audit(request, status):
    # Never record tokens, credentials, query strings, names, or order payloads.
    route = request.scope.get('route')
    path = route.path if route else '/api/admin/unknown'
    metric = request.path_params.get('metric')
    if metric in ('overview', 'sales', 'products', 'orders', 'customers', 'stores'):
        path = path.replace('{metric}', metric)
    with connect() as db:
        db.execute("INSERT INTO admin_audit(created_at, account_id, method, path, status) VALUES (?, ?, ?, ?, ?)",
                   (datetime.now(timezone.utc).isoformat(), getattr(request.state, 'admin_id', None), request.method,
                    path, status))


def require_admin(request: Request):
    authorization = request.headers.get('authorization', '')
    token = authorization[7:] if authorization.lower().startswith('bearer ') else request.cookies.get('brewgo_admin')
    if not token:
        raise HTTPException(403 if request.cookies.get('brewgo_session') else 401, "Admin sign-in required.")
    with connect() as db:
        account = db.execute("""SELECT a.id, a.username, a.role FROM admin_accounts a
            JOIN admin_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?""",
            (token_hash(token), datetime.now(timezone.utc).isoformat())).fetchone()
    if not account:
        raise HTTPException(401, "Your admin session has expired. Please sign in again.")
    request.state.admin_id = account['id']
    if account['role'] != 'admin':
        raise HTTPException(403, "An admin role is required.")
    rate_limit(f"account:{account['id']}", 120)
    return {"id": account['id'], "username": account['username'], "role": account['role']}


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


@router.post('/session')
def login(body: Login, request: Request, response: Response):
    rate_limit(f"login-ip:{request.client.host if request.client else 'unknown'}", 10)
    username = body.username.strip().lower()
    rate_limit(f"login-user:{sha256(username.encode()).hexdigest()}", 5)
    with connect() as db:
        account = db.execute("SELECT * FROM admin_accounts WHERE username=?", (username,)).fetchone()
    # Do equivalent password work for unknown users as well.
    expected = account['password_hash'] if account else '00' * 16 + ':' + '00' * 64
    candidate = password_hash(body.password, expected.split(':')[0])
    if not hmac.compare_digest(candidate, expected) or not account:
        raise HTTPException(401, "The username or password is incorrect.")
    request.state.admin_id = account['id']
    if account['role'] != 'admin':
        raise HTTPException(403, "An admin role is required.")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now.isoformat(),))
        db.execute("INSERT INTO admin_sessions VALUES (?, ?, ?)", (token_hash(token), account['id'], (now + timedelta(hours=8)).isoformat()))
    response.set_cookie('brewgo_admin', token, httponly=True, samesite='strict', path='/api/admin',
                        secure=os.environ.get('BREWGO_SECURE_COOKIES') == '1', max_age=28800)
    return {"admin": {"id": account['id'], "username": account['username'], "role": account['role']}}


@router.get('/session')
def session(admin=Depends(require_admin)):
    return {"admin": admin, "stores": [{"id": store['id'], "name": store['name'], "city": store['city']} for store in STORES]}


@router.delete('/session', status_code=204)
def logout(request: Request, response: Response, admin=Depends(require_admin)):
    # Logout revokes this session, including when it was supplied as a bearer token.
    authorization = request.headers.get('authorization', '')
    token = authorization[7:] if authorization.lower().startswith('bearer ') else request.cookies.get('brewgo_admin', '')
    with connect() as db:
        db.execute("DELETE FROM admin_sessions WHERE token_hash=? AND account_id=?", (token_hash(token), admin['id']))
    response.delete_cookie('brewgo_admin', path='/api/admin')


def filters(
    start: Annotated[date | None, Query(alias='from')] = None,
    end: Annotated[date | None, Query(alias='to')] = None,
    granularity: Literal['day', 'week', 'month'] = 'day',
    store_id: Annotated[str | None, Query(alias='storeId', max_length=80)] = None,
):
    return validate_filters(start, end, granularity, store_id)


@router.get('/analytics/{metric}')
def analytics(metric: Literal['overview', 'sales', 'products', 'orders', 'customers', 'stores'],
              admin=Depends(require_admin), selection=Depends(filters)):
    return aggregate(metric, selection)


if __name__ == '__main__':
    import argparse
    import getpass
    import re
    parser = argparse.ArgumentParser(description='Create or reset a local BrewGo admin account. Password input is hidden.')
    parser.add_argument('username')
    args = parser.parse_args()
    username = args.username.strip().lower()
    if not re.fullmatch(r'[a-z0-9][a-z0-9._@+-]{0,79}', username):
        parser.error('Use 1–80 letters, digits, or . _ @ + - for the username.')
    password = getpass.getpass('Password (at least 12 characters): ')
    if len(password) < 12 or len(password) > 256 or password != getpass.getpass('Repeat password: '):
        parser.error('Passwords must match and contain 12–256 characters.')
    init_db()
    with connect() as db:
        account = db.execute('SELECT id FROM admin_accounts WHERE username=?', (username,)).fetchone()
        account_id = account['id'] if account else secrets.token_urlsafe(16)
        db.execute("INSERT INTO admin_accounts VALUES (?, ?, ?, 'admin') ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
                   (account_id, username, password_hash(password)))
        db.execute('DELETE FROM admin_sessions WHERE account_id=?', (account_id,))
    print('Admin account ready. Sign in at /admin/login. Existing sessions for this account were revoked.')

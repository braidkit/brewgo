"""BrewGo API. SQLite persistence, server-side prices, simulated payment only."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Literal

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .catalog import MENU, MILKS, SIZES, STORES

DB_PATH = os.environ.get("BREWGO_DB", str(Path(__file__).parent / "brewgo.db"))


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, request_key TEXT NOT NULL,
                customer_id TEXT, payload TEXT NOT NULL,
                UNIQUE(session_id, request_key)
            );
        """)


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(title="BrewGo Coffee", version="1.0.0", lifespan=lifespan)


class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=20)
    size: Literal["Small", "Medium", "Large"] = "Small"
    milk: Literal["Whole milk", "Oat milk", "Almond milk", "Soy milk"] = "Whole milk"
    extra_shot: bool = False


class OrderRequest(BaseModel):
    store_id: str
    customer_name: str = Field(min_length=1, max_length=50)
    items: list[CartItem] = Field(min_length=1, max_length=30)
    request_key: str = Field(min_length=16, max_length=100)


class CustomerProfile(BaseModel):
    name: str = Field(min_length=1, max_length=50)


def customer_for(token):
    if not token:
        return None
    with connect() as db:
        return db.execute(
            "SELECT c.id, c.name FROM customers c JOIN sessions s ON s.customer_id=c.id WHERE s.token=? AND s.expires_at>?",
            (token, datetime.now(timezone.utc).isoformat()),
        ).fetchone()


def session_cookie(response, name, value):
    response.set_cookie(name, value, httponly=True, samesite="lax", max_age=86400,
                        secure=os.environ.get("BREWGO_SECURE_COOKIES") == "1")


@app.get("/api/health")
def health():
    return {"status": "ok", "payments": "simulated"}


@app.get("/api/catalog")
def catalog(response: Response, brewgo_guest: str | None = Cookie(default=None)):
    if not brewgo_guest:
        session_cookie(response, "brewgo_guest", secrets.token_urlsafe(32))
    return {"menu": MENU, "stores": STORES, "sizes": SIZES, "milks": MILKS, "currency": "USD"}


@app.get("/api/account")
def account(brewgo_session: str | None = Cookie(default=None)):
    customer = customer_for(brewgo_session)
    return {"customer": dict(customer) if customer else None}


@app.post("/api/account/profile")
def create_profile(body: CustomerProfile, response: Response):
    """Create a local sample profile, without real email or password collection."""
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Enter a name for your profile.")
    now = datetime.now(timezone.utc)
    customer_id, token = secrets.token_urlsafe(16), secrets.token_urlsafe(32)
    with connect() as db:
        db.execute("INSERT INTO customers VALUES (?, ?, ?)", (customer_id, name, now.isoformat()))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token, customer_id, (now + timedelta(days=1)).isoformat()))
    session_cookie(response, "brewgo_session", token)
    return {"customer": {"id": customer_id, "name": name}}


@app.delete("/api/account/session", status_code=204)
def sign_out(response: Response, brewgo_session: str | None = Cookie(default=None)):
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token=?", (brewgo_session,))
    response.delete_cookie("brewgo_session")


def price_line(item):
    product = next((p for p in MENU if p["id"] == item.product_id), None)
    if not product:
        raise HTTPException(422, "An item is no longer on the menu. Please update your bag.")
    food = product["category"] == "Bakery & food"
    if food and (item.size != "Small" or item.milk != "Whole milk" or item.extra_shot):
        raise HTTPException(422, "Food items do not have drink options.")
    if not product["milk"] and item.milk != "Whole milk":
        raise HTTPException(422, "Milk customization is not available for this item.")
    if item.extra_shot and product["category"] not in ("Hot coffee", "Iced coffee"):
        raise HTTPException(422, "Extra espresso is available for coffee only.")
    # Oat milk is included in the signature oat latte's base price.
    milk_cost = 0 if product["id"] == "iced-oat-latte" and item.milk == "Oat milk" else MILKS[item.milk]
    unit_price = product["price"] + (0 if food else SIZES[item.size] + milk_cost + (100 if item.extra_shot else 0))
    return {**item.model_dump(), "name": product["name"], "image": product["image"], "unit_price": unit_price, "line_total": unit_price * item.quantity}


@app.post("/api/orders", status_code=201)
def create_order(body: OrderRequest, brewgo_guest: str | None = Cookie(default=None),
                 brewgo_session: str | None = Cookie(default=None)):
    if not brewgo_guest:
        raise HTTPException(400, "Refresh the menu before placing your order.")
    name = body.customer_name.strip()
    if not name:
        raise HTTPException(422, "Enter a name for pickup.")
    with connect() as db:
        previous = db.execute("SELECT payload FROM orders WHERE session_id=? AND request_key=?", (brewgo_guest, body.request_key)).fetchone()
        if previous:
            return json.loads(previous["payload"])
    store = next((s for s in STORES if s["id"] == body.store_id), None)
    if not store or not store["available"]:
        raise HTTPException(422, "This cafe is unavailable for pickup. Please choose another.")
    lines = [price_line(item) for item in body.items]
    subtotal = sum(line["line_total"] for line in lines)
    tax = (subtotal * 825 + 5000) // 10000  # Sample tax: 8.25%, rounded once on subtotal.
    now = datetime.now(timezone.utc)
    customer = customer_for(brewgo_session)
    order = {
        "id": secrets.token_urlsafe(24), "number": f"BG-{secrets.randbelow(9000) + 1000}",
        "customer_name": name, "store": store, "items": lines,
        "subtotal": subtotal, "tax": tax, "total": subtotal + tax,
        "currency": "USD", "created_at": now.isoformat(),
        "ready_at": (now + timedelta(minutes=store["wait_minutes"])).isoformat(),
        "payment_status": "simulated_paid", "status": "confirmed",
    }
    # No payment SDK, card data, provider calls, or real charge.
    with connect() as db:
        db.execute("INSERT OR IGNORE INTO orders VALUES (?, ?, ?, ?, ?)",
                   (order["id"], brewgo_guest, body.request_key, customer["id"] if customer else None, json.dumps(order)))
        saved = db.execute("SELECT payload FROM orders WHERE session_id=? AND request_key=?", (brewgo_guest, body.request_key)).fetchone()
    return json.loads(saved["payload"])


@app.get("/api/orders")
def order_history(brewgo_guest: str | None = Cookie(default=None), brewgo_session: str | None = Cookie(default=None)):
    customer = customer_for(brewgo_session)
    with connect() as db:
        rows = db.execute("SELECT payload FROM orders WHERE session_id=? OR customer_id=? ORDER BY rowid DESC LIMIT 20",
                          (brewgo_guest, customer["id"] if customer else None)).fetchall()
    return {"orders": [json.loads(row["payload"]) for row in rows]}


DIST = Path(__file__).resolve().parent.parent / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")

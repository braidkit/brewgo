"""Shared SQLite connection and additive schema setup."""
import os
from pathlib import Path
import sqlite3

DB_PATH = os.environ.get("BREWGO_DB", str(Path(__file__).parent / "brewgo.db"))


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
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
            CREATE INDEX IF NOT EXISTS orders_date ON orders(date(json_extract(payload, '$.created_at')));
            CREATE INDEX IF NOT EXISTS orders_store_date ON orders(
                json_extract(payload, '$.store.id'), date(json_extract(payload, '$.created_at'))
            );
            CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
            CREATE INDEX IF NOT EXISTS customers_created ON customers(created_at);
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin'
            );
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_rate_limits (
                key TEXT PRIMARY KEY, window_start REAL NOT NULL, count INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_audit (
                id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, account_id TEXT,
                method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL
            );
        """)

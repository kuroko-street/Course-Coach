"""Database connectivity helpers.

Connection parameters are read exclusively from environment variables so the
same image runs unchanged in Docker Compose, CI, or locally.
"""
import os
import threading

import psycopg2
import psycopg2.extras
from psycopg2.extensions import TRANSACTION_STATUS_IDLE
from psycopg2.pool import PoolError, ThreadedConnectionPool


_pool = None
_pool_lock = threading.Lock()


class _ConnectionLease:
    """Keep the existing conn.close() contract while returning a clean pool slot."""

    def __init__(self, pool, connection):
        self._pool = pool
        self._connection = connection
        self._session_changed = False

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def set_session(self, *args, **kwargs):
        result = self._connection.set_session(*args, **kwargs)
        self._session_changed = True
        return result

    def close(self):
        if self._connection is None:
            return
        connection = self._connection
        self._connection = None
        try:
            if not connection.closed:
                if self._session_changed:
                    # The read-only and repeatable-read endpoints must not
                    # lend their transaction settings to a later writer.
                    connection.reset()
                elif connection.get_transaction_status() != TRANSACTION_STATUS_IDLE:
                    # A plain read leaves a transaction open. Roll it back
                    # without the extra RESET commands on every request.
                    connection.rollback()
        except Exception:
            self._pool.putconn(connection, close=True)
            return
        self._pool.putconn(connection, close=bool(connection.closed))


def get_db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5432"),
        "dbname": os.getenv("DB_NAME", "coursecoach"),
        "user": os.getenv("DB_USER", "coursecoach"),
        "password": os.getenv("DB_PASSWORD", "coursecoach_pass"),
    }


def get_connection():
    """Borrow a connection, creating the process-local pool on first use.

    autocommit stays off; callers still control commit()/rollback() and must
    call close() when done. A full pool falls back to a one-off connection so
    concurrent requests are not rejected merely because all slots are busy.
    """
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ThreadedConnectionPool(1, 8, **get_db_config())
    try:
        return _ConnectionLease(_pool, _pool.getconn())
    except PoolError:
        return psycopg2.connect(**get_db_config())


def dict_cursor(conn):
    """Return a cursor whose rows behave like dicts."""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

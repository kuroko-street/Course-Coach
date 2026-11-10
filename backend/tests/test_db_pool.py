"""A returned DB connection must never carry an old transaction to a new request."""

import db
import pytest


class FakeConnection:
    closed = 0

    def __init__(self, fail_reset=False, transaction_status=2, probe_error=None):
        self.fail_reset = fail_reset
        self.transaction_status = transaction_status
        self.resets = 0
        self.rollbacks = 0
        self.autocommit = False
        self.probe_error = probe_error
        self.probes = 0

    def cursor(self):
        connection = self

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def execute(self, sql):
                assert sql == 'SELECT 1'
                assert connection.autocommit is True
                connection.probes += 1
                if connection.probe_error:
                    raise connection.probe_error

        return Cursor()

    def get_transaction_status(self):
        return self.transaction_status

    def rollback(self):
        self.rollbacks += 1
        self.transaction_status = db.TRANSACTION_STATUS_IDLE

    def set_session(self, *args, **kwargs):
        return None

    def reset(self):
        self.resets += 1
        if self.fail_reset:
            raise RuntimeError("connection lost")


class FakePool:
    def __init__(self, connection):
        self.connection = connection
        self.returned = []

    def getconn(self):
        return self.connection

    def putconn(self, connection, close=False):
        self.returned.append((connection, close))


def test_close_rolls_back_plain_transaction_and_returns_once(monkeypatch):
    connection = FakeConnection()
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    borrowed = db.get_connection()
    borrowed.close()
    borrowed.close()

    assert connection.rollbacks == 1
    assert connection.resets == 0
    assert pool.returned == [(connection, False)]


def test_read_only_session_is_reset_before_reuse(monkeypatch):
    connection = FakeConnection()
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    borrowed = db.get_connection()
    borrowed.set_session(isolation_level="REPEATABLE READ", readonly=True)
    borrowed.close()

    assert connection.resets == 1
    assert connection.rollbacks == 0
    assert pool.returned == [(connection, False)]


def test_failed_reset_discards_connection(monkeypatch):
    connection = FakeConnection(fail_reset=True)
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    borrowed = db.get_connection()
    borrowed.set_session(readonly=True)
    borrowed.close()

    assert pool.returned == [(connection, True)]


def test_closed_connection_is_discarded(monkeypatch):
    connection = FakeConnection()
    connection.closed = 1
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    db._ConnectionLease(pool, connection).close()

    assert connection.resets == 0
    assert pool.returned == [(connection, True)]


def test_idle_connection_returns_without_database_roundtrip(monkeypatch):
    connection = FakeConnection(transaction_status=db.TRANSACTION_STATUS_IDLE)
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    db.get_connection().close()

    assert connection.rollbacks == 0
    assert connection.resets == 0
    assert pool.returned == [(connection, False)]


@pytest.mark.parametrize('error', [
    db.psycopg2.OperationalError('connection terminated'),
    db.psycopg2.DatabaseError('server closed the connection unexpectedly'),
])
def test_stale_connection_is_discarded_and_replaced_before_request(monkeypatch, error):
    stale = FakeConnection(probe_error=error)
    pool = FakePool(stale)
    fresh = FakeConnection(transaction_status=db.TRANSACTION_STATUS_IDLE)
    configs = []
    monkeypatch.setattr(db, '_pool', pool)
    monkeypatch.setattr(db.psycopg2, 'connect', lambda **kw: configs.append(kw) or fresh)

    assert db.get_connection() is fresh
    assert stale.probes == 1
    assert pool.returned == [(stale, True)]
    assert len(configs) == 1
    assert configs[0]['connect_timeout'] == 10


def test_successful_probe_restores_transaction_mode(monkeypatch):
    connection = FakeConnection(transaction_status=db.TRANSACTION_STATUS_IDLE)
    pool = FakePool(connection)
    monkeypatch.setattr(db, '_pool', pool)
    borrowed = db.get_connection()
    assert connection.probes == 1
    assert connection.autocommit is False
    assert connection.get_transaction_status() == db.TRANSACTION_STATUS_IDLE
    borrowed.set_session(readonly=True)
    borrowed.close()
    assert connection.resets == 1


def test_reconnect_failure_propagates_without_unbounded_retry(monkeypatch):
    stale = FakeConnection(probe_error=db.psycopg2.DatabaseError('lost connection'))
    pool = FakePool(stale)
    attempts = []
    monkeypatch.setattr(db, '_pool', pool)

    def connect(**kw):
        attempts.append(kw)
        raise db.psycopg2.OperationalError('database unavailable')

    monkeypatch.setattr(db.psycopg2, 'connect', connect)
    with pytest.raises(db.psycopg2.OperationalError, match='database unavailable'):
        db.get_connection()
    assert len(attempts) == 1
    assert pool.returned == [(stale, True)]


def test_already_closed_connection_is_replaced(monkeypatch):
    stale = FakeConnection()
    stale.closed = 1
    pool = FakePool(stale)
    fresh = object()
    monkeypatch.setattr(db, '_pool', pool)
    monkeypatch.setattr(db.psycopg2, 'connect', lambda **kw: fresh)
    assert db.get_connection() is fresh
    assert stale.probes == 0
    assert pool.returned == [(stale, True)]

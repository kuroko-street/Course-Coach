"""A returned DB connection must never carry an old transaction to a new request."""

import db


class FakeConnection:
    closed = 0

    def __init__(self, fail_reset=False, transaction_status=2):
        self.fail_reset = fail_reset
        self.transaction_status = transaction_status
        self.resets = 0
        self.rollbacks = 0

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

    db.get_connection().close()

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

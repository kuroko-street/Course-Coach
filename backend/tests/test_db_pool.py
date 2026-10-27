"""A returned DB connection must never carry an old transaction to a new request."""

import db


class FakeConnection:
    closed = 0

    def __init__(self, fail_reset=False):
        self.fail_reset = fail_reset
        self.resets = 0

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


def test_close_resets_and_returns_connection_once(monkeypatch):
    connection = FakeConnection()
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    borrowed = db.get_connection()
    borrowed.close()
    borrowed.close()

    assert connection.resets == 1
    assert pool.returned == [(connection, False)]


def test_failed_reset_discards_connection(monkeypatch):
    connection = FakeConnection(fail_reset=True)
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    db.get_connection().close()

    assert pool.returned == [(connection, True)]


def test_closed_connection_is_discarded(monkeypatch):
    connection = FakeConnection()
    connection.closed = 1
    pool = FakePool(connection)
    monkeypatch.setattr(db, "_pool", pool)

    db.get_connection().close()

    assert connection.resets == 0
    assert pool.returned == [(connection, True)]

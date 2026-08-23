"""Database connectivity helpers.

Connection parameters are read exclusively from environment variables so the
same image runs unchanged in Docker Compose, CI, or locally.
"""
import os

import psycopg2
import psycopg2.extras


def get_db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5432"),
        "dbname": os.getenv("DB_NAME", "coursecoach"),
        "user": os.getenv("DB_USER", "coursecoach"),
        "password": os.getenv("DB_PASSWORD", "coursecoach_pass"),
    }


def get_connection():
    """Open a new psycopg2 connection.

    autocommit is left at its default (False) so callers are in full control
    of transaction boundaries via commit()/rollback().
    """
    conn = psycopg2.connect(**get_db_config())
    return conn


def dict_cursor(conn):
    """Return a cursor whose rows behave like dicts."""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

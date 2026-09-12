"""Checksummed, transactional migrations for the NEW isolated database only."""
import hashlib
import os
from pathlib import Path

from db import get_connection


def migrate(directory=None, through=None):
    directory = Path(directory or os.getenv("MIGRATIONS_DIR", "/migrations"))
    files = sorted(directory.glob("*.sql"))
    if through is not None:
        if through not in {p.name for p in files}: raise RuntimeError('Unknown migration cutoff')
        files=[p for p in files if p.name<=through]
    if not files:
        raise RuntimeError(f"No migrations found in {directory}")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(782094113)")
            cur.execute("SELECT to_regclass('schema_migrations'), to_regclass('courses')")
            ledger, courses = cur.fetchone()
            if courses and not ledger:
                raise RuntimeError("Refusing to modify a legacy database. Use a new community database/volume.")
            cur.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )""")
        conn.commit()
        for path in files:
            raw = path.read_bytes()
            checksum = hashlib.sha256(raw).hexdigest()
            with conn.cursor() as cur:
                cur.execute("SELECT sha256 FROM schema_migrations WHERE name=%s", (path.name,))
                existing = cur.fetchone()
                if existing:
                    if existing[0] != checksum:
                        raise RuntimeError(f"Applied migration changed: {path.name}; add a new migration instead.")
                    print(f"Already applied: {path.name}", flush=True)
                    continue
                cur.execute(raw.decode("utf-8-sig"))
                cur.execute("INSERT INTO schema_migrations(name,sha256) VALUES(%s,%s)", (path.name, checksum))
            conn.commit()
            print(f"Applied: {path.name}", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--through',help='Apply through this exact filename for a staged migration')
    migrate(through=parser.parse_args().through)

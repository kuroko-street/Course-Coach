"""Course Coach FastAPI application composition root.

HTTP routes live in ``api`` modules, business rules and transaction boundaries
live in ``services``, and SQL lives in ``repositories``.  This module only
assembles the application and exposes the health check.
"""
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.admin_routes import router as admin_router
from api.course_routes import router as course_router
from api.file_routes import router as file_router
from api.review_routes import router as review_router
from api.user_routes import router as user_router
from db import get_connection


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("coursecoach")

app = FastAPI(title="Course Coach API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router)
app.include_router(course_router)
app.include_router(review_router)
app.include_router(file_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                cur.fetchone()
        finally:
            conn.close()
        return {"status": "ok", "database": "up"}
    except Exception as exc:
        logger.exception("Health check failed")
        raise HTTPException(
            status_code=503,
            detail={"status": "error", "database": "down", "message": str(exc)},
        ) from exc

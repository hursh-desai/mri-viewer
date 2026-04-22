from __future__ import annotations
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MRI Viewer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Rows", "X-Cols", "X-WC", "X-WW", "Content-Disposition"],
)

from backend.routes import study, series, instance, export, upload, stream

app.include_router(study.router, prefix="/api")
app.include_router(series.router, prefix="/api")
app.include_router(instance.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(stream.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}

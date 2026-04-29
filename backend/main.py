from __future__ import annotations
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MRI Viewer API")

# Allow localhost origins for local development (harmless in production since
# the frontend is served from the same origin there).
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


# ── Serve the built frontend (production / Docker) ────────────────────────────
# In dev the Vite proxy handles this; here we serve dist/ directly.
_DIST = Path(__file__).parent.parent / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(str(_DIST / "index.html"))

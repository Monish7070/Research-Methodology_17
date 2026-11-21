"""Urban Vision AI - FastAPI application entrypoint."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import (
    routes_auth,
    routes_dashboard,
    routes_detections,
    routes_explainability,
    routes_keyframes,
    routes_locations,
    routes_maintenance,
    routes_priority,
    routes_processing,
    routes_reports,
    routes_settings,
    routes_system,
    routes_users,
    routes_videos,
)
from app.core.config import BACKEND_DIR, ROOT_DIR, settings
from app.database.db import SessionLocal, create_all
from app.seed import seed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("urbanvision")

settings.ensure_dirs()
create_all()

_db = SessionLocal()
try:
    seed(_db)
finally:
    _db.close()

app = FastAPI(
    title="URBAN VISION AI API",
    description=(
        "AI-Driven Multi-Task Urban Infrastructure Monitoring and Maintenance Prioritization. "
        "SSIM keyframe extraction, custom YOLO11n detection (crack / garbage / pothole), "
        "LayerCAM explanations and weighted maintenance priority scoring."
    ),
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}"},
    )


for router in (
    routes_auth.router,
    routes_videos.router,
    routes_processing.router,
    routes_keyframes.router,
    routes_detections.router,
    routes_explainability.router,
    routes_priority.router,
    routes_maintenance.router,
    routes_locations.router,
    routes_reports.router,
    routes_users.router,
    routes_settings.router,
    routes_system.router,
    routes_dashboard.router,
):
    app.include_router(router, prefix=settings.API_PREFIX)

app.mount("/media/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
app.mount("/media/outputs", StaticFiles(directory=str(settings.OUTPUT_DIR)), name="outputs")
app.mount("/media/reports", StaticFiles(directory=str(settings.REPORT_DIR), check_dir=False), name="reports")


@app.get("/api", tags=["System"])
def api_root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "health": "/api/system/health",
    }


# Serve the built React frontend when it exists (single-command demo).
class SPAStaticFiles(StaticFiles):
    """Serve index.html for client-side routes that are not real files."""

    async def get_response(self, path: str, scope):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not Path(path).suffix:
                return await super().get_response("index.html", scope)
            raise
        if response.status_code == 404 and not Path(path).suffix:
            return await super().get_response("index.html", scope)
        return response


_DIST = ROOT_DIR / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", SPAStaticFiles(directory=str(_DIST), html=True), name="frontend")
else:
    @app.get("/", tags=["System"])
    def dev_root():
        return {
            "app": settings.APP_NAME,
            "message": "Frontend build not found. Run the Vite dev server (frontend) or `npm run build`.",
            "api_docs": "/api/docs",
        }


@app.on_event("startup")
def startup_log():
    logger.info("URBAN VISION AI API ready")
    logger.info("Model weights: %s (present=%s)", settings.MODEL_WEIGHTS, settings.MODEL_WEIGHTS.exists())
    logger.info("Database: %s", settings.DATABASE_URL)

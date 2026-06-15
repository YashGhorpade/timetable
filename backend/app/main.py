"""
FastAPI application entry point.
Mounts:
  - REST API under /api/v1
  - Socket.IO under /socket.io
  - Static docs at /docs and /redoc
"""
import socketio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.services.realtime import init_sio
from app.api.v1.endpoints import auth, admin, timetable


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Socket.IO with Redis adapter if configured
    sio = init_sio(redis_url=settings.REDIS_URL if settings.REDIS_URL != "redis://localhost:6379" or True else None)
    app.state.sio = sio
    yield
    # Shutdown cleanup (if needed)


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise Engineering College Timetable Management System",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    # Use explicit allowed origins so credentialed requests and authorization headers work correctly.
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API Routers ──────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth.router,      prefix=API_PREFIX)
app.include_router(admin.router,     prefix=API_PREFIX)
app.include_router(timetable.router, prefix=API_PREFIX)

# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# ─── Mount Socket.IO ──────────────────────────────────────────────────────────
# Socket.IO server is an ASGI app mounted at /socket.io
# The FastAPI app wraps it so both share the same port.

def create_asgi_app() -> socketio.ASGIApp:
    from app.services.realtime import get_sio
    sio = get_sio()
    return socketio.ASGIApp(sio, other_asgi_app=app)


# uvicorn entry: `uvicorn app.main:socket_app --host 0.0.0.0 --port 8000`
# For development with --reload, use the FastAPI app directly and ws on separate port.
# For production, use the combined ASGI app.

try:
    from app.services.realtime import init_sio as _init
    _sio = _init(settings.REDIS_URL)
    socket_app = socketio.ASGIApp(_sio, other_asgi_app=app)
except Exception:
    socket_app = app  # fallback for testing without Redis


# ─── Global exception handlers ────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    if settings.DEBUG:
        raise exc
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

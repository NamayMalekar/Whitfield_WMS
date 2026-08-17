"""Whitfield Fulfillment WMS - FastAPI entry point."""
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from commons.logger.logger import configure_logging, get_logger
from core.apis.routes import (
    ai_routes,
    audit_routes,
    auth_routes,
    inventory_routes,
    order_routes,
    scripting_routes,
    voice_routes,
)
from core.database.init_db import initialise
from core.database.models import ImmutableRecordError
from core.utils.config import settings
from core.utils.errors import WMSError

configure_logging("DEBUG" if settings.DEBUG else "INFO")
logger = get_logger("whitfield.wms")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("startup", extra={"environment": settings.ENVIRONMENT, "database": settings.DATABASE_URL.split("://")[0]})
    initialise()
    yield
    logger.info("shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "Multi-warehouse WMS for Whitfield Fulfillment (Reno, NV and Columbus, OH). "
        "Atomic stock movements, role-based access, hash-chained audit log, voice receiving, "
        "routine integrity checks and an SOP assistant."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Attach a request id and log latency for every call."""
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(WMSError)
async def wms_error_handler(request: Request, exc: WMSError):
    logger.warning("domain_error", extra={"path": request.url.path, "code": exc.code, "reason": exc.message})
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code, "context": exc.context},
    )


@app.exception_handler(ImmutableRecordError)
async def immutable_handler(request: Request, exc: ImmutableRecordError):
    logger.error("immutability_violation", extra={"path": request.url.path, "reason": str(exc)})
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": str(exc), "code": "immutable_record"},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(part) for part in first.get("loc", [])[1:]) or "request"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": f"{field}: {first.get('msg', 'is not valid')}",
            "code": "validation_error",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error", extra={"path": request.url.path})
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Something went wrong on our side. The error was logged with a request id.",
            "code": "internal_error",
        },
    )


API_PREFIX = "/api"
for router in (
    auth_routes.router,
    inventory_routes.router,
    order_routes.router,
    voice_routes.router,
    scripting_routes.router,
    ai_routes.router,
    audit_routes.router,
):
    app.include_router(router, prefix=API_PREFIX)


@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "warehouses": settings.warehouse_names,
        "assistant_mode": "llm" if settings.AI_API_KEY else "offline",
    }


@app.get("/", include_in_schema=False)
def root():
    return {"service": settings.APP_NAME, "docs": "/docs", "health": "/health"}

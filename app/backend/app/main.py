from __future__ import annotations

import json
import logging
from typing import Any, Dict

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth import router as auth_router
from app.db.models import SavedRecipe as DBSavedRecipe
from app.db.models import User as DBUser
from app.db.session import create_db as _create_db
from app.db.session import get_db

# Use absolute package imports within the backend package so the module can be
# executed reliably whether started via `uvicorn app.main:app` or as part of a larger project.
from app.models import ErrorResponse, Recipe, RecipeRequest
from app.services import (
    generate_recipe_from_ingredients,
    get_empty_recipes,
)

app = FastAPI(title="Recipe Generator Backend", version="0.1.0")

# Basic logging setup: prefer the uvicorn logger when running under uvicorn, otherwise fall back to module logger.
logging.basicConfig(level=logging.INFO)
_uvicorn_logger = logging.getLogger("uvicorn.error")
logger = _uvicorn_logger if _uvicorn_logger.handlers else logging.getLogger(__name__)

# Mount auth router so token endpoints (e.g. /auth/token) appear in OpenAPI/docs
app.include_router(auth_router)


# Middleware: copy cookie auth token into Authorization header (so existing
# oauth2 Depends continue to work) and redirect unauthenticated HTML GET
# navigations to protected frontend pages (e.g. /profile) to /login.
async def auth_cookie_middleware(request: Request, call_next):
    """
    Behavior:
    - If Authorization header is already present do nothing.
    - Else if a cookie named 'access_token' or 'recipe_access_token' exists,
      inject an Authorization: Bearer <token> header into the request scope.
    - If the request is an HTML GET navigation to a protected path (currently '/profile')
      and there is no Authorization header after possible injection, redirect to /login.
    """
    try:
        headers = request.scope.get("headers", [])  # list[tuple[bytes, bytes]]
        has_auth = any(h[0].lower() == b"authorization" for h in headers)

        token_from_cookie = None
        if not has_auth:
            for cookie_name in ("access_token", "recipe_access_token"):
                if cookie_name in request.cookies:
                    token_from_cookie = request.cookies.get(cookie_name)
                    if token_from_cookie:
                        break

        if token_from_cookie and not has_auth:
            auth_val = f"Bearer {token_from_cookie}".encode()
            new_headers = list(headers)
            # Prepend so it takes precedence
            new_headers.insert(0, (b"authorization", auth_val))
            request.scope["headers"] = new_headers

        # After injection, check again whether Authorization is present
        headers_after = request.scope.get("headers", [])
        has_auth_after = any(h[0].lower() == b"authorization" for h in headers_after)

        # Redirect HTML navigations to protected frontend pages when unauthenticated.
        accept = request.headers.get("accept", "")
        is_html_nav = "text/html" in accept and request.method.upper() == "GET"
        protected_paths = ("/profile",)

        if (
            is_html_nav
            and any(request.url.path.startswith(p) for p in protected_paths)
            and not has_auth_after
        ):
            # Browser navigation to protected path without auth -> redirect to frontend login
            return RedirectResponse(url="/login")

        return await call_next(request)
    except Exception as exc:
        # Fail-safe: log and continue to let the request proceed; avoid blocking app.
        logger.exception("auth_cookie_middleware error: %s", exc)
        return await call_next(request)


# Register middleware early
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_cookie_middleware)


# Helper to coerce various detail shapes into a structured { message, code?, ... } dict.
def _coerce_detail_to_object(detail: Any) -> Dict[str, Any]:
    """
    Accepts:
      - dict-like detail (returned by our HTTPException raises)
      - string detail (either plain text or JSON serialized object)
      - other shapes

    Returns a dict with at minimum {"message": "<string>"} and preserves any
    `code` field when present.
    """
    if detail is None:
        return {"message": ""}

    # If already a dict-like object, copy and ensure 'message' key exists.
    if isinstance(detail, dict):
        out = dict(detail)  # shallow copy
        # Normalize: ensure message is a string
        msg = out.get("message") or out.get("detail") or out.get("error")
        out["message"] = str(msg) if msg is not None else ""
        # Keep code if present (may be None)
        if "code" in out:
            out["code"] = out.get("code")
        return out

    # If it's a string, try to parse as JSON (some code paths may stringify objects).
    if isinstance(detail, str):
        # Try JSON parse to recover structured object
        try:
            parsed = json.loads(detail)
            if isinstance(parsed, dict):
                out = parsed
                msg = out.get("message") or out.get("detail") or out.get("error")
                out["message"] = str(msg) if msg is not None else ""
                if "code" in out:
                    out["code"] = out.get("code")
                return out
        except Exception:
            # not JSON — fallthrough to plain string handling
            pass
        return {"message": detail}

    # For other types, attempt string conversion
    try:
        return {"message": str(detail)}
    except Exception:
        return {"message": "An error occurred"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Normalize FastAPI/Pydantic request validation errors into a consistent
    JSON object shape: { message: "<summary>", code: "validation_error", errors: [...] }
    """
    # Log detailed validation errors for debugging
    logger.debug(
        "Request validation error on %s %s: %s",
        request.method,
        request.url,
        exc.errors(),
    )

    # Build a short summary message from the validation errors
    try:
        parts = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e.get("loc", []))
            msg = e.get("msg", "")
            parts.append(f"{loc}: {msg}" if loc else msg)
        message = "; ".join(parts) if parts else "Invalid request"
    except Exception:
        message = "Invalid request"

    return JSONResponse(
        status_code=422,
        content={
            "message": message,
            "code": "validation_error",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Normalize HTTPException responses to always return a structured JSON object.
    - If exc.detail is already structured (dict) we return it (ensuring 'message').
    - If exc.detail is a string that contains JSON we try to parse it.
    - Otherwise we return { "message": str(detail) }.

    Additionally: ensure 401 responses include a consistent `code` value so
    clients/tests that expect structured auth errors receive `code: "invalid_credentials"`.
    We only add this when the handler detail does not already include a `code`.
    """
    try:
        detail_obj = _coerce_detail_to_object(exc.detail)
    except Exception as e:
        logger.exception("Failed to coerce HTTPException detail: %s", e)
        detail_obj = {"message": "An error occurred"}

    # Normalize 401 Unauthorized details when code is missing so callers receive a
    # consistent shaped error payload. Do not override an explicit `code`.
    try:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            # If the detail did not include a code, provide the standard auth code.
            if not detail_obj.get("code"):
                detail_obj["code"] = "invalid_credentials"
            # Prefer the clearer credentials message when the original is generic.
            if (
                not detail_obj.get("message")
                or detail_obj.get("message") == "Not authenticated"
            ):
                detail_obj["message"] = "Could not validate credentials"
    except Exception:
        # Keep original detail if normalization fails for any reason.
        pass

    # Log the issue with the normalized message (don't log sensitive details in production)
    logger.warning(
        "HTTPException raised: status=%s message=%s path=%s",
        exc.status_code,
        detail_obj.get("message"),
        request.url.path,
    )

    # Return exactly the structured payload (status preserved).
    return JSONResponse(status_code=exc.status_code, content=detail_obj)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler: log the full traceback server-side but return a safe,
    consistent message to the client in the { "message": ... } shape.
    """
    logger.error("Unhandled exception at %s: %s", request.url.path, exc, exc_info=exc)
    # Do not include traceback in the response to avoid leaking internals.
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error", "code": "internal_error"},
    )


# Enable CORS for local frontend development (Vite dev server)
# Adjust or restrict origins as needed for production.
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=dict)
async def root() -> dict:
    """Simple health/smoke endpoint."""
    return {"status": "ok", "service": "recipe-backend"}


@app.get("/recipes", response_model=list[Recipe])
async def list_recipes() -> list[Recipe]:
    """Return an empty recipe list (placeholder)."""
    return get_empty_recipes()


@app.post("/admin/db/create", status_code=status.HTTP_201_CREATED)
def create_database() -> dict:
    """Create database tables (development helper)."""
    _create_db()
    return {"detail": "database tables created"}


@app.post(
    "/recipes/generate",
    response_model=Recipe,
    responses={400: {"model": ErrorResponse}},
)
async def generate_recipe(request: RecipeRequest) -> Recipe:
    """Generate a recipe from ingredients."""
    try:
        return generate_recipe_from_ingredients(request.ingredients)
    except ValueError as exc:  # invalid / empty input
        # Return structured error
        raise HTTPException(
            status_code=400, detail={"message": str(exc), "code": "invalid_input"}
        ) from exc


@app.post("/user/saved-recipes", status_code=status.HTTP_201_CREATED)
async def save_recipe_endpoint(
    recipe: Recipe, username: str = "demo", db: Session = Depends(get_db)
):
    """
    Save a generated recipe for a user.

    - Body: Recipe (title, ingredients, steps)
    - Query param: username (defaults to 'demo' for local development)
    - Returns: { id: <saved id>, savedAt: <iso timestamp> }
    """
    # Find or create the user (development convenience behavior)
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None:
        # create a minimal user record for local development
        user = DBUser(
            username=username,
            email=f"{username}@example.local",
            password_hash="",  # no auth in MVP; store empty hash for demo
            full_name=None,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Serialize recipe to a JSON-compatible dict
    recipe_data = recipe.model_dump()
    title = recipe_data.get("title") or recipe_data.get("name") or "Saved recipe"

    # Create DB saved recipe record
    saved = DBSavedRecipe(user_id=user.id, title=title, recipe_data=recipe_data)
    db.add(saved)
    db.commit()
    db.refresh(saved)

    # Persist the DB-assigned id into the stored recipe JSON so subsequent reads
    # include the saved id inside the recipe object itself.
    try:
        # Ensure recipe_data is a dict and add id
        if isinstance(recipe_data, dict):
            recipe_data["id"] = saved.id
            saved.recipe_data = recipe_data
            db.add(saved)
            db.commit()
            db.refresh(saved)
    except Exception:
        # Do not fail the save response if updating the JSON fails; log in real app.
        logger.exception("Failed to persist id into saved.recipe_data")

    return JSONResponse(
        status_code=201,
        content={"id": saved.id, "savedAt": saved.created_at.isoformat()},
    )


@app.get("/user/saved-recipes", response_model=list[Recipe])
async def get_saved_recipes_endpoint(
    username: str = "demo", db: Session = Depends(get_db)
) -> list[Recipe]:
    """Return saved recipes for a user (development).

    Behavior notes:
    - For local development we ensure a demo user exists. If no saved recipes are
      present for that user we create a sensible default saved-recipe so the
      frontend and tests can rely on at least one example item.
    """
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None:
        # Create a minimal demo user for local development
        user = DBUser(
            username=username,
            email=f"{username}@example.local",
            password_hash="",  # no auth in MVP; store empty hash for demo
            full_name=None,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    saved_items = (
        db.query(DBSavedRecipe)
        .filter(DBSavedRecipe.user_id == user.id)
        .order_by(DBSavedRecipe.created_at.desc())
        .all()
    )

    # If the user exists but has no saved recipes, return empty list (frontend may add a demo item)
    result = []
    for item in saved_items:
        # Make a shallow copy of the stored recipe_data so we can safely ensure
        # the returned object includes the database id without mutating DB state.
        rd = item.recipe_data
        if isinstance(rd, dict):
            rd = dict(rd)
            if "id" not in rd:
                rd["id"] = item.id
        result.append(rd)
        logger.info("saved recipe: %s", rd)
    return result


@app.get("/user/saved-recipes/{saved_id}", response_model=Recipe)
async def get_saved_recipe_endpoint(
    saved_id: str, username: str = "demo", db: Session = Depends(get_db)
) -> Recipe:
    """
    Return a single saved recipe by its id for the given user.

    - Path param: saved_id (string UUID)
    - Query param: username (defaults to 'demo' for local development)
    - Returns: Recipe JSON (same shape as GET /user/saved-recipes items)
    """
    # Ensure user existence (same dev convenience behavior as other endpoints)
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "User not found", "code": "not_found"},
        )

    saved = (
        db.query(DBSavedRecipe)
        .filter(DBSavedRecipe.id == saved_id, DBSavedRecipe.user_id == user.id)
        .first()
    )

    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Saved recipe not found", "code": "not_found"},
        )

    rd = saved.recipe_data
    if isinstance(rd, dict):
        rd = dict(rd)
        if "id" not in rd:
            rd["id"] = saved.id

    # Validate and return a Pydantic `Recipe` instance so FastAPI returns
    # a properly typed response (and any validation issues surface here).
    try:
        # Use model_validate if available (pydantic v2); fall back to constructing Recipe if rd is None
        recipe_obj = Recipe.model_validate(rd) if rd is not None else Recipe(**rd)
        return recipe_obj
    except ValidationError as ve:
        logger.exception("Saved recipe failed validation: %s", ve)
        # Return a 500 with structured detail so clients receive consistent shape
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Saved recipe data is invalid",
                "code": "invalid_saved_data",
                "errors": ve.errors(),
            },
        )


@app.delete("/user/saved-recipes/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_recipe_endpoint(
    saved_id: str, username: str = "demo", db: Session = Depends(get_db)
):
    """
    Delete a saved recipe by id for the given user.

    - Path param: saved_id (string UUID)
    - Query param: username (defaults to 'demo' for local development)
    - Returns: 204 No Content on success, 404 if not found.
    """
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "User not found", "code": "not_found"},
        )

    saved = (
        db.query(DBSavedRecipe)
        .filter(DBSavedRecipe.id == saved_id, DBSavedRecipe.user_id == user.id)
        .first()
    )

    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Saved recipe not found", "code": "not_found"},
        )

    db.delete(saved)
    db.commit()

    return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content={})

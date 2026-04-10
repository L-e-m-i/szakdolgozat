from __future__ import annotations

import os
import re
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import RefreshToken as DBRefreshToken
from app.db.models import User as DBUser
from app.db.session import get_db

# Load .env from backend root if present
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
# How long refresh tokens are valid (in days). Adjust as needed.
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "recipe_access_token")
REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "recipe_refresh_token")
COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN") or None
_default_cookie_secure = (
    os.getenv("ENVIRONMENT", "development").lower() == "production"
)
COOKIE_SECURE = os.getenv(
    "AUTH_COOKIE_SECURE", "1" if _default_cookie_secure else "0"
) in ("1", "true", "True", "yes", "YES")
# Use 'strict' for CSRF protection in production, 'lax' for easier local dev
COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "strict" if _default_cookie_secure else "lax")

LOGIN_LIMIT_COUNT = int(os.getenv("RATE_LIMIT_LOGIN_COUNT", "20"))
LOGIN_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_LOGIN_WINDOW_SECONDS", "60"))
SIGNUP_LIMIT_COUNT = int(os.getenv("RATE_LIMIT_SIGNUP_COUNT", "20"))
SIGNUP_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_SIGNUP_WINDOW_SECONDS", "300"))
REFRESH_LIMIT_COUNT = int(os.getenv("RATE_LIMIT_REFRESH_COUNT", "40"))
REFRESH_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_REFRESH_WINDOW_SECONDS", "60"))

password_hash = PasswordHash.recommended()


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Validate password strength according to security requirements.
    
    Requirements (Option A):
    - Minimum 8 characters
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 number
    
    Returns:
        Tuple of (is_valid, error_message)
        If valid: (True, "")
        If invalid: (False, "descriptive error message")
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    return True, ""

# OAuth2 scheme: token endpoint will be /auth/token (router prefix below provides /auth)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

router = APIRouter(prefix="/auth", tags=["auth"])

_rate_limit_events: dict[str, deque[float]] = defaultdict(deque)
_rate_limit_lock = threading.Lock()


# --- Pydantic models exposed by the router ---------------------------------
class Token(BaseModel):
    access_token: str
    token_type: str
    # Optional refresh token returned when applicable (server stores & validates these)
    refresh_token: Optional[str] = None
    # Access token lifetime in seconds (client convenience)
    expires_in: Optional[int] = None


class TokenData(BaseModel):
    username: Optional[str] = None


class User(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    disabled: Optional[bool] = False


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None


class UserInDB(User):
    hashed_password: str


def _rate_limit_or_raise(request: Request, scope: str, limit: int, window_seconds: int) -> None:
    """Simple in-memory sliding-window limiter by client IP and scope."""
    client_ip = request.client.host if request.client and request.client.host else "unknown"
    key = f"{scope}:{client_ip}"
    now = time.monotonic()
    cutoff = now - window_seconds

    with _rate_limit_lock:
        q = _rate_limit_events[key]
        while q and q[0] <= cutoff:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Too many requests. Please try again later.",
                    "code": "rate_limited",
                },
            )
        q.append(now)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set secure auth cookies so frontend JS does not need token access."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="none",
        partitioned=True,
        domain=COOKIE_DOMAIN,
        path="/",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="none",
        partitioned=True,
        domain=COOKIE_DOMAIN,
        path="/auth",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    """
    Clear auth cookies with parameters that exactly match _set_auth_cookies().

    We set max_age=0 and expires to a past date to force immediate expiration.
    The secure, samesite, domain, path, and partitioned parameters must match
    the set_cookie calls to ensure the browser correctly identifies and removes
    the cookies.
    """
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value="",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="none",
        partitioned=True,
        domain=COOKIE_DOMAIN,
        path="/",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value="",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="none",
        partitioned=True,
        domain=COOKIE_DOMAIN,
        path="/auth",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
    )


# --- Password helpers -----------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using the chosen scheme."""
    return password_hash.hash(password)


# --- DB-backed user helpers -----------------------------------------------
def get_user(db: Session, username_or_email: str) -> Optional[UserInDB]:
    """Load user from DB by username or email and return a Pydantic `UserInDB` or None."""
    # Support login by either username or email. This makes the login form flexible
    # (users can enter their username or email address).
    db_user = (
        db.query(DBUser)
        .filter(
            or_(
                DBUser.username == username_or_email,
                DBUser.email == username_or_email,
            )
        )
        .first()
    )
    if db_user is None:
        return None
    return UserInDB(
        username=db_user.username,
        email=db_user.email,
        full_name=db_user.full_name,
        # Map DB is_active -> Pydantic `disabled` (preserve existing semantics)
        disabled=not bool(getattr(db_user, "is_active", True)),
        hashed_password=db_user.password_hash,
    )


def authenticate_user(db: Session, username: str, password: str) -> Optional[UserInDB]:
    """Verify username/password against the DB user record."""
    user = get_user(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


# --- JWT token helpers ----------------------------------------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token with an expiration."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# --- Refresh token helpers & Dependencies for routes ----------------------
def _create_refresh_token_record(db: Session, db_user: DBUser) -> str:
    """
    Create a server-side refresh token record and return a client-facing token.

    The database stores only a hash of the secret part. The client receives a composite
    token in the form: <token_id>.<raw_secret>.
    """
    raw_secret = uuid.uuid4().hex
    token_hash = get_password_hash(raw_secret)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    rt = DBRefreshToken(
        user_id=db_user.id,
        token=token_hash,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(rt)
    db.commit()
    # refresh the instance so created_at / id are present
    db.refresh(rt)
    return f"{rt.id}.{raw_secret}"


def _split_refresh_token(token_str: str) -> tuple[str, str] | None:
    """Parse <token_id>.<raw_secret> format and return components."""
    if not token_str or "." not in token_str:
        return None
    token_id, raw_secret = token_str.split(".", 1)
    if not token_id or not raw_secret:
        return None
    return token_id, raw_secret


def _revoke_refresh_token(db: Session, token_str: str) -> None:
    """Mark a refresh token as revoked only when presented token is valid."""
    parts = _split_refresh_token(token_str)
    if not parts:
        return
    token_id, raw_secret = parts
    rt = db.query(DBRefreshToken).filter(DBRefreshToken.id == token_id).first()
    if rt and verify_password(raw_secret, rt.token):
        rt.revoked = True
        db.add(rt)
        db.commit()


def _validate_refresh_token(db: Session, token_str: str) -> Optional[DBRefreshToken]:
    """Return the refresh token DB record if valid (not revoked and not expired), else None."""
    parts = _split_refresh_token(token_str)
    if not parts:
        return None
    token_id, raw_secret = parts
    rt = db.query(DBRefreshToken).filter(DBRefreshToken.id == token_id).first()
    if not rt or rt.revoked:
        return None
    if rt.expires_at and rt.expires_at < datetime.now(timezone.utc):
        return None
    if not verify_password(raw_secret, rt.token):
        return None
    return rt


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Decode JWT and return the corresponding active user from the DB."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "message": "Could not validate credentials",
            "code": "invalid_credentials",
        },
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception

    if not token_data.username:
        raise credentials_exception

    user_in_db = get_user(db, username_or_email=token_data.username)
    if user_in_db is None:
        raise credentials_exception

    return User(
        username=user_in_db.username,
        email=user_in_db.email,
        full_name=user_in_db.full_name,
        disabled=user_in_db.disabled,
    )


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.disabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Inactive user", "code": "account_inactive"},
        )
    return current_user


# --- Routes ---------------------------------------------------------------
@router.post("/token", response_model=Token)
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Exchange username & password for an access token.

    Uses the database user table for authentication.
    """
    _rate_limit_or_raise(
        request,
        scope="auth:login",
        limit=LOGIN_LIMIT_COUNT,
        window_seconds=LOGIN_LIMIT_WINDOW_SECONDS,
    )

    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Incorrect username or password",
                "code": "invalid_credentials",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Make sure the DB user is active
    db_user = db.query(DBUser).filter(DBUser.username == user.username).first()
    if not db_user or not getattr(db_user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Account is disabled", "code": "account_disabled"},
        )

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # Create and persist a refresh token
    refresh_token_str = _create_refresh_token_record(db, db_user)

    _set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token_str)

    return Token(
        access_token=access_token,
        token_type="bearer",
        # Keep refresh token out of JSON responses; it is sent only via HttpOnly cookie.
        refresh_token=None,
        expires_in=int(access_token_expires.total_seconds()),
    )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    request: Request,
    response: Response,
    payload: dict | None = None,
    db: Session = Depends(get_db),
):
    """
    Exchange a valid refresh token for a new access token (and rotate the refresh token).
    Reads refresh token from payload or HttpOnly cookie.
    
    Uses optimistic token generation to prevent lockout if response is lost:
    1. Validate old token
    2. Create new tokens FIRST
    3. Then revoke old token
    This way if the response is lost, the client can retry with the old token.
    """
    _rate_limit_or_raise(
        request,
        scope="auth:refresh",
        limit=REFRESH_LIMIT_COUNT,
        window_seconds=REFRESH_LIMIT_WINDOW_SECONDS,
    )

    token_str = None
    if isinstance(payload, dict):
        token_str = payload.get("refresh_token")
    if not token_str:
        token_str = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Missing refresh_token",
                "code": "missing_refresh_token",
            },
        )

    rt_record = _validate_refresh_token(db, token_str)
    if not rt_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Invalid or expired refresh token",
                "code": "invalid_refresh_token",
            },
        )

    # Ensure user still active
    db_user = db.query(DBUser).filter(DBUser.id == rt_record.user_id).first()
    if not db_user or not getattr(db_user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Account disabled", "code": "account_disabled"},
        )

    # OPTIMISTIC APPROACH: Create new tokens BEFORE revoking old one
    # This prevents permanent lockout if the response is lost in transit
    new_refresh = _create_refresh_token_record(db, db_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": db_user.username}, expires_delta=access_token_expires
    )

    # Now revoke the old refresh token
    rt_record.revoked = True
    db.add(rt_record)
    db.commit()

    _set_auth_cookies(response, access_token=access_token, refresh_token=new_refresh)

    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=None,
        expires_in=int(access_token_expires.total_seconds()),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, payload: dict | None = None, db: Session = Depends(get_db)):
    """
    Revoke a refresh token (logout). Payload: { "refresh_token": "<token>" }
    """
    token_str = (payload or {}).get("refresh_token")
    if not token_str:
        token_str = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Missing refresh_token",
                "code": "missing_refresh_token",
            },
        )
    _revoke_refresh_token(db, token_str)
    _clear_auth_cookies(response)
    return None


@router.post("/signup", response_model=User, status_code=status.HTTP_201_CREATED)
async def signup(request: Request, user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.

    - This is a convenience endpoint for local development/demo.
    - In production you should add email verification, rate-limiting and stronger validation.
    """
    _rate_limit_or_raise(
        request,
        scope="auth:signup",
        limit=SIGNUP_LIMIT_COUNT,
        window_seconds=SIGNUP_LIMIT_WINDOW_SECONDS,
    )

    # Validate password strength
    is_valid, error_msg = validate_password_strength(user_in.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": error_msg, "code": "weak_password"},
        )

    existing = db.query(DBUser).filter(DBUser.username == user_in.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Username already exists", "code": "username_exists"},
        )

    existing_email = db.query(DBUser).filter(DBUser.email == user_in.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Email already registered", "code": "email_exists"},
        )

    hashed = get_password_hash(user_in.password)
    db_user = DBUser(
        username=user_in.username,
        email=user_in.email,
        password_hash=hashed,
        full_name=user_in.full_name,
        is_active=True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return User(
        username=db_user.username,
        email=db_user.email,
        full_name=db_user.full_name,
        disabled=not bool(getattr(db_user, "is_active", True)),
    )


@router.get("/users/me/", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    """Return the currently authenticated user (from DB)."""
    return current_user


@router.get("/users/me/items/")
async def read_own_items(current_user: User = Depends(get_current_active_user)):
    """Example protected endpoint that returns items owned by the user."""
    return [{"item_id": "Foo", "owner": current_user.username}]

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
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

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "change-me-local",
)
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
# How long refresh tokens are valid (in days). Adjust as needed.
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

password_hash = PasswordHash.recommended()

# OAuth2 scheme: token endpoint will be /auth/token (router prefix below provides /auth)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

router = APIRouter(prefix="/auth", tags=["auth"])


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
    Create a server-side refresh token record and return the raw token string.
    We store the token as-is here for simplicity; in production you should store a hashed
    value and only return the plaintext token to the client once.
    """
    token_str = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    rt = DBRefreshToken(
        user_id=db_user.id,
        token=token_str,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(rt)
    db.commit()
    # refresh the instance so created_at / id are present
    db.refresh(rt)
    return token_str


def _revoke_refresh_token(db: Session, token_str: str) -> None:
    """Mark a refresh token as revoked (if it exists)."""
    rt = db.query(DBRefreshToken).filter(DBRefreshToken.token == token_str).first()
    if rt:
        rt.revoked = True
        db.add(rt)
        db.commit()


def _validate_refresh_token(db: Session, token_str: str) -> Optional[DBRefreshToken]:
    """Return the refresh token DB record if valid (not revoked and not expired), else None."""
    rt = db.query(DBRefreshToken).filter(DBRefreshToken.token == token_str).first()
    if not rt or rt.revoked:
        return None
    if rt.expires_at and rt.expires_at < datetime.now(timezone.utc):
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
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """
    Exchange username & password for an access token.

    Uses the database user table for authentication.
    """
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

    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=refresh_token_str,
        expires_in=int(access_token_expires.total_seconds()),
    )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(payload: dict, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access token (and rotate the refresh token).
    Payload expected: { "refresh_token": "<token>" }
    """
    token_str = payload.get("refresh_token") if isinstance(payload, dict) else None
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

    # Revoke the old refresh token and issue a new one (rotation)
    rt_record.revoked = True
    db.add(rt_record)
    db.commit()

    new_refresh = _create_refresh_token_record(db, db_user)

    # Issue new access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": db_user.username}, expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=new_refresh,
        expires_in=int(access_token_expires.total_seconds()),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: dict, db: Session = Depends(get_db)):
    """
    Revoke a refresh token (logout). Payload: { "refresh_token": "<token>" }
    """
    token_str = payload.get("refresh_token") if isinstance(payload, dict) else None
    if token_str:
        _revoke_refresh_token(db, token_str)
    return None


@router.post("/signup", response_model=User, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.

    - This is a convenience endpoint for local development/demo.
    - In production you should add email verification, rate-limiting and stronger validation.
    """
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

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

Base = declarative_base()


class User(Base):
    """
    User account model.

    - id: primary key
    - username: human-friendly unique username
    - email: unique email address
    - password_hash: hashed password (store hashes only)
    - created_at: account creation timestamp
    - saved_recipes: relationship to SavedRecipe
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    # Use mapped_column for proper SQLAlchemy typing
    from sqlalchemy.orm import mapped_column  # type: ignore

    # Store UUIDs as 36-char strings (hex with hyphens). A callable default generates a UUIDv4
    # on object creation when the DB does not provide a server-side default.
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(
        String(80), nullable=False, unique=True, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Active flag: whether the user account is enabled. Defaults to True.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )

    # Relationship: one user -> many saved recipes
    saved_recipes: Mapped[List["SavedRecipe"]] = relationship(
        "SavedRecipe",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    # Relationship: one user -> many refresh tokens (for session management / token revocation)
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "is_active": bool(self.is_active),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} email={self.email!r}>"


class SavedRecipe(Base):
    """
    Saved recipe model.

    Stores the recipe JSON returned by the generator so it can be shown later.
    Fields:
    - id: primary key
    - user_id: FK to `users.id`
    - title: recipe title (human readable)
    - recipe_data: JSON blob with the full recipe (ingredients, steps, etc.)
    - notes: optional user-supplied notes
    - created_at: when the recipe was saved
    """

    __tablename__ = "saved_recipes"
    __table_args__ = (UniqueConstraint("id", name="pk_saved_recipes"),)

    # Use UUID string ids for saved recipes
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Basic searchable fields
    title: Mapped[Optional[str]] = mapped_column(String(300), nullable=True, index=True)

    # Use the generic SQLAlchemy JSON type for portability.
    # On PostgreSQL this will map to JSONB when the dialect supports it; on SQLite it
    # will use a JSON-compatible storage (text) and SQLAlchemy will handle serialization.
    recipe_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship back to owner
    owner: Mapped["User"] = relationship(
        "User", back_populates="saved_recipes", lazy="joined"
    )

    def to_dict(self) -> Dict[str, Any]:
        # Return a serializable representation of the saved recipe
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "recipe_data": self.recipe_data,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<SavedRecipe id={self.id} title={self.title!r} user_id={self.user_id}>"


class RefreshToken(Base):
    """
    Refresh token model.

    Stores refresh tokens tied to a user so tokens can be revoked or rotated.
    Fields:
    - id: primary key
    - user_id: FK to `users.id`
    - token: the refresh token string (should be stored hashed in production)
    - expires_at: when the refresh token expires
    - revoked: whether the token has been revoked
    - created_at: when the token was issued
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_refresh_tokens_token"),)

    # Use UUID strings for token ids and user relationship
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    token: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship back to user
    user: Mapped["User"] = relationship(
        "User", back_populates="refresh_tokens", lazy="joined"
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked": bool(self.revoked),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f"<RefreshToken id={self.id} user_id={self.user_id} revoked={self.revoked}>"
        )

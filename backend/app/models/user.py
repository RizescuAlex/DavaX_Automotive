from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    # Firebase UID — NULL for email/password users
    firebase_uid: Mapped[str | None] = mapped_column(
        String(128), unique=True, nullable=True, index=True
    )
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(Text)

    # Email/password auth
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # "google" | "email" | "both"
    auth_provider: Mapped[str] = mapped_column(String(20), default="google")

    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    onboarding_profile = relationship(
        "OnboardingProfile",
        back_populates="user",
        uselist=False,
    )
    preferences = relationship(
        "UserPreference",
        back_populates="user",
    )
    vehicle_settings = relationship(
        "VehicleSettings",
        back_populates="user",
    )
    frequented_locations = relationship(
        "FrequentedLocation",
        back_populates="user",
    )
    vehicle = relationship(
        "Vehicle",
        back_populates="user",
        uselist=False,
    )

    # Call relationships
    outgoing_calls = relationship(
        "CallSession",
        foreign_keys="CallSession.caller_id",
        back_populates="caller",
    )
    incoming_calls = relationship(
        "CallSession",
        foreign_keys="CallSession.callee_id",
        back_populates="callee",
    )
    contacts = relationship(
        "UserContact",
        foreign_keys="UserContact.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    added_by = relationship(
        "UserContact",
        foreign_keys="UserContact.contact_user_id",
        back_populates="contact_user",
        cascade="all, delete-orphan",
    )

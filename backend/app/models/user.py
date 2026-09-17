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
    onboarding_profile = relationship("OnboardingProfile", back_populates="user", uselist=False)
    preferences = relationship("UserPreference", back_populates="user")
    vehicle_settings = relationship("VehicleSettings", back_populates="user")
    frequented_locations = relationship("FrequentedLocation", back_populates="user")

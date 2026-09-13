from sqlalchemy import Boolean, CheckConstraint, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OnboardingProfile(Base):
    __tablename__ = "onboarding_profiles"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    fastest_arrival: Mapped[int] = mapped_column(SmallInteger, default=5)
    lowest_cost: Mapped[int] = mapped_column(SmallInteger, default=5)
    scenic_routes: Mapped[int] = mapped_column(SmallInteger, default=3)
    family_friendly: Mapped[int] = mapped_column(SmallInteger, default=3)
    avoid_tolls: Mapped[bool] = mapped_column(Boolean, default=False)
    avoid_highways: Mapped[bool] = mapped_column(Boolean, default=False)
    preferred_fuel_type: Mapped[str | None] = mapped_column(String(20))

    # Constraints
    __table_args__ = (
        CheckConstraint("fastest_arrival BETWEEN 0 AND 10", name="ck_fastest_arrival_range"),
        CheckConstraint("lowest_cost BETWEEN 0 AND 10", name="ck_lowest_cost_range"),
        CheckConstraint("scenic_routes BETWEEN 0 AND 10", name="ck_scenic_routes_range"),
        CheckConstraint("family_friendly BETWEEN 0 AND 10", name="ck_family_friendly_range"),
    )

    # Relationships
    user = relationship("User", back_populates="onboarding_profile")

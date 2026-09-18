from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VehicleSettings(Base):
    __tablename__ = "vehicle_settings"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    profile_name: Mapped[str] = mapped_column(String(50), default="default")
    seat_position: Mapped[dict | None] = mapped_column(JSONB)
    mirror_left: Mapped[dict | None] = mapped_column(JSONB)
    mirror_right: Mapped[dict | None] = mapped_column(JSONB)
    steering_position: Mapped[dict | None] = mapped_column(JSONB)
    climate_settings: Mapped[dict | None] = mapped_column(JSONB)
    lighting_settings: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        UniqueConstraint("user_id", "profile_name", name="uq_vehicle_user_profile"),
    )

    # Relationships
    user = relationship("User", back_populates="vehicle_settings")

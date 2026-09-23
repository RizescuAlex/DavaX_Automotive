from sqlalchemy import ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    model_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    make: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    selected_trim_id: Mapped[int | None] = mapped_column(nullable=True)
    selected_trim_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fuel_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_vehicle_user"),
    )

    user = relationship("User", back_populates="vehicle")
    fuel_specs = relationship(
        "VehicleFuelSpec",
        back_populates="vehicle",
        cascade="all, delete-orphan",
        order_by="VehicleFuelSpec.trim_id",
    )

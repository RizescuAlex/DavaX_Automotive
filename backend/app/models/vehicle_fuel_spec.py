from datetime import datetime
from decimal import Decimal
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VehicleFuelSpec(Base):
    __tablename__ = "vehicle_fuel_specs"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )
    car_api_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submodel_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trim_id: Mapped[int] = mapped_column(Integer, nullable=False)
    submodel: Mapped[str | None] = mapped_column(String(150), nullable=True)
    trim: Mapped[str | None] = mapped_column(String(150), nullable=True)
    trim_description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # CarAPI returns these as strings in some responses; persist normalized numbers.
    fuel_tank_capacity_gal: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    combined_mpg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    city_mpg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    highway_mpg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    range_city_miles: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    range_highway_miles: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="carapi")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("vehicle_id", "trim_id", name="uq_vehicle_fuel_spec_trim"),
    )

    vehicle = relationship("Vehicle", back_populates="fuel_specs")

"""
Trip model for storing route proposals, user selections, and final routes.
Essential for the learning layer and feedback loop.
"""

from datetime import datetime

from sqlalchemy import ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime
from app.models.base import Base


class Trip(Base):
    __tablename__ = "trips"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    # Origin and destination basic info
    origin: Mapped[dict] = mapped_column(JSONB, nullable=False)
    destination: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    # The routes we proposed to the user, including their scores and explanations
    proposed_routes: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    
    # The index of the route the user selected from the proposed list
    selected_index: Mapped[int | None] = mapped_column(SmallInteger)
    
    # The final route definition after the user accepts (includes stops/waypoints)
    final_route: Mapped[dict | None] = mapped_column(JSONB)
    
    fuel_input: Mapped[int | None] = mapped_column(SmallInteger)
    
    # "proposed", "confirmed", "completed", "cancelled"
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    user = relationship("User")

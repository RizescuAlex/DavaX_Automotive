import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserContact(Base):
    __tablename__ = "user_contacts"
    __table_args__ = (
        UniqueConstraint("user_id", "contact_user_id", name="uq_user_contact"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    contact_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    user = relationship("User", foreign_keys=[user_id], back_populates="contacts")
    contact_user = relationship(
        "User", foreign_keys=[contact_user_id], back_populates="added_by"
    )

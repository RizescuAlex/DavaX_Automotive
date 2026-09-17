import uuid
from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    display_name: str | None
    avatar_url: str | None
    onboarding_completed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None

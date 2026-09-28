import uuid
from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    username: str
    display_name: str | None
    avatar_url: str | None
    onboarding_completed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None


class ContactOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None
    display_name: str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class ContactCreate(BaseModel):
    username: str
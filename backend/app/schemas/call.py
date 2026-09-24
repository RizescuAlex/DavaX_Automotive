import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


class CallCreate(BaseModel):
    callee_email: EmailStr


class CallResponse(BaseModel):
    action: Literal["accept", "decline"]


class CallOut(BaseModel):
    id: uuid.UUID
    caller_id: uuid.UUID
    callee_id: uuid.UUID
    caller_name: str | None
    callee_name: str | None
    status: str
    room_name: str
    created_at: datetime
    answered_at: datetime | None
    ended_at: datetime | None


class CallTokenOut(BaseModel):
    token: str
    url: str
    room_name: str

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.auth import _get_user_from_token
from app.config import settings
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.call import CallSession
from app.models.contact import UserContact
from app.models.user import User
from app.schemas.call import CallCreate, CallOut, CallResponse, CallTokenOut
from app.services.calling import create_livekit_token, create_room_name

router = APIRouter()


def serialize_call(call: CallSession) -> CallOut:
    return CallOut(
        id=call.id,
        caller_id=call.caller_id,
        callee_id=call.callee_id,
        caller_name=call.caller.username if call.caller else None,
        callee_name=call.callee.username if call.callee else None,
        status=call.status,
        room_name=call.room_name,
        created_at=call.created_at,
        answered_at=call.answered_at,
        ended_at=call.ended_at,
    )


async def current_user(token: dict, db: AsyncSession) -> User:
    return await _get_user_from_token(token, db)


@router.post("", response_model=CallOut, status_code=status.HTTP_201_CREATED)
async def create_call(
    body: CallCreate,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    caller = await current_user(token, db)
    result = await db.execute(select(User).where(User.username == body.callee_username.strip().lower()))
    callee = result.scalar_one_or_none()

    if callee is None:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if callee.id == caller.id:
        raise HTTPException(status_code=400, detail="You cannot call yourself")

    contact_result = await db.execute(
        select(UserContact).where(
            UserContact.user_id == caller.id,
            UserContact.contact_user_id == callee.id,
        )
    )
    if contact_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="You can only call users in your contacts")

    active = await db.execute(
        select(CallSession).where(
            CallSession.status.in_(["ringing", "accepted"]),
            or_(
                CallSession.caller_id.in_([caller.id, callee.id]),
                CallSession.callee_id.in_([caller.id, callee.id]),
            ),
        )
    )
    if active.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="One of the users is already in a call")

    call = CallSession(
        caller_id=caller.id,
        callee_id=callee.id,
        room_name=create_room_name(),
        status="ringing",
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)
    call.caller = caller
    call.callee = callee
    return serialize_call(call)


@router.get("/current", response_model=CallOut | None)
async def get_current_call(
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await current_user(token, db)
    result = await db.execute(
        select(CallSession)
        .options(selectinload(CallSession.caller), selectinload(CallSession.callee))
        .where(
            CallSession.status.in_(["ringing", "accepted"]),
            or_(CallSession.caller_id == user.id, CallSession.callee_id == user.id),
        )
        .order_by(CallSession.created_at.desc())
        .limit(1)
    )
    call = result.scalar_one_or_none()
    return serialize_call(call) if call else None


@router.post("/{call_id}/respond", response_model=CallOut)
async def respond_to_call(
    call_id: uuid.UUID,
    body: CallResponse,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await current_user(token, db)
    result = await db.execute(
        select(CallSession)
        .options(selectinload(CallSession.caller), selectinload(CallSession.callee))
        .where(CallSession.id == call_id)
    )
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.callee_id != user.id or call.status != "ringing":
        raise HTTPException(status_code=409, detail="Call cannot be responded to")

    now = datetime.now(timezone.utc)
    if body.action == "accept":
        call.status = "accepted"
        call.answered_at = now
    else:
        call.status = "declined"
        call.ended_at = now

    await db.commit()
    await db.refresh(call)
    return serialize_call(call)


@router.post("/{call_id}/end", response_model=CallOut)
async def end_call(
    call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await current_user(token, db)
    result = await db.execute(
        select(CallSession)
        .options(selectinload(CallSession.caller), selectinload(CallSession.callee))
        .where(CallSession.id == call_id)
    )
    call = result.scalar_one_or_none()
    if call is None or user.id not in (call.caller_id, call.callee_id):
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = "ended"
    call.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(call)
    return serialize_call(call)


@router.post("/{call_id}/token", response_model=CallTokenOut)
async def get_call_token(
    call_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await current_user(token, db)
    result = await db.execute(
        select(CallSession)
        .options(selectinload(CallSession.caller), selectinload(CallSession.callee))
        .where(CallSession.id == call_id)
    )
    call = result.scalar_one_or_none()
    if call is None or user.id not in (call.caller_id, call.callee_id):
        raise HTTPException(status_code=404, detail="Call not found")
    if call.status != "accepted":
        raise HTTPException(status_code=409, detail="Call has not been accepted")

    try:
        livekit_token = create_livekit_token(identity=str(user.id), room_name=call.room_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return CallTokenOut(token=livekit_token, url=settings.LIVEKIT_URL, room_name=call.room_name)


@router.post("/current/gesture", response_model=CallOut)
async def respond_to_call_by_gesture(
    body: CallResponse,
    x_gesture_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not settings.GESTURE_BRIDGE_TOKEN or x_gesture_token != settings.GESTURE_BRIDGE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid gesture bridge token")

    result = await db.execute(
        select(CallSession)
        .options(selectinload(CallSession.caller), selectinload(CallSession.callee))
        .where(CallSession.status == "ringing")
        .order_by(CallSession.created_at.desc())
        .limit(1)
    )
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="No incoming call")

    now = datetime.now(timezone.utc)
    if body.action == "accept":
        call.status = "accepted"
        call.answered_at = now
    else:
        call.status = "declined"
        call.ended_at = now

    await db.commit()
    await db.refresh(call)
    return serialize_call(call)

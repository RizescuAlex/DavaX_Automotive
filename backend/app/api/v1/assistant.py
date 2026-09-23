from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.schemas.assistant import AssistantMessageIn, AssistantMessageOut
from app.services.assistant import AssistantUnavailableError, ask

router = APIRouter()


@router.post("/message", response_model=AssistantMessageOut)
async def send_message(
    payload: AssistantMessageIn,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    """Answer one message and return the actions the dashboard should apply.

    Nothing is executed here and nothing is written to the database. The
    frontend owns the vehicle state, so it owns applying the result.
    """
    # Authenticated so the model's quota is spent on signed-in drivers only.
    # The user is not otherwise needed: the request carries its own context.
    await _get_user_from_token(token, db)

    try:
        reply, actions = await ask(payload.message, payload.context)
    except AssistantUnavailableError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_429_TOO_MANY_REQUESTS
                if exc.rate_limited
                else status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=str(exc),
        ) from exc

    return AssistantMessageOut(reply=reply, actions=actions)

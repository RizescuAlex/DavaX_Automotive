import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.exceptions import NotFoundError
from app.core.security import get_current_token
from app.models.contact import UserContact
from app.models.user import User
from app.schemas.user import ContactCreate, ContactOut, UserOut, UserUpdate
from app.services.usernames import validate_username

router = APIRouter()


async def _get_user_from_token(token: dict, db: AsyncSession) -> User:
    """Load User row based on the unified token payload (email or firebase provider)."""
    if token["provider"] == "email":
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(token["uid"]))
        )
    else:
        result = await db.execute(
            select(User).where(User.firebase_uid == token["uid"])
        )
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("User")
    return user


@router.get("/me", response_model=UserOut)
async def get_profile(
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    return await _get_user_from_token(token, db)


@router.put("/me", response_model=UserOut)
async def update_profile(
    body: UserUpdate,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_from_token(token, db)

    update_data = body.model_dump(exclude_unset=True)
    if "username" in update_data and update_data["username"] is not None:
        try:
            update_data["username"] = validate_username(update_data["username"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        existing = await db.execute(
            select(User).where(User.username == update_data["username"], User.id != user.id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="That username is already taken")
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    return user


@router.get("/me/contacts", response_model=list[ContactOut])
async def list_contacts(
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_from_token(token, db)
    result = await db.execute(
        select(User)
        .join(UserContact, UserContact.contact_user_id == User.id)
        .where(UserContact.user_id == user.id)
        .order_by(User.username)
    )
    return result.scalars().all()


@router.post("/me/contacts", response_model=ContactOut, status_code=201)
async def add_contact(
    body: ContactCreate,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_from_token(token, db)
    try:
        username = validate_username(body.username)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    result = await db.execute(select(User).where(User.username == username))
    contact = result.scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=404, detail="User not found")
    if contact.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    existing = await db.execute(
        select(UserContact).where(
            UserContact.user_id == user.id,
            UserContact.contact_user_id == contact.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="That user is already a contact")

    db.add(UserContact(user_id=user.id, contact_user_id=contact.id))
    await db.commit()
    return contact


@router.delete("/me/contacts/{contact_id}", status_code=204)
async def remove_contact(
    contact_id: uuid.UUID,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_from_token(token, db)
    result = await db.execute(
        select(UserContact).where(
            UserContact.user_id == user.id,
            UserContact.contact_user_id == contact_id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(contact)
    await db.commit()

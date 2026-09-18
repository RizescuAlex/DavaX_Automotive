import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import (
    create_access_token,
    get_current_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    EmailLoginRequest,
    EmailRegisterRequest,
    FirebaseLoginRequest,
    TokenResponse,
)

router = APIRouter()


# ── Helper ────────────────────────────────────────────────────────────────────

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


# ── Firebase / Google ─────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def firebase_login(
    body: FirebaseLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Called after the frontend completes Firebase Google sign-in.
    Verifies the Firebase ID token, creates or updates the user in our DB,
    and returns session info.
    """
    from firebase_admin import auth

    decoded = auth.verify_id_token(body.id_token)
    firebase_uid = decoded["uid"]
    email = decoded.get("email")
    display_name = decoded.get("name")
    avatar_url = decoded.get("picture")

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()
    is_new = False

    if user is None:
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            auth_provider="google",
        )
        db.add(user)
        is_new = True
    else:
        user.last_login_at = datetime.now(timezone.utc)
        if email:
            user.email = email
        if display_name:
            user.display_name = display_name
        if avatar_url:
            user.avatar_url = avatar_url

    await db.flush()

    return AuthResponse(
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        onboarding_completed=user.onboarding_completed,
        is_new_user=is_new,
    )


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: EmailRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with email and password."""
    # Check duplicate email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise ConflictError("An account with this email already exists")

    user = User(
        email=body.email,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        auth_provider="email",
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        onboarding_completed=user.onboarding_completed,
        is_new_user=True,
    )


@router.post("/login/email", response_model=TokenResponse)
async def login_email(
    body: EmailLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email and password, return a signed JWT."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Use the same generic error for both "user not found" and "wrong password"
    # to avoid leaking which emails are registered (security best practice)
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token({"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        onboarding_completed=user.onboarding_completed,
        is_new_user=False,
    )


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_current_user(
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile. Works for both auth providers."""
    user = await _get_user_from_token(token, db)

    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "onboarding_completed": user.onboarding_completed,
        "auth_provider": user.auth_provider,
    }

from pydantic import BaseModel, EmailStr, field_validator


class FirebaseLoginRequest(BaseModel):
    """Sent from frontend after Firebase Google sign-in to register/sync user with our DB."""
    id_token: str


class AuthResponse(BaseModel):
    """Returned for Firebase/Google login."""
    user_id: str
    email: str | None
    display_name: str | None
    onboarding_completed: bool
    is_new_user: bool


class EmailRegisterRequest(BaseModel):
    """Payload for creating a new email/password account."""
    email: EmailStr
    password: str
    display_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class EmailLoginRequest(BaseModel):
    """Payload for authenticating with email and password."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Returned for email/password register and login."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str | None
    display_name: str | None
    onboarding_completed: bool
    is_new_user: bool

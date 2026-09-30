from pydantic import BaseModel, EmailStr, field_validator


class FirebaseLoginRequest(BaseModel):
    id_token: str


class AuthResponse(BaseModel):
    user_id: str
    email: str | None
    display_name: str | None
    username: str
    onboarding_completed: bool
    is_new_user: bool


class EmailRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None
    username: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return value


class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str | None
    display_name: str | None
    username: str
    onboarding_completed: bool
    is_new_user: bool
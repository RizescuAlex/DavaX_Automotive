from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import firebase_admin
from firebase_admin import auth as firebase_auth
from jose import JWTError, jwt
#from passlib.context import CryptContext
import bcrypt
from app.config import settings

# ── Firebase Admin SDK ────────────────────────────────────────────────────────
# No service account credentials are needed — Firebase Admin fetches Google's
# public JWKS keys over the network to verify ID tokens. The project ID is enough.
if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})

# ── HTTP Bearer scheme ────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(plain.encode('utf-8'), salt)
    return hashed_bytes.decode('utf-8')
 
def verify_password(plain: str, hashed: str) -> bool:
    """Return True if the plaintext password matches the bcrypt hash."""
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Sign and return a JWT access token.
    Payload is augmented with expiry and our issuer identifier ("davax").
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload.update({"exp": expire, "iss": "davax"})
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify one of our custom JWTs. Raises JWTError on failure."""
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )


# ── Unified auth dependency ───────────────────────────────────────────────────

async def get_current_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """
    Unified Bearer-token verifier that accepts either:

    - Our custom JWT  (iss = "davax")     → { uid: user_id (UUID str), email, provider: "email" }
    - Firebase ID token (Google sign-in)  → { uid: firebase_uid,       email, provider: "firebase" }

    Returns a normalised dict so the rest of the codebase doesn't need to care
    which provider was used.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials

    # ── Try our custom JWT first ──────────────────────────────────────────────
    # Peek at the issuer without full verification to avoid unnecessary Firebase calls.
    try:
        unverified_claims = jwt.get_unverified_claims(raw_token)
        if unverified_claims.get("iss") == "davax":
            payload = decode_access_token(raw_token)
            return {
                "uid": payload["sub"],
                "email": payload.get("email"),
                "provider": "email",
            }
    except JWTError:
        # Token looked like ours but failed verification (expired, tampered, …)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # ── Fall back to Firebase token ───────────────────────────────────────────
    try:
        decoded = firebase_auth.verify_id_token(raw_token)
        return {
            "uid": decoded["uid"],
            "email": decoded.get("email"),
            "provider": "firebase",
        }
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    except Exception as e:
        import logging
        logging.error(f"Token validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
        )


# Backward-compatible alias used in older code references
verify_firebase_token = get_current_token

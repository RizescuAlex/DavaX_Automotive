import uuid

from app.config import settings


def create_room_name() -> str:
    return f"davax-call-{uuid.uuid4().hex}"


def create_livekit_token(*, identity: str, room_name: str) -> str:
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise RuntimeError("LiveKit credentials are not configured")

    from livekit import api

    grants = api.VideoGrants(room_join=True, room=room_name)
    return (
        api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_grants(grants)
        .to_jwt()
    )

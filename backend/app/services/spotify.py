from pathlib import Path

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from app.config import settings

SCOPES = (
    "streaming user-read-currently-playing user-read-playback-state "
    "user-modify-playback-state"
)


def _oauth() -> SpotifyOAuth:
    if not settings.SPOTIFY_CLIENT_ID or not settings.SPOTIFY_CLIENT_SECRET:
        raise RuntimeError("Spotify integration is not configured")

    cache_path = Path(settings.SPOTIFY_CACHE_PATH)
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    return SpotifyOAuth(
        client_id=settings.SPOTIFY_CLIENT_ID,
        client_secret=settings.SPOTIFY_CLIENT_SECRET,
        redirect_uri=settings.SPOTIFY_REDIRECT_URI,
        scope=SCOPES,
        cache_path=str(cache_path),
    )


def get_login_url() -> str:
    return _oauth().get_authorize_url()


def complete_login(code: str) -> dict:
    return _oauth().get_access_token(code)


def get_access_token() -> str:
    oauth = _oauth()
    token_info = oauth.get_cached_token()

    if not token_info:
        raise RuntimeError("Spotify authorization required")

    if oauth.is_token_expired(token_info):
        refresh_token = token_info.get("refresh_token")
        if not refresh_token:
            raise RuntimeError("Spotify authorization required")
        token_info = oauth.refresh_access_token(refresh_token)

    return token_info["access_token"]


def get_spotify_client() -> spotipy.Spotify:
    return spotipy.Spotify(auth=get_access_token())


def get_playback_device(spotify: spotipy.Spotify) -> dict:
    devices = spotify.devices().get("devices", [])
    active_devices = [
        device
        for device in devices
        if device.get("is_active") and not device.get("is_restricted")
    ]

    if not active_devices:
        raise RuntimeError(
            "No active Spotify device found. Open Spotify and start playback first."
        )

    return active_devices[0]


def next_track(spotify: spotipy.Spotify) -> None:
    get_playback_device(spotify)
    spotify.next_track()


def previous_track(spotify: spotipy.Spotify) -> None:
    get_playback_device(spotify)
    spotify.previous_track()

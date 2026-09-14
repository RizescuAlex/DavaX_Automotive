import os

import spotipy
from dotenv import load_dotenv
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

SCOPES = (
    "streaming "
    "user-read-currently-playing "
    "user-read-playback-state "
    "user-modify-playback-state"
)

oauth = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
    scope=SCOPES,
    cache_path=".spotify_cache",
)


def get_login_url() -> str:
    return oauth.get_authorize_url()


def complete_login(code: str):
    return oauth.get_access_token(code)


def get_access_token() -> str:
    token_info = oauth.get_cached_token()

    if not token_info:
        raise RuntimeError("Spotify authorization required")

    if oauth.is_token_expired(token_info):
        token_info = oauth.refresh_access_token(
            token_info["refresh_token"]
        )

    return token_info["access_token"]


def get_spotify_client() -> spotipy.Spotify:
    return spotipy.Spotify(auth=get_access_token())


def get_playback_device(spotify: spotipy.Spotify) -> dict:
    """Return the best available Spotify device for playback commands."""
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

def next_track(spotify: spotipy.Spotify):
    get_playback_device(spotify)
    spotify.next_track()


def previous_track(spotify: spotipy.Spotify):
    get_playback_device(spotify)
    spotify.previous_track()

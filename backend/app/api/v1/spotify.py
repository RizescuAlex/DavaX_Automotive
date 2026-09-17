from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from spotipy.exceptions import SpotifyException

from app.config import settings
from app.services.spotify import (
    complete_login,
    get_access_token,
    get_login_url,
    get_playback_device,
    get_spotify_client,
    next_track,
    previous_track,
)

router = APIRouter()


def spotify_error(error: SpotifyException) -> HTTPException:
    if error.http_status == 404:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Spotify has no active playback device. Open Spotify and start a song first.",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Spotify playback request failed",
    )


def spotify_runtime_error(error: RuntimeError) -> HTTPException:
    if "active Spotify device" in str(error):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error))


@router.get("/login")
def spotify_login() -> RedirectResponse:
    try:
        return RedirectResponse(get_login_url())
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error


@router.get("/callback")
def spotify_callback(code: str) -> RedirectResponse:
    try:
        complete_login(code)
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error
    return RedirectResponse(f"{settings.FRONTEND_URL}/dashboard")


@router.get("/token")
def spotify_token() -> dict[str, str]:
    try:
        return {"access_token": get_access_token()}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error


@router.get("/current")
def currently_playing() -> dict:
    try:
        playback = get_spotify_client().current_playback()
        if not playback or not playback.get("item"):
            return {"playing": False}

        track = playback["item"]
        images = track.get("album", {}).get("images", [])
        return {
            "playing": playback.get("is_playing", False),
            "title": track.get("name", "Unknown track"),
            "artist": ", ".join(artist.get("name", "") for artist in track.get("artists", [])),
            "album": track.get("album", {}).get("name", ""),
            "image_url": images[0].get("url") if images else None,
            "progress_ms": playback.get("progress_ms", 0),
            "duration_ms": track.get("duration_ms", 0),
        }
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


def _client_with_device():
    spotify = get_spotify_client()
    get_playback_device(spotify)
    return spotify


@router.post("/play")
def play_music() -> dict[str, bool]:
    try:
        _client_with_device().start_playback()
        return {"playing": True}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


@router.post("/pause")
def pause_music() -> dict[str, bool]:
    try:
        _client_with_device().pause_playback()
        return {"playing": False}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


@router.post("/next")
def skip_to_next_track() -> dict[str, str]:
    try:
        next_track(get_spotify_client())
        return {"message": "Skipped to next track"}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


@router.post("/previous")
def skip_to_previous_track() -> dict[str, str]:
    try:
        previous_track(get_spotify_client())
        return {"message": "Returned to previous track"}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


class SeekRequest(BaseModel):
    position_ms: int = Field(ge=0)


@router.post("/seek")
def seek_song(request: SeekRequest) -> dict[str, int]:
    try:
        _client_with_device().seek_track(position_ms=request.position_ms)
        return {"position_ms": request.position_ms}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


class TransferRequest(BaseModel):
    device_id: str = Field(min_length=1)


@router.post("/transfer")
def transfer_playback(request: TransferRequest) -> dict:
    try:
        get_spotify_client().transfer_playback(device_ids=[request.device_id], play=True)
        return {"device_id": request.device_id, "playing": True}
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error


@router.get("/devices")
def spotify_devices() -> dict[str, list[dict]]:
    try:
        devices = get_spotify_client().devices().get("devices", [])
        return {
            "devices": [
                {
                    "id": device.get("id"),
                    "name": device.get("name"),
                    "type": device.get("type"),
                    "is_active": device.get("is_active"),
                    "is_restricted": device.get("is_restricted"),
                    "supports_volume": device.get("supports_volume"),
                }
                for device in devices
            ]
        }
    except RuntimeError as error:
        raise spotify_runtime_error(error) from error
    except SpotifyException as error:
        raise spotify_error(error) from error

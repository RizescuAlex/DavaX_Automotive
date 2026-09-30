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


# ============================================================
# ERROR HANDLING
# ============================================================

def spotify_error(
    error: SpotifyException,
) -> HTTPException:

    # --------------------------------------------------------
    # No active playback device
    # --------------------------------------------------------

    if error.http_status == 404:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Spotify has no active playback device. "
                "Open Spotify and start a song first."
            ),
        )

    # --------------------------------------------------------
    # Spotify device exists, but the requested command
    # is not supported by that device.
    #
    # Example:
    #
    # VOLUME_CONTROL_DISALLOW
    # Player command failed: Cannot control device volume
    # --------------------------------------------------------

    reason = getattr(
        error,
        "reason",
        None,
    )

    message = getattr(
        error,
        "msg",
        "",
    )

    if (
        error.http_status == 403
        and (
            reason == "VOLUME_CONTROL_DISALLOW"
            or "Cannot control device volume" in str(message)
        )
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The active Spotify device does not support "
                "remote volume control."
            ),
        )

    # --------------------------------------------------------
    # Other Spotify 403 errors
    # --------------------------------------------------------

    if error.http_status == 403:
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Spotify rejected the playback command.",
        )

    # --------------------------------------------------------
    # Spotify rate limit
    # --------------------------------------------------------

    if error.http_status == 429:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Spotify rate limit reached. "
                "Please try again shortly."
            ),
        )

    # --------------------------------------------------------
    # Unknown Spotify/upstream error
    # --------------------------------------------------------

    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Spotify playback request failed.",
    )


def spotify_runtime_error(
    error: RuntimeError,
) -> HTTPException:

    if "active Spotify device" in str(error):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=str(error),
    )


# ============================================================
# REQUEST MODELS
# ============================================================

class VolumeRequest(BaseModel):
    volume_percent: int = Field(
        ge=0,
        le=100,
    )


class SeekRequest(BaseModel):
    position_ms: int = Field(
        ge=0,
    )


class TransferRequest(BaseModel):
    device_id: str = Field(
        min_length=1,
    )


# ============================================================
# AUTHENTICATION
# ============================================================

@router.get("/login")
def spotify_login() -> RedirectResponse:

    try:
        return RedirectResponse(
            get_login_url()
        )

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error


@router.get("/callback")
def spotify_callback(
    code: str,
) -> RedirectResponse:

    try:
        complete_login(
            code
        )

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error

    return RedirectResponse(
        f"{settings.FRONTEND_URL}/dashboard"
    )


@router.get("/token")
def spotify_token() -> dict[str, str]:

    try:
        return {
            "access_token":
                get_access_token()
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error


# ============================================================
# CURRENT PLAYBACK
# ============================================================

@router.get("/current")
def currently_playing() -> dict:

    try:
        playback = (
            get_spotify_client()
            .current_playback()
        )

        if (
            not playback
            or not playback.get("item")
        ):
            return {
                "playing": False
            }

        track = playback["item"]

        images = (
            track
            .get("album", {})
            .get("images", [])
        )

        device = (
            playback.get("device")
            or {}
        )

        return {
            "playing":
                playback.get(
                    "is_playing",
                    False,
                ),

            "title":
                track.get(
                    "name",
                    "Unknown track",
                ),

            "artist":
                ", ".join(
                    artist.get(
                        "name",
                        "",
                    )
                    for artist
                    in track.get(
                        "artists",
                        [],
                    )
                ),

            "album":
                track
                .get("album", {})
                .get("name", ""),

            "image_url":
                images[0].get("url")
                if images
                else None,

            "progress_ms":
                playback.get(
                    "progress_ms",
                    0,
                ),

            "duration_ms":
                track.get(
                    "duration_ms",
                    0,
                ),

            "volume_percent":
                device.get(
                    "volume_percent"
                ),

            # Useful for the frontend so it knows whether
            # the volume control should be enabled.
            "supports_volume":
                device.get(
                    "supports_volume",
                    False,
                ),

            "device_name":
                device.get(
                    "name"
                ),

            "device_id":
                device.get(
                    "id"
                ),
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# CLIENT / DEVICE HELPERS
# ============================================================

def _client_with_device():

    spotify = get_spotify_client()

    get_playback_device(
        spotify
    )

    return spotify


def _get_active_device(
    spotify,
) -> dict:

    """
    Find the currently active Spotify Connect device.

    Raises HTTP 409 if no device is currently active.
    """

    devices_response = (
        spotify.devices()
    )

    devices = (
        devices_response.get(
            "devices",
            [],
        )
    )

    active_device = next(
        (
            device
            for device in devices
            if device.get(
                "is_active"
            )
        ),
        None,
    )

    if active_device is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Spotify has no active playback device. "
                "Open Spotify and start a song first."
            ),
        )

    return active_device


# ============================================================
# PLAY
# ============================================================

@router.post("/play")
def play_music() -> dict[str, bool]:

    try:
        _client_with_device().start_playback()

        return {
            "playing": True
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# PAUSE
# ============================================================

@router.post("/pause")
def pause_music() -> dict[str, bool]:

    try:
        _client_with_device().pause_playback()

        return {
            "playing": False
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# PLAY / PAUSE TOGGLE
# ============================================================

@router.post("/play-pause")
def toggle_play_pause() -> dict[str, bool]:

    try:
        client = (
            _client_with_device()
        )

        playback = (
            client.current_playback()
        )

        is_playing = bool(
            playback
            and playback.get(
                "is_playing"
            )
        )

        if is_playing:

            client.pause_playback()

            return {
                "playing": False
            }

        client.start_playback()

        return {
            "playing": True
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# VOLUME
# ============================================================

@router.post("/volume")
def set_volume(
    request: VolumeRequest,
) -> dict[str, int]:

    try:

        spotify = (
            get_spotify_client()
        )

        # ----------------------------------------------------
        # Find the exact active Spotify Connect device.
        # ----------------------------------------------------

        active_device = (
            _get_active_device(
                spotify
            )
        )

        # ----------------------------------------------------
        # Some Spotify Connect devices explicitly report that
        # they cannot accept volume-control commands.
        #
        # Don't call Spotify's /volume endpoint in that case.
        # ----------------------------------------------------

        if active_device.get(
            "is_restricted",
            False,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The active Spotify device is restricted "
                    "and cannot accept remote playback commands."
                ),
            )

        if not active_device.get(
            "supports_volume",
            False,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The active Spotify device does not support "
                    "remote volume control."
                ),
            )

        device_id = (
            active_device.get(
                "id"
            )
        )

        if not device_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The active Spotify device does not "
                    "provide a usable device ID."
                ),
            )

        # ----------------------------------------------------
        # Explicitly target the active device instead of
        # relying on Spotify to infer it.
        # ----------------------------------------------------

        spotify.volume(
            request.volume_percent,
            device_id=device_id,
        )

        return {
            "volume_percent":
                request.volume_percent
        }

    # --------------------------------------------------------
    # Important:
    #
    # Don't let our intentionally raised HTTPExceptions get
    # caught and translated into Spotify errors.
    # --------------------------------------------------------

    except HTTPException:
        raise

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# NEXT TRACK
# ============================================================

@router.post("/next")
def skip_to_next_track() -> dict[str, str]:

    try:
        next_track(
            get_spotify_client()
        )

        return {
            "message":
                "Skipped to next track"
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# PREVIOUS TRACK
# ============================================================

@router.post("/previous")
def skip_to_previous_track() -> dict[str, str]:

    try:
        previous_track(
            get_spotify_client()
        )

        return {
            "message":
                "Returned to previous track"
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# SEEK
# ============================================================

@router.post("/seek")
def seek_song(
    request: SeekRequest,
) -> dict[str, int]:

    try:
        _client_with_device().seek_track(
            position_ms=
                request.position_ms
        )

        return {
            "position_ms":
                request.position_ms
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# TRANSFER PLAYBACK
# ============================================================

@router.post("/transfer")
def transfer_playback(
    request: TransferRequest,
) -> dict:

    try:
        get_spotify_client().transfer_playback(
            device_ids=[
                request.device_id
            ],
            play=True,
        )

        return {
            "device_id":
                request.device_id,

            "playing":
                True,
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error


# ============================================================
# DEVICES
# ============================================================

@router.get("/devices")
def spotify_devices() -> dict[str, list[dict]]:

    try:
        devices = (
            get_spotify_client()
            .devices()
            .get(
                "devices",
                [],
            )
        )

        return {
            "devices": [
                {
                    "id":
                        device.get(
                            "id"
                        ),

                    "name":
                        device.get(
                            "name"
                        ),

                    "type":
                        device.get(
                            "type"
                        ),

                    "is_active":
                        device.get(
                            "is_active"
                        ),

                    "is_restricted":
                        device.get(
                            "is_restricted"
                        ),

                    "supports_volume":
                        device.get(
                            "supports_volume"
                        ),

                    "volume_percent":
                        device.get(
                            "volume_percent"
                        ),
                }

                for device
                in devices
            ]
        }

    except RuntimeError as error:
        raise spotify_runtime_error(
            error
        ) from error

    except SpotifyException as error:
        raise spotify_error(
            error
        ) from error
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from spotipy.exceptions import SpotifyException
from pydantic import BaseModel

from spotify_service import (
    complete_login,
    get_access_token,
    get_login_url,
    get_playback_device,
    get_spotify_client,
    next_track,
    previous_track
)

app = FastAPI(title="DavaX Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def spotify_command_error(error: SpotifyException) -> HTTPException:
    if error.http_status == 404:
        return HTTPException(
            status_code=409,
            detail="Spotify has no active playback device. Open Spotify and start a song first.",
        )

    return HTTPException(
        status_code=502,
        detail=f"Spotify playback request failed: {error.msg}",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/spotify/login")
def spotify_login():
    return RedirectResponse(get_login_url())


@app.get("/spotify/callback")
def spotify_callback(code: str):
    complete_login(code)
    return {
        "message": "Spotify authorization complete",
        "next_step": "Return to the DavaX frontend",
    }


@app.get("/spotify/current")
def currently_playing():
    try:
        spotify = get_spotify_client()
        playback = spotify.current_playback()

        if not playback or not playback.get("item"):
            return {"playing": False}

        track = playback["item"]
        images = track.get("album", {}).get("images", [])
        image_url = images[0]["url"] if images else None

        return {
            "playing": playback.get("is_playing", False),
            "title": track["name"],
            "artist": track["artists"][0]["name"],
            "album": track["album"]["name"],
            "image_url": image_url,
            "progress_ms": playback.get("progress_ms", 0),
            "duration_ms": track["duration_ms"],
        }

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error


@app.post("/spotify/play")
def play_music():
    try:
        spotify = get_spotify_client()
        get_playback_device(spotify)
        spotify.start_playback()
        return {"playing": True}

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error


@app.post("/spotify/pause")
def pause_music():
    try:
        spotify = get_spotify_client()
        get_playback_device(spotify)
        spotify.pause_playback()
        return {"playing": False}

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error

@app.post("/spotify/next")
def skip_to_next_track():
    try:
        spotify = get_spotify_client()
        next_track(spotify)

        return {"message": "Skipped to next track"}

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error

@app.post("/spotify/previous")
def skip_to_previous_track():
    try:
        spotify = get_spotify_client()
        previous_track(spotify)

        return {"message": "Returned to previous track"}

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error

@app.get("/spotify/devices")
def spotify_devices():
    try:
        spotify = get_spotify_client()
        devices = spotify.devices().get("devices", [])

        return {
            "devices": [
                {
                    "id": device.get("id"),
                    "name": device.get("name"),
                    "type": device.get("type"),
                    "is_active": device.get("is_active"),
                    "is_restricted": device.get("is_restricted"),
                    "is_private_session": device.get("is_private_session"),
                    "supports_volume": device.get("supports_volume"),
                }
                for device in devices
            ]
        }

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error


class SeekRequest(BaseModel):
    position_ms: int

class TransferRequest(BaseModel):
    device_id: str


@app.get("/spotify/token")
def spotify_token():
    try:
        return {"access_token": get_access_token()}
    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))


@app.post("/spotify/seek")
def seek_song(request: SeekRequest):
    try:
        spotify = get_spotify_client()
        get_playback_device(spotify)

        spotify.seek_track(position_ms=request.position_ms)

        return {
            "position_ms": request.position_ms,
        }

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error


@app.post("/spotify/transfer")
def transfer_playback(request: TransferRequest):
    try:
        spotify = get_spotify_client()
        spotify.transfer_playback(
            device_ids=[request.device_id],
            play=True,
        )

        return {"device_id": request.device_id, "playing": True}

    except RuntimeError as error:
        raise HTTPException(status_code=401, detail=str(error))
    except SpotifyException as error:
        raise spotify_command_error(error) from error

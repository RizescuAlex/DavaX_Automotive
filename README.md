# DavaX Automotive

AI in-car assistant: a React cockpit UI, a FastAPI backend, and a gesture
pipeline that reads hand landmarks from an iPhone's LiDAR camera.

## Quick start

```bash
cp .env.example .env
python start.py --build
```

Then open <http://localhost> and register with **email and password**.

That is the whole setup. The example values are enough to get a working app —
Postgres, Redis, the API and the UI all come up, and the backend runs
`alembic upgrade head` on start, so the schema is created for you.

`python start.py --build` deliberately removes the Compose volumes before
building, so each build starts with a blank Postgres database and Alembic
recreates its schema. This deletes saved accounts and app data (and clears
Redis). Run `python start.py` without `--build` to restart while preserving
data. `docker compose up --build` by itself preserves existing named volumes;
use the startup script or `make dev` when you want a clean database.

> **Google sign-in will not work with the example values**, because they are
> placeholders for a Firebase project you do not have. Email/password auth is
> fully independent of Firebase, so use that unless you have real credentials.
> See [Optional integrations](#optional-integrations).

### Where things listen

| URL | What |
| --- | --- |
| <http://localhost> | The app, through nginx — **use this one** |
| <http://localhost:5173> | Vite dev server directly |
| <http://localhost:8000/docs> | API docs (when `APP_DEBUG=true`) |

## Files you must create locally

These are gitignored, so they are never in a clone. This is the single most
common reason the project fails to start on a new machine.

| File | Required? | How to get it |
| --- | --- | --- |
| `.env` | **Yes** | `cp .env.example .env` |
| `.env.local` | No | Only for design-preview mode, below |

## Optional integrations

Everything below is off by default and the app runs without it. Add real values
to `.env` and run `docker compose up -d --force-recreate` to pick them up —
Compose reads `env_file` at container creation, so a reload is not enough.

| Feature | Variables | Notes |
| --- | --- | --- |
| Google sign-in | `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_*` | Add your host under Firebase Console → Authentication → Settings → Authorized domains |
| Assistant | `OPENAI_API_KEY` | Backend-side only, deliberately no `VITE_` twin |
| Maps | `VITE_GOOGLE_MAPS_API_KEY` | Map panel is blank without it |
| Music | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Playback requires a Spotify **Premium** account |
| Weather | `VITE_OPENWEATHERMAP_API_KEY` | Badge is hidden without it |

## Design preview

To review layout with no backend, no database and no credentials at all, run
the Vite dev server on the host with the flag in a `.env.local` at the **repo
root**:

```bash
echo 'VITE_DESIGN_PREVIEW=true' > .env.local
cd frontend && npm run dev
```

The root, not `frontend/`: `vite.config.js` sets `envDir: ".."`, so Vite never
reads env files inside `frontend/`. Under Docker it sees no env files at all;
there, add `VITE_DESIGN_PREVIEW=true` to `.env` (Compose passes it to the
container) and run `docker compose up -d --force-recreate frontend`.

Auth is bypassed and a mock user is injected, so every screen renders. It is
double-gated on `import.meta.env.DEV`, so it cannot be switched on in a
production build. Delete the file (or the line) to restore the real login flow.

## Common commands

```bash
python start.py --build          # clean database, build, and start everything
python start.py                  # start while keeping database data
docker compose logs -f backend   # tail the API
docker compose down              # stop
make migrate-new msg="..."       # create a migration after changing a model
make test                        # backend tests
```

## Gesture pipeline

The hand-tracking stack in `motion/` and `DavaXLidar/` is separate from the web
app and is **not** part of `docker compose up`. It needs an iPhone with LiDAR
running the `DavaXLidar` Xcode project, streaming landmarks over UDP to a
machine running `motion/bmw_gestures.py`. The receiver address is currently
hardcoded in `DavaXLidar/LiDARViewModel.swift`.

## Layout

```
backend/     FastAPI app, SQLAlchemy models, Alembic migrations
frontend/    React + Vite cockpit UI
motion/      Gesture recognition (UDP receiver, pose + motion recognizers)
DavaXLidar/  iOS app: ARKit/LiDAR depth + Vision hand landmarks
docker/      Dockerfiles and nginx config
```

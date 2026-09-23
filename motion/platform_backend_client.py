import time
import threading

import requests


class PlatformBackendClient:

    def __init__(
        self,
        api_base: str,
        cooldown: float = 0.30,
    ):
        self.api_base = api_base.rstrip("/")
        self.cooldown = cooldown
        self.last_action_time = {}

    # =========================================================
    # INTERNAL HELPERS
    # =========================================================

    def _can_send(
        self,
        action: str,
    ) -> bool:

        now = time.monotonic()

        previous = self.last_action_time.get(
            action,
            0.0,
        )

        if (
            now - previous
            < self.cooldown
        ):
            return False

        self.last_action_time[action] = now

        return True

    def _post(
        self,
        path: str,
        json_data=None,
    ) -> None:

        url = (
            f"{self.api_base}"
            f"{path}"
        )

        try:

            response = requests.post(
                url,
                json=json_data,
                timeout=2.0,
            )

            response.raise_for_status()

            try:
                result = response.json()

            except ValueError:
                result = {}

            print(
                "Backend response:",
                path,
                result,
            )

        except requests.RequestException as error:

            print(
                "Backend request failed:",
                path,
                error,
            )

    def _post_async(
        self,
        path: str,
        json_data=None,
    ) -> None:

        thread = threading.Thread(
            target=self._post,
            args=(
                path,
                json_data,
            ),
            daemon=True,
        )

        thread.start()

    # =========================================================
    # PLAY
    # =========================================================

    def play(self):

        if not self._can_send(
            "PLAY"
        ):
            return

        print(
            "GESTURE -> PLAY"
        )

        self._post_async(
            "/spotify/play"
        )

    # =========================================================
    # PAUSE
    # =========================================================

    def pause(self):

        if not self._can_send(
            "PAUSE"
        ):
            return

        print(
            "GESTURE -> PAUSE"
        )

        self._post_async(
            "/spotify/pause"
        )

    # =========================================================
    # PLAY / PAUSE TOGGLE
    # =========================================================

    def play_pause(self):

        if not self._can_send(
            "PLAY_PAUSE"
        ):
            return

        print(
            "GESTURE -> PLAY / PAUSE"
        )

        self._post_async(
            "/spotify/play-pause"
        )

    # =========================================================
    # NEXT TRACK
    # =========================================================

    def next_track(self):

        if not self._can_send(
            "NEXT_SONG"
        ):
            return

        print(
            "GESTURE -> NEXT SONG"
        )

        self._post_async(
            "/spotify/next"
        )

    # =========================================================
    # PREVIOUS TRACK
    # =========================================================

    def previous_track(self):

        if not self._can_send(
            "PREVIOUS_SONG"
        ):
            return

        print(
            "GESTURE -> PREVIOUS SONG"
        )

        self._post_async(
            "/spotify/previous"
        )

    # =========================================================
    # VOLUME UP
    #
    # These require matching backend endpoints:
    #
    # POST /spotify/volume-up
    # POST /spotify/volume-down
    #
    # If you don't have those routes yet, these calls will
    # return 404 until you add them.
    # =========================================================

    def volume_up(self):

        if not self._can_send(
            "VOLUME_UP"
        ):
            return

        print(
            "GESTURE -> VOLUME UP"
        )

        self._post_async(
            "/spotify/volume-up"
        )

    def volume_down(self):

        if not self._can_send(
            "VOLUME_DOWN"
        ):
            return

        print(
            "GESTURE -> VOLUME DOWN"
        )

        self._post_async(
            "/spotify/volume-down"
        )
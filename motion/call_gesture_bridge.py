import json
import os
import urllib.error
import urllib.request


class CallGestureBridge:
    """Forward stable thumb decisions to the backend call endpoint."""

    def __init__(self):
        self.url = os.getenv(
            "GESTURE_BRIDGE_URL",
            "http://127.0.0.1:8000/api/v1/calls/current/gesture",
        )
        self.token = os.getenv("GESTURE_BRIDGE_TOKEN", "")

    def send(self, gesture: str) -> bool:
        action = {"THUMB_UP": "accept", "THUMB_DOWN": "decline"}.get(gesture)
        if not action or not self.token:
            return False

        request = urllib.request.Request(
            self.url,
            data=json.dumps({"action": action}).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Gesture-Token": self.token,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=2):
                return True
        except (urllib.error.URLError, TimeoutError):
            return False

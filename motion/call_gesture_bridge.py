import json
import os
import urllib.error
import urllib.request
from dotenv import load_dotenv

load_dotenv()


class CallGestureBridge:
    """Forward stable thumb gestures to the platform backend."""

    def __init__(self):
        self.url = os.getenv(
            "GESTURE_BRIDGE_URL",
            "http://127.0.0.1:8000/api/v1/calls/current/gesture",
        )

        self.token = os.getenv(
            "GESTURE_BRIDGE_TOKEN",
            "",
        )

    def send(self, gesture: str) -> bool:

        actions = {
            "THUMB_UP": "accept",
            "THUMB_DOWN": "decline",
        }

        action = actions.get(gesture)

        if not action:
            print(f"Unknown call gesture: {gesture}")
            return False

        if not self.token:
            print(
                "Call gesture not sent: "
                "GESTURE_BRIDGE_TOKEN is missing"
            )
            return False

        payload = {
            "action": action,
        }

        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Gesture-Token": self.token,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=2,
            ) as response:

                print(
                    f"CALL GESTURE: {gesture} -> {action}"
                )

                print(
                    f"Backend status: {response.status}"
                )

                return 200 <= response.status < 300

        except urllib.error.HTTPError as error:
            print(
                f"Call backend HTTP error: {error.code}"
            )
            return False

        except (urllib.error.URLError, TimeoutError) as error:
            print(
                f"Call backend connection error: {error}"
            )
            return False
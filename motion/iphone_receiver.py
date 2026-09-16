import json
import socket

from .models import GestureResult, Landmark


class IPhoneReceiver:

    def __init__(
        self,
        host="0.0.0.0",
        port=5005,
    ):
        self.socket = socket.socket(
            socket.AF_INET,
            socket.SOCK_DGRAM,
        )

        self.socket.bind(
            (host, port)
        )

        print(
            f"Waiting for iPhone on UDP {port}..."
        )

    def receive(self):
        data, address = self.socket.recvfrom(
            65535
        )

        packet = json.loads(
            data.decode("utf-8")
        )

        hands = []

        for hand_data in packet["hands"]:

            landmarks = [
                Landmark(
                    x=float(point["x"]),
                    y=float(point["y"]),
                    z=float(point["z"]),
                )
                for point
                in hand_data["landmarks"]
            ]

            hands.append(
                GestureResult(
                    landmarks=landmarks,
                    handedness=hand_data.get(
                        "handedness",
                        "Unknown",
                    ),
                    handedness_confidence=float(
                        hand_data.get(
                            "confidence",
                            1.0,
                        )
                    ),
                    gesture="None",
                    gesture_confidence=0.0,
                )
            )

        return packet["timestamp"], hands

    def close(self):
        self.socket.close()

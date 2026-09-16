import json
import socket

from motion.models import HandResult, Landmark


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
                    visibility=float(
                        point.get(
                            "confidence",
                            1.0,
                        )
                    ),
                )
                for point
                in hand_data["landmarks"]
            ]

            hands.append(
                HandResult(
                    landmarks=landmarks,
                    handedness=hand_data.get(
                        "handedness",
                        "Unknown",
                    ),
                    confidence=float(
                        hand_data.get(
                            "confidence",
                            1.0,
                        )
                    ),
                )
            )

        return packet["timestamp"], hands

    def close(self):
        self.socket.close()
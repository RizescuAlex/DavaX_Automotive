import threading
import time

from motion.iphone_receiver import IPhoneReceiver


class LatestIPhoneReceiver:

    def __init__(
        self,
        host="0.0.0.0",
        port=5005,
    ):
        self.receiver = IPhoneReceiver(
            host=host,
            port=port,
        )

        self.latest_timestamp = None
        self.latest_hands = []

        self.packet_number = 0

        self.lock = threading.Lock()

        self.running = False
        self.thread = None

    def start(self):

        if self.running:
            return

        self.running = True

        self.thread = threading.Thread(
            target=self._receive_loop,
            daemon=True,
        )

        self.thread.start()

    def _receive_loop(self):

        while self.running:

            try:

                timestamp, hands = (
                    self.receiver.receive()
                )

                with self.lock:

                    self.latest_timestamp = (
                        timestamp
                    )

                    self.latest_hands = (
                        hands
                    )

                    self.packet_number += 1

            except Exception as error:

                if self.running:

                    print(
                        "Receiver error:",
                        error,
                    )

                    time.sleep(0.01)

    def get_latest(self):

        with self.lock:

            return (
                self.latest_timestamp,
                self.latest_hands,
                self.packet_number,
            )

    def close(self):

        self.running = False

        try:
            self.receiver.close()
        except Exception:
            pass
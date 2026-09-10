import cv2
from typing import Iterator


class Camera:
    def __init__(self, camera_index: int = 0, width: int = 1280, height: int = 720):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.capture = None

    def start(self) -> None:
        self.capture = cv2.VideoCapture(self.camera_index)

        if not self.capture.isOpened():
            raise RuntimeError("Could not open camera")

        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

    def frames(self) -> Iterator:
        if self.capture is None:
            raise RuntimeError("Camera has not been started")

        while True:
            success, frame = self.capture.read()

            if not success:
                break

            yield frame

    def stop(self) -> None:
        if self.capture is not None:
            self.capture.release()
from pathlib import Path
from typing import List

import cv2
import mediapipe as mp

from .models import HandResult, Landmark


class HandTracker:
    def __init__(self, model_path: str = "models/hand_landmarker.task"):
        model_file = Path(model_path)

        if not model_file.exists():
            raise FileNotFoundError(
                f"Could not find hand model: {model_file}"
            )

        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=str(model_file)
            ),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.6,
            min_hand_presence_confidence=0.6,
            min_tracking_confidence=0.6,
        )

        self.landmarker = (
            mp.tasks.vision.HandLandmarker.create_from_options(options)
        )
        self.timestamp_ms = 0

    def process(self, frame) -> List[HandResult]:
        # OpenCV uses BGR; MediaPipe expects RGB.
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb_frame,
        )

        self.timestamp_ms += 33

        result = self.landmarker.detect_for_video(
            image,
            self.timestamp_ms,
        )

        hands = []

        for landmarks, handedness_list in zip(
            result.hand_landmarks,
            result.handedness,
        ):
            points = [
                Landmark(point.x, point.y, point.z)
                for point in landmarks
            ]

            classification = handedness_list[0]

            hands.append(
                HandResult(
                    landmarks=points,
                    handedness=classification.category_name,
                    confidence=classification.score,
                )
            )

        return hands

    def close(self) -> None:
        self.landmarker.close()
from pathlib import Path
from typing import List
import time

import cv2
import mediapipe as mp

from .models import GestureResult, Landmark


class GestureRecognizer:
    def __init__(
        self,
        model_path: str = "models/gesture_recognizer.task",
    ):
        model_file = Path(model_path)

        if not model_file.exists():
            raise FileNotFoundError(
                f"Could not find gesture model: {model_file}"
            )

        BaseOptions = mp.tasks.BaseOptions
        GestureRecognizer = mp.tasks.vision.GestureRecognizer
        GestureRecognizerOptions = (
            mp.tasks.vision.GestureRecognizerOptions
        )
        RunningMode = mp.tasks.vision.RunningMode
        ClassifierOptions = mp.tasks.components.processors.ClassifierOptions

        options = GestureRecognizerOptions(
            base_options=BaseOptions(
                model_asset_path=str(model_file),
            ),
            running_mode=RunningMode.VIDEO,
            num_hands=2,

            min_hand_detection_confidence=0.6,
            min_hand_presence_confidence=0.6,
            min_tracking_confidence=0.6,

            canned_gesture_classifier_options=ClassifierOptions(
                score_threshold=0.65,
                category_allowlist=[
                    "Thumb_Up",
                    "Thumb_Down",
                ],
            ),
        )

        self.recognizer = (
            GestureRecognizer.create_from_options(options)
        )

        self.start_time = time.monotonic()
        self.last_timestamp_ms = -1

    def process(self, frame) -> List[GestureResult]:
        rgb_frame = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB,
        )

        image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb_frame,
        )

        timestamp_ms = int(
            (time.monotonic() - self.start_time) * 1000
        )

        timestamp_ms = max(
            timestamp_ms,
            self.last_timestamp_ms + 1,
        )

        self.last_timestamp_ms = timestamp_ms

        result = self.recognizer.recognize_for_video(
            image,
            timestamp_ms,
        )

        results = []

        for i, landmarks in enumerate(
            result.hand_landmarks
        ):
            points = [
                Landmark(
                    x=point.x,
                    y=point.y,
                    z=point.z,
                )
                for point in landmarks
            ]

            handedness = result.handedness[i][0]

            gesture_name = "None"
            gesture_confidence = 0.0

            if (
                i < len(result.gestures)
                and result.gestures[i]
            ):
                gesture = result.gestures[i][0]

                gesture_name = (
                    gesture.category_name
                )

                gesture_confidence = (
                    gesture.score
                )

            results.append(
                GestureResult(
                    landmarks=points,
                    handedness=(
                        handedness.category_name
                    ),
                    handedness_confidence=(
                        handedness.score
                    ),
                    gesture=gesture_name,
                    gesture_confidence=(
                        gesture_confidence
                    ),
                )
            )

        return results

    def close(self) -> None:
        self.recognizer.close()
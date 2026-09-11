from collections import defaultdict, deque
from typing import Deque, Dict

from .models import GestureResult


class GestureFilter:
    def __init__(
        self,
        window_size: int = 5,
        min_confidence: float = 0.80,
    ):
        self.window_size = window_size
        self.min_confidence = min_confidence

        self.histories: Dict[
            str,
            Deque[str],
        ] = defaultdict(
            lambda: deque(
                maxlen=self.window_size
            )
        )

    def update(
        self,
        result: GestureResult,
    ) -> GestureResult:
        if result.confidence < self.min_confidence:
            label = "NONE"
        else:
            label = result.label

        history = self.histories[
            result.handedness
        ]

        history.append(label)

        stable = (
            len(history) == self.window_size
            and label != "NONE"
            and all(
                previous_label == label
                for previous_label in history
            )
        )

        return GestureResult(
            label=label,
            confidence=result.confidence,
            handedness=result.handedness,
            stable=stable,
        )
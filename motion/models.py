from dataclasses import dataclass
from typing import List


@dataclass
class Landmark:
    x: float
    y: float
    z: float


@dataclass
class GestureResult:
    landmarks: List[Landmark]
    handedness: str
    handedness_confidence: float
    gesture: str
    gesture_confidence: float
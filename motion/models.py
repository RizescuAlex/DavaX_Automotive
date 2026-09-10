from dataclasses import dataclass
from typing import List


@dataclass
class Landmark:
    x: float
    y: float
    z: float
    visibility: float = 1.0


@dataclass
class HandResult:
    landmarks: List[Landmark]
    handedness: str
    confidence: float
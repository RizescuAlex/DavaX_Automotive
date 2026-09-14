from collections import deque
from statistics import median


class LandmarkDepthFilter:
    def __init__(
        self,
        landmark_count=21,
        history_size=5,
        max_hand_difference=0.18,
    ):
        self.landmark_count = landmark_count
        self.history_size = history_size
        self.max_hand_difference = max_hand_difference

        self.histories = [
            deque(maxlen=history_size)
            for _ in range(landmark_count)
        ]

    def update(self, landmarks):
        if not landmarks:
            return landmarks

        # Find a rough depth for the whole hand.
        valid_depths = [
            landmark.z
            for landmark in landmarks
            if landmark.z is not None
            and landmark.z > 0
            and landmark.z < 2.0
        ]

        if not valid_depths:
            return landmarks

        hand_depth = median(valid_depths)

        for i, landmark in enumerate(landmarks):
            z = landmark.z

            valid = (
                z is not None
                and z > 0
                and z < 2.0
            )

            # Reject points that are much farther/closer
            # than the rest of the hand.
            if valid:
                if abs(z - hand_depth) > self.max_hand_difference:
                    valid = False

            history = self.histories[i]

            if valid:
                history.append(z)
                landmark.z = median(history)

            elif history:
                landmark.z = median(history)

            else:
                # No trustworthy history yet.
                # Use the hand median temporarily.
                landmark.z = hand_depth

        return landmarks
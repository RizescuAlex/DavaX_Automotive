import cv2
import numpy as np
from collections import deque, Counter

from motion.iphone_receiver import IPhoneReceiver


HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),

    (0, 5), (5, 6), (6, 7), (7, 8),

    (5, 9), (9, 10), (10, 11), (11, 12),

    (9, 13), (13, 14), (14, 15), (15, 16),

    (13, 17), (17, 18), (18, 19), (19, 20),

    (0, 17),
]


WINDOW_WIDTH = 900
WINDOW_HEIGHT = 900


def landmark_to_pixel(landmark):
    x = int(landmark.x * WINDOW_WIDTH)
    y = int(landmark.y * WINDOW_HEIGHT)

    x = max(0, min(WINDOW_WIDTH - 1, x))
    y = max(0, min(WINDOW_HEIGHT - 1, y))

    return x, y


def finger_extended(
    landmarks,
    tip_id,
    pip_id,
    mcp_id,
):
    """
    Simple 2D test:
    fingertip should be farther upward
    than PIP and MCP in image coordinates.
    """

    tip = landmarks[tip_id]
    pip = landmarks[pip_id]
    mcp = landmarks[mcp_id]

    return (
        tip.y < pip.y
        and pip.y < mcp.y
    )


def detect_gesture(hand):
    landmarks = hand.landmarks

    if len(landmarks) != 21:
        return "None"

    wrist = landmarks[0]

    thumb_tip = landmarks[4]
    thumb_ip = landmarks[3]

    index_extended = finger_extended(
        landmarks,
        8,
        6,
        5,
    )

    middle_extended = finger_extended(
        landmarks,
        12,
        10,
        9,
    )

    ring_extended = finger_extended(
        landmarks,
        16,
        14,
        13,
    )

    little_extended = finger_extended(
        landmarks,
        20,
        18,
        17,
    )

    fingers_extended = [
        index_extended,
        middle_extended,
        ring_extended,
        little_extended,
    ]

    extended_count = sum(
        fingers_extended
    )

    # --------------------------------
    # OPEN PALM
    # --------------------------------

    if extended_count >= 4:
        return "Open Palm"

    # --------------------------------
    # FIST
    # --------------------------------

    if extended_count == 0:

        # Thumb should also be relatively
        # close to the palm.
        palm_center_y = (
            landmarks[5].y
            + landmarks[9].y
            + landmarks[13].y
            + landmarks[17].y
        ) / 4.0

        if thumb_tip.y > palm_center_y - 0.10:
            return "Fist"

    # --------------------------------
    # THUMB UP / THUMB DOWN
    #
    # Require the other four fingers
    # to be folded.
    # --------------------------------

    if extended_count <= 1:

        palm_center_y = (
            landmarks[5].y
            + landmarks[9].y
            + landmarks[13].y
            + landmarks[17].y
        ) / 4.0

        # Thumb Up
        if (
            thumb_tip.y
            < palm_center_y - 0.12

            and thumb_tip.y
            < thumb_ip.y
        ):
            return "Thumb Up"

        # Thumb Down
        if (
            thumb_tip.y
            > wrist.y + 0.05

            and thumb_tip.y
            > thumb_ip.y
        ):
            return "Thumb Down"

    # --------------------------------
    # POINTING
    # --------------------------------

    if (
        index_extended
        and not middle_extended
        and not ring_extended
        and not little_extended
    ):
        return "Pointing"

    return "None"


class GestureStabilizer:

    def __init__(
        self,
        history_size=7,
        min_votes=5,
    ):
        self.history = deque(
            maxlen=history_size
        )

        self.min_votes = min_votes

    def update(self, gesture):
        self.history.append(gesture)

        counts = Counter(
            self.history
        )

        best_gesture, votes = (
            counts.most_common(1)[0]
        )

        if (
            best_gesture != "None"
            and votes >= self.min_votes
        ):
            return best_gesture

        return "None"


def draw_hand(
    frame,
    hand,
):

    landmarks = hand.landmarks

    if len(landmarks) != 21:
        return

    points = [
        landmark_to_pixel(lm)
        for lm in landmarks
    ]

    # Bones
    for start, end in HAND_CONNECTIONS:
        cv2.line(
            frame,
            points[start],
            points[end],
            (50, 50, 50),
            3,
            cv2.LINE_AA,
        )

    # Landmarks
    for i, landmark in enumerate(
        landmarks
    ):

        x, y = points[i]

        valid_depth = (
            landmark.z is not None
            and landmark.z > 0
        )

        if valid_depth:
            color = (0, 180, 0)
        else:
            color = (0, 0, 255)

        cv2.circle(
            frame,
            (x, y),
            8,
            color,
            -1,
            cv2.LINE_AA,
        )

        cv2.putText(
            frame,
            str(i),
            (x + 8, y - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )


def main():

    receiver = IPhoneReceiver(
        host="0.0.0.0",
        port=5005,
    )

    stabilizer = GestureStabilizer(
        history_size=7,
        min_votes=5,
    )

    cv2.namedWindow(
        "DavaX Gesture Detection",
        cv2.WINDOW_NORMAL,
    )

    try:

        while True:

            timestamp, hands = (
                receiver.receive()
            )

            frame = np.full(
                (
                    WINDOW_HEIGHT,
                    WINDOW_WIDTH,
                    3,
                ),
                255,
                dtype=np.uint8,
            )

            cv2.putText(
                frame,
                "DavaX - iPhone Gesture Detection",
                (25, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 0),
                2,
                cv2.LINE_AA,
            )

            detected_gesture = "None"
            stable_gesture = "None"

            for hand in hands:

                draw_hand(
                    frame,
                    hand,
                )

                detected_gesture = (
                    detect_gesture(
                        hand
                    )
                )

                stable_gesture = (
                    stabilizer.update(
                        detected_gesture
                    )
                )

            # --------------------------------
            # Raw gesture
            # --------------------------------

            cv2.putText(
                frame,
                f"Detected: {detected_gesture}",
                (25, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (100, 100, 100),
                2,
                cv2.LINE_AA,
            )

            # --------------------------------
            # Stable gesture
            # --------------------------------

            if stable_gesture != "None":

                text = (
                    f"STABLE: "
                    f"{stable_gesture}"
                )

                thickness = 3

            else:

                text = "STABLE: --"

                thickness = 2

            cv2.putText(
                frame,
                text,
                (25, 115),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 0),
                thickness,
                cv2.LINE_AA,
            )

            # --------------------------------
            # Instructions
            # --------------------------------

            cv2.putText(
                frame,
                "Try: Open Palm / Fist / Pointing / Thumb Up / Thumb Down",
                (25, WINDOW_HEIGHT - 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )

            cv2.imshow(
                "DavaX Gesture Detection",
                frame,
            )

            key = (
                cv2.waitKey(1)
                & 0xFF
            )

            if key == ord("q"):
                break

    except KeyboardInterrupt:
        pass

    finally:

        receiver.close()

        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
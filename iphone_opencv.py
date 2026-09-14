import cv2
import numpy as np

from motion.iphone_receiver import IPhoneReceiver


# MediaPipe / Vision 21-point hand topology
HAND_CONNECTIONS = [
    # Thumb
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),

    # Index
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),

    # Middle
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),

    # Ring
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),

    # Little finger
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),

    # Palm
    (0, 17),
]


WINDOW_WIDTH = 900
WINDOW_HEIGHT = 900


def landmark_to_pixel(landmark):
    """
    Convert normalized coordinates [0,1]
    into OpenCV pixel coordinates.
    """

    x = int(landmark.x * WINDOW_WIDTH)
    y = int(landmark.y * WINDOW_HEIGHT)

    x = max(0, min(WINDOW_WIDTH - 1, x))
    y = max(0, min(WINDOW_HEIGHT - 1, y))

    return x, y


def draw_hand(frame, hand):
    landmarks = hand.landmarks

    if len(landmarks) != 21:
        return

    points = [
        landmark_to_pixel(lm)
        for lm in landmarks
    ]

    # ---------------------------------
    # Draw bones
    # ---------------------------------

    for start, end in HAND_CONNECTIONS:
        cv2.line(
            frame,
            points[start],
            points[end],
            (50, 50, 50),
            3,
            cv2.LINE_AA,
        )

    # ---------------------------------
    # Draw landmarks
    # ---------------------------------

    for i, landmark in enumerate(landmarks):

        x, y = points[i]

        valid_depth = (
            landmark.z is not None
            and landmark.z > 0
        )

        if valid_depth:
            color = (0, 200, 0)
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

        # Landmark number
        cv2.putText(
            frame,
            str(i),
            (x + 10, y - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )

        # Depth value
        if valid_depth:

            depth_text = (
                f"{landmark.z:.2f}m"
            )

        else:

            depth_text = "--"

        cv2.putText(
            frame,
            depth_text,
            (x + 10, y + 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.40,
            color,
            1,
            cv2.LINE_AA,
        )


def main():

    receiver = IPhoneReceiver(
        host="0.0.0.0",
        port=5005,
    )

    cv2.namedWindow(
        "DavaX iPhone Hand Tracking",
        cv2.WINDOW_NORMAL,
    )

    try:

        while True:

            timestamp, hands = (
                receiver.receive()
            )

            # White background
            frame = np.full(
                (
                    WINDOW_HEIGHT,
                    WINDOW_WIDTH,
                    3,
                ),
                255,
                dtype=np.uint8,
            )

            # ---------------------------------
            # Header
            # ---------------------------------

            cv2.putText(
                frame,
                "DavaX - iPhone LiDAR Hand Tracking",
                (25, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 0),
                2,
                cv2.LINE_AA,
            )

            cv2.putText(
                frame,
                f"Timestamp: {timestamp}",
                (25, 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )

            cv2.putText(
                frame,
                f"Hands: {len(hands)}",
                (25, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )

            # ---------------------------------
            # Draw each received hand
            # ---------------------------------

            for hand in hands:
                draw_hand(
                    frame,
                    hand,
                )

            # ---------------------------------
            # Legend
            # ---------------------------------

            cv2.circle(
                frame,
                (30, WINDOW_HEIGHT - 55),
                7,
                (0, 200, 0),
                -1,
            )

            cv2.putText(
                frame,
                "Valid LiDAR depth",
                (48, WINDOW_HEIGHT - 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
            )

            cv2.circle(
                frame,
                (30, WINDOW_HEIGHT - 25),
                7,
                (0, 0, 255),
                -1,
            )

            cv2.putText(
                frame,
                "No LiDAR depth",
                (48, WINDOW_HEIGHT - 20),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
            )

            # ---------------------------------
            # Show window
            # ---------------------------------

            cv2.imshow(
                "DavaX iPhone Hand Tracking",
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
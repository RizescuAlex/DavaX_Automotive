import cv2


HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]


def draw_hand(frame, hand) -> None:
    height, width, _ = frame.shape

    points = [
        (
            int(landmark.x * width),
            int(landmark.y * height),
        )
        for landmark in hand.landmarks
    ]

    for start, end in HAND_CONNECTIONS:
        cv2.line(
            frame,
            points[start],
            points[end],
            (0, 255, 0),
            2,
        )

    for point in points:
        cv2.circle(
            frame,
            point,
            5,
            (0, 0, 255),
            -1,
        )


def draw_gesture(
    frame,
    hand,
    gesture,
) -> None:
    height, width, _ = frame.shape

    wrist = hand.landmarks[0]

    x = int(wrist.x * width)
    y = int(wrist.y * height)

    status = (
        "STABLE"
        if gesture.stable
        else "detecting"
    )

    text = (
        f"{gesture.handedness}: "
        f"{gesture.label} "
        f"{gesture.confidence:.2f} "
        f"[{status}]"
    )

    cv2.putText(
        frame,
        text,
        (x, max(y - 30, 20)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 0),
        2,
    )
import cv2

from .camera import Camera
from .gesture_recognizer import GestureRecognizer
from .visualizer import draw_hand


def run() -> None:
    camera = Camera()
    recognizer = GestureRecognizer()

    camera.start()

    try:
        for frame in camera.frames():
            hands = recognizer.process(frame)

            for hand in hands:
                draw_hand(frame, hand)

                if hand.gesture != "None":
                    wrist = hand.landmarks[0]

                    height, width, _ = frame.shape

                    x = int(wrist.x * width)
                    y = int(wrist.y * height)

                    text = (
                        f"{hand.gesture} "
                        f"{hand.gesture_confidence:.2f}"
                    )

                    cv2.putText(
                        frame,
                        text,
                        (x, max(y - 30, 30)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (255, 255, 0),
                        2,
                    )

            cv2.imshow(
                "Gesture Recognition",
                frame,
            )

            if (
                cv2.waitKey(1) & 0xFF
                == ord("q")
            ):
                break

    finally:
        camera.stop()
        recognizer.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    run()
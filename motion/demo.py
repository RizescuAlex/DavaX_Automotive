import cv2

from .camera import Camera
from .hand_tracker import HandTracker
from .visualizer import draw_hand


def run() -> None:
    camera = Camera()
    tracker = HandTracker()

    camera.start()

    try:
        for frame in camera.frames():
            hands = tracker.process(frame)

            for hand in hands:
                draw_hand(frame, hand)

            cv2.putText(
                frame,
                f"Hands detected: {len(hands)}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0),
                2,
            )

            cv2.imshow("Motion Detection", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        camera.stop()
        tracker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    run()
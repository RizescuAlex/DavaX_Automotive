import cv2
import mediapipe as mp
import math
from collections import deque


class AirDialVolume:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils

        # Stores the last 30 positions of the index finger to calculate the circle's center
        self.path = deque(maxlen=30)
        self.prev_angle = None
        self.current_volume = 50.0

    def is_pointing(self, landmarks):
        """Checks if the index finger is extended and the middle finger is folded."""
        wrist = landmarks[0]

        # Distance from wrist to tips vs wrist to knuckles (MCP)
        index_tip = math.hypot(landmarks[8].x - wrist.x, landmarks[8].y - wrist.y)
        index_mcp = math.hypot(landmarks[5].x - wrist.x, landmarks[5].y - wrist.y)

        middle_tip = math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y)
        middle_mcp = math.hypot(landmarks[9].x - wrist.x, landmarks[9].y - wrist.y)

        # Active if index is extended (tip further than knuckle) and middle is folded
        return (index_tip > index_mcp) and (middle_tip < middle_mcp)

    def process_frame(self, img):
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.hands.process(img_rgb)

        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]

            # Draw the basic skeleton structure for context, but make it faint
            self.mp_draw.draw_landmarks(
                img, hand_landmarks, self.mp_hands.HAND_CONNECTIONS,
                self.mp_draw.DrawingSpec(color=(100, 100, 100), thickness=1, circle_radius=1),
                self.mp_draw.DrawingSpec(color=(100, 100, 100), thickness=1)
            )

            h, w, _ = img.shape
            index = hand_landmarks.landmark[8]
            ix, iy = int(index.x * w), int(index.y * h)

            # 1. Check if the user is making the "Pointing" gesture
            if self.is_pointing(hand_landmarks.landmark):
                # Add the current finger position to our memory trail
                self.path.append((ix, iy))

                # Draw the trail of the circle being drawn
                for i in range(1, len(self.path)):
                    cv2.line(img, self.path[i - 1], self.path[i], (0, 255, 255), 2)

                # Highlight the finger tip
                cv2.circle(img, (ix, iy), 8, (0, 255, 0), cv2.FILLED)

                # 2. Need enough history to figure out where the center of the circle is
                if len(self.path) > 10:
                    # Calculate the Centroid (average X and Y of the trail)
                    cx = int(sum(p[0] for p in self.path) / len(self.path))
                    cy = int(sum(p[1] for p in self.path) / len(self.path))

                    # Draw a crosshair at the calculated center of the circle
                    cv2.drawMarker(img, (cx, cy), (0, 0, 255), cv2.MARKER_CROSS, 15, 2)

                    # Draw a "radar line" from the center to the finger
                    cv2.line(img, (cx, cy), (ix, iy), (0, 255, 0), 2)

                    # 3. Calculate rotation angle around that dynamic center
                    angle = math.degrees(math.atan2((cy - iy), (ix - cx)))

                    if self.prev_angle is not None:
                        delta_angle = angle - self.prev_angle

                        # Handle the jump when crossing the -180/180 degree line
                        if delta_angle > 180: delta_angle -= 360
                        if delta_angle < -180: delta_angle += 360

                        # Ignore massive jumps (usually caused by tracking glitches)
                        if abs(delta_angle) < 50:
                            # Adjust the '0.1' to change how fast the volume turns
                            self.current_volume -= (delta_angle * 0.15)
                            self.current_volume = max(0, min(100, self.current_volume))

                    self.prev_angle = angle
            else:
                # 4. If not pointing, wipe the memory and wait for the gesture to start again
                self.path.clear()
                self.prev_angle = None
                cv2.circle(img, (ix, iy), 8, (0, 0, 255), cv2.FILLED)  # Red = Paused

        self.draw_ui(img)
        return img

    def draw_ui(self, img):
        vol_bar_y = int(400 - (300 * (self.current_volume / 100)))
        cv2.rectangle(img, (50, 100), (85, 400), (255, 0, 0), 3)
        cv2.rectangle(img, (50, vol_bar_y), (85, 400), (255, 0, 0), cv2.FILLED)
        cv2.putText(img, f'{int(self.current_volume)}%', (40, 90),
                    cv2.FONT_HERSHEY_COMPLEX, 1, (255, 0, 0), 2)


def main():
    cap = cv2.VideoCapture(1)
    dial = AirDialVolume()

    while True:
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)  # Mirror image for intuitive movement

        frame = dial.process_frame(frame)
        cv2.imshow("Air Dial Volume Control", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
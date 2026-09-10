import cv2
import mediapipe as mp
import math


class FineTunedBMWVolume:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils

        self.prev_angle = None
        self.current_volume = 50.0

        # Variables to hold our smoothed coordinates
        self.kx_smooth, self.ky_smooth = None, None
        self.tx_smooth, self.ty_smooth = None, None

    def is_pointing(self, landmarks):
        wrist = landmarks[0]

        def is_extended(tip_id, mcp_id):
            tip_dist = math.hypot(landmarks[tip_id].x - wrist.x, landmarks[tip_id].y - wrist.y)
            mcp_dist = math.hypot(landmarks[mcp_id].x - wrist.x, landmarks[mcp_id].y - wrist.y)
            return tip_dist > mcp_dist

        return is_extended(8, 5) and not is_extended(12, 9) and not is_extended(16, 13)

    def process_frame(self, img):
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.hands.process(img_rgb)

        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]

            h, w, _ = img.shape
            knuckle = hand_landmarks.landmark[5]
            tip = hand_landmarks.landmark[8]

            # Raw pixel coordinates
            kx, ky = int(knuckle.x * w), int(knuckle.y * h)
            tx, ty = int(tip.x * w), int(tip.y * h)

            if self.is_pointing(hand_landmarks.landmark):
                # 1. APPLY SMOOTHING FILTER (Exponential Moving Average)
                # 0.4 determines how "heavy" the knob feels. Lower = smoother but more delay.
                alpha = 0.4

                if self.kx_smooth is None:
                    # First frame: snap to current position
                    self.kx_smooth, self.ky_smooth = kx, ky
                    self.tx_smooth, self.ty_smooth = tx, ty
                else:
                    # Blend the new position with the old position
                    self.kx_smooth += alpha * (kx - self.kx_smooth)
                    self.ky_smooth += alpha * (ky - self.ky_smooth)
                    self.tx_smooth += alpha * (tx - self.tx_smooth)
                    self.ty_smooth += alpha * (ty - self.ty_smooth)

                # Draw the UI using the SMOOTHED coordinates, not the raw ones
                cv2.circle(img, (int(self.kx_smooth), int(self.ky_smooth)), 40, (255, 255, 255), 2)
                cv2.circle(img, (int(self.kx_smooth), int(self.ky_smooth)), 5, (0, 0, 255), cv2.FILLED)
                cv2.line(img, (int(self.kx_smooth), int(self.ky_smooth)),
                         (int(self.tx_smooth), int(self.ty_smooth)), (0, 255, 0), 4)

                # 2. Calculate angle based on smoothed points
                angle = math.degrees(math.atan2((self.ky_smooth - self.ty_smooth), (self.tx_smooth - self.kx_smooth)))

                if self.prev_angle is not None:
                    delta_angle = angle - self.prev_angle

                    if delta_angle > 180: delta_angle -= 360
                    if delta_angle < -180: delta_angle += 360

                    # 3. DEADZONE & SPIKE REJECTION
                    # Ignore changes smaller than 1.5 degrees (tremors)
                    # Ignore changes larger than 25 degrees (tracking glitches)
                    if 1.5 < abs(delta_angle) < 25:
                        # Sensitivity is lowered to 0.15 for finer control
                        self.current_volume -= (delta_angle * 0.15)
                        self.current_volume = max(0, min(100, self.current_volume))

                self.prev_angle = angle
            else:
                # Reset tracking variables when you stop pointing
                self.prev_angle = None
                self.kx_smooth = None

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
    controller = FineTunedBMWVolume()

    while True:
        success, frame = cap.read()
        if not success: break

        frame = cv2.flip(frame, 1)
        frame = controller.process_frame(frame)
        cv2.imshow("Fine-Tuned BMW Gesture", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
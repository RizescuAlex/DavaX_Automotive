import cv2
import mediapipe as mp
import time
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
        self.path = deque(maxlen=20)  # Visual trace
        
        # We now store the last 2 recorded points to calculate trajectory angles
        self.gesture_points = deque(maxlen=2)
        self.last_time = 0.0
        self.min_time_gap = 0.08  # 80ms gap ensures clean vector calculations
        
        self.current_volume = 50.0
        self.volume_step = 2.0  # Slightly increased since small circles are faster
        self.last_turn_direction = 0

    def update_volume_from_angle(self, p1, p2, p3):
        """
        Calculates the angle change between two consecutive movement vectors.
        This allows rotation detection ANYWHERE on the screen, for any circle size.
        """
        # Convert to standard Cartesian coordinates (invert Y so UP is positive)
        x1, y1 = p1[0], -p1[1]
        x2, y2 = p2[0], -p2[1]
        x3, y3 = p3[0], -p3[1]

        # Create two velocity vectors
        v1_x, v1_y = x2 - x1, y2 - y1
        v2_x, v2_y = x3 - x2, y3 - y2

        # Filter out tiny jitters/noise if the hand is staying still
        dist1 = math.hypot(v1_x, v1_y)
        dist2 = math.hypot(v2_x, v2_y)
        if dist1 < 4 or dist2 < 4:
            return 0  

        # Calculate the absolute angle of each movement
        angle1 = math.atan2(v1_y, v1_x)
        angle2 = math.atan2(v2_y, v2_x)

        # Find the difference in angle between the two movements
        angle_diff = angle2 - angle1

        # Normalize the difference to roughly [-pi, pi]
        while angle_diff > math.pi:
            angle_diff -= 2 * math.pi
        while angle_diff < -math.pi:
            angle_diff += 2 * math.pi

        # Apply a small deadzone (0.1 radians) so straight lines don't trigger volume
        if angle_diff < -0.1:  # Negative angle change = Clockwise turn
            self.current_volume += self.volume_step
            self.current_volume = max(0.0, min(100.0, self.current_volume))
            return -1  # Turning Right / Up
            
        elif angle_diff > 0.1: # Positive angle change = Counter-Clockwise turn
            self.current_volume -= self.volume_step
            self.current_volume = max(0.0, min(100.0, self.current_volume))
            return 1   # Turning Left / Down

        return 0

    def process_frame(self, img):
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.hands.process(img_rgb)

        h, w = img.shape[:2]
        current_time = time.time()

        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]

            index = hand_landmarks.landmark[8]
            ix, iy = int(index.x * w), int(index.y * h)
            current_point = (ix, iy)
            
            self.path.append(current_point)

            # Every ~80ms, evaluate the movement path
            if current_time - self.last_time >= self.min_time_gap:
                if len(self.gesture_points) == 2:
                    self.last_turn_direction = self.update_volume_from_angle(
                        self.gesture_points[0], 
                        self.gesture_points[1], 
                        current_point
                    )
                
                self.gesture_points.append(current_point)
                self.last_time = current_time

            # Draw visual trace
            for previous, current in zip(self.path, list(self.path)[1:]):
                cv2.line(img, previous, current, (0, 220, 255), 2)
            cv2.circle(img, current_point, 8, (0, 255, 0), cv2.FILLED)

        else:
            # Clear state when hand leaves the frame
            self.path.clear()
            self.gesture_points.clear()
            self.last_turn_direction = 0

        # Update UI text based on the last detected turn direction
        if self.last_turn_direction == -1:
            direction_text = "+ / volume up (cw)"
        elif self.last_turn_direction == 1:
            direction_text = "- / volume down (ccw)"
        else:
            direction_text = "0 / mostly straight"
            
        cv2.putText(img, direction_text, (105, 35), cv2.FONT_HERSHEY_SIMPLEX,
                    0.65, (0, 220, 255), 2)

        self.draw_ui(img)
        return img

    def draw_ui(self, img):
        vol_bar_y = int(400 - (300 * (self.current_volume / 100)))
        cv2.rectangle(img, (50, 100), (85, 400), (255, 0, 0), 3)
        cv2.rectangle(img, (50, vol_bar_y), (85, 400), (255, 0, 0), cv2.FILLED)
        cv2.putText(img, f'{int(self.current_volume)}%', (40, 90),
                    cv2.FONT_HERSHEY_COMPLEX, 1, (255, 0, 0), 2)


def main():
    cap = cv2.VideoCapture(0)
    dial = AirDialVolume()

    while True:
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)  
        frame = dial.process_frame(frame)
        cv2.imshow("Air Dial Volume Control", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
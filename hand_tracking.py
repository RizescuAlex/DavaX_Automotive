import cv2
import mediapipe as mp
import time


class HandDetector:
    def __init__(self, mode=False, max_hands=2, detection_con=0.5, track_con=0.5):
        """
        Initializes the MediaPipe Hand tracking pipeline.
        """
        self.mode = mode
        self.max_hands = max_hands
        self.detection_con = float(detection_con)
        self.track_con = float(track_con)

        # Initialize MediaPipe Hands module
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=self.mode,
            max_num_hands=self.max_hands,
            min_detection_confidence=self.detection_con,
            min_tracking_confidence=self.track_con
        )
        # Utility to draw landmarks and connections
        self.mp_draw = mp.solutions.drawing_utils

    def find_hands(self, img, draw=True):
        """
        Processes the image, detects hands, and optionally draws the landmarks.
        """
        # MediaPipe requires RGB images, but OpenCV captures in BGR
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        self.results = self.hands.process(img_rgb)

        if self.results.multi_hand_landmarks:
            for hand_landmarks in self.results.multi_hand_landmarks:
                if draw:
                    # Draw the 21 landmarks and the connecting lines
                    self.mp_draw.draw_landmarks(
                        img,
                        hand_landmarks,
                        self.mp_hands.HAND_CONNECTIONS
                    )
        return img

    def find_position(self, img, hand_no=0, draw=True):
        """
        Extracts landmark coordinates for a specific hand.
        Returns a list of lists: [ [id, x_pixel, y_pixel, z_depth], ... ]
        """
        landmark_list = []

        if self.results.multi_hand_landmarks:
            # Select the specified hand (defaults to the first hand detected)
            my_hand = self.results.multi_hand_landmarks[hand_no]

            for id, lm in enumerate(my_hand.landmark):
                # MediaPipe returns normalized coordinates (0 to 1)
                # We multiply by image dimensions to get actual pixel values
                h, w, c = img.shape
                cx, cy = int(lm.x * w), int(lm.y * h)

                # z is the depth from the camera (negative is closer)
                # We leave it raw as it's useful for 3D gesture math
                cz = lm.z

                landmark_list.append([id, cx, cy, cz])

                # Optional: Highlight specific landmarks (e.g., fingertips)
                if draw:
                    cv2.circle(img, (cx, cy), 30, (125, 0, 255), cv2.FILLED)

        return landmark_list


def main():
    # 0 is usually the built-in webcam
    cap = cv2.VideoCapture(1)

    # Initialize our custom detector
    detector = HandDetector()

    # Variables for FPS calculation
    prev_time = 0
    curr_time = 0

    while True:
        success, img = cap.read()
        if not success:
            print("Failed to grab frame")
            break

        # 1. Find hands and draw landmarks
        img = detector.find_hands(img)

        # 2. Extract specific landmark coordinates
        landmark_list = detector.find_position(img, draw=False)

        # If we found data, print the coordinates of the Index Finger Tip (ID 8)
        if len(landmark_list) != 0:
            print(f"Index Finger Tip: X:{landmark_list[8][1]} Y:{landmark_list[8][2]}")

        # 3. Calculate and display FPS
        curr_time = time.time()
        fps = 1 / (curr_time - prev_time)
        prev_time = curr_time

        cv2.putText(img, f'FPS: {int(fps)}', (10, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        # 4. Display the output
        cv2.imshow("Hand Tracking Pipeline", img)

        # Press 'q' to exit the loop
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
import cv2
import math
import time
import subprocess
import numpy as np

from collections import deque

from motion.latest_iphone_receiver import LatestIPhoneReceiver


# ============================================================
# CONFIGURATION
# ============================================================

WINDOW_WIDTH = 900
WINDOW_HEIGHT = 900


# ------------------------------------------------------------
# CAMERA ORIENTATION
#
# If passenger-side swipe gives PREVIOUS instead of NEXT:
# change 1 to -1.
# ------------------------------------------------------------

CAMERA_X_TO_PASSENGER = 1


# ------------------------------------------------------------
# CIRCLE ORIENTATION
#
# If physical clockwise decreases volume:
# change 1 to -1.
# ------------------------------------------------------------

CIRCLE_DIRECTION = 1


# ============================================================
# RESPONSIVENESS
# ============================================================

CIRCLE_HISTORY = 30
CIRCLE_MIN_POINTS = 8

CIRCLE_MIN_RADIUS = 0.018
CIRCLE_MIN_AXIS_RANGE = 0.035

CIRCLE_TRIGGER_DEGREES = 210.0
CIRCLE_MAX_DEPTH_CHANGE = 0.20

CIRCLE_COOLDOWN = 0.25


SWIPE_HISTORY = 12
SWIPE_MIN_POINTS = 4

SWIPE_MIN_DISTANCE = 0.10
SWIPE_MAX_VERTICAL = 0.13
SWIPE_MAX_DEPTH_CHANGE = 0.18

SWIPE_COOLDOWN = 0.30


# ------------------------------------------------------------
# TWO-FINGER PLAY/PAUSE
#
# Pose must remain valid for this long before triggering.
# After triggering, user must leave the pose before it
# can trigger again.
# ------------------------------------------------------------

TWO_FINGER_HOLD_TIME = 0.20


# Pose gestures recognized directly from the phone landmark stream.
THUMB_VERTICAL_MARGIN = 0.08
THUMB_HISTORY = 5


# ------------------------------------------------------------
# Spotify
# ------------------------------------------------------------

SPOTIFY_VOLUME_STEP = 5


# ============================================================
# HAND CONNECTIONS
# ============================================================

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

    # Little
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),

    # Palm
    (0, 17),
]


# ============================================================
# SPOTIFY CONTROLLER
# ============================================================

class SpotifyController:

    def __init__(self):
        self.last_command_time = 0.0

    def _run_script(self, script):

        try:
            subprocess.Popen(
                [
                    "osascript",
                    "-e",
                    script,
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        except Exception as error:
            print(
                "Spotify command error:",
                error,
            )

    def play_pause(self):

        print(
            "SPOTIFY: PLAY / PAUSE"
        )

        self._run_script(
            'tell application "Spotify" to playpause'
        )

    def next_track(self):

        print(
            "SPOTIFY: NEXT TRACK"
        )

        self._run_script(
            'tell application "Spotify" to next track'
        )

    def previous_track(self):

        print(
            "SPOTIFY: PREVIOUS TRACK"
        )

        self._run_script(
            'tell application "Spotify" to previous track'
        )

    def volume_up(self):

        print(
            "SPOTIFY: VOLUME UP"
        )

        script = f'''
        tell application "Spotify"
            set currentVolume to sound volume
            set newVolume to currentVolume + {SPOTIFY_VOLUME_STEP}

            if newVolume > 100 then
                set newVolume to 100
            end if

            set sound volume to newVolume
        end tell
        '''

        self._run_script(
            script
        )

    def volume_down(self):

        print(
            "SPOTIFY: VOLUME DOWN"
        )

        script = f'''
        tell application "Spotify"
            set currentVolume to sound volume
            set newVolume to currentVolume - {SPOTIFY_VOLUME_STEP}

            if newVolume < 0 then
                set newVolume to 0
            end if

            set sound volume to newVolume
        end tell
        '''

        self._run_script(
            script
        )


# ============================================================
# UTILITIES
# ============================================================

def distance_2d(a, b):

    return math.hypot(
        a.x - b.x,
        a.y - b.y,
    )


def landmark_to_pixel(landmark):

    x = int(
        landmark.x
        * WINDOW_WIDTH
    )

    y = int(
        landmark.y
        * WINDOW_HEIGHT
    )

    x = max(
        0,
        min(
            WINDOW_WIDTH - 1,
            x,
        ),
    )

    y = max(
        0,
        min(
            WINDOW_HEIGHT - 1,
            y,
        ),
    )

    return x, y


def palm_center(hand):

    lm = hand.landmarks

    palm_ids = [
        0,
        5,
        9,
        13,
        17,
    ]

    x = sum(
        lm[i].x
        for i in palm_ids
    ) / len(palm_ids)

    y = sum(
        lm[i].y
        for i in palm_ids
    ) / len(palm_ids)

    valid_depths = [
        lm[i].z
        for i in palm_ids
        if (
            lm[i].z is not None
            and lm[i].z > 0
        )
    ]

    if valid_depths:

        z = (
            sum(valid_depths)
            / len(valid_depths)
        )

    else:

        z = None

    return x, y, z


# ============================================================
# FINGER DETECTION
# ============================================================

def finger_extended(
    landmarks,
    tip_id,
    pip_id,
    mcp_id,
):

    wrist = landmarks[0]

    tip_distance = distance_2d(
        landmarks[tip_id],
        wrist,
    )

    pip_distance = distance_2d(
        landmarks[pip_id],
        wrist,
    )

    mcp_distance = distance_2d(
        landmarks[mcp_id],
        wrist,
    )

    return (
        tip_distance > pip_distance
        and pip_distance > mcp_distance
    )


# ============================================================
# INDEX POINTING
# ============================================================

def index_pointing_pose(hand):

    lm = hand.landmarks

    if len(lm) != 21:
        return False

    index_extended = finger_extended(
        lm,
        8,
        6,
        5,
    )

    middle_extended = finger_extended(
        lm,
        12,
        10,
        9,
    )

    ring_extended = finger_extended(
        lm,
        16,
        14,
        13,
    )

    little_extended = finger_extended(
        lm,
        20,
        18,
        17,
    )

    return (
        index_extended
        and not middle_extended
        and not ring_extended
        and not little_extended
    )


# ============================================================
# OPEN HAND
# ============================================================

def open_hand_pose(hand):

    lm = hand.landmarks

    if len(lm) != 21:
        return False

    states = [
        finger_extended(
            lm,
            8,
            6,
            5,
        ),

        finger_extended(
            lm,
            12,
            10,
            9,
        ),

        finger_extended(
            lm,
            16,
            14,
            13,
        ),

        finger_extended(
            lm,
            20,
            18,
            17,
        ),
    ]

    return (
        sum(states) >= 3
    )


# ============================================================
# TWO FINGER POSE
#
# Index + middle extended
# Ring + little folded
# ============================================================

def two_finger_pose(hand):

    lm = hand.landmarks

    if len(lm) != 21:
        return False

    index_extended = finger_extended(
        lm,
        8,
        6,
        5,
    )

    middle_extended = finger_extended(
        lm,
        12,
        10,
        9,
    )

    ring_extended = finger_extended(
        lm,
        16,
        14,
        13,
    )

    little_extended = finger_extended(
        lm,
        20,
        18,
        17,
    )

    return (
        index_extended
        and middle_extended
        and not ring_extended
        and not little_extended
    )


def thumb_gesture(hand):
    """Return THUMB_UP, THUMB_DOWN, or None from 21 hand landmarks."""
    lm = hand.landmarks
    if len(lm) != 21:
        return None

    other_fingers_folded = all(
        not finger_extended(lm, tip_id, pip_id, mcp_id)
        for tip_id, pip_id, mcp_id in (
            (8, 6, 5), (12, 10, 9), (16, 14, 13), (20, 18, 17)
        )
    )
    if not other_fingers_folded:
        return None

    _, palm_y, _ = palm_center(hand)
    thumb_tip = lm[4]
    thumb_ip = lm[3]

    if (thumb_tip.y < palm_y - THUMB_VERTICAL_MARGIN
            and thumb_tip.y < thumb_ip.y):
        return "THUMB_UP"
    if (thumb_tip.y > palm_y + THUMB_VERTICAL_MARGIN
            and thumb_tip.y > thumb_ip.y):
        return "THUMB_DOWN"
    return None


class ThumbGestureRecognizer:
    """Debounce thumb poses and emit each pose once until released."""

    def __init__(self, history_size=THUMB_HISTORY):
        self.history = deque(maxlen=history_size)
        self.triggered = False

    def reset(self):
        self.history.clear()
        self.triggered = False

    def update(self, hand):
        gesture = thumb_gesture(hand)
        self.history.append(gesture)
        if gesture is None:
            self.triggered = False
            return "Waiting"

        stable = (len(self.history) == self.history.maxlen
                  and all(previous == gesture for previous in self.history))
        if stable and not self.triggered:
            self.triggered = True
            return gesture
        return "Triggered" if self.triggered else "Holding"


# ============================================================
# TWO FINGER PLAY/PAUSE RECOGNIZER
# ============================================================

class TwoFingerGestureRecognizer:

    def __init__(self):

        self.pose_start_time = None

        self.triggered = False

        self.progress = 0.0

    def reset(self):

        self.pose_start_time = None
        self.triggered = False
        self.progress = 0.0

    def update(self, hand):

        pose = two_finger_pose(
            hand
        )

        now = time.monotonic()

        # User left the pose.
        #
        # Rearm for the next play/pause gesture.
        if not pose:

            self.pose_start_time = None

            self.triggered = False

            self.progress = 0.0

            return "Waiting"

        # First frame of pose.
        if self.pose_start_time is None:

            self.pose_start_time = now

            return "Holding"

        elapsed = (
            now
            - self.pose_start_time
        )

        self.progress = min(
            elapsed
            / TWO_FINGER_HOLD_TIME,
            1.0,
        )

        # Already triggered.
        # Do not repeatedly toggle Spotify while user
        # continues holding two fingers up.
        if self.triggered:

            return "Triggered"

        if (
            elapsed
            >= TWO_FINGER_HOLD_TIME
        ):

            self.triggered = True

            return "PLAY_PAUSE"

        return "Holding"


# ============================================================
# CIRCLE / VOLUME
# ============================================================

class CircularGestureRecognizer:

    def __init__(self):

        self.points = deque(
            maxlen=CIRCLE_HISTORY
        )

        self.depths = deque(
            maxlen=CIRCLE_HISTORY
        )

        self.rotation_degrees = 0.0

        self.radius = 0.0

        self.cooldown_until = 0.0

    def reset_tracking(self):

        self.points.clear()

        self.depths.clear()

        self.rotation_degrees = 0.0

        self.radius = 0.0

    def in_cooldown(self):

        return (
            time.monotonic()
            < self.cooldown_until
        )

    def update(self, hand):

        if self.in_cooldown():

            return "Cooldown"

        if len(hand.landmarks) != 21:

            self.reset_tracking()

            return "No hand"

        if not index_pointing_pose(
            hand
        ):

            self.reset_tracking()

            return (
                "Waiting for pointing"
            )

        index_tip = (
            hand.landmarks[8]
        )

        self.points.append(
            (
                index_tip.x,
                index_tip.y,
            )
        )

        if (
            index_tip.z is not None
            and index_tip.z > 0
        ):

            self.depths.append(
                index_tip.z
            )

        if (
            len(self.points)
            < CIRCLE_MIN_POINTS
        ):

            return (
                "Tracking circle"
            )

        points = np.array(
            self.points,
            dtype=np.float32,
        )

        center = points.mean(
            axis=0
        )

        centered = (
            points
            - center
        )

        distances = (
            np.linalg.norm(
                centered,
                axis=1,
            )
        )

        self.radius = float(
            distances.mean()
        )

        if (
            self.radius
            < CIRCLE_MIN_RADIUS
        ):

            return (
                "Tracking circle"
            )

        x_range = float(
            points[:, 0].max()
            - points[:, 0].min()
        )

        y_range = float(
            points[:, 1].max()
            - points[:, 1].min()
        )

        if (
            x_range
            < CIRCLE_MIN_AXIS_RANGE
            or
            y_range
            < CIRCLE_MIN_AXIS_RANGE
        ):

            return (
                "Tracking circle"
            )

        total_angle = 0.0

        previous_angle = None

        for point in centered:

            angle = math.atan2(
                point[1],
                point[0],
            )

            if previous_angle is not None:

                delta = (
                    angle
                    - previous_angle
                )

                while (
                    delta > math.pi
                ):

                    delta -= (
                        2 * math.pi
                    )

                while (
                    delta < -math.pi
                ):

                    delta += (
                        2 * math.pi
                    )

                total_angle += (
                    delta
                )

            previous_angle = (
                angle
            )

        raw_degrees = (
            math.degrees(
                total_angle
            )
        )

        self.rotation_degrees = (
            raw_degrees
            * CIRCLE_DIRECTION
        )

        # -----------------------------------------
        # LiDAR stability
        # -----------------------------------------

        if len(self.depths) >= 6:

            depth_range = (
                max(self.depths)
                - min(self.depths)
            )

            if (
                depth_range
                > CIRCLE_MAX_DEPTH_CHANGE
            ):

                return (
                    "Tracking circle"
                )

        # -----------------------------------------
        # Trigger
        # -----------------------------------------

        if (
            abs(
                self.rotation_degrees
            )
            >= CIRCLE_TRIGGER_DEGREES
        ):

            if (
                self.rotation_degrees
                > 0
            ):

                result = (
                    "VOLUME_UP"
                )

            else:

                result = (
                    "VOLUME_DOWN"
                )

            self.cooldown_until = (
                time.monotonic()
                + CIRCLE_COOLDOWN
            )

            self.reset_tracking()

            return result

        return "Tracking circle"


# ============================================================
# SWIPE / SONG CONTROL
# ============================================================

class SwipeGestureRecognizer:

    def __init__(self):

        self.points = deque(
            maxlen=SWIPE_HISTORY
        )

        self.horizontal_movement = (
            0.0
        )

        self.vertical_movement = (
            0.0
        )

        self.depth_movement = (
            0.0
        )

        self.cooldown_until = (
            0.0
        )

    def reset_tracking(self):

        self.points.clear()

        self.horizontal_movement = (
            0.0
        )

        self.vertical_movement = (
            0.0
        )

        self.depth_movement = (
            0.0
        )

    def in_cooldown(self):

        return (
            time.monotonic()
            < self.cooldown_until
        )

    def update(self, hand):

        if self.in_cooldown():

            return "Cooldown"

        if len(hand.landmarks) != 21:

            self.reset_tracking()

            return "No hand"

        if not open_hand_pose(
            hand
        ):

            self.reset_tracking()

            return (
                "Waiting for open hand"
            )

        x, y, z = palm_center(
            hand
        )

        self.points.append(
            (
                x,
                y,
                z,
            )
        )

        if (
            len(self.points)
            < SWIPE_MIN_POINTS
        ):

            return (
                "Tracking swipe"
            )

        (
            first_x,
            first_y,
            first_z,
        ) = self.points[0]

        (
            last_x,
            last_y,
            last_z,
        ) = self.points[-1]

        raw_dx = (
            last_x
            - first_x
        )

        dx = (
            raw_dx
            * CAMERA_X_TO_PASSENGER
        )

        dy = (
            last_y
            - first_y
        )

        if (
            first_z is not None
            and last_z is not None
        ):

            dz = (
                last_z
                - first_z
            )

        else:

            dz = 0.0

        self.horizontal_movement = (
            dx
        )

        self.vertical_movement = (
            dy
        )

        self.depth_movement = (
            dz
        )

        if (
            abs(dx)
            < SWIPE_MIN_DISTANCE
        ):

            return (
                "Tracking swipe"
            )

        if (
            abs(dy)
            > SWIPE_MAX_VERTICAL
        ):

            self.reset_tracking()

            return (
                "Rejected: vertical"
            )

        if (
            abs(dz)
            > SWIPE_MAX_DEPTH_CHANGE
        ):

            self.reset_tracking()

            return (
                "Rejected: depth"
            )

        if dx > 0:

            result = (
                "NEXT_SONG"
            )

        else:

            result = (
                "PREVIOUS_SONG"
            )

        self.cooldown_until = (
            time.monotonic()
            + SWIPE_COOLDOWN
        )

        self.reset_tracking()

        return result


# ============================================================
# DRAW HAND
# ============================================================

def draw_hand(
    frame,
    hand,
):

    lm = hand.landmarks

    if len(lm) != 21:
        return

    points = [
        landmark_to_pixel(
            landmark
        )
        for landmark in lm
    ]

    for start, end in HAND_CONNECTIONS:

        cv2.line(
            frame,
            points[start],
            points[end],
            (60, 60, 60),
            3,
            cv2.LINE_AA,
        )

    for i, landmark in enumerate(
        lm
    ):

        x, y = points[i]

        valid_depth = (
            landmark.z is not None
            and landmark.z > 0
        )

        if valid_depth:

            color = (
                0,
                190,
                0,
            )

        else:

            color = (
                0,
                0,
                255,
            )

        cv2.circle(
            frame,
            (
                x,
                y,
            ),
            8,
            color,
            -1,
            cv2.LINE_AA,
        )

        cv2.putText(
            frame,
            str(i),
            (
                x + 9,
                y - 8,
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )


# ============================================================
# TRAJECTORY DRAWING
# ============================================================

def draw_circle_trajectory(
    frame,
    recognizer,
):

    if (
        len(recognizer.points)
        < 2
    ):
        return

    trajectory = []

    for x, y in recognizer.points:

        trajectory.append(
            (
                int(
                    x
                    * WINDOW_WIDTH
                ),
                int(
                    y
                    * WINDOW_HEIGHT
                ),
            )
        )

    for i in range(
        1,
        len(trajectory),
    ):

        cv2.line(
            frame,
            trajectory[i - 1],
            trajectory[i],
            (255, 120, 0),
            3,
            cv2.LINE_AA,
        )


def draw_swipe_trajectory(
    frame,
    recognizer,
):

    if (
        len(recognizer.points)
        < 2
    ):
        return

    trajectory = []

    for x, y, z in recognizer.points:

        trajectory.append(
            (
                int(
                    x
                    * WINDOW_WIDTH
                ),
                int(
                    y
                    * WINDOW_HEIGHT
                ),
            )
        )

    for i in range(
        1,
        len(trajectory),
    ):

        cv2.line(
            frame,
            trajectory[i - 1],
            trajectory[i],
            (180, 0, 180),
            4,
            cv2.LINE_AA,
        )


# ============================================================
# MAIN
# ============================================================

def main():

    receiver = LatestIPhoneReceiver(
        host="0.0.0.0",
        port=5005,
    )

    receiver.start()


    spotify = SpotifyController()


    circle_recognizer = (
        CircularGestureRecognizer()
    )

    swipe_recognizer = (
        SwipeGestureRecognizer()
    )

    two_finger_recognizer = (
        TwoFingerGestureRecognizer()
    )

    thumb_recognizer = ThumbGestureRecognizer()


    window_name = (
        "DavaX BMW Gesture Control"
    )

    cv2.namedWindow(
        window_name,
        cv2.WINDOW_NORMAL,
    )


    last_processed_packet = -1

    circle_state = "Waiting"

    swipe_state = "Waiting"

    two_finger_state = "Waiting"

    thumb_state = "Waiting"

    last_action = "None"

    action_display_until = 0.0


    try:

        while True:

            (
                timestamp,
                hands,
                packet_number,
            ) = receiver.get_latest()


            new_packet = (
                packet_number
                != last_processed_packet
            )

            if new_packet:

                last_processed_packet = (
                    packet_number
                )


            # =================================================
            # CANVAS
            # =================================================

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
                "DavaX - BMW Style Spotify Control",
                (25, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 0, 0),
                2,
                cv2.LINE_AA,
            )


            pointing = False

            open_hand = False

            two_fingers = False

            index_depth_text = "--"

            palm_depth_text = "--"


            # =================================================
            # HAND
            # =================================================

            if hands:

                hand = hands[0]


                draw_hand(
                    frame,
                    hand,
                )


                pointing = (
                    index_pointing_pose(
                        hand
                    )
                )

                open_hand = (
                    open_hand_pose(
                        hand
                    )
                )

                two_fingers = (
                    two_finger_pose(
                        hand
                    )
                )


                if (
                    len(hand.landmarks)
                    == 21
                ):

                    index_tip = (
                        hand.landmarks[8]
                    )

                    if (
                        index_tip.z
                        is not None
                        and index_tip.z > 0
                    ):

                        index_depth_text = (
                            f"{index_tip.z:.3f} m"
                        )


                    _, _, palm_z = (
                        palm_center(
                            hand
                        )
                    )

                    if (
                        palm_z is not None
                        and palm_z > 0
                    ):

                        palm_depth_text = (
                            f"{palm_z:.3f} m"
                        )


                # =============================================
                # ONLY PROCESS NEW SENSOR PACKETS
                # =============================================

                if new_packet:

                    # -----------------------------------------
                    # TWO-FINGER PLAY / PAUSE
                    #
                    # Check this first.
                    # -----------------------------------------

                    thumb_result = thumb_recognizer.update(hand)
                    thumb_state = thumb_result

                    if thumb_result in ("THUMB_UP", "THUMB_DOWN"):
                        last_action = thumb_result
                        action_display_until = time.monotonic() + 0.75
                        two_finger_recognizer.reset()
                        circle_recognizer.reset_tracking()
                        swipe_recognizer.reset_tracking()

                    two_finger_result = (
                        two_finger_recognizer.update(
                            hand
                        )
                    )

                    two_finger_state = (
                        two_finger_result
                    )


                    if thumb_result in ("THUMB_UP", "THUMB_DOWN"):
                        pass

                    elif (
                        two_finger_result
                        == "PLAY_PAUSE"
                    ):

                        last_action = (
                            "PLAY_PAUSE"
                        )

                        action_display_until = (
                            time.monotonic()
                            + 0.75
                        )

                        circle_recognizer.reset_tracking()

                        swipe_recognizer.reset_tracking()

                        spotify.play_pause()


                    else:

                        # -------------------------------------
                        # CIRCLE
                        # -------------------------------------

                        circle_result = (
                            circle_recognizer.update(
                                hand
                            )
                        )

                        circle_state = (
                            circle_result
                        )


                        # -------------------------------------
                        # SWIPE
                        # -------------------------------------

                        swipe_result = (
                            swipe_recognizer.update(
                                hand
                            )
                        )

                        swipe_state = (
                            swipe_result
                        )


                        # =====================================
                        # VOLUME ACTION
                        # =====================================

                        if circle_result == "VOLUME_UP":

                            last_action = (
                                "VOLUME_UP"
                            )

                            action_display_until = (
                                time.monotonic()
                                + 0.75
                            )

                            swipe_recognizer.reset_tracking()

                            spotify.volume_up()


                        elif (
                            circle_result
                            == "VOLUME_DOWN"
                        ):

                            last_action = (
                                "VOLUME_DOWN"
                            )

                            action_display_until = (
                                time.monotonic()
                                + 0.75
                            )

                            swipe_recognizer.reset_tracking()

                            spotify.volume_down()


                        # =====================================
                        # NEXT SONG
                        # =====================================

                        elif (
                            swipe_result
                            == "NEXT_SONG"
                        ):

                            last_action = (
                                "NEXT_SONG"
                            )

                            action_display_until = (
                                time.monotonic()
                                + 0.75
                            )

                            circle_recognizer.reset_tracking()

                            spotify.next_track()


                        # =====================================
                        # PREVIOUS SONG
                        # =====================================

                        elif (
                            swipe_result
                            == "PREVIOUS_SONG"
                        ):

                            last_action = (
                                "PREVIOUS_SONG"
                            )

                            action_display_until = (
                                time.monotonic()
                                + 0.75
                            )

                            circle_recognizer.reset_tracking()

                            spotify.previous_track()


                # =============================================
                # TRAJECTORIES
                # =============================================

                if pointing:

                    draw_circle_trajectory(
                        frame,
                        circle_recognizer,
                    )


                if open_hand:

                    draw_swipe_trajectory(
                        frame,
                        swipe_recognizer,
                    )


            else:

                circle_state = (
                    "No hand"
                )

                swipe_state = (
                    "No hand"
                )

                two_finger_state = (
                    "No hand"
                )

                thumb_state = (
                    "No hand"
                )


            # =================================================
            # DEBUG UI
            # =================================================
            cv2.putText(
                frame,
                (
                    "Thumb gesture: "
                    f"{thumb_state}"
                ),
                (25, 57),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )

            cv2.putText(
                frame,
                (
                    "Index pointing: "
                    f"{pointing}"
                ),
                (25, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Open hand: "
                    f"{open_hand}"
                ),
                (25, 105),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Two fingers: "
                    f"{two_fingers}"
                ),
                (25, 135),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Play/Pause: "
                    f"{two_finger_state}"
                ),
                (25, 165),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )

            cv2.putText(
                frame,
                (
                    "Circle rotation: "
                    f"{circle_recognizer.rotation_degrees:.0f} deg"
                ),
                (25, 195),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Circle state: "
                    f"{circle_state}"
                ),
                (25, 225),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Swipe X: "
                    f"{swipe_recognizer.horizontal_movement:.3f}"
                ),
                (25, 255),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Swipe Y: "
                    f"{swipe_recognizer.vertical_movement:.3f}"
                ),
                (25, 285),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Swipe Z: "
                    f"{swipe_recognizer.depth_movement:.3f} m"
                ),
                (25, 315),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Swipe state: "
                    f"{swipe_state}"
                ),
                (25, 345),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Index depth: "
                    f"{index_depth_text}"
                ),
                (25, 375),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "Palm depth: "
                    f"{palm_depth_text}"
                ),
                (25, 405),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.54,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                (
                    "UDP packets: "
                    f"{packet_number}"
                ),
                (25, 435),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (100, 100, 100),
                1,
                cv2.LINE_AA,
            )


            # =================================================
            # BIG ACTION MESSAGE
            # =================================================

            if (
                time.monotonic()
                < action_display_until
            ):

                if (
                    last_action
                    == "VOLUME_UP"
                ):

                    display_text = (
                        "VOLUME UP"
                    )

                elif (
                    last_action
                    == "VOLUME_DOWN"
                ):

                    display_text = (
                        "VOLUME DOWN"
                    )

                elif (
                    last_action
                    == "NEXT_SONG"
                ):

                    display_text = (
                        "NEXT SONG"
                    )

                elif (
                    last_action
                    == "PREVIOUS_SONG"
                ):

                    display_text = (
                        "PREVIOUS SONG"
                    )

                elif (
                    last_action
                    == "PLAY_PAUSE"
                ):

                    display_text = (
                        "PLAY / PAUSE"
                    )

                elif (
                    last_action
                    == "THUMB_UP"
                ):

                    display_text = (
                        "THUMBS UP"
                    )

                elif (
                    last_action
                    == "THUMB_DOWN"
                ):

                    display_text = (
                        "THUMBS DOWN"
                    )

                else:

                    display_text = ""


                if display_text:

                    text_size, _ = (
                        cv2.getTextSize(
                            display_text,
                            cv2.FONT_HERSHEY_SIMPLEX,
                            1.20,
                            4,
                        )
                    )

                    text_x = (
                        WINDOW_WIDTH
                        - text_size[0]
                    ) // 2


                    cv2.putText(
                        frame,
                        display_text,
                        (
                            text_x,
                            505,
                        ),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1.20,
                        (0, 0, 0),
                        4,
                        cv2.LINE_AA,
                    )


            # =================================================
            # INSTRUCTIONS
            # =================================================

            cv2.putText(
                frame,
                "INDEX CIRCLE: Spotify volume",
                (
                    25,
                    WINDOW_HEIGHT - 145,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                "OPEN HAND -> PASSENGER: next song",
                (
                    25,
                    WINDOW_HEIGHT - 115,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                "OPEN HAND -> DRIVER: previous song",
                (
                    25,
                    WINDOW_HEIGHT - 85,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                "INDEX + MIDDLE: play / pause",
                (
                    25,
                    WINDOW_HEIGHT - 55,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )


            cv2.putText(
                frame,
                "q = quit",
                (
                    25,
                    WINDOW_HEIGHT - 25,
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (80, 80, 80),
                1,
                cv2.LINE_AA,
            )


            # =================================================
            # RENDER
            # =================================================

            cv2.imshow(
                window_name,
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

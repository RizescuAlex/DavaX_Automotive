from __future__ import annotations

import argparse
import importlib.util
import math
import random
import sys
import types
import unittest
from dataclasses import dataclass
from pathlib import Path


def load_bmw_module():
    sys.modules.setdefault("cv2", types.ModuleType("cv2"))
    motion = types.ModuleType("motion")
    receiver = types.ModuleType("motion.latest_iphone_receiver")

    class LatestIPhoneReceiver:  # pragma: no cover - only satisfies import
        pass

    receiver.LatestIPhoneReceiver = LatestIPhoneReceiver
    motion.latest_iphone_receiver = receiver
    sys.modules.setdefault("motion", motion)
    sys.modules.setdefault("motion.latest_iphone_receiver", receiver)

    test_dir = Path(__file__).resolve().parent
    candidate_paths = (
        test_dir / "bmw_gestures.py",
        test_dir / "upload" / "bmw_gestures.py",
    )
    path = next((candidate for candidate in candidate_paths if candidate.exists()), None)
    if path is None:
        searched = ", ".join(str(candidate) for candidate in candidate_paths)
        raise FileNotFoundError(f"Could not find bmw_gestures.py. Searched: {searched}")
    spec = importlib.util.spec_from_file_location("bmw_gestures", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


bmw = load_bmw_module()


@dataclass
class Point:
    x: float
    y: float
    z: float


@dataclass
class Hand:
    landmarks: list[Point]


FINGER_IDS = ((5, 6, 7, 8), (9, 10, 11, 12),
              (13, 14, 15, 16), (17, 18, 19, 20))
FINGER_MCP = ((-0.060, 0.000), (-0.020, -0.005),
              (0.020, -0.005), (0.060, 0.005))
FINGER_DIRECTION = ((-0.030, -0.100), (-0.010, -0.115),
                    (0.015, -0.110), (0.040, -0.095))


def make_hand(pose: str, *, seed: int, shift=(0.0, 0.0)) -> Hand:
    rng = random.Random(seed)
    points = [Point(0.5 + shift[0], 0.55 + shift[1], 0.10)]
    points.extend([
        Point(0.44 + shift[0], 0.55 + shift[1], 0.10),  # thumb chain
        Point(0.42 + shift[0], 0.53 + shift[1], 0.10),
        Point(0.40 + shift[0], 0.52 + shift[1], 0.10),
        Point(0.38 + shift[0], 0.51 + shift[1], 0.10),
    ])

    for finger_no, (mcp_id, pip_id, dip_id, tip_id) in enumerate(FINGER_IDS):
        mcp = FINGER_MCP[finger_no]
        direction = FINGER_DIRECTION[finger_no]
        if pose == "open" or (pose == "point" and finger_no == 0) \
                or (pose == "two" and finger_no < 2):
            pip_scale, dip_scale, tip_scale = 0.45, 0.78, 1.08
        else:
            pip_scale, dip_scale, tip_scale = 0.34, 0.25, 0.18

        coords = [
            mcp,
            (mcp[0] + direction[0] * pip_scale,
             mcp[1] + direction[1] * pip_scale),
            (mcp[0] + direction[0] * dip_scale,
             mcp[1] + direction[1] * dip_scale),
            (mcp[0] + direction[0] * tip_scale,
             mcp[1] + direction[1] * tip_scale),
        ]
        for point_id, (x, y) in zip((mcp_id, pip_id, dip_id, tip_id), coords):
            points.append(None)
            points[point_id] = Point(
                0.5 + shift[0] + x + rng.uniform(-0.0015, 0.0015),
                0.55 + shift[1] + y + rng.uniform(-0.0015, 0.0015),
                0.10 + rng.uniform(-0.002, 0.002),
            )

    return Hand(points)


def translated_hand(pose: str, shift, seed: int) -> Hand:
    return make_hand(pose, seed=seed, shift=shift)


def circle_sequence(direction: int, seed_offset: int = 0, imperfect=True):
    rng = random.Random(seed_offset + 7919)
    center = (0.54, 0.42)
    steps = [rng.uniform(0.65, 1.35) for _ in range(23)] if imperfect else [1.0] * 23
    step_total = sum(steps)
    frames = []
    angle = 0.0
    drift_x = drift_y = 0.0
    for frame in range(24):
        if frame:
            angle += direction * math.tau * steps[frame - 1] / step_total
            if imperfect:
                drift_x += rng.gauss(0.0, 0.0018)
                drift_y += rng.gauss(0.0, 0.0018)
        radius = 0.09 * (rng.uniform(0.88, 1.12) if imperfect else 1.0)
        tip = (center[0] + drift_x + radius * math.cos(angle),
               center[1] + drift_y + radius * math.sin(angle))
        frames.append(translated_hand(
            "point", (tip[0] - 0.47, tip[1] - 0.43), seed_offset + frame
        ))
    return frames


def swipe_sequence(xs, seed_offset: int = 0, imperfect=True):
    rng = random.Random(seed_offset + 1543)
    frames = []
    for frame in range(12):
        progress = frame / 11
        eased = progress * progress * (3.0 - 2.0 * progress)
        x = xs[0] + (xs[1] - xs[0]) * eased
        x += rng.gauss(0.0, 0.006) if imperfect else 0.0
        y = rng.gauss(0.0, 0.012) if imperfect else 0.0
        frames.append(translated_hand("open", (x - 0.50, y), seed_offset + frame))
    return frames


def run_sequence(recognizer, frames):
    outputs = [recognizer.update(frame) for frame in frames]
    return outputs, outputs[-1] if outputs else ""


def expected_was_detected(expected: str | None, outputs) -> bool:
    actions = {"VOLUME_UP", "VOLUME_DOWN", "NEXT_SONG", "PREVIOUS_SONG", "PLAY_PAUSE"}
    detected_actions = actions.intersection(outputs)
    return detected_actions == ({expected} if expected else set())


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def tick(self, seconds=0.04):
        self.now += seconds


class DynamicGestureTests(unittest.TestCase):
    def test_circle_labels_volume_up_and_down(self):
        for expected, direction in (("VOLUME_UP", 1), ("VOLUME_DOWN", -1)):
            recognizer = bmw.CircularGestureRecognizer()
            outputs, output = run_sequence(recognizer, circle_sequence(direction))
            self.assertTrue(expected_was_detected(expected, outputs))

    def test_swipe_labels_and_idle_is_nothing(self):
        for expected, xs in (("NEXT_SONG", (0.30, 0.70)),
                             ("PREVIOUS_SONG", (0.70, 0.30))):
            recognizer = bmw.SwipeGestureRecognizer()
            outputs, output = run_sequence(recognizer, swipe_sequence(xs))
            self.assertTrue(expected_was_detected(expected, outputs))

        idle = bmw.SwipeGestureRecognizer()
        idle_outputs = [idle.update(make_hand("open", seed=100 + i)) for i in range(12)]
        self.assertNotIn("NEXT_SONG", idle_outputs)
        self.assertNotIn("PREVIOUS_SONG", idle_outputs)

    def test_two_finger_hold_is_labeled_once(self):
        clock = FakeClock()
        original_clock = bmw.time.monotonic
        bmw.time.monotonic = clock.monotonic
        try:
            recognizer = bmw.TwoFingerGestureRecognizer()
            outputs = []
            for frame in range(8):
                outputs.append(recognizer.update(make_hand("two", seed=200 + frame)))
                clock.tick(0.05)
            self.assertEqual(outputs.count("PLAY_PAUSE"), 1)
            self.assertEqual(recognizer.update(make_hand("open", seed=300)), "Waiting")
        finally:
            bmw.time.monotonic = original_clock


if __name__ == "__main__":
    wants_report = "--report" in sys.argv
    wants_visualize = "--visualize" in sys.argv
    argument_parser = argparse.ArgumentParser(add_help=False)
    argument_parser.add_argument("--seed", type=int)
    parsed_arguments, _ = argument_parser.parse_known_args()

    if wants_report or wants_visualize:
        sys.argv = [sys.argv[0]]
        run_seed = (
            parsed_arguments.seed
            if parsed_arguments.seed is not None
            else random.SystemRandom().randrange(1_000_000_000)
        )

        def evaluate(label, expected, make_recognizer, make_frames, trials=20):
            correct = 0
            for trial in range(trials):
                outputs, _ = run_sequence(
                    make_recognizer(), make_frames(trial * 1000)
                )
                correct += expected_was_detected(expected, outputs)
            return correct, trials

        cases = [
            ("VOLUME_UP", "VOLUME_UP", bmw.CircularGestureRecognizer,
             lambda seed: circle_sequence(1, seed)),
            ("VOLUME_DOWN", "VOLUME_DOWN", bmw.CircularGestureRecognizer,
             lambda seed: circle_sequence(-1, seed)),
            ("NEXT_SONG", "NEXT_SONG", bmw.SwipeGestureRecognizer,
             lambda seed: swipe_sequence((0.30, 0.70), seed)),
            ("PREVIOUS_SONG", "PREVIOUS_SONG", bmw.SwipeGestureRecognizer,
             lambda seed: swipe_sequence((0.70, 0.30), seed)),
            ("NOTHING", None, bmw.SwipeGestureRecognizer,
             lambda seed: [make_hand("open", seed=seed + i) for i in range(12)]),
        ]

        total_correct = total_trials = 0
        print(f"Gesture detection accuracy (sequence-level)    Seed: {run_seed}")
        for label, expected, factory, frames in cases:
            correct, trials = evaluate(label, expected, factory,
                                       lambda seed, frames=frames: frames(run_seed + seed))
            total_correct += correct
            total_trials += trials
            print(f"  {label:14} {correct:2}/{trials:2} = {100 * correct / trials:5.1f}%")

        hold_correct = 0
        hold_trials = 20
        original_clock = bmw.time.monotonic
        for trial in range(hold_trials):
            clock = FakeClock()
            bmw.time.monotonic = clock.monotonic
            recognizer = bmw.TwoFingerGestureRecognizer()
            outputs = []
            for frame in range(8):
                outputs.append(recognizer.update(
                    make_hand("two", seed=run_seed + 5000 + trial * 100 + frame)
                ))
                clock.tick(0.05)
            hold_correct += expected_was_detected("PLAY_PAUSE", outputs)
        bmw.time.monotonic = original_clock
        total_correct += hold_correct
        total_trials += hold_trials
        print(f"  {'PLAY_PAUSE':14} {hold_correct:2}/{hold_trials:2} = "
              f"{100 * hold_correct / hold_trials:5.1f}%")
        print(f"  {'OVERALL':14} {total_correct:2}/{total_trials:2} = "
              f"{100 * total_correct / total_trials:5.1f}%")

        if wants_visualize:
            import matplotlib.pyplot as plt
            from matplotlib.animation import FuncAnimation

            visual_seed = (
                parsed_arguments.seed
                if parsed_arguments.seed is not None
                else random.SystemRandom().randrange(1_000_000_000)
            )
            visual_cases = [
                ("VOLUME_UP", bmw.CircularGestureRecognizer,
                 lambda seed: circle_sequence(1, seed)),
                ("VOLUME_DOWN", bmw.CircularGestureRecognizer,
                 lambda seed: circle_sequence(-1, seed)),
                ("NEXT_SONG", bmw.SwipeGestureRecognizer,
                 lambda seed: swipe_sequence((0.30, 0.70), seed)),
                ("PREVIOUS_SONG", bmw.SwipeGestureRecognizer,
                 lambda seed: swipe_sequence((0.70, 0.30), seed)),
            ]
            visual_rng = random.Random(visual_seed)
            trial_data = []
            for trial_number in range(5):
                expected, recognizer_factory, frame_factory = visual_rng.choice(visual_cases)
                trial_seed = visual_seed + trial_number
                trial_frames = frame_factory(trial_seed)
                recognizer = recognizer_factory()
                trial_outputs = []
                trial_path = []
                for frame in trial_frames:
                    trial_outputs.append(recognizer.update(frame))
                    if expected.startswith("VOLUME"):
                        tracked_point = frame.landmarks[8]
                    else:
                        palm_x, palm_y, _ = bmw.palm_center(frame)
                        tracked_point = Point(palm_x, palm_y, 0.0)
                    trial_path.append((tracked_point.x, tracked_point.y))
                trial_data.append((expected, trial_seed, trial_frames, trial_outputs, trial_path))
            frames = [frame for _, _, trial_frames, _, _ in trial_data for frame in trial_frames]
            frame_meta = [
                (trial_number, frame_number)
                for trial_number, (_, _, trial_frames, _, _) in enumerate(trial_data)
                for frame_number in range(len(trial_frames))
            ]
            outputs = []
            for _, _, _, trial_outputs, _ in trial_data:
                outputs.extend(trial_outputs)

            fig, (hand_axis, path_axis) = plt.subplots(1, 2, figsize=(10, 5))
            hand_axis.set(xlim=(0.2, 0.8), ylim=(0.8, 0.2),
                          title="Synthetic hand landmarks", xlabel="x", ylabel="y")
            path_axis.set(xlim=(0.2, 0.8), ylim=(0.75, 0.25),
                          title="Tracked-point trajectory", xlabel="x", ylabel="y")
            hand_axis.set_aspect("equal")
            path_axis.set_aspect("equal")
            dots, = hand_axis.plot([], [], "o", ms=5)
            path, = path_axis.plot([], [], "o-", ms=4)
            status = fig.text(0.5, 0.02, "", ha="center")

            def draw(frame_number):
                hand = frames[frame_number]
                dots.set_data([p.x for p in hand.landmarks], [p.y for p in hand.landmarks])
                trial_number, trial_frame = frame_meta[frame_number]
                expected, trial_seed, _, trial_outputs, trial_path = trial_data[trial_number]
                current_path = trial_path[:trial_frame + 1]
                path.set_data([p[0] for p in current_path], [p[1] for p in current_path])
                status.set_text(
                    f"Trial: {trial_number + 1}/5    Expected: {expected}    "
                    f"Output: {trial_outputs[trial_frame]}    "
                    f"Frame: {trial_frame + 1}/{len(trial_path)}    Seed: {trial_seed}"
                )
                return dots, path, status
            animation = FuncAnimation(
                fig, draw, frames=len(frames), interval=100, repeat=False
            )
            plt.show()
    else:
        unittest.main(verbosity=2)

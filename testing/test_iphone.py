from motion.iphone_receiver import IPhoneReceiver


receiver = IPhoneReceiver()

try:

    while True:

        timestamp, hands = receiver.receive()

        for hand in hands:

            print(
                f"\n{timestamp}"
            )

            for i, landmark in enumerate(
                hand.landmarks
            ):
                print(
                    f"{i:02d} "
                    f"x={landmark.x:.3f} "
                    f"y={landmark.y:.3f} "
                    f"z={landmark.z:.3f}m"
                )

finally:
    receiver.close()
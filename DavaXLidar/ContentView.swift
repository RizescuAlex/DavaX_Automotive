import SwiftUI

struct ContentView: View {

    @StateObject private var lidar = LiDARViewModel()

    var body: some View {

        ZStack {

            if lidar.lidarSupported {

                // ---------------------------------
                // Camera
                // ---------------------------------

                ARCameraView(
                    session: lidar.session
                )
                .ignoresSafeArea()


                // ---------------------------------
                // Hand landmarks
                // ---------------------------------

                HandLandmarkOverlay(
                    landmarks: lidar.handPose.landmarks
                )
                .ignoresSafeArea()


                // ---------------------------------
                // Center crosshair
                // ---------------------------------

                ZStack {

                    Circle()
                        .stroke(
                            .white,
                            lineWidth: 2
                        )
                        .frame(
                            width: 40,
                            height: 40
                        )

                    Circle()
                        .fill(.white)
                        .frame(
                            width: 5,
                            height: 5
                        )
                }


                // ---------------------------------
                // Bottom information
                // ---------------------------------

                VStack {

                    Spacer()

                    VStack(spacing: 8) {

                        Text("LiDAR Distance")
                            .font(.caption)

                        Text(
                            String(
                                format: "%.2f m",
                                lidar.distance
                            )
                        )
                        .font(
                            .system(
                                size: 30,
                                weight: .bold
                            )
                        )

                        Text(
                            "\(lidar.handPose.landmarks.count) landmarks"
                        )
                        .font(.caption)
                    }
                    .padding()
                    .background(
                        .ultraThinMaterial
                    )
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: 18
                        )
                    )
                    .padding(
                        .bottom,
                        40
                    )
                }

            } else {

                VStack(spacing: 16) {

                    Image(
                        systemName:
                            "sensor.tag.radiowaves.forward"
                    )
                    .font(
                        .system(size: 50)
                    )

                    Text("LiDAR Not Available")
                        .font(
                            .title2.bold()
                        )

                    Text(
                        "This device does not support ARKit scene depth."
                    )
                    .multilineTextAlignment(
                        .center
                    )
                }
                .padding()
            }
        }
        .onAppear {

            lidar.startSession()

        }
        .onDisappear {

            lidar.pauseSession()
        }
    }
}

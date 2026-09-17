import SwiftUI

struct HandLandmarkOverlay: View {

    let landmarks: [HandLandmark]

    var body: some View {
        GeometryReader { geometry in

            ZStack {
                ForEach(landmarks) { landmark in

                    let point = convertToScreen(
                        landmark: landmark,
                        viewportSize: geometry.size
                    )

                    ZStack {
                        Circle()
                            .fill(.green)
                            .frame(width: 24, height: 24)

                        VStack(spacing: 1) {

                            Text("\(landmark.id)")
                                .font(
                                    .system(
                                        size: 9,
                                        weight: .bold
                                    )
                                )

                            if let depth = landmark.depth {

                                Text(
                                    String(
                                        format: "%.2f",
                                        depth
                                    )
                                )
                                .font(
                                    .system(
                                        size: 7,
                                        weight: .bold
                                    )
                                )

                            } else {

                                Text("--")
                                    .font(
                                        .system(
                                            size: 7
                                        )
                                    )
                            }
                        }
                        .foregroundStyle(.black)
                    }
                    .position(point)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func convertToScreen(
        landmark: HandLandmark,
        viewportSize: CGSize
    ) -> CGPoint {

        let normalizedX = landmark.x
        let normalizedY = 1.0 - landmark.y

        // Portrait representation of the 4:3 camera image
        let imageAspect: CGFloat = 3.0 / 4.0

        // ARView displays the camera using aspect-fill
        let displayedImageWidth =
            viewportSize.height * imageAspect

        let horizontalCrop =
            (displayedImageWidth - viewportSize.width) / 2.0

        let x =
            normalizedX * displayedImageWidth
            - horizontalCrop

        let y =
            normalizedY * viewportSize.height

        return CGPoint(
            x: x,
            y: y
        )
    }
}

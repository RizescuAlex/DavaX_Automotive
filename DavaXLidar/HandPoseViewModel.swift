import Foundation
import Vision
import ARKit
import ImageIO
import Combine

final class HandPoseViewModel: ObservableObject {

    @Published var landmarks: [HandLandmark] = []

    private let request = VNDetectHumanHandPoseRequest()

    private let visionQueue = DispatchQueue(
        label: "com.davax.handpose",
        qos: .userInitiated
    )

    private var isProcessing = false

    // Maps Apple Vision joints to the MediaPipe-style
    // 0...20 landmark indexing your colleague expects.
    private let jointMapping:
        [VNHumanHandPoseObservation.JointName: Int] = [

        .wrist: 0,

        .thumbCMC: 1,
        .thumbMP: 2,
        .thumbIP: 3,
        .thumbTip: 4,

        .indexMCP: 5,
        .indexPIP: 6,
        .indexDIP: 7,
        .indexTip: 8,

        .middleMCP: 9,
        .middlePIP: 10,
        .middleDIP: 11,
        .middleTip: 12,

        .ringMCP: 13,
        .ringPIP: 14,
        .ringDIP: 15,
        .ringTip: 16,

        .littleMCP: 17,
        .littlePIP: 18,
        .littleDIP: 19,
        .littleTip: 20
    ]

    init() {
        request.maximumHandCount = 1
    }

    func process(frame: ARFrame) {

        // Prevent multiple Vision requests from running
        // at the same time.
        guard !isProcessing else {
            return
        }

        isProcessing = true

        let pixelBuffer = frame.capturedImage

        visionQueue.async { [weak self] in

            guard let self else {
                return
            }

            defer {
                self.isProcessing = false
            }

            let handler = VNImageRequestHandler(
                cvPixelBuffer: pixelBuffer,
                orientation: .right,
                options: [:]
            )

            do {

                try handler.perform([self.request])

                guard let observation =
                        self.request.results?.first
                else {

                    DispatchQueue.main.async {
                        self.landmarks = []
                    }

                    return
                }

                let points = try observation.recognizedPoints(.all)

                var detectedLandmarks: [HandLandmark] = []

                for (jointName, point) in points {

                    // Ignore low-confidence detections.
                    guard point.confidence > 0.3 else {
                        continue
                    }

                    // Ignore any Vision joint that is not
                    // part of our 0...20 mapping.
                    guard let id = self.jointMapping[jointName] else {
                        continue
                    }

                    let landmark = HandLandmark(
                        id: id,
                        name: jointName.rawValue.rawValue,
                        x: point.location.x,
                        y: point.location.y,
                        confidence: point.confidence,
                        depth: nil
                    )

                    detectedLandmarks.append(landmark)
                }

                // Keep landmarks in strict 0...20 order.
                detectedLandmarks.sort {
                    $0.id < $1.id
                }

                DispatchQueue.main.async {
                    self.landmarks = detectedLandmarks
                }

            } catch {

                print(
                    "Vision hand detection error:",
                    error
                )

                DispatchQueue.main.async {
                    self.landmarks = []
                }
            }
        }
    }
    
    func updateLandmarkDepths(
        _ updatedLandmarks: [HandLandmark]
    ) {
        DispatchQueue.main.async {
            self.landmarks = updatedLandmarks
        }
    }
}

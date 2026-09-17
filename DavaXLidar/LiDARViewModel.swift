import Foundation
import ARKit
import Combine
import CoreVideo

final class LiDARViewModel: NSObject, ObservableObject, ARSessionDelegate {

    let session = ARSession()
    let handPose = HandPoseViewModel()
    private var lastProcessingTime: TimeInterval = 0
    private let processingInterval: TimeInterval = 1.0 / 20.0
    private let networkSender =
        LandmarkNetworkSender(
            host: "192.168.0.133",
            port: 5005
        )

    @Published var distance: Float = 0.0
    @Published var lidarSupported: Bool = true

    override init() {
        super.init()
        session.delegate = self
    }

    func startSession() {

        let configuration = ARWorldTrackingConfiguration()

        if ARWorldTrackingConfiguration
            .supportsFrameSemantics(.smoothedSceneDepth) {

            configuration.frameSemantics.insert(
                .smoothedSceneDepth
            )

        } else if ARWorldTrackingConfiguration
            .supportsFrameSemantics(.sceneDepth) {

            configuration.frameSemantics.insert(
                .sceneDepth
            )

        } else {

            DispatchQueue.main.async {
                self.lidarSupported = false
            }

            return
        }

        session.run(
            configuration,
            options: [
                .resetTracking,
                .removeExistingAnchors
            ]
        )
    }

    func pauseSession() {
        session.pause()
    }
    
    func session(
        _ session: ARSession,
        didUpdate frame: ARFrame
    ) {
        let currentTime = frame.timestamp

        guard currentTime - lastProcessingTime >= processingInterval else {
            return
        }

        lastProcessingTime = currentTime
        // --------------------------------
        // 1. Detect hand
        // --------------------------------

        handPose.process(frame: frame)

        // --------------------------------
        // 2. Get depth
        // --------------------------------

        guard let depthData =
                frame.smoothedSceneDepth ??
                frame.sceneDepth
        else {
            return
        }

        let depthMap = depthData.depthMap
        let confidenceMap = depthData.confidenceMap

        let width =
            CVPixelBufferGetWidth(depthMap)

        let height =
            CVPixelBufferGetHeight(depthMap)

        // --------------------------------
        // 3. Center depth
        // --------------------------------

        if let centerDepth = robustDepth(
            from: depthMap,
            confidenceMap: confidenceMap,
            x: width / 2,
            y: height / 2,
            radius: 2,
            referenceDepth: nil
        ) {

            DispatchQueue.main.async {
                self.distance = centerDepth
            }
        }

        // --------------------------------
        // 4. Get hand landmarks
        // --------------------------------

        let landmarks = handPose.landmarks

        guard landmarks.count == 21 else {
            return
        }

        // --------------------------------
        // 5. First estimate hand depth
        //
        // Use palm landmarks because they are
        // much more reliable than fingertips.
        //
        // 0  = wrist
        // 5  = index MCP
        // 9  = middle MCP
        // 13 = ring MCP
        // 17 = little MCP
        // --------------------------------

        let palmIDs: Set<Int> = [
            0, 5, 9, 13, 17
        ]

        var palmDepths: [Float] = []

        for landmark in landmarks {

            guard palmIDs.contains(landmark.id)
            else {
                continue
            }

            guard let position =
                    visionPointToDepthPoint(
                        landmark: landmark,
                        depthWidth: width,
                        depthHeight: height
                    )
            else {
                continue
            }

            if let depth = robustDepth(
                from: depthMap,
                confidenceMap: confidenceMap,
                x: position.x,
                y: position.y,
                radius: 3,
                referenceDepth: nil
            ) {

                palmDepths.append(depth)
            }
        }

        let handDepth =
            median(of: palmDepths)

        // --------------------------------
        // 6. Calculate depth for all
        //    21 landmarks
        // --------------------------------

        var landmarksWithDepth:
            [HandLandmark] = []

        for landmark in landmarks {

            guard let position =
                    visionPointToDepthPoint(
                        landmark: landmark,
                        depthWidth: width,
                        depthHeight: height
                    )
            else {

                landmarksWithDepth.append(
                    landmark
                )

                continue
            }

            let depth = robustDepth(
                from: depthMap,
                confidenceMap: confidenceMap,
                x: position.x,
                y: position.y,

                // Slightly larger region
                // helps fingertips.
                radius: 3,

                // Reject obvious background
                // using palm distance.
                referenceDepth: handDepth
            )

            let updatedLandmark =
                HandLandmark(
                    id: landmark.id,
                    name: landmark.name,
                    x: landmark.x,
                    y: landmark.y,
                    confidence:
                        landmark.confidence,
                    depth: depth
                )

            landmarksWithDepth.append(
                updatedLandmark
            )
        }

        // --------------------------------
        // 7. Update UI
        // --------------------------------

        handPose.updateLandmarkDepths(
            landmarksWithDepth
        )

        // --------------------------------
        // 8. Send to Mac
        // --------------------------------

        if landmarksWithDepth.count == 21 {

            networkSender.send(
                landmarks: landmarksWithDepth
            )
        }
    }

    // MARK: - Vision -> depth coordinates

    private func visionPointToDepthPoint(
        landmark: HandLandmark,
        depthWidth: Int,
        depthHeight: Int
    ) -> (x: Int, y: Int)? {

        let visionX = landmark.x
        let visionY = landmark.y

        let rawNormalizedX =
            1.0 - visionY

        let rawNormalizedY =
            1.0 - visionX

        let depthX =
            Int(
                rawNormalizedX *
                CGFloat(depthWidth)
            )

        let depthY =
            Int(
                rawNormalizedY *
                CGFloat(depthHeight)
            )

        guard
            depthX >= 0,
            depthX < depthWidth,
            depthY >= 0,
            depthY < depthHeight
        else {
            return nil
        }

        return (
            x: depthX,
            y: depthY
        )
    }

    // MARK: - Robust landmark depth

    private func robustDepth(
        from depthMap: CVPixelBuffer,
        confidenceMap: CVPixelBuffer?,
        x: Int,
        y: Int,
        radius: Int,
        referenceDepth: Float?
    ) -> Float? {

        let width =
            CVPixelBufferGetWidth(depthMap)

        let height =
            CVPixelBufferGetHeight(depthMap)

        CVPixelBufferLockBaseAddress(
            depthMap,
            .readOnly
        )

        if let confidenceMap {
            CVPixelBufferLockBaseAddress(
                confidenceMap,
                .readOnly
            )
        }

        defer {

            CVPixelBufferUnlockBaseAddress(
                depthMap,
                .readOnly
            )

            if let confidenceMap {
                CVPixelBufferUnlockBaseAddress(
                    confidenceMap,
                    .readOnly
                )
            }
        }

        guard let depthBaseAddress =
                CVPixelBufferGetBaseAddress(
                    depthMap
                )
        else {
            return nil
        }

        let depthRowBytes =
            CVPixelBufferGetBytesPerRow(
                depthMap
            )

        var confidenceBaseAddress:
            UnsafeMutableRawPointer?

        var confidenceRowBytes = 0

        if let confidenceMap {

            confidenceBaseAddress =
                CVPixelBufferGetBaseAddress(
                    confidenceMap
                )

            confidenceRowBytes =
                CVPixelBufferGetBytesPerRow(
                    confidenceMap
                )
        }

        var candidates: [Float] = []

        // --------------------------------
        // Search local neighborhood
        // --------------------------------

        for dy in -radius...radius {

            for dx in -radius...radius {

                let sampleX = x + dx
                let sampleY = y + dy

                guard
                    sampleX >= 0,
                    sampleX < width,
                    sampleY >= 0,
                    sampleY < height
                else {
                    continue
                }

                // --------------------------------
                // Check LiDAR confidence
                // --------------------------------

                if let confidenceBaseAddress {

                    let row =
                        confidenceBaseAddress
                            .advanced(
                                by:
                                    sampleY *
                                    confidenceRowBytes
                            )
                            .assumingMemoryBound(
                                to: UInt8.self
                            )

                    let confidence =
                        row[sampleX]

                    // Ignore low confidence.
                    if confidence < 1 {
                        continue
                    }
                }

                // --------------------------------
                // Read depth
                // --------------------------------

                let row =
                    depthBaseAddress
                        .advanced(
                            by:
                                sampleY *
                                depthRowBytes
                        )
                        .assumingMemoryBound(
                            to: Float32.self
                        )

                let depth =
                    row[sampleX]

                guard
                    depth.isFinite,
                    depth > 0.10,
                    depth < 2.0
                else {
                    continue
                }

                // --------------------------------
                // Reject background
                //
                // A hand landmark should normally
                // be relatively close to the
                // depth of the palm.
                // --------------------------------

                if let referenceDepth {

                    let difference =
                        abs(
                            depth -
                            referenceDepth
                        )

                    // 15 cm tolerance.
                    //
                    // Large enough for a hand
                    // tilted in 3D, but should
                    // reject background pixels.
                    if difference > 0.15 {
                        continue
                    }
                }

                candidates.append(depth)
            }
        }

        guard !candidates.isEmpty else {
            return nil
        }

        candidates.sort()

        // --------------------------------
        // Prefer the FRONT part of the
        // depth cluster.
        //
        // This is important at fingertips:
        //
        //     hand = 0.34 m
        //     background = 0.64 m
        //
        // Taking an ordinary median can pick
        // the background.
        //
        // We instead keep the closer half
        // and take its median.
        // --------------------------------

        let halfCount =
            max(
                1,
                candidates.count / 2
            )

        let foregroundCandidates =
            Array(
                candidates.prefix(
                    halfCount
                )
            )

        return median(
            of: foregroundCandidates
        )
    }

    // MARK: - Median

    private func median(
        of values: [Float]
    ) -> Float? {

        guard !values.isEmpty else {
            return nil
        }

        let sorted =
            values.sorted()

        let count =
            sorted.count

        if count % 2 == 1 {

            return sorted[
                count / 2
            ]

        } else {

            let a =
                sorted[
                    count / 2 - 1
                ]

            let b =
                sorted[
                    count / 2
                ]

            return (
                a + b
            ) / 2.0
        }
    }
}

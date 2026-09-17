import Foundation
import Network

final class LandmarkNetworkSender {

    private var connection: NWConnection?

    private let host: NWEndpoint.Host
    private let port: NWEndpoint.Port

    init(
        host: String,
        port: UInt16 = 5005
    ) {
        self.host = NWEndpoint.Host(host)
        self.port = NWEndpoint.Port(
            rawValue: port
        )!

        setupConnection()
    }

    private func setupConnection() {

        connection = NWConnection(
            host: host,
            port: port,
            using: .udp
        )

        connection?.stateUpdateHandler = { state in

            switch state {

            case .ready:
                print("UDP ready")

            case .failed(let error):
                print(
                    "UDP failed:",
                    error
                )

            default:
                break
            }
        }

        connection?.start(
            queue: DispatchQueue(
                label: "com.davax.udp"
            )
        )
    }

    func send(
        landmarks: [HandLandmark]
    ) {

        guard landmarks.count == 21 else {
            return
        }

        let timestamp =
            Int64(
                Date()
                    .timeIntervalSince1970
                * 1000
            )

        let landmarkArray:
            [[String: Any]] =
            landmarks.map { landmark in

                [
                    "id": landmark.id,
                    "x": Double(landmark.x),
                    "y": Double(
                        1.0 - landmark.y
                    ),
                    "z":
                        landmark.depth
                        ?? -1.0,
                    "confidence":
                        landmark.confidence
                ]
            }

        let packet:
            [String: Any] = [

                "timestamp": timestamp,

                "hands": [
                    [
                        "handedness": "Unknown",
                        "confidence": 1.0,
                        "landmarks":
                            landmarkArray
                    ]
                ]
            ]

        guard
            JSONSerialization
                .isValidJSONObject(packet),

            let data =
                try? JSONSerialization.data(
                    withJSONObject: packet
                )

        else {
            return
        }

        connection?.send(
            content: data,
            completion:
                .contentProcessed {
                    error in

                    if let error {
                        print(
                            "UDP send error:",
                            error
                        )
                    }
                }
        )
    }
}

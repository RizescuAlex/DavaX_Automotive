import SwiftUI
import RealityKit
import ARKit

struct ARCameraView: UIViewRepresentable {

    let session: ARSession

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)

        arView.session = session

        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {
    }
}

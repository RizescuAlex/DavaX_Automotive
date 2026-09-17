import Foundation
import CoreGraphics

struct HandLandmark: Identifiable {

    let id: Int
    let name: String

    let x: CGFloat
    let y: CGFloat

    let confidence: Float

    var depth: Float? = nil
}

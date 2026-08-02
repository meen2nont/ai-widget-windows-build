import SwiftUI

struct ActionPill: View {
    let title: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(color.opacity(0.12)))
                .foregroundColor(color)
        }
        .buttonStyle(.plain)
        .focusable(false)
    }
}

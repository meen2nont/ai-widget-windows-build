import Foundation

extension Int {
    var formattedTokenString: String {
        if self >= 1_000_000 {
            let val = Double(self) / 1_000_000.0
            return val.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0fM", val) : String(format: "%.1fM", val)
        } else if self >= 1_000 {
            let val = Double(self) / 1_000.0
            return val.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0fk", val) : String(format: "%.1fk", val)
        }
        return "\(self)"
    }
}

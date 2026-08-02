import SwiftUI
import AppKit

// MARK: - Ollama Pay Popover View
struct OllamaPayPopoverView: View {
    @ObservedObject var vm: OllamaPayViewModel
    
    @MainActor
    init(vm: OllamaPayViewModel) {
        self.vm = vm
    }
    
    var body: some View {
        VStack(spacing: 14) {
            // Streamlined Header (Logo + Title + Status Badge)
            HStack {
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 28, height: 28)
                        Image(systemName: "creditcard.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    }
                    Text("Ollama Pay")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                }
                
                Spacer()
                
                HStack(spacing: 5) {
                    Circle()
                        .fill(vm.isAvailable ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    Text(vm.isAvailable ? "Connected" : "Offline")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(vm.isAvailable ? .green : .red)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(vm.isAvailable ? Color.green.opacity(0.12) : Color.red.opacity(0.12)))
            }
            
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TODAY USED")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.secondary)
                        
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(vm.todayTokens.formattedTokenString)
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .foregroundColor(.primary)
                            Text("tokens")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        Text("\(vm.todayRequests.formattedTokenString) requests")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(LinearGradient(colors: [Color.blue.opacity(0.14), Color.cyan.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.2), lineWidth: 1)
                    )
                    
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MONTH USED")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.secondary)
                        
                        let daysInMonth = Calendar.current.range(of: .day, in: .month, for: Date())?.count ?? 30
                        let monthLimit = vm.tokensLimit * daysInMonth
                        let monthPercent = monthLimit > 0 ? Double(vm.monthTokens) / Double(monthLimit) : 0.0
                        
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(vm.monthTokens.formattedTokenString)
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundColor(monthPercent > 0.9 ? .red : .primary)
                            Text("/ \(monthLimit.formattedTokenString) (\(Int(monthPercent * 100))%)")
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                                .foregroundColor(.secondary)
                        }
                        
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(Color.primary.opacity(0.08))
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(monthPercent > 0.9 ? Color.red : Color.blue)
                                    .frame(width: max(0, geo.size.width * CGFloat(min(1.0, monthPercent))))
                            }
                        }
                        .frame(height: 4)
                        
                        Text("\(vm.monthRequests.formattedTokenString) requests")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.primary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
                }
                
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("RATE LIMIT USAGE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.secondary)
                        
                        let percent = vm.tokensLimit > 0 ? Double(vm.totalTokensUsed) / Double(vm.tokensLimit) : 0.0
                        
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(vm.totalTokensUsed.formattedTokenString)
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundColor(percent > 0.9 ? .red : .primary)
                            Text("/ \(vm.tokensLimit.formattedTokenString) (\(Int(percent * 100))%)")
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                                .foregroundColor(.secondary)
                        }
                        
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(Color.primary.opacity(0.08))
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(percent > 0.9 ? Color.red : Color.blue)
                                    .frame(width: max(0, geo.size.width * CGFloat(min(1.0, percent))))
                            }
                        }
                        .frame(height: 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.primary.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
                    
                    if vm.todayPloyJoyTokens > 0 {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("🎉 PLOY-JOY FREE")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.purple)
                            
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("+\(vm.todayPloyJoyTokens.formattedTokenString)")
                                    .font(.system(size: 18, weight: .bold, design: .rounded))
                                    .foregroundColor(.purple)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.purple.opacity(0.06))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.purple.opacity(0.2), lineWidth: 1)
                        )
                    }
                }
                
                if !vm.errorMsg.isEmpty {
                    Text(vm.errorMsg)
                        .font(.caption2)
                        .foregroundColor(.red)
                }
            }
            .padding(.top, 4)
            
            Divider()
            
            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.green)
                    Text("\(vm.latencyMs)ms")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Button(action: {
                    if let url = URL(string: APIConstants.OllamaPay.dashboardURL) {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    HStack(spacing: 2) {
                        Text("Dashboard")
                        Image(systemName: "arrow.up.right")
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
                .focusable(false)
                
                Button("Quit App") {
                    NSApplication.shared.terminate(nil)
                }
                .font(.system(size: 10))
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
                .focusable(false)
            }
        }
    }
}

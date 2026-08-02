import SwiftUI
import AppKit

// MARK: - DeepSeek Popover View
struct DeepSeekPopoverView: View {
    @ObservedObject var vm: DeepSeekViewModel
    
    @MainActor
    init(vm: DeepSeekViewModel) {
        self.vm = vm
    }
    
    var body: some View {
        VStack(spacing: 14) {
            // Streamlined Header (Logo + Title + Status Badge)
            HStack {
                HStack(spacing: 8) {
                    let iconPath = getAssetPath("deepseek_icon.png")
                    if let dsImg = NSImage(contentsOfFile: iconPath) {
                        Image(nsImage: dsImg)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 26, height: 26)
                    } else {
                        ZStack {
                            Circle()
                                .fill(LinearGradient(colors: [.cyan, .blue], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .frame(width: 28, height: 28)
                            Image(systemName: "sparkles")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    Text("DeepSeek")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                }
                
                Spacer()
                
                // Status Badge
                HStack(spacing: 5) {
                    Circle()
                        .fill(vm.isAvailable ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    Text(vm.isAvailable ? "Active" : "Offline")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(vm.isAvailable ? .green : .red)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(vm.isAvailable ? Color.green.opacity(0.12) : Color.red.opacity(0.12)))
            }
            
            // Balance Cards
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("REMAINING BALANCE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.secondary)
                    
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("$\(vm.balance)")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text(vm.currency)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
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
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("SPENT TODAY")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.secondary)
                    
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("$\(vm.spentToday)")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text(vm.currency)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
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
            
            // Footer
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
                    if let url = URL(string: APIConstants.DeepSeek.dashboardURL) {
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

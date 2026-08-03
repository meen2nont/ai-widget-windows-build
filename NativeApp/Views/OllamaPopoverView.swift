import SwiftUI
import AppKit

// MARK: - Ollama Cloud Popover View
struct OllamaPopoverView: View {
    @ObservedObject var vm: OllamaViewModel
    
    @MainActor
    init(vm: OllamaViewModel) {
        self.vm = vm
    }
    
    var body: some View {
        VStack(spacing: 14) {
            // Streamlined Header (Logo + Title + Status Badge)
            HStack {
                HStack(spacing: 8) {
                    let iconPath = getAssetPath("ollama_icon.png")
                    if let officialImg = NSImage(contentsOfFile: iconPath) {
                        Image(nsImage: officialImg)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 26, height: 26)
                    } else {
                        ZStack {
                            Circle()
                                .fill(LinearGradient(colors: [.orange, .red], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .frame(width: 28, height: 28)
                            Image(systemName: "cloud.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    Text("Ollama Cloud")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                }
                
                Spacer()
                
                // Status Badge
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
            
            // REAL Quota Card (Directly from https://ollama.com/api/usage)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("OLLAMA CLOUD REAL QUOTA")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    HStack(spacing: 4) {
                        Circle().fill(Color.green).frame(width: 5, height: 5)
                        Text("LIVE API")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.green)
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.green.opacity(0.12)))
                }
                
                // 5-Hour Session Window Progress (REAL DATA)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Session usage")
                            .font(.system(size: 10, weight: .medium))
                        Spacer()
                        Text("\(vm.sessionUsagePercent)% used")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.primary.opacity(0.1))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.primary.opacity(0.6))
                                .frame(width: max(0, geo.size.width * CGFloat(vm.sessionUsagePercent) / 100.0))
                        }
                    }
                    .frame(height: 6)
                    
                    Text("Resets in a few hours.")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                        .padding(.top, 2)
                }
                
                // 7-Day Weekly Window Progress (REAL DATA)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Weekly usage")
                            .font(.system(size: 10, weight: .medium))
                        Spacer()
                        Text("\(vm.weeklyUsagePercent)% used")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.primary.opacity(0.1))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.primary.opacity(0.6))
                                .frame(width: max(0, geo.size.width * CGFloat(vm.weeklyUsagePercent) / 100.0))
                        }
                    }
                    .frame(height: 6)
                    
                    Text("Resets in 1 week.")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                        .padding(.top, 2)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.primary.opacity(0.02))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.primary.opacity(0.1), lineWidth: 1)
            )
            
            // Footer
            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.green)
                    Text("\(vm.latencyMs)ms" + (vm.lastTokenInfo.isEmpty ? "" : " • \(vm.lastTokenInfo)"))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Button(action: {
                    if let url = URL(string: APIConstants.Ollama.settingsURL) {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    HStack(spacing: 2) {
                        Text("ollama.com/settings")
                        Image(systemName: "arrow.up.right")
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.orange)
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

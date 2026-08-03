import SwiftUI
import AppKit

struct TabPillButton: View {
    let title: String
    let icon: String
    var customIconPath: String? = nil
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let path = customIconPath, let img = NSImage(contentsOfFile: path) {
                    Image(nsImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 14, height: 14)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .bold))
                }
                Text(title)
                    .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(isSelected ? Color.blue.opacity(0.18) : Color.primary.opacity(0.05))
            )
            .foregroundColor(isSelected ? .blue : .primary)
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .stroke(isSelected ? Color.blue.opacity(0.3) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .focusable(false)
    }
}

// MARK: - Unified Main Popover View
struct UnifiedMainPopoverView: View {
    @StateObject var dsVM = DeepSeekViewModel()
    @StateObject var olVM = OllamaViewModel()
    @StateObject var opVM = OllamaPayViewModel()
    @StateObject var launchService = LaunchAtLoginService.shared
    
    @AppStorage("EnableNotifications") private var enableNotifications: Bool = true
    @AppStorage("GlobalRefreshInterval") private var globalRefreshInterval: Int = 300
    @AppStorage("MenuBarDisplayMode") private var menuBarDisplayMode: String = "default"
    
    @State private var selectedTab: Int = 0 // 0: Overview, 1: DeepSeek, 2: Ollama, 3: Ollama Pay
    @State private var showSettings: Bool = false
    
    @State private var lastRefreshedDate: Date? = nil
    
    var isAnyLoading: Bool {
        return dsVM.isLoading || olVM.isLoading || opVM.isLoading
    }
    
    func refreshAll() {
        dsVM.fetchData()
        olVM.fetchData()
        opVM.fetchData()
        lastRefreshedDate = Date()
    }
    
    func syncRefreshInterval(_ interval: Int) {
        globalRefreshInterval = interval
        dsVM.refreshInterval = interval
        olVM.refreshInterval = interval
        opVM.refreshInterval = interval
    }
    
    func changeTab(to tab: Int) {
        selectedTab = tab
        switch tab {
        case 1: menuBarDisplayMode = "deepseek"
        case 2: menuBarDisplayMode = "ollama"
        case 3: menuBarDisplayMode = "ollamapay"
        default: menuBarDisplayMode = "default"
        }
        AppDelegate.shared?.refreshMenuBarTitle()
    }
    
    var body: some View {
        VStack(spacing: 12) {
            // Row 1: Centralized Header Title & Action Buttons
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.blue)
                    Text("AI Widget Dashboard")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                }
                
                Spacer()
                
                Button(action: { refreshAll() }) {
                    Color.clear.frame(width: 16, height: 16).overlay(
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.secondary)
                            .rotationEffect(.degrees(isAnyLoading ? 360 : 0))
                            .animation(isAnyLoading ? Animation.linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isAnyLoading)
                    )
                }
                .buttonStyle(.plain)
                .focusable(false)
                
                Button(action: { showSettings.toggle() }) {
                    Color.clear.frame(width: 16, height: 16).overlay(
                        Image(systemName: "gearshape")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(showSettings ? .blue : .secondary)
                    )
                }
                .buttonStyle(.plain)
                .focusable(false)
            }
            
            HStack(spacing: 6) {
                TabPillButton(title: "Overview", icon: "square.grid.2x2.fill", isSelected: selectedTab == 0) { changeTab(to: 0) }
                TabPillButton(title: "DeepSeek", icon: "sparkles", customIconPath: getAssetPath("deepseek_icon.png"), isSelected: selectedTab == 1) { changeTab(to: 1) }
                TabPillButton(title: "Ollama", icon: "cloud.fill", customIconPath: getAssetPath("ollama.png"), isSelected: selectedTab == 2) { changeTab(to: 2) }
                TabPillButton(title: "Pay", icon: "creditcard.fill", isSelected: selectedTab == 3) { changeTab(to: 3) }
            }
            
            Divider()
            
            if showSettings {
                // Centralized App & API Settings View with ScrollView
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Centralized Settings")
                            .font(.caption)
                            .bold()
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Auto-Refresh Interval")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.secondary)
                            Picker("", selection: Binding(
                                get: { globalRefreshInterval },
                                set: { syncRefreshInterval($0) }
                            )) {
                                Text("Every 1 minute").tag(60)
                                Text("Every 5 minutes").tag(300)
                                Text("Every 15 minutes").tag(900)
                                Text("Every 30 minutes").tag(1800)
                                Text("Manual only").tag(0)
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                        }
                        
                        Toggle("Launch at Login", isOn: $launchService.isEnabled)
                            .font(.system(size: 11, weight: .medium))
                            .toggleStyle(.checkbox)
                        
                        Toggle("Enable Low Quota System Notifications", isOn: $enableNotifications)
                            .font(.system(size: 11, weight: .medium))
                            .toggleStyle(.checkbox)
                        
                        Divider()
                        
                        Text("API Keys Configuration")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.secondary)
                        
                        VStack(alignment: .leading, spacing: 6) {
                            Text("DeepSeek API Key")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.secondary)
                            SecureField("sk-...", text: $dsVM.apiKey)
                                .textFieldStyle(.roundedBorder)
                            
                            Text("Ollama Cloud Token")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.secondary)
                            SecureField("Token...", text: $olVM.ollamaApiKey)
                                .textFieldStyle(.roundedBorder)
                            
                            Text("Ollama Pay Key")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.secondary)
                            SecureField("sk-...", text: $opVM.apiKey)
                                .textFieldStyle(.roundedBorder)
                        }
                        
                        Button("Save & Apply Settings") {
                            showSettings = false
                            refreshAll()
                        }
                        .font(.caption)
                        .buttonStyle(.borderedProminent)
                        .focusable(false)
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.05)))
                }
                .frame(maxHeight: 280)
            } else {
                // Tab Content
                switch selectedTab {
                case 0:
                    overviewTabContent
                case 1:
                    DeepSeekPopoverView(vm: dsVM)
                case 2:
                    OllamaPopoverView(vm: olVM)
                case 3:
                    OllamaPayPopoverView(vm: opVM)
                default:
                    overviewTabContent
                }
            }
        }
        .padding(14)
        .frame(width: 350)
    }
    
    // Overview Summary Cards View
    var overviewTabContent: some View {
        VStack(spacing: 10) {
            // DeepSeek Summary Card (Interactive Button)
            Button(action: { changeTab(to: 1) }) {
                HStack {
                    HStack(spacing: 6) {
                        let iconPath = getAssetPath("deepseek_icon.png")
                        if let dsImg = NSImage(contentsOfFile: iconPath) {
                            Image(nsImage: dsImg)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(systemName: "sparkles")
                                .foregroundColor(.cyan)
                        }
                        Text("DeepSeek")
                            .font(.system(size: 12, weight: .bold))
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("$\(dsVM.balance) \(dsVM.currency)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text("Spent Today: $\(dsVM.spentToday)")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary.opacity(0.6))
                        .padding(.leading, 4)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.blue.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .focusable(false)
            
            // Ollama Cloud Summary Card (Interactive Button)
            Button(action: { changeTab(to: 2) }) {
                HStack {
                    HStack(spacing: 6) {
                        let iconPath = getAssetPath("ollama.png")
                        if let olImg = NSImage(contentsOfFile: iconPath) {
                            Image(nsImage: olImg)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(systemName: "cloud.fill")
                                .foregroundColor(.orange)
                        }
                        Text("Ollama Cloud")
                            .font(.system(size: 12, weight: .bold))
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(String(format: "%.1f", olVM.sessionUsagePercent))% Session")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text("Weekly: \(String(format: "%.1f", olVM.weeklyUsagePercent))% used")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary.opacity(0.6))
                        .padding(.leading, 4)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.orange.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .focusable(false)
            
            // Ollama Pay Summary Card (Interactive Button)
            Button(action: { changeTab(to: 3) }) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "creditcard.fill")
                            .foregroundColor(.purple)
                            .font(.system(size: 12))
                        Text("Ollama Pay")
                            .font(.system(size: 12, weight: .bold))
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(opVM.todayTokens.formattedTokenString) tokens")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text("Month: \(opVM.monthTokens.formattedTokenString)")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary.opacity(0.6))
                        .padding(.leading, 4)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.purple.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.purple.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .focusable(false)
            
            Divider()
            
            // Bottom Action Footer with Last Updated Time
            HStack {
                if let lastRefreshed = lastRefreshedDate {
                    Text("Updated \(lastRefreshed, formatter: dateFormatter)")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary.opacity(0.8))
                }
                
                Spacer()
                
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

private let dateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.timeStyle = .medium
    return formatter
}()

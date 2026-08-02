import Foundation
import ServiceManagement

class LaunchAtLoginService: ObservableObject {
    static let shared = LaunchAtLoginService()
    
    @Published var isEnabled: Bool {
        didSet {
            setLaunchAtLogin(enabled: isEnabled)
        }
    }
    
    private init() {
        if #available(macOS 13.0, *) {
            self.isEnabled = SMAppService.mainApp.status == .enabled
        } else {
            self.isEnabled = UserDefaults.standard.bool(forKey: "LaunchAtLoginEnabled")
        }
    }
    
    private func setLaunchAtLogin(enabled: Bool) {
        if #available(macOS 13.0, *) {
            do {
                if enabled {
                    if SMAppService.mainApp.status != .enabled {
                        try SMAppService.mainApp.register()
                    }
                } else {
                    if SMAppService.mainApp.status == .enabled {
                        try SMAppService.mainApp.unregister()
                    }
                }
            } catch {
                print("LaunchAtLogin error: \(error.localizedDescription)")
            }
        }
        UserDefaults.standard.set(enabled, forKey: "LaunchAtLoginEnabled")
    }
}

import SwiftUI
import AppKit

// MARK: - App & Delegate Unified Status Item
@main
struct AIWidgetApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    static var shared: AppDelegate?
    
    var statusItem: NSStatusItem!
    var mainPopover: NSPopover!
    var globalEventMonitor: Any?
    
    var latestDeepSeekBalance: String?
    var latestOllamaPercent: Int?
    var latestOllamaPayStr: String?
    
    func refreshMenuBarTitle() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let mode = UserDefaults.standard.string(forKey: "MenuBarDisplayMode") ?? "deepseek"
            
            switch mode {
            case "deepseek":
                if let bal = self.latestDeepSeekBalance {
                    self.statusItem?.button?.title = " ✨ $\(bal)"
                } else {
                    self.statusItem?.button?.title = " ✨ DeepSeek"
                }
            case "ollama":
                if let pct = self.latestOllamaPercent {
                    self.statusItem?.button?.title = " ☁️ \(pct)%"
                } else {
                    self.statusItem?.button?.title = " ☁️ Ollama"
                }
            case "ollamapay":
                if let str = self.latestOllamaPayStr {
                    self.statusItem?.button?.title = " 💳 \(str)"
                } else {
                    self.statusItem?.button?.title = " 💳 Pay"
                }
            case "default":
                fallthrough
            default:
                self.statusItem?.button?.title = " AI Widget"
            }
        }
    }
    
    func updateDeepSeekTitle(balance: String) {
        self.latestDeepSeekBalance = balance
        refreshMenuBarTitle()
    }
    
    func updateOllamaTitle(sessionPercent: Int) {
        self.latestOllamaPercent = sessionPercent
        refreshMenuBarTitle()
    }
    
    func updateOllamaPayTitle(todayStr: String) {
        self.latestOllamaPayStr = todayStr
        refreshMenuBarTitle()
    }
    
    func resetStatusItemTitle() {
        refreshMenuBarTitle()
    }
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        NSApp.setActivationPolicy(.accessory)
        
        // Request notification permission
        NotificationService.shared.requestAuthorization()
        
        // 1. Single Unified Menu Bar Item
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = self.statusItem.button {
            button.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "AI Widget")
            button.title = " AI Widget"
            button.toolTip = "AI Quota & Balance Dashboard"
            button.action = #selector(toggleMainPopover(_:))
        }
        
        // 2. Single Unified Popover
        let popover = NSPopover()
        popover.animates = false
        popover.contentSize = NSSize(width: 350, height: 350)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: UnifiedMainPopoverView())
        self.mainPopover = popover
        
        // 3. Global mouse listener to close popover when user clicks anywhere outside
        self.globalEventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self = self else { return }
            if self.mainPopover?.isShown == true {
                self.mainPopover.performClose(nil)
            }
        }
    }
    
    @objc func toggleMainPopover(_ sender: AnyObject?) {
        if let button = self.statusItem.button {
            if self.mainPopover.isShown {
                self.mainPopover.performClose(sender)
            } else {
                NSApp.activate(ignoringOtherApps: true)
                self.mainPopover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            }
        }
    }
}

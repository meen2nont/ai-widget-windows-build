import Foundation
import UserNotifications

class NotificationService {
    static let shared = NotificationService()
    private var lastNotificationTime: [String: Date] = [:]
    private let throttleInterval: TimeInterval = 3600 // Notify at most once per hour per category
    
    private var isNotificationSupported: Bool {
        // UNUserNotificationCenter requires a valid app bundle identifier on macOS
        return Bundle.main.bundleIdentifier != nil
    }
    
    private init() {}
    
    func requestAuthorization() {
        guard isNotificationSupported else {
            print("Notifications skipped: running without app bundle proxy")
            return
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }
    
    func sendNotification(identifier: String, title: String, body: String) {
        guard isNotificationSupported else { return }
        let isEnabled = UserDefaults.standard.object(forKey: "EnableNotifications") as? Bool ?? true
        guard isEnabled else { return }
        
        // Throttling check
        if let lastTime = lastNotificationTime[identifier], Date().timeIntervalSince(lastTime) < throttleInterval {
            return
        }
        
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: "\(identifier)_\(Date().timeIntervalSince1970)", content: content, trigger: nil)
        
        UNUserNotificationCenter.current().add(request) { [weak self] error in
            if error == nil {
                self?.lastNotificationTime[identifier] = Date()
            }
        }
    }
}

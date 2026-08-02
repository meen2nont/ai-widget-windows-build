import Foundation
import Security

struct KeychainHelper {
    private static let serviceName = "com.aiwidget.app"
    private static let masterConfigKey = "AIWidgetMasterConfig"
    private static var memoryCache: [String: String] = [:]
    private static var isLoadedFromKeychain = false

    private static func ensureLoaded() {
        guard !isLoadedFromKeychain else { return }
        isLoadedFromKeychain = true
        
        // 1. Try reading unified master config from Keychain (Only 1 Keychain read!)
        if let jsonString = rawLoad(key: masterConfigKey),
           let data = jsonString.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            memoryCache = dict
            return
        }
        
        // 2. Fallback & Migration: convert old individual keys to master config
        let keys = ["DeepSeekAPIKey", "OllamaApiKey", "OllamaPayAPIKey"]
        var migrated = false
        for k in keys {
            if let val = rawLoad(key: k) ?? UserDefaults.standard.string(forKey: k), !val.isEmpty {
                memoryCache[k] = val
                migrated = true
                rawDelete(key: k)
                UserDefaults.standard.removeObject(forKey: k)
            }
        }
        
        if migrated {
            saveMasterConfig()
        }
    }
    
    private static func saveMasterConfig() {
        guard let data = try? JSONSerialization.data(withJSONObject: memoryCache),
              let jsonString = String(data: data, encoding: .utf8) else { return }
        rawSave(key: masterConfigKey, data: jsonString)
    }

    static func save(key: String, data: String) {
        ensureLoaded()
        let clean = data.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty {
            memoryCache.removeValue(forKey: key)
        } else {
            memoryCache[key] = clean
        }
        saveMasterConfig()
    }
    
    static func load(key: String) -> String? {
        ensureLoaded()
        return memoryCache[key]
    }
    
    static func delete(key: String) {
        ensureLoaded()
        memoryCache.removeValue(forKey: key)
        saveMasterConfig()
    }

    // Raw Keychain primitives for the single master item
    private static func rawSave(key: String, data: String) {
        guard let dataToSave = data.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        
        var newQuery = query
        newQuery[kSecValueData as String] = dataToSave
        newQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(newQuery as CFDictionary, nil)
    }
    
    private static func rawLoad(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        if status == errSecSuccess, let retrievedData = dataTypeRef as? Data, let result = String(data: retrievedData, encoding: .utf8) {
            return result
        }
        return nil
    }

    private static func rawDelete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

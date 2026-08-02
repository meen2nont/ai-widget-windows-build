import Foundation
import SwiftUI
import AppKit

// MARK: - Ollama Pay ViewModel
@MainActor
class OllamaPayViewModel: ObservableObject {
    @Published var apiKey: String {
        didSet {
            let cleanKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
            if cleanKey.isEmpty {
                KeychainHelper.delete(key: "OllamaPayAPIKey")
            } else {
                KeychainHelper.save(key: "OllamaPayAPIKey", data: cleanKey)
            }
        }
    }
    @Published var refreshInterval: Int {
        didSet {
            UserDefaults.standard.set(refreshInterval, forKey: "OllamaPayRefreshInterval")
            startAutoRefresh()
        }
    }
    @Published var isAvailable: Bool = true
    @Published var isLoading: Bool = false
    @Published var todayTokens: Int = 0
    @Published var totalTokensUsed: Int = 0
    @Published var tokensLimit: Int = 0
    @Published var errorMsg: String = ""
    @Published var monthTokens: Int = 0
    @Published var monthRequests: Int = 0
    @Published var todayRequests: Int = 0
    @Published var tokensRemaining: Int = 0
    @Published var todayPloyJoyTokens: Int = 0
    @Published var latencyMs: Int = 0
    
    private var refreshTimer: Timer?
    
    init() {
        self.apiKey = KeychainHelper.load(key: "OllamaPayAPIKey") ?? ""
        let savedInterval = UserDefaults.standard.integer(forKey: "OllamaPayRefreshInterval")
        self.refreshInterval = savedInterval > 0 ? savedInterval : 60
        fetchData()
        startAutoRefresh()
    }
    
    func startAutoRefresh() {
        refreshTimer?.invalidate()
        guard refreshInterval > 0 else { return }
        refreshTimer = Timer.scheduledTimer(withTimeInterval: TimeInterval(refreshInterval), repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.fetchData()
            }
        }
    }
    
    func fetchData() {
        let cleanKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanKey.isEmpty, let url = URL(string: APIConstants.OllamaPay.usageTotalURL) else {
            self.isAvailable = false
            self.errorMsg = "API Key not set"
            AppDelegate.shared?.updateOllamaPayTitle(todayStr: "No Key")
            return
        }
        
        self.isLoading = true
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(cleanKey)", forHTTPHeaderField: "Authorization")
        
        let start = Date()
        
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isLoading = false
                self.latencyMs = Int(Date().timeIntervalSince(start) * 1000)
                if let error = error {
                    self.isAvailable = false
                    self.errorMsg = error.localizedDescription
                    return
                }
                guard let data = data else {
                    self.isAvailable = false
                    self.errorMsg = "No data received"
                    return
                }
                
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                    self.isAvailable = false
                    self.errorMsg = "Error \(httpResponse.statusCode)"
                    AppDelegate.shared?.updateOllamaPayTitle(todayStr: "Err")
                    
                    if httpResponse.statusCode == 429 {
                        NotificationService.shared.sendNotification(
                            identifier: "ollama_pay_rate_limit",
                            title: "⚠️ Ollama Pay Rate Limited",
                            body: "Rate limit reached for Ollama Pay API."
                        )
                    }
                    return
                }
                
                do {
                    let res = try JSONDecoder().decode(OllamaPayUsageResponse.self, from: data)
                    self.isAvailable = true
                    self.todayTokens = res.accounting?.todayTokens ?? 0
                    self.totalTokensUsed = res.tokensUsed ?? 0
                    self.tokensLimit = res.tokensLimit ?? 0
                    self.errorMsg = ""
                    self.monthTokens = res.accounting?.monthTokens ?? 0
                    self.monthRequests = res.accounting?.monthRequests ?? 0
                    self.todayRequests = res.accounting?.todayRequests ?? 0
                    self.tokensRemaining = res.tokensRemaining ?? 0
                    self.todayPloyJoyTokens = res.accounting?.todayPloyJoyTokens ?? 0
                    
                    AppDelegate.shared?.updateOllamaPayTitle(todayStr: self.todayTokens.formattedTokenString)
                } catch {
                    self.isAvailable = false
                    self.errorMsg = "Parse error"
                    AppDelegate.shared?.updateOllamaPayTitle(todayStr: "Err")
                }
            }
        }.resume()
    }
    
    func saveSettings() {
        startAutoRefresh()
        fetchData()
    }
}

import Foundation
import SwiftUI
import Combine
import AppKit

// MARK: - Ollama Cloud ViewModel
@MainActor
class OllamaViewModel: ObservableObject {

    @Published var ollamaApiKey: String {
        didSet {
            KeychainHelper.save(key: "OllamaApiKey", data: ollamaApiKey)
            fetchOllamaCloudUsage()
        }
    }
    @Published var cloudTier: String {
        didSet {
            UserDefaults.standard.set(cloudTier, forKey: "OllamaCloudTier")
        }
    }
    @Published var refreshInterval: Int {
        didSet {
            UserDefaults.standard.set(refreshInterval, forKey: "OllamaRefreshInterval")
            startAutoRefresh()
        }
    }
    
    // Real API Usage Data from https://ollama.com/api/usage
    @Published var sessionUsagePercent: Double = 0.0
    @Published var weeklyUsagePercent: Double = 0.0
    @Published var cloudCost: String = "$0.00"
    @Published var isAvailable: Bool = false
    @Published var isLoading: Bool = false

    
    private var cancellables = Set<AnyCancellable>()
    private var refreshTimer: Timer?
    
    var sessionRemainingPercent: Double {
        return max(0, 100.0 - sessionUsagePercent)
    }
    
    var weeklyRemainingPercent: Double {
        return max(0, 100.0 - weeklyUsagePercent)
    }
    
    init() {
        self.ollamaApiKey = KeychainHelper.load(key: "OllamaApiKey") ?? ""
        self.cloudTier = UserDefaults.standard.string(forKey: "OllamaCloudTier") ?? "Pro Tier"
        let savedInterval = UserDefaults.standard.integer(forKey: "OllamaRefreshInterval")
        self.refreshInterval = savedInterval > 0 ? savedInterval : 60
        fetchData()
        startAutoRefresh()
        AppDelegate.shared?.updateOllamaTitle(sessionPercent: Int(self.sessionUsagePercent))
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
        isLoading = true
        fetchOllamaCloudUsage()
    }
    
    func fetchOllamaCloudUsage() {
        guard !ollamaApiKey.isEmpty, let url = URL(string: APIConstants.Ollama.usageURL) else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 6.0
        request.setValue("Bearer \(ollamaApiKey)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: OllamaUsageResponse.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure = completion {
                    self?.isAvailable = false
                }
            }, receiveValue: { [weak self] res in
                guard let self = self else { return }
                self.isLoading = false
                self.isAvailable = true
                if let sess = res.limits?.session?.usage {
                    self.sessionUsagePercent = sess * 100.0
                    let remaining = self.sessionRemainingPercent
                    if remaining <= Double(APIConstants.Ollama.lowSessionQuotaThresholdPercent) {
                        NotificationService.shared.sendNotification(
                            identifier: "low_ollama_session_quota",
                            title: "⚠️ Ollama Cloud Quota Low",
                            body: "Your 5-hour session quota is at \(String(format: "%.1f", remaining))% remaining."
                        )
                    }
                }
                if let wk = res.limits?.weekly?.usage {
                    self.weeklyUsagePercent = wk * 100.0
                }
                if let cost = res.activity?.cost {
                    self.cloudCost = cost
                }
                AppDelegate.shared?.updateOllamaTitle(sessionPercent: Int(self.sessionUsagePercent))
            })
            .store(in: &cancellables)
    }
    

}

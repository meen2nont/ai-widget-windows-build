import Foundation
import SwiftUI
import Combine
import AppKit

// MARK: - Ollama Cloud ViewModel
@MainActor
class OllamaViewModel: ObservableObject {
    @Published var ollamaHost: String {
        didSet {
            UserDefaults.standard.set(ollamaHost, forKey: "OllamaHost")
        }
    }
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
    @Published var sessionUsagePercent: Int = 0
    @Published var weeklyUsagePercent: Int = 0
    @Published var cloudCost: String = "$0.00"
    
    @Published var cloudModels: [OllamaModelItem] = []
    @Published var selectedOllamaModel: String = "" {
        didSet {
            UserDefaults.standard.set(selectedOllamaModel, forKey: "SelectedOllamaModel")
        }
    }
    @Published var isAvailable: Bool = false
    @Published var latencyMs: Int = 0
    @Published var lastTokenInfo: String = ""
    @Published var isLoading: Bool = false
    @Published var isGenerating: Bool = false
    @Published var promptText: String = ""
    @Published var aiResponse: String = ""
    @Published var copySuccess: Bool = false
    
    private var cancellables = Set<AnyCancellable>()
    private var refreshTimer: Timer?
    
    var sessionRemainingPercent: Int {
        return max(0, 100 - sessionUsagePercent)
    }
    
    var weeklyRemainingPercent: Int {
        return max(0, 100 - weeklyUsagePercent)
    }
    
    init() {
        self.ollamaHost = UserDefaults.standard.string(forKey: "OllamaHost") ?? APIConstants.Ollama.defaultHost
        self.ollamaApiKey = KeychainHelper.load(key: "OllamaApiKey") ?? ""
        self.cloudTier = UserDefaults.standard.string(forKey: "OllamaCloudTier") ?? "Pro Tier"
        let savedInterval = UserDefaults.standard.integer(forKey: "OllamaRefreshInterval")
        self.refreshInterval = savedInterval > 0 ? savedInterval : 60
        self.selectedOllamaModel = UserDefaults.standard.string(forKey: "SelectedOllamaModel") ?? ""
        fetchData()
        startAutoRefresh()
        AppDelegate.shared?.updateOllamaTitle(sessionPercent: self.sessionUsagePercent)
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
        fetchOllamaModels()
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
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] res in
                guard let self = self else { return }
                if let sess = res.limits?.session?.usage {
                    self.sessionUsagePercent = sess
                    let remaining = self.sessionRemainingPercent
                    if remaining <= APIConstants.Ollama.lowSessionQuotaThresholdPercent {
                        NotificationService.shared.sendNotification(
                            identifier: "low_ollama_session_quota",
                            title: "⚠️ Ollama Cloud Quota Low",
                            body: "Your 5-hour session quota is at \(remaining)% remaining."
                        )
                    }
                }
                if let wk = res.limits?.weekly?.usage {
                    self.weeklyUsagePercent = wk
                }
                if let cost = res.activity?.cost {
                    self.cloudCost = cost
                }
                AppDelegate.shared?.updateOllamaTitle(sessionPercent: self.sessionUsagePercent)
            })
            .store(in: &cancellables)
    }
    
    func fetchOllamaModels() {
        let cleanHost = ollamaHost.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(cleanHost)/api/tags") else {
            isAvailable = false
            isLoading = false
            return
        }
        let start = Date()
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 5.0
        if !ollamaApiKey.isEmpty {
            request.setValue("Bearer \(ollamaApiKey)", forHTTPHeaderField: "Authorization")
        }
        
        URLSession.shared.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: OllamaTagsResponse.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure = completion {
                    self?.isAvailable = false
                }
            }, receiveValue: { [weak self] res in
                guard let self = self else { return }
                self.isLoading = false
                self.latencyMs = Int(Date().timeIntervalSince(start) * 1000)
                self.isAvailable = true
                if let models = res.models {
                    let filtered = models.filter { $0.isCloud }
                    self.cloudModels = filtered.isEmpty ? models : filtered
                    let names = self.cloudModels.map { $0.name }
                    if self.selectedOllamaModel.isEmpty || !names.contains(self.selectedOllamaModel) {
                        self.selectedOllamaModel = names.first ?? ""
                    }
                }
            })
            .store(in: &cancellables)
    }
    
    func sendPrompt(systemPrompt: String? = nil) {
        let prompt = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !selectedOllamaModel.isEmpty else { return }
        
        let cleanHost = ollamaHost.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(cleanHost)/api/chat") else { return }
        
        isGenerating = true
        let start = Date()
        
        var messages: [[String: String]] = []
        if let sys = systemPrompt {
            messages.append(["role": "system", "content": sys])
        }
        messages.append(["role": "user", "content": prompt])
        
        let body: [String: Any] = [
            "model": selectedOllamaModel,
            "messages": messages,
            "stream": false
        ]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !ollamaApiKey.isEmpty {
            request.setValue("Bearer \(ollamaApiKey)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isGenerating = false
                self.latencyMs = Int(Date().timeIntervalSince(start) * 1000)
                if let data = data,
                   let decoded = try? JSONDecoder().decode(OllamaChatResponse.self, from: data) {
                    if let content = decoded.message?.content {
                        self.aiResponse = content
                        self.promptText = ""
                        if let eval = decoded.evalCount {
                            let promptEval = decoded.promptEvalCount ?? 0
                            self.lastTokenInfo = "\(promptEval) in / \(eval) out tokens"
                        }
                        self.fetchOllamaCloudUsage()
                    }
                } else {
                    self.aiResponse = "Error getting response from Ollama Cloud at \(cleanHost)."
                }
            }
        }.resume()
    }
    
    func copyToClipboard() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(aiResponse, forType: .string)
        copySuccess = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.copySuccess = false
        }
    }
}

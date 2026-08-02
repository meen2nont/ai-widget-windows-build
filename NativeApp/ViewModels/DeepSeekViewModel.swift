import Foundation
import SwiftUI
import Combine
import AppKit

// MARK: - DeepSeek ViewModel
@MainActor
class DeepSeekViewModel: ObservableObject {
    @Published var apiKey: String {
        didSet {
            KeychainHelper.save(key: "DeepSeekAPIKey", data: apiKey)
        }
    }
    @Published var refreshInterval: Int {
        didSet {
            UserDefaults.standard.set(refreshInterval, forKey: "DeepSeekRefreshInterval")
            startAutoRefresh()
        }
    }
    @Published var balance: String = "--"
    @Published var currency: String = "USD"
    @Published var spentToday: String = "0.0000"
    @Published var isAvailable: Bool = true
    @Published var selectedModel: String = APIConstants.DeepSeek.defaultModel
    @Published var latencyMs: Int = 0
    @Published var isLoading: Bool = false
    @Published var isGenerating: Bool = false
    @Published var promptText: String = ""
    @Published var aiResponse: String = ""
    @Published var copySuccess: Bool = false
    
    private var cancellables = Set<AnyCancellable>()
    private var refreshTimer: Timer?
    
    init() {
        self.apiKey = KeychainHelper.load(key: "DeepSeekAPIKey") ?? ""
        let savedInterval = UserDefaults.standard.integer(forKey: "DeepSeekRefreshInterval")
        self.refreshInterval = savedInterval > 0 ? savedInterval : 60
        fetchData()
        startAutoRefresh()
        AppDelegate.shared?.updateDeepSeekTitle(balance: self.balance)
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
        guard !apiKey.isEmpty, let url = URL(string: APIConstants.DeepSeek.balanceURL) else {
            isAvailable = false
            isLoading = false
            return
        }
        isLoading = true
        let start = Date()
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: BalanceResponse.self, decoder: JSONDecoder())
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
                self.isAvailable = res.isAvailable
                if let info = res.balanceInfos?.first {
                    self.balance = info.totalBalance
                    self.currency = info.currency
                    self.updateDailySpend(currentBalance: info.totalBalance)
                    AppDelegate.shared?.updateDeepSeekTitle(balance: info.totalBalance)
                    
                    // Low balance notification check
                    if let doubleBalance = Double(info.totalBalance), doubleBalance < APIConstants.DeepSeek.lowBalanceThreshold {
                        NotificationService.shared.sendNotification(
                            identifier: "low_deepseek_balance",
                            title: "⚠️ DeepSeek Balance Low",
                            body: "Your remaining DeepSeek balance is $\(info.totalBalance) \(info.currency). Please top up soon."
                        )
                    }
                }
            })
            .store(in: &cancellables)
    }
    
    private func updateDailySpend(currentBalance: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayStr = formatter.string(from: Date())
        
        let savedDate = UserDefaults.standard.string(forKey: "DailySpendDate") ?? ""
        let startBalStr = UserDefaults.standard.string(forKey: "DailySpendStartBal") ?? currentBalance
        
        guard let current = Double(currentBalance) else { return }
        
        if savedDate == todayStr {
            if let start = Double(startBalStr) {
                if current > start {
                    UserDefaults.standard.set(currentBalance, forKey: "DailySpendStartBal")
                    self.spentToday = "0.0000"
                } else {
                    let diff = max(0, start - current)
                    self.spentToday = String(format: "%.4f", diff)
                }
            }
        } else {
            UserDefaults.standard.set(todayStr, forKey: "DailySpendDate")
            UserDefaults.standard.set(currentBalance, forKey: "DailySpendStartBal")
            self.spentToday = "0.0000"
        }
    }
    
    func sendPrompt(systemPrompt: String? = nil) {
        guard !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !apiKey.isEmpty else { return }
        guard let url = URL(string: APIConstants.DeepSeek.chatCompletionsURL) else { return }
        
        isGenerating = true
        let start = Date()
        
        var messages: [[String: String]] = []
        if let sys = systemPrompt {
            messages.append(["role": "system", "content": sys])
        }
        messages.append(["role": "user", "content": promptText])
        
        let body: [String: Any] = [
            "model": selectedModel,
            "messages": messages,
            "max_tokens": 1000
        ]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isGenerating = false
                self.latencyMs = Int(Date().timeIntervalSince(start) * 1000)
                if let data = data,
                   let decoded = try? JSONDecoder().decode(ChatResponse.self, from: data),
                   let content = decoded.choices?.first?.message.content {
                    self.aiResponse = content
                    self.promptText = ""
                    self.fetchData()
                } else {
                    self.aiResponse = "Error getting response from DeepSeek API."
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

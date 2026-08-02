import Foundation

struct APIConstants {
    struct DeepSeek {
        static let balanceURL = "https://api.deepseek.com/user/balance"
        static let chatCompletionsURL = "https://api.deepseek.com/chat/completions"
        static let dashboardURL = "https://platform.deepseek.com/usage"
        static let defaultModel = "deepseek-chat"
        static let lowBalanceThreshold: Double = 1.00
    }
    
    struct Ollama {
        static let defaultHost = "http://localhost:11434"
        static let usageURL = "https://ollama.com/api/usage"
        static let settingsURL = "https://ollama.com/settings"
        static let lowSessionQuotaThresholdPercent: Int = 15
    }
    
    struct OllamaPay {
        static let usageTotalURL = "https://ollama-pay.thaigqsoft.com/api/v1/usage/total"
        static let dashboardURL = "https://ollama-pay.thaigqsoft.com/"
    }
}

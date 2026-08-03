import Foundation

// MARK: - Ollama Cloud Models & Real Usage API Response

// MARK: - Ollama Pay API Response
struct OllamaPayUsageResponse: Codable {
    let totalTokens: Int?
    let tokensUsed: Int?
    let tokensLimit: Int?
    let tokensRemaining: Int?
    let requestsUsed: Int?
    let requestsLimit: Int?
    let resetAt: String?
    let accounting: OllamaPayAccounting?
}

struct OllamaPayAccounting: Codable {
    let todayTokens: Int?
    let monthTokens: Int?
    let todayRequests: Int?
    let monthRequests: Int?
    let todayPloyJoyTokens: Int?
    let monthPloyJoyTokens: Int?
    let todayPloyJoyRequests: Int?
    let monthPloyJoyRequests: Int?
    let since: String?
}

// Real API usage model from https://ollama.com/api/usage
struct OllamaUsageResponse: Codable {
    struct Limits: Codable {
        struct WindowInfo: Codable {
            let usage: Double?
        }
        let session: WindowInfo?
        let weekly: WindowInfo?
    }
    struct Activity: Codable {
        let cost: String?
    }
    let limits: Limits?
    let activity: Activity?
}

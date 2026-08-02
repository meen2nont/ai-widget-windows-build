import Foundation

// MARK: - Ollama Cloud Models & Real Usage API Response
struct OllamaModelItem: Codable, Identifiable, Hashable {
    let name: String
    let remoteModel: String?
    let remoteHost: String?
    
    var id: String { name }
    
    enum CodingKeys: String, CodingKey {
        case name
        case remoteModel = "remote_model"
        case remoteHost = "remote_host"
    }
    
    var isCloud: Bool {
        return (remoteHost != nil && !remoteHost!.isEmpty) || (remoteModel != nil && !remoteModel!.isEmpty) || name.lowercased().contains("cloud")
    }
    
    var displayName: String {
        return "☁️ \(name)"
    }
}

struct OllamaTagsResponse: Codable {
    let models: [OllamaModelItem]?
}

struct OllamaChatResponse: Codable {
    struct Message: Codable {
        let role: String
        let content: String
    }
    let message: Message?
    let promptEvalCount: Int?
    let evalCount: Int?
    let totalDuration: Int64?
    
    enum CodingKeys: String, CodingKey {
        case message
        case promptEvalCount = "prompt_eval_count"
        case evalCount = "eval_count"
        case totalDuration = "total_duration"
    }
}

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
            let usage: Int?
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

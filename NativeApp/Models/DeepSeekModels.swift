import Foundation

// MARK: - DeepSeek Models & API Response
struct BalanceResponse: Codable {
    let isAvailable: Bool
    let balanceInfos: [BalanceInfo]?
    
    enum CodingKeys: String, CodingKey {
        case isAvailable = "is_available"
        case balanceInfos = "balance_infos"
    }
}

struct BalanceInfo: Codable {
    let currency: String
    let totalBalance: String
    let toppedUpBalance: String
    let grantedBalance: String
    
    enum CodingKeys: String, CodingKey {
        case currency
        case totalBalance = "total_balance"
        case toppedUpBalance = "topped_up_balance"
        case grantedBalance = "granted_balance"
    }
}

struct ChatResponse: Codable {
    struct Choice: Codable {
        struct Message: Codable {
            let role: String
            let content: String
        }
        let message: Message
    }
    let choices: [Choice]?
}

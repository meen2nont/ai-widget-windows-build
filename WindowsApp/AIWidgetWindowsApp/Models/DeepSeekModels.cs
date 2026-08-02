using System.Text.Json.Serialization;

namespace AIWidgetWindowsApp.Models
{
    public class BalanceResponse
    {
        [JsonPropertyName("is_available")]
        public bool IsAvailable { get; set; }

        [JsonPropertyName("balance_infos")]
        public List<BalanceInfo>? BalanceInfos { get; set; }
    }

    public class BalanceInfo
    {
        [JsonPropertyName("currency")]
        public string? Currency { get; set; }

        [JsonPropertyName("total_balance")]
        public string? TotalBalance { get; set; }

        [JsonPropertyName("topped_up_balance")]
        public string? ToppedUpBalance { get; set; }

        [JsonPropertyName("granted_balance")]
        public string? GrantedBalance { get; set; }
    }

    public class ChatResponse
    {
        [JsonPropertyName("choices")]
        public List<Choice>? Choices { get; set; }
    }

    public class Choice
    {
        [JsonPropertyName("message")]
        public Message? Message { get; set; }
    }

    public class Message
    {
        [JsonPropertyName("role")]
        public string? Role { get; set; }

        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }
}

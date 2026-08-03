using System.Text.Json.Serialization;

namespace AIWidgetWindowsApp.Models
{
    public class OllamaPayUsageResponse
    {
        [JsonPropertyName("totalTokens")]
        public int? TotalTokens { get; set; }

        [JsonPropertyName("tokensUsed")]
        public int? TokensUsed { get; set; }

        [JsonPropertyName("tokensLimit")]
        public int? TokensLimit { get; set; }

        [JsonPropertyName("tokensRemaining")]
        public int? TokensRemaining { get; set; }

        [JsonPropertyName("requestsUsed")]
        public int? RequestsUsed { get; set; }

        [JsonPropertyName("requestsLimit")]
        public int? RequestsLimit { get; set; }

        [JsonPropertyName("resetAt")]
        public string? ResetAt { get; set; }

        [JsonPropertyName("accounting")]
        public OllamaPayAccounting? Accounting { get; set; }
    }

    public class OllamaPayAccounting
    {
        [JsonPropertyName("todayTokens")]
        public int? TodayTokens { get; set; }

        [JsonPropertyName("monthTokens")]
        public int? MonthTokens { get; set; }

        [JsonPropertyName("todayRequests")]
        public int? TodayRequests { get; set; }

        [JsonPropertyName("monthRequests")]
        public int? MonthRequests { get; set; }

        [JsonPropertyName("todayPloyJoyTokens")]
        public int? TodayPloyJoyTokens { get; set; }

        [JsonPropertyName("monthPloyJoyTokens")]
        public int? MonthPloyJoyTokens { get; set; }

        [JsonPropertyName("todayPloyJoyRequests")]
        public int? TodayPloyJoyRequests { get; set; }

        [JsonPropertyName("monthPloyJoyRequests")]
        public int? MonthPloyJoyRequests { get; set; }

        [JsonPropertyName("since")]
        public string? Since { get; set; }
    }
}

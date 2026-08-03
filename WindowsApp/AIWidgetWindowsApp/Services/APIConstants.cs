namespace AIWidgetWindowsApp.Services
{
    public static class APIConstants
    {
        public static class DeepSeek
        {
            public const string BalanceURL = "https://api.deepseek.com/user/balance";
            public const string ChatCompletionsURL = "https://api.deepseek.com/chat/completions";
            public const string DashboardURL = "https://platform.deepseek.com/usage";
            public const string DefaultModel = "deepseek-chat";
            public const double LowBalanceThreshold = 1.00;
        }

        public static class Ollama
        {
            public const string UsageURL = "https://ollama.com/api/usage";
            public const string SettingsURL = "https://ollama.com/settings";
            public const int LowSessionQuotaThresholdPercent = 15;
        }

        public static class OllamaPay
        {
            public const string UsageTotalURL = "https://ollama-pay.thaigqsoft.com/api/v1/usage/total";
            public const string DashboardURL = "https://ollama-pay.thaigqsoft.com/";
        }
    }
}

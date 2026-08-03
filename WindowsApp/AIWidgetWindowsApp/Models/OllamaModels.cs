using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AIWidgetWindowsApp.Models
{
    public class OllamaModelItem
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("remote_model")]
        public string? RemoteModel { get; set; }

        [JsonPropertyName("remote_host")]
        public string? RemoteHost { get; set; }

        public bool IsCloud
        {
            get
            {
                return (!string.IsNullOrEmpty(RemoteHost)) ||
                       (!string.IsNullOrEmpty(RemoteModel)) ||
                       (Name != null && Name.ToLower().Contains("cloud"));
            }
        }

        public string DisplayName => $"☁️ {Name}";
    }

    public class OllamaTagsResponse
    {
        [JsonPropertyName("models")]
        public List<OllamaModelItem>? Models { get; set; }
    }

    public class OllamaChatResponse
    {
        public class MessageData
        {
            [JsonPropertyName("role")]
            public string? Role { get; set; }

            [JsonPropertyName("content")]
            public string? Content { get; set; }
        }

        [JsonPropertyName("message")]
        public MessageData? Message { get; set; }

        [JsonPropertyName("prompt_eval_count")]
        public int? PromptEvalCount { get; set; }

        [JsonPropertyName("eval_count")]
        public int? EvalCount { get; set; }

        [JsonPropertyName("total_duration")]
        public long? TotalDuration { get; set; }
    }

    public class OllamaUsageResponse
    {
        public class LimitsData
        {
            public class WindowInfo
            {
                [JsonPropertyName("usage")]
                public double? Usage { get; set; }
            }

            [JsonPropertyName("session")]
            public WindowInfo? Session { get; set; }

            [JsonPropertyName("weekly")]
            public WindowInfo? Weekly { get; set; }
        }

        public class ActivityData
        {
            [JsonPropertyName("cost")]
            public string? Cost { get; set; }
        }

        [JsonPropertyName("limits")]
        public LimitsData? Limits { get; set; }

        [JsonPropertyName("activity")]
        public ActivityData? Activity { get; set; }
    }
}

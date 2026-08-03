using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AIWidgetWindowsApp.Models
{

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

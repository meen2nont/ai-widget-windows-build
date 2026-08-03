using System;
using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using AIWidgetWindowsApp.Helpers;
using AIWidgetWindowsApp.Models;
using AIWidgetWindowsApp.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.Linq;

namespace AIWidgetWindowsApp.ViewModels
{
    public partial class OllamaViewModel : ObservableObject
    {
        private readonly HttpClient _httpClient = new HttpClient();

        [ObservableProperty]
        private string ollamaApiKey = string.Empty;

        partial void OnOllamaApiKeyChanged(string value)
        {
            KeychainHelper.Save("OllamaApiKey", value);
            _ = FetchOllamaCloudUsageAsync();
        }

        [ObservableProperty]
        private int refreshInterval = 60;

        [ObservableProperty]
        private int sessionUsagePercent = 0;

        [ObservableProperty]
        private int weeklyUsagePercent = 0;

        [ObservableProperty]
        private string cloudCost = "$0.00";

        public ObservableCollection<OllamaModelItem> CloudModels { get; } = new ObservableCollection<OllamaModelItem>();

        [ObservableProperty]
        private string selectedOllamaModel = string.Empty;

        [ObservableProperty]
        private bool isAvailable = false;

        [ObservableProperty]
        private int latencyMs = 0;

        [ObservableProperty]
        private string lastTokenInfo = string.Empty;

        [ObservableProperty]
        private bool isLoading = false;

        [ObservableProperty]
        private bool isGenerating = false;

        [ObservableProperty]
        private string promptText = string.Empty;

        [ObservableProperty]
        private string aiResponse = string.Empty;

        [ObservableProperty]
        private bool copySuccess = false;

        public int SessionRemainingPercent => Math.Max(0, 100 - SessionUsagePercent);
        public int WeeklyRemainingPercent => Math.Max(0, 100 - WeeklyUsagePercent);

        public OllamaViewModel()
        {
            this.OllamaApiKey = KeychainHelper.Load("OllamaApiKey") ?? string.Empty;
            _ = FetchDataAsync();
        }

        [RelayCommand]
        public async Task FetchDataAsync()
        {
            IsLoading = true;
            await FetchOllamaModelsAsync();
            await FetchOllamaCloudUsageAsync();
            IsLoading = false;
        }

        private async Task FetchOllamaCloudUsageAsync()
        {
            if (string.IsNullOrWhiteSpace(OllamaApiKey)) return;

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, APIConstants.Ollama.UsageURL);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", OllamaApiKey);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var res = JsonSerializer.Deserialize<OllamaUsageResponse>(json);

                    if (res != null)
                    {
                        if (res.Limits?.Session?.Usage.HasValue == true)
                        {
                            SessionUsagePercent = res.Limits.Session.Usage.Value;
                            OnPropertyChanged(nameof(SessionRemainingPercent));
                        }
                        if (res.Limits?.Weekly?.Usage.HasValue == true)
                        {
                            WeeklyUsagePercent = res.Limits.Weekly.Usage.Value;
                            OnPropertyChanged(nameof(WeeklyRemainingPercent));
                        }
                        if (res.Activity?.Cost != null)
                        {
                            CloudCost = res.Activity.Cost;
                        }
                        
                        UpdateMainWindow($"{SessionUsagePercent}% Session");
                    }
                }
            }
            catch (Exception)
            {
                // Silent fail for usage fetch
            }
        }

        private async Task FetchOllamaModelsAsync()
        {
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, $"{APIConstants.Ollama.DefaultHost}/api/tags");
                if (!string.IsNullOrWhiteSpace(OllamaApiKey))
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", OllamaApiKey);
                }

                var response = await _httpClient.SendAsync(request);
                stopwatch.Stop();
                LatencyMs = (int)stopwatch.ElapsedMilliseconds;

                if (response.IsSuccessStatusCode)
                {
                    IsAvailable = true;
                    var json = await response.Content.ReadAsStringAsync();
                    var res = JsonSerializer.Deserialize<OllamaTagsResponse>(json);

                    if (res?.Models != null)
                    {
                        CloudModels.Clear();
                        var cloudOnly = res.Models.Where(m => m.IsCloud).ToList();
                        var source = cloudOnly.Any() ? cloudOnly : res.Models;
                        
                        foreach (var model in source)
                        {
                            CloudModels.Add(model);
                        }

                        if (string.IsNullOrEmpty(SelectedOllamaModel) || !source.Any(m => m.Name == SelectedOllamaModel))
                        {
                            SelectedOllamaModel = source.FirstOrDefault()?.Name ?? string.Empty;
                        }
                    }
                }
                else
                {
                    IsAvailable = false;
                }
            }
            catch (Exception)
            {
                IsAvailable = false;
            }
        }

        [RelayCommand]
        public async Task SendPromptAsync()
        {
            if (string.IsNullOrWhiteSpace(PromptText) || string.IsNullOrWhiteSpace(SelectedOllamaModel)) return;

            IsGenerating = true;
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, $"{APIConstants.Ollama.DefaultHost}/api/chat");
                if (!string.IsNullOrWhiteSpace(OllamaApiKey))
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", OllamaApiKey);
                }

                var body = new
                {
                    model = SelectedOllamaModel,
                    messages = new[] { new { role = "user", content = PromptText } },
                    stream = false
                };

                request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                stopwatch.Stop();
                LatencyMs = (int)stopwatch.ElapsedMilliseconds;

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var chatResponse = JsonSerializer.Deserialize<OllamaChatResponse>(json);
                    
                    if (chatResponse?.Message != null)
                    {
                        AiResponse = chatResponse.Message.Content ?? "";
                        PromptText = string.Empty;
                        
                        if (chatResponse.EvalCount.HasValue)
                        {
                            LastTokenInfo = $"{chatResponse.PromptEvalCount ?? 0} in / {chatResponse.EvalCount} out tokens";
                        }
                        
                        _ = FetchOllamaCloudUsageAsync();
                    }
                }
                else
                {
                    AiResponse = "Error getting response from Ollama.";
                }
            }
            catch (Exception ex)
            {
                AiResponse = $"Error: {ex.Message}";
            }
            finally
            {
                IsGenerating = false;
            }
        }

        [RelayCommand]
        public async Task CopyToClipboardAsync()
        {
            Clipboard.SetText(AiResponse);
            CopySuccess = true;
            await Task.Delay(2000);
            CopySuccess = false;
        }

        private void UpdateMainWindow(string value)
        {
            if (Application.Current.MainWindow is MainWindow mainWindow)
            {
                mainWindow.UpdateTrayTextIfSelected(2, value);
            }
        }
    }
}

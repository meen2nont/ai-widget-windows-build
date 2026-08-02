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

namespace AIWidgetWindowsApp.ViewModels
{
    public partial class DeepSeekViewModel : ObservableObject
    {
        private readonly HttpClient _httpClient = new HttpClient();
        
        [ObservableProperty]
        private string apiKey = string.Empty;

        partial void OnApiKeyChanged(string value)
        {
            KeychainHelper.Save("DeepSeekAPIKey", value);
        }

        [ObservableProperty]
        private int refreshInterval = 60;

        [ObservableProperty]
        private string balance = "--";

        [ObservableProperty]
        private string currency = "USD";

        [ObservableProperty]
        private string spentToday = "0.0000";

        [ObservableProperty]
        private bool isAvailable = true;

        [ObservableProperty]
        private string selectedModel = APIConstants.DeepSeek.DefaultModel;

        [ObservableProperty]
        private int latencyMs = 0;

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

        public DeepSeekViewModel()
        {
            this.ApiKey = KeychainHelper.Load("DeepSeekAPIKey") ?? string.Empty;
            _ = FetchDataAsync();
        }

        [RelayCommand]
        public async Task FetchDataAsync()
        {
            if (string.IsNullOrWhiteSpace(ApiKey))
            {
                IsAvailable = false;
                return;
            }

            IsLoading = true;
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, APIConstants.DeepSeek.BalanceURL);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

                var response = await _httpClient.SendAsync(request);
                stopwatch.Stop();
                LatencyMs = (int)stopwatch.ElapsedMilliseconds;

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var balanceResponse = JsonSerializer.Deserialize<BalanceResponse>(json);

                    if (balanceResponse != null)
                    {
                        IsAvailable = balanceResponse.IsAvailable;
                        if (balanceResponse.BalanceInfos?.Count > 0)
                        {
                            var info = balanceResponse.BalanceInfos[0];
                            Balance = info.TotalBalance ?? "--";
                            Currency = info.Currency ?? "USD";
                            
                            // To do: Add daily spend logic and low balance notifications
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
            finally
            {
                IsLoading = false;
            }
        }

        [RelayCommand]
        public async Task SendPromptAsync()
        {
            if (string.IsNullOrWhiteSpace(PromptText) || string.IsNullOrWhiteSpace(ApiKey)) return;

            IsGenerating = true;
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, APIConstants.DeepSeek.ChatCompletionsURL);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

                var body = new
                {
                    model = SelectedModel,
                    messages = new[] { new { role = "user", content = PromptText } },
                    max_tokens = 1000
                };

                request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                stopwatch.Stop();
                LatencyMs = (int)stopwatch.ElapsedMilliseconds;

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var chatResponse = JsonSerializer.Deserialize<ChatResponse>(json);
                    
                    if (chatResponse?.Choices?.Count > 0)
                    {
                        AiResponse = chatResponse.Choices[0].Message?.Content ?? "";
                        PromptText = string.Empty;
                        _ = FetchDataAsync();
                    }
                }
                else
                {
                    AiResponse = "Error getting response from DeepSeek API.";
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
    }
}

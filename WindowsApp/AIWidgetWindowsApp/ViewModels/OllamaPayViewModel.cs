using System;
using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Headers;
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
    public partial class OllamaPayViewModel : ObservableObject
    {
        private readonly HttpClient _httpClient = new HttpClient();

        [ObservableProperty]
        private string apiKey = string.Empty;

        partial void OnApiKeyChanged(string value)
        {
            KeychainHelper.Save("OllamaPayAPIKey", value);
        }

        private System.Windows.Threading.DispatcherTimer? _refreshTimer;

        [ObservableProperty]
        private int refreshInterval = 60;

        partial void OnRefreshIntervalChanged(int value)
        {
            KeychainHelper.Save("OllamaPayRefreshInterval", value.ToString());
            StartAutoRefresh();
        }

        [ObservableProperty]
        private bool isAvailable = true;

        [ObservableProperty]
        private bool isLoading = false;

        [ObservableProperty]
        private int todayTokens = 0;

        [ObservableProperty]
        private int totalTokensUsed = 0;

        [ObservableProperty]
        private int tokensLimit = 0;

        [ObservableProperty]
        private string errorMsg = string.Empty;

        [ObservableProperty]
        private int monthTokens = 0;

        [ObservableProperty]
        private int monthRequests = 0;

        [ObservableProperty]
        private int todayRequests = 0;

        [ObservableProperty]
        private int tokensRemaining = 0;

        [ObservableProperty]
        private int todayPloyJoyTokens = 0;

        [ObservableProperty]
        private int latencyMs = 0;

        public OllamaPayViewModel()
        {
            this.ApiKey = KeychainHelper.Load("OllamaPayAPIKey") ?? string.Empty;
            
            if (int.TryParse(KeychainHelper.Load("OllamaPayRefreshInterval"), out int savedInterval) && savedInterval > 0)
            {
                this.RefreshInterval = savedInterval;
            }
            
            _ = FetchDataAsync();
            StartAutoRefresh();
        }

        public void StartAutoRefresh()
        {
            _refreshTimer?.Stop();
            if (RefreshInterval > 0)
            {
                _refreshTimer = new System.Windows.Threading.DispatcherTimer();
                _refreshTimer.Interval = TimeSpan.FromSeconds(RefreshInterval);
                _refreshTimer.Tick += (s, e) => _ = FetchDataAsync();
                _refreshTimer.Start();
            }
        }

        [RelayCommand]
        public async Task FetchDataAsync()
        {
            var cleanKey = ApiKey?.Trim();
            if (string.IsNullOrWhiteSpace(cleanKey))
            {
                IsAvailable = false;
                ErrorMsg = "API Key not set";
                UpdateMainWindow("No Key");
                return;
            }

            IsLoading = true;
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, APIConstants.OllamaPay.UsageTotalURL);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cleanKey);

                var response = await _httpClient.SendAsync(request);
                stopwatch.Stop();
                LatencyMs = (int)stopwatch.ElapsedMilliseconds;

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var res = JsonSerializer.Deserialize<OllamaPayUsageResponse>(json);

                    if (res != null)
                    {
                        IsAvailable = true;
                        ErrorMsg = string.Empty;
                        TodayTokens = res.Accounting?.TodayTokens ?? 0;
                        TotalTokensUsed = res.TokensUsed ?? 0;
                        TokensLimit = res.TokensLimit ?? 0;
                        MonthTokens = res.Accounting?.MonthTokens ?? 0;
                        MonthRequests = res.Accounting?.MonthRequests ?? 0;
                        TodayRequests = res.Accounting?.TodayRequests ?? 0;
                        TokensRemaining = res.TokensRemaining ?? 0;
                        TodayPloyJoyTokens = res.Accounting?.TodayPloyJoyTokens ?? 0;

                        UpdateMainWindow(TodayTokens.ToString("N0") + " tokens");
                    }
                }
                else
                {
                    IsAvailable = false;
                    ErrorMsg = $"Error {(int)response.StatusCode}";
                    UpdateMainWindow("Err");

                    if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                    {
                        NotificationService.SendNotification("ollama_pay_rate_limit", "⚠️ Ollama Pay Rate Limited", "Rate limit reached for Ollama Pay API.");
                    }
                }
            }
            catch (Exception ex)
            {
                IsAvailable = false;
                ErrorMsg = ex.Message;
                UpdateMainWindow("Err");
            }
            finally
            {
                IsLoading = false;
            }
        }

        private void UpdateMainWindow(string value)
        {
            if (Application.Current.MainWindow is MainWindow mainWindow)
            {
                mainWindow.UpdateTrayTextIfSelected(3, value);
            }
        }
    }
}

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

        private System.Windows.Threading.DispatcherTimer? _refreshTimer;

        [ObservableProperty]
        private int refreshInterval = 60;

        partial void OnRefreshIntervalChanged(int value)
        {
            KeychainHelper.Save("DeepSeekRefreshInterval", value.ToString());
            StartAutoRefresh();
        }

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
            
            if (int.TryParse(KeychainHelper.Load("DeepSeekRefreshInterval"), out int savedInterval) && savedInterval > 0)
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

        private void UpdateDailySpend(string currentBalance)
        {
            string todayStr = DateTime.Now.ToString("yyyy-MM-dd");
            string savedDate = KeychainHelper.Load("DailySpendDate") ?? "";
            string startBalStr = KeychainHelper.Load("DailySpendStartBal") ?? currentBalance;

            if (double.TryParse(currentBalance, out double current))
            {
                if (savedDate == todayStr)
                {
                    if (double.TryParse(startBalStr, out double start))
                    {
                        if (current > start)
                        {
                            KeychainHelper.Save("DailySpendStartBal", currentBalance);
                            SpentToday = "0.0000";
                        }
                        else
                        {
                            double diff = Math.Max(0, start - current);
                            SpentToday = diff.ToString("F4");
                        }
                    }
                }
                else
                {
                    KeychainHelper.Save("DailySpendDate", todayStr);
                    KeychainHelper.Save("DailySpendStartBal", currentBalance);
                    SpentToday = "0.0000";
                }
            }
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
                            
                            UpdateDailySpend(Balance);
                            UpdateMainWindow($"${Balance} {Currency}");

                            if (double.TryParse(Balance, out double doubleBalance) && doubleBalance < APIConstants.DeepSeek.LowBalanceThreshold)
                            {
                                NotificationService.SendNotification("low_deepseek_balance", "⚠️ DeepSeek Balance Low", $"Your remaining DeepSeek balance is ${Balance} {Currency}. Please top up soon.");
                            }
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
        public async Task SendPromptAsync(string? systemPrompt = null)
        {
            if (string.IsNullOrWhiteSpace(PromptText) || string.IsNullOrWhiteSpace(ApiKey)) return;

            IsGenerating = true;
            var stopwatch = Stopwatch.StartNew();

            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, APIConstants.DeepSeek.ChatCompletionsURL);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

                var messages = new System.Collections.Generic.List<object>();
                if (!string.IsNullOrWhiteSpace(systemPrompt))
                {
                    messages.Add(new { role = "system", content = systemPrompt });
                }
                messages.Add(new { role = "user", content = PromptText });

                var body = new
                {
                    model = SelectedModel,
                    messages = messages,
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

        private void UpdateMainWindow(string value)
        {
            if (Application.Current.MainWindow is MainWindow mainWindow)
            {
                mainWindow.UpdateTrayTextIfSelected(1, value);
            }
        }
    }
}

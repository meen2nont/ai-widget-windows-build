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
        private double sessionUsagePercent = 0.0;

        [ObservableProperty]
        private double weeklyUsagePercent = 0.0;

        [ObservableProperty]
        private string cloudCost = "$0.00";



        [ObservableProperty]
        private bool isAvailable = false;
        
        [ObservableProperty]
        private bool isLoading = false;



        public double SessionRemainingPercent => Math.Max(0, 100.0 - SessionUsagePercent);
        public double WeeklyRemainingPercent => Math.Max(0, 100.0 - WeeklyUsagePercent);

        public OllamaViewModel()
        {
            this.OllamaApiKey = KeychainHelper.Load("OllamaApiKey") ?? string.Empty;
            _ = FetchDataAsync();
        }

        [RelayCommand]
        public async Task FetchDataAsync()
        {
            IsLoading = true;
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
                    IsAvailable = true;
                    var json = await response.Content.ReadAsStringAsync();
                    var res = JsonSerializer.Deserialize<OllamaUsageResponse>(json);

                    if (res != null)
                    {
                        if (res.Limits?.Session?.Usage.HasValue == true)
                        {
                            SessionUsagePercent = res.Limits.Session.Usage.Value * 100.0;
                            OnPropertyChanged(nameof(SessionRemainingPercent));
                        }
                        if (res.Limits?.Weekly?.Usage.HasValue == true)
                        {
                            WeeklyUsagePercent = res.Limits.Weekly.Usage.Value * 100.0;
                            OnPropertyChanged(nameof(WeeklyRemainingPercent));
                        }
                        if (res.Activity?.Cost != null)
                        {
                            CloudCost = res.Activity.Cost;
                        }
                        
                        UpdateMainWindow($"{SessionUsagePercent:F1}% Session");
                    }
                }
            }
            catch (Exception)
            {
                IsAvailable = false;
            }
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

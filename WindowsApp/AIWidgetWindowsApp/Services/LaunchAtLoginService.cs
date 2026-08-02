using System;
using System.Diagnostics;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Win32;

namespace AIWidgetWindowsApp.Services
{
    public partial class LaunchAtLoginService : ObservableObject
    {
        private static readonly LaunchAtLoginService _shared = new LaunchAtLoginService();
        public static LaunchAtLoginService Shared => _shared;

        private const string RegistryKeyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
        private const string AppName = "AIWidgetApp";

        [ObservableProperty]
        private bool isEnabled;

        partial void OnIsEnabledChanged(bool value)
        {
            SetLaunchAtLogin(value);
        }

        private LaunchAtLoginService()
        {
            this.isEnabled = CheckLaunchAtLogin();
        }

        private bool CheckLaunchAtLogin()
        {
            try
            {
                using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath, false);
                if (key != null)
                {
                    object? val = key.GetValue(AppName);
                    return val != null;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"LaunchAtLogin check error: {ex.Message}");
            }
            return false;
        }

        private void SetLaunchAtLogin(bool enabled)
        {
            try
            {
                using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath, true);
                if (key != null)
                {
                    if (enabled)
                    {
                        // Set the path to the current executable
                        string exePath = Process.GetCurrentProcess().MainModule?.FileName ?? string.Empty;
                        if (!string.IsNullOrEmpty(exePath))
                        {
                            key.SetValue(AppName, $"\"{exePath}\"");
                        }
                    }
                    else
                    {
                        key.DeleteValue(AppName, false);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"LaunchAtLogin set error: {ex.Message}");
            }
        }
    }
}

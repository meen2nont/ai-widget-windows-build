using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AIWidgetWindowsApp.Helpers
{
    public static class KeychainHelper
    {
        private static readonly string AppDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AIWidgetApp");
        private static readonly string ConfigFilePath = Path.Combine(AppDataFolder, "masterConfig.dat");
        
        private static Dictionary<string, string> memoryCache = new Dictionary<string, string>();
        private static bool isLoaded = false;

        private static void EnsureLoaded()
        {
            if (isLoaded) return;
            isLoaded = true;

            if (!Directory.Exists(AppDataFolder))
            {
                Directory.CreateDirectory(AppDataFolder);
            }

            if (File.Exists(ConfigFilePath))
            {
                try
                {
                    byte[] encryptedData = File.ReadAllBytes(ConfigFilePath);
                    byte[] rawData = ProtectedData.Unprotect(encryptedData, null, DataProtectionScope.CurrentUser);
                    string jsonString = Encoding.UTF8.GetString(rawData);
                    
                    var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(jsonString);
                    if (dict != null)
                    {
                        memoryCache = dict;
                    }
                }
                catch (Exception)
                {
                    // Handle or log decryption failure
                }
            }
        }

        private static void SaveMasterConfig()
        {
            try
            {
                string jsonString = JsonSerializer.Serialize(memoryCache);
                byte[] rawData = Encoding.UTF8.GetBytes(jsonString);
                byte[] encryptedData = ProtectedData.Protect(rawData, null, DataProtectionScope.CurrentUser);

                File.WriteAllBytes(ConfigFilePath, encryptedData);
            }
            catch (Exception)
            {
                // Handle or log encryption/saving failure
            }
        }

        public static void Save(string key, string data)
        {
            EnsureLoaded();
            string clean = data?.Trim() ?? string.Empty;
            
            if (string.IsNullOrEmpty(clean))
            {
                memoryCache.Remove(key);
            }
            else
            {
                memoryCache[key] = clean;
            }
            
            SaveMasterConfig();
        }

        public static string? Load(string key)
        {
            EnsureLoaded();
            return memoryCache.TryGetValue(key, out string? value) ? value : null;
        }

        public static void Delete(string key)
        {
            EnsureLoaded();
            if (memoryCache.ContainsKey(key))
            {
                memoryCache.Remove(key);
                SaveMasterConfig();
            }
        }
    }
}

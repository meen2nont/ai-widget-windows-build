using System;

namespace AIWidgetWindowsApp.Services
{
    public static class NotificationService
    {
        public static event Action<string, string, string>? OnNotificationRequested;

        public static void SendNotification(string identifier, string title, string body)
        {
            OnNotificationRequested?.Invoke(identifier, title, body);
        }
    }
}

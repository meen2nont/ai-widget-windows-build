[ 🇹🇭 ภาษาไทย ](README.md) | [ 🇬🇧 English ](README_en.md)

# AI Widget Dashboard

AI Widget Dashboard is a utility application for tracking and managing API balances, quotas, and usage status for AI services such as **DeepSeek** and **Ollama**. It is available for both macOS (Menu Bar App) and Windows (System Tray App).

## 🌟 Features
- **Unified Popover Dashboard**: View the status of all your AI services in a single, convenient window.
- **DeepSeek Integration**: Track your DeepSeek API account balance in real-time.
- **Ollama Cloud & Ollama Pay**: Monitor Ollama Cloud session/weekly usage quotas and Ollama Pay information directly via the Cloud API (designed exclusively for usage monitoring, no chat features).
- **Menu Bar / System Tray**: Sits quietly in your macOS Menu Bar or Windows System Tray for quick and unobtrusive access.
- **Customizable Display**: Choose which service icon to prioritize on your menu bar (e.g., DeepSeek icon with balance, Ollama icon with percentage).
- **Auto-Refresh**: Configurable data refresh intervals (e.g., every 5 minutes) and supports Launch at Login.

## 📁 Project Structure

The project is divided into two main platforms:

- **`/NativeApp`**: The macOS application built with Swift (using SwiftUI and AppKit).
- **`/WindowsApp`**: The Windows application built with C# and WPF (using Hardcodet.NotifyIcon.Wpf for System Tray support).

## 🚀 Installation & Usage

### 📌 Prerequisites
Before you begin, ensure you have the following:
- **Ollama Cloud API Key**: To fetch quota and usage data from Ollama Cloud, you must provide your API Key in the app settings (fetches data directly via the cloud; no local server required).
- **DeepSeek API Key**: To fetch your DeepSeek balance, you must configure your API Key in the app.
- **macOS**: Requires macOS 12.0 or later (for the Native app).
- **Windows**: Requires Windows 10/11 with the required .NET Framework/Core.

### 🍎 For macOS (2 Usage Options)

**Option 1: Native App (Recommended)**
This runs as a standalone Menu Bar app:
1. Open the project folder in **Xcode**.
2. Select the `AIWidgetApp` target.
3. Build and Run (`Cmd + R`).
4. An icon will appear on your Menu Bar at the top right of your screen.

**Option 2: SwiftBar / xbar (Python Script)**
The repository includes an `antigravity_status.10s.py` script for users who prefer **SwiftBar** or **xbar**:
1. Install [SwiftBar](https://github.com/swiftbar/SwiftBar) or [xbar](https://xbarapp.com/).
2. Place `antigravity_status.10s.py` into your SwiftBar/xbar plugin folder.
3. The script will run via SwiftBar to display the status on your Menu Bar, refreshing every 10 seconds.

### 🪟 For Windows (WindowsApp)
1. Open `AIWidgetWindowsApp.csproj` or the Solution file in **Visual Studio**.
2. Install any necessary NuGet Packages.
3. Start Debugging (`F5`).
4. The app will run and show its icon in the System Tray (bottom right of the Taskbar).

## ⚙️ Settings
You can configure the following within the app:
- **Refresh Interval**: Set the frequency for data updates (default is 300 seconds / 5 minutes).
- **Menu Bar Display Mode**: Select whether to show DeepSeek, Ollama, or Default information on the menu bar.
- **Notifications**: Toggle system notifications for low quotas.

---
*Note: This project is currently in Development.*

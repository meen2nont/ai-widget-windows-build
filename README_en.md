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

- **Web Dashboard (Docker)**: A premium-style web dashboard (Vite + React) running via Docker to view quotas from any browser. It includes a built-in AI Playground to chat with DeepSeek, a **Setup/Login Password** system for access protection, and securely stores data in a **SQLite database (`dashboard-config.db`)**.

## 📁 Project Structure

The project is divided into 3 main components:

- **`/NativeApp`**: macOS application developed with Swift (using SwiftUI and AppKit).
- **`/WindowsApp`**: Windows application developed with C# and WPF (using Hardcodet.NotifyIcon.Wpf for the System Tray).
- **`/WebDashboard`**: Web dashboard for viewing quotas and experimenting with AI, developed with React (Vite) + Express Proxy (Node.js) with SQLite DB, and containerized with Docker (Port 9000).

## 🚀 Installation & Usage

### 📌 Prerequisites
Before you begin, ensure you have the following ready:
- **Ollama Cloud API Key**: Required to fetch quota and usage status from Ollama Cloud. You need to enter this in the app's settings. (Data is fetched directly via the cloud; no local server required).
- **DeepSeek API Key**: Required to fetch your DeepSeek account balance. Set this in the app's settings.
- **macOS**: Requires macOS 12.0 or later (for the Native App).
- **Windows**: Requires Windows 10/11 with the required .NET Framework/Core.

### 🍎 For macOS (2 Options Available)

**Option 1: Using the Native App (Recommended)**
This runs as a standalone Menu Bar App:
1. Open the project folder in **Xcode**.
2. Select the `AIWidgetApp` target.
3. Click Build and Run (`Cmd + R`).
4. An icon will appear on your Menu Bar at the top right of the screen.

**Option 2: Using SwiftBar / xbar (Python Script)**
The repository includes `antigravity_status.10s.py`, an alternative script for **SwiftBar** or **xbar** users:
1. Install [SwiftBar](https://github.com/swiftbar/SwiftBar) or [xbar](https://xbarapp.com/).
2. Place `antigravity_status.10s.py` into your SwiftBar/xbar Plugin folder.
3. The script will run alongside SwiftBar to update your status on the Menu Bar every 10 seconds.

### 🪟 For Windows (WindowsApp)
1. Open the `AIWidgetWindowsApp.csproj` or Solution file in **Visual Studio**.
2. Restore any required NuGet Packages.
3. Click Start Debugging (`F5`).
4. The app will run and show an icon in the System Tray at the bottom right of the Taskbar.

### 🐳 For Web Dashboard (Docker)
1. Navigate to the `WebDashboard` folder:
   ```bash
   cd WebDashboard
   ```
2. Build and Run via Docker Compose (this automatically mounts volumes for persistent server-side storage):
   ```bash
   docker-compose up -d --build
   ```
3. Open your browser and go to `http://localhost:9000` (or your Server's IP address).
   - **First Time Setup**: The system will prompt you to **"Setup Password"** for dashboard access.
   - After logging in, navigate to **Settings** to enter your API Keys.
   - All data, including your password, API Keys, and AI memory, is securely saved in the **SQLite database (`data/dashboard-config.db`)** on the server.

## ⚙️ Settings
You can configure the following within the app:
- **Refresh Interval**: Set the frequency for data updates (default is 300 seconds / 5 minutes).
- **Menu Bar Display Mode**: Select whether to show DeepSeek, Ollama, or Default information on the menu bar.
- **Notifications**: Toggle system notifications for low quotas.

---
*Note: This project is currently in Development.*

using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using AIWidgetWindowsApp.ViewModels;
using AIWidgetWindowsApp.Views;

namespace AIWidgetWindowsApp
{
    public partial class MainWindow : Window, INotifyPropertyChanged
    {
        public DeepSeekViewModel DeepSeekVM { get; } = new DeepSeekViewModel();
        public OllamaViewModel OllamaVM { get; } = new OllamaViewModel();
        public OllamaPayViewModel OllamaPayVM { get; } = new OllamaPayViewModel();

        private OverviewControl _overviewControl;
        private DeepSeekControl _deepSeekControl;
        private OllamaControl _ollamaControl;
        private OllamaPayControl _ollamaPayControl;

        private int _selectedTab = 0;

        public event PropertyChangedEventHandler? PropertyChanged;

        public string SelectedTab0Bg => _selectedTab == 0 ? "#29007ACC" : "#0DFFFFFF";
        public string SelectedTab0Fg => _selectedTab == 0 ? "#00A2FF" : "White";
        public string SelectedTab1Bg => _selectedTab == 1 ? "#29007ACC" : "#0DFFFFFF";
        public string SelectedTab1Fg => _selectedTab == 1 ? "#00A2FF" : "White";
        public string SelectedTab2Bg => _selectedTab == 2 ? "#29007ACC" : "#0DFFFFFF";
        public string SelectedTab2Fg => _selectedTab == 2 ? "#00A2FF" : "White";
        public string SelectedTab3Bg => _selectedTab == 3 ? "#29007ACC" : "#0DFFFFFF";
        public string SelectedTab3Fg => _selectedTab == 3 ? "#00A2FF" : "White";

        public MainWindow()
        {
            InitializeComponent();
            this.DataContext = this;

            _overviewControl = new OverviewControl { DataContext = this };
            _deepSeekControl = new DeepSeekControl { DataContext = DeepSeekVM };
            _ollamaControl = new OllamaControl { DataContext = OllamaVM };
            _ollamaPayControl = new OllamaPayControl { DataContext = OllamaPayVM };

            // Default to overview
            ChangeTab(0); 
            
            this.Hide();
        }

        private void TabButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && int.TryParse(btn.Tag?.ToString(), out int tabIndex))
            {
                ChangeTab(tabIndex);
            }
        }

        private void ChangeTab(int tabIndex)
        {
            _selectedTab = tabIndex;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(null)); // Refresh all bindings

            switch (tabIndex)
            {
                case 0:
                    MainContentControl.Content = _overviewControl;
                    UpdateTrayText("AI Widget");
                    break;
                case 1:
                    MainContentControl.Content = _deepSeekControl;
                    UpdateTrayText($"${DeepSeekVM.Balance} {DeepSeekVM.Currency}");
                    break;
                case 2:
                    MainContentControl.Content = _ollamaControl;
                    UpdateTrayText($"{OllamaVM.SessionUsagePercent}% Session");
                    break;
                case 3:
                    MainContentControl.Content = _ollamaPayControl;
                    UpdateTrayText($"{OllamaPayVM.TodayTokens:N0} tokens");
                    break;
            }
        }

        public void UpdateTrayTextIfSelected(int sourceTab, string text)
        {
            if (_selectedTab == sourceTab)
            {
                UpdateTrayText(text);
            }
        }

        private void UpdateTrayText(string text)
        {
            if (MyNotifyIcon != null)
            {
                MyNotifyIcon.ToolTipText = text;
            }
        }

        private void MenuItemShow_Click(object sender, RoutedEventArgs e)
        {
            this.Show();
            this.Activate();
        }

        private void MenuItemExit_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
        {
            base.OnMouseLeftButtonDown(e);
            this.DragMove();
        }

        protected override void OnDeactivated(EventArgs e)
        {
            base.OnDeactivated(e);
            this.Hide();
        }
    }
}

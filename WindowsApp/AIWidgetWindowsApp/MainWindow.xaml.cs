using System;
using System.Windows;
using System.Windows.Input;

namespace AIWidgetWindowsApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            
            // Hide from Alt+Tab
            this.Hide();
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

        // Allow dragging the window if clicked outside of interactive elements
        protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
        {
            base.OnMouseLeftButtonDown(e);
            this.DragMove();
        }
        
        // Hide window instead of closing when user clicks X (if we had one) or loses focus
        protected override void OnDeactivated(EventArgs e)
        {
            base.OnDeactivated(e);
            this.Hide();
        }
    }
}

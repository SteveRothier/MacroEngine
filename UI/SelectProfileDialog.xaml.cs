using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Shell;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;

namespace MacroEngine.UI
{
    public partial class SelectProfileDialog : Window
    {
        public MacroProfile? SelectedProfile { get; private set; }

        public SelectProfileDialog(IEnumerable<MacroProfile> profiles)
        {
            InitializeComponent();
            var list = (profiles?.ToList() ?? new List<MacroProfile>())
                .OrderByDescending(p => p.IsActive)
                .ToList();
            ProfilesListBox.ItemsSource = list;

            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                else
                    DragMove();
            }
        }

        private void MinimizeButton_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

        private void MaximizeButton_Click(object sender, RoutedEventArgs e)
            => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            SelectedProfile = null;
            Close();
        }

        private void UseButton_Click(object sender, RoutedEventArgs e)
        {
            if (ProfilesListBox.SelectedItem is MacroProfile profile)
            {
                SelectedProfile = profile;
                DialogResult = true;
                Close();
            }
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            SelectedProfile = null;
            DialogResult = false;
            Close();
        }
    }
}

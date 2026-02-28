using System.Windows;
using System.Windows.Input;
using System.Windows.Shell;

namespace MacroEngine.UI
{
    /// <summary>Dialogue d'alerte stylé comme les autres dialogs de l'app (thème sombre).</summary>
    public partial class AlertDialog : Window
    {
        public AlertDialog(string title, string message, Window? owner = null)
        {
            InitializeComponent();
            TitleText.Text = title;
            MessageText.Text = message;
            if (owner != null)
                Owner = owner;

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

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }
    }
}

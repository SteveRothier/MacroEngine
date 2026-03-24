using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    public partial class TextOnScreenPopoverWindow : Window
    {
        private readonly TextOnScreenCondition _target;
        private readonly TextOnScreenCondition _temp;
        private readonly double _contentScreenX;
        private readonly double _contentScreenY;
        private bool _isClosing;
        private DateTime _loadedAt;
        private bool _isPlaceholderActive;
        private const string PlaceholderText = "Entrer le texte à détecter...";

        public TextOnScreenPopoverWindow(TextOnScreenCondition config, double contentScreenX = double.NaN, double contentScreenY = double.NaN)
        {
            _target = config ?? new TextOnScreenCondition();
            _temp = new TextOnScreenCondition
            {
                Text = _target.Text ?? "",
                SearchArea = _target.SearchArea?.Length == 4 ? (int[])_target.SearchArea.Clone() : null
            };

            _contentScreenX = contentScreenX;
            _contentScreenY = contentScreenY;

            InitializeComponent();

            var textSecondary = TryFindResource("TextSecondaryBrush") as Brush ?? Brushes.White;
            var textMuted = TryFindResource("TextMutedBrush") as Brush ?? new SolidColorBrush(Color.FromRgb(160, 160, 160));
            var errorBrush = TryFindResource("ErrorBrush") as Brush ?? Brushes.Red;

            // Icône zone hover
            if (ZonePickIcon != null)
            {
                ZonePickIcon.Foreground = textSecondary;
                ZonePickButton.MouseEnter += (s, e) => ZonePickIcon.Foreground = errorBrush;
                ZonePickButton.MouseLeave += (s, e) => ZonePickIcon.Foreground = textSecondary;
            }

            // Placeholder (WPF TextBox n'a pas de placeholder natif)
            var initialText = (_temp.Text ?? "").Trim();
            if (string.IsNullOrEmpty(initialText))
            {
                _isPlaceholderActive = true;
                TextInputBox.Text = PlaceholderText;
                TextInputBox.Foreground = textMuted;
            }
            else
            {
                _isPlaceholderActive = false;
                TextInputBox.Text = initialText;
                TextInputBox.Foreground = textSecondary;
            }

            // Mise à jour temp au fur et à mesure (hors placeholder)
            TextInputBox.TextChanged += (_, __) =>
            {
                if (_isPlaceholderActive) return;
                _temp.Text = TextInputBox.Text ?? "";
            };

            UpdateZoneUi();

            var vsl = SystemParameters.VirtualScreenLeft;
            var vst = SystemParameters.VirtualScreenTop;
            Left = vsl;
            Top = vst;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;

            Loaded += (_, _) =>
            {
                _loadedAt = DateTime.UtcNow;
                double w = RootBorder.ActualWidth > 0 ? RootBorder.ActualWidth : 260;
                double h = RootBorder.ActualHeight > 0 ? RootBorder.ActualHeight : 340;
                double left = double.IsNaN(_contentScreenX) ? (SystemParameters.VirtualScreenWidth - w) / 2 + vsl : _contentScreenX - vsl;
                double top = double.IsNaN(_contentScreenY) ? (SystemParameters.VirtualScreenHeight - h) / 2 + vst : _contentScreenY - vst;

                Canvas.SetLeft(ContentContainer, left);
                Canvas.SetTop(ContentContainer, top);
            };

            PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    CloseAsCancel();
                }
            };
        }

        private void CloseAsCancel()
        {
            if (_isClosing) return;
            _isClosing = true;
            DialogResult = false;
            Close();
        }

        private void ApplyTempToTargetAndClose()
        {
            if (_isClosing) return;
            _isClosing = true;

            _target.Text = _isPlaceholderActive ? "" : (_temp.Text ?? "");
            _target.SearchArea = _temp.SearchArea?.Length == 4 ? (int[])_temp.SearchArea.Clone() : null;

            DialogResult = true;
            Close();
        }

        private void OverlayGrid_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (_isClosing) return;
            if ((DateTime.UtcNow - _loadedAt).TotalMilliseconds < 250) return;

            var src = e.OriginalSource as DependencyObject;
            while (src != null)
            {
                if (src == RootBorder) return; // click dans le contenu => rien
                src = VisualTreeHelper.GetParent(src);
            }

            // Pas de bouton OK/Annuler : fermer = appliquer
            ApplyTempToTargetAndClose();
        }

        private void TextInputBox_GotKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            try
            {
                // Quand on focus le champ, on retire le placeholder
                if (_isPlaceholderActive)
                {
                    _isPlaceholderActive = false;
                    TextInputBox.Text = "";
                    var textSecondary = TryFindResource("TextSecondaryBrush") as Brush ?? Brushes.White;
                    TextInputBox.Foreground = textSecondary;
                }

                TextInputBox.SelectAll();
                TextInputBox.CaretIndex = TextInputBox.Text?.Length ?? 0;
            }
            catch { }
        }

        private void TextInputBox_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            try
            {
                if (TextInputBox == null) return;
                if (string.IsNullOrWhiteSpace(TextInputBox.Text))
                {
                    _isPlaceholderActive = true;
                    TextInputBox.Text = PlaceholderText;
                    var textMuted = TryFindResource("TextMutedBrush") as Brush ?? new SolidColorBrush(Color.FromRgb(160, 160, 160));
                    TextInputBox.Foreground = textMuted;
                }
            }
            catch { }
        }

        private void UpdateZoneUi()
        {
            // Même logique que ImageOnScreenPopoverWindow:
            // - sans zone: afficher "Tout l'écran" (non cliquable)
            // - avec zone: afficher coordonnées et autoriser la visualisation
            if (_temp.SearchArea == null || _temp.SearchArea.Length != 4)
            {
                ZoneInfoText.Text = "Tout l'écran";
                ZoneInfoText.IsHitTestVisible = false;
                ZoneInfoText.Cursor = Cursors.Arrow;
                ZoneInfoText.MouseLeftButtonDown -= ZoneInfoText_MouseLeftButtonDown;
                return;
            }

            var a = _temp.SearchArea;
            ZoneInfoText.Text = $"{a[0]}, {a[2]} -> {a[1]}, {a[3]}";

            ZoneInfoText.IsHitTestVisible = true;
            ZoneInfoText.Cursor = Cursors.Hand;
            ZoneInfoText.MouseLeftButtonDown -= ZoneInfoText_MouseLeftButtonDown;
            ZoneInfoText.MouseLeftButtonDown += ZoneInfoText_MouseLeftButtonDown;
        }

        private void ZonePickButton_Click(object sender, RoutedEventArgs e)
        {
            OpenZoneSelector();
        }

        private void ZonePickButton_MouseEnter(object sender, MouseEventArgs e)
        {
            try
            {
                if (ZonePickIcon != null)
                    ZonePickIcon.Foreground = TryFindResource("ErrorBrush") as Brush ?? Brushes.Red;
            }
            catch { }
        }

        private void ZonePickButton_MouseLeave(object sender, MouseEventArgs e)
        {
            try
            {
                if (ZonePickIcon != null)
                    ZonePickIcon.Foreground = TryFindResource("TextSecondaryBrush") as Brush ?? Brushes.White;
            }
            catch { }
        }

        private void ZoneInfoText_MouseEnter(object sender, MouseEventArgs e)
        {
            try
            {
                ZoneInfoText.Foreground = TryFindResource("ErrorBrush") as Brush ?? Brushes.Red;
                ZoneInfoText.TextDecorations = TextDecorations.Underline;
            }
            catch { }
        }

        private void ZoneInfoText_MouseLeave(object sender, MouseEventArgs e)
        {
            try
            {
                ZoneInfoText.Foreground = TryFindResource("TextPrimaryBrush") as Brush ?? Brushes.White;
                ZoneInfoText.TextDecorations = null;
            }
            catch { }
        }

        private void ZoneInfoText_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;

            try
            {
                if (_temp.SearchArea == null || _temp.SearchArea.Length != 4)
                {
                    OpenZoneSelector();
                    return;
                }

                var area = _temp.SearchArea;
                var preview = new ZonePreviewWindow(area[0], area[1], area[2], area[3])
                {
                    Owner = Owner ?? this
                };
                preview.ShowDialog();
            }
            catch { }
        }

        private void OpenZoneSelector()
        {
            try
            {
                var owner = Owner ?? this;
                var zoneSelector = new ZoneSelectorWindow { Owner = owner };
                if (zoneSelector.ShowDialog() == true)
                {
                    _temp.SearchArea = new int[]
                    {
                        zoneSelector.X1,
                        zoneSelector.Y1,
                        zoneSelector.X2,
                        zoneSelector.Y2
                    };
                    UpdateZoneUi();
                }
            }
            catch { }
        }
    }
}


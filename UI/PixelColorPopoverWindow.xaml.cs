using System;
using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Controls;
using System.Windows.Media;
using MacroEngine;
using MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    public partial class PixelColorPopoverWindow : Window
    {
        private readonly PixelColorCondition _config;
        private readonly SolidColorBrush _swatchBrush;
        private readonly Action? _onColorChanged;
        private bool _isClosing;
        private DateTime _loadedAt;
        private readonly double _contentScreenX = double.NaN;
        private readonly double _contentScreenY = double.NaN;

        public PixelColorPopoverWindow(PixelColorCondition config, double contentScreenX = double.NaN, double contentScreenY = double.NaN, Action? onColorChanged = null)
        {
            _config = config ?? new PixelColorCondition();
            _onColorChanged = onColorChanged;
            _contentScreenX = contentScreenX;
            _contentScreenY = contentScreenY;
            _swatchBrush = new SolidColorBrush(ParseHexColor(_config.ExpectedColor));
            InitializeComponent();
            SwatchBorder.Background = _swatchBrush;
            var pipetteIcon = LucideIcons.CreateIcon(LucideIcons.Pipette, 14);
            pipetteIcon.Foreground = Brushes.White;
            pipetteIcon.HorizontalAlignment = HorizontalAlignment.Center;
            pipetteIcon.VerticalAlignment = VerticalAlignment.Center;
            PipetteIconBtn.Child = pipetteIcon;
            PipetteIconBtn.MouseEnter += (s, _) => pipetteIcon.Foreground = Brushes.White;
            PipetteIconBtn.MouseLeave += (s, _) => pipetteIcon.Foreground = Brushes.White;
            LoadFromConfig();
            var vsl = SystemParameters.VirtualScreenLeft;
            var vst = SystemParameters.VirtualScreenTop;
            Left = vsl;
            Top = vst;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;
            if (!double.IsNaN(_contentScreenX) && !double.IsNaN(_contentScreenY))
            {
                Canvas.SetLeft(ContentContainer, _contentScreenX - vsl);
                Canvas.SetTop(ContentContainer, _contentScreenY - vst);
            }
            Loaded += (s, _) =>
            {
                _loadedAt = DateTime.UtcNow;
                if (double.IsNaN(_contentScreenX) || double.IsNaN(_contentScreenY))
                {
                    double w = RootBorder.ActualWidth > 0 ? RootBorder.ActualWidth : 260;
                    double h = RootBorder.ActualHeight > 0 ? RootBorder.ActualHeight : 400;
                    Canvas.SetLeft(ContentContainer, (SystemParameters.VirtualScreenWidth - w) / 2);
                    Canvas.SetTop(ContentContainer, (SystemParameters.VirtualScreenHeight - h) / 2);
                }
            };
            PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    CloseWindow();
                    e.Handled = true;
                }
            };
        }

        private static System.Windows.Media.Color ParseHexColor(string hex)
        {
            hex = (hex ?? "").TrimStart('#');
            if (hex.Length != 6) return System.Windows.Media.Color.FromRgb(0xE8, 0x40, 0x40);
            int r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
            int g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
            int b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
            return System.Windows.Media.Color.FromRgb((byte)r, (byte)g, (byte)b);
        }

        public void LoadFromConfig()
        {
            XInput.Text = _config.X.ToString();
            YInput.Text = _config.Y.ToString();
            _swatchBrush.Color = ParseHexColor(_config.ExpectedColor);
            HexInput.Text = _config.ExpectedColor;
            ToleranceInput.Text = _config.Tolerance.ToString();
            ModeCombo.SelectedIndex = _config.MatchMode == ColorMatchMode.RGB ? 0 : 1;
        }

        private void ApplyToConfig()
        {
            if (int.TryParse(XInput.Text, out var x) && x >= 0) _config.X = x;
            if (int.TryParse(YInput.Text, out var y) && y >= 0) _config.Y = y;
            var hex = (HexInput.Text ?? "").Trim();
            if (hex.Length >= 6)
            {
                if (!hex.StartsWith("#")) hex = "#" + hex;
                _config.ExpectedColor = hex;
                _swatchBrush.Color = ParseHexColor(hex);
                _onColorChanged?.Invoke();
            }
            if (int.TryParse(ToleranceInput.Text, out var tol))
                _config.Tolerance = Math.Max(0, Math.Min(100, tol));
            _config.MatchMode = ModeCombo.SelectedIndex == 1 ? ColorMatchMode.HSV : ColorMatchMode.RGB;
        }

        private void CloseWindow()
        {
            if (_isClosing) return;
            _isClosing = true;
            ApplyToConfig();
            DialogResult = true;
            Close();
        }

        private void ConfirmAndClose()
        {
            if (_isClosing) return;
            _isClosing = true;
            ApplyToConfig();
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
                if (src == RootBorder) return;
                src = VisualTreeHelper.GetParent(src);
            }
            CloseWindow();
        }

        private void CloseBtn_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            CloseWindow();
        }

        private void CancelBtn_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            CloseWindow();
        }

        private void OkBtn_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            ConfirmAndClose();
        }

        private void SwatchBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            try
            {
                var colorPop = new ColorPopoverWindow(HexInput.Text, double.NaN, double.NaN, (hex) =>
                {
                    var h = (hex ?? "").Trim();
                    if (!h.StartsWith("#")) h = "#" + h;
                    _config.ExpectedColor = h;
                    HexInput.Text = h;
                    _swatchBrush.Color = ParseHexColor(h);
                    _onColorChanged?.Invoke();
                });
                colorPop.Owner = this;
                colorPop.WindowStartupLocation = WindowStartupLocation.CenterOwner;
                if (colorPop.ShowDialog() == true && !string.IsNullOrEmpty(colorPop.SelectedColorHex))
                {
                    var hex = colorPop.SelectedColorHex.Trim();
                    if (!hex.StartsWith("#")) hex = "#" + hex;
                    _config.ExpectedColor = hex;
                    HexInput.Text = hex;
                    _swatchBrush.Color = ParseHexColor(hex);
                    _onColorChanged?.Invoke();
                }
            }
            catch { }
        }

        private void HexInput_LostFocus(object sender, RoutedEventArgs e)
        {
            var hex = (HexInput.Text ?? "").Trim();
            if (hex.Length >= 6)
            {
                if (!hex.StartsWith("#")) hex = "#" + hex;
                _config.ExpectedColor = hex;
                _swatchBrush.Color = ParseHexColor(hex);
                _onColorChanged?.Invoke();
            }
        }

        private void PipetteIconBtn_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            try
            {
                var colorPicker = new ColorPickerWindow { Owner = this };
                if (colorPicker.ShowDialog() == true && !string.IsNullOrEmpty(colorPicker.ColorHex))
                {
                    var hex = colorPicker.ColorHex.Trim();
                    if (!hex.StartsWith("#")) hex = "#" + hex;
                    _config.ExpectedColor = hex;
                    _swatchBrush.Color = ParseHexColor(hex);
                    HexInput.Text = hex;
                    _onColorChanged?.Invoke();
                }
            }
            catch { }
        }
    }
}

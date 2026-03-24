using System;
using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using MacroEngine;

namespace MacroEngine.UI
{
    public partial class ColorPopoverWindow : Window
    {
        private const int SvWidth = 220;
        private const int SvHeight = 120;
        private const int HueHeight = 12;

        private WriteableBitmap? _svBitmap;
        private WriteableBitmap? _hueBitmap;
        private bool _hueDragging;
        private bool _svDragging;
        private bool _updatingFromRgb;
        private bool _isClosing;
        private bool _pipetteOpen;
        private DateTime _loadedAt;

        private double _hue;   // 0..360
        private double _saturation; // 0..1
        private double _value;      // 0..1

        private enum ColorInputMode { Rgb, Hsl, Hex }
        private ColorInputMode _inputMode = ColorInputMode.Hex;
        private bool _updatingFromHsl;

        public string SelectedColorHex { get; private set; } = "#000000";
        /// <summary>Tolérance de couleur en % (0–100), utilisée pour la comparaison de couleurs.</summary>
        public int ColorTolerancePercent { get; set; } = 10;
        private double _contentScreenX = double.NaN;
        private double _contentScreenY = double.NaN;
        private readonly Action<string>? _onColorChanged;

        public ColorPopoverWindow(string initialHex = "#e84040", double contentScreenX = double.NaN, double contentScreenY = double.NaN, Action<string>? onColorChanged = null)
        {
            _contentScreenX = contentScreenX;
            _contentScreenY = contentScreenY;
            _onColorChanged = onColorChanged;
            InitializeComponent();
            var pipetteIcon = LucideIcons.CreateIcon(LucideIcons.Pipette, 14);
            pipetteIcon.Foreground = Brushes.White;
            pipetteIcon.HorizontalAlignment = HorizontalAlignment.Center;
            pipetteIcon.VerticalAlignment = VerticalAlignment.Center;
            PipetteIconBtn.Child = pipetteIcon;
            PipetteIconBtn.MouseEnter += (s, _) => pipetteIcon.Foreground = Brushes.White;
            PipetteIconBtn.MouseLeave += (s, _) => pipetteIcon.Foreground = Brushes.White;
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
            SelectedColorHex = NormalizeHex(initialHex);
            RgbFromHex(SelectedColorHex, out int r, out int g, out int b);
            HsvFromRgb(r, g, b, out _hue, out _saturation, out _value);
            UpdateFromHsv();
            Loaded += (s, _) =>
            {
                _loadedAt = DateTime.UtcNow;
                if (double.IsNaN(_contentScreenX) || double.IsNaN(_contentScreenY))
                {
                    double w = RootBorder.ActualWidth > 0 ? RootBorder.ActualWidth : 240;
                    double h = RootBorder.ActualHeight > 0 ? RootBorder.ActualHeight : 400;
                    Canvas.SetLeft(ContentContainer, (SystemParameters.VirtualScreenWidth - w) / 2);
                    Canvas.SetTop(ContentContainer, (SystemParameters.VirtualScreenHeight - h) / 2);
                }
                if (CpTolerance != null) CpTolerance.Text = Math.Clamp(ColorTolerancePercent, 0, 100).ToString();
                Dispatcher.BeginInvoke(new Action(ApplyInputTextBrush), DispatcherPriority.Loaded);
                Dispatcher.BeginInvoke(new Action(DisableInputScroll), DispatcherPriority.ApplicationIdle);
                BuildSvBitmap();
                BuildHueBitmap();
                UpdateFromHsv();
                ApplyModeVisibility();
                UpdateModeButtonsAppearance();
            };
            foreach (var tb in new TextBox[] { CpR, CpG, CpB, CpH, CpS, CpL, CpTolerance })
                if (tb != null) tb.PreviewTextInput += NumericOnly_PreviewTextInput;
            PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    CloseWindow();
                    e.Handled = true;
                }
            };
        }

        private static readonly SolidColorBrush InputTextBrush = new SolidColorBrush(Color.FromRgb(0xE0, 0xE0, 0xE0));

        private static string OnlyDigits(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            var sb = new System.Text.StringBuilder();
            foreach (char c in s) if (char.IsDigit(c)) sb.Append(c);
            return sb.ToString();
        }

        private void NumericOnly_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            foreach (char c in e.Text) if (!char.IsDigit(c)) { e.Handled = true; return; }
        }

        private void ApplyInputTextBrush()
        {
            foreach (var tb in new TextBox[] { CpHex, CpR, CpG, CpB, CpH, CpS, CpL, CpTolerance })
            {
                if (tb == null) continue;
                tb.Foreground = InputTextBrush;
                tb.CaretBrush = InputTextBrush;
            }
        }

        private void SyncInputDisplays()
        {
            if (CpHexDisplay != null && CpHex != null) CpHexDisplay.Text = CpHex.Text ?? "";
            if (CpRDisplay != null && CpR != null) CpRDisplay.Text = CpR.Text ?? "";
            if (CpGDisplay != null && CpG != null) CpGDisplay.Text = CpG.Text ?? "";
            if (CpBDisplay != null && CpB != null) CpBDisplay.Text = CpB.Text ?? "";
            if (CpHDisplay != null && CpH != null) CpHDisplay.Text = CpH.Text ?? "";
            if (CpSDisplay != null && CpS != null) CpSDisplay.Text = CpS.Text ?? "";
            if (CpLDisplay != null && CpL != null) CpLDisplay.Text = CpL.Text ?? "";
        }

        private void DisableInputScroll()
        {
            foreach (var tb in new TextBox[] { CpHex, CpR, CpG, CpB, CpH, CpS, CpL, CpTolerance })
            {
                if (tb == null) continue;
                var sv = FindVisualChild<ScrollViewer>(tb);
                if (sv != null)
                {
                    sv.HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled;
                    sv.VerticalScrollBarVisibility = ScrollBarVisibility.Disabled;
                    sv.HorizontalContentAlignment = HorizontalAlignment.Center;
                    sv.VerticalContentAlignment = VerticalAlignment.Center;
                }
            }
        }

        private static T? FindVisualChild<T>(DependencyObject parent) where T : DependencyObject
        {
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
            {
                var child = VisualTreeHelper.GetChild(parent, i);
                if (child is T found) return found;
                var descendant = FindVisualChild<T>(child);
                if (descendant != null) return descendant;
            }
            return null;
        }

        private static string NormalizeHex(string hex)
        {
            hex = (hex ?? "").TrimStart('#');
            if (hex.Length == 6) return "#" + hex;
            if (hex.Length == 3)
                return "#" + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            return "#e84040";
        }

        private void RgbFromHex(string hex, out int r, out int g, out int b)
        {
            hex = hex.TrimStart('#');
            if (hex.Length != 6) { r = g = b = 0; return; }
            r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
            g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
            b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
        }

        private static void HslFromRgb(int r, int g, int b, out double h, out double s, out double l)
        {
            double rd = r / 255.0, gd = g / 255.0, bd = b / 255.0;
            double max = Math.Max(rd, Math.Max(gd, bd));
            double min = Math.Min(rd, Math.Min(gd, bd));
            l = (max + min) / 2.0;
            if (Math.Abs(max - min) < 0.0001) { h = 0; s = 0; return; }
            s = l < 0.5 ? (max - min) / (max + min) : (max - min) / (2.0 - max - min);
            double d = max - min;
            if (Math.Abs(rd - max) < 0.0001) h = (gd - bd) / d + (gd < bd ? 6 : 0);
            else if (Math.Abs(gd - max) < 0.0001) h = (bd - rd) / d + 2;
            else h = (rd - gd) / d + 4;
            h /= 6; if (h < 0) h += 1;
            h *= 360;
            s *= 100;
            l *= 100;
        }

        private static void RgbFromHsl(double h, double s, double l, out int r, out int g, out int b)
        {
            s /= 100.0; l /= 100.0; h = h / 360.0;
            if (s <= 0) { int t = (int)(l * 255); r = g = b = t; return; }
            double c = (1 - Math.Abs(2 * l - 1)) * s;
            double x = c * (1 - Math.Abs((h * 6) % 2 - 1));
            double m = l - c / 2;
            double r1 = 0, g1 = 0, b1 = 0;
            if (h < 1.0 / 6) { r1 = c; g1 = x; b1 = 0; }
            else if (h < 2.0 / 6) { r1 = x; g1 = c; b1 = 0; }
            else if (h < 3.0 / 6) { r1 = 0; g1 = c; b1 = x; }
            else if (h < 4.0 / 6) { r1 = 0; g1 = x; b1 = c; }
            else if (h < 5.0 / 6) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }
            r = (int)((r1 + m) * 255); if (r > 255) r = 255; if (r < 0) r = 0;
            g = (int)((g1 + m) * 255); if (g > 255) g = 255; if (g < 0) g = 0;
            b = (int)((b1 + m) * 255); if (b > 255) b = 255; if (b < 0) b = 0;
        }

        private static void HsvFromRgb(int r, int g, int b, out double h, out double s, out double v)
        {
            double rd = r / 255.0, gd = g / 255.0, bd = b / 255.0;
            double max = Math.Max(rd, Math.Max(gd, bd));
            double min = Math.Min(rd, Math.Min(gd, bd));
            v = max;
            if (max <= 0) { h = 0; s = 0; return; }
            s = (max - min) / max;
            if (s <= 0) { h = 0; return; }
            double d = max - min;
            if (Math.Abs(rd - max) < 0.0001)
                h = (gd - bd) / d + (gd < bd ? 6 : 0);
            else if (Math.Abs(gd - max) < 0.0001)
                h = (bd - rd) / d + 2;
            else
                h = (rd - gd) / d + 4;
            h /= 6;
            if (h < 0) h += 1;
            h *= 360;
        }

        private static void RgbFromHsv(double h, double s, double v, out int r, out int g, out int b)
        {
            if (s <= 0) { r = g = b = (int)(v * 255); return; }
            h = h / 360.0;
            if (h < 0) h += 1;
            double c = v * s;
            double x = c * (1 - Math.Abs((h * 6) % 2 - 1));
            double m = v - c;
            double r1 = 0, g1 = 0, b1 = 0;
            if (h < 1.0 / 6) { r1 = c; g1 = x; b1 = 0; }
            else if (h < 2.0 / 6) { r1 = x; g1 = c; b1 = 0; }
            else if (h < 3.0 / 6) { r1 = 0; g1 = c; b1 = x; }
            else if (h < 4.0 / 6) { r1 = 0; g1 = x; b1 = c; }
            else if (h < 5.0 / 6) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }
            r = (int)((r1 + m) * 255); if (r > 255) r = 255;
            g = (int)((g1 + m) * 255); if (g > 255) g = 255;
            b = (int)((b1 + m) * 255); if (b > 255) b = 255;
        }

        private void BuildSvBitmap()
        {
            _svBitmap = new WriteableBitmap(SvWidth, SvHeight, 96, 96, PixelFormats.Bgr24, null);
            SvImage.Source = _svBitmap;
            SvImage.Width = SvWidth;
            SvImage.Height = SvHeight;
            RedrawSv();
        }

        private void RedrawSv()
        {
            if (_svBitmap == null) return;
            var pixels = new byte[SvWidth * SvHeight * 3];
            for (int py = 0; py < SvHeight; py++)
            {
                double v = 1.0 - (py / (double)SvHeight);
                for (int px = 0; px < SvWidth; px++)
                {
                    double s = px / (double)SvWidth;
                    RgbFromHsv(_hue, s, v, out int r, out int g, out int b);
                    int i = (py * SvWidth + px) * 3;
                    pixels[i] = (byte)b;
                    pixels[i + 1] = (byte)g;
                    pixels[i + 2] = (byte)r;
                }
            }
            _svBitmap.WritePixels(new System.Windows.Int32Rect(0, 0, SvWidth, SvHeight), pixels, SvWidth * 3, 0);
        }

        private void BuildHueBitmap()
        {
            _hueBitmap = new WriteableBitmap(SvWidth, HueHeight, 96, 96, PixelFormats.Bgr24, null);
            HueImage.Source = _hueBitmap;
            HueImage.Width = SvWidth;
            HueImage.Height = HueHeight;
            var pixels = new byte[SvWidth * HueHeight * 3];
            for (int py = 0; py < HueHeight; py++)
                for (int px = 0; px < SvWidth; px++)
                {
                    double h = (px / (double)SvWidth) * 360;
                    RgbFromHsv(h, 1, 1, out int r, out int g, out int b);
                    int i = (py * SvWidth + px) * 3;
                    pixels[i] = (byte)b;
                    pixels[i + 1] = (byte)g;
                    pixels[i + 2] = (byte)r;
                }
            _hueBitmap.WritePixels(new System.Windows.Int32Rect(0, 0, SvWidth, HueHeight), pixels, SvWidth * 3, 0);
        }

        private void UpdateFromHsv()
        {
            RgbFromHsv(_hue, _saturation, _value, out int r, out int g, out int b);
            SelectedColorHex = $"#{r:X2}{g:X2}{b:X2}";
            _updatingFromRgb = true;
            _updatingFromHsl = true;
            CpHex.Text = SelectedColorHex;
            CpR.Text = r.ToString();
            CpG.Text = g.ToString();
            CpB.Text = b.ToString();
            HslFromRgb(r, g, b, out double hh, out double ss, out double ll);
            if (CpH != null) CpH.Text = ((int)Math.Round(hh)).ToString();
            if (CpS != null) CpS.Text = ((int)Math.Round(ss)).ToString();
            if (CpL != null) CpL.Text = ((int)Math.Round(ll)).ToString();
            SyncInputDisplays();
            _updatingFromRgb = false;
            _updatingFromHsl = false;
            CpPreview.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb((byte)r, (byte)g, (byte)b));
            // Cursor S/V (ellipse 10x10) : rester entièrement dans le rectangle
            double svW = CpSv != null && CpSv.ActualWidth > 0 ? CpSv.ActualWidth : SvWidth;
            double svH = CpSv != null && CpSv.ActualHeight > 0 ? CpSv.ActualHeight : SvHeight;
            const double svRad = 5;
            double innerW = Math.Max(1, svW - 2 * svRad);
            double innerH = Math.Max(1, svH - 2 * svRad);
            double sx = Math.Max(0, Math.Min(innerW, _saturation * innerW));
            double sy = Math.Max(0, Math.Min(innerH, (1.0 - _value) * innerH));
            SvCursorTransform.X = sx;
            SvCursorTransform.Y = sy;
            // Cursor Hue : rond 12x12 = hauteur du rectangle, centré verticalement
            const double hueCursorSize = 12;
            double hueW = CpHue != null && CpHue.ActualWidth > 0 ? CpHue.ActualWidth : (SvWidth - 16);
            double innerHueW = Math.Max(1, hueW - hueCursorSize);
            HueCursorTransform.X = Math.Max(0, Math.Min(innerHueW, (_hue / 360.0) * innerHueW));
            HueCursorTransform.Y = 0;
            _onColorChanged?.Invoke(SelectedColorHex);
        }

        private void SetFromHex(string hex)
        {
            hex = NormalizeHex(hex);
            RgbFromHex(hex, out int r, out int g, out int b);
            HsvFromRgb(r, g, b, out _hue, out _saturation, out _value);
            RedrawSv();
            UpdateFromHsv();
        }

        private void CloseWindow()
        {
            if (_isClosing) return;
            _isClosing = true;
            DialogResult = true;
            Close();
        }

        private void ConfirmAndClose()
        {
            DialogResult = true;
            Close();
        }

        private void PipetteBtn_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            try
            {
                _pipetteOpen = true;
                try
                {
                    var colorPicker = new ColorPickerWindow { Owner = this };
                    if (colorPicker.ShowDialog() == true && !string.IsNullOrEmpty(colorPicker.ColorHex))
                    {
                        var hex = colorPicker.ColorHex.Trim();
                        if (!hex.StartsWith("#")) hex = "#" + hex;
                        SetFromHex(hex);
                    }
                }
                finally
                {
                    var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
                    timer.Tick += (_, __) => { _pipetteOpen = false; timer.Stop(); };
                    timer.Start();
                }
            }
            catch (Exception ex)
            {
                _pipetteOpen = false;
                MessageBox.Show($"Erreur pipette : {ex.Message}", "Couleur", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void OverlayGrid_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (_isClosing) return;
            if (_pipetteOpen) return;
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
            if (_isClosing) return;
            _isClosing = true;
            ConfirmAndClose();
        }

        private void CpSv_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _svDragging = true;
            Mouse.Capture(CpSv, CaptureMode.SubTree);
            UpdateSvFromPosition(e.GetPosition(CpSv));
        }

        private void CpSv_MouseMove(object sender, MouseEventArgs e)
        {
            if (_svDragging) UpdateSvFromPosition(e.GetPosition(CpSv));
        }

        private void CpSv_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _svDragging = false;
            if (Mouse.Captured == CpSv) Mouse.Capture(null);
        }

        private void CpSv_LostMouseCapture(object sender, MouseEventArgs e)
        {
            _svDragging = false;
        }

        private void UpdateSvFromPosition(System.Windows.Point pos)
        {
            double w = CpSv.ActualWidth > 0 ? CpSv.ActualWidth : SvWidth;
            double h = CpSv.ActualHeight > 0 ? CpSv.ActualHeight : SvHeight;
            const double r = 5;
            double innerW = Math.Max(1, w - 2 * r);
            double innerH = Math.Max(1, h - 2 * r);
            _saturation = Math.Max(0, Math.Min(1, (pos.X - r) / innerW));
            _value = Math.Max(0, Math.Min(1, 1.0 - (pos.Y - r) / innerH));
            UpdateFromHsv();
        }

        private void CpHue_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _hueDragging = true;
            Mouse.Capture(CpHue, CaptureMode.SubTree);
            UpdateHueFromPosition(e.GetPosition(CpHue));
        }

        private void CpHue_MouseMove(object sender, MouseEventArgs e)
        {
            if (_hueDragging) UpdateHueFromPosition(e.GetPosition(CpHue));
        }

        private void CpHue_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _hueDragging = false;
            if (Mouse.Captured == CpHue) Mouse.Capture(null);
        }

        private void CpHue_LostMouseCapture(object sender, MouseEventArgs e)
        {
            _hueDragging = false;
        }

        private void UpdateHueFromPosition(System.Windows.Point pos)
        {
            double w = CpHue.ActualWidth > 0 ? CpHue.ActualWidth : (SvWidth - 16);
            const double hueCursorSize = 12;
            double innerW = Math.Max(1, w - hueCursorSize);
            _hue = Math.Max(0, Math.Min(360, (pos.X / innerW) * 360));
            RedrawSv();
            UpdateFromHsv();
        }

        private void CpHex_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            if (CpHexDisplay != null && CpHex != null) CpHexDisplay.Text = CpHex.Text ?? "";
        }

        private void CpHex_LostFocus(object sender, RoutedEventArgs e)
        {
            var hex = (CpHex.Text ?? "").Trim();
            if (!hex.StartsWith("#") && hex.Length > 0) hex = "#" + hex;
            string normalized = NormalizeHex(hex);
            if (CpHex != null) CpHex.Text = normalized;
            if (normalized.Length == 7) SetFromHex(normalized);
        }

        private void CpTolerance_LostFocus(object sender, RoutedEventArgs e)
        {
            if (CpTolerance == null) return;
            string digits = OnlyDigits(CpTolerance.Text);
            if (string.IsNullOrEmpty(digits)) digits = "0";
            if (!int.TryParse(digits, out int p)) p = 0;
            p = Math.Clamp(p, 0, 100);
            ColorTolerancePercent = p;
            CpTolerance.Text = p.ToString();
        }

        private void CpTolerance_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            if (CpTolerance == null) return;
            string digits = OnlyDigits(CpTolerance.Text);
            if (string.IsNullOrEmpty(digits)) return;
            if (int.TryParse(digits, out int p) && p > 100)
            {
                ColorTolerancePercent = 100;
                CpTolerance.Text = "100";
            }
        }

        private void CpRgb_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            SyncInputDisplays();
            if (CpR != null && CpG != null && CpB != null)
            {
                string rClean = OnlyDigits(CpR.Text), gClean = OnlyDigits(CpG.Text), bClean = OnlyDigits(CpB.Text);
                if (CpR.Text != rClean || CpG.Text != gClean || CpB.Text != bClean)
                {
                    if (CpR.Text != rClean) CpR.Text = rClean;
                    if (CpG.Text != gClean) CpG.Text = gClean;
                    if (CpB.Text != bClean) CpB.Text = bClean;
                    return;
                }
            }
            if (_updatingFromRgb) return;
            if (CpR == null || CpG == null || CpB == null || CpHex == null || CpPreview == null
                || SvCursorTransform == null || HueCursorTransform == null)
                return;
            if (int.TryParse(CpR.Text, out int r) && int.TryParse(CpG.Text, out int g) && int.TryParse(CpB.Text, out int b))
            {
                r = Math.Max(0, Math.Min(255, r));
                g = Math.Max(0, Math.Min(255, g));
                b = Math.Max(0, Math.Min(255, b));
                _updatingFromRgb = true;
                string rs = r.ToString(), gs = g.ToString(), bs = b.ToString();
                if (CpR.Text != rs) CpR.Text = rs;
                if (CpG.Text != gs) CpG.Text = gs;
                if (CpB.Text != bs) CpB.Text = bs;
                if (CpRDisplay != null) CpRDisplay.Text = CpR.Text;
                if (CpGDisplay != null) CpGDisplay.Text = CpG.Text;
                if (CpBDisplay != null) CpBDisplay.Text = CpB.Text;
                HsvFromRgb(r, g, b, out _hue, out _saturation, out _value);
                int rr = r, gg = g, bb = b;
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    RedrawSv();
                    SelectedColorHex = $"#{rr:X2}{gg:X2}{bb:X2}";
                    if (CpHex != null) CpHex.Text = SelectedColorHex;
                    SyncInputDisplays();
                    if (CpPreview != null) CpPreview.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb((byte)rr, (byte)gg, (byte)bb));
                    if (SvCursorTransform != null && HueCursorTransform != null)
                    {
                        double svW = CpSv != null && CpSv.ActualWidth > 0 ? CpSv.ActualWidth : SvWidth;
                        double svH = CpSv != null && CpSv.ActualHeight > 0 ? CpSv.ActualHeight : SvHeight;
                        const double r5 = 5;
                        double innerW = Math.Max(1, svW - 2 * r5);
                        double innerH = Math.Max(1, svH - 2 * r5);
                        double sx = Math.Max(0, Math.Min(innerW, _saturation * innerW));
                        double sy = Math.Max(0, Math.Min(innerH, (1.0 - _value) * innerH));
                        SvCursorTransform.X = sx;
                        SvCursorTransform.Y = sy;
                        double hueW = CpHue != null && CpHue.ActualWidth > 0 ? CpHue.ActualWidth : (SvWidth - 16);
                        double innerHueW = Math.Max(1, hueW - 12);
                        HueCursorTransform.X = Math.Max(0, Math.Min(innerHueW, (_hue / 360.0) * innerHueW));
                        HueCursorTransform.Y = 0;
                    }
                    _updatingFromRgb = false;
                }), DispatcherPriority.Input);
            }
            else
            {
                _updatingFromRgb = false;
            }
        }

        private void CpHsl_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            SyncInputDisplays();
            if (CpH != null && CpS != null && CpL != null)
            {
                string hClean = OnlyDigits(CpH.Text), sClean = OnlyDigits(CpS.Text), lClean = OnlyDigits(CpL.Text);
                if (CpH.Text != hClean || CpS.Text != sClean || CpL.Text != lClean)
                {
                    if (CpH.Text != hClean) CpH.Text = hClean;
                    if (CpS.Text != sClean) CpS.Text = sClean;
                    if (CpL.Text != lClean) CpL.Text = lClean;
                    return;
                }
            }
            if (_updatingFromHsl) return;
            if (CpH == null || CpS == null || CpL == null || CpHex == null || CpPreview == null
                || SvCursorTransform == null || HueCursorTransform == null)
                return;
            if (int.TryParse(CpH.Text, out int h) && int.TryParse(CpS.Text, out int s) && int.TryParse(CpL.Text, out int l))
            {
                double hd = Math.Max(0, Math.Min(360, h));
                double sd = Math.Max(0, Math.Min(100, s));
                double ld = Math.Max(0, Math.Min(100, l));
                RgbFromHsl(hd, sd, ld, out int r, out int g, out int b);
                HsvFromRgb(r, g, b, out _hue, out _saturation, out _value);
                _updatingFromHsl = true;
                string hs = ((int)hd).ToString(), ss = ((int)sd).ToString(), ls = ((int)ld).ToString();
                if (CpH.Text != hs) CpH.Text = hs;
                if (CpS.Text != ss) CpS.Text = ss;
                if (CpL.Text != ls) CpL.Text = ls;
                string rs = r.ToString(), gs = g.ToString(), bs = b.ToString();
                if (CpR.Text != rs) CpR.Text = rs;
                if (CpG.Text != gs) CpG.Text = gs;
                if (CpB.Text != bs) CpB.Text = bs;
                if (CpHDisplay != null) CpHDisplay.Text = CpH.Text;
                if (CpSDisplay != null) CpSDisplay.Text = CpS.Text;
                if (CpLDisplay != null) CpLDisplay.Text = CpL.Text;
                if (CpRDisplay != null) CpRDisplay.Text = CpR.Text;
                if (CpGDisplay != null) CpGDisplay.Text = CpG.Text;
                if (CpBDisplay != null) CpBDisplay.Text = CpB.Text;
                int rr = r, gg = g, bb = b;
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    RedrawSv();
                    SelectedColorHex = $"#{rr:X2}{gg:X2}{bb:X2}";
                    if (CpHex != null) CpHex.Text = SelectedColorHex;
                    SyncInputDisplays();
                    if (CpPreview != null) CpPreview.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb((byte)rr, (byte)gg, (byte)bb));
                    if (SvCursorTransform != null && HueCursorTransform != null)
                    {
                        double svW = CpSv != null && CpSv.ActualWidth > 0 ? CpSv.ActualWidth : SvWidth;
                        double svH = CpSv != null && CpSv.ActualHeight > 0 ? CpSv.ActualHeight : SvHeight;
                        const double r5 = 5;
                        double innerW = Math.Max(1, svW - 2 * r5);
                        double innerH = Math.Max(1, svH - 2 * r5);
                        double sx = Math.Max(0, Math.Min(innerW, _saturation * innerW));
                        double sy = Math.Max(0, Math.Min(innerH, (1.0 - _value) * innerH));
                        SvCursorTransform.X = sx;
                        SvCursorTransform.Y = sy;
                        double hueW = CpHue != null && CpHue.ActualWidth > 0 ? CpHue.ActualWidth : (SvWidth - 16);
                        double innerHueW = Math.Max(1, hueW - 12);
                        HueCursorTransform.X = Math.Max(0, Math.Min(innerHueW, (_hue / 360.0) * innerHueW));
                        HueCursorTransform.Y = 0;
                    }
                    _updatingFromHsl = false;
                    _onColorChanged?.Invoke(SelectedColorHex);
                }), DispatcherPriority.Input);
            }
            else
            {
                _updatingFromHsl = false;
            }
        }

        private void ApplyModeVisibility()
        {
            if (HexPanel == null || RgbPanel == null || HslPanel == null) return;
            HexPanel.Visibility = _inputMode == ColorInputMode.Hex ? Visibility.Visible : Visibility.Collapsed;
            RgbPanel.Visibility = _inputMode == ColorInputMode.Rgb ? Visibility.Visible : Visibility.Collapsed;
            HslPanel.Visibility = _inputMode == ColorInputMode.Hsl ? Visibility.Visible : Visibility.Collapsed;
        }

        private void UpdateModeButtonsAppearance()
        {
            if (BtnModeRgb == null || BtnModeHsl == null || BtnModeHex == null) return;
            var selectedBg = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromArgb(0x20, 0xFF, 0xFF, 0xFF));
            var transparent = System.Windows.Media.Brushes.Transparent;
            BtnModeRgb.Background = _inputMode == ColorInputMode.Rgb ? selectedBg : transparent;
            BtnModeHsl.Background = _inputMode == ColorInputMode.Hsl ? selectedBg : transparent;
            BtnModeHex.Background = _inputMode == ColorInputMode.Hex ? selectedBg : transparent;
        }

        private void ModeButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not System.Windows.Controls.Button btn) return;
            if (btn == BtnModeRgb) _inputMode = ColorInputMode.Rgb;
            else if (btn == BtnModeHsl) _inputMode = ColorInputMode.Hsl;
            else if (btn == BtnModeHex) _inputMode = ColorInputMode.Hex;
            ApplyModeVisibility();
            UpdateModeButtonsAppearance();
            UpdateFromHsv();
        }

    }
}

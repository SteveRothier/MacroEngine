using System;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Windows.Interop;
using System.Diagnostics;
using MacroEngine.Core.Services;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    public partial class ColorPickerWindow : Window
    {
        private const int LoupeSize = 99;
        private const int ZoomCells = 11;
        private const double CellSize = (double)LoupeSize / ZoomCells;
        // Trou : tout le 11×11 doit être dedans (coins à distance sqrt(50) ≈ 7 px). Rayon 8 pour éviter de capturer notre fenêtre (flicker blanc).
        private const int HoleRadius = 8;

        private readonly ScreenCaptureService _screenCapture;
        private readonly MouseHook _mouseHook;
        private WriteableBitmap? _loupeBitmap;
        private System.Drawing.Color _selectedColor;
        private int _selectedX;
        private int _selectedY;
        private bool _isSelecting;
        private int _lastCx = int.MinValue;
        private int _lastCy = int.MinValue;
        private int _lastRenderCx = int.MinValue;
        private int _lastRenderCy = int.MinValue;
        private byte[]? _captureBuffer;
        private int[]? _loupePixels;
        private double _dpiScaleX = 1.0;
        private double _dpiScaleY = 1.0;
        private readonly Stopwatch _renderStopwatch = Stopwatch.StartNew();
        private long _lastRenderMs;
        private const int TargetFrameMs = 16; // ~60fps

        public System.Drawing.Color SelectedColor => _selectedColor;
        public int SelectedX => _selectedX;
        public int SelectedY => _selectedY;
        public string ColorHex => $"#{_selectedColor.R:X2}{_selectedColor.G:X2}{_selectedColor.B:X2}";

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        // GetCursorPos peut être DPI-virtualisé si le process n'est pas DPI-aware.
        // GetPhysicalCursorPos donne des coordonnées physiques (pixels) quand disponible.
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetPhysicalCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);

        [DllImport("user32.dll")]
        private static extern int ShowCursor(bool bShow);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);
        private const int SM_XVIRTUALSCREEN = 76;
        private const int SM_YVIRTUALSCREEN = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;

        [DllImport("user32.dll")]
        private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);
        private const uint WDA_NONE = 0x0;
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x11; // Windows 10 2004+
        private bool _excludeFromCaptureEnabled;

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateRectRgn(int x1, int y1, int x2, int y2);
        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateEllipticRgn(int x1, int y1, int x2, int y2);
        [DllImport("gdi32.dll")]
        private static extern int CombineRgn(IntPtr hrgnDest, IntPtr hrgnSrc1, IntPtr hrgnSrc2, int fnCombineMode);
        [DllImport("user32.dll")]
        private static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);
        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);
        private const int RGN_DIFF = 4;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        public ColorPickerWindow()
        {
            InitializeComponent();
            _screenCapture = new ScreenCaptureService();

            if (Owner == null)
                Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;

            SourceInitialized += (_, __) =>
            {
                var src = PresentationSource.FromVisual(this);
                if (src?.CompositionTarget != null)
                {
                    var m = src.CompositionTarget.TransformToDevice;
                    _dpiScaleX = m.M11;
                    _dpiScaleY = m.M22;
                }

                int vslPx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                int vstPx = GetSystemMetrics(SM_YVIRTUALSCREEN);
                int vswPx = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                int vshPx = GetSystemMetrics(SM_CYVIRTUALSCREEN);

                Left = vslPx / _dpiScaleX;
                Top = vstPx / _dpiScaleY;
                Width = vswPx / _dpiScaleX;
                Height = vshPx / _dpiScaleY;

                // Évite que notre overlay (grille/carré/bords) soit capturé par BitBlt/GetDIBits.
                // Si supporté, on n'a plus besoin du "trou" (WindowRgn).
                var hwnd = new WindowInteropHelper(this).Handle;
                _excludeFromCaptureEnabled = hwnd != IntPtr.Zero && SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            };

            _mouseHook = new MouseHook();
            _mouseHook.MouseDown += MouseHook_MouseDown;
            _mouseHook.Install();

            CompositionTarget.Rendering += OnRendering;

            KeyDown += ColorPickerWindow_KeyDown;
            Loaded += (s, _) =>
            {
                ShowCursor(false);
                BuildGridLines();
                InitLoupeBitmap();
                WarmupCapture();
                UpdatePositionAndColor();
            };
            Focusable = true;
        }

        private void OnRendering(object? sender, EventArgs e)
        {
            if (_isSelecting)
                return;

            var now = _renderStopwatch.ElapsedMilliseconds;
            if (now - _lastRenderMs < TargetFrameMs)
                return;
            _lastRenderMs = now;

            UpdatePositionAndColor();
        }

        private void BuildGridLines()
        {
            var brush = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x40, 0, 0, 0));
            for (int i = 1; i < ZoomCells; i++)
            {
                var x = (double)i * CellSize;
                GridLines.Children.Add(new Line { X1 = x, Y1 = 0, X2 = x, Y2 = LoupeSize, Stroke = brush, StrokeThickness = 1 });
                GridLines.Children.Add(new Line { X1 = 0, Y1 = x, X2 = LoupeSize, Y2 = x, Stroke = brush, StrokeThickness = 1 });
            }
        }

        private void InitLoupeBitmap()
        {
            _loupeBitmap = new WriteableBitmap(LoupeSize, LoupeSize, 96, 96, PixelFormats.Bgra32, null);
            LoupeImage.Source = _loupeBitmap;
            LoupeBorder.Clip = new EllipseGeometry(new System.Windows.Point(LoupeSize / 2.0, LoupeSize / 2.0), LoupeSize / 2.0, LoupeSize / 2.0);
            _loupePixels = new int[LoupeSize * LoupeSize];
        }

        private void UpdateWindowRegion(int cx, int cy)
        {
            // SetWindowRgn est coûteux : ne le refaire que si le curseur a bougé
            if (cx == _lastCx && cy == _lastCy)
                return;

            _lastCx = cx;
            _lastCy = cy;

            // IMPORTANT: SetWindowRgn travaille en pixels. On utilise GetSystemMetrics (pixels),
            // pas SystemParameters (DIP) sinon le trou se décale en DPI scaling.
            int vslPx = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int vstPx = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int vswPx = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            int vshPx = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            int wx = (cx - vslPx - HoleRadius);
            int wy = (cy - vstPx - HoleRadius);
            IntPtr rgnScreen = CreateRectRgn(0, 0, vswPx + 1, vshPx + 1);
            IntPtr rgnHole = CreateEllipticRgn(wx, wy, wx + HoleRadius * 2, wy + HoleRadius * 2);
            IntPtr rgnResult = CreateRectRgn(0, 0, 0, 0);
            CombineRgn(rgnResult, rgnScreen, rgnHole, RGN_DIFF);
            DeleteObject(rgnScreen);
            DeleteObject(rgnHole);
            var hwnd = new WindowInteropHelper(this).Handle;
            SetWindowRgn(hwnd, rgnResult, true);
        }

        private void RenderCaptureToLoupe(byte[] bgra)
        {
            if (_loupeBitmap == null || _loupePixels == null)
                return;

            int cell = (int)CellSize; // LoupeSize divisible par ZoomCells => cell entier
            for (int py = 0; py < ZoomCells; py++)
            for (int px = 0; px < ZoomCells; px++)
            {
                int srcIndex = (py * ZoomCells + px) * 4;
                byte b = bgra[srcIndex + 0];
                byte g = bgra[srcIndex + 1];
                byte r = bgra[srcIndex + 2];
                byte a = bgra[srcIndex + 3];
                int color = (a << 24) | (r << 16) | (g << 8) | b;

                int bx = px * cell;
                int by = py * cell;
                for (int dy = 0; dy < cell; dy++)
                {
                    int row = (by + dy) * LoupeSize + bx;
                    for (int dx = 0; dx < cell; dx++)
                        _loupePixels[row + dx] = color;
                }
            }

            _loupeBitmap.WritePixels(new Int32Rect(0, 0, LoupeSize, LoupeSize), _loupePixels, LoupeSize * 4, 0);
        }

        private void MouseHook_MouseDown(object? sender, MouseHookEventArgs e)
        {
            if (e.Button != Core.Hooks.MouseButton.Left) return;
            Dispatcher.Invoke(() =>
            {
                if (_isSelecting) return;
                _isSelecting = true;
                _selectedX = e.X;
                _selectedY = e.Y;
                var pixelColor = _screenCapture.CapturePixel(e.X, e.Y);
                if (pixelColor.HasValue)
                    _selectedColor = pixelColor.Value;
                else
                {
                    IntPtr hdc = GetDC(IntPtr.Zero);
                    uint pixel = GetPixel(hdc, e.X, e.Y);
                    ReleaseDC(IntPtr.Zero, hdc);
                    _selectedColor = System.Drawing.Color.FromArgb(
                        (int)(pixel & 0xFF), (int)((pixel >> 8) & 0xFF), (int)((pixel >> 16) & 0xFF));
                }
                DialogResult = true;
                Close();
            });
        }

        private void UpdatePositionAndColor()
        {
            try
            {
                // Coordonnées curseur en pixels physiques pour aligner capture + "trou"
                POINT p;
                if (!GetPhysicalCursorPos(out p))
                    GetCursorPos(out p);
                int cx = p.X, cy = p.Y;
                if (cx == _lastRenderCx && cy == _lastRenderCy)
                    return;
                _lastRenderCx = cx;
                _lastRenderCy = cy;

                int vslPx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                int vstPx = GetSystemMetrics(SM_YVIRTUALSCREEN);

                // Coordonnées canvas en DIP (WPF), à partir de pixels écran
                double cxDip = (cx - vslPx) / _dpiScaleX;
                double cyDip = (cy - vstPx) / _dpiScaleY;

                if (!_excludeFromCaptureEnabled)
                    UpdateWindowRegion(cx, cy);
                // Loupe centrée sur le curseur (pas de décalage à droite)
                Canvas.SetLeft(LoupeBorder, cxDip - LoupeSize / 2.0);
                Canvas.SetTop(LoupeBorder, cyDip - LoupeSize / 2.0);

                int half = ZoomCells / 2;
                int x0 = cx - half, y0 = cy - half;
                int bytes = ZoomCells * ZoomCells * 4;
                _captureBuffer ??= new byte[bytes];
                if (_captureBuffer.Length < bytes)
                    _captureBuffer = new byte[bytes];

                if (_screenCapture.CaptureRegionBgra(x0, y0, ZoomCells, ZoomCells, _captureBuffer))
                {
                    RenderCaptureToLoupe(_captureBuffer);

                    int centerIndex = (half * ZoomCells + half) * 4;
                    byte b = _captureBuffer[centerIndex + 0];
                    byte g = _captureBuffer[centerIndex + 1];
                    byte r = _captureBuffer[centerIndex + 2];
                    byte a = _captureBuffer[centerIndex + 3];
                    _selectedColor = System.Drawing.Color.FromArgb(a, r, g, b);
                }

                _selectedX = cx;
                _selectedY = cy;

                CenterPixelBorder.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(
                    _selectedColor.R, _selectedColor.G, _selectedColor.B));
                TooltipHex.Text = ColorHex;
                TooltipSwatch.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(
                    _selectedColor.R, _selectedColor.G, _selectedColor.B));
                double gap = 8, tw = 80;
                double tooltipX = cxDip;
                double tooltipY = cyDip + LoupeSize / 2.0 + gap;
                if (tooltipX - tw / 2 < 0) tooltipX = tw / 2;
                if (tooltipX + tw / 2 > Width) tooltipX = Width - tw / 2;
                if (tooltipY + 28 > Height) tooltipY = cyDip - LoupeSize / 2.0 - gap - 28;
                Canvas.SetLeft(TooltipBorder, tooltipX - tw / 2);
                Canvas.SetTop(TooltipBorder, tooltipY);
            }
            catch { }
        }

        private void WarmupCapture()
        {
            try
            {
                // Pré-allocation + premier BitBlt/GetDIBits pour éviter le gros lag au démarrage
                int bytes = ZoomCells * ZoomCells * 4;
                _captureBuffer ??= new byte[bytes];
                if (_captureBuffer.Length < bytes)
                    _captureBuffer = new byte[bytes];

                POINT p;
                if (!GetPhysicalCursorPos(out p))
                    GetCursorPos(out p);

                int half = ZoomCells / 2;
                _screenCapture.CaptureRegionBgra(p.X - half, p.Y - half, ZoomCells, ZoomCells, _captureBuffer);
            }
            catch { }
        }

        private void ColorPickerWindow_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape) { DialogResult = false; Close(); }
        }

        protected override void OnClosed(EventArgs e)
        {
            ShowCursor(true);
            CompositionTarget.Rendering -= OnRendering;
            _mouseHook?.Uninstall();
            _mouseHook?.Dispose();
            base.OnClosed(e);
        }
    }
}

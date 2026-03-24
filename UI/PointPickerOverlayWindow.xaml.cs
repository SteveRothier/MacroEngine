using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    public partial class PointPickerOverlayWindow : Window
    {
        private readonly MouseHook _mouseHook;
        private int _selectedX;
        private int _selectedY;
        private bool _isSelecting;
        private int _lastX = int.MinValue;
        private int _lastY = int.MinValue;
        private long _lastFrameMs;
        private readonly System.Diagnostics.Stopwatch _sw = System.Diagnostics.Stopwatch.StartNew();
        private const int TargetFrameMs = 16;

        public int SelectedX => _selectedX;
        public int SelectedY => _selectedY;

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        public PointPickerOverlayWindow()
        {
            InitializeComponent();
            Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = SystemParameters.VirtualScreenLeft;
            Top = SystemParameters.VirtualScreenTop;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;

            _mouseHook = new MouseHook();
            _mouseHook.MouseDown += MouseHook_MouseDown;
            _mouseHook.Install();

            CompositionTarget.Rendering += OnRendering;

            KeyDown += OnKeyDown;
            Loaded += (s, e) => UpdatePosition();
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
                DialogResult = true;
                Close();
            });
        }

        private void OnRendering(object? sender, EventArgs e)
        {
            if (_isSelecting) return;
            var now = _sw.ElapsedMilliseconds;
            if (now - _lastFrameMs < TargetFrameMs) return;
            _lastFrameMs = now;
            UpdatePosition();
        }

        private void UpdatePosition()
        {
            try
            {
                GetCursorPos(out POINT p);
                if (p.X == _lastX && p.Y == _lastY) return;
                _lastX = p.X;
                _lastY = p.Y;
                _selectedX = p.X;
                _selectedY = p.Y;

                var screenPt = new Point(p.X, p.Y);
                var windowPt = OverlayGrid.PointFromScreen(screenPt);
                double wx = windowPt.X;
                double wy = windowPt.Y;

                HairH.X1 = 0;
                HairH.Y1 = wy;
                HairH.X2 = ActualWidth;
                HairH.Y2 = wy;

                HairV.X1 = wx;
                HairV.Y1 = 0;
                HairV.X2 = wx;
                HairV.Y2 = ActualHeight;

                if (LiveX != null) LiveX.Text = p.X.ToString();
                if (LiveY != null) LiveY.Text = p.Y.ToString();

                const double tw = 186;
                const double th = 82;
                double tx = wx + 18;
                double ty = wy + 18;
                if (tx + tw > ActualWidth) tx = wx - tw - 8;
                if (ty + th > ActualHeight) ty = wy - th - 8;
                if (tx < 0) tx = 8;
                if (ty < 0) ty = 8;

                TooltipBorder.Margin = new Thickness(tx, ty, 0, 0);
                TooltipBorder.HorizontalAlignment = HorizontalAlignment.Left;
                TooltipBorder.VerticalAlignment = VerticalAlignment.Top;
            }
            catch { }
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                Close();
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            CompositionTarget.Rendering -= OnRendering;
            _mouseHook?.Uninstall();
            _mouseHook?.Dispose();
            base.OnClosed(e);
        }
    }
}

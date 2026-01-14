using System;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MacroEngine.Core.Services;

namespace MacroEngine.UI
{
    public partial class ColorPickerWindow : Window
    {
        private readonly ScreenCaptureService _screenCapture;
        private readonly DispatcherTimer _updateTimer;
        private System.Drawing.Color _selectedColor;
        private int _selectedX;
        private int _selectedY;
        private bool _isSelecting = false;

        public System.Drawing.Color SelectedColor => _selectedColor;
        public int SelectedX => _selectedX;
        public int SelectedY => _selectedY;
        public string ColorHex => $"#{_selectedColor.R:X2}{_selectedColor.G:X2}{_selectedColor.B:X2}";

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);

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

            // Masquer la fenêtre de dialogue parente temporairement
            Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;

            // Timer pour mettre à jour la couleur en temps réel
            _updateTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(50)
            };
            _updateTimer.Tick += UpdateTimer_Tick;
            _updateTimer.Start();

            // Capturer les clics de souris
            MouseDown += ColorPickerWindow_MouseDown;
            KeyDown += ColorPickerWindow_KeyDown;
            PreviewMouseDown += ColorPickerWindow_PreviewMouseDown;

            // Suivre le curseur
            UpdateColor();
            UpdatePosition();
            
            // S'assurer que la fenêtre peut recevoir les événements clavier
            Focusable = true;
        }

        private void ColorPickerWindow_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            // Capturer le clic même si la fenêtre n'a pas le focus
            e.Handled = false;
        }

        private void UpdateTimer_Tick(object? sender, EventArgs e)
        {
            if (!_isSelecting)
            {
                UpdateColor();
                UpdatePosition();
            }
        }

        private void UpdateColor()
        {
            try
            {
                POINT cursorPos;
                GetCursorPos(out cursorPos);

                // Utiliser ScreenCaptureService pour capturer le pixel (plus fiable que GetPixel)
                var pixelColor = _screenCapture.CapturePixel(cursorPos.X, cursorPos.Y);
                if (pixelColor.HasValue)
                {
                    _selectedColor = pixelColor.Value;
                }
                else
                {
                    // Fallback sur GetPixel si ScreenCaptureService échoue
                    IntPtr hdc = GetDC(IntPtr.Zero);
                    uint pixel = GetPixel(hdc, cursorPos.X, cursorPos.Y);
                    ReleaseDC(IntPtr.Zero, hdc);

                    _selectedColor = System.Drawing.Color.FromArgb(
                        (int)(pixel & 0x000000FF),
                        (int)((pixel & 0x0000FF00) >> 8),
                        (int)((pixel & 0x00FF0000) >> 16)
                    );
                }

                _selectedX = cursorPos.X;
                _selectedY = cursorPos.Y;

                // Mettre à jour l'affichage
                Dispatcher.Invoke(() =>
                {
                    if (XValue != null && YValue != null && ColorValue != null && ColorPreviewBorder != null)
                    {
                        XValue.Text = _selectedX.ToString();
                        YValue.Text = _selectedY.ToString();
                        ColorValue.Text = ColorHex;
                        ColorPreviewBorder.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(
                            _selectedColor.R, _selectedColor.G, _selectedColor.B));
                    }
                });
            }
            catch { }
        }

        private void UpdatePosition()
        {
            try
            {
                POINT cursorPos;
                GetCursorPos(out cursorPos);

                // Positionner la fenêtre près du curseur
                Left = cursorPos.X + 20;
                Top = cursorPos.Y + 20;

                // S'assurer que la fenêtre reste à l'écran
                var screenWidth = SystemParameters.PrimaryScreenWidth;
                var screenHeight = SystemParameters.PrimaryScreenHeight;

                if (Left + Width > screenWidth)
                    Left = cursorPos.X - Width - 20;
                if (Top + Height > screenHeight)
                    Top = cursorPos.Y - Height - 20;
            }
            catch { }
        }

        private void ColorPickerWindow_MouseDown(object sender, MouseButtonEventArgs e)
        {
            _isSelecting = true;
            DialogResult = true;
            Close();
        }

        private void ColorPickerWindow_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                Close();
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            _updateTimer?.Stop();
            base.OnClosed(e);
        }
    }
}

using System;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MacroEngine.Core.Services;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    public partial class ColorPickerWindow : Window
    {
        private readonly ScreenCaptureService _screenCapture;
        private readonly DispatcherTimer _updateTimer;
        private readonly MouseHook _mouseHook;
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

            // Utiliser un hook global de souris pour détecter les clics (la fenêtre est IsHitTestVisible="False")
            _mouseHook = new MouseHook();
            _mouseHook.MouseDown += MouseHook_MouseDown;
            _mouseHook.Install();

            // Timer pour mettre à jour la couleur en temps réel
            _updateTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(50)
            };
            _updateTimer.Tick += UpdateTimer_Tick;
            _updateTimer.Start();

            // Capturer les événements clavier
            KeyDown += ColorPickerWindow_KeyDown;

            // Suivre le curseur
            UpdateColor();
            UpdatePosition();
            
            // S'assurer que la fenêtre peut recevoir les événements clavier
            Focusable = true;
        }

        private void MouseHook_MouseDown(object? sender, MouseHookEventArgs e)
        {
            // Ne traiter que les clics gauche
            if (e.Button != Core.Hooks.MouseButton.Left)
                return;

            // Vérifier si le clic est sur la fenêtre (dans ce cas, on l'ignore car on veut cliquer à travers)
            // Mais on accepte tous les clics ailleurs sur l'écran
            Dispatcher.Invoke(() =>
            {
                if (!_isSelecting)
                {
                    _isSelecting = true;
                    // Mettre à jour les coordonnées finales
                    _selectedX = e.X;
                    _selectedY = e.Y;
                    
                    // Capturer la couleur à cette position
                    var pixelColor = _screenCapture.CapturePixel(e.X, e.Y);
                    if (pixelColor.HasValue)
                    {
                        _selectedColor = pixelColor.Value;
                    }
                    else
                    {
                        // Fallback sur GetPixel
                        IntPtr hdc = GetDC(IntPtr.Zero);
                        uint pixel = GetPixel(hdc, e.X, e.Y);
                        ReleaseDC(IntPtr.Zero, hdc);
                        _selectedColor = System.Drawing.Color.FromArgb(
                            (int)(pixel & 0x000000FF),
                            (int)((pixel & 0x0000FF00) >> 8),
                            (int)((pixel & 0x00FF0000) >> 16)
                        );
                    }
                    
                    DialogResult = true;
                    Close();
                }
            });
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
            _mouseHook?.Uninstall();
            _mouseHook?.Dispose();
            base.OnClosed(e);
        }
    }
}

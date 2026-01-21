using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    public partial class PointSelectorWindow : Window
    {
        private readonly DispatcherTimer _updateTimer;
        private readonly MouseHook _mouseHook;
        private int _selectedX;
        private int _selectedY;
        private bool _isSelecting = false;

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

        public PointSelectorWindow()
        {
            InitializeComponent();

            // Masquer la fenêtre de dialogue parente temporairement
            Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;

            // Utiliser un hook global de souris pour détecter les clics (la fenêtre est IsHitTestVisible="False")
            _mouseHook = new MouseHook();
            _mouseHook.MouseDown += MouseHook_MouseDown;
            _mouseHook.Install();

            // Timer pour mettre à jour la position en temps réel
            _updateTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(50)
            };
            _updateTimer.Tick += UpdateTimer_Tick;
            _updateTimer.Start();

            // Capturer les événements clavier
            KeyDown += PointSelectorWindow_KeyDown;

            // Suivre le curseur
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
                    
                    DialogResult = true;
                    Close();
                }
            });
        }

        private void UpdateTimer_Tick(object? sender, EventArgs e)
        {
            if (!_isSelecting)
            {
                UpdatePosition();
            }
        }

        private void UpdatePosition()
        {
            try
            {
                POINT cursorPos;
                GetCursorPos(out cursorPos);

                _selectedX = cursorPos.X;
                _selectedY = cursorPos.Y;

                // Mettre à jour l'affichage
                Dispatcher.Invoke(() =>
                {
                    if (XValue != null && YValue != null)
                    {
                        XValue.Text = _selectedX.ToString();
                        YValue.Text = _selectedY.ToString();
                    }
                });

                // Positionner la fenêtre près du curseur
                Dispatcher.Invoke(() =>
                {
                    Left = cursorPos.X + 20;
                    Top = cursorPos.Y + 20;
                });
            }
            catch { }
        }

        private void PointSelectorWindow_KeyDown(object sender, KeyEventArgs e)
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

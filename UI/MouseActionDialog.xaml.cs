using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using CoreInputs = MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    /// <summary>
    /// Dialogue pour configurer une action souris
    /// </summary>
    public partial class MouseActionDialog : Window
    {
        private bool _isCapturing = false;
        private DispatcherTimer? _captureTimer;

        /// <summary>
        /// Action souris résultante
        /// </summary>
        public CoreInputs.MouseAction? ResultAction { get; private set; }

        public MouseActionDialog()
        {
            InitializeComponent();
            UpdatePositionFieldsState();
        }

        private void UseCurrentPositionCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            UpdatePositionFieldsState();
        }

        private void UpdatePositionFieldsState()
        {
            bool useCurrentPosition = UseCurrentPositionCheckBox.IsChecked == true;
            XTextBox.IsEnabled = !useCurrentPosition;
            YTextBox.IsEnabled = !useCurrentPosition;

            if (useCurrentPosition)
            {
                XTextBox.Text = "-1";
                YTextBox.Text = "-1";
            }
            else if (XTextBox.Text == "-1" && YTextBox.Text == "-1")
            {
                // Remettre la position actuelle du curseur
                GetCursorPos(out POINT point);
                XTextBox.Text = point.X.ToString();
                YTextBox.Text = point.Y.ToString();
            }
        }

        private void CapturePositionButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isCapturing)
            {
                StopCapture();
                return;
            }

            StartCapture();
        }

        private void StartCapture()
        {
            _isCapturing = true;
            CapturePositionButton.Content = "⏹ Arrêter la capture (Échap ou clic)";
            CaptureStatusText.Text = "Déplacez la souris et cliquez pour capturer...";
            CaptureStatusText.Foreground = System.Windows.Media.Brushes.Orange;

            // Désactiver la checkbox pendant la capture
            UseCurrentPositionCheckBox.IsChecked = false;
            UseCurrentPositionCheckBox.IsEnabled = false;

            // Timer pour mettre à jour la position en temps réel
            _captureTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(50)
            };
            _captureTimer.Tick += CaptureTimer_Tick;
            _captureTimer.Start();

            // Capturer les événements clavier globaux
            this.PreviewKeyDown += CaptureKeyDown;
            this.PreviewMouseDown += CaptureMouseDown;
        }

        private void StopCapture()
        {
            _isCapturing = false;
            CapturePositionButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Crosshair, " Capturer position (cliquez puis pointez)");
            CaptureStatusText.Text = $"Position capturée: ({XTextBox.Text}, {YTextBox.Text})";
            CaptureStatusText.Foreground = System.Windows.Media.Brushes.Green;

            UseCurrentPositionCheckBox.IsEnabled = true;

            _captureTimer?.Stop();
            _captureTimer = null;

            this.PreviewKeyDown -= CaptureKeyDown;
            this.PreviewMouseDown -= CaptureMouseDown;
        }

        private void CaptureTimer_Tick(object? sender, EventArgs e)
        {
            if (_isCapturing)
            {
                GetCursorPos(out POINT point);
                XTextBox.Text = point.X.ToString();
                YTextBox.Text = point.Y.ToString();
            }
        }

        private void CaptureKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                StopCapture();
                e.Handled = true;
            }
        }

        private void CaptureMouseDown(object sender, MouseButtonEventArgs e)
        {
            // Ne pas capturer les clics sur les boutons du dialogue
            if (e.OriginalSource is Button)
                return;

            if (_isCapturing)
            {
                StopCapture();
                e.Handled = true;
            }
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            // Valider les coordonnées
            if (!int.TryParse(XTextBox.Text, out int x))
            {
                MessageBox.Show("La coordonnée X doit être un nombre entier.", "Erreur", MessageBoxButton.OK, MessageBoxImage.Warning);
                XTextBox.Focus();
                return;
            }

            if (!int.TryParse(YTextBox.Text, out int y))
            {
                MessageBox.Show("La coordonnée Y doit être un nombre entier.", "Erreur", MessageBoxButton.OK, MessageBoxImage.Warning);
                YTextBox.Focus();
                return;
            }

            // Récupérer le type d'action
            var selectedItem = ActionTypeComboBox.SelectedItem as ComboBoxItem;
            var actionTag = selectedItem?.Tag?.ToString() ?? "LeftClick";

            CoreInputs.MouseActionType actionType = actionTag switch
            {
                "LeftClick" => CoreInputs.MouseActionType.LeftClick,
                "RightClick" => CoreInputs.MouseActionType.RightClick,
                "MiddleClick" => CoreInputs.MouseActionType.MiddleClick,
                "DoubleLeftClick" => CoreInputs.MouseActionType.LeftClick, // Sera géré avec 2 actions
                "WheelUp" => CoreInputs.MouseActionType.WheelUp,
                "WheelDown" => CoreInputs.MouseActionType.WheelDown,
                "Move" => CoreInputs.MouseActionType.Move,
                _ => CoreInputs.MouseActionType.LeftClick
            };

            // Créer l'action
            string actionName = ActionNameTextBox.Text;
            if (string.IsNullOrWhiteSpace(actionName))
            {
                actionName = GetDefaultActionName(actionType);
            }

            ResultAction = new CoreInputs.MouseAction
            {
                Name = actionName,
                ActionType = actionType,
                X = x,
                Y = y
            };

            DialogResult = true;
            Close();
        }

        private string GetDefaultActionName(CoreInputs.MouseActionType actionType)
        {
            return actionType switch
            {
                CoreInputs.MouseActionType.LeftClick => "Clic gauche",
                CoreInputs.MouseActionType.RightClick => "Clic droit",
                CoreInputs.MouseActionType.MiddleClick => "Clic molette",
                CoreInputs.MouseActionType.WheelUp => "Molette haut",
                CoreInputs.MouseActionType.WheelDown => "Molette bas",
                CoreInputs.MouseActionType.Move => "Déplacer souris",
                _ => "Action souris"
            };
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isCapturing)
            {
                StopCapture();
            }
            DialogResult = false;
            Close();
        }

        protected override void OnClosed(EventArgs e)
        {
            if (_isCapturing)
            {
                StopCapture();
            }
            base.OnClosed(e);
        }

        // WinAPI pour obtenir la position du curseur
        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);
    }
}


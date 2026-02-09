using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Shell;
using MacroEngine.Core.Logging;

namespace MacroEngine.UI
{
    public partial class LogsWindow : Window
    {
        private readonly ObservableCollection<LogEntry> _logEntries;
        private readonly ILogger _logger;
        private bool _isInitializing = true;

        public LogsWindow(ObservableCollection<LogEntry> logEntries, ILogger logger)
        {
            _logEntries = logEntries ?? throw new ArgumentNullException(nameof(logEntries));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            
            InitializeComponent();

            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);
            
            // Initialiser la DataGrid
            LogsDataGrid.ItemsSource = _logEntries;
            
            // Filtrer les logs en fonction du niveau sélectionné
            FilterLogs();
            
            // Écouter les sélections pour afficher les détails
            LogsDataGrid.SelectionChanged += LogsDataGrid_SelectionChanged;
            
            // Marquer l'initialisation comme terminée
            _isInitializing = false;
        }

        private void LogLevelComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            // Ignorer l'événement pendant l'initialisation
            if (_isInitializing || _logger == null)
                return;
            
            if (LogLevelComboBox?.SelectedItem is ComboBoxItem item && item.Tag is string levelStr)
            {
                if (Enum.TryParse<LogLevel>(levelStr, out var level))
                {
                    _logger.MinimumLevel = level;
                    FilterLogs();
                }
            }
        }

        private void FilterLogs()
        {
            if (LogLevelComboBox?.SelectedItem is ComboBoxItem item && item.Tag is string levelStr)
            {
                if (Enum.TryParse<LogLevel>(levelStr, out var minLevel))
                {
                    var collectionView = System.Windows.Data.CollectionViewSource.GetDefaultView(_logEntries);
                    if (collectionView != null)
                    {
                        collectionView.Filter = entry =>
                        {
                            if (entry is LogEntry logEntry)
                            {
                                return logEntry.Level >= minLevel;
                            }
                            return false;
                        };
                    }
                }
            }
        }

        private void ClearLogs_Click(object sender, RoutedEventArgs e)
        {
            _logEntries.Clear();
            DetailsTextBlock.Text = string.Empty;
        }

        private void RefreshLogs_Click(object sender, RoutedEventArgs e)
        {
            FilterLogs();
            LogsDataGrid.Items.Refresh();
            
            // Auto-scroll si activé
            if (AutoScrollCheckBox.IsChecked == true && LogsDataGrid.Items.Count > 0)
            {
                LogsDataGrid.ScrollIntoView(LogsDataGrid.Items[LogsDataGrid.Items.Count - 1]);
            }
        }

        private void LogsDataGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (LogsDataGrid?.SelectedItem is LogEntry entry)
            {
                var details = entry.ToString();
                if (entry.Exception != null)
                {
                    details += $"\n\nException complète:\n{entry.Exception}";
                }
                if (DetailsTextBlock != null)
                {
                    DetailsTextBlock.Text = details;
                }
            }
            else
            {
                if (DetailsTextBlock != null)
                {
                    DetailsTextBlock.Text = string.Empty;
                }
            }
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                {
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                    UpdateMaximizeButtonContent();
                }
                else
                {
                    DragMove();
                }
            }
        }

        private void MinimizeButton_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void MaximizeButton_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            UpdateMaximizeButtonContent();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Hide();
        }

        private void UpdateMaximizeButtonContent()
        {
            if (MaximizeButton != null)
                MaximizeButton.Content = WindowState == WindowState.Maximized ? "❐" : "□";
        }

        protected override void OnStateChanged(EventArgs e)
        {
            base.OnStateChanged(e);
            UpdateMaximizeButtonContent();
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            // Cacher la fenêtre au lieu de la fermer pour pouvoir la rouvrir
            e.Cancel = true;
            Hide();
        }
    }
}


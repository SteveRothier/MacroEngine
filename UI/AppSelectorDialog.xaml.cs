using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;
using MacroEngine.Core.Processes;

namespace MacroEngine.UI
{
    /// <summary>
    /// Dialogue pour sélectionner les applications cibles d'une macro
    /// </summary>
    public partial class AppSelectorDialog : Window
    {
        private ObservableCollection<SelectableProcessInfo> _allProcesses = new ObservableCollection<SelectableProcessInfo>();
        private ObservableCollection<SelectableProcessInfo> _filteredProcesses = new ObservableCollection<SelectableProcessInfo>();
        private HashSet<string> _selectedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Liste des applications sélectionnées (noms de processus)
        /// </summary>
        public List<string> SelectedApplications
        {
            get => _selectedApps.ToList();
            set
            {
                _selectedApps = new HashSet<string>(value ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                UpdateSelectionState();
                UpdateSelectedAppsDisplay();
            }
        }

        public AppSelectorDialog()
        {
            InitializeComponent();
            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);
            ProcessListView.ItemsSource = _filteredProcesses;
            Loaded += (s, e) => _ = LoadProcessesAsync();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private static Brush? GetThemeBrush(string key)
        {
            return Application.Current.TryFindResource(key) as Brush;
        }

        private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Escape)
                return;
            if (Keyboard.FocusedElement is not TextBox)
                return;
            Focus();
            e.Handled = true;
        }

        private async Task LoadProcessesAsync()
        {
            var showAll = ShowAllProcessesCheckBox?.IsChecked == true;

            var processes = await Task.Run(() => showAll
                ? ProcessMonitor.GetAllProcesses()
                : ProcessMonitor.GetRunningProcesses());

            await Dispatcher.InvokeAsync(() =>
            {
                _allProcesses.Clear();
                _filteredProcesses.Clear();
                foreach (var process in processes)
                {
                    var selectableProcess = new SelectableProcessInfo
                    {
                        ProcessName = process.ProcessName,
                        ProcessId = process.ProcessId,
                        WindowTitle = process.WindowTitle,
                        ExecutablePath = process.ExecutablePath,
                        HasMainWindow = process.HasMainWindow,
                        Icon = process.Icon,
                        IsSelected = _selectedApps.Contains(process.ProcessName)
                    };
                    _allProcesses.Add(selectableProcess);
                }
                ApplyFilter();
                LoadingOverlay.Visibility = Visibility.Collapsed;
                ProcessListView.Visibility = Visibility.Visible;
                ProcessListView.IsEnabled = true;
            });
        }

        private void ShowLoadingState()
        {
            LoadingOverlay.Visibility = Visibility.Visible;
            ProcessListView.Visibility = Visibility.Collapsed;
            ProcessListView.IsEnabled = false;
        }

        private void ApplyFilter()
        {
            var searchText = SearchTextBox?.Text?.Trim().ToLower() ?? string.Empty;

            _filteredProcesses.Clear();
            foreach (var process in _allProcesses)
            {
                if (string.IsNullOrEmpty(searchText) ||
                    process.ProcessName.ToLower().Contains(searchText) ||
                    process.WindowTitle.ToLower().Contains(searchText))
                {
                    _filteredProcesses.Add(process);
                }
            }
        }

        private void UpdateSelectionState()
        {
            foreach (var process in _allProcesses)
            {
                process.IsSelected = _selectedApps.Contains(process.ProcessName);
            }
        }

        private void UpdateSelectedAppsDisplay()
        {
            SelectedAppsPanel.Children.Clear();

            if (SelectionCountText != null)
                SelectionCountText.Text = _selectedApps.Count == 0
                    ? " (aucune – macro disponible partout)"
                    : $" ({_selectedApps.Count} application{(_selectedApps.Count > 1 ? "s" : "")})";

            if (_selectedApps.Count == 0)
            {
                var noSel = new TextBlock
                {
                    Text = "Aucune application. La macro sera active dans toutes les applications.",
                    FontStyle = FontStyles.Italic
                };
                if (Application.Current.TryFindResource("TextMutedBrush") is Brush muted)
                    noSel.Foreground = muted;
                else
                    noSel.Foreground = Brushes.Gray;
                SelectedAppsPanel.Children.Add(noSel);
            }
            else
            {
                var tagBg = GetThemeBrush("AccentSecondaryBrush") ?? GetThemeBrush("BackgroundTertiaryBrush") ?? Brushes.LightGray;
                var tagFg = GetThemeBrush("TextOnAccentBrush") ?? Brushes.White;
                foreach (var app in _selectedApps.OrderBy(a => a))
                {
                    var border = new Border
                    {
                        Background = tagBg,
                        CornerRadius = new CornerRadius(4),
                        Padding = new Thickness(8, 4, 8, 4),
                        Margin = new Thickness(0, 0, 6, 6)
                    };

                    var stack = new StackPanel { Orientation = Orientation.Horizontal };
                    stack.Children.Add(new TextBlock { Text = app, VerticalAlignment = VerticalAlignment.Center, Foreground = tagFg });
                    var removeButton = new Button
                    {
                        Content = LucideIcons.CreateIcon(LucideIcons.Close, 10),
                        FontFamily = (FontFamily)Application.Current.FindResource("FontLucide"),
                        Padding = new Thickness(4, 0, 4, 0),
                        Margin = new Thickness(6, 0, 0, 0),
                        Background = Brushes.Transparent,
                        Foreground = tagFg,
                        BorderThickness = new Thickness(0),
                        Cursor = Cursors.Hand,
                        Tag = app
                    };
                    removeButton.Click += RemoveApp_Click;
                    stack.Children.Add(removeButton);

                    border.Child = stack;
                    SelectedAppsPanel.Children.Add(border);
                }
            }
        }

        private void RemoveApp_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string appName)
            {
                _selectedApps.Remove(appName);
                UpdateSelectionState();
                UpdateSelectedAppsDisplay();
            }
        }

        private void ProcessCheckBox_Click(object sender, RoutedEventArgs e)
        {
            if (sender is CheckBox checkBox && checkBox.DataContext is SelectableProcessInfo process)
            {
                if (process.IsSelected)
                {
                    _selectedApps.Add(process.ProcessName);
                }
                else
                {
                    _selectedApps.Remove(process.ProcessName);
                }
                UpdateSelectedAppsDisplay();
            }
        }

        private void SearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            ApplyFilter();
        }

        private async void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            ShowLoadingState();
            await LoadProcessesAsync();
        }

        private async void ShowAllProcessesCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            ShowLoadingState();
            await LoadProcessesAsync();
        }

        private void ManualProcessTextBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                AddManualProcess_Click(sender, e);
                e.Handled = true;
            }
        }

        private void AddManualProcess_Click(object sender, RoutedEventArgs e)
        {
            var processName = ManualProcessTextBox.Text?.Trim();
            if (!string.IsNullOrEmpty(processName))
            {
                // Retirer l'extension .exe si présente
                if (processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                {
                    processName = processName.Substring(0, processName.Length - 4);
                }

                if (!_selectedApps.Contains(processName))
                {
                    _selectedApps.Add(processName);
                    UpdateSelectionState();
                    UpdateSelectedAppsDisplay();
                }
                ManualProcessTextBox.Clear();
            }
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }

    /// <summary>
    /// ProcessInfo avec état de sélection pour la ListView
    /// </summary>
    public class SelectableProcessInfo : INotifyPropertyChanged
    {
        private bool _isSelected;

        public string ProcessName { get; set; } = string.Empty;
        public int ProcessId { get; set; }
        public string WindowTitle { get; set; } = string.Empty;
        public string ExecutablePath { get; set; } = string.Empty;
        public bool HasMainWindow { get; set; }
        public System.Windows.Media.ImageSource? Icon { get; set; }

        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                if (_isSelected != value)
                {
                    _isSelected = value;
                    PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsSelected)));
                }
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
    }
}


using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;
using System.Windows.Threading;
using MacroEngine.Core.Processes;

namespace MacroEngine.UI
{
    /// <summary>
    /// Dialogue pour sélectionner les applications cibles d'une macro
    /// </summary>
    public partial class AppSelectorDialog : Window
    {
        public static readonly DependencyProperty ProcessListContentWidthProperty = DependencyProperty.Register(
            nameof(ProcessListContentWidth), typeof(double), typeof(AppSelectorDialog), new PropertyMetadata(2000.0));

        /// <summary>Largeur totale des colonnes (pour aligner le hover).</summary>
        public double ProcessListContentWidth
        {
            get => (double)GetValue(ProcessListContentWidthProperty);
            set => SetValue(ProcessListContentWidthProperty, value);
        }

        private ObservableCollection<SelectableProcessInfo> _allProcesses = new ObservableCollection<SelectableProcessInfo>();
        private ObservableCollection<SelectableProcessInfo> _filteredProcesses = new ObservableCollection<SelectableProcessInfo>();
        private HashSet<string> _selectedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private bool _syncingSelection;
        private DispatcherTimer? _searchDebounceTimer;
        private const int SearchDebounceMs = 250;
        private static readonly Regex ValidProcessNameRegex = new(@"^[a-zA-Z0-9_.\-]{1,260}$", RegexOptions.Compiled);

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
            var listView = ProcessListView;
            var view = (ICollectionView)CollectionViewSource.GetDefaultView(_filteredProcesses);
            listView.ItemsSource = view;
            var icon = LucideIcons.CreateIcon(LucideIcons.RefreshCcw, 14);
            if (TryFindResource("TextSecondaryBrush") is System.Windows.Media.Brush brush)
                icon.Foreground = brush;
            RefreshButton.Content = icon;
            var addIcon = LucideIcons.CreateIcon(LucideIcons.Plus, 14);
            if (TryFindResource("TextSecondaryBrush") is System.Windows.Media.Brush addBrush)
                addIcon.Foreground = addBrush;
            AddProcessButton.Content = addIcon;
            Loaded += (s, e) =>
            {
                UpdateColumnWidths();
                _ = LoadProcessesAsync();
            };
            AddHandler(GridViewColumnHeader.ClickEvent, (RoutedEventHandler)ColumnHeader_Click);
        }

        private void ProcessListView_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            UpdateColumnWidths();
        }

        private void ColumnHeader_Click(object sender, RoutedEventArgs e)
        {
            if (e.OriginalSource is not GridViewColumnHeader header || header.Column == null)
                return;
            var view = (ICollectionView)CollectionViewSource.GetDefaultView(_filteredProcesses);
            var prop = header.Column.Header switch
            {
                "Processus" => "ProcessName",
                "Fenêtre" => "WindowTitle",
                "PID" => "ProcessId",
                _ => null
            };
            if (prop == null) return;
            var dir = ListSortDirection.Ascending;
            var current = view.SortDescriptions.FirstOrDefault(s => s.PropertyName == prop);
            if (current.PropertyName == prop && current.Direction == ListSortDirection.Ascending)
                dir = ListSortDirection.Descending;
            view.SortDescriptions.Clear();
            view.SortDescriptions.Add(new SortDescription(prop, dir));
        }

        private void UpdateColumnWidths()
        {
            if (ProcessusColumn == null || FenetreColumn == null || PidColumn == null || ProcessListView == null)
                return;
            var scrollBarWidth = SystemParameters.VerticalScrollBarWidth;
            var checkboxWidth = 32;
            var padding = 8;
            var available = ProcessListView.ActualWidth - checkboxWidth - scrollBarWidth - padding;
            if (available > 120)
            {
                var pidWidth = 68.0;
                var remaining = available - pidWidth;
                ProcessusColumn.Width = remaining * 0.4;
                FenetreColumn.Width = remaining * 0.6;
                PidColumn.Width = pidWidth;
            }
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
            List<ProcessInfo>? processes = null;
            Exception? loadError = null;

            try
            {
                processes = await Task.Run(() =>
                {
                    var list = showAll
                        ? ProcessMonitor.GetAllProcesses()
                        : ProcessMonitor.GetRunningProcesses();
                    // Pré-charger les icônes en arrière-plan pour éviter de bloquer l'UI
                    foreach (var p in list)
                        _ = p.Icon;
                    return list;
                });
            }
            catch (Exception ex)
            {
                loadError = ex;
            }

            if (loadError != null)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                    ProcessListView.Visibility = Visibility.Visible;
                    ProcessListView.IsEnabled = true;
                    MessageBox.Show(this,
                        $"Impossible de charger la liste des processus :\n{loadError!.Message}",
                        "Erreur",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                });
                return;
            }
            if (processes == null) return;

            _syncingSelection = true;
            try
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    _allProcesses.Clear();
                    _filteredProcesses.Clear();
                });

                const int chunkSize = 80;
                for (int i = 0; i < processes.Count; i += chunkSize)
                {
                    var chunk = processes.Skip(i).Take(chunkSize).ToList();
                    await Dispatcher.InvokeAsync(() =>
                    {
                        foreach (var process in chunk)
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
                    }, DispatcherPriority.Background);

                    if (i + chunkSize < processes.Count)
                        await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
                }

                await Dispatcher.InvokeAsync(() =>
                {
                    ApplyFilter();
                    SyncListViewSelection();
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                    ProcessListView.Visibility = Visibility.Visible;
                    ProcessListView.IsEnabled = true;
                    UpdateColumnWidths();
                    UpdateSelectedAppsDisplay();
                });
            }
            finally
            {
                _syncingSelection = false;
            }
        }

        private void ShowLoadingState()
        {
            LoadingOverlay.Visibility = Visibility.Visible;
            ProcessListView.Visibility = Visibility.Collapsed;
            ProcessListView.IsEnabled = false;
        }

        private void DebounceApplyFilter()
        {
            _searchDebounceTimer?.Stop();
            _searchDebounceTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(SearchDebounceMs)
            };
            _searchDebounceTimer.Tick += (s, _) =>
            {
                _searchDebounceTimer?.Stop();
                ApplyFilter();
            };
            _searchDebounceTimer.Start();
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
                var chipBg = GetThemeBrush("BackgroundSecondaryBrush") ?? GetThemeBrush("BackgroundTertiaryBrush") ?? Brushes.LightGray;
                var chipBorder = GetThemeBrush("BorderLightBrush") ?? Brushes.DarkGray;
                var chipFg = GetThemeBrush("TextPrimaryBrush") ?? Brushes.White;
                var removeFg = GetThemeBrush("TextSecondaryBrush") ?? Brushes.Gray;

                foreach (var app in _selectedApps.OrderBy(a => a))
                {
                    var border = new Border
                    {
                        Background = chipBg,
                        BorderBrush = chipBorder,
                        BorderThickness = new Thickness(1),
                        CornerRadius = new CornerRadius(4),
                        Padding = new Thickness(6, 4, 4, 4),
                        Margin = new Thickness(0, 0, 6, 6)
                    };

                    var stack = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
                    var icon = _allProcesses.FirstOrDefault(p => string.Equals(p.ProcessName, app, StringComparison.OrdinalIgnoreCase))?.Icon;
                    if (icon != null)
                    {
                        var img = new Image
                        {
                            Source = icon,
                            Width = 14,
                            Height = 14,
                            Stretch = Stretch.Uniform,
                            Margin = new Thickness(0, 0, 6, 0),
                            VerticalAlignment = VerticalAlignment.Center
                        };
                        RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                        stack.Children.Add(img);
                    }
                    stack.Children.Add(new TextBlock
                    {
                        Text = app,
                        VerticalAlignment = VerticalAlignment.Center,
                        Foreground = chipFg,
                        FontSize = 12
                    });
                    var removeButton = new Button
                    {
                        Foreground = removeFg ?? Brushes.Gray,
                        Background = Brushes.Transparent,
                        BorderThickness = new Thickness(0),
                        Padding = new Thickness(0),
                        Cursor = Cursors.Hand,
                        Tag = app,
                        Margin = new Thickness(4, 0, 0, 0),
                        Width = 18,
                        Height = 18
                    };
                    if (TryFindResource("ChipRemoveButtonStyle") is Style chipRemoveStyle)
                        removeButton.Style = chipRemoveStyle;
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

        private void ProcessListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_syncingSelection) return;
            _selectedApps.Clear();
            if (ProcessListView?.SelectedItems != null)
            {
                foreach (var item in ProcessListView.SelectedItems)
                {
                    if (item is SelectableProcessInfo process)
                        _selectedApps.Add(process.ProcessName);
                }
            }
            UpdateSelectionState();
            UpdateSelectedAppsDisplay();
        }

        private void SyncListViewSelection()
        {
            if (ProcessListView == null) return;
            _syncingSelection = true;
            try
            {
                ProcessListView.SelectedItems.Clear();
                foreach (var process in _filteredProcesses)
                {
                    if (process.IsSelected)
                        ProcessListView.SelectedItems.Add(process);
                }
            }
            finally
            {
                _syncingSelection = false;
            }
        }

        private void ProcessCheckBox_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not CheckBox checkBox || checkBox.DataContext is not SelectableProcessInfo process)
                return;
            if (ProcessListView == null) return;

            if (process.IsSelected)
            {
                _selectedApps.Add(process.ProcessName);
                if (_filteredProcesses.Contains(process))
                    ProcessListView.SelectedItems.Add(process);
            }
            else
            {
                _selectedApps.Remove(process.ProcessName);
                ProcessListView.SelectedItems.Remove(process);
            }
            UpdateSelectedAppsDisplay();
        }

        private void SearchTextBox_GotFocus(object sender, RoutedEventArgs e) =>
            SetSearchBarBorderFocus(true);

        private void SearchTextBox_LostFocus(object sender, RoutedEventArgs e) =>
            SetSearchBarBorderFocus(false);

        private void SetSearchBarBorderFocus(bool focused)
        {
            if (SearchBarBorder == null) return;
            var key = focused ? "BorderFocusBrush" : "BorderLightBrush";
            if (TryFindResource(key) is System.Windows.Media.Brush brush)
                SearchBarBorder.BorderBrush = brush;
        }

        private void SearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (SearchPlaceholder != null)
                SearchPlaceholder.Visibility = string.IsNullOrWhiteSpace(SearchTextBox?.Text) ? Visibility.Visible : Visibility.Collapsed;
            DebounceApplyFilter();
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

        private void ManualProcessTextBox_GotFocus(object sender, RoutedEventArgs e) =>
            SetAddProcessBarBorderFocus(true);

        private void ManualProcessTextBox_LostFocus(object sender, RoutedEventArgs e) =>
            SetAddProcessBarBorderFocus(false);

        private void SetAddProcessBarBorderFocus(bool focused)
        {
            if (AddProcessBarBorder == null) return;
            var key = focused ? "BorderFocusBrush" : "BorderLightBrush";
            if (TryFindResource(key) is System.Windows.Media.Brush brush)
                AddProcessBarBorder.BorderBrush = brush;
        }

        private void ManualProcessTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (AddProcessPlaceholder != null)
                AddProcessPlaceholder.Visibility = string.IsNullOrWhiteSpace(ManualProcessTextBox?.Text) ? Visibility.Visible : Visibility.Collapsed;
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
            var raw = ManualProcessTextBox.Text?.Trim();
            if (string.IsNullOrEmpty(raw)) return;

            var processName = raw.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                ? raw.Substring(0, raw.Length - 4)
                : raw;

            if (processName.Length == 0)
                return;

            if (!ValidProcessNameRegex.IsMatch(processName))
            {
                MessageBox.Show(this,
                    "Nom de processus invalide. Utilisez uniquement des lettres, chiffres, tirets, points et underscores.",
                    "Nom invalide",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            if (!_selectedApps.Contains(processName))
            {
                _selectedApps.Add(processName);
                UpdateSelectionState();
                UpdateSelectedAppsDisplay();
            }
            ManualProcessTextBox.Clear();
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
}


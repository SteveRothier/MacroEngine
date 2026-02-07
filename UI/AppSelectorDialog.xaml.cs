using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
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
            ProcessListView.ItemsSource = _filteredProcesses;
            LoadProcesses();
        }

        private void LoadProcesses()
        {
            _allProcesses.Clear();
            _filteredProcesses.Clear();

            var showAll = ShowAllProcessesCheckBox?.IsChecked == true;
            var processes = showAll 
                ? ProcessMonitor.GetAllProcesses() 
                : ProcessMonitor.GetRunningProcesses();

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

            if (_selectedApps.Count == 0)
            {
                SelectedAppsPanel.Children.Add(new TextBlock
                {
                    Text = "Aucune application sélectionnée (la macro sera disponible partout)",
                    Foreground = System.Windows.Media.Brushes.Gray,
                    FontStyle = FontStyles.Italic
                });
            }
            else
            {
                foreach (var app in _selectedApps.OrderBy(a => a))
                {
                    var border = new Border
                    {
                        Background = System.Windows.Media.Brushes.LightBlue,
                        CornerRadius = new CornerRadius(3),
                        Padding = new Thickness(5, 2, 5, 2),
                        Margin = new Thickness(0, 0, 5, 5)
                    };

                    var stack = new StackPanel { Orientation = Orientation.Horizontal };
                    stack.Children.Add(new TextBlock { Text = app, VerticalAlignment = VerticalAlignment.Center });
                    
                    var removeButton = new Button
                    {
                        Content = LucideIcons.CreateIcon(LucideIcons.Close, 10),
                        FontSize = 10,
                        Padding = new Thickness(3, 0, 3, 0),
                        Margin = new Thickness(5, 0, 0, 0),
                        Background = System.Windows.Media.Brushes.Transparent,
                        BorderThickness = new Thickness(0),
                        Cursor = System.Windows.Input.Cursors.Hand,
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

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            LoadProcesses();
        }

        private void ShowAllProcessesCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            LoadProcesses();
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


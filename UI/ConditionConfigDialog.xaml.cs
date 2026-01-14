using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Processes;

namespace MacroEngine.UI
{
    public partial class ConditionConfigDialog : Window
    {
        public IfAction? Result { get; private set; }
        private IfAction _originalAction;

        public ConditionConfigDialog(IfAction ifAction)
        {
            InitializeComponent();
            _originalAction = ifAction;
            
            // Créer une copie pour l'édition
            Result = ifAction.Clone() as IfAction;
            
            if (Result == null)
            {
                Result = new IfAction();
            }

            LoadConfiguration();
        }

        private void LoadConfiguration()
        {
            ConfigContentPanel.Children.Clear();

            switch (Result!.ConditionType)
            {
                case ConditionType.Boolean:
                    CreateBooleanConfig();
                    break;
                case ConditionType.ActiveApplication:
                    CreateActiveApplicationConfig();
                    break;
                case ConditionType.KeyboardKey:
                    CreateKeyboardKeyConfig();
                    break;
                case ConditionType.ProcessRunning:
                    CreateProcessRunningConfig();
                    break;
                case ConditionType.PixelColor:
                    CreatePixelColorConfig();
                    break;
                case ConditionType.MousePosition:
                    CreateMousePositionConfig();
                    break;
                case ConditionType.TimeDate:
                    CreateTimeDateConfig();
                    break;
                case ConditionType.ImageOnScreen:
                    CreateImageOnScreenConfig();
                    break;
                case ConditionType.TextOnScreen:
                    CreateTextOnScreenConfig();
                    break;
            }
        }

        private void CreateBooleanConfig()
        {
            var checkBox = new CheckBox
            {
                Content = "Condition vraie",
                IsChecked = Result!.Condition,
                FontSize = 14
            };
            
            checkBox.Checked += (s, e) => Result!.Condition = true;
            checkBox.Unchecked += (s, e) => Result!.Condition = false;
            
            ConfigContentPanel.Children.Add(checkBox);
        }

        private void CreateActiveApplicationConfig()
        {
            if (Result!.ActiveApplicationConfig == null)
                Result.ActiveApplicationConfig = new ActiveApplicationCondition();

            // Initialiser la liste si vide (compatibilité avec l'ancien format)
            if (Result.ActiveApplicationConfig.ProcessNames == null || Result.ActiveApplicationConfig.ProcessNames.Count == 0)
            {
                if (!string.IsNullOrEmpty(Result.ActiveApplicationConfig.ProcessName))
                {
                    Result.ActiveApplicationConfig.ProcessNames = new List<string> { Result.ActiveApplicationConfig.ProcessName };
                }
                else
                {
                    Result.ActiveApplicationConfig.ProcessNames = new List<string>();
                }
            }

            var selectedProcessNames = new HashSet<string>(Result.ActiveApplicationConfig.ProcessNames, StringComparer.OrdinalIgnoreCase);
            var allProcesses = new ObservableCollection<SelectableProcessInfo>();
            var filteredProcesses = new ObservableCollection<SelectableProcessInfo>();

            // Description
            var descriptionText = new TextBlock
            {
                Text = "Sélectionnez les applications pour lesquelles cette condition sera vraie.",
                Foreground = new SolidColorBrush(Colors.Gray),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 10),
                FontSize = 12
            };
            ConfigContentPanel.Children.Add(descriptionText);

            // Barre de recherche
            var searchGrid = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            searchGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            searchGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var searchTextBox = new TextBox
            {
                Padding = new Thickness(5),
                FontSize = 12
            };
            searchTextBox.TextChanged += (s, e) =>
            {
                var searchText = searchTextBox.Text?.Trim().ToLower() ?? string.Empty;
                filteredProcesses.Clear();
                foreach (var process in allProcesses)
                {
                    if (string.IsNullOrEmpty(searchText) ||
                        process.ProcessName.ToLower().Contains(searchText) ||
                        process.WindowTitle.ToLower().Contains(searchText))
                    {
                        filteredProcesses.Add(process);
                    }
                }
            };
            Grid.SetColumn(searchTextBox, 0);
            searchGrid.Children.Add(searchTextBox);

            var refreshButton = new Button
            {
                Content = "🔄 Actualiser",
                Padding = new Thickness(10, 5, 10, 5),
                Margin = new Thickness(5, 0, 0, 0),
                FontSize = 12
            };
            Grid.SetColumn(refreshButton, 1);
            searchGrid.Children.Add(refreshButton);
            ConfigContentPanel.Children.Add(searchGrid);

            // Checkbox pour afficher tous les processus
            var showAllCheckBox = new CheckBox
            {
                Content = "Afficher tous les processus (y compris sans fenêtre)",
                Margin = new Thickness(0, 0, 0, 5),
                FontSize = 12
            };
            ConfigContentPanel.Children.Add(showAllCheckBox);

            // Applications sélectionnées (déclarer avant les fonctions locales)
            var selectedAppsPanel = new WrapPanel
            {
                MinHeight = 30,
                Margin = new Thickness(0, 0, 0, 10)
            };

            // ListView pour les processus
            var processListView = new ListView
            {
                SelectionMode = SelectionMode.Multiple,
                MaxHeight = 200,
                Margin = new Thickness(0, 0, 0, 10)
            };

            var gridView = new GridView();
            var checkBoxColumn = new GridViewColumn { Width = 30 };
            checkBoxColumn.CellTemplate = new DataTemplate();
            var checkBoxFactory = new FrameworkElementFactory(typeof(CheckBox));
            checkBoxFactory.SetBinding(CheckBox.IsCheckedProperty, new System.Windows.Data.Binding("IsSelected") { Mode = System.Windows.Data.BindingMode.TwoWay });
            checkBoxFactory.AddHandler(CheckBox.ClickEvent, new RoutedEventHandler((s, e) =>
            {
                if (s is CheckBox cb && cb.DataContext is SelectableProcessInfo process)
                {
                    if (process.IsSelected)
                        selectedProcessNames.Add(process.ProcessName);
                    else
                        selectedProcessNames.Remove(process.ProcessName);
                    UpdateSelectedAppsDisplay();
                }
            }));
            checkBoxColumn.CellTemplate.VisualTree = checkBoxFactory;

            var processColumn = new GridViewColumn { Header = "Processus", Width = 180 };
            processColumn.CellTemplate = new DataTemplate();
            var stackFactory = new FrameworkElementFactory(typeof(StackPanel));
            stackFactory.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);

            var imageFactory = new FrameworkElementFactory(typeof(System.Windows.Controls.Image));
            imageFactory.SetBinding(System.Windows.Controls.Image.SourceProperty, new System.Windows.Data.Binding("Icon"));
            imageFactory.SetValue(System.Windows.Controls.Image.WidthProperty, 16.0);
            imageFactory.SetValue(System.Windows.Controls.Image.HeightProperty, 16.0);
            imageFactory.SetValue(System.Windows.Controls.Image.MarginProperty, new Thickness(0, 0, 6, 0));
            imageFactory.SetValue(RenderOptions.BitmapScalingModeProperty, BitmapScalingMode.HighQuality);
            stackFactory.AppendChild(imageFactory);

            var textFactory = new FrameworkElementFactory(typeof(TextBlock));
            textFactory.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("ProcessName"));
            textFactory.SetValue(TextBlock.VerticalAlignmentProperty, VerticalAlignment.Center);
            stackFactory.AppendChild(textFactory);

            processColumn.CellTemplate.VisualTree = stackFactory;

            var windowColumn = new GridViewColumn { Header = "Fenêtre", Width = 220 };
            windowColumn.DisplayMemberBinding = new System.Windows.Data.Binding("WindowTitle");

            var pidColumn = new GridViewColumn { Header = "PID", Width = 60 };
            pidColumn.DisplayMemberBinding = new System.Windows.Data.Binding("ProcessId");

            gridView.Columns.Add(checkBoxColumn);
            gridView.Columns.Add(processColumn);
            gridView.Columns.Add(windowColumn);
            gridView.Columns.Add(pidColumn);
            processListView.View = gridView;
            processListView.ItemsSource = filteredProcesses;

            ConfigContentPanel.Children.Add(processListView);

            // Applications sélectionnées
            var selectedLabel = new TextBlock
            {
                Text = "Applications sélectionnées:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 5, 0, 5)
            };
            ConfigContentPanel.Children.Add(selectedLabel);
            ConfigContentPanel.Children.Add(selectedAppsPanel);

            void UpdateSelectedAppsDisplay()
            {
                selectedAppsPanel.Children.Clear();
                Result.ActiveApplicationConfig!.ProcessNames = selectedProcessNames.ToList();

                if (selectedProcessNames.Count == 0)
                {
                    selectedAppsPanel.Children.Add(new TextBlock
                    {
                        Text = "Aucune application sélectionnée",
                        Foreground = new SolidColorBrush(Colors.Gray),
                        FontStyle = FontStyles.Italic
                    });
                }
                else
                {
                    foreach (var app in selectedProcessNames.OrderBy(a => a))
                    {
                        var border = new Border
                        {
                            Background = new SolidColorBrush(Color.FromRgb(173, 216, 230)),
                            CornerRadius = new CornerRadius(3),
                            Padding = new Thickness(5, 2, 5, 2),
                            Margin = new Thickness(0, 0, 5, 5)
                        };

                        var stack = new StackPanel { Orientation = Orientation.Horizontal };
                        stack.Children.Add(new TextBlock { Text = app, VerticalAlignment = VerticalAlignment.Center });

                        var removeButton = new Button
                        {
                            Content = "✕",
                            FontSize = 10,
                            Padding = new Thickness(3, 0, 3, 0),
                            Margin = new Thickness(5, 0, 0, 0),
                            Background = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            Cursor = System.Windows.Input.Cursors.Hand,
                            Tag = app
                        };
                        removeButton.Click += (s, e) =>
                        {
                            if (s is Button btn && btn.Tag is string appName)
                            {
                                selectedProcessNames.Remove(appName);
                                UpdateSelectionState();
                                UpdateSelectedAppsDisplay();
                            }
                        };
                        stack.Children.Add(removeButton);
                        border.Child = stack;
                        selectedAppsPanel.Children.Add(border);
                    }
                }
            }

            void UpdateSelectionState()
            {
                foreach (var process in allProcesses)
                {
                    process.IsSelected = selectedProcessNames.Contains(process.ProcessName);
                }
            }

            void LoadProcesses()
            {
                allProcesses.Clear();
                filteredProcesses.Clear();

                var processes = (showAllCheckBox.IsChecked == true)
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
                        IsSelected = selectedProcessNames.Contains(process.ProcessName)
                    };
                    allProcesses.Add(selectableProcess);
                }

                var searchText = searchTextBox.Text?.Trim().ToLower() ?? string.Empty;
                foreach (var process in allProcesses)
                {
                    if (string.IsNullOrEmpty(searchText) ||
                        process.ProcessName.ToLower().Contains(searchText) ||
                        process.WindowTitle.ToLower().Contains(searchText))
                    {
                        filteredProcesses.Add(process);
                    }
                }
            }

            // Ajout manuel de processus
            var manualGrid = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var manualLabel = new TextBlock
            {
                Text = "Ou entrez manuellement:",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 5, 0),
                FontSize = 12
            };
            Grid.SetColumn(manualLabel, 0);
            manualGrid.Children.Add(manualLabel);

            var manualTextBox = new TextBox
            {
                Padding = new Thickness(3),
                FontSize = 12,
                Margin = new Thickness(0, 0, 5, 0)
            };
            Grid.SetColumn(manualTextBox, 1);
            manualGrid.Children.Add(manualTextBox);

            var addButton = new Button
            {
                Content = "Ajouter",
                Padding = new Thickness(10, 3, 10, 3),
                FontSize = 12
            };
            addButton.Click += (s, e) =>
            {
                var processName = manualTextBox.Text?.Trim();
                if (!string.IsNullOrEmpty(processName))
                {
                    if (processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        processName = processName.Substring(0, processName.Length - 4);

                    if (!selectedProcessNames.Contains(processName))
                    {
                        selectedProcessNames.Add(processName);
                        UpdateSelectionState();
                        UpdateSelectedAppsDisplay();
                    }
                    manualTextBox.Clear();
                }
            };
            Grid.SetColumn(addButton, 2);
            manualGrid.Children.Add(addButton);
            ConfigContentPanel.Children.Add(manualGrid);

            // Titre de la fenêtre (optionnel)
            var titleLabel = new TextBlock
            {
                Text = "Titre de la fenêtre (optionnel):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(titleLabel);

            var titleTextBox = new TextBox
            {
                Text = Result.ActiveApplicationConfig.WindowTitle ?? "",
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 8)
            };
            titleTextBox.TextChanged += (s, e) =>
            {
                Result.ActiveApplicationConfig!.WindowTitle = titleTextBox.Text;
            };
            ConfigContentPanel.Children.Add(titleTextBox);

            // Mode de correspondance
            var matchModeLabel = new TextBlock
            {
                Text = "Mode de correspondance:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(matchModeLabel);

            var matchModeComboBox = new ComboBox
            {
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 8)
            };
            matchModeComboBox.Items.Add("Exact");
            matchModeComboBox.Items.Add("Contient");
            matchModeComboBox.SelectedIndex = (int)Result.ActiveApplicationConfig.TitleMatchMode;
            matchModeComboBox.SelectionChanged += (s, e) =>
            {
                if (matchModeComboBox.SelectedIndex >= 0)
                    Result.ActiveApplicationConfig!.TitleMatchMode = (TextMatchMode)matchModeComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(matchModeComboBox);

            // Option "Peu importe la fenêtre active"
            var anyWindowCheckBox = new CheckBox
            {
                Content = "Peu importe la fenêtre active (vérifie juste si le processus existe)",
                IsChecked = Result.ActiveApplicationConfig.AnyWindow,
                FontSize = 12,
                Margin = new Thickness(0, 8, 0, 0)
            };
            anyWindowCheckBox.Checked += (s, e) => Result.ActiveApplicationConfig!.AnyWindow = true;
            anyWindowCheckBox.Unchecked += (s, e) => Result.ActiveApplicationConfig!.AnyWindow = false;
            ConfigContentPanel.Children.Add(anyWindowCheckBox);

            // Configurer les événements
            refreshButton.Click += (s, e) => LoadProcesses();
            showAllCheckBox.Checked += (s, e) => LoadProcesses();
            showAllCheckBox.Unchecked += (s, e) => LoadProcesses();

            // Charger les processus au démarrage
            LoadProcesses();
            UpdateSelectedAppsDisplay();
        }

        private void CreateKeyboardKeyConfig()
        {
            if (Result!.KeyboardKeyConfig == null)
                Result.KeyboardKeyConfig = new KeyboardKeyCondition();

            // Sélecteur de touche
            var keyLabel = new TextBlock
            {
                Text = "Touche:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(keyLabel);

            var keyTextBox = new TextBox
            {
                Text = Result.KeyboardKeyConfig.VirtualKeyCode == 0 
                    ? "Appuyez sur une touche..." 
                    : GetKeyName(Result.KeyboardKeyConfig.VirtualKeyCode),
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12),
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromRgb(245, 245, 245)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(200, 200, 200)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(5),
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "Cliquez puis appuyez sur une touche pour la sélectionner"
            };

            bool keyCaptured = false;
            keyTextBox.GotFocus += (s, e) =>
            {
                if (!keyCaptured)
                {
                    keyTextBox.Text = "Appuyez sur une touche...";
                    keyTextBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 200));
                    keyTextBox.BorderBrush = new SolidColorBrush(Color.FromRgb(255, 165, 0));
                }
            };

            keyTextBox.PreviewKeyDown += (s, e) =>
            {
                // Ignorer les touches de modification seules
                if (e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                    e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                    e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                    e.Key == Key.LWin || e.Key == Key.RWin)
                {
                    e.Handled = true;
                    return;
                }

                // Ignorer Escape pour annuler
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                    if (!keyCaptured && Result.KeyboardKeyConfig.VirtualKeyCode == 0)
                    {
                        keyTextBox.Text = "Appuyez sur une touche...";
                        keyTextBox.Background = new SolidColorBrush(Color.FromRgb(245, 245, 245));
                        keyTextBox.BorderBrush = new SolidColorBrush(Color.FromRgb(200, 200, 200));
                    }
                    else
                    {
                        keyTextBox.Text = GetKeyName(Result.KeyboardKeyConfig.VirtualKeyCode);
                        keyTextBox.Background = new SolidColorBrush(Color.FromRgb(245, 245, 245));
                        keyTextBox.BorderBrush = new SolidColorBrush(Color.FromRgb(200, 200, 200));
                    }
                    return;
                }

                // Capturer la touche
                try
                {
                    int virtualKeyCode = KeyInterop.VirtualKeyFromKey(e.Key);
                    if (virtualKeyCode > 0)
                    {
                        Result.KeyboardKeyConfig!.VirtualKeyCode = (ushort)virtualKeyCode;
                        keyTextBox.Text = GetKeyName(Result.KeyboardKeyConfig.VirtualKeyCode);
                        keyCaptured = true;
                        keyTextBox.Background = new SolidColorBrush(Color.FromRgb(245, 245, 245));
                        keyTextBox.BorderBrush = new SolidColorBrush(Color.FromRgb(200, 200, 200));
                        e.Handled = true;
                        Keyboard.ClearFocus();
                    }
                }
                catch
                {
                    e.Handled = true;
                }
            };

            keyTextBox.LostFocus += (s, e) =>
            {
                if (!keyCaptured && Result.KeyboardKeyConfig.VirtualKeyCode == 0)
                {
                    keyTextBox.Text = "Appuyez sur une touche...";
                }
                else if (Result.KeyboardKeyConfig.VirtualKeyCode > 0)
                {
                    keyTextBox.Text = GetKeyName(Result.KeyboardKeyConfig.VirtualKeyCode);
                }
                keyTextBox.Background = new SolidColorBrush(Color.FromRgb(245, 245, 245));
                keyTextBox.BorderBrush = new SolidColorBrush(Color.FromRgb(200, 200, 200));
            };

            ConfigContentPanel.Children.Add(keyTextBox);

            // État de la touche
            var stateLabel = new TextBlock
            {
                Text = "État:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(stateLabel);

            var stateComboBox = new ComboBox
            {
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };
            stateComboBox.Items.Add("Maintenue");
            stateComboBox.Items.Add("Appuyée");
            stateComboBox.SelectedIndex = (int)Result.KeyboardKeyConfig.State;
            stateComboBox.SelectionChanged += (s, e) =>
            {
                if (stateComboBox.SelectedIndex >= 0)
                    Result.KeyboardKeyConfig!.State = (KeyState)stateComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(stateComboBox);

            // Modificateurs
            var modifiersLabel = new TextBlock
            {
                Text = "Modificateurs:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(modifiersLabel);

            var ctrlCheckBox = new CheckBox
            {
                Content = "Ctrl",
                IsChecked = Result.KeyboardKeyConfig.RequireCtrl,
                FontSize = 12
            };
            ctrlCheckBox.Checked += (s, e) => Result.KeyboardKeyConfig!.RequireCtrl = true;
            ctrlCheckBox.Unchecked += (s, e) => Result.KeyboardKeyConfig!.RequireCtrl = false;
            ConfigContentPanel.Children.Add(ctrlCheckBox);

            var altCheckBox = new CheckBox
            {
                Content = "Alt",
                IsChecked = Result.KeyboardKeyConfig.RequireAlt,
                FontSize = 12
            };
            altCheckBox.Checked += (s, e) => Result.KeyboardKeyConfig!.RequireAlt = true;
            altCheckBox.Unchecked += (s, e) => Result.KeyboardKeyConfig!.RequireAlt = false;
            ConfigContentPanel.Children.Add(altCheckBox);

            var shiftCheckBox = new CheckBox
            {
                Content = "Shift",
                IsChecked = Result.KeyboardKeyConfig.RequireShift,
                FontSize = 12
            };
            shiftCheckBox.Checked += (s, e) => Result.KeyboardKeyConfig!.RequireShift = true;
            shiftCheckBox.Unchecked += (s, e) => Result.KeyboardKeyConfig!.RequireShift = false;
            ConfigContentPanel.Children.Add(shiftCheckBox);
        }

        /// <summary>
        /// Convertit un code virtuel de touche en nom lisible
        /// </summary>
        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0)
                return "Aucune touche";

            return virtualKeyCode switch
            {
                0x08 => "Backspace",
                0x09 => "Tab",
                0x0C => "Clear",
                0x0D => "Enter",
                0x10 => "Shift",
                0x11 => "Ctrl",
                0x12 => "Alt",
                0x13 => "Pause",
                0x14 => "Caps Lock",
                0x1B => "Esc",
                0x20 => "Espace",
                0x21 => "Page Up",
                0x22 => "Page Down",
                0x23 => "End",
                0x24 => "Home",
                0x25 => "Flèche Gauche",
                0x26 => "Flèche Haut",
                0x27 => "Flèche Droite",
                0x28 => "Flèche Bas",
                0x2C => "Print Screen",
                0x2D => "Insert",
                0x2E => "Delete",
                0x30 => "0",
                0x31 => "1",
                0x32 => "2",
                0x33 => "3",
                0x34 => "4",
                0x35 => "5",
                0x36 => "6",
                0x37 => "7",
                0x38 => "8",
                0x39 => "9",
                0x41 => "A",
                0x42 => "B",
                0x43 => "C",
                0x44 => "D",
                0x45 => "E",
                0x46 => "F",
                0x47 => "G",
                0x48 => "H",
                0x49 => "I",
                0x4A => "J",
                0x4B => "K",
                0x4C => "L",
                0x4D => "M",
                0x4E => "N",
                0x4F => "O",
                0x50 => "P",
                0x51 => "Q",
                0x52 => "R",
                0x53 => "S",
                0x54 => "T",
                0x55 => "U",
                0x56 => "V",
                0x57 => "W",
                0x58 => "X",
                0x59 => "Y",
                0x5A => "Z",
                0x5B => "Windows Gauche",
                0x5C => "Windows Droit",
                0x5D => "Menu",
                0x60 => "Pavé numérique 0",
                0x61 => "Pavé numérique 1",
                0x62 => "Pavé numérique 2",
                0x63 => "Pavé numérique 3",
                0x64 => "Pavé numérique 4",
                0x65 => "Pavé numérique 5",
                0x66 => "Pavé numérique 6",
                0x67 => "Pavé numérique 7",
                0x68 => "Pavé numérique 8",
                0x69 => "Pavé numérique 9",
                0x6A => "Pavé numérique *",
                0x6B => "Pavé numérique +",
                0x6C => "Pavé numérique Entrée",
                0x6D => "Pavé numérique -",
                0x6E => "Pavé numérique .",
                0x6F => "Pavé numérique /",
                0x70 => "F1",
                0x71 => "F2",
                0x72 => "F3",
                0x73 => "F4",
                0x74 => "F5",
                0x75 => "F6",
                0x76 => "F7",
                0x77 => "F8",
                0x78 => "F9",
                0x79 => "F10",
                0x7A => "F11",
                0x7B => "F12",
                0x90 => "Num Lock",
                0x91 => "Scroll Lock",
                0xA0 => "Shift Gauche",
                0xA1 => "Shift Droit",
                0xA2 => "Ctrl Gauche",
                0xA3 => "Ctrl Droit",
                0xA4 => "Alt Gauche",
                0xA5 => "Alt Droit",
                0xBA => ";",
                0xBB => "=",
                0xBC => ",",
                0xBD => "-",
                0xBE => ":",
                0xBF => "!",
                0xC0 => "ù",
                0xDB => "[",
                0xDC => "\\",
                0xDD => "]",
                0xDE => "^",
                _ => $"Touche 0x{virtualKeyCode:X2}"
            };
        }

        private void CreateProcessRunningConfig()
        {
            if (Result!.ProcessRunningConfig == null)
                Result.ProcessRunningConfig = new ProcessRunningCondition();

            // Initialiser la liste si vide (compatibilité avec l'ancien format)
            if (Result.ProcessRunningConfig.ProcessNames == null || Result.ProcessRunningConfig.ProcessNames.Count == 0)
            {
                if (!string.IsNullOrEmpty(Result.ProcessRunningConfig.ProcessName))
                {
                    Result.ProcessRunningConfig.ProcessNames = new List<string> { Result.ProcessRunningConfig.ProcessName };
                }
                else
                {
                    Result.ProcessRunningConfig.ProcessNames = new List<string>();
                }
            }

            var selectedProcessNames = new HashSet<string>(Result.ProcessRunningConfig.ProcessNames, StringComparer.OrdinalIgnoreCase);
            var allProcesses = new ObservableCollection<SelectableProcessInfo>();
            var filteredProcesses = new ObservableCollection<SelectableProcessInfo>();

            // Description
            var descriptionText = new TextBlock
            {
                Text = "Sélectionnez les processus qui doivent être ouverts pour que cette condition soit vraie.",
                Foreground = new SolidColorBrush(Colors.Gray),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 10),
                FontSize = 12
            };
            ConfigContentPanel.Children.Add(descriptionText);

            // Barre de recherche
            var searchGrid = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            searchGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            searchGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var searchTextBox = new TextBox
            {
                Padding = new Thickness(5),
                FontSize = 12
            };
            searchTextBox.TextChanged += (s, e) =>
            {
                var searchText = searchTextBox.Text?.Trim().ToLower() ?? string.Empty;
                filteredProcesses.Clear();
                foreach (var process in allProcesses)
                {
                    if (string.IsNullOrEmpty(searchText) ||
                        process.ProcessName.ToLower().Contains(searchText) ||
                        process.WindowTitle.ToLower().Contains(searchText))
                    {
                        filteredProcesses.Add(process);
                    }
                }
            };
            Grid.SetColumn(searchTextBox, 0);
            searchGrid.Children.Add(searchTextBox);

            var refreshButton = new Button
            {
                Content = "🔄 Actualiser",
                Padding = new Thickness(10, 5, 10, 5),
                Margin = new Thickness(5, 0, 0, 0),
                FontSize = 12
            };
            Grid.SetColumn(refreshButton, 1);
            searchGrid.Children.Add(refreshButton);
            ConfigContentPanel.Children.Add(searchGrid);

            // Checkbox pour afficher tous les processus
            var showAllCheckBox = new CheckBox
            {
                Content = "Afficher tous les processus (y compris sans fenêtre)",
                Margin = new Thickness(0, 0, 0, 5),
                FontSize = 12
            };
            ConfigContentPanel.Children.Add(showAllCheckBox);

            // Applications sélectionnées (déclarer avant les fonctions locales)
            var selectedAppsPanel = new WrapPanel
            {
                MinHeight = 30,
                Margin = new Thickness(0, 0, 0, 10)
            };

            // ListView pour les processus
            var processListView = new ListView
            {
                SelectionMode = SelectionMode.Multiple,
                MaxHeight = 200,
                Margin = new Thickness(0, 0, 0, 10)
            };

            var gridView = new GridView();
            var checkBoxColumn = new GridViewColumn { Width = 30 };
            checkBoxColumn.CellTemplate = new DataTemplate();
            var checkBoxFactory = new FrameworkElementFactory(typeof(CheckBox));
            checkBoxFactory.SetBinding(CheckBox.IsCheckedProperty, new System.Windows.Data.Binding("IsSelected") { Mode = System.Windows.Data.BindingMode.TwoWay });
            checkBoxFactory.AddHandler(CheckBox.ClickEvent, new RoutedEventHandler((s, e) =>
            {
                if (s is CheckBox cb && cb.DataContext is SelectableProcessInfo process)
                {
                    if (process.IsSelected)
                        selectedProcessNames.Add(process.ProcessName);
                    else
                        selectedProcessNames.Remove(process.ProcessName);
                    UpdateSelectedAppsDisplay();
                }
            }));
            checkBoxColumn.CellTemplate.VisualTree = checkBoxFactory;

            var processColumn = new GridViewColumn { Header = "Processus", Width = 180 };
            processColumn.CellTemplate = new DataTemplate();
            var stackFactory = new FrameworkElementFactory(typeof(StackPanel));
            stackFactory.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);

            var imageFactory = new FrameworkElementFactory(typeof(System.Windows.Controls.Image));
            imageFactory.SetBinding(System.Windows.Controls.Image.SourceProperty, new System.Windows.Data.Binding("Icon"));
            imageFactory.SetValue(System.Windows.Controls.Image.WidthProperty, 16.0);
            imageFactory.SetValue(System.Windows.Controls.Image.HeightProperty, 16.0);
            imageFactory.SetValue(System.Windows.Controls.Image.MarginProperty, new Thickness(0, 0, 6, 0));
            imageFactory.SetValue(RenderOptions.BitmapScalingModeProperty, BitmapScalingMode.HighQuality);
            stackFactory.AppendChild(imageFactory);

            var textFactory = new FrameworkElementFactory(typeof(TextBlock));
            textFactory.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("ProcessName"));
            textFactory.SetValue(TextBlock.VerticalAlignmentProperty, VerticalAlignment.Center);
            stackFactory.AppendChild(textFactory);

            processColumn.CellTemplate.VisualTree = stackFactory;

            var windowColumn = new GridViewColumn { Header = "Fenêtre", Width = 220 };
            windowColumn.DisplayMemberBinding = new System.Windows.Data.Binding("WindowTitle");

            var pidColumn = new GridViewColumn { Header = "PID", Width = 60 };
            pidColumn.DisplayMemberBinding = new System.Windows.Data.Binding("ProcessId");

            gridView.Columns.Add(checkBoxColumn);
            gridView.Columns.Add(processColumn);
            gridView.Columns.Add(windowColumn);
            gridView.Columns.Add(pidColumn);
            processListView.View = gridView;
            processListView.ItemsSource = filteredProcesses;

            ConfigContentPanel.Children.Add(processListView);

            // Applications sélectionnées
            var selectedLabel = new TextBlock
            {
                Text = "Processus sélectionnés:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 5, 0, 5)
            };
            ConfigContentPanel.Children.Add(selectedLabel);
            ConfigContentPanel.Children.Add(selectedAppsPanel);

            void UpdateSelectedAppsDisplay()
            {
                selectedAppsPanel.Children.Clear();
                Result.ProcessRunningConfig!.ProcessNames = selectedProcessNames.ToList();

                if (selectedProcessNames.Count == 0)
                {
                    selectedAppsPanel.Children.Add(new TextBlock
                    {
                        Text = "Aucun processus sélectionné",
                        Foreground = new SolidColorBrush(Colors.Gray),
                        FontStyle = FontStyles.Italic
                    });
                }
                else
                {
                    foreach (var app in selectedProcessNames.OrderBy(a => a))
                    {
                        var border = new Border
                        {
                            Background = new SolidColorBrush(Color.FromRgb(173, 216, 230)),
                            CornerRadius = new CornerRadius(3),
                            Padding = new Thickness(5, 2, 5, 2),
                            Margin = new Thickness(0, 0, 5, 5)
                        };

                        var stack = new StackPanel { Orientation = Orientation.Horizontal };
                        stack.Children.Add(new TextBlock { Text = app, VerticalAlignment = VerticalAlignment.Center });

                        var removeButton = new Button
                        {
                            Content = "✕",
                            FontSize = 10,
                            Padding = new Thickness(3, 0, 3, 0),
                            Margin = new Thickness(5, 0, 0, 0),
                            Background = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            Cursor = System.Windows.Input.Cursors.Hand,
                            Tag = app
                        };
                        removeButton.Click += (s, e) =>
                        {
                            if (s is Button btn && btn.Tag is string appName)
                            {
                                selectedProcessNames.Remove(appName);
                                UpdateSelectionState();
                                UpdateSelectedAppsDisplay();
                            }
                        };
                        stack.Children.Add(removeButton);
                        border.Child = stack;
                        selectedAppsPanel.Children.Add(border);
                    }
                }
            }

            void UpdateSelectionState()
            {
                foreach (var process in allProcesses)
                {
                    process.IsSelected = selectedProcessNames.Contains(process.ProcessName);
                }
            }

            void LoadProcesses()
            {
                allProcesses.Clear();
                filteredProcesses.Clear();

                var processes = (showAllCheckBox.IsChecked == true)
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
                        IsSelected = selectedProcessNames.Contains(process.ProcessName)
                    };
                    allProcesses.Add(selectableProcess);
                }

                var searchText = searchTextBox.Text?.Trim().ToLower() ?? string.Empty;
                foreach (var process in allProcesses)
                {
                    if (string.IsNullOrEmpty(searchText) ||
                        process.ProcessName.ToLower().Contains(searchText) ||
                        process.WindowTitle.ToLower().Contains(searchText))
                    {
                        filteredProcesses.Add(process);
                    }
                }
            }

            // Ajout manuel de processus
            var manualGrid = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            manualGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var manualLabel = new TextBlock
            {
                Text = "Ou entrez manuellement:",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 5, 0),
                FontSize = 12
            };
            Grid.SetColumn(manualLabel, 0);
            manualGrid.Children.Add(manualLabel);

            var manualTextBox = new TextBox
            {
                Padding = new Thickness(3),
                FontSize = 12,
                Margin = new Thickness(0, 0, 5, 0)
            };
            Grid.SetColumn(manualTextBox, 1);
            manualGrid.Children.Add(manualTextBox);

            var addButton = new Button
            {
                Content = "Ajouter",
                Padding = new Thickness(10, 3, 10, 3),
                FontSize = 12
            };
            addButton.Click += (s, e) =>
            {
                var processName = manualTextBox.Text?.Trim();
                if (!string.IsNullOrEmpty(processName))
                {
                    if (processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        processName = processName.Substring(0, processName.Length - 4);

                    if (!selectedProcessNames.Contains(processName))
                    {
                        selectedProcessNames.Add(processName);
                        UpdateSelectionState();
                        UpdateSelectedAppsDisplay();
                    }
                    manualTextBox.Clear();
                }
            };
            Grid.SetColumn(addButton, 2);
            manualGrid.Children.Add(addButton);
            ConfigContentPanel.Children.Add(manualGrid);

            // Option "Peu importe la fenêtre active"
            var anyWindowCheckBox = new CheckBox
            {
                Content = "Peu importe la fenêtre active",
                IsChecked = Result.ProcessRunningConfig.AnyWindow,
                FontSize = 12,
                Margin = new Thickness(0, 8, 0, 0)
            };
            anyWindowCheckBox.Checked += (s, e) => Result.ProcessRunningConfig!.AnyWindow = true;
            anyWindowCheckBox.Unchecked += (s, e) => Result.ProcessRunningConfig!.AnyWindow = false;
            ConfigContentPanel.Children.Add(anyWindowCheckBox);

            // Configurer les événements
            refreshButton.Click += (s, e) => LoadProcesses();
            showAllCheckBox.Checked += (s, e) => LoadProcesses();
            showAllCheckBox.Unchecked += (s, e) => LoadProcesses();

            // Charger les processus au démarrage
            LoadProcesses();
            UpdateSelectedAppsDisplay();
        }

        private void CreatePixelColorConfig()
        {
            if (Result!.PixelColorConfig == null)
                Result.PixelColorConfig = new PixelColorCondition();

            // Coordonnées X, Y (déclarer d'abord pour être accessible dans le handler)
            var coordsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 12)
            };

            var xLabel = new TextBlock { Text = "X:", Margin = new Thickness(0, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var xTextBox = new TextBox
            {
                Width = 80,
                Text = Result.PixelColorConfig.X.ToString(),
                FontSize = 12
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                    Result.PixelColorConfig!.X = x;
            };

            var yLabel = new TextBlock { Text = "Y:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var yTextBox = new TextBox
            {
                Width = 80,
                Text = Result.PixelColorConfig.Y.ToString(),
                FontSize = 12
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                    Result.PixelColorConfig!.Y = y;
            };

            coordsPanel.Children.Add(xLabel);
            coordsPanel.Children.Add(xTextBox);
            coordsPanel.Children.Add(yLabel);
            coordsPanel.Children.Add(yTextBox);

            // Couleur (déclarer d'abord pour être accessible dans le handler)
            var colorPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 12)
            };

            var colorPreviewBorder = new Border
            {
                Width = 40,
                Height = 40,
                BorderBrush = new SolidColorBrush(System.Windows.Media.Colors.Gray),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            
            // Initialiser la couleur de prévisualisation
            try
            {
                string hex = Result.PixelColorConfig.ExpectedColor.TrimStart('#');
                if (hex.Length == 6)
                {
                    int r = Convert.ToInt32(hex.Substring(0, 2), 16);
                    int g = Convert.ToInt32(hex.Substring(2, 2), 16);
                    int b = Convert.ToInt32(hex.Substring(4, 2), 16);
                    colorPreviewBorder.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb((byte)r, (byte)g, (byte)b));
                }
            }
            catch
            {
                colorPreviewBorder.Background = new SolidColorBrush(System.Windows.Media.Colors.Black);
            }

            var colorTextBox = new TextBox
            {
                Text = Result.PixelColorConfig.ExpectedColor,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                MinWidth = 120,
                ToolTip = "Format: #FF0000"
            };
            colorTextBox.TextChanged += (s, e) =>
            {
                Result.PixelColorConfig!.ExpectedColor = colorTextBox.Text;
                
                // Mettre à jour la prévisualisation
                try
                {
                    string hex = colorTextBox.Text.TrimStart('#');
                    if (hex.Length == 6)
                    {
                        int r = Convert.ToInt32(hex.Substring(0, 2), 16);
                        int g = Convert.ToInt32(hex.Substring(2, 2), 16);
                        int b = Convert.ToInt32(hex.Substring(4, 2), 16);
                        colorPreviewBorder.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb((byte)r, (byte)g, (byte)b));
                    }
                }
                catch { }
            };

            colorPanel.Children.Add(colorPreviewBorder);
            colorPanel.Children.Add(colorTextBox);

            // Bouton pipette (après avoir déclaré les variables)
            var pipetteButton = new Button
            {
                Content = "🎨 Pipette (sélectionner à l'écran)",
                FontSize = 13,
                Padding = new Thickness(12, 8, 12, 8),
                Margin = new Thickness(0, 0, 0, 12),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            pipetteButton.Click += (s, e) =>
            {
                try
                {
                    var colorPicker = new ColorPickerWindow
                    {
                        Owner = this
                    };
                    if (colorPicker.ShowDialog() == true)
                    {
                        Result.PixelColorConfig!.X = colorPicker.SelectedX;
                        Result.PixelColorConfig!.Y = colorPicker.SelectedY;
                        Result.PixelColorConfig!.ExpectedColor = colorPicker.ColorHex;
                        
                        // Mettre à jour les champs
                        xTextBox.Text = colorPicker.SelectedX.ToString();
                        yTextBox.Text = colorPicker.SelectedY.ToString();
                        colorTextBox.Text = colorPicker.ColorHex;
                        colorPreviewBorder.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(
                            colorPicker.SelectedColor.R,
                            colorPicker.SelectedColor.G,
                            colorPicker.SelectedColor.B));
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erreur lors de la sélection de couleur : {ex.Message}", 
                        "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            ConfigContentPanel.Children.Add(pipetteButton);

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Coordonnées:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            });
            ConfigContentPanel.Children.Add(coordsPanel);

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Couleur attendue (hex):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            });
            ConfigContentPanel.Children.Add(colorPanel);

            // Tolérance
            var toleranceLabel = new TextBlock
            {
                Text = "Tolérance (%):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(toleranceLabel);

            var toleranceTextBox = new TextBox
            {
                Text = Result.PixelColorConfig.Tolerance.ToString(),
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };
            toleranceTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(toleranceTextBox.Text, out int tolerance))
                    Result.PixelColorConfig!.Tolerance = Math.Max(0, Math.Min(100, tolerance));
            };
            ConfigContentPanel.Children.Add(toleranceTextBox);

            // Mode de comparaison
            var modeLabel = new TextBlock
            {
                Text = "Mode:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(modeLabel);

            var modeComboBox = new ComboBox
            {
                FontSize = 12
            };
            modeComboBox.Items.Add("RGB");
            modeComboBox.Items.Add("HSV");
            modeComboBox.SelectedIndex = (int)Result.PixelColorConfig.MatchMode;
            modeComboBox.SelectionChanged += (s, e) =>
            {
                if (modeComboBox.SelectedIndex >= 0)
                    Result.PixelColorConfig!.MatchMode = (ColorMatchMode)modeComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(modeComboBox);
        }

        private void CreateMousePositionConfig()
        {
            if (Result!.MousePositionConfig == null)
                Result.MousePositionConfig = new MousePositionCondition();

            // Zone (X1, Y1) - (X2, Y2) (déclarer d'abord pour être accessible dans le handler)
            var topLeftPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 8)
            };

            var x1Label = new TextBlock { Text = "X1:", Margin = new Thickness(0, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var x1TextBox = new TextBox
            {
                Width = 80,
                Text = Result.MousePositionConfig.X1.ToString(),
                FontSize = 12
            };
            x1TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(x1TextBox.Text, out int x1))
                    Result.MousePositionConfig!.X1 = x1;
            };

            var y1Label = new TextBlock { Text = "Y1:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var y1TextBox = new TextBox
            {
                Width = 80,
                Text = Result.MousePositionConfig.Y1.ToString(),
                FontSize = 12
            };
            y1TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(y1TextBox.Text, out int y1))
                    Result.MousePositionConfig!.Y1 = y1;
            };

            topLeftPanel.Children.Add(x1Label);
            topLeftPanel.Children.Add(x1TextBox);
            topLeftPanel.Children.Add(y1Label);
            topLeftPanel.Children.Add(y1TextBox);

            var bottomRightPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal
            };

            var x2Label = new TextBlock { Text = "X2:", Margin = new Thickness(0, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var x2TextBox = new TextBox
            {
                Width = 80,
                Text = Result.MousePositionConfig.X2.ToString(),
                FontSize = 12
            };
            x2TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(x2TextBox.Text, out int x2))
                    Result.MousePositionConfig!.X2 = x2;
            };

            var y2Label = new TextBlock { Text = "Y2:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var y2TextBox = new TextBox
            {
                Width = 80,
                Text = Result.MousePositionConfig.Y2.ToString(),
                FontSize = 12
            };
            y2TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(y2TextBox.Text, out int y2))
                    Result.MousePositionConfig!.Y2 = y2;
            };

            bottomRightPanel.Children.Add(x2Label);
            bottomRightPanel.Children.Add(x2TextBox);
            bottomRightPanel.Children.Add(y2Label);
            bottomRightPanel.Children.Add(y2TextBox);

            // Bouton sélection graphique (après avoir déclaré les variables)
            var selectZoneButton = new Button
            {
                Content = "📐 Sélectionner une zone à l'écran",
                FontSize = 13,
                Padding = new Thickness(12, 8, 12, 8),
                Margin = new Thickness(0, 0, 0, 12),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            selectZoneButton.Click += (s, e) =>
            {
                try
                {
                    var zoneSelector = new ZoneSelectorWindow
                    {
                        Owner = this
                    };
                    if (zoneSelector.ShowDialog() == true)
                    {
                        Result.MousePositionConfig!.X1 = zoneSelector.X1;
                        Result.MousePositionConfig!.Y1 = zoneSelector.Y1;
                        Result.MousePositionConfig!.X2 = zoneSelector.X2;
                        Result.MousePositionConfig!.Y2 = zoneSelector.Y2;
                        
                        // Mettre à jour les champs
                        x1TextBox.Text = zoneSelector.X1.ToString();
                        y1TextBox.Text = zoneSelector.Y1.ToString();
                        x2TextBox.Text = zoneSelector.X2.ToString();
                        y2TextBox.Text = zoneSelector.Y2.ToString();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erreur lors de la sélection de zone : {ex.Message}", 
                        "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            ConfigContentPanel.Children.Add(selectZoneButton);

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Zone (coin supérieur gauche):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            });
            ConfigContentPanel.Children.Add(topLeftPanel);

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Zone (coin inférieur droit):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            });
            ConfigContentPanel.Children.Add(bottomRightPanel);
        }

        private void CreateTimeDateConfig()
        {
            if (Result!.TimeDateConfig == null)
                Result.TimeDateConfig = new TimeDateCondition();

            // Aperçu de la condition
            var previewTextBlock = new TextBlock
            {
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0, 120, 215)),
                Margin = new Thickness(0, 0, 0, 15),
                TextWrapping = TextWrapping.Wrap
            };
            ConfigContentPanel.Children.Add(previewTextBlock);

            void UpdatePreview()
            {
                var type = Result.TimeDateConfig!.ComparisonType;
                var op = Result.TimeDateConfig.Operator;
                var value = Result.TimeDateConfig.Value;

                var operatorSymbol = op switch
                {
                    TimeComparisonOperator.Equals => "=",
                    TimeComparisonOperator.GreaterThan => ">",
                    TimeComparisonOperator.LessThan => "<",
                    TimeComparisonOperator.GreaterThanOrEqual => ">=",
                    TimeComparisonOperator.LessThanOrEqual => "<=",
                    _ => "="
                };

                var typeText = type switch
                {
                    "Hour" => "heure",
                    "Minute" => "minute",
                    "Day" => "jour",
                    "Month" => "mois",
                    "Year" => "année",
                    _ => "heure"
                };

                string valueText;
                if (type == "Hour")
                {
                    valueText = $"{value:D2}:00";
                }
                else if (type == "Minute")
                {
                    var hours = value / 60;
                    var minutes = value % 60;
                    valueText = $"{hours:D2}:{minutes:D2}";
                }
                else if (type == "Day")
                {
                    var dayNames = new[] { "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi" };
                    if (value >= 0 && value < dayNames.Length)
                        valueText = dayNames[value];
                    else
                        valueText = value.ToString();
                }
                else
                {
                    valueText = value.ToString();
                }

                previewTextBlock.Text = $"Si {typeText} {operatorSymbol} {valueText}";
            }

            // Conteneur pour les contrôles de valeur (déclarer avant UpdateValueControls)
            var valueContainer = new StackPanel();

            // Type de comparaison
            var typeLabel = new TextBlock
            {
                Text = "Type de comparaison:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(typeLabel);

            var typeComboBox = new ComboBox
            {
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };
            typeComboBox.Items.Add("Heure");
            typeComboBox.Items.Add("Minute");
            typeComboBox.Items.Add("Jour");
            typeComboBox.Items.Add("Mois");
            typeComboBox.Items.Add("Année");

            var typeIndex = Result.TimeDateConfig.ComparisonType switch
            {
                "Hour" => 0,
                "Minute" => 1,
                "Day" => 2,
                "Month" => 3,
                "Year" => 4,
                _ => 0
            };
            typeComboBox.SelectedIndex = typeIndex;

            // Opérateur
            var operatorLabel = new TextBlock
            {
                Text = "Opérateur:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(operatorLabel);

            var operatorComboBox = new ComboBox
            {
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };
            operatorComboBox.Items.Add("=");
            operatorComboBox.Items.Add(">");
            operatorComboBox.Items.Add("<");
            operatorComboBox.Items.Add(">=");
            operatorComboBox.Items.Add("<=");
            operatorComboBox.SelectedIndex = (int)Result.TimeDateConfig.Operator;

            typeComboBox.SelectionChanged += (s, e) =>
            {
                if (typeComboBox.SelectedIndex >= 0)
                {
                    Result.TimeDateConfig!.ComparisonType = typeComboBox.SelectedIndex switch
                    {
                        0 => "Hour",
                        1 => "Minute",
                        2 => "Day",
                        3 => "Month",
                        4 => "Year",
                        _ => "Hour"
                    };
                    UpdateValueControls();
                    UpdatePreview();
                }
            };
            ConfigContentPanel.Children.Add(typeComboBox);

            operatorComboBox.SelectionChanged += (s, e) =>
            {
                if (operatorComboBox.SelectedIndex >= 0)
                {
                    Result.TimeDateConfig!.Operator = (TimeComparisonOperator)operatorComboBox.SelectedIndex;
                    UpdatePreview();
                }
            };
            ConfigContentPanel.Children.Add(operatorComboBox);
            ConfigContentPanel.Children.Add(valueContainer);

            void UpdateValueControls()
            {
                valueContainer.Children.Clear();

                var type = Result.TimeDateConfig!.ComparisonType;

                if (type == "Hour" || type == "Minute")
                {
                    // Sélecteur d'heure pour Hour et Minute
                    var timeLabel = new TextBlock
                    {
                        Text = type == "Hour" ? "Heure:" : "Heure (en minutes depuis minuit):",
                        FontSize = 13,
                        FontWeight = FontWeights.SemiBold,
                        Margin = new Thickness(0, 0, 0, 4)
                    };
                    valueContainer.Children.Add(timeLabel);

                    var timeGrid = new Grid { Margin = new Thickness(0, 0, 0, 8) };
                    timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                    var hourLabel = new TextBlock
                    {
                        Text = "H:",
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 0, 5, 0),
                        FontSize = 12
                    };
                    Grid.SetColumn(hourLabel, 0);
                    timeGrid.Children.Add(hourLabel);

                    var hourTextBox = new TextBox
                    {
                        Width = 50,
                        FontSize = 12,
                        Margin = new Thickness(0, 0, 10, 0)
                    };
                    Grid.SetColumn(hourTextBox, 1);
                    timeGrid.Children.Add(hourTextBox);

                    var minuteLabel = new TextBlock
                    {
                        Text = "M:",
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 0, 5, 0),
                        FontSize = 12
                    };
                    Grid.SetColumn(minuteLabel, 2);
                    timeGrid.Children.Add(minuteLabel);

                    var minuteTextBox = new TextBox
                    {
                        Width = 50,
                        FontSize = 12
                    };
                    Grid.SetColumn(minuteTextBox, 3);
                    timeGrid.Children.Add(minuteTextBox);

                    // Initialiser les valeurs
                    if (type == "Hour")
                    {
                        hourTextBox.Text = Result.TimeDateConfig.Value.ToString();
                        minuteTextBox.Text = "0";
                        minuteTextBox.IsEnabled = false;
                    }
                    else // Minute
                    {
                        var totalMinutes = Result.TimeDateConfig.Value;
                        hourTextBox.Text = (totalMinutes / 60).ToString();
                        minuteTextBox.Text = (totalMinutes % 60).ToString();
                    }

                    hourTextBox.TextChanged += (s, e) =>
                    {
                        if (int.TryParse(hourTextBox.Text, out int hours))
                        {
                            if (type == "Hour")
                            {
                                Result.TimeDateConfig!.Value = Math.Max(0, Math.Min(23, hours));
                                hourTextBox.Text = Result.TimeDateConfig.Value.ToString();
                            }
                            else // Minute
                            {
                                if (int.TryParse(minuteTextBox.Text, out int minutes))
                                {
                                    Result.TimeDateConfig!.Value = hours * 60 + Math.Max(0, Math.Min(59, minutes));
                                    UpdatePreview();
                                }
                            }
                        }
                    };

                    minuteTextBox.TextChanged += (s, e) =>
                    {
                        if (int.TryParse(hourTextBox.Text, out int hours) &&
                            int.TryParse(minuteTextBox.Text, out int minutes))
                        {
                            Result.TimeDateConfig!.Value = hours * 60 + Math.Max(0, Math.Min(59, minutes));
                            UpdatePreview();
                        }
                    };

                    valueContainer.Children.Add(timeGrid);
                }
                else if (type == "Day" || type == "Month" || type == "Year")
                {
                    // DatePicker pour Day, Month, Year
                    var dateLabel = new TextBlock
                    {
                        Text = type == "Day" ? "Jour:" : type == "Month" ? "Mois:" : "Année:",
                        FontSize = 13,
                        FontWeight = FontWeights.SemiBold,
                        Margin = new Thickness(0, 0, 0, 4)
                    };
                    valueContainer.Children.Add(dateLabel);

                    if (type == "Day")
                    {
                        // Sélecteur de jour de la semaine
                        var dayComboBox = new ComboBox
                        {
                            FontSize = 12,
                            Width = 180
                        };
                        var dayNames = new[] { "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi" };
                        foreach (var dayName in dayNames)
                            dayComboBox.Items.Add(dayName);
                        
                        // Convertir la valeur (0-6 pour DayOfWeek: Dimanche=0, Lundi=1, etc.)
                        var dayIndex = Math.Max(0, Math.Min(6, Result.TimeDateConfig.Value));
                        dayComboBox.SelectedIndex = dayIndex;
                        
                        dayComboBox.SelectionChanged += (s, e) =>
                        {
                            if (dayComboBox.SelectedIndex >= 0)
                            {
                                Result.TimeDateConfig!.Value = dayComboBox.SelectedIndex;
                                UpdatePreview();
                            }
                        };
                        valueContainer.Children.Add(dayComboBox);
                    }
                    else if (type == "Month")
                    {
                        // Sélecteur de mois (1-12)
                        var monthComboBox = new ComboBox
                        {
                            FontSize = 12,
                            Width = 150
                        };
                        var months = new[] { "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
                                           "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre" };
                        foreach (var month in months)
                            monthComboBox.Items.Add(month);
                        
                        monthComboBox.SelectedIndex = Math.Max(0, Math.Min(11, Result.TimeDateConfig.Value - 1));
                        monthComboBox.SelectionChanged += (s, e) =>
                        {
                            if (monthComboBox.SelectedIndex >= 0)
                            {
                                Result.TimeDateConfig!.Value = monthComboBox.SelectedIndex + 1;
                                UpdatePreview();
                            }
                        };
                        valueContainer.Children.Add(monthComboBox);
                    }
                    else // Year
                    {
                        // Sélecteur d'année avec ComboBox pour les années récentes + TextBox pour autres
                        var yearPanel = new StackPanel { Orientation = Orientation.Horizontal };
                        
                        var yearComboBox = new ComboBox
                        {
                            FontSize = 12,
                            Width = 120,
                            Margin = new Thickness(0, 0, 10, 0)
                        };
                        
                        // Ajouter les années récentes (année actuelle ± 10 ans)
                        var currentYear = DateTime.Now.Year;
                        for (int y = currentYear - 10; y <= currentYear + 10; y++)
                        {
                            yearComboBox.Items.Add(y.ToString());
                        }
                        
                        // Sélectionner l'année actuelle si elle correspond
                        var selectedYear = Result.TimeDateConfig.Value;
                        if (selectedYear >= currentYear - 10 && selectedYear <= currentYear + 10)
                        {
                            yearComboBox.SelectedIndex = selectedYear - (currentYear - 10);
                        }
                        
                        yearComboBox.SelectionChanged += (s, e) =>
                        {
                            if (yearComboBox.SelectedIndex >= 0 && 
                                int.TryParse(yearComboBox.SelectedItem?.ToString(), out int year))
                            {
                                Result.TimeDateConfig!.Value = year;
                                UpdatePreview();
                            }
                        };
                        
                        var yearTextBox = new TextBox
                        {
                            Width = 80,
                            FontSize = 12,
                            Text = Result.TimeDateConfig.Value.ToString(),
                            ToolTip = "Ou saisissez une année (1900-2100)"
                        };
                        yearTextBox.TextChanged += (s, e) =>
                        {
                            if (int.TryParse(yearTextBox.Text, out int year))
                            {
                                var validYear = Math.Max(1900, Math.Min(2100, year));
                                Result.TimeDateConfig!.Value = validYear;
                                yearTextBox.Text = validYear.ToString();
                                
                                // Mettre à jour le ComboBox si l'année est dans la plage
                                if (validYear >= currentYear - 10 && validYear <= currentYear + 10)
                                {
                                    yearComboBox.SelectedIndex = validYear - (currentYear - 10);
                                }
                                else
                                {
                                    yearComboBox.SelectedIndex = -1;
                                }
                                
                                UpdatePreview();
                            }
                        };
                        
                        yearPanel.Children.Add(yearComboBox);
                        yearPanel.Children.Add(new TextBlock
                        {
                            Text = "ou",
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(5, 0, 5, 0),
                            FontSize = 11,
                            Foreground = new SolidColorBrush(Colors.Gray)
                        });
                        yearPanel.Children.Add(yearTextBox);
                        
                        valueContainer.Children.Add(yearPanel);
                    }
                }
            }

            // Initialiser les contrôles
            UpdateValueControls();
            UpdatePreview();
        }

        private void CreateImageOnScreenConfig()
        {
            if (Result!.ImageOnScreenConfig == null)
                Result.ImageOnScreenConfig = new ImageOnScreenCondition();

            // Aperçu de l'image
            var imagePreviewBorder = new Border
            {
                BorderBrush = new SolidColorBrush(Colors.LightGray),
                BorderThickness = new Thickness(1),
                Background = new SolidColorBrush(Colors.White),
                Width = 200,
                Height = 150,
                Margin = new Thickness(0, 0, 0, 12),
                HorizontalAlignment = HorizontalAlignment.Left
            };

            var imagePreview = new System.Windows.Controls.Image
            {
                Stretch = System.Windows.Media.Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            imagePreviewBorder.Child = imagePreview;
            ConfigContentPanel.Children.Add(imagePreviewBorder);

            void UpdateImagePreview()
            {
                try
                {
                    if (!string.IsNullOrEmpty(Result.ImageOnScreenConfig!.ImagePath) && 
                        System.IO.File.Exists(Result.ImageOnScreenConfig.ImagePath))
                    {
                        var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                        bitmap.BeginInit();
                        bitmap.UriSource = new Uri(Result.ImageOnScreenConfig.ImagePath, UriKind.Absolute);
                        bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                        bitmap.EndInit();
                        imagePreview.Source = bitmap;
                        imagePreviewBorder.Visibility = Visibility.Visible;
                    }
                    else
                    {
                        imagePreview.Source = null;
                        imagePreviewBorder.Visibility = Visibility.Visible;
                    }
                }
                catch
                {
                    imagePreview.Source = null;
                }
            }

            // Chemin de l'image
            var pathLabel = new TextBlock
            {
                Text = "Chemin de l'image:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(pathLabel);

            var pathPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 12)
            };

            var pathTextBox = new TextBox
            {
                Text = Result.ImageOnScreenConfig.ImagePath,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                MinWidth = 300
            };
            pathTextBox.TextChanged += (s, e) =>
            {
                Result.ImageOnScreenConfig!.ImagePath = pathTextBox.Text;
                UpdateImagePreview();
            };

            var browseButton = new Button
            {
                Content = "Parcourir...",
                Width = 100,
                Height = 28,
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            browseButton.Click += (s, e) =>
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif|Tous les fichiers|*.*",
                    Title = "Sélectionner une image"
                };
                if (dialog.ShowDialog() == true)
                {
                    pathTextBox.Text = dialog.FileName;
                }
            };

            pathPanel.Children.Add(pathTextBox);
            pathPanel.Children.Add(browseButton);
            ConfigContentPanel.Children.Add(pathPanel);

            // Sensibilité avec slider
            var sensitivityLabel = new TextBlock
            {
                Text = "Sensibilité:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(sensitivityLabel);

            var sensitivityPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };

            var sensitivitySlider = new Slider
            {
                Minimum = 0,
                Maximum = 100,
                Value = Result.ImageOnScreenConfig.Sensitivity,
                Width = 200,
                TickFrequency = 10,
                IsSnapToTickEnabled = true,
                VerticalAlignment = VerticalAlignment.Center
            };

            var sensitivityValueText = new TextBlock
            {
                Text = $"{Result.ImageOnScreenConfig.Sensitivity}%",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                MinWidth = 50,
                Margin = new Thickness(10, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            sensitivitySlider.ValueChanged += (s, e) =>
            {
                var value = (int)sensitivitySlider.Value;
                Result.ImageOnScreenConfig!.Sensitivity = value;
                sensitivityValueText.Text = $"{value}%";
            };

            sensitivityPanel.Children.Add(sensitivitySlider);
            sensitivityPanel.Children.Add(sensitivityValueText);
            ConfigContentPanel.Children.Add(sensitivityPanel);

            // Zone de recherche
            var searchAreaLabel = new TextBlock
            {
                Text = "Zone de recherche (optionnel):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(searchAreaLabel);

            var searchAreaPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };

            var searchAreaInfoText = new TextBlock
            {
                Text = "Zone actuelle: " + (Result.ImageOnScreenConfig.SearchArea != null && Result.ImageOnScreenConfig.SearchArea.Length == 4
                    ? $"({Result.ImageOnScreenConfig.SearchArea[0]}, {Result.ImageOnScreenConfig.SearchArea[1]}) - ({Result.ImageOnScreenConfig.SearchArea[2]}, {Result.ImageOnScreenConfig.SearchArea[3]})"
                    : "Tout l'écran"),
                FontSize = 11,
                Foreground = new SolidColorBrush(Colors.Gray),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 10, 0)
            };

            var selectZoneButton = new Button
            {
                Content = "📐 Sélectionner une zone",
                Width = 180,
                Height = 28,
                VerticalAlignment = VerticalAlignment.Center
            };

            selectZoneButton.Click += (s, e) =>
            {
                try
                {
                    var zoneSelector = new ZoneSelectorWindow
                    {
                        Owner = this
                    };
                    if (zoneSelector.ShowDialog() == true)
                    {
                        Result.ImageOnScreenConfig!.SearchArea = new int[]
                        {
                            zoneSelector.X1,
                            zoneSelector.Y1,
                            zoneSelector.X2,
                            zoneSelector.Y2
                        };
                        searchAreaInfoText.Text = $"Zone: ({Result.ImageOnScreenConfig.SearchArea[0]}, {Result.ImageOnScreenConfig.SearchArea[1]}) - ({Result.ImageOnScreenConfig.SearchArea[2]}, {Result.ImageOnScreenConfig.SearchArea[3]})";
                    }
                }
                catch (Exception ex)
                {
                    System.Windows.MessageBox.Show($"Erreur lors de la sélection de zone: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };

            var clearZoneButton = new Button
            {
                Content = "Effacer",
                Width = 80,
                Height = 28,
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            clearZoneButton.Click += (s, e) =>
            {
                Result.ImageOnScreenConfig!.SearchArea = null;
                searchAreaInfoText.Text = "Zone actuelle: Tout l'écran";
            };

            searchAreaPanel.Children.Add(searchAreaInfoText);
            searchAreaPanel.Children.Add(selectZoneButton);
            searchAreaPanel.Children.Add(clearZoneButton);
            ConfigContentPanel.Children.Add(searchAreaPanel);

            // Initialiser l'aperçu
            UpdateImagePreview();
        }

        private void CreateTextOnScreenConfig()
        {
            if (Result!.TextOnScreenConfig == null)
                Result.TextOnScreenConfig = new TextOnScreenCondition();

            // Texte à rechercher
            var textLabel = new TextBlock
            {
                Text = "Texte à rechercher:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(textLabel);

            var textTextBox = new TextBox
            {
                Text = Result.TextOnScreenConfig.Text,
                FontSize = 12,
                MinHeight = 60,
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            textTextBox.TextChanged += (s, e) =>
            {
                Result.TextOnScreenConfig!.Text = textTextBox.Text;
            };
            ConfigContentPanel.Children.Add(textTextBox);
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

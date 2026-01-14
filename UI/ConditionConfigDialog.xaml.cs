using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MacroEngine.Core.Inputs;

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

            // Liste des processus
            var processLabel = new TextBlock
            {
                Text = "Processus:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(processLabel);

            var processComboBox = new ComboBox
            {
                IsEditable = true,
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };

            // Charger les processus en cours
            try
            {
                var processes = Process.GetProcesses()
                    .Where(p => !string.IsNullOrEmpty(p.MainWindowTitle))
                    .Select(p => p.ProcessName)
                    .Distinct()
                    .OrderBy(p => p)
                    .ToList();

                foreach (var proc in processes)
                {
                    processComboBox.Items.Add(proc);
                }
            }
            catch { }

            processComboBox.Text = Result.ActiveApplicationConfig.ProcessName;
            processComboBox.AddHandler(TextBox.TextChangedEvent, new TextChangedEventHandler((s, e) =>
            {
                if (processComboBox.Text != null)
                    Result.ActiveApplicationConfig!.ProcessName = processComboBox.Text;
            }));

            ConfigContentPanel.Children.Add(processComboBox);

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
                Text = Result.KeyboardKeyConfig.VirtualKeyCode.ToString(),
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12),
                ToolTip = "Code virtuel de la touche (ex: 0x10 pour Shift)"
            };
            keyTextBox.TextChanged += (s, e) =>
            {
                if (ushort.TryParse(keyTextBox.Text, out ushort keyCode))
                    Result.KeyboardKeyConfig!.VirtualKeyCode = keyCode;
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

        private void CreateProcessRunningConfig()
        {
            if (Result!.ProcessRunningConfig == null)
                Result.ProcessRunningConfig = new ProcessRunningCondition();

            // Liste des processus
            var processLabel = new TextBlock
            {
                Text = "Processus:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(processLabel);

            var processComboBox = new ComboBox
            {
                IsEditable = true,
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12)
            };

            // Charger les processus en cours
            try
            {
                var processes = Process.GetProcesses()
                    .Select(p => p.ProcessName)
                    .Distinct()
                    .OrderBy(p => p)
                    .ToList();

                foreach (var proc in processes)
                {
                    processComboBox.Items.Add(proc);
                }
            }
            catch { }

            processComboBox.Text = Result.ProcessRunningConfig.ProcessName;
            processComboBox.AddHandler(TextBox.TextChangedEvent, new TextChangedEventHandler((s, e) =>
            {
                if (processComboBox.Text != null)
                    Result.ProcessRunningConfig!.ProcessName = processComboBox.Text;
            }));

            ConfigContentPanel.Children.Add(processComboBox);

            // Option "Peu importe la fenêtre active"
            var anyWindowCheckBox = new CheckBox
            {
                Content = "Peu importe la fenêtre active",
                IsChecked = Result.ProcessRunningConfig.AnyWindow,
                FontSize = 12
            };
            anyWindowCheckBox.Checked += (s, e) => Result.ProcessRunningConfig!.AnyWindow = true;
            anyWindowCheckBox.Unchecked += (s, e) => Result.ProcessRunningConfig!.AnyWindow = false;
            ConfigContentPanel.Children.Add(anyWindowCheckBox);
        }

        private void CreatePixelColorConfig()
        {
            if (Result!.PixelColorConfig == null)
                Result.PixelColorConfig = new PixelColorCondition();

            // Coordonnées X, Y
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

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Coordonnées:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            });
            ConfigContentPanel.Children.Add(coordsPanel);

            // Couleur
            var colorLabel = new TextBlock
            {
                Text = "Couleur attendue (hex):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(colorLabel);

            var colorTextBox = new TextBox
            {
                Text = Result.PixelColorConfig.ExpectedColor,
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12),
                ToolTip = "Format: #FF0000"
            };
            colorTextBox.TextChanged += (s, e) =>
            {
                Result.PixelColorConfig!.ExpectedColor = colorTextBox.Text;
            };
            ConfigContentPanel.Children.Add(colorTextBox);

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

            // Zone (X1, Y1) - (X2, Y2)
            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Zone (coin supérieur gauche):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            });

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
            ConfigContentPanel.Children.Add(topLeftPanel);

            ConfigContentPanel.Children.Add(new TextBlock
            {
                Text = "Zone (coin inférieur droit):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            });

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
            ConfigContentPanel.Children.Add(bottomRightPanel);
        }

        private void CreateTimeDateConfig()
        {
            if (Result!.TimeDateConfig == null)
                Result.TimeDateConfig = new TimeDateCondition();

            // Type de comparaison
            var typeLabel = new TextBlock
            {
                Text = "Type:",
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
                }
            };
            ConfigContentPanel.Children.Add(typeComboBox);

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
            operatorComboBox.SelectionChanged += (s, e) =>
            {
                if (operatorComboBox.SelectedIndex >= 0)
                    Result.TimeDateConfig!.Operator = (TimeComparisonOperator)operatorComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(operatorComboBox);

            // Valeur
            var valueLabel = new TextBlock
            {
                Text = "Valeur:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(valueLabel);

            var valueTextBox = new TextBox
            {
                Text = Result.TimeDateConfig.Value.ToString(),
                FontSize = 12
            };
            valueTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(valueTextBox.Text, out int value))
                    Result.TimeDateConfig!.Value = value;
            };
            ConfigContentPanel.Children.Add(valueTextBox);
        }

        private void CreateImageOnScreenConfig()
        {
            if (Result!.ImageOnScreenConfig == null)
                Result.ImageOnScreenConfig = new ImageOnScreenCondition();

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
                VerticalAlignment = VerticalAlignment.Center
            };
            pathTextBox.TextChanged += (s, e) =>
            {
                Result.ImageOnScreenConfig!.ImagePath = pathTextBox.Text;
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
                    Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif|Tous les fichiers|*.*"
                };
                if (dialog.ShowDialog() == true)
                {
                    pathTextBox.Text = dialog.FileName;
                }
            };

            pathPanel.Children.Add(pathTextBox);
            pathPanel.Children.Add(browseButton);
            ConfigContentPanel.Children.Add(pathPanel);

            // Sensibilité
            var sensitivityLabel = new TextBlock
            {
                Text = "Sensibilité (%):",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 8, 0, 4)
            };
            ConfigContentPanel.Children.Add(sensitivityLabel);

            var sensitivityTextBox = new TextBox
            {
                Text = Result.ImageOnScreenConfig.Sensitivity.ToString(),
                FontSize = 12
            };
            sensitivityTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(sensitivityTextBox.Text, out int sensitivity))
                    Result.ImageOnScreenConfig!.Sensitivity = Math.Max(0, Math.Min(100, sensitivity));
            };
            ConfigContentPanel.Children.Add(sensitivityTextBox);
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

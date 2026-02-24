using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shell;
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

            // Supprimer la barre blanche du cadre système (Windows 10/11) en utilisant WindowChrome
            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);

            // Créer une copie pour l'édition
            Result = ifAction.Clone() as IfAction;

            if (Result == null)
            {
                Result = new IfAction();
            }

            LoadConfiguration();
        }

        private static Brush? GetDialogBrush(string key)
        {
            return Application.Current.TryFindResource(key) as Brush;
        }

        private static SolidColorBrush DialogBrush(string key)
        {
            return GetDialogBrush(key) as SolidColorBrush ?? new SolidColorBrush(Colors.White);
        }

        private void LoadConfiguration()
        {
            if (Result is null)
                return;
            ConfigContentPanel.Children.Clear();
            var result = Result;

            // Initialiser Conditions si vide (compatibilité avec l'ancien format)
            if (result.Conditions == null || result.Conditions.Count == 0)
            {
                result.Conditions = new List<ConditionItem>();
                // Créer une condition à partir des anciennes propriétés
                var conditionItem = new ConditionItem
                {
                    ConditionType = result.ConditionType,
                    Condition = result.Condition,
                    ActiveApplicationConfig = result.ActiveApplicationConfig,
                    KeyboardKeyConfig = result.KeyboardKeyConfig,
                    ProcessRunningConfig = result.ProcessRunningConfig,
                    PixelColorConfig = result.PixelColorConfig,
                    MousePositionConfig = result.MousePositionConfig,
                    TimeDateConfig = result.TimeDateConfig,
                    ImageOnScreenConfig = result.ImageOnScreenConfig,
                    TextOnScreenConfig = result.TextOnScreenConfig,
                    VariableName = result.Conditions?.FirstOrDefault()?.VariableName
                };
                result.Conditions!.Add(conditionItem);
            }

            if (result.Operators == null)
            {
                result.Operators = new List<LogicalOperator>();
            }

            // Créer l'interface pour gérer plusieurs conditions
            CreateMultipleConditionsUI();
        }

        private void CreateMultipleConditionsUI()
        {
            // Titre
            var titleLabel = new TextBlock
            {
                Text = "Conditions composées (AND/OR):",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 12)
            };
            ConfigContentPanel.Children.Add(titleLabel);

            // Conteneur pour les conditions
            var conditionsContainer = new StackPanel();
            ConfigContentPanel.Children.Add(conditionsContainer);

            void RefreshConditionsUI()
            {
                conditionsContainer.Children.Clear();

                for (int i = 0; i < Result!.Conditions.Count; i++)
                {
                    var condition = Result.Conditions[i];

                    // Panel pour une condition
                    var conditionPanel = new Border
                    {
                        BorderBrush = DialogBrush("BorderLightBrush"),
                        BorderThickness = new Thickness(1),
                        Padding = new Thickness(12),
                        Margin = new Thickness(0, 0, 0, 12),
                        Background = DialogBrush("BackgroundTertiaryBrush")
                    };

                    var conditionContent = new StackPanel();

                    // En-tête avec type et bouton supprimer
                    var headerPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
                    
                    var conditionTypeLabel = new TextBlock
                    {
                        Text = $"Condition {i + 1}: {GetConditionTypeName(condition.ConditionType)}",
                        FontSize = 13,
                        FontWeight = FontWeights.SemiBold,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    headerPanel.Children.Add(conditionTypeLabel);

                    if (Result.Conditions.Count > 1)
                    {
                        // Capturer l'index dans une variable locale pour la closure
                        var conditionIndex = i;
                        
                        var removeButton = new Button
                        {
                            Content = LucideIcons.CreateIcon(LucideIcons.Close, 10),
                            Width = 24,
                            Height = 24,
                            Margin = new Thickness(10, 0, 0, 0),
                            Padding = new Thickness(0),
                            FontSize = 12,
                            VerticalAlignment = VerticalAlignment.Center
                        };
                        removeButton.Click += (s, e) =>
                        {
                            // Supprimer la condition
                            if (conditionIndex >= 0 && conditionIndex < Result.Conditions.Count)
                            {
                                Result.Conditions.RemoveAt(conditionIndex);
                                
                                // Supprimer l'opérateur correspondant
                                // Les opérateurs sont entre les conditions :
                                // - op[0] entre cond[0] et cond[1]
                                // - op[1] entre cond[1] et cond[2]
                                // Si on supprime cond[i], on supprime op[i] (sauf si c'est la dernière condition)
                                if (Result.Operators.Count > 0)
                                {
                                    if (conditionIndex == 0)
                                    {
                                        // Supprimer la première condition : supprimer op[0]
                                        Result.Operators.RemoveAt(0);
                                    }
                                    else if (conditionIndex >= Result.Operators.Count)
                                    {
                                        // Supprimer la dernière condition : supprimer le dernier opérateur
                                        Result.Operators.RemoveAt(Result.Operators.Count - 1);
                                    }
                                    else
                                    {
                                        // Supprimer une condition au milieu : supprimer op[conditionIndex]
                                        Result.Operators.RemoveAt(conditionIndex);
                                    }
                                }
                            }
                            
                            RefreshConditionsUI();
                        };
                        headerPanel.Children.Add(removeButton);
                    }

                    conditionContent.Children.Add(headerPanel);

                    // Configuration de la condition
                    var configPanel = CreateConditionConfigPanel(condition);
                    conditionContent.Children.Add(configPanel);

                    conditionPanel.Child = conditionContent;
                    conditionsContainer.Children.Add(conditionPanel);

                    // Opérateur logique (sauf pour la dernière condition)
                    if (i < Result.Conditions.Count - 1)
                    {
                        var operatorPanel = new StackPanel
                        {
                            Orientation = Orientation.Horizontal,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Margin = new Thickness(0, 0, 0, 12)
                        };

                        var operatorLabel = new TextBlock
                        {
                            Text = "Opérateur:",
                            FontSize = 12,
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(0, 0, 8, 0)
                        };
                        operatorPanel.Children.Add(operatorLabel);

                        var operatorComboBox = new ComboBox
                        {
                            Width = 100,
                            FontSize = 12
                        };
                        operatorComboBox.Items.Add("ET (AND)");
                        operatorComboBox.Items.Add("OU (OR)");

                        // Initialiser la valeur
                        if (i < Result.Operators.Count)
                        {
                            operatorComboBox.SelectedIndex = Result.Operators[i] == LogicalOperator.AND ? 0 : 1;
                        }
                        else
                        {
                            operatorComboBox.SelectedIndex = 0; // AND par défaut
                            if (Result.Operators.Count <= i)
                            {
                                while (Result.Operators.Count <= i)
                                {
                                    Result.Operators.Add(LogicalOperator.AND);
                                }
                            }
                        }

                        var operatorIndex = i; // Capture pour la closure
                        operatorComboBox.SelectionChanged += (s, e) =>
                        {
                            if (operatorComboBox.SelectedIndex >= 0)
                            {
                                if (operatorIndex < Result.Operators.Count)
                                {
                                    Result.Operators[operatorIndex] = operatorComboBox.SelectedIndex == 0 
                                        ? LogicalOperator.AND 
                                        : LogicalOperator.OR;
                                }
                                else
                                {
                                    while (Result.Operators.Count <= operatorIndex)
                                    {
                                        Result.Operators.Add(LogicalOperator.AND);
                                    }
                                    Result.Operators[operatorIndex] = operatorComboBox.SelectedIndex == 0 
                                        ? LogicalOperator.AND 
                                        : LogicalOperator.OR;
                                }
                            }
                        };

                        operatorPanel.Children.Add(operatorComboBox);
                        conditionsContainer.Children.Add(operatorPanel);
                    }
                }
            }

            // Bouton pour ajouter une condition
            var addConditionButton = new Button
            {
                Content = "+ Ajouter une condition",
                Width = 200,
                Height = 32,
                Margin = new Thickness(0, 12, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Left
            };
            addConditionButton.Click += (s, e) =>
            {
                // Créer une nouvelle condition par défaut
                var newCondition = new ConditionItem
                {
                    ConditionType = ConditionType.Boolean,
                    Condition = true
                };
                Result!.Conditions.Add(newCondition);
                
                // Ajouter un opérateur si nécessaire
                if (Result.Conditions.Count > 1 && Result.Operators.Count < Result.Conditions.Count - 1)
                {
                    Result.Operators.Add(LogicalOperator.AND);
                }
                
                RefreshConditionsUI();
            };
            ConfigContentPanel.Children.Add(addConditionButton);

            // Initialiser l'UI
            RefreshConditionsUI();
        }

        private string GetConditionTypeName(ConditionType type)
        {
            return type switch
            {
                ConditionType.Boolean => "Booléenne",
                ConditionType.ActiveApplication => "Application active",
                ConditionType.KeyboardKey => "Touche clavier",
                ConditionType.ProcessRunning => "Processus ouvert",
                ConditionType.PixelColor => "Pixel couleur",
                ConditionType.MousePosition => "Position souris",
                ConditionType.TimeDate => "Temps/Date",
                ConditionType.ImageOnScreen => "Image à l'écran",
                ConditionType.TextOnScreen => "Texte à l'écran",
                ConditionType.Variable => "Variable",
                ConditionType.MouseClick => "Clic",
                _ => "Inconnue"
            };
        }

        private StackPanel CreateConditionConfigPanel(ConditionItem condition)
        {
            var panel = new StackPanel();
            
            // Sélecteur de type de condition
            var typeLabel = new TextBlock
            {
                Text = "Type:",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            panel.Children.Add(typeLabel);

            var typeComboBox = new ComboBox
            {
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 8)
            };
            typeComboBox.Items.Add("Booléenne");
            typeComboBox.Items.Add("Application active");
            typeComboBox.Items.Add("Touche clavier");
            typeComboBox.Items.Add("Processus ouvert");
            typeComboBox.Items.Add("Pixel couleur");
            typeComboBox.Items.Add("Position souris");
            typeComboBox.Items.Add("Temps/Date");
            typeComboBox.Items.Add("Image à l'écran");
            typeComboBox.Items.Add("Texte à l'écran");
            typeComboBox.Items.Add("Variable");
            typeComboBox.Items.Add("Clic");

            typeComboBox.SelectedIndex = (int)condition.ConditionType;
            typeComboBox.SelectionChanged += (s, e) =>
            {
                if (typeComboBox.SelectedIndex >= 0)
                {
                    condition.ConditionType = (ConditionType)typeComboBox.SelectedIndex;
                    // Réinitialiser les configurations
                    condition.ActiveApplicationConfig = null;
                    condition.KeyboardKeyConfig = null;
                    condition.ProcessRunningConfig = null;
                    condition.PixelColorConfig = null;
                    condition.MousePositionConfig = null;
                    condition.TimeDateConfig = null;
                    condition.ImageOnScreenConfig = null;
                    condition.TextOnScreenConfig = null;
                    condition.VariableName = null;
                    condition.MouseClickConfig = null;
                    // Recharger l'UI
                    LoadConfiguration();
                }
            };
            panel.Children.Add(typeComboBox);

            // Configuration spécifique selon le type
            var configPanel = new StackPanel();
            panel.Children.Add(configPanel);

            // Créer la configuration selon le type en utilisant les méthodes existantes
            // On modifie temporairement Result pour utiliser cette condition
            var tempResult = Result;
            var tempPanel = ConfigContentPanel;
            
            // Créer un IfAction temporaire avec cette condition
            Result = new IfAction { Conditions = new List<ConditionItem> { condition } };
            ConfigContentPanel = configPanel;
            
            try
            {
                switch (condition.ConditionType)
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
                    case ConditionType.Variable:
                        CreateVariableConfig();
                        break;
                    case ConditionType.MouseClick:
                        CreateMouseClickConfig();
                        break;
                }
            }
            finally
            {
                // Restaurer les valeurs
                Result = tempResult;
                ConfigContentPanel = tempPanel;
            }

            return panel;
        }

        private void CreateVariableConfig()
        {
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.Variable, VariableName = "" };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            var nameLabel = new TextBlock
            {
                Text = "Nom de la variable:",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel!.Children.Add(nameLabel);

            var nameTextBox = new TextBox
            {
                Text = condition.VariableName ?? "",
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 8),
                MaxLength = 100
            };
            nameTextBox.TextChanged += (s, e) =>
            {
                condition.VariableName = nameTextBox.Text?.Trim() ?? "";
            };
            ConfigContentPanel.Children.Add(nameTextBox);
        }

        private void CreateBooleanConfig()
        {
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.Boolean };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            var checkBox = new CheckBox
            {
                Content = "Condition vraie",
                IsChecked = condition.Condition,
                FontSize = 14
            };

            checkBox.Checked += (s, e) => condition.Condition = true;
            checkBox.Unchecked += (s, e) => condition.Condition = false;

            ConfigContentPanel.Children.Add(checkBox);
        }

        private void CreateActiveApplicationConfig()
        {
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.ActiveApplication };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.ActiveApplicationConfig == null)
                condition.ActiveApplicationConfig = new ActiveApplicationCondition();

            // Initialiser la liste si vide (compatibilité avec l'ancien format)
            if (condition.ActiveApplicationConfig.ProcessNames == null || condition.ActiveApplicationConfig.ProcessNames.Count == 0)
            {
                if (!string.IsNullOrEmpty(condition.ActiveApplicationConfig.ProcessName))
                {
                    condition.ActiveApplicationConfig.ProcessNames = new List<string> { condition.ActiveApplicationConfig.ProcessName };
                }
                else
                {
                    condition.ActiveApplicationConfig.ProcessNames = new List<string>();
                }
            }

            // Description
            var descriptionText = new TextBlock
            {
                Text = "Sélectionnez les applications pour lesquelles cette condition sera vraie.",
                Foreground = Brushes.White,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 10),
                FontSize = 12
            };
            ConfigContentPanel.Children.Add(descriptionText);

            // Éléments pour la section Sélection actuelle (déclarés avant les closures)
            var selectionCountText = new TextBlock
            {
                FontSize = 12,
                Foreground = GetDialogBrush("TextMutedBrush") ?? Brushes.Gray,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(6, 0, 0, 0)
            };
            var chipsPanel = new WrapPanel { MinHeight = 24, Margin = new Thickness(0, 0, 0, 8), VerticalAlignment = VerticalAlignment.Top, HorizontalAlignment = HorizontalAlignment.Left };

            // Bouton pour ouvrir le dialogue de sélection
            var selectAppsButton = new Button
            {
                Content = "Choisir les applications...",
                Style = (Style)FindResource("DialogContentButton"),
                Margin = new Thickness(0, 0, 0, 8),
                HorizontalAlignment = HorizontalAlignment.Left
            };

            selectAppsButton.Click += (s, e) =>
            {
                var dialog = new AppSelectorDialog
                {
                    Owner = this,
                    SelectedApplications = condition.ActiveApplicationConfig!.ProcessNames.ToList()
                };
                if (dialog.ShowDialog() == true)
                {
                    condition.ActiveApplicationConfig.ProcessNames = dialog.SelectedApplications;
                    UpdateSelectedAppsDisplay();
                }
            };

            ConfigContentPanel.Children.Add(selectAppsButton);

            // Sélection actuelle (style AppSelectorDialog)
            var selectionSection = new Border
            {
                Background = DialogBrush("BackgroundTertiaryBrush"),
                BorderBrush = DialogBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 12),
                Height = 150
            };

            var selectionGrid = new Grid();
            selectionGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            selectionGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            selectionGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            var selectionTitle = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
            selectionTitle.Children.Add(new TextBlock
            {
                Text = "Sélection actuelle",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = DialogBrush("TextPrimaryBrush"),
                VerticalAlignment = VerticalAlignment.Center
            });
            selectionTitle.Children.Add(selectionCountText);
            Grid.SetRow(selectionTitle, 0);
            selectionGrid.Children.Add(selectionTitle);

            var chipsHost = new Grid();
            chipsHost.Children.Add(chipsPanel);
            var chipsScroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Margin = new Thickness(0, 0, 0, 8),
                CanContentScroll = false,
                Content = chipsHost
            };
            Grid.SetRow(chipsScroll, 1);
            selectionGrid.Children.Add(chipsScroll);

            var addBar = new Grid { Margin = new Thickness(0, 4, 0, 0) };
            addBar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            addBar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            addBar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            addBar.Children.Add(new TextBlock
            {
                Text = "Ajouter un processus par nom :",
                FontSize = 12,
                Foreground = DialogBrush("TextSecondaryBrush"),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            });
            Grid.SetColumn(addBar.Children[addBar.Children.Count - 1], 0);

            var addTextBox = new TextBox
            {
                FontSize = 12,
                Padding = new Thickness(6, 4, 6, 4),
                Background = DialogBrush("BackgroundPrimaryBrush"),
                Foreground = DialogBrush("TextPrimaryBrush"),
                BorderBrush = DialogBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 8, 0)
            };
            addBar.Children.Add(addTextBox);
            Grid.SetColumn(addBar.Children[addBar.Children.Count - 1], 1);

            var addButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Plus, 14),
                Style = (Style)FindResource("DialogContentButton"),
                Width = 32,
                Height = 28
            };
            var addIcon = LucideIcons.CreateIcon(LucideIcons.Plus, 14);
            addIcon.Foreground = DialogBrush("TextPrimaryBrush");
            addButton.Content = addIcon;
            void AddManualProcess()
            {
                var raw = addTextBox.Text?.Trim();
                if (string.IsNullOrEmpty(raw)) return;
                var name = raw.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? raw[..^4] : raw;
                if (name.Length == 0) return;
                if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[a-zA-Z0-9_.\-]{1,260}$"))
                {
                    MessageBox.Show(this, "Nom de processus invalide. Utilisez uniquement des lettres, chiffres, tirets, points et underscores.", "Nom invalide", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                if (!condition.ActiveApplicationConfig!.ProcessNames.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase)))
                {
                    condition.ActiveApplicationConfig.ProcessNames.Add(name);
                    UpdateSelectedAppsDisplay();
                }
                addTextBox.Clear();
            }

            addButton.Click += (s, ev) => AddManualProcess();
            addTextBox.KeyDown += (s, ev) =>
            {
                if (ev.Key == Key.Enter) { AddManualProcess(); ev.Handled = true; }
            };
            addBar.Children.Add(addButton);
            Grid.SetColumn(addBar.Children[addBar.Children.Count - 1], 2);
            Grid.SetRow(addBar, 2);
            selectionGrid.Children.Add(addBar);

            selectionSection.Child = selectionGrid;
            ConfigContentPanel.Children.Add(selectionSection);

            void UpdateSelectedAppsDisplay()
            {
                chipsPanel.Children.Clear();
                var names = condition.ActiveApplicationConfig?.ProcessNames ?? new List<string>();
                selectionCountText.Text = names.Count == 0 ? " (aucune – condition vraie partout)" : $" ({names.Count} application{(names.Count > 1 ? "s" : "")})";
                if (names.Count == 0)
                {
                    chipsPanel.Children.Add(new TextBlock
                    {
                        Text = "Aucune application. La condition sera vraie dans toutes les applications.",
                        Foreground = GetDialogBrush("TextMutedBrush") ?? Brushes.Gray,
                        FontStyle = FontStyles.Italic,
                        FontSize = 12
                    });
                }
                else
                {
                    var chipBg = DialogBrush("BackgroundSecondaryBrush");
                    var chipBorder = DialogBrush("BorderLightBrush");
                    var chipFg = DialogBrush("TextPrimaryBrush");
                    var removeFg = DialogBrush("TextSecondaryBrush");
                    foreach (var app in names.OrderBy(a => a))
                    {
                        var border = new Border
                        {
                            Background = chipBg,
                            BorderBrush = chipBorder,
                            BorderThickness = new Thickness(1),
                            CornerRadius = new CornerRadius(4),
                            Padding = new Thickness(6, 2, 4, 2),
                            Margin = new Thickness(0, 0, 6, 6)
                        };
                        var chipGrid = new Grid();
                        chipGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        chipGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        chipGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        chipGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(20) });
                        var col = 0;
                        var iconContainer = new Grid { Width = 14, Height = 14 };
                        var img = new System.Windows.Controls.Image
                        {
                            Width = 14,
                            Height = 14,
                            Stretch = Stretch.Uniform,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center
                        };
                        RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                        if (ProcessMonitor.TryGetCachedIcon(app, out var cachedIcon) && cachedIcon != null)
                        {
                            img.Source = cachedIcon;
                            iconContainer.Children.Add(img);
                        }
                        else
                        {
                            var placeholder = new TextBlock
                            {
                                Text = LucideIcons.RefreshCcw,
                                FontSize = 12,
                                VerticalAlignment = VerticalAlignment.Center,
                                HorizontalAlignment = HorizontalAlignment.Center,
                                Foreground = chipFg,
                                RenderTransformOrigin = new Point(0.5, 0.5),
                                RenderTransform = new RotateTransform(0)
                            };
                            placeholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
                            placeholder.Loaded += (s, _) =>
                            {
                                var rt = (RotateTransform)placeholder.RenderTransform;
                                var anim = new DoubleAnimation(0, -360, new Duration(TimeSpan.FromSeconds(1)))
                                {
                                    RepeatBehavior = RepeatBehavior.Forever
                                };
                                rt.BeginAnimation(RotateTransform.AngleProperty, anim);
                            };
                            iconContainer.Children.Add(placeholder);
                            iconContainer.Children.Add(img);
                            _ = Task.Run(() =>
                            {
                                var icon = ProcessMonitor.GetIconForProcessName(app);
                                if (icon != null)
                                    Dispatcher.BeginInvoke(new Action(() =>
                                    {
                                        img.Source = icon;
                                        ((RotateTransform)placeholder.RenderTransform).BeginAnimation(RotateTransform.AngleProperty, null);
                                        placeholder.Visibility = Visibility.Collapsed;
                                    }));
                            });
                        }
                        Grid.SetRow(iconContainer, 0);
                        Grid.SetColumn(iconContainer, col++);
                        chipGrid.Children.Add(iconContainer);
                        var txt = new TextBlock
                        {
                            Text = app,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Foreground = chipFg,
                            FontSize = 12,
                            Padding = new Thickness(0),
                            Margin = new Thickness(col == 1 ? 6 : 0, 0, 0, 0)
                        };
                        TextOptions.SetTextFormattingMode(txt, TextFormattingMode.Display);
                        Grid.SetRow(txt, 0);
                        Grid.SetColumn(txt, col++);
                        chipGrid.Children.Add(txt);
                        var removeIcon = LucideIcons.CreateIcon(LucideIcons.X, 10);
                        removeIcon.Foreground = removeFg;
                        var removeBtn = new Button
                        {
                            Foreground = removeFg,
                            Background = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            Padding = new Thickness(0),
                            Cursor = Cursors.Hand,
                            Tag = app,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Margin = new Thickness(6, 0, 0, 0),
                            Width = 18,
                            Height = 18,
                            Content = removeIcon
                        };
                        if (TryFindResource("ChipRemoveButtonStyle") is Style chipRemoveStyle)
                            removeBtn.Style = chipRemoveStyle;
                        removeBtn.Click += (se, ev) =>
                        {
                            if (se is Button b && b.Tag is string an)
                            {
                                condition.ActiveApplicationConfig?.ProcessNames?.Remove(an);
                                UpdateSelectedAppsDisplay();
                            }
                        };
                        Grid.SetRow(removeBtn, 0);
                        Grid.SetColumn(removeBtn, col);
                        chipGrid.Children.Add(removeBtn);
                        border.Child = chipGrid;
                        chipsPanel.Children.Add(border);
                    }
                }
            }

            UpdateSelectedAppsDisplay();

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
                Text = condition.ActiveApplicationConfig.WindowTitle ?? "",
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 8)
            };
            titleTextBox.TextChanged += (s, e) =>
            {
                condition.ActiveApplicationConfig!.WindowTitle = titleTextBox.Text;
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
            matchModeComboBox.SelectedIndex = (int)condition.ActiveApplicationConfig.TitleMatchMode;
            matchModeComboBox.SelectionChanged += (s, e) =>
            {
                if (matchModeComboBox.SelectedIndex >= 0)
                    condition.ActiveApplicationConfig!.TitleMatchMode = (TextMatchMode)matchModeComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(matchModeComboBox);

            // Option "Peu importe la fenêtre active"
            var anyWindowCheckBox = new CheckBox
            {
                Content = "Peu importe la fenêtre active (vérifie juste si le processus existe)",
                IsChecked = condition.ActiveApplicationConfig.AnyWindow,
                FontSize = 12,
                Margin = new Thickness(0, 8, 0, 0)
            };
            anyWindowCheckBox.Checked += (s, e) => condition.ActiveApplicationConfig!.AnyWindow = true;
            anyWindowCheckBox.Unchecked += (s, e) => condition.ActiveApplicationConfig!.AnyWindow = false;
            ConfigContentPanel.Children.Add(anyWindowCheckBox);
        }

        private void CreateKeyboardKeyConfig()
        {
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.KeyboardKey };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.KeyboardKeyConfig == null)
                condition.KeyboardKeyConfig = new KeyboardKeyCondition();

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
                Text = condition.KeyboardKeyConfig.VirtualKeyCode == 0 
                    ? "Appuyez sur une touche..." 
                    : GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode),
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 12),
                IsReadOnly = true,
                Background = DialogBrush("BackgroundTertiaryBrush"),
                BorderBrush = DialogBrush("BorderLightBrush"),
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
                    keyTextBox.Background = DialogBrush("AccentSelectionBrush");
                    keyTextBox.BorderBrush = DialogBrush("BorderFocusBrush");
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
                    if (!keyCaptured && condition.KeyboardKeyConfig.VirtualKeyCode == 0)
                    {
                        keyTextBox.Text = "Appuyez sur une touche...";
                        keyTextBox.Background = DialogBrush("BackgroundTertiaryBrush");
                        keyTextBox.BorderBrush = DialogBrush("BorderLightBrush");
                    }
                    else
                    {
                        keyTextBox.Text = GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode);
                        keyTextBox.Background = DialogBrush("BackgroundTertiaryBrush");
                        keyTextBox.BorderBrush = DialogBrush("BorderLightBrush");
                    }
                    return;
                }

                // Capturer la touche
                try
                {
                    int virtualKeyCode = KeyInterop.VirtualKeyFromKey(e.Key);
                    if (virtualKeyCode > 0)
                    {
                        condition.KeyboardKeyConfig!.VirtualKeyCode = (ushort)virtualKeyCode;
                        keyTextBox.Text = GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode);
                        keyCaptured = true;
                        keyTextBox.Background = DialogBrush("BackgroundTertiaryBrush");
                        keyTextBox.BorderBrush = DialogBrush("BorderLightBrush");
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
                if (!keyCaptured && condition.KeyboardKeyConfig.VirtualKeyCode == 0)
                {
                    keyTextBox.Text = "Appuyez sur une touche...";
                }
                else if (condition.KeyboardKeyConfig.VirtualKeyCode > 0)
                {
                    keyTextBox.Text = GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode);
                }
                keyTextBox.Background = DialogBrush("BackgroundTertiaryBrush");
                keyTextBox.BorderBrush = DialogBrush("BorderLightBrush");
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
            stateComboBox.SelectedIndex = (int)condition.KeyboardKeyConfig.State;
            stateComboBox.SelectionChanged += (s, e) =>
            {
                if (stateComboBox.SelectedIndex >= 0)
                    condition.KeyboardKeyConfig!.State = (KeyState)stateComboBox.SelectedIndex;
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
                IsChecked = condition.KeyboardKeyConfig.RequireCtrl,
                FontSize = 12
            };
            ctrlCheckBox.Checked += (s, e) => condition.KeyboardKeyConfig!.RequireCtrl = true;
            ctrlCheckBox.Unchecked += (s, e) => condition.KeyboardKeyConfig!.RequireCtrl = false;
            ConfigContentPanel.Children.Add(ctrlCheckBox);

            var altCheckBox = new CheckBox
            {
                Content = "Alt",
                IsChecked = condition.KeyboardKeyConfig.RequireAlt,
                FontSize = 12
            };
            altCheckBox.Checked += (s, e) => condition.KeyboardKeyConfig!.RequireAlt = true;
            altCheckBox.Unchecked += (s, e) => condition.KeyboardKeyConfig!.RequireAlt = false;
            ConfigContentPanel.Children.Add(altCheckBox);

            var shiftCheckBox = new CheckBox
            {
                Content = "Shift",
                IsChecked = condition.KeyboardKeyConfig.RequireShift,
                FontSize = 12
            };
            shiftCheckBox.Checked += (s, e) => condition.KeyboardKeyConfig!.RequireShift = true;
            shiftCheckBox.Unchecked += (s, e) => condition.KeyboardKeyConfig!.RequireShift = false;
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
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.ProcessRunning };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.ProcessRunningConfig == null)
                condition.ProcessRunningConfig = new ProcessRunningCondition();

            // Initialiser la liste si vide (compatibilité avec l'ancien format)
            if (condition.ProcessRunningConfig.ProcessNames == null || condition.ProcessRunningConfig.ProcessNames.Count == 0)
            {
                if (!string.IsNullOrEmpty(condition.ProcessRunningConfig.ProcessName))
                {
                    condition.ProcessRunningConfig.ProcessNames = new List<string> { condition.ProcessRunningConfig.ProcessName };
                }
                else
                {
                    condition.ProcessRunningConfig.ProcessNames = new List<string>();
                }
            }

            var selectedProcessNames = new HashSet<string>(condition.ProcessRunningConfig.ProcessNames, StringComparer.OrdinalIgnoreCase);
            var allProcesses = new ObservableCollection<SelectableProcessInfo>();
            var filteredProcesses = new ObservableCollection<SelectableProcessInfo>();

            // Description
            var descriptionText = new TextBlock
            {
                Text = "Sélectionnez les processus qui doivent être ouverts pour que cette condition soit vraie.",
                Foreground = Brushes.White,
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
                condition.ProcessRunningConfig!.ProcessNames = selectedProcessNames.ToList();

                if (selectedProcessNames.Count == 0)
                {
                    selectedAppsPanel.Children.Add(new TextBlock
                    {
                        Text = "Aucun processus sélectionné",
                        Foreground = Brushes.White,
                        FontStyle = FontStyles.Italic
                    });
                }
                else
                {
                    foreach (var app in selectedProcessNames.OrderBy(a => a))
                    {
                        var border = new Border
                        {
                            Background = DialogBrush("BackgroundTertiaryBrush"),
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
                IsChecked = condition.ProcessRunningConfig.AnyWindow,
                FontSize = 12,
                Margin = new Thickness(0, 8, 0, 0)
            };
            anyWindowCheckBox.Checked += (s, e) => condition.ProcessRunningConfig!.AnyWindow = true;
            anyWindowCheckBox.Unchecked += (s, e) => condition.ProcessRunningConfig!.AnyWindow = false;
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
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.PixelColor };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.PixelColorConfig == null)
                condition.PixelColorConfig = new PixelColorCondition();

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
                Text = condition.PixelColorConfig.X.ToString(),
                FontSize = 12
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                    condition.PixelColorConfig!.X = x;
            };

            var yLabel = new TextBlock { Text = "Y:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var yTextBox = new TextBox
            {
                Width = 80,
                Text = condition.PixelColorConfig.Y.ToString(),
                FontSize = 12
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                    condition.PixelColorConfig!.Y = y;
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
                BorderBrush = DialogBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            
            // Initialiser la couleur de prévisualisation
            try
            {
                string hex = condition.PixelColorConfig.ExpectedColor.TrimStart('#');
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
                colorPreviewBorder.Background = DialogBrush("BackgroundSecondaryBrush");
            }

            var colorTextBox = new TextBox
            {
                Text = condition.PixelColorConfig.ExpectedColor,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                MinWidth = 120,
                ToolTip = "Format: #FF0000"
            };
            colorTextBox.TextChanged += (s, e) =>
            {
                condition.PixelColorConfig!.ExpectedColor = colorTextBox.Text;
                
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
                        condition.PixelColorConfig!.X = colorPicker.SelectedX;
                        condition.PixelColorConfig!.Y = colorPicker.SelectedY;
                        condition.PixelColorConfig!.ExpectedColor = colorPicker.ColorHex;
                        
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
                Text = condition.PixelColorConfig?.Tolerance.ToString() ?? "0",
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
            modeComboBox.SelectedIndex = (int)(condition.PixelColorConfig?.MatchMode ?? ColorMatchMode.RGB);
            modeComboBox.SelectionChanged += (s, e) =>
            {
                if (modeComboBox.SelectedIndex >= 0)
                    Result.PixelColorConfig!.MatchMode = (ColorMatchMode)modeComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(modeComboBox);
        }

        private void CreateMousePositionConfig()
        {
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.MousePosition };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.MousePositionConfig == null)
                condition.MousePositionConfig = new MousePositionCondition();

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
                Text = condition.MousePositionConfig.X1.ToString(),
                FontSize = 12
            };
            x1TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(x1TextBox.Text, out int x1))
                    condition.MousePositionConfig!.X1 = x1;
            };

            var y1Label = new TextBlock { Text = "Y1:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var y1TextBox = new TextBox
            {
                Width = 80,
                Text = condition.MousePositionConfig.Y1.ToString(),
                FontSize = 12
            };
            y1TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(y1TextBox.Text, out int y1))
                    condition.MousePositionConfig!.Y1 = y1;
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
                Text = condition.MousePositionConfig.X2.ToString(),
                FontSize = 12
            };
            x2TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(x2TextBox.Text, out int x2))
                    condition.MousePositionConfig!.X2 = x2;
            };

            var y2Label = new TextBlock { Text = "Y2:", Margin = new Thickness(12, 0, 4, 0), VerticalAlignment = VerticalAlignment.Center };
            var y2TextBox = new TextBox
            {
                Width = 80,
                Text = condition.MousePositionConfig.Y2.ToString(),
                FontSize = 12
            };
            y2TextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(y2TextBox.Text, out int y2))
                    condition.MousePositionConfig!.Y2 = y2;
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
                        condition.MousePositionConfig!.X1 = zoneSelector.X1;
                        condition.MousePositionConfig!.Y1 = zoneSelector.Y1;
                        condition.MousePositionConfig!.X2 = zoneSelector.X2;
                        condition.MousePositionConfig!.Y2 = zoneSelector.Y2;
                        
                        // Mettre à jour les champs
                        x1TextBox.Text = condition.MousePositionConfig.X1.ToString();
                        y1TextBox.Text = condition.MousePositionConfig.Y1.ToString();
                        x2TextBox.Text = condition.MousePositionConfig.X2.ToString();
                        y2TextBox.Text = condition.MousePositionConfig.Y2.ToString();
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
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.TimeDate };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.TimeDateConfig == null)
                condition.TimeDateConfig = new TimeDateCondition();

            // Aperçu de la condition
            var previewTextBlock = new TextBlock
            {
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 15),
                TextWrapping = TextWrapping.Wrap
            };
            ConfigContentPanel.Children.Add(previewTextBlock);

            void UpdatePreview()
            {
                var type = condition.TimeDateConfig!.ComparisonType;
                var op = condition.TimeDateConfig.Operator;
                var value = condition.TimeDateConfig.Value;

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

            var typeIndex = condition.TimeDateConfig.ComparisonType switch
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
            operatorComboBox.SelectedIndex = (int)(condition.TimeDateConfig?.Operator ?? TimeComparisonOperator.Equals);

            typeComboBox.SelectionChanged += (s, e) =>
            {
                if (typeComboBox.SelectedIndex >= 0)
                {
                    condition.TimeDateConfig!.ComparisonType = typeComboBox.SelectedIndex switch
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
                    condition.TimeDateConfig!.Operator = (TimeComparisonOperator)operatorComboBox.SelectedIndex;
                    UpdatePreview();
                }
            };
            ConfigContentPanel.Children.Add(operatorComboBox);
            ConfigContentPanel.Children.Add(valueContainer);

            void UpdateValueControls()
            {
                valueContainer.Children.Clear();

                var type = condition.TimeDateConfig!.ComparisonType;

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
                        hourTextBox.Text = condition.TimeDateConfig.Value.ToString();
                        minuteTextBox.Text = "0";
                        minuteTextBox.IsEnabled = false;
                    }
                    else // Minute
                    {
                        var totalMinutes = condition.TimeDateConfig.Value;
                        hourTextBox.Text = (totalMinutes / 60).ToString();
                        minuteTextBox.Text = (totalMinutes % 60).ToString();
                    }

                    hourTextBox.TextChanged += (s, e) =>
                    {
                        if (int.TryParse(hourTextBox.Text, out int hours))
                        {
                            if (type == "Hour")
                            {
                                condition.TimeDateConfig!.Value = Math.Max(0, Math.Min(23, hours));
                                hourTextBox.Text = condition.TimeDateConfig.Value.ToString();
                            }
                            else // Minute
                            {
                                if (int.TryParse(minuteTextBox.Text, out int minutes))
                                {
                                    condition.TimeDateConfig!.Value = hours * 60 + Math.Max(0, Math.Min(59, minutes));
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
                            condition.TimeDateConfig!.Value = hours * 60 + Math.Max(0, Math.Min(59, minutes));
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
                        var dayIndex = Math.Max(0, Math.Min(6, condition.TimeDateConfig.Value));
                        dayComboBox.SelectedIndex = dayIndex;
                        
                        dayComboBox.SelectionChanged += (s, e) =>
                        {
                            if (dayComboBox.SelectedIndex >= 0)
                            {
                                condition.TimeDateConfig!.Value = dayComboBox.SelectedIndex;
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
                        
                        monthComboBox.SelectedIndex = Math.Max(0, Math.Min(11, condition.TimeDateConfig.Value - 1));
                        monthComboBox.SelectionChanged += (s, e) =>
                        {
                            if (monthComboBox.SelectedIndex >= 0)
                            {
                                condition.TimeDateConfig!.Value = monthComboBox.SelectedIndex + 1;
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
                        var selectedYear = condition.TimeDateConfig.Value;
                        if (selectedYear >= currentYear - 10 && selectedYear <= currentYear + 10)
                        {
                            yearComboBox.SelectedIndex = selectedYear - (currentYear - 10);
                        }
                        
                        yearComboBox.SelectionChanged += (s, e) =>
                        {
                            if (yearComboBox.SelectedIndex >= 0 && 
                                int.TryParse(yearComboBox.SelectedItem?.ToString(), out int year))
                            {
                                condition.TimeDateConfig!.Value = year;
                                UpdatePreview();
                            }
                        };
                        
                        var yearTextBox = new TextBox
                        {
                            Width = 80,
                            FontSize = 12,
                            Text = condition.TimeDateConfig.Value.ToString(),
                            ToolTip = "Ou saisissez une année (1900-2100)"
                        };
                        yearTextBox.TextChanged += (s, e) =>
                        {
                            if (int.TryParse(yearTextBox.Text, out int year))
                            {
                                var validYear = Math.Max(1900, Math.Min(2100, year));
                                condition.TimeDateConfig!.Value = validYear;
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
                            Foreground = Brushes.White
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
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.ImageOnScreen };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.ImageOnScreenConfig == null)
                condition.ImageOnScreenConfig = new ImageOnScreenCondition();

            // Aperçu de l'image
            var imagePreviewBorder = new Border
            {
                BorderBrush = DialogBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Background = DialogBrush("BackgroundTertiaryBrush"),
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
                    if (!string.IsNullOrEmpty(condition.ImageOnScreenConfig!.ImagePath) && 
                        System.IO.File.Exists(condition.ImageOnScreenConfig.ImagePath))
                    {
                        var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                        bitmap.BeginInit();
                        bitmap.UriSource = new Uri(condition.ImageOnScreenConfig.ImagePath, UriKind.Absolute);
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
                Text = condition.ImageOnScreenConfig.ImagePath,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                MinWidth = 300
            };
            pathTextBox.TextChanged += (s, e) =>
            {
                condition.ImageOnScreenConfig!.ImagePath = pathTextBox.Text;
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

            var pasteButton = new Button
            {
                Content = "📋 Coller",
                Width = 100,
                Height = 28,
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Coller une image depuis le presse-papiers"
            };
            pasteButton.Click += (s, e) =>
            {
                try
                {
                    if (System.Windows.Clipboard.ContainsImage())
                    {
                        var clipboardImage = System.Windows.Clipboard.GetImage();
                        if (clipboardImage != null)
                        {
                            // Créer le dossier Images s'il n'existe pas
                            var imagesDirectory = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Data", "Images");
                            if (!System.IO.Directory.Exists(imagesDirectory))
                            {
                                System.IO.Directory.CreateDirectory(imagesDirectory);
                            }

                            // Générer un nom de fichier unique
                            var fileName = $"image_{DateTime.Now:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}.png";
                            var filePath = System.IO.Path.Combine(imagesDirectory, fileName);

                            // Convertir l'image en BitmapSource et la sauvegarder
                            var encoder = new System.Windows.Media.Imaging.PngBitmapEncoder();
                            encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(clipboardImage));

                            using (var fileStream = new System.IO.FileStream(filePath, System.IO.FileMode.Create))
                            {
                                encoder.Save(fileStream);
                            }

                            // Mettre à jour le chemin et l'aperçu
                            pathTextBox.Text = filePath;
                            MessageBox.Show($"Image collée et sauvegardée avec succès !\n{filePath}", 
                                "Succès", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                        else
                        {
                            MessageBox.Show("Aucune image trouvée dans le presse-papiers.", 
                                "Erreur", MessageBoxButton.OK, MessageBoxImage.Warning);
                        }
                    }
                    else
                    {
                        MessageBox.Show("Le presse-papiers ne contient pas d'image.\nCopiez d'abord une image (Capture d'écran, image depuis un navigateur, etc.).", 
                            "Presse-papiers vide", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erreur lors du collage de l'image : {ex.Message}", 
                        "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };

            pathPanel.Children.Add(pathTextBox);
            pathPanel.Children.Add(browseButton);
            pathPanel.Children.Add(pasteButton);
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
                Value = condition.ImageOnScreenConfig.Sensitivity,
                Width = 200,
                TickFrequency = 10,
                IsSnapToTickEnabled = true,
                VerticalAlignment = VerticalAlignment.Center
            };

            var sensitivityValueText = new TextBlock
            {
                Text = $"{condition.ImageOnScreenConfig.Sensitivity}%",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                MinWidth = 50,
                Margin = new Thickness(10, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            sensitivitySlider.ValueChanged += (s, e) =>
            {
                var value = (int)sensitivitySlider.Value;
                condition.ImageOnScreenConfig!.Sensitivity = value;
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
                Text = "Zone actuelle: " + (condition.ImageOnScreenConfig.SearchArea != null && condition.ImageOnScreenConfig.SearchArea.Length == 4
                    ? $"({condition.ImageOnScreenConfig.SearchArea[0]}, {condition.ImageOnScreenConfig.SearchArea[1]}) - ({condition.ImageOnScreenConfig.SearchArea[2]}, {condition.ImageOnScreenConfig.SearchArea[3]})"
                    : "Tout l'écran"),
                FontSize = 11,
                Foreground = Brushes.White,
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
                        condition.ImageOnScreenConfig!.SearchArea = new int[]
                        {
                            zoneSelector.X1,
                            zoneSelector.Y1,
                            zoneSelector.X2,
                            zoneSelector.Y2
                        };
                        searchAreaInfoText.Text = $"Zone: ({condition.ImageOnScreenConfig.SearchArea[0]}, {condition.ImageOnScreenConfig.SearchArea[1]}) - ({condition.ImageOnScreenConfig.SearchArea[2]}, {condition.ImageOnScreenConfig.SearchArea[3]})";
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
                condition.ImageOnScreenConfig!.SearchArea = null;
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
            // Utiliser la première condition ou créer une nouvelle
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.TextOnScreen };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.TextOnScreenConfig == null)
                condition.TextOnScreenConfig = new TextOnScreenCondition();

            // Aperçu de la condition
            var previewTextBlock = new TextBlock
            {
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 15),
                TextWrapping = TextWrapping.Wrap
            };
            ConfigContentPanel.Children.Add(previewTextBlock);

            void UpdatePreview()
            {
                var text = condition.TextOnScreenConfig!.Text;
                if (string.IsNullOrWhiteSpace(text))
                {
                    previewTextBlock.Text = "Aucun texte défini";
                    previewTextBlock.Foreground = Brushes.White;
                }
                else
                {
                    var previewText = text.Length > 50 ? text.Substring(0, 50) + "..." : text;
                    previewTextBlock.Text = $"Rechercher: \"{previewText}\"";
                    previewTextBlock.Foreground = Brushes.White;
                }
            }

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
                Text = condition.TextOnScreenConfig.Text,
                FontSize = 12,
                MinHeight = 120,
                MaxHeight = 200,
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Margin = new Thickness(0, 0, 0, 12)
            };
            textTextBox.TextChanged += (s, e) =>
            {
                condition.TextOnScreenConfig!.Text = textTextBox.Text;
                UpdatePreview();
            };
            ConfigContentPanel.Children.Add(textTextBox);

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
                Text = "Zone actuelle: " + (condition.TextOnScreenConfig.SearchArea != null && condition.TextOnScreenConfig.SearchArea.Length == 4
                    ? $"({condition.TextOnScreenConfig.SearchArea[0]}, {condition.TextOnScreenConfig.SearchArea[1]}) - ({condition.TextOnScreenConfig.SearchArea[2]}, {condition.TextOnScreenConfig.SearchArea[3]})"
                    : "Tout l'écran"),
                FontSize = 11,
                Foreground = Brushes.White,
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
                        condition.TextOnScreenConfig!.SearchArea = new int[]
                        {
                            zoneSelector.X1,
                            zoneSelector.Y1,
                            zoneSelector.X2,
                            zoneSelector.Y2
                        };
                        searchAreaInfoText.Text = $"Zone: ({condition.TextOnScreenConfig.SearchArea[0]}, {condition.TextOnScreenConfig.SearchArea[1]}) - ({condition.TextOnScreenConfig.SearchArea[2]}, {condition.TextOnScreenConfig.SearchArea[3]})";
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erreur lors de la sélection de zone: {ex.Message}", 
                        "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
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
                condition.TextOnScreenConfig!.SearchArea = null;
                searchAreaInfoText.Text = "Zone actuelle: Tout l'écran";
            };

            searchAreaPanel.Children.Add(searchAreaInfoText);
            searchAreaPanel.Children.Add(selectZoneButton);
            searchAreaPanel.Children.Add(clearZoneButton);
            ConfigContentPanel.Children.Add(searchAreaPanel);

            // Informations supplémentaires
            var infoText = new TextBlock
            {
                Text = "💡 Astuce: Le texte sera recherché à l'écran en utilisant la reconnaissance optique de caractères (OCR).\nAssurez-vous que le texte est clairement visible et lisible.",
                FontSize = 11,
                Foreground = Brushes.White,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 8, 0, 0)
            };
            ConfigContentPanel.Children.Add(infoText);

            // Initialiser l'aperçu
            UpdatePreview();
        }

        private void CreateMouseClickConfig()
        {
            ConditionItem condition;
            if (Result!.Conditions.Count == 0)
            {
                condition = new ConditionItem { ConditionType = ConditionType.MouseClick, MouseClickConfig = new MouseClickCondition() };
                Result.Conditions.Add(condition);
            }
            else
            {
                condition = Result.Conditions[0];
            }

            if (condition.MouseClickConfig == null)
                condition.MouseClickConfig = new MouseClickCondition();

            var clickLabel = new TextBlock
            {
                Text = "Bouton de souris:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            ConfigContentPanel.Children.Add(clickLabel);

            var clickComboBox = new ComboBox
            {
                FontSize = 12,
                MinWidth = 180,
                Margin = new Thickness(0, 0, 0, 8)
            };
            clickComboBox.Items.Add("Clic gauche");
            clickComboBox.Items.Add("Clic droit");
            clickComboBox.Items.Add("Clic milieu");
            clickComboBox.Items.Add("Maintenir gauche");
            clickComboBox.Items.Add("Maintenir droit");
            clickComboBox.Items.Add("Maintenir milieu");
            clickComboBox.Items.Add("Molette haut");
            clickComboBox.Items.Add("Molette bas");
            clickComboBox.SelectedIndex = Math.Max(0, Math.Min(condition.MouseClickConfig.ClickType, 7));
            clickComboBox.SelectionChanged += (s, e) =>
            {
                if (clickComboBox.SelectedIndex >= 0)
                    condition.MouseClickConfig!.ClickType = clickComboBox.SelectedIndex;
            };
            ConfigContentPanel.Children.Add(clickComboBox);

            var infoText = new TextBlock
            {
                Text = "Clic/Maintenir : vrai si le bouton est pressé. Molette : vrai si la molette a été utilisée récemment (haut/bas).",
                FontSize = 11,
                Foreground = Brushes.White,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 4, 0, 0)
            };
            ConfigContentPanel.Children.Add(infoText);
        }

        private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Escape)
                return;
            if (Keyboard.FocusedElement is not TextBox)
                return;
            RootBorder.Focus();
            e.Handled = true;
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                {
                    // Double-clic : basculer Agrandir / Restaurer
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
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
            DialogResult = false;
            Close();
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

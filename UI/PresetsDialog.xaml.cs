using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Storage;

namespace MacroEngine.UI
{
    public partial class PresetsDialog : Window
    {
        private readonly PresetStorage _presetStorage;
        private List<ActionPreset> _presets = new();
        
        // Événement déclenché quand l'utilisateur sélectionne un preset à insérer
        public event EventHandler<ActionPreset>? PresetSelected;

        public PresetsDialog(PresetStorage presetStorage)
        {
            InitializeComponent();
            _presetStorage = presetStorage;
            
            Loaded += async (s, e) =>
            {
                await LoadPresets();
            };
        }

        private async System.Threading.Tasks.Task LoadPresets()
        {
            try
            {
                _presets = await _presetStorage.LoadPresetsAsync();
                RefreshPresetsList();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors du chargement des presets:\n{ex.Message}", 
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void RefreshPresetsList()
        {
            PresetsStackPanel.Children.Clear();

            if (_presets.Count == 0)
            {
                EmptyStatePanel.Visibility = Visibility.Visible;
                return;
            }

            EmptyStatePanel.Visibility = Visibility.Collapsed;

            // Grouper par catégorie
            var groupedPresets = _presets.GroupBy(p => p.Category).OrderBy(g => g.Key);

            foreach (var group in groupedPresets)
            {
                // En-tête de catégorie
                var categoryHeader = new TextBlock
                {
                    Text = group.Key,
                    FontSize = 14,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = GetThemeBrush("TextPrimaryBrush"),
                    Margin = new Thickness(0, group.Key == _presets.First().Category ? 0 : 16, 0, 8)
                };
                PresetsStackPanel.Children.Add(categoryHeader);

                // Presets de cette catégorie
                foreach (var preset in group.OrderBy(p => p.Name))
                {
                    var presetCard = CreatePresetCard(preset);
                    PresetsStackPanel.Children.Add(presetCard);
                }
            }
        }

        private Border CreatePresetCard(ActionPreset preset)
        {
            var card = new Border
            {
                Background = GetThemeBrush("BackgroundTertiaryBrush"),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 8),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // Contenu principal
            var contentPanel = new StackPanel();

            var nameText = new TextBlock
            {
                Text = preset.Name,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = GetThemeBrush("TextPrimaryBrush"),
                Margin = new Thickness(0, 0, 0, 4)
            };
            contentPanel.Children.Add(nameText);

            if (!string.IsNullOrWhiteSpace(preset.Description))
            {
                var descText = new TextBlock
                {
                    Text = preset.Description,
                    FontSize = 12,
                    Foreground = GetThemeBrush("TextSecondaryBrush"),
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 0, 0, 6)
                };
                contentPanel.Children.Add(descText);
            }

            // Info sur les actions
            var actionsInfo = new TextBlock
            {
                Text = $"📋 {preset.Actions.Count} action{(preset.Actions.Count > 1 ? "s" : "")}",
                FontSize = 11,
                Foreground = GetThemeBrush("TextMutedBrush")
            };
            contentPanel.Children.Add(actionsInfo);

            Grid.SetColumn(contentPanel, 0);
            grid.Children.Add(contentPanel);

            // Boutons d'action
            var buttonsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Bouton Insérer
            var insertButton = new Button
            {
                Content = "Insérer",
                Style = (Style)FindResource("ButtonPrimary"),
                Padding = new Thickness(12, 6, 12, 6),
                Margin = new Thickness(0, 0, 8, 0)
            };
            insertButton.Click += (s, e) =>
            {
                // Fermer d'abord le dialog, puis déclencher l'événement
                var presetToInsert = preset;
                Close();
                
                // Déclencher l'événement après fermeture pour éviter les conflits UI
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    PresetSelected?.Invoke(this, presetToInsert);
                }), System.Windows.Threading.DispatcherPriority.Background);
            };
            buttonsPanel.Children.Add(insertButton);

            // Bouton Supprimer
            var deleteButton = new Button
            {
                Content = "🗑",
                Style = (Style)FindResource("ButtonIcon"),
                ToolTip = "Supprimer ce preset"
            };
            deleteButton.Click += async (s, e) =>
            {
                var result = MessageBox.Show(
                    $"Voulez-vous vraiment supprimer le preset '{preset.Name}' ?",
                    "Confirmation",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);

                if (result == MessageBoxResult.Yes)
                {
                    await DeletePreset(preset.Id);
                }
            };
            buttonsPanel.Children.Add(deleteButton);

            Grid.SetColumn(buttonsPanel, 1);
            grid.Children.Add(buttonsPanel);

            card.Child = grid;

            // Effet hover
            card.MouseEnter += (s, e) =>
            {
                card.Background = GetThemeBrush("BackgroundSecondaryBrush");
            };
            card.MouseLeave += (s, e) =>
            {
                card.Background = GetThemeBrush("BackgroundTertiaryBrush");
            };

            return card;
        }

        private async System.Threading.Tasks.Task DeletePreset(string presetId)
        {
            try
            {
                await _presetStorage.DeletePresetAsync(presetId);
                await LoadPresets();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors de la suppression du preset:\n{ex.Message}",
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private Brush GetThemeBrush(string resourceKey)
        {
            return (Brush?)Application.Current.FindResource(resourceKey) ?? Brushes.Gray;
        }
    }
}

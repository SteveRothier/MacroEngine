using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    /// <summary>
    /// Éditeur de macros basé sur une Timeline verticale
    /// </summary>
    public partial class TimelineEditor : UserControl
    {
        private Macro? _currentMacro;
        private int _draggedIndex = -1;
        private FrameworkElement? _draggedElement;
        private Point _dragStartPoint;
        private Point _dragOffset;
        
        // Popup pour le drag visuel
        private Popup? _dragPopup;
        
        // Historique Undo/Redo
        private Stack<List<IInputAction>> _undoStack = new Stack<List<IInputAction>>();
        private Stack<List<IInputAction>> _redoStack = new Stack<List<IInputAction>>();
        private bool _isUndoRedo = false;

        // Événement déclenché quand la macro est modifiée
        public event EventHandler? MacroChanged;

        public TimelineEditor()
        {
            InitializeComponent();
            Loaded += TimelineEditor_Loaded;
            
            // Ajouter les raccourcis clavier pour Undo/Redo
            KeyDown += TimelineEditor_KeyDown;
        }

        private void TimelineEditor_KeyDown(object sender, KeyEventArgs e)
        {
            // Ctrl+Z pour Undo
            if (e.Key == Key.Z && Keyboard.Modifiers == System.Windows.Input.ModifierKeys.Control)
            {
                Undo();
                e.Handled = true;
            }
            // Ctrl+Y pour Redo
            else if (e.Key == Key.Y && Keyboard.Modifiers == System.Windows.Input.ModifierKeys.Control)
            {
                Redo();
                e.Handled = true;
            }
        }

        private void TimelineEditor_Loaded(object sender, RoutedEventArgs e)
        {
            // Initialisation si nécessaire
        }

        /// <summary>
        /// Charge une macro dans l'éditeur
        /// </summary>
        public void LoadMacro(Macro? macro)
        {
            _currentMacro = macro;
            RefreshBlocks();
            UpdateRepeatControls();
            UpdateMacroEnableToggle();
            
            // Réinitialiser l'historique
            _undoStack.Clear();
            _redoStack.Clear();
            SaveState();
            UpdateUndoRedoButtons();
        }

        /// <summary>
        /// Rafraîchit l'affichage des actions dans la Timeline
        /// </summary>
        public void RefreshBlocks()
        {
            // Retirer toutes les cartes existantes (sauf EmptyStatePanel)
            var childrenToRemove = TimelineStackPanel.Children.Cast<UIElement>()
                .Where(c => c != EmptyStatePanel)
                .ToList();
            
            foreach (var child in childrenToRemove)
            {
                TimelineStackPanel.Children.Remove(child);
            }

            if (_currentMacro == null || _currentMacro.Actions.Count == 0)
            {
                EmptyStatePanel.Visibility = Visibility.Visible;
                return;
            }

            EmptyStatePanel.Visibility = Visibility.Collapsed;

            // Créer une carte pour chaque action avec les boutons séparés à droite
            for (int i = 0; i < _currentMacro.Actions.Count; i++)
            {
                var action = _currentMacro.Actions[i];
                if (action is RepeatAction ra)
                {
                    // Pour RepeatAction, créer un conteneur avec les actions imbriquées
                    var repeatContainer = CreateRepeatActionContainer(ra, i);
                    TimelineStackPanel.Children.Add(repeatContainer);
                }
                else if (action is IfAction ifAction)
                {
                    // Pour IfAction, créer un conteneur avec les actions imbriquées (Then et Else)
                    var ifContainer = CreateIfActionContainer(ifAction, i);
                    TimelineStackPanel.Children.Add(ifContainer);
                }
                else
                {
                    var actionContainer = CreateActionCardWithButtons(action, i);
                    TimelineStackPanel.Children.Add(actionContainer);
                }
            }
        }

        /// <summary>
        /// Crée un conteneur avec la carte d'action et les boutons monter/descendre séparés à droite
        /// </summary>
        private FrameworkElement CreateActionCardWithButtons(IInputAction action, int index)
        {
            // Conteneur horizontal pour la carte et les boutons - largeur fixe pour toutes les actions
            // Utiliser un Grid pour un meilleur contrôle de la largeur
            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch, // S'étend pour prendre toute la largeur
                Margin = new Thickness(0, 0, 0, 2),
                MinWidth = 400 // Largeur minimale pour toutes les actions
            };
            
            // Définir les colonnes : carte prend tout l'espace disponible, boutons ont une largeur fixe
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Carte - prend tout l'espace disponible
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Boutons monter/descendre - largeur automatique
            
            // Créer la carte d'action (sans les boutons monter/descendre)
            var card = CreateActionCard(action, index);
            card.HorizontalAlignment = HorizontalAlignment.Stretch; // S'étend pour prendre toute la largeur de sa colonne
            
            // Créer le conteneur des boutons monter/descendre séparé à droite
            var buttonsContainer = CreateMoveButtonsContainer(action, index);
            
            Grid.SetColumn(card, 0);
            Grid.SetColumn(buttonsContainer, 1);
            
            container.Children.Add(card);
            container.Children.Add(buttonsContainer);
            
            return container;
        }

        /// <summary>
        /// Crée une carte d'action pour la Timeline (style Timeline compact et professionnel)
        /// </summary>
        private FrameworkElement CreateActionCard(IInputAction action, int index)
        {
            // Couleurs définies directement (pas de FindResource pour éviter les conflits)
            Color primaryColor;
            Color hoverColor;
            Color backgroundColor;
            Color backgroundColorHover;
            Color textColor;
            Color iconColor; // Couleur de l'icône (peut être différente du texte)
            string icon;
            string title;
            string details;
            
            // Déterminer les couleurs selon le type d'action avec les couleurs spécifiées
            switch (action)
            {
                case KeyboardAction ka:
                    primaryColor = Color.FromRgb(123, 30, 58); // Rouge pourpre foncé #7B1E3A
                    hoverColor = Color.FromRgb(143, 39, 72); // Dégradé hover #8F2748
                    backgroundColor = Color.FromRgb(123, 30, 58); // Fond #7B1E3A
                    backgroundColorHover = Color.FromRgb(143, 39, 72); // Dégradé hover #8F2748
                    textColor = Color.FromRgb(243, 235, 221); // Texte #F3EBDD
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "⌨";
                    title = GetKeyboardActionTitle(ka);
                    details = GetKeyboardActionDetails(ka);
                    break;
                case Core.Inputs.MouseAction ma:
                    primaryColor = Color.FromRgb(95, 124, 122); // Bleu-gris désaturé #5F7C7A
                    hoverColor = Color.FromRgb(111, 143, 140); // Dégradé hover #6F8F8C
                    backgroundColor = Color.FromRgb(95, 124, 122); // Fond #5F7C7A
                    backgroundColorHover = Color.FromRgb(111, 143, 140); // Dégradé hover #6F8F8C
                    textColor = Color.FromRgb(243, 235, 221); // Texte #F3EBDD
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "🖱";
                    title = GetMouseActionTitle(ma);
                    details = GetMouseActionDetails(ma);
                    break;
                case DelayAction da:
                    primaryColor = Color.FromRgb(200, 169, 106); // Beige doré / ocre doux #C8A96A
                    hoverColor = Color.FromRgb(214, 185, 125); // Dégradé hover #D6B97D
                    backgroundColor = Color.FromRgb(200, 169, 106); // Fond #C8A96A
                    backgroundColorHover = Color.FromRgb(214, 185, 125); // Dégradé hover #D6B97D
                    textColor = Color.FromRgb(243, 235, 221); // Texte #F3EBDD
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "⏱";
                    title = $"{da.Duration} ms";
                    details = "Pause";
                    break;
                case RepeatAction ra:
                    primaryColor = Color.FromRgb(138, 43, 226); // Violet #8A2BE2
                    hoverColor = Color.FromRgb(153, 50, 204); // Violet hover #9932CC
                    backgroundColor = Color.FromRgb(138, 43, 226); // Fond #8A2BE2
                    backgroundColorHover = Color.FromRgb(153, 50, 204); // Dégradé hover #9932CC
                    textColor = Color.FromRgb(248, 239, 234); // Texte #F8EFEA
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "🔁";
                    var actionsCount = ra.Actions?.Count ?? 0;
                    title = GetRepeatActionTitle(ra);
                    details = $"{actionsCount} action{(actionsCount > 1 ? "s" : "")}";
                    break;
                case IfAction ifAction:
                    primaryColor = Color.FromRgb(34, 139, 34); // Vert #228B22
                    hoverColor = Color.FromRgb(46, 160, 46); // Vert hover #2EA02E
                    backgroundColor = Color.FromRgb(34, 139, 34); // Fond #228B22
                    backgroundColorHover = Color.FromRgb(46, 160, 46); // Dégradé hover #2EA02E
                    textColor = Color.FromRgb(248, 239, 234); // Texte #F8EFEA
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "🔀";
                    var thenCount = ifAction.ThenActions?.Count ?? 0;
                    var elseCount = ifAction.ElseActions?.Count ?? 0;
                    title = GetIfActionTitle(ifAction);
                    details = $"Then: {thenCount}, Else: {elseCount}";
                    break;
                default:
                    primaryColor = Color.FromRgb(123, 30, 58); // Rouge pourpre foncé par défaut
                    hoverColor = Color.FromRgb(143, 39, 72);
                    backgroundColor = Color.FromRgb(123, 30, 58);
                    backgroundColorHover = Color.FromRgb(143, 39, 72);
                    textColor = Color.FromRgb(248, 239, 234);
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé par défaut
                    icon = "❓";
                    title = action.Type.ToString();
                    details = "";
                    break;
            }

            // Carte Timeline avec fond coloré enrichi - largeur fixe pour toutes les actions
            var card = new Border
            {
                Background = new SolidColorBrush(backgroundColor),
                BorderBrush = new SolidColorBrush(Color.FromArgb(40, primaryColor.R, primaryColor.G, primaryColor.B)),
                BorderThickness = new Thickness(0, 0, 0, 2), // Ligne de séparation plus visible - toujours la même épaisseur
                Padding = new Thickness(14, 12, 14, 12),
                Margin = new Thickness(0, 0, 0, 2),
                Tag = index,
                AllowDrop = true,
                Cursor = Cursors.Hand,
                MinHeight = 56,
                MaxHeight = 64,
                MinWidth = 400, // Largeur minimale pour toutes les actions
                HorizontalAlignment = HorizontalAlignment.Stretch, // S'étend pour prendre toute la largeur disponible
                VerticalAlignment = VerticalAlignment.Stretch,
                CornerRadius = new CornerRadius(8),
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = primaryColor,
                    Opacity = 0.08,
                    BlurRadius = 4,
                    ShadowDepth = 1,
                    Direction = 270
                }
            };

            // Contenu horizontal avec style enrichi
            var contentGrid = new Grid();
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(5) }); // Barre colorée gauche
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Badge icône
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Texte
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Badge info optionnel
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(32) }); // Largeur fixe pour le bouton supprimer (toujours réservée pour éviter changement de largeur)

            // Barre colorée à gauche (timeline) - avec effet lumineux enrichi
            var timelineBar = new Border
            {
                Background = new SolidColorBrush(primaryColor),
                Width = 5,
                Margin = new Thickness(0, 4, 12, 4),
                VerticalAlignment = VerticalAlignment.Stretch,
                CornerRadius = new CornerRadius(3, 0, 0, 3),
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = primaryColor,
                    Opacity = 0.35,
                    BlurRadius = 3,
                    ShadowDepth = 0,
                    Direction = 270
                }
            };
            Grid.SetColumn(timelineBar, 0);
            contentGrid.Children.Add(timelineBar);

            // Badge icône avec fond coloré plus prononcé
            var iconBadge = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(25, iconColor.R, iconColor.G, iconColor.B)), // Fond avec teinte de l'icône
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(9, 7, 9, 7),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0),
                BorderThickness = new Thickness(1.5),
                BorderBrush = new SolidColorBrush(Color.FromArgb(35, iconColor.R, iconColor.G, iconColor.B)), // Bordure avec teinte de l'icône
                MinWidth = 36,
                MinHeight = 36,
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = primaryColor,
                    Opacity = 0.20,
                    BlurRadius = 4,
                    ShadowDepth = 1,
                    Direction = 270
                }
            };
            
            var iconBlock = new TextBlock
            {
                Text = icon,
                FontSize = 18,
                Foreground = new SolidColorBrush(iconColor),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                FontFamily = new FontFamily("Segoe UI Emoji"),
                FontWeight = FontWeights.Medium
            };
            iconBadge.Child = iconBlock;
            Grid.SetColumn(iconBadge, 1);
            contentGrid.Children.Add(iconBadge);

            // Texte (titre + détails sur une seule ligne) avec style enrichi
            var textPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            // Titre principal avec style plus prononcé et enrichi (texte coloré)
            var titleBlock = new TextBlock
            {
                Text = title,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(textColor), // Texte avec la couleur spécifiée
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0), // Marge à droite pour séparer du badge détails
                FontFamily = new FontFamily("Segoe UI Semibold")
            };
            textPanel.Children.Add(titleBlock);

            // Détails avec badge optionnel (déclarés en dehors du if pour être accessibles dans les handlers)
            TextBlock? detailsBlock = null;
            Border? detailsBadge = null;
            
            if (!string.IsNullOrEmpty(details))
            {
                // Badge pour les détails avec fond coloré
                detailsBadge = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(15, textColor.R, textColor.G, textColor.B)), // Fond avec teinte du texte
                    CornerRadius = new CornerRadius(4),
                    Padding = new Thickness(6, 3, 6, 3),
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 0, 0),
                    BorderThickness = new Thickness(1),
                    BorderBrush = new SolidColorBrush(Color.FromArgb(20, textColor.R, textColor.G, textColor.B))
                };
                
                detailsBlock = new TextBlock
                {
                    Text = details,
                    FontSize = 10,
                    Foreground = new SolidColorBrush(Color.FromArgb(200, textColor.R, textColor.G, textColor.B)), // Texte avec teinte du texte avec opacité
                    VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Medium,
                    FontFamily = new FontFamily("Segoe UI")
                };
                detailsBadge.Child = detailsBlock;
                
                textPanel.Children.Add(detailsBadge);
            }

            Grid.SetColumn(textPanel, 2);
            contentGrid.Children.Add(textPanel);

            // Badge numéro avec style enrichi
            var infoBadge = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(12, primaryColor.R, primaryColor.G, primaryColor.B)),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(7, 3, 7, 3),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(Color.FromArgb(20, primaryColor.R, primaryColor.G, primaryColor.B)),
                Visibility = Visibility.Collapsed,
                MinWidth = 24,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            
            var infoText = new TextBlock
            {
                Text = "#" + (index + 1).ToString(),
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromArgb(200, primaryColor.R, primaryColor.G, primaryColor.B)),
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                FontFamily = new FontFamily("Segoe UI Semibold")
            };
            infoBadge.Child = infoText;
            Grid.SetColumn(infoBadge, 3);
            contentGrid.Children.Add(infoBadge);

            // Bouton supprimer avec style enrichi (visible au survol mais toujours présent pour ne pas changer la largeur)
            var deleteBtnContainer = new Border
            {
                Background = Brushes.Transparent,
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(4),
                Width = 24,
                Height = 24,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Cursor = Cursors.Hand,
                Tag = index,
                Opacity = 0, // Invisible par défaut mais toujours présent pour ne pas changer la largeur
                Visibility = Visibility.Visible // Toujours visible pour réserver l'espace
            };
            
            var deleteBtn = new Button
            {
                Content = "✕",
                Width = 16,
                Height = 16,
                Padding = new Thickness(0),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Foreground = new SolidColorBrush(Color.FromRgb(160, 160, 160)),
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Tag = index,
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            deleteBtn.Click += DeleteAction_Click;
            deleteBtn.MouseEnter += (s, e) => 
            {
                deleteBtn.Foreground = new SolidColorBrush(Color.FromRgb(220, 53, 69)); // Rouge vif
                deleteBtnContainer.Background = new SolidColorBrush(Color.FromArgb(15, 220, 53, 69));
            };
            deleteBtn.MouseLeave += (s, e) => 
            {
                deleteBtn.Foreground = new SolidColorBrush(Color.FromRgb(160, 160, 160));
                deleteBtnContainer.Background = Brushes.Transparent;
            };
            
            deleteBtnContainer.Child = deleteBtn;
            Grid.SetColumn(deleteBtnContainer, 4); // Colonne 4 (les boutons monter/descendre sont maintenant séparés)
            contentGrid.Children.Add(deleteBtnContainer);

            card.Child = contentGrid;

            // Effets hover : changement de couleur uniquement, pas de changement de taille ni de bordure
            card.MouseEnter += (s, e) =>
            {
                deleteBtnContainer.Opacity = 1; // Rendre visible sans changer Visibility pour ne pas changer la largeur
                infoBadge.Visibility = Visibility.Visible;
                card.Background = new SolidColorBrush(backgroundColorHover);
                timelineBar.Background = new SolidColorBrush(hoverColor);
                // Pas de changement de bordure pour garder la même taille
                if (detailsBlock != null && detailsBadge != null)
                {
                    detailsBadge.Background = new SolidColorBrush(Color.FromArgb(25, textColor.R, textColor.G, textColor.B));
                    detailsBadge.BorderBrush = new SolidColorBrush(Color.FromArgb(35, textColor.R, textColor.G, textColor.B));
                    detailsBlock.Foreground = new SolidColorBrush(textColor); // Texte avec opacité complète au survol
                }
            };

            card.MouseLeave += (s, e) =>
            {
                deleteBtnContainer.Opacity = 0; // Rendre invisible sans changer Visibility pour ne pas changer la largeur
                infoBadge.Visibility = Visibility.Collapsed;
                card.Background = new SolidColorBrush(backgroundColor);
                timelineBar.Background = new SolidColorBrush(primaryColor);
                // Pas de changement de bordure pour garder la même taille
                if (detailsBlock != null && detailsBadge != null)
                {
                    detailsBadge.Background = new SolidColorBrush(Color.FromArgb(15, textColor.R, textColor.G, textColor.B));
                    detailsBadge.BorderBrush = new SolidColorBrush(Color.FromArgb(20, textColor.R, textColor.G, textColor.B));
                    detailsBlock.Foreground = new SolidColorBrush(Color.FromArgb(200, textColor.R, textColor.G, textColor.B)); // Texte normal avec opacité
                }
            };

            // Événements drag & drop
            card.MouseLeftButtonDown += ActionCard_MouseLeftButtonDown;
            card.MouseMove += ActionCard_MouseMove;
            card.MouseLeftButtonUp += ActionCard_MouseLeftButtonUp;
            card.Drop += ActionCard_Drop;
            card.DragEnter += ActionCard_DragEnter;
            card.DragLeave += ActionCard_DragLeave;

            // Édition inline
            if (action is KeyboardAction ka2)
            {
                titleBlock.Cursor = Cursors.Hand;
                titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                {
                    e.Handled = true; // Empêcher le drag & drop
                    EditKeyboardAction(ka2, index, titleBlock);
                };
            }
            else if (action is DelayAction da)
            {
                titleBlock.Cursor = Cursors.Hand;
                titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                {
                    e.Handled = true; // Empêcher le drag & drop
                    EditDelayAction(da, index, titleBlock);
                };
            }
            else if (action is RepeatAction ra)
            {
                // Pour RepeatAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var repeatControlsPanel = CreateRepeatActionControls(ra, index, textPanel);
                textPanel.Children.Insert(0, repeatControlsPanel);
            }
            else if (action is IfAction ifAction)
            {
                // Pour IfAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var ifControlsPanel = CreateIfActionControls(ifAction, index, textPanel);
                textPanel.Children.Insert(0, ifControlsPanel);
            }

            return card;
        }

        /// <summary>
        /// Crée un conteneur séparé pour les boutons monter/descendre à droite de l'action (complètement à l'extérieur)
        /// </summary>
        private FrameworkElement CreateMoveButtonsContainer(IInputAction action, int index)
        {
            // Déterminer la couleur principale selon le type d'action
            Color primaryColor = action switch
            {
                KeyboardAction => Color.FromRgb(122, 30, 58),
                Core.Inputs.MouseAction => Color.FromRgb(90, 138, 201),
                DelayAction => Color.FromRgb(216, 162, 74),
                RepeatAction => Color.FromRgb(138, 43, 226),
                IfAction => Color.FromRgb(34, 139, 34),
                _ => Color.FromRgb(122, 30, 58)
            };

            // Conteneur séparé pour les boutons monter/descendre complètement à l'extérieur à droite
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent, // Fond transparent pour ne voir que les boutons
                BorderThickness = new Thickness(1.5), // Bordure commune pour le conteneur
                BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0)), // Bordure grise
                CornerRadius = new CornerRadius(4), // Coins arrondis
                Padding = new Thickness(2, 2, 2, 2), // Padding réduit
                Margin = new Thickness(10, 0, 0, 0), // Marge à gauche pour séparer de la carte
                VerticalAlignment = VerticalAlignment.Stretch, // Même hauteur que les actions
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 48, // Même hauteur minimale que les actions
                MaxHeight = 48, // Même hauteur maximale que les actions
                Visibility = Visibility.Visible
            };
            
            // Grid pour centrer parfaitement le contenu verticalement et horizontalement
            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            
            // Boutons monter/descendre pour réorganiser les actions (toujours visibles)
            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            // Bouton monter (▲)
            bool canMoveUp = index > 0;
            var moveUpBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 1), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = index
            };
            
            var moveUpBtnText = new TextBlock
            {
                Text = "▲",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveUp
                    ? new SolidColorBrush(Color.FromRgb(80, 80, 80)) // Flèche en gris foncé
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)), // Gris pour désactivé
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 36,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveUpBtnBorder.Child = moveUpBtnText;
            moveUpBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveUp)
                {
                    MoveActionUp(index);
                    e.Handled = true;
                }
            };
            moveUpBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = new SolidColorBrush(Color.FromRgb(60, 60, 60)); // Flèche en gris plus foncé au survol
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(60, 0, 0, 0)); // Bordure du conteneur plus foncée au survol
                }
            };
            moveUpBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = new SolidColorBrush(Color.FromRgb(80, 80, 80)); // Flèche en gris foncé
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0)); // Bordure du conteneur normale
                }
            };

            // Bouton descendre (▼)
            bool canMoveDown = _currentMacro != null && index < _currentMacro.Actions.Count - 1;
            var moveDownBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 1, 0, 0), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = index
            };
            
            var moveDownBtnText = new TextBlock
            {
                Text = "▼",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveDown
                    ? new SolidColorBrush(Color.FromRgb(80, 80, 80)) // Flèche en gris foncé
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)), // Gris pour désactivé
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 1,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveDownBtnBorder.Child = moveDownBtnText;
            moveDownBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveDown)
                {
                    MoveActionDown(index);
                    e.Handled = true;
                }
            };
            moveDownBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = new SolidColorBrush(Color.FromRgb(60, 60, 60)); // Flèche en gris plus foncé au survol
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(60, 0, 0, 0)); // Bordure du conteneur plus foncée au survol
                }
            };
            moveDownBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = new SolidColorBrush(Color.FromRgb(80, 80, 80)); // Flèche en gris foncé
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0)); // Bordure du conteneur normale
                }
            };

            moveButtonsPanel.Children.Add(moveUpBtnBorder);
            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            
            // Ajouter le panel des boutons dans le grid de centrage
            centeringGrid.Children.Add(moveButtonsPanel);
            
            // Ajouter le grid de centrage dans le conteneur pour centrer les flèches
            moveButtonsContainer.Child = centeringGrid;
            
            return moveButtonsContainer;
        }

        private string GetKeyboardActionTitle(KeyboardAction ka)
        {
            if (ka.VirtualKeyCode == 0) return "Touche ?";
            return GetKeyName(ka.VirtualKeyCode);
        }

        private string GetKeyboardActionDetails(KeyboardAction ka)
        {
            var actionType = ka.ActionType == KeyboardActionType.Down ? "Appuyer" :
                           ka.ActionType == KeyboardActionType.Up ? "Relâcher" : "Presser";
            
            if (ka.Modifiers != Core.Inputs.ModifierKeys.None)
            {
                var mods = string.Join(" + ", 
                    (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Control) ? "Ctrl" : ""),
                    (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Shift) ? "Shift" : ""),
                    (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Alt) ? "Alt" : ""),
                    (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Windows) ? "Win" : "")
                ).Replace("  ", " ").Trim();
                return $"{actionType} ({mods})";
            }
            
            return actionType;
        }

        private string GetMouseActionTitle(Core.Inputs.MouseAction ma)
        {
            return ma.ActionType switch
            {
                MouseActionType.LeftClick => "Clic gauche",
                MouseActionType.RightClick => "Clic droit",
                MouseActionType.MiddleClick => "Clic milieu",
                MouseActionType.Move => "Déplacer",
                MouseActionType.LeftDown => "Appuyer gauche",
                MouseActionType.LeftUp => "Relâcher gauche",
                MouseActionType.RightDown => "Appuyer droit",
                MouseActionType.RightUp => "Relâcher droit",
                MouseActionType.WheelUp => "Molette haut",
                MouseActionType.WheelDown => "Molette bas",
                MouseActionType.Wheel => "Molette",
                _ => ma.ActionType.ToString()
            };
        }

        private string GetMouseActionDetails(Core.Inputs.MouseAction ma)
        {
            if (ma.X >= 0 && ma.Y >= 0)
            {
                return $"Position: ({ma.X}, {ma.Y})";
            }
            return "Position actuelle";
        }

        private string GetRepeatActionTitle(RepeatAction ra)
        {
            return ra.RepeatMode switch
            {
                RepeatMode.Once => "Répéter 1 fois",
                RepeatMode.RepeatCount => $"Répéter {ra.RepeatCount}x",
                RepeatMode.UntilStopped => "Répéter jusqu'à arrêt",
                RepeatMode.WhileKeyPressed => ra.KeyCodeToMonitor == 0 ? "Répéter tant que touche pressée" : $"Répéter tant que {GetKeyName(ra.KeyCodeToMonitor)} pressée",
                RepeatMode.WhileClickPressed => ra.ClickTypeToMonitor switch
                {
                    0 => "Répéter tant que clic gauche pressé",
                    1 => "Répéter tant que clic droit pressé",
                    2 => "Répéter tant que clic milieu pressé",
                    _ => "Répéter tant que clic pressé"
                },
                _ => "Répéter"
            };
        }

        private string GetIfActionTitle(IfAction ifAction)
        {
            var conditionText = ifAction.Condition ? "Vrai" : "Faux";
            return $"Si ({conditionText})";
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0) return "?";
            try
            {
                var key = KeyInterop.KeyFromVirtualKey(virtualKeyCode);
                return key.ToString();
            }
            catch
            {
                return $"0x{virtualKeyCode:X2}";
            }
        }

        #region Drag & Drop

        private void ActionCard_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Ne pas démarrer le drag si on clique sur un contrôle interactif (ComboBox, TextBox, Button, etc.)
            // Vérifier aussi les parents au cas où OriginalSource est un élément enfant (ex: ToggleButton dans ComboBox)
            DependencyObject? current = e.OriginalSource as DependencyObject;
            while (current != null && current != sender)
            {
                if (current is ComboBox || current is TextBox || 
                    current is Button || current is ToggleButton ||
                    current is CheckBox || current is RadioButton ||
                    current is ComboBoxItem || current is Popup)
                {
                    // C'est un contrôle interactif, ne pas démarrer le drag
                    return;
                }
                // Si c'est un TextBlock qui est le titre (éditable), permettre l'édition mais pas le drag
                if (current is TextBlock textBlock && textBlock.Cursor == Cursors.Hand)
                {
                    // C'est un titre éditable, laisser le handler du titre gérer l'événement
                    return;
                }
                current = System.Windows.Media.VisualTreeHelper.GetParent(current);
            }
            
            if (sender is FrameworkElement element && element.Tag is int index)
            {
                _dragStartPoint = e.GetPosition(this);
                _draggedIndex = index;
                _draggedElement = element;
                _dragOffset = e.GetPosition(element);
            }
        }

        private void ActionCard_MouseMove(object sender, MouseEventArgs e)
        {
            if (e.LeftButton != MouseButtonState.Pressed || _draggedElement == null || _draggedIndex < 0)
                return;

            Point currentPos = e.GetPosition(this);
            Vector diff = _dragStartPoint - currentPos;

            // Démarrer le drag si on a bougé assez
            if (Math.Abs(diff.X) > SystemParameters.MinimumHorizontalDragDistance ||
                Math.Abs(diff.Y) > SystemParameters.MinimumVerticalDragDistance)
            {
                CreateDragVisual(_draggedElement);
                _draggedElement.Opacity = 0.3;
                
                DataObject dragData = new DataObject("ActionIndex", _draggedIndex);
                
                _draggedElement.GiveFeedback += DraggedElement_GiveFeedback;
                
                DragDrop.DoDragDrop(_draggedElement, dragData, DragDropEffects.Move);
                
                _draggedElement.GiveFeedback -= DraggedElement_GiveFeedback;
                HideDragVisual();
                
                _draggedElement.Opacity = 1.0;
                _draggedElement = null;
                _draggedIndex = -1;
            }
        }

        private void ActionCard_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _draggedElement = null;
            _draggedIndex = -1;
        }

        private void CreateDragVisual(FrameworkElement element)
        {
            double width = element.ActualWidth > 0 ? element.ActualWidth : 500;
            double height = element.ActualHeight > 0 ? element.ActualHeight : 44; // Hauteur Timeline compacte
            
            var visualBrush = new VisualBrush(element)
            {
                Opacity = 0.9,
                Stretch = Stretch.None
            };

            var dragBorder = new Border
            {
                Width = width,
                Height = height,
                Background = visualBrush,
                CornerRadius = new CornerRadius(4),
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = Colors.Black,
                    Opacity = 0.3,
                    BlurRadius = 8,
                    ShadowDepth = 3
                }
            };

            _dragPopup = new Popup
            {
                Child = dragBorder,
                AllowsTransparency = true,
                IsHitTestVisible = false,
                Placement = PlacementMode.Absolute,
                IsOpen = true
            };
            
            UpdateDragVisualPosition();
        }

        private void DraggedElement_GiveFeedback(object sender, GiveFeedbackEventArgs e)
        {
            UpdateDragVisualPosition();
            e.Handled = true;
        }

        private void UpdateDragVisualPosition()
        {
            if (_dragPopup != null)
            {
                var mousePos = GetMousePositionScreen();
                _dragPopup.HorizontalOffset = mousePos.X - _dragOffset.X;
                _dragPopup.VerticalOffset = mousePos.Y - _dragOffset.Y;
            }
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private Point GetMousePositionScreen()
        {
            GetCursorPos(out POINT point);
            return new Point(point.X, point.Y);
        }

        private void HideDragVisual()
        {
            if (_dragPopup != null)
            {
                _dragPopup.IsOpen = false;
                _dragPopup = null;
            }
        }

        private void ActionCard_DragEnter(object sender, DragEventArgs e)
        {
            if (sender is Border card && card.Tag is int index)
            {
                // Mettre en surbrillance la carte cible sans changer la taille
                card.Background = new SolidColorBrush(Color.FromRgb(245, 242, 240)); // Fond légèrement grisé
                // BorderThickness reste constante pour ne pas changer la taille
                card.BorderBrush = new SolidColorBrush(Color.FromRgb(122, 30, 58)); // Bordure pourpre
            }
        }

        private void ActionCard_DragLeave(object sender, DragEventArgs e)
        {
            if (sender is Border card && card.Tag is int index && _currentMacro != null)
            {
                // Restaurer le style normal
                if (index < _currentMacro.Actions.Count)
                {
                    var action = _currentMacro.Actions[index];
                    Color bgColor = action switch
                    {
                        KeyboardAction => Color.FromRgb(255, 252, 250),
                        Core.Inputs.MouseAction => Color.FromRgb(250, 252, 255),
                        DelayAction => Color.FromRgb(255, 252, 248),
                        _ => Color.FromRgb(255, 255, 255)
                    };
                    card.Background = new SolidColorBrush(bgColor);
                    // Restaurer la BorderThickness initiale pour ne pas changer la taille
                    card.BorderThickness = new Thickness(0, 0, 0, 2); // Ligne de séparation - même épaisseur que l'initial
                    // Restaurer la BorderBrush selon le type d'action
                    var restoredAction = _currentMacro.Actions[index];
                    Color primaryColor = restoredAction switch
                    {
                        KeyboardAction => Color.FromRgb(122, 30, 58),
                        Core.Inputs.MouseAction => Color.FromRgb(90, 138, 201),
                        DelayAction => Color.FromRgb(216, 162, 74),
                        _ => Color.FromRgb(122, 30, 58)
                    };
                    card.BorderBrush = new SolidColorBrush(Color.FromArgb(40, primaryColor.R, primaryColor.G, primaryColor.B));
                }
            }
        }

        private void ActionCard_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent("ActionIndex") && sender is Border targetCard)
            {
                // Trouver l'index de la carte cible via son Tag
                int targetIndex = -1;
                if (targetCard.Tag is int idx)
                {
                    targetIndex = idx;
                }
                else
                {
                    // Si le Tag n'est pas sur le Border, chercher dans le parent
                    var parent = targetCard.Parent as FrameworkElement;
                    while (parent != null && targetIndex == -1)
                    {
                        if (parent.Tag is int i)
                        {
                            targetIndex = i;
                            break;
                        }
                        parent = parent.Parent as FrameworkElement;
                    }
                }

                if (targetIndex >= 0)
                {
                    int sourceIndex = (int)e.Data.GetData("ActionIndex");
                    
                    if (sourceIndex != targetIndex && _currentMacro != null)
                    {
                        SaveState();
                        
                        var action = _currentMacro.Actions[sourceIndex];
                        _currentMacro.Actions.RemoveAt(sourceIndex);
                        
                        if (sourceIndex < targetIndex)
                            targetIndex--;
                        
                        _currentMacro.Actions.Insert(targetIndex, action);
                        _currentMacro.ModifiedAt = DateTime.Now;
                        
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            }
            
            e.Handled = true;
        }

        private void TimelineStackPanel_DragOver(object sender, DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent("ActionIndex") ? DragDropEffects.Move : DragDropEffects.None;
            e.Handled = true;
        }

        private void TimelineStackPanel_Drop(object sender, DragEventArgs e)
        {
            // Drop à la fin de la liste si on drop sur le conteneur
            if (e.Data.GetDataPresent("ActionIndex") && _currentMacro != null)
            {
                SaveState();
                
                int sourceIndex = (int)e.Data.GetData("ActionIndex");
                var action = _currentMacro.Actions[sourceIndex];
                _currentMacro.Actions.RemoveAt(sourceIndex);
                _currentMacro.Actions.Add(action);
                _currentMacro.ModifiedAt = DateTime.Now;
                
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
            
            e.Handled = true;
        }

        #endregion

        #region Boutons d'ajout

        private void AddKeyboard_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;
            
            SaveState();
            
            _currentMacro.Actions.Add(new KeyboardAction
            {
                VirtualKeyCode = 0,
                ActionType = KeyboardActionType.Press
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddMouse_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new Core.Inputs.MouseAction
            {
                ActionType = Core.Inputs.MouseActionType.LeftClick,
                X = -1,
                Y = -1
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddDelay_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new DelayAction
            {
                Duration = 100
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddRepeat_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new RepeatAction
            {
                RepeatCount = 1,
                DelayBetweenRepeats = 0,
                Actions = new List<IInputAction>()
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddIf_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new IfAction
            {
                Condition = true,
                ThenActions = new List<IInputAction>(),
                ElseActions = new List<IInputAction>()
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void MoveActionUp(int index)
        {
            if (_currentMacro == null || index <= 0 || index >= _currentMacro.Actions.Count)
                return;

            SaveState();
            
            // Échanger l'action avec celle au-dessus
            var action = _currentMacro.Actions[index];
            _currentMacro.Actions.RemoveAt(index);
            _currentMacro.Actions.Insert(index - 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void MoveActionDown(int index)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count - 1)
                return;

            SaveState();
            
            // Échanger l'action avec celle en dessous
            var action = _currentMacro.Actions[index];
            _currentMacro.Actions.RemoveAt(index);
            _currentMacro.Actions.Insert(index + 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void DeleteAction_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is int index && _currentMacro != null)
            {
                if (index >= 0 && index < _currentMacro.Actions.Count)
                {
                    SaveState();
                    
                    _currentMacro.Actions.RemoveAt(index);
                    _currentMacro.ModifiedAt = DateTime.Now;
                    
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            }
        }

        #endregion

        #region Édition inline

        private void EditKeyboardAction(KeyboardAction ka, int index, TextBlock titleText)
        {
            // Édition inline : remplacer le TextBlock par un TextBox qui capture la touche
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
            {
                System.Diagnostics.Debug.WriteLine("EditKeyboardAction: parentPanel is null");
                return;
            }
            
            bool keyCaptured = false;
            
            // Sauvegarder les propriétés du TextBlock pour restaurer plus tard
            var originalMargin = titleText.Margin;
            var originalWidth = titleText.Width;
            
            var textBox = new TextBox
            {
                Text = "Appuyez sur une touche...",
                MinWidth = 150,
                MaxWidth = 300,
                TextAlignment = TextAlignment.Center,
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromRgb(255, 255, 200)), // Fond jaune clair pour être visible
                BorderBrush = new SolidColorBrush(Color.FromRgb(255, 165, 0)), // Bordure orange pour être visible
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin, // Conserver la même marge
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };
            
            // Empêcher le TextBox de déclencher le drag & drop
            textBox.PreviewMouseLeftButtonDown += (s, e) => e.Handled = true;
            textBox.PreviewMouseMove += (s, e) => e.Handled = true;
            
            // Événement PreviewKeyDown pour capturer la touche avant qu'elle ne soit traitée
            textBox.PreviewKeyDown += (s, e) =>
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
                    // Restaurer le TextBlock si on annule
                    if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                    return;
                }
                
                // Capturer la touche
                try
                {
                    int virtualKeyCode = KeyInterop.VirtualKeyFromKey(e.Key);
                    SaveState();
                    ka.VirtualKeyCode = (ushort)virtualKeyCode;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    keyCaptured = true;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                    e.Handled = true;
                    Keyboard.ClearFocus();
                }
                catch
                {
                    // Ignorer les erreurs de conversion
                    e.Handled = true;
                }
            };
            
            // Nettoyer si on perd le focus sans avoir capturé de touche
            textBox.LostFocus += (s, e) =>
            {
                if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                {
                    // Restaurer le TextBlock si on n'a pas capturé de touche
                    int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                    parentPanel.Children.RemoveAt(textBoxIdx);
                    parentPanel.Children.Insert(textBoxIdx, titleText);
                }
            };
            
            // Remplacer le TextBlock par le TextBox
            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
            {
                System.Diagnostics.Debug.WriteLine("EditKeyboardAction: titleText not found in parentPanel");
                return;
            }
            
            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);
            
            // Mettre le focus de manière asynchrone pour s'assurer que le layout est mis à jour
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        private void EditDelayAction(DelayAction da, int index, TextBlock titleText)
        {
            // Édition inline : remplacer le TextBlock par un TextBox qui capture le délai
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
            {
                System.Diagnostics.Debug.WriteLine("EditDelayAction: parentPanel is null");
                return;
            }
            
            bool delaySaved = false;
            int originalDelay = da.Duration; // Sauvegarder la valeur originale pour restauration si annulé
            
            // Sauvegarder les propriétés du TextBlock pour restaurer plus tard
            var originalMargin = titleText.Margin;
            
            var textBox = new TextBox
            {
                Text = da.Duration.ToString(),
                MinWidth = 60,
                MaxWidth = 120,
                TextAlignment = TextAlignment.Center,
                Background = new SolidColorBrush(Color.FromRgb(250, 250, 250)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(180, 180, 180)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Margin = originalMargin,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };
            
            // Validation : n'accepter que les nombres entiers
            textBox.PreviewTextInput += (s, e) => e.Handled = !int.TryParse(e.Text, out _);
            
            // Empêcher le TextBox de déclencher le drag & drop
            textBox.PreviewMouseLeftButtonDown += (s, e) => e.Handled = true;
            textBox.PreviewMouseMove += (s, e) => e.Handled = true;
            
            // Sauvegarder automatiquement quand on perd le focus (clic ailleurs)
            textBox.LostFocus += (s, e) =>
            {
                if (delaySaved) return; // Déjà sauvegardé, ne rien faire
                
                if (int.TryParse(textBox.Text, out int delay) && delay > 0)
                {
                    SaveState();
                    da.Duration = delay;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    delaySaved = true;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    // Valeur invalide : restaurer le TextBlock avec la valeur originale
                    if (parentPanel.Children.Contains(textBox))
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                }
            };
            
            // Gestion des touches : Enter pour confirmer, Escape pour annuler
            textBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int delay) && delay > 0)
                    {
                        SaveState();
                        da.Duration = delay;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        delaySaved = true;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    Keyboard.ClearFocus();
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                    // Restaurer le TextBlock avec la valeur originale si on annule
                    if (parentPanel.Children.Contains(textBox) && !delaySaved)
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                }
            };
            
            // Remplacer le TextBlock par le TextBox
            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
            {
                System.Diagnostics.Debug.WriteLine("EditDelayAction: titleText not found in parentPanel");
                return;
            }
            
            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);
            
            // Mettre le focus de manière asynchrone pour s'assurer que le layout est mis à jour
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        /// <summary>
        /// Édition inline d'une KeyboardAction imbriquée dans un RepeatAction
        /// </summary>
        private void EditNestedKeyboardAction(int parentIndex, int nestedIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not KeyboardAction ka)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            bool keyCaptured = false;
            var originalMargin = titleText.Margin;
            var originalWidth = titleText.Width;

            var textBox = new TextBox
            {
                Text = "Appuyez sur une touche...",
                MinWidth = 150,
                MaxWidth = 300,
                TextAlignment = TextAlignment.Center,
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromRgb(255, 255, 200)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(255, 165, 0)),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };

            textBox.PreviewMouseLeftButtonDown += (s, e) => e.Handled = true;
            textBox.PreviewMouseMove += (s, e) => e.Handled = true;

            textBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                    e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                    e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                    e.Key == Key.LWin || e.Key == Key.RWin)
                {
                    e.Handled = true;
                    return;
                }

                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                    if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                    return;
                }

                try
                {
                    int virtualKeyCode = KeyInterop.VirtualKeyFromKey(e.Key);
                    SaveState();
                    ka.VirtualKeyCode = (ushort)virtualKeyCode;
                    _currentMacro.ModifiedAt = DateTime.Now;
                    keyCaptured = true;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                    e.Handled = true;
                    Keyboard.ClearFocus();
                }
                catch
                {
                    e.Handled = true;
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                {
                    int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                    parentPanel.Children.RemoveAt(textBoxIdx);
                    parentPanel.Children.Insert(textBoxIdx, titleText);
                }
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        /// <summary>
        /// Édition inline d'une DelayAction imbriquée dans un RepeatAction
        /// </summary>
        private void EditNestedDelayAction(int parentIndex, int nestedIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            bool delaySaved = false;
            int originalDelay = da.Duration;
            var originalMargin = titleText.Margin;

            var textBox = new TextBox
            {
                Text = da.Duration.ToString(),
                MinWidth = 60,
                MaxWidth = 120,
                TextAlignment = TextAlignment.Center,
                Background = new SolidColorBrush(Color.FromRgb(250, 250, 250)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(180, 180, 180)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Margin = originalMargin,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };

            textBox.PreviewMouseLeftButtonDown += (s, e) => e.Handled = true;
            textBox.PreviewMouseMove += (s, e) => e.Handled = true;
            textBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);

            textBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro.ModifiedAt = DateTime.Now;
                        delaySaved = true;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                        Keyboard.ClearFocus();
                    }
                    else
                    {
                        textBox.Text = originalDelay.ToString();
                    }
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    textBox.Text = originalDelay.ToString();
                    Keyboard.ClearFocus();
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                if (!delaySaved)
                {
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    else
                    {
                        textBox.Text = originalDelay.ToString();
                    }
                }
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        /// <summary>
        /// Édition inline d'une MouseAction imbriquée dans un RepeatAction
        /// </summary>
        private void EditNestedMouseAction(int parentIndex, int nestedIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not Core.Inputs.MouseAction ma)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            // Panel horizontal pour ComboBox (type de clic) + TextBox (position optionnelle)
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 120,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                SelectedIndex = (int)ma.ActionType
            };

            actionTypeComboBox.Items.Add("Clic gauche");
            actionTypeComboBox.Items.Add("Clic droit");
            actionTypeComboBox.Items.Add("Clic milieu");
            actionTypeComboBox.Items.Add("Déplacer");
            actionTypeComboBox.Items.Add("Appuyer gauche");
            actionTypeComboBox.Items.Add("Relâcher gauche");
            actionTypeComboBox.Items.Add("Appuyer droit");
            actionTypeComboBox.Items.Add("Relâcher droit");
            actionTypeComboBox.Items.Add("Appuyer milieu");
            actionTypeComboBox.Items.Add("Relâcher milieu");
            actionTypeComboBox.Items.Add("Molette haut");
            actionTypeComboBox.Items.Add("Molette bas");

            editPanel.Children.Add(actionTypeComboBox);

            // TextBox pour la position (seulement si nécessaire)
            var positionTextBox = new TextBox
            {
                Text = ma.X >= 0 && ma.Y >= 0 ? $"({ma.X}, {ma.Y})" : "Position actuelle",
                MinWidth = 120,
                MaxWidth = 150,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                IsReadOnly = true,
                Cursor = Cursors.Hand,
                Background = new SolidColorBrush(Color.FromRgb(245, 245, 245)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(180, 180, 180)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Visibility = ma.ActionType == Core.Inputs.MouseActionType.Move ? Visibility.Visible : Visibility.Collapsed
            };

            positionTextBox.MouseLeftButtonDown += (s, e) =>
            {
                e.Handled = true;
                // Pour l'instant, on garde "Position actuelle" (-1, -1)
                // On pourrait ajouter une capture de position ici plus tard
                SaveState();
                ma.X = -1;
                ma.Y = -1;
                _currentMacro.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };

            editPanel.Children.Add(positionTextBox);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.ActionType = (Core.Inputs.MouseActionType)actionTypeComboBox.SelectedIndex;
                    positionTextBox.Visibility = ma.ActionType == Core.Inputs.MouseActionType.Move ? Visibility.Visible : Visibility.Collapsed;
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            actionTypeComboBox.DropDownClosed += (s, e) =>
            {
                RefreshBlocks();
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                actionTypeComboBox.Focus();
            }));
        }

        /// <summary>
        /// Crée les contrôles inline pour une action RepeatAction (toujours visibles dans la carte)
        /// </summary>
        private StackPanel CreateRepeatActionControls(RepeatAction ra, int index, Panel parentPanel)
        {
            // Créer un panel horizontal pour le mode et les inputs
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // ComboBox pour le mode de répétition
            var modeComboBox = new ComboBox
            {
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                MinWidth = 140,
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            
            modeComboBox.Items.Add(new ComboBoxItem { Content = "1 fois", Tag = RepeatMode.Once });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "X fois", Tag = RepeatMode.RepeatCount });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "Jusqu'à arrêt", Tag = RepeatMode.UntilStopped });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "Tant que touche", Tag = RepeatMode.WhileKeyPressed });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "Tant que clic", Tag = RepeatMode.WhileClickPressed });

            // Sélectionner le mode actuel
            for (int i = 0; i < modeComboBox.Items.Count; i++)
            {
                if (modeComboBox.Items[i] is ComboBoxItem item && item.Tag is RepeatMode mode && mode == ra.RepeatMode)
                {
                    modeComboBox.SelectedIndex = i;
                    break;
                }
            }

            editPanel.Children.Add(modeComboBox);

            // Input pour le nombre de répétitions (X fois) - inline
            var repeatCountTextBox = new TextBox
            {
                Text = ra.RepeatCount.ToString(),
                MinWidth = 50,
                MaxWidth = 80,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = ra.RepeatMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed,
                Background = new SolidColorBrush(Color.FromRgb(250, 250, 250)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(180, 180, 180)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Cursor = Cursors.IBeam
            };
            // Validation : n'accepter que les nombres entiers (ne PAS bloquer le clic pour permettre l'édition)
            repeatCountTextBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);
            editPanel.Children.Add(repeatCountTextBox);

            // Input pour la touche à surveiller (Tant qu'une touche est pressée) - inline
            var keyCodeTextBox = new TextBox
            {
                Text = ra.KeyCodeToMonitor == 0 ? "Cliquez pour capturer" : GetKeyName(ra.KeyCodeToMonitor),
                MinWidth = 120,
                MaxWidth = 150,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = ra.RepeatMode == RepeatMode.WhileKeyPressed ? Visibility.Visible : Visibility.Collapsed,
                IsReadOnly = true,
                Cursor = Cursors.Hand,
                Background = new SolidColorBrush(Color.FromRgb(245, 245, 245)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(180, 180, 180)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4)
            };
            bool keyCaptureMode = false;
            KeyboardHook? tempKeyHook = null;
            keyCodeTextBox.MouseLeftButtonDown += (s, e) =>
            {
                if (!keyCaptureMode)
                {
                    e.Handled = true;
                    keyCaptureMode = true;
                    keyCodeTextBox.Text = "Appuyez sur une touche...";
                    keyCodeTextBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 200));
                    tempKeyHook = new KeyboardHook();
                    tempKeyHook.KeyDown += (sender, args) =>
                    {
                        SaveState();
                        ra.KeyCodeToMonitor = (ushort)args.VirtualKeyCode;
                        keyCodeTextBox.Text = GetKeyName(ra.KeyCodeToMonitor);
                        keyCodeTextBox.Background = new SolidColorBrush(Color.FromRgb(245, 245, 245));
                        keyCaptureMode = false;
                        tempKeyHook?.Uninstall();
                        tempKeyHook = null;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    };
                    tempKeyHook.Install();
                }
            };
            editPanel.Children.Add(keyCodeTextBox);

            // ComboBox pour le type de clic (Tant qu'un clic est pressé) - inline
            var clickTypeComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = ra.RepeatMode == RepeatMode.WhileClickPressed ? Visibility.Visible : Visibility.Collapsed,
                SelectedIndex = ra.ClickTypeToMonitor
            };
            clickTypeComboBox.Items.Add("Gauche");
            clickTypeComboBox.Items.Add("Droit");
            clickTypeComboBox.Items.Add("Milieu");
            editPanel.Children.Add(clickTypeComboBox);

            // Mise à jour de la visibilité des inputs selon le mode sélectionné
            modeComboBox.SelectionChanged += (s, e) =>
            {
                if (modeComboBox.SelectedItem is ComboBoxItem selectedItem && selectedItem.Tag is RepeatMode selectedMode)
                {
                    // Mettre à jour la visibilité des inputs sans recréer tous les blocs
                    repeatCountTextBox.Visibility = selectedMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed;
                    keyCodeTextBox.Visibility = selectedMode == RepeatMode.WhileKeyPressed ? Visibility.Visible : Visibility.Collapsed;
                    clickTypeComboBox.Visibility = selectedMode == RepeatMode.WhileClickPressed ? Visibility.Visible : Visibility.Collapsed;
                    
                    // Sauvegarder le changement de mode
                    SaveState();
                    ra.RepeatMode = selectedMode;
                    
                    if (selectedMode == RepeatMode.Once)
                    {
                        ra.RepeatCount = 1;
                    }
                    else if (selectedMode == RepeatMode.UntilStopped)
                    {
                        ra.RepeatCount = 0;
                    }
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            
            // Rafraîchir les blocs après la fermeture du ComboBox
            modeComboBox.DropDownClosed += (s, e) =>
            {
                RefreshBlocks();
            };

            // Sauvegarder automatiquement le nombre de répétitions lors de la perte de focus (clic ailleurs)
            repeatCountTextBox.LostFocus += (s, e) =>
            {
                if (int.TryParse(repeatCountTextBox.Text, out int count) && count > 0)
                {
                    SaveState();
                    ra.RepeatCount = count;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    // Valeur invalide : restaurer la valeur originale
                    repeatCountTextBox.Text = ra.RepeatCount.ToString();
                }
            };

            // Sauvegarder automatiquement le type de clic lors du changement
            clickTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (clickTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ra.ClickTypeToMonitor = clickTypeComboBox.SelectedIndex;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            
            // Rafraîchir les blocs seulement après la fermeture du ComboBox de type de clic
            clickTypeComboBox.DropDownClosed += (s, e) =>
            {
                RefreshBlocks();
            };

            // Empêcher les TextBox de déclencher le drag & drop (les ComboBox peuvent être cliqués normalement)

            // Gestion des touches : Enter pour confirmer le nombre de répétitions, Escape pour annuler
            repeatCountTextBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(repeatCountTextBox.Text, out int count) && count > 0)
                    {
                        SaveState();
                        ra.RepeatCount = count;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    Keyboard.ClearFocus();
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    repeatCountTextBox.Text = ra.RepeatCount.ToString();
                    Keyboard.ClearFocus();
                }
            };

            return editPanel;
        }

        private void EditRepeatAction(RepeatAction ra, int index, TextBlock titleText)
        {
            // Cette méthode n'est plus utilisée, les contrôles sont créés directement dans CreateActionCard
            // Gardée pour compatibilité mais ne devrait pas être appelée
        }

        /// <summary>
        /// Crée les contrôles inline pour une action IfAction (toujours visibles dans la carte)
        /// </summary>
        private StackPanel CreateIfActionControls(IfAction ifAction, int index, Panel parentPanel)
        {
            // Créer un panel horizontal pour la condition
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Label "Si"
            var ifLabel = new TextBlock
            {
                Text = "Si",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(248, 239, 234))
            };
            editPanel.Children.Add(ifLabel);

            // CheckBox pour la condition (True/False)
            var conditionCheckBox = new CheckBox
            {
                IsChecked = ifAction.Condition,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Content = ifAction.Condition ? "Vrai" : "Faux"
            };
            
            conditionCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ifAction.Condition = true;
                conditionCheckBox.Content = "Vrai";
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };
            
            conditionCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ifAction.Condition = false;
                conditionCheckBox.Content = "Faux";
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };
            
            editPanel.Children.Add(conditionCheckBox);

            return editPanel;
        }

        /// <summary>
        /// Crée un conteneur pour une IfAction avec ses actions imbriquées (Then et Else)
        /// </summary>
        private FrameworkElement CreateIfActionContainer(IfAction ifAction, int index)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Ajouter la carte principale de l'action IfAction
            var actionContainer = CreateActionCardWithButtons(ifAction, index);
            container.Children.Add(actionContainer);

            // Section Then
            var thenSection = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20, 4, 0, 4)
            };

            // Header "Then"
            var thenHeader = new TextBlock
            {
                Text = "Then:",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
                Foreground = new SolidColorBrush(Color.FromRgb(34, 139, 34))
            };
            thenSection.Children.Add(thenHeader);

            // Conteneur pour les actions Then avec indentation
            if (ifAction.ThenActions != null && ifAction.ThenActions.Count > 0)
            {
                var thenContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4),
                    Background = new SolidColorBrush(Color.FromArgb(10, 34, 139, 34)) // Fond léger vert
                };

                for (int i = 0; i < ifAction.ThenActions.Count; i++)
                {
                    var nestedAction = ifAction.ThenActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, index, i, true); // true = Then
                    thenContainer.Children.Add(nestedCard);
                }
                thenSection.Children.Add(thenContainer);
            }

            // Panel pour ajouter des actions dans Then
            var addThenActionsPanel = CreateAddIfActionsPanel(ifAction, index, true);
            thenSection.Children.Add(addThenActionsPanel);
            container.Children.Add(thenSection);

            // Section Else
            var elseSection = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20, 4, 0, 4)
            };

            // Header "Else"
            var elseHeader = new TextBlock
            {
                Text = "Else:",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
                Foreground = new SolidColorBrush(Color.FromRgb(200, 80, 80))
            };
            elseSection.Children.Add(elseHeader);

            // Conteneur pour les actions Else avec indentation
            if (ifAction.ElseActions != null && ifAction.ElseActions.Count > 0)
            {
                var elseContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4),
                    Background = new SolidColorBrush(Color.FromArgb(10, 200, 80, 80)) // Fond léger rouge
                };

                for (int i = 0; i < ifAction.ElseActions.Count; i++)
                {
                    var nestedAction = ifAction.ElseActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, index, i, false); // false = Else
                    elseContainer.Children.Add(nestedCard);
                }
                elseSection.Children.Add(elseContainer);
            }

            // Panel pour ajouter des actions dans Else
            var addElseActionsPanel = CreateAddIfActionsPanel(ifAction, index, false);
            elseSection.Children.Add(addElseActionsPanel);
            container.Children.Add(elseSection);

            return container;
        }

        /// <summary>
        /// Crée un conteneur pour une RepeatAction avec ses actions imbriquées
        /// </summary>
        private FrameworkElement CreateRepeatActionContainer(RepeatAction ra, int index)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Ajouter la carte principale de l'action RepeatAction
            var actionContainer = CreateActionCardWithButtons(ra, index);
            container.Children.Add(actionContainer);

            // Créer un conteneur pour les actions imbriquées avec indentation
            if (ra.Actions != null && ra.Actions.Count > 0)
            {
                var nestedContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(20, 4, 0, 4), // Indentation
                    Background = new SolidColorBrush(Color.FromArgb(10, 138, 43, 226)) // Fond léger violet
                };

                for (int i = 0; i < ra.Actions.Count; i++)
                {
                    var nestedAction = ra.Actions[i];
                    var nestedCard = CreateNestedActionCard(nestedAction, index, i);
                    nestedContainer.Children.Add(nestedCard);
                }
                container.Children.Add(nestedContainer);
            }

            // Ajouter un panel pour ajouter de nouvelles actions dans le RepeatAction
            var addActionsPanel = CreateAddActionsPanel(ra, index);
            container.Children.Add(addActionsPanel);

            return container;
        }

        /// <summary>
        /// Crée une carte pour une action imbriquée dans un RepeatAction
        /// </summary>
        private FrameworkElement CreateNestedActionCard(IInputAction action, int parentIndex, int nestedIndex)
        {
            // Créer la carte visuelle avec CreateActionCard
            var card = CreateActionCard(action, parentIndex);
            
            // Trouver le TextBlock titleBlock et ajouter les handlers d'édition appropriés
            var titleBlock = FindTitleBlockInCard(card);
            if (titleBlock != null)
            {
                // Ajouter les handlers appropriés selon le type d'action
                // Note: Les handlers d'origine sont toujours attachés mais ne seront pas appelés
                // car nous utilisons e.Handled = true dans nos handlers
                if (action is KeyboardAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedKeyboardAction(parentIndex, nestedIndex, titleBlock);
                    };
                }
                else if (action is DelayAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedDelayAction(parentIndex, nestedIndex, titleBlock);
                    };
                }
                else if (action is Core.Inputs.MouseAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedMouseAction(parentIndex, nestedIndex, titleBlock);
                    };
                }
            }

            // Retirer les handlers drag & drop de la carte (les actions imbriquées ne doivent pas être déplaçables entre RepeatActions)
            card.MouseLeftButtonDown -= ActionCard_MouseLeftButtonDown;
            card.MouseMove -= ActionCard_MouseMove;
            card.MouseLeftButtonUp -= ActionCard_MouseLeftButtonUp;
            card.Drop -= ActionCard_Drop;
            card.DragEnter -= ActionCard_DragEnter;
            card.DragLeave -= ActionCard_DragLeave;
            card.AllowDrop = false;
            card.Cursor = Cursors.Arrow;

            // Conteneur Grid pour la carte + boutons flèches + bouton supprimer
            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(0, 0, 0, 2),
                MinWidth = 400
            };

            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Boutons flèches
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Bouton supprimer

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 0);
            container.Children.Add(card);

            // Boutons flèches pour les actions imbriquées
            var moveButtonsContainer = CreateNestedMoveButtonsContainer(action, parentIndex, nestedIndex);
            Grid.SetColumn(moveButtonsContainer, 1);
            container.Children.Add(moveButtonsContainer);

            // Bouton supprimer pour les actions imbriquées
            var deleteBtn = new Border
            {
                Width = 28,
                Height = 28,
                Background = new SolidColorBrush(Color.FromArgb(180, 220, 53, 69)), // Rouge pour supprimer
                CornerRadius = new CornerRadius(4),
                Cursor = Cursors.Hand,
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right,
                Tag = new NestedActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex },
                Visibility = Visibility.Visible
            };

            var deleteText = new TextBlock
            {
                Text = "✕",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            deleteBtn.Child = deleteText;
            deleteBtn.MouseLeftButtonDown += DeleteNestedAction_Click;

            deleteBtn.MouseEnter += (s, e) =>
            {
                deleteBtn.Background = new SolidColorBrush(Color.FromRgb(200, 35, 51));
            };
            deleteBtn.MouseLeave += (s, e) =>
            {
                deleteBtn.Background = new SolidColorBrush(Color.FromArgb(180, 220, 53, 69));
            };

            Grid.SetColumn(deleteBtn, 2);
            container.Children.Add(deleteBtn);

            return container;
        }

        /// <summary>
        /// Trouve le TextBlock titre dans une carte d'action
        /// </summary>
        private TextBlock? FindTitleBlockInCard(DependencyObject card)
        {
            if (card == null) return null;

            // Parcourir l'arbre visuel pour trouver le TextBlock qui est dans un StackPanel
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(card); i++)
            {
                var child = VisualTreeHelper.GetChild(card, i);
                
                if (child is TextBlock textBlock && textBlock.Cursor == Cursors.Hand)
                {
                    // C'est probablement le titleBlock
                    return textBlock;
                }
                
                // Récursion
                var found = FindTitleBlockInCard(child);
                if (found != null)
                    return found;
            }
            
            return null;
        }

        /// <summary>
        /// Crée un conteneur avec les boutons monter/descendre pour les actions imbriquées
        /// </summary>
        private FrameworkElement CreateNestedMoveButtonsContainer(IInputAction action, int parentIndex, int nestedIndex)
        {
            // Conteneur séparé pour les boutons monter/descendre
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(1.5),
                BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0)),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(2, 2, 2, 2),
                Margin = new Thickness(10, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 48,
                MaxHeight = 48,
                Visibility = Visibility.Visible
            };
            
            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            
            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            // Vérifier si on peut monter/descendre
            bool canMoveUp = false;
            bool canMoveDown = false;

            if (_currentMacro != null && parentIndex >= 0 && parentIndex < _currentMacro.Actions.Count)
            {
                if (_currentMacro.Actions[parentIndex] is RepeatAction repeatAction && repeatAction.Actions != null)
                {
                    canMoveUp = nestedIndex > 0;
                    canMoveDown = nestedIndex < repeatAction.Actions.Count - 1;
                }
            }

            // Bouton monter (▲)
            var moveUpBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0))
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)),
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0),
                Tag = new NestedActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex }
            };
            
            var moveUpBtnText = new TextBlock
            {
                Text = "▲",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveUp
                    ? new SolidColorBrush(Color.FromRgb(80, 80, 80))
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 36,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveUpBtnBorder.Child = moveUpBtnText;
            moveUpBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveUp)
                {
                    MoveNestedActionUp(parentIndex, nestedIndex);
                    e.Handled = true;
                }
            };
            moveUpBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = new SolidColorBrush(Color.FromRgb(60, 60, 60));
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(60, 0, 0, 0));
                }
            };
            moveUpBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = new SolidColorBrush(Color.FromRgb(80, 80, 80));
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0));
                }
            };

            // Bouton descendre (▼)
            var moveDownBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0))
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)),
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(0),
                Tag = new NestedActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex }
            };
            
            var moveDownBtnText = new TextBlock
            {
                Text = "▼",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveDown
                    ? new SolidColorBrush(Color.FromRgb(80, 80, 80))
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 1,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveDownBtnBorder.Child = moveDownBtnText;
            moveDownBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveDown)
                {
                    MoveNestedActionDown(parentIndex, nestedIndex);
                    e.Handled = true;
                }
            };
            moveDownBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = new SolidColorBrush(Color.FromRgb(60, 60, 60));
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(60, 0, 0, 0));
                }
            };
            moveDownBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = new SolidColorBrush(Color.FromRgb(80, 80, 80));
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0));
                }
            };

            moveButtonsPanel.Children.Add(moveUpBtnBorder);
            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            
            centeringGrid.Children.Add(moveButtonsPanel);
            moveButtonsContainer.Child = centeringGrid;
            
            return moveButtonsContainer;
        }

        /// <summary>
        /// Crée un panel avec des boutons pour ajouter des actions dans un RepeatAction
        /// </summary>
        private FrameworkElement CreateAddActionsPanel(RepeatAction ra, int repeatActionIndex)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(20, 4, 0, 8) // Indentation
            };

            // Fonction helper pour créer un bouton d'ajout
            Func<string, string, IInputAction, Border> createAddButton = (icon, text, actionInstance) =>
            {
                var button = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(20, 0, 0, 0)),
                    CornerRadius = new CornerRadius(4),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 4, 0),
                    Cursor = Cursors.Hand,
                    Tag = new RepeatActionInfo { RepeatActionIndex = repeatActionIndex, ActionType = actionInstance.Type.ToString() }
                };
                button.MouseLeftButtonDown += AddActionToRepeat_Click;

                var textBlock = new TextBlock
                {
                    Text = $"{icon} {text}",
                    FontSize = 11,
                    Foreground = new SolidColorBrush(Color.FromArgb(180, 0, 0, 0)),
                    FontWeight = FontWeights.Medium
                };
                button.Child = textBlock;

                button.MouseEnter += (s, e) =>
                {
                    button.Background = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0));
                };
                button.MouseLeave += (s, e) =>
                {
                    button.Background = new SolidColorBrush(Color.FromArgb(20, 0, 0, 0));
                };

                return button;
            };

            panel.Children.Add(createAddButton("⌨", "Touche", new KeyboardAction()));
            panel.Children.Add(createAddButton("🖱", "Clic", new Core.Inputs.MouseAction()));
            panel.Children.Add(createAddButton("⏱", "Délai", new DelayAction()));

            return panel;
        }

        /// <summary>
        /// Ajoute une action dans un RepeatAction
        /// </summary>
        private void AddActionToRepeat_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not RepeatActionInfo info) return;

            var repeatActionIndex = info.RepeatActionIndex;
            if (repeatActionIndex < 0 || repeatActionIndex >= _currentMacro.Actions.Count) return;

            if (_currentMacro.Actions[repeatActionIndex] is not RepeatAction repeatAction) return;

            SaveState();

            IInputAction? newAction = info.ActionType switch
            {
                "Keyboard" => new KeyboardAction
                {
                    VirtualKeyCode = 0,
                    ActionType = KeyboardActionType.Press
                },
                "Mouse" => new Core.Inputs.MouseAction
                {
                    ActionType = Core.Inputs.MouseActionType.LeftClick,
                    X = -1,
                    Y = -1
                },
                "Delay" => new DelayAction
                {
                    Duration = 100
                },
                _ => null
            };

            if (newAction != null)
            {
                if (repeatAction.Actions == null)
                {
                    repeatAction.Actions = new List<IInputAction>();
                }
                repeatAction.Actions.Add(newAction);
                _currentMacro.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }

            e.Handled = true;
        }

        /// <summary>
        /// Déplace une action imbriquée vers le haut dans un RepeatAction
        /// </summary>
        private void MoveNestedActionUp(int parentIndex, int nestedIndex)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex <= 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            SaveState();
            
            // Échanger l'action imbriquée avec celle au-dessus
            var action = repeatAction.Actions[nestedIndex];
            repeatAction.Actions.RemoveAt(nestedIndex);
            repeatAction.Actions.Insert(nestedIndex - 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Déplace une action imbriquée vers le bas dans un RepeatAction
        /// </summary>
        private void MoveNestedActionDown(int parentIndex, int nestedIndex)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count - 1)
                return;

            SaveState();
            
            // Échanger l'action imbriquée avec celle en dessous
            var action = repeatAction.Actions[nestedIndex];
            repeatAction.Actions.RemoveAt(nestedIndex);
            repeatAction.Actions.Insert(nestedIndex + 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Supprime une action imbriquée d'un RepeatAction
        /// </summary>
        private void DeleteNestedAction_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not NestedActionInfo info) return;

            var parentIndex = info.ParentIndex;
            var nestedIndex = info.NestedIndex;

            if (parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction) return;
            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count) return;

            SaveState();

            repeatAction.Actions.RemoveAt(nestedIndex);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);

            e.Handled = true;
        }

        /// <summary>
        /// Crée une carte pour une action imbriquée dans un IfAction (Then ou Else)
        /// </summary>
        private FrameworkElement CreateNestedIfActionCard(IInputAction action, int parentIndex, int nestedIndex, bool isThen)
        {
            // Réutiliser CreateNestedActionCard mais adapter pour IfAction
            // Pour l'instant, on utilise la même structure que RepeatAction
            var card = CreateActionCard(action, parentIndex);
            
            var titleBlock = FindTitleBlockInCard(card);
            if (titleBlock != null)
            {
                if (action is KeyboardAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfKeyboardAction(parentIndex, nestedIndex, isThen, titleBlock);
                    };
                }
                else if (action is DelayAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfDelayAction(parentIndex, nestedIndex, isThen, titleBlock);
                    };
                }
                else if (action is Core.Inputs.MouseAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfMouseAction(parentIndex, nestedIndex, isThen, titleBlock);
                    };
                }
            }

            card.MouseLeftButtonDown -= ActionCard_MouseLeftButtonDown;
            card.MouseMove -= ActionCard_MouseMove;
            card.MouseLeftButtonUp -= ActionCard_MouseLeftButtonUp;
            card.Drop -= ActionCard_Drop;
            card.DragEnter -= ActionCard_DragEnter;
            card.DragLeave -= ActionCard_DragLeave;
            card.AllowDrop = false;
            card.Cursor = Cursors.Arrow;

            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(0, 0, 0, 2),
                MinWidth = 400
            };

            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 0);
            container.Children.Add(card);

            var moveButtonsContainer = CreateNestedIfMoveButtonsContainer(action, parentIndex, nestedIndex, isThen);
            Grid.SetColumn(moveButtonsContainer, 1);
            container.Children.Add(moveButtonsContainer);

            var deleteBtn = new Border
            {
                Width = 28,
                Height = 28,
                Background = new SolidColorBrush(Color.FromArgb(180, 220, 53, 69)),
                CornerRadius = new CornerRadius(4),
                Cursor = Cursors.Hand,
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right,
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen },
                Visibility = Visibility.Visible
            };

            var deleteText = new TextBlock
            {
                Text = "✕",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            deleteBtn.Child = deleteText;
            deleteBtn.MouseLeftButtonDown += DeleteNestedIfAction_Click;

            deleteBtn.MouseEnter += (s, e) => deleteBtn.Background = new SolidColorBrush(Color.FromRgb(200, 35, 51));
            deleteBtn.MouseLeave += (s, e) => deleteBtn.Background = new SolidColorBrush(Color.FromArgb(180, 220, 53, 69));

            Grid.SetColumn(deleteBtn, 2);
            container.Children.Add(deleteBtn);

            return container;
        }

        /// <summary>
        /// Crée un panel avec des boutons pour ajouter des actions dans un IfAction (Then ou Else)
        /// </summary>
        private FrameworkElement CreateAddIfActionsPanel(IfAction ifAction, int ifActionIndex, bool isThen)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 4, 0, 8)
            };

            Func<string, string, IInputAction, Border> createAddButton = (icon, text, actionInstance) =>
            {
                var button = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(20, 0, 0, 0)),
                    CornerRadius = new CornerRadius(4),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 4, 0),
                    Cursor = Cursors.Hand,
                    Tag = new IfActionInfo { IfActionIndex = ifActionIndex, ActionType = actionInstance.Type.ToString(), IsThen = isThen }
                };
                button.MouseLeftButtonDown += AddActionToIf_Click;

                var textBlock = new TextBlock
                {
                    Text = $"{icon} {text}",
                    FontSize = 11,
                    Foreground = new SolidColorBrush(Color.FromArgb(180, 0, 0, 0)),
                    FontWeight = FontWeights.Medium
                };
                button.Child = textBlock;

                button.MouseEnter += (s, e) => button.Background = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0));
                button.MouseLeave += (s, e) => button.Background = new SolidColorBrush(Color.FromArgb(20, 0, 0, 0));

                return button;
            };

            panel.Children.Add(createAddButton("⌨", "Touche", new KeyboardAction()));
            panel.Children.Add(createAddButton("🖱", "Clic", new Core.Inputs.MouseAction()));
            panel.Children.Add(createAddButton("⏱", "Délai", new DelayAction()));

            return panel;
        }

        /// <summary>
        /// Crée un conteneur de boutons pour déplacer une action imbriquée dans un IfAction
        /// </summary>
        private FrameworkElement CreateNestedIfMoveButtonsContainer(IInputAction action, int parentIndex, int nestedIndex, bool isThen)
        {
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(1.5),
                BorderBrush = new SolidColorBrush(Color.FromArgb(40, 0, 0, 0)),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(2, 2, 2, 2),
                Margin = new Thickness(10, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 48,
                MaxHeight = 48,
                Visibility = Visibility.Visible
            };

            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            bool canMoveUp = false;
            bool canMoveDown = false;

            if (_currentMacro != null && parentIndex >= 0 && parentIndex < _currentMacro.Actions.Count)
            {
                if (_currentMacro.Actions[parentIndex] is IfAction ifAction)
                {
                    var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
                    if (actionsList != null)
                    {
                        canMoveUp = nestedIndex > 0;
                        canMoveDown = nestedIndex < actionsList.Count - 1;
                    }
                }
            }

            var moveUpBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(180, 70, 130, 180))
                    : new SolidColorBrush(Color.FromArgb(50, 150, 150, 150)),
                CornerRadius = new CornerRadius(4),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 2),
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
            };

            var moveUpText = new TextBlock
            {
                Text = "▲",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            moveUpBtnBorder.Child = moveUpText;

            if (canMoveUp)
            {
                moveUpBtnBorder.MouseLeftButtonDown += (s, e) =>
                {
                    e.Handled = true;
                    MoveNestedIfActionUp(parentIndex, nestedIndex, isThen);
                };
                moveUpBtnBorder.MouseEnter += (s, e) => moveUpBtnBorder.Background = new SolidColorBrush(Color.FromRgb(90, 150, 200));
                moveUpBtnBorder.MouseLeave += (s, e) => moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(180, 70, 130, 180));
            }

            moveButtonsPanel.Children.Add(moveUpBtnBorder);

            var moveDownBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(180, 70, 130, 180))
                    : new SolidColorBrush(Color.FromArgb(50, 150, 150, 150)),
                CornerRadius = new CornerRadius(4),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
            };

            var moveDownText = new TextBlock
            {
                Text = "▼",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            moveDownBtnBorder.Child = moveDownText;

            if (canMoveDown)
            {
                moveDownBtnBorder.MouseLeftButtonDown += (s, e) =>
                {
                    e.Handled = true;
                    MoveNestedIfActionDown(parentIndex, nestedIndex, isThen);
                };
                moveDownBtnBorder.MouseEnter += (s, e) => moveDownBtnBorder.Background = new SolidColorBrush(Color.FromRgb(90, 150, 200));
                moveDownBtnBorder.MouseLeave += (s, e) => moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(180, 70, 130, 180));
            }

            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            centeringGrid.Children.Add(moveButtonsPanel);
            moveButtonsContainer.Child = centeringGrid;

            return moveButtonsContainer;
        }

        /// <summary>
        /// Ajoute une action dans un IfAction (Then ou Else)
        /// </summary>
        private void AddActionToIf_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not IfActionInfo info) return;

            var ifActionIndex = info.IfActionIndex;
            if (ifActionIndex < 0 || ifActionIndex >= _currentMacro.Actions.Count) return;

            if (_currentMacro.Actions[ifActionIndex] is not IfAction ifAction) return;

            SaveState();

            IInputAction? newAction = info.ActionType switch
            {
                "Keyboard" => new KeyboardAction { VirtualKeyCode = 0, ActionType = KeyboardActionType.Press },
                "Mouse" => new Core.Inputs.MouseAction { ActionType = Core.Inputs.MouseActionType.LeftClick, X = -1, Y = -1 },
                "Delay" => new DelayAction { Duration = 100 },
                _ => null
            };

            if (newAction != null)
            {
                var actionsList = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
                if (actionsList == null)
                {
                    actionsList = new List<IInputAction>();
                    if (info.IsThen)
                        ifAction.ThenActions = actionsList;
                    else
                        ifAction.ElseActions = actionsList;
                }
                actionsList.Add(newAction);
                _currentMacro.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }

            e.Handled = true;
        }

        /// <summary>
        /// Déplace une action imbriquée vers le haut dans un IfAction
        /// </summary>
        private void MoveNestedIfActionUp(int parentIndex, int nestedIndex, bool isThen)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex <= 0 || nestedIndex >= actionsList.Count) return;

            SaveState();
            var action = actionsList[nestedIndex];
            actionsList.RemoveAt(nestedIndex);
            actionsList.Insert(nestedIndex - 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Déplace une action imbriquée vers le bas dans un IfAction
        /// </summary>
        private void MoveNestedIfActionDown(int parentIndex, int nestedIndex, bool isThen)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count - 1) return;

            SaveState();
            var action = actionsList[nestedIndex];
            actionsList.RemoveAt(nestedIndex);
            actionsList.Insert(nestedIndex + 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Supprime une action imbriquée d'un IfAction
        /// </summary>
        private void DeleteNestedIfAction_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not NestedIfActionInfo info) return;

            var parentIndex = info.ParentIndex;
            var nestedIndex = info.NestedIndex;

            if (parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count) return;

            SaveState();
            actionsList.RemoveAt(nestedIndex);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);

            e.Handled = true;
        }

        // Méthodes d'édition inline pour les actions imbriquées dans IfAction
        private void EditNestedIfKeyboardAction(int parentIndex, int nestedIndex, bool isThen, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not KeyboardAction ka)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            bool keyCaptured = false;
            var originalMargin = titleText.Margin;
            var originalWidth = titleText.Width;

            var textBox = new TextBox
            {
                Text = GetKeyName(ka.VirtualKeyCode),
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                Foreground = titleText.Foreground,
                Background = new SolidColorBrush(Color.FromRgb(255, 255, 255)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(100, 149, 237)),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin,
                Width = originalWidth != double.NaN ? originalWidth : 200,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left
            };

            KeyboardHook? tempKeyHook = null;
            textBox.GotFocus += (s, e) =>
            {
                if (!keyCaptured)
                {
                    keyCaptured = true;
                    textBox.Text = "Appuyez sur une touche...";
                    textBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 200));
                    tempKeyHook = new KeyboardHook();
                    tempKeyHook.KeyDown += (sender, args) =>
                    {
                        SaveState();
                        ka.VirtualKeyCode = (ushort)args.VirtualKeyCode;
                        textBox.Text = GetKeyName(ka.VirtualKeyCode);
                        textBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                        keyCaptured = false;
                        tempKeyHook?.Uninstall();
                        tempKeyHook = null;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    };
                    tempKeyHook.Install();
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                tempKeyHook?.Uninstall();
                tempKeyHook = null;
                if (keyCaptured)
                {
                    keyCaptured = false;
                }
            };

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        private void EditNestedIfDelayAction(int parentIndex, int nestedIndex, bool isThen, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            var textBox = new TextBox
            {
                Text = da.Duration.ToString(),
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                Foreground = titleText.Foreground,
                Background = new SolidColorBrush(Color.FromRgb(255, 255, 255)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(100, 149, 237)),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin,
                Width = 100,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left
            };

            textBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);

            textBox.KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    Keyboard.ClearFocus();
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    textBox.Text = da.Duration.ToString();
                    Keyboard.ClearFocus();
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                {
                    SaveState();
                    da.Duration = duration;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    textBox.Text = da.Duration.ToString();
                }
            };

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        private void EditNestedIfMouseAction(int parentIndex, int nestedIndex, bool isThen, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not Core.Inputs.MouseAction ma)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            var clickTypeComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                VerticalAlignment = VerticalAlignment.Center,
                SelectedIndex = (int)ma.ActionType
            };

            clickTypeComboBox.Items.Add("Clic gauche");
            clickTypeComboBox.Items.Add("Clic droit");
            clickTypeComboBox.Items.Add("Clic milieu");
            clickTypeComboBox.Items.Add("Bouton gauche ↓");
            clickTypeComboBox.Items.Add("Bouton gauche ↑");
            clickTypeComboBox.Items.Add("Bouton droit ↓");
            clickTypeComboBox.Items.Add("Bouton droit ↑");
            clickTypeComboBox.Items.Add("Bouton milieu ↓");
            clickTypeComboBox.Items.Add("Bouton milieu ↑");
            clickTypeComboBox.Items.Add("Déplacement");
            clickTypeComboBox.Items.Add("Molette ↑");
            clickTypeComboBox.Items.Add("Molette ↓");

            clickTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (clickTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.ActionType = (Core.Inputs.MouseActionType)clickTypeComboBox.SelectedIndex;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            editPanel.Children.Add(clickTypeComboBox);

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                clickTypeComboBox.Focus();
            }));
        }

        /// <summary>
        /// Informations sur une action imbriquée (pour passer le contexte aux event handlers)
        /// </summary>
        private class NestedActionInfo
        {
            public int ParentIndex { get; set; }
            public int NestedIndex { get; set; }
        }

        /// <summary>
        /// Informations sur une action imbriquée dans un IfAction
        /// </summary>
        private class NestedIfActionInfo
        {
            public int ParentIndex { get; set; }
            public int NestedIndex { get; set; }
            public bool IsThen { get; set; }
        }

        /// <summary>
        /// Informations sur un RepeatAction (pour passer le contexte aux event handlers)
        /// </summary>
        private class RepeatActionInfo
        {
            public int RepeatActionIndex { get; set; }
            public string ActionType { get; set; } = "";
        }

        /// <summary>
        /// Informations sur un IfAction (pour passer le contexte aux event handlers)
        /// </summary>
        private class IfActionInfo
        {
            public int IfActionIndex { get; set; }
            public string ActionType { get; set; } = "";
            public bool IsThen { get; set; }
        }

        #endregion

        #region Options de répétition

        private void UpdateRepeatControls()
        {
            if (_currentMacro == null) return;

            switch (_currentMacro.RepeatMode)
            {
                case RepeatMode.Once:
                    RepeatModeComboBox.SelectedIndex = 0;
                    RepeatCountTextBox.Visibility = Visibility.Collapsed;
                    break;
                case RepeatMode.RepeatCount:
                    RepeatModeComboBox.SelectedIndex = 1;
                    RepeatCountTextBox.Visibility = Visibility.Visible;
                    RepeatCountTextBox.Text = _currentMacro.RepeatCount.ToString();
                    break;
                case RepeatMode.UntilStopped:
                    RepeatModeComboBox.SelectedIndex = 2;
                    RepeatCountTextBox.Visibility = Visibility.Collapsed;
                    break;
            }
        }

        private void RepeatModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_currentMacro == null) return;

            switch (RepeatModeComboBox.SelectedIndex)
            {
                case 0:
                    _currentMacro.RepeatMode = RepeatMode.Once;
                    _currentMacro.RepeatCount = 1;
                    RepeatCountTextBox.Visibility = Visibility.Collapsed;
                    break;
                case 1:
                    _currentMacro.RepeatMode = RepeatMode.RepeatCount;
                    RepeatCountTextBox.Visibility = Visibility.Visible;
                    break;
                case 2:
                    _currentMacro.RepeatMode = RepeatMode.UntilStopped;
                    RepeatCountTextBox.Visibility = Visibility.Collapsed;
                    break;
            }

            _currentMacro.ModifiedAt = DateTime.Now;
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void RepeatCountTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_currentMacro == null) return;

            if (int.TryParse(RepeatCountTextBox.Text, out int count) && count > 0)
            {
                _currentMacro.RepeatCount = count;
                _currentMacro.ModifiedAt = DateTime.Now;
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        #endregion

        #region Toggle Enable/Disable

        private void UpdateMacroEnableToggle()
        {
            if (MacroEnableToggle == null) return;

            if (_currentMacro != null)
            {
                MacroEnableToggle.IsEnabled = true;
                MacroEnableToggle.IsChecked = _currentMacro.IsEnabled;
            }
            else
            {
                MacroEnableToggle.IsEnabled = false;
                MacroEnableToggle.IsChecked = false;
            }
        }

        private void MacroEnableToggle_Checked(object sender, RoutedEventArgs e)
        {
            if (_currentMacro != null)
            {
                _currentMacro.IsEnabled = true;
                _currentMacro.ModifiedAt = DateTime.Now;
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        private void MacroEnableToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            if (_currentMacro != null)
            {
                _currentMacro.IsEnabled = false;
                _currentMacro.ModifiedAt = DateTime.Now;
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        #endregion

        #region Undo/Redo

        private void SaveState()
        {
            if (_currentMacro == null || _isUndoRedo) return;

            var state = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _undoStack.Push(state);
            
            if (_undoStack.Count > 50)
            {
                var temp = new Stack<List<IInputAction>>();
                for (int i = 0; i < 50; i++)
                {
                    temp.Push(_undoStack.Pop());
                }
                _undoStack = temp;
            }
            
            _redoStack.Clear();
            UpdateUndoRedoButtons();
        }

        private void Undo()
        {
            if (_currentMacro == null || _undoStack.Count == 0) return;

            var currentState = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _redoStack.Push(currentState);

            var previousState = _undoStack.Pop();
            _isUndoRedo = true;
            
            _currentMacro.Actions.Clear();
            _currentMacro.Actions.AddRange(previousState.Select(a => a.Clone()));
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
            
            _isUndoRedo = false;
            UpdateUndoRedoButtons();
        }

        private void Redo()
        {
            if (_currentMacro == null || _redoStack.Count == 0) return;

            var currentState = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _undoStack.Push(currentState);

            var nextState = _redoStack.Pop();
            _isUndoRedo = true;
            
            _currentMacro.Actions.Clear();
            _currentMacro.Actions.AddRange(nextState.Select(a => a.Clone()));
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
            
            _isUndoRedo = false;
            UpdateUndoRedoButtons();
        }

        private void UpdateUndoRedoButtons()
        {
            if (UndoButton != null)
            {
                UndoButton.IsEnabled = _currentMacro != null && _undoStack.Count > 0;
            }
            
            if (RedoButton != null)
            {
                RedoButton.IsEnabled = _currentMacro != null && _redoStack.Count > 0;
            }
        }

        private void UndoButton_Click(object sender, RoutedEventArgs e)
        {
            Undo();
        }

        private void RedoButton_Click(object sender, RoutedEventArgs e)
        {
            Redo();
        }

        #endregion
    }

    /// <summary>
    /// Dialogue simple pour capturer une touche (pour TimelineEditor)
    /// </summary>
    public class TimelineKeyCaptureDialog : Window
    {
        public int CapturedKey { get; private set; }
        private TextBlock _instructionText;

        public TimelineKeyCaptureDialog()
        {
            Title = "Capturer une touche";
            Width = 300;
            Height = 150;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode = ResizeMode.NoResize;
            Background = (SolidColorBrush)Application.Current.Resources["BackgroundPrimaryBrush"];

            var grid = new Grid { Margin = new Thickness(20) };
            
            _instructionText = new TextBlock
            {
                Text = "Appuyez sur une touche...",
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                FontSize = 16,
                Style = (Style)Application.Current.Resources["TextBody"]
            };
            grid.Children.Add(_instructionText);

            Content = grid;
            KeyDown += Dialog_KeyDown;
        }

        private void Dialog_KeyDown(object sender, KeyEventArgs e)
        {
            CapturedKey = KeyInterop.VirtualKeyFromKey(e.Key);
            _instructionText.Text = $"Touche: {e.Key}";
            DialogResult = true;
            Close();
        }
    }

    /// <summary>
    /// Helper pour parcourir l'arbre visuel
    /// </summary>
    public static class VisualTreeHelperExtensions
    {
        public static IEnumerable<DependencyObject> GetDescendants(DependencyObject element)
        {
            for (int i = 0; i < System.Windows.Media.VisualTreeHelper.GetChildrenCount(element); i++)
            {
                var child = System.Windows.Media.VisualTreeHelper.GetChild(element, i);
                yield return child;
                foreach (var descendant in GetDescendants(child))
                {
                    yield return descendant;
                }
            }
        }
    }
}

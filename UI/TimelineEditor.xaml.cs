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
                    title = GetDelayActionTitle(da);
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
                case TextAction ta:
                    primaryColor = Color.FromRgb(70, 130, 180); // Bleu acier #4682B4
                    hoverColor = Color.FromRgb(85, 150, 200); // Bleu hover #5596C8
                    backgroundColor = Color.FromRgb(70, 130, 180); // Fond #4682B4
                    backgroundColorHover = Color.FromRgb(85, 150, 200); // Dégradé hover #5596C8
                    textColor = Color.FromRgb(243, 235, 221); // Texte #F3EBDD
                    iconColor = Color.FromRgb(252, 252, 248); // Blanc cassé pour l'icône
                    icon = "📝";
                    title = GetTextActionTitle(ta);
                    details = GetTextActionDetails(ta);
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

            card.Child = contentGrid;

            // Effets hover : changement de couleur uniquement, pas de changement de taille ni de bordure
            card.MouseEnter += (s, e) =>
            {
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
                // Pour KeyboardAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var keyboardControlsPanel = CreateKeyboardActionControls(ka2, index, textPanel);
                textPanel.Children.Insert(0, keyboardControlsPanel);
            }
            else if (action is DelayAction da)
            {
                // Pour DelayAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var delayControlsPanel = CreateDelayActionControls(da, index, textPanel);
                textPanel.Children.Insert(0, delayControlsPanel);
            }
            else if (action is Core.Inputs.MouseAction ma)
            {
                // Pour MouseAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var mouseControlsPanel = CreateMouseActionControls(ma, index, textPanel);
                textPanel.Children.Insert(0, mouseControlsPanel);
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
            else if (action is TextAction ta)
            {
                // Pour TextAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                textPanel.Children.Remove(titleBlock);
                
                var textControlsPanel = CreateTextActionControls(ta, index, textPanel);
                textPanel.Children.Insert(0, textControlsPanel);
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
                TextAction => Color.FromRgb(70, 130, 180),
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

        private string GetDelayActionTitle(DelayAction da)
        {
            string unitLabel = da.Unit switch
            {
                TimeUnit.Milliseconds => "ms",
                TimeUnit.Seconds => "s",
                TimeUnit.Minutes => "min",
                _ => "ms"
            };

            if (da.IsRandom)
            {
                double minValue = da.GetMinDurationInUnit(da.Unit);
                double maxValue = da.GetMaxDurationInUnit(da.Unit);
                return $"Entre {minValue:0.##} {unitLabel} et {maxValue:0.##} {unitLabel}";
            }
            else
            {
                double value = da.GetDurationInUnit(da.Unit);
                return $"{value:0.##} {unitLabel}";
            }
        }

        private string GetTextActionTitle(TextAction ta)
        {
            if (string.IsNullOrEmpty(ta.Text))
                return "Texte vide";
            
            // Afficher les premiers caractères du texte (max 30)
            string preview = ta.Text.Length > 30 ? ta.Text.Substring(0, 30) + "..." : ta.Text;
            // Remplacer les retours à la ligne par \n pour l'affichage
            preview = preview.Replace("\n", "\\n").Replace("\r", "");
            return $"\"{preview}\"";
        }

        private string GetTextActionDetails(TextAction ta)
        {
            var details = new System.Text.StringBuilder();
            
            if (ta.PasteAtOnce)
            {
                details.Append("Coller");
            }
            else if (ta.UseNaturalTyping)
            {
                details.Append($"Frappe naturelle ({ta.MinDelay}-{ta.MaxDelay} ms)");
            }
            else
            {
                details.Append($"Vitesse: {ta.TypingSpeed} ms");
            }
            
            if (!string.IsNullOrEmpty(ta.Text))
            {
                details.Append($" • {ta.Text.Length} caractère{(ta.Text.Length > 1 ? "s" : "")}");
            }
            
            return details.ToString();
        }

        /// <summary>
        /// Parse un double en acceptant à la fois les virgules et les points comme séparateurs décimaux
        /// </summary>
        private bool TryParseDouble(string text, out double result)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                result = 0;
                return false;
            }

            // Remplacer les virgules par des points pour le parsing
            string normalizedText = text.Replace(',', '.');
            
            // Essayer de parser avec le format invariant (point comme séparateur)
            return double.TryParse(normalizedText, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out result);
        }

        private string GetKeyboardActionDetails(KeyboardAction ka)
        {
            var parts = new System.Collections.Generic.List<string>();
            
            // Ajouter les modificateurs
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Control))
                parts.Add("Ctrl");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Alt))
                parts.Add("Alt");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Shift))
                parts.Add("Shift");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Windows))
                parts.Add("Win");
            
            // Ajouter la touche principale
            if (ka.VirtualKeyCode != 0)
            {
                parts.Add(GetKeyName(ka.VirtualKeyCode));
            }
            
            // Ajouter le type d'action si ce n'est pas Press
            if (ka.ActionType != KeyboardActionType.Press)
            {
                var actionType = ka.ActionType == KeyboardActionType.Down ? "Maintenir" : "Relâcher";
                return $"{string.Join(" + ", parts)} ({actionType})";
            }
            
            return parts.Count > 0 ? string.Join(" + ", parts) : "Touche ?";
        }

        private string GetMouseActionTitle(Core.Inputs.MouseAction ma)
        {
            return ma.ActionType switch
            {
                MouseActionType.LeftClick => "Clic gauche",
                MouseActionType.RightClick => "Clic droit",
                MouseActionType.MiddleClick => "Clic milieu",
                MouseActionType.DoubleLeftClick => "Double-clic gauche",
                MouseActionType.DoubleRightClick => "Double-clic droit",
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
            var details = new System.Text.StringBuilder();
            
            // Afficher les coordonnées pour les actions qui en ont besoin
            bool showCoords = ma.ActionType == Core.Inputs.MouseActionType.LeftClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.RightClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.MiddleClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.DoubleLeftClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.DoubleRightClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.LeftDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.RightDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.MiddleDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.Move;
            
            if (showCoords)
            {
                if (ma.ActionType == Core.Inputs.MouseActionType.Move)
                {
                    // Affichage spécial pour le déplacement
                    if (ma.IsRelativeMove)
                    {
                        if (ma.X != 0 || ma.Y != 0)
                        {
                            details.Append($"Déplacer de ({ma.X:+0;-0;0}, {ma.Y:+0;-0;0})");
                        }
                        else
                        {
                            details.Append("Déplacer de (0, 0)");
                        }
                    }
                    else
                    {
                        if (ma.X >= 0 && ma.Y >= 0)
                        {
                            details.Append($"Déplacer vers ({ma.X}, {ma.Y})");
                        }
                        else
                        {
                            details.Append("Déplacer vers position actuelle");
                        }
                    }
                    
                    // Afficher la vitesse si elle n'est pas instantanée
                    if (ma.MoveSpeed != Core.Inputs.MoveSpeed.Instant)
                    {
                        details.Append($" • {GetMoveSpeedLabel(ma.MoveSpeed)}");
                    }
                    
                    // Afficher l'easing si ce n'est pas linéaire
                    if (ma.MoveEasing != Core.Inputs.MoveEasing.Linear)
                    {
                        details.Append($" • {GetMoveEasingLabel(ma.MoveEasing)}");
                    }
                    
                    // Afficher le point de contrôle si Bézier est activé
                    if (ma.UseBezierPath && ma.ControlX >= 0 && ma.ControlY >= 0)
                    {
                        details.Append($" • Bézier: ({ma.ControlX}, {ma.ControlY})");
                    }
                    
                    // Afficher le point de contrôle si Bézier est activé
                    if (ma.UseBezierPath && ma.ControlX >= 0 && ma.ControlY >= 0)
                    {
                        details.Append($" • Bézier: ({ma.ControlX}, {ma.ControlY})");
                    }
                }
                else
                {
                    // Affichage normal pour les clics
                    if (ma.X >= 0 && ma.Y >= 0)
                    {
                        details.Append($"Position: ({ma.X}, {ma.Y})");
                    }
                    else
                    {
                        details.Append("Position actuelle");
                    }
                }
            }
            
            // Afficher le delta pour les actions de molette
            bool showDelta = ma.ActionType == Core.Inputs.MouseActionType.WheelUp ||
                           ma.ActionType == Core.Inputs.MouseActionType.WheelDown ||
                           ma.ActionType == Core.Inputs.MouseActionType.Wheel;
            
            if (showDelta)
            {
                if (details.Length > 0)
                {
                    details.Append(" • ");
                }
                details.Append($"Delta: {ma.Delta}");
            }
            
            return details.Length > 0 ? details.ToString() : "";
        }

        private string GetMoveSpeedLabel(Core.Inputs.MoveSpeed speed)
        {
            return speed switch
            {
                Core.Inputs.MoveSpeed.Instant => "Instantané",
                Core.Inputs.MoveSpeed.Fast => "Rapide",
                Core.Inputs.MoveSpeed.Gradual => "Graduel",
                _ => "Instantané"
            };
        }

        private string GetMoveEasingLabel(Core.Inputs.MoveEasing easing)
        {
            return easing switch
            {
                Core.Inputs.MoveEasing.Linear => "Linéaire",
                Core.Inputs.MoveEasing.EaseIn => "Accélération",
                Core.Inputs.MoveEasing.EaseOut => "Décélération",
                Core.Inputs.MoveEasing.EaseInOut => "Ease-in-out",
                _ => "Linéaire"
            };
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
            // Si plusieurs conditions, afficher un résumé
            if (ifAction.Conditions != null && ifAction.Conditions.Count > 1)
            {
                var conditionTexts = new List<string>();
                for (int i = 0; i < ifAction.Conditions.Count; i++)
                {
                    var condition = ifAction.Conditions[i];
                    var conditionText = GetConditionText(condition);
                    conditionTexts.Add(conditionText);
                    
                    // Ajouter l'opérateur entre les conditions
                    if (i < ifAction.Conditions.Count - 1 && i < ifAction.Operators.Count)
                    {
                        var op = ifAction.Operators[i] == LogicalOperator.AND ? "ET" : "OU";
                        conditionTexts.Add(op);
                    }
                }
                return $"Si {string.Join(" ", conditionTexts)}";
            }
            
            // Une seule condition ou compatibilité avec l'ancien format
            if (ifAction.Conditions != null && ifAction.Conditions.Count == 1)
            {
                return GetConditionText(ifAction.Conditions[0]);
            }
            
            // Ancien format (compatibilité)
            return ifAction.ConditionType switch
            {
                ConditionType.Boolean => ifAction.Condition ? "Si (Vrai)" : "Si (Faux)",
                ConditionType.ActiveApplication => ifAction.ActiveApplicationConfig != null
                    ? $"Si {ifAction.ActiveApplicationConfig.ProcessName} est actif"
                    : "Si Application active",
                ConditionType.KeyboardKey => ifAction.KeyboardKeyConfig != null
                    ? $"Si {GetKeyName(ifAction.KeyboardKeyConfig.VirtualKeyCode)} est pressée"
                    : "Si Touche clavier",
                ConditionType.ProcessRunning => ifAction.ProcessRunningConfig != null
                    ? $"Si {ifAction.ProcessRunningConfig.ProcessName} est ouvert"
                    : "Si Processus ouvert",
                ConditionType.PixelColor => ifAction.PixelColorConfig != null
                    ? $"Si pixel ({ifAction.PixelColorConfig.X},{ifAction.PixelColorConfig.Y}) = {ifAction.PixelColorConfig.ExpectedColor}"
                    : "Si Pixel couleur",
                ConditionType.MousePosition => ifAction.MousePositionConfig != null
                    ? $"Si souris dans zone ({ifAction.MousePositionConfig.X1},{ifAction.MousePositionConfig.Y1})-({ifAction.MousePositionConfig.X2},{ifAction.MousePositionConfig.Y2})"
                    : "Si Position souris",
                ConditionType.TimeDate => ifAction.TimeDateConfig != null
                    ? $"Si {ifAction.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(ifAction.TimeDateConfig.Operator)} {ifAction.TimeDateConfig.Value}"
                    : "Si Temps/Date",
                ConditionType.ImageOnScreen => ifAction.ImageOnScreenConfig != null
                    ? $"Si image \"{System.IO.Path.GetFileName(ifAction.ImageOnScreenConfig.ImagePath)}\" visible"
                    : "Si Image à l'écran",
                ConditionType.TextOnScreen => ifAction.TextOnScreenConfig != null
                    ? $"Si texte \"{ifAction.TextOnScreenConfig.Text}\" visible"
                    : "Si Texte à l'écran",
                _ => "Si"
            };
        }

        private string GetConditionText(ConditionItem condition)
        {
            if (condition == null)
                return "Si (condition vide)";

            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition ? "Si (Vrai)" : "Si (Faux)",
                ConditionType.ActiveApplication => condition.ActiveApplicationConfig != null && condition.ActiveApplicationConfig.ProcessNames != null && condition.ActiveApplicationConfig.ProcessNames.Count > 0
                    ? $"Si {string.Join(" ou ", condition.ActiveApplicationConfig.ProcessNames)} est actif"
                    : "Si Application active",
                ConditionType.KeyboardKey => condition.KeyboardKeyConfig != null && condition.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Si {GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode)} est pressée"
                    : "Si Touche clavier",
                ConditionType.ProcessRunning => condition.ProcessRunningConfig != null && condition.ProcessRunningConfig.ProcessNames != null && condition.ProcessRunningConfig.ProcessNames.Count > 0
                    ? $"Si {string.Join(" ou ", condition.ProcessRunningConfig.ProcessNames)} est ouvert"
                    : "Si Processus ouvert",
                ConditionType.PixelColor => condition.PixelColorConfig != null
                    ? $"Si pixel ({condition.PixelColorConfig.X},{condition.PixelColorConfig.Y}) = {condition.PixelColorConfig.ExpectedColor}"
                    : "Si Pixel couleur",
                ConditionType.MousePosition => condition.MousePositionConfig != null
                    ? $"Si souris dans zone ({condition.MousePositionConfig.X1},{condition.MousePositionConfig.Y1})-({condition.MousePositionConfig.X2},{condition.MousePositionConfig.Y2})"
                    : "Si Position souris",
                ConditionType.TimeDate => condition.TimeDateConfig != null
                    ? $"Si {condition.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(condition.TimeDateConfig.Operator)} {condition.TimeDateConfig.Value}"
                    : "Si Temps/Date",
                ConditionType.ImageOnScreen => condition.ImageOnScreenConfig != null && !string.IsNullOrEmpty(condition.ImageOnScreenConfig.ImagePath)
                    ? $"Si image \"{System.IO.Path.GetFileName(condition.ImageOnScreenConfig.ImagePath)}\" visible"
                    : "Si Image à l'écran",
                ConditionType.TextOnScreen => condition.TextOnScreenConfig != null && !string.IsNullOrEmpty(condition.TextOnScreenConfig.Text)
                    ? $"Si texte \"{(condition.TextOnScreenConfig.Text.Length > 30 ? condition.TextOnScreenConfig.Text.Substring(0, 30) + "..." : condition.TextOnScreenConfig.Text)}\" visible"
                    : "Si Texte à l'écran",
                _ => "Si"
            };
        }

        private string GetTimeOperatorSymbol(TimeComparisonOperator op)
        {
            return op switch
            {
                TimeComparisonOperator.Equals => "=",
                TimeComparisonOperator.GreaterThan => ">",
                TimeComparisonOperator.LessThan => "<",
                TimeComparisonOperator.GreaterThanOrEqual => ">=",
                TimeComparisonOperator.LessThanOrEqual => "<=",
                _ => "="
            };
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0) return "?";
            
            // Touches spéciales
            switch (virtualKeyCode)
            {
                case 0x5B: return "Win";
                case 0x5C: return "Win (droit)";
                case 0x5D: return "Menu";
                case 0x1B: return "Échap";
                case 0x0D: return "Entrée";
                case 0x08: return "Retour";
                case 0x09: return "Tab";
                case 0x20: return "Espace";
                case 0x2E: return "Suppr";
                case 0x2D: return "Insert";
                case 0x24: return "Début";
                case 0x23: return "Fin";
                case 0x21: return "Page ↑";
                case 0x22: return "Page ↓";
                case 0x25: return "←";
                case 0x26: return "↑";
                case 0x27: return "→";
                case 0x28: return "↓";
                case 0x70: return "F1";
                case 0x71: return "F2";
                case 0x72: return "F3";
                case 0x73: return "F4";
                case 0x74: return "F5";
                case 0x75: return "F6";
                case 0x76: return "F7";
                case 0x77: return "F8";
                case 0x78: return "F9";
                case 0x79: return "F10";
                case 0x7A: return "F11";
                case 0x7B: return "F12";
            }
            
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

        private void AddText_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new TextAction
            {
                Text = "",
                TypingSpeed = 50,
                UseNaturalTyping = false
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

        private Panel CreateKeyboardActionControls(KeyboardAction ka, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action (Press, Down, Up)
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            actionTypeComboBox.Items.Add("Presser");
            actionTypeComboBox.Items.Add("Maintenir");
            actionTypeComboBox.Items.Add("Relâcher");
            
            // Mapper l'ActionType actuel vers l'index du ComboBox
            actionTypeComboBox.SelectedIndex = ka.ActionType switch
            {
                KeyboardActionType.Press => 0,
                KeyboardActionType.Down => 1,
                KeyboardActionType.Up => 2,
                _ => 0
            };
            editPanel.Children.Add(actionTypeComboBox);

            // CheckBoxes pour les modificateurs
            var ctrlCheckBox = new CheckBox
            {
                Content = "Ctrl",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Control)
            };
            ctrlCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Control;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            ctrlCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Control;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(ctrlCheckBox);

            var altCheckBox = new CheckBox
            {
                Content = "Alt",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Alt)
            };
            altCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Alt;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            altCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Alt;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(altCheckBox);

            var shiftCheckBox = new CheckBox
            {
                Content = "Shift",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Shift)
            };
            shiftCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Shift;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            shiftCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Shift;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(shiftCheckBox);

            var winCheckBox = new CheckBox
            {
                Content = "Win",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 8, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Windows)
            };
            winCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Windows;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            winCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Windows;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(winCheckBox);

            // TextBox pour capturer la touche principale
            var keyTextBox = new TextBox
            {
                Text = ka.VirtualKeyCode == 0 ? "Appuyez sur une touche..." : GetKeyName(ka.VirtualKeyCode),
                MinWidth = 150,
                MaxWidth = 200,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromRgb(255, 255, 200)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(255, 165, 0)),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = Cursors.IBeam,
                ToolTip = "Cliquez puis appuyez sur une touche pour la capturer"
            };
            
            bool keyCaptured = false;
            KeyboardHook? tempKeyHook = null;
            
            keyTextBox.GotFocus += (s, e) =>
            {
                if (!keyCaptured)
                {
                    keyTextBox.Text = "Appuyez sur une touche...";
                    keyTextBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 200));
                    tempKeyHook = new KeyboardHook();
                    tempKeyHook.KeyDown += (sender, args) =>
                    {
                        SaveState();
                        ka.VirtualKeyCode = (ushort)args.VirtualKeyCode;
                        keyTextBox.Text = GetKeyName(ka.VirtualKeyCode);
                        keyTextBox.Background = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                        keyCaptured = true;
                        tempKeyHook?.Uninstall();
                        tempKeyHook = null;
                        if (_currentMacro != null)
                        {
                            _currentMacro.ModifiedAt = DateTime.Now;
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                        RefreshBlocks();
                    };
                    tempKeyHook.Install();
                }
            };
            
            keyTextBox.LostFocus += (s, e) =>
            {
                tempKeyHook?.Uninstall();
                tempKeyHook = null;
                if (keyCaptured)
                {
                    keyCaptured = false;
                }
            };
            
            keyTextBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                }
            };
            
            editPanel.Children.Add(keyTextBox);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    ka.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => KeyboardActionType.Press,
                        1 => KeyboardActionType.Down,
                        2 => KeyboardActionType.Up,
                        _ => KeyboardActionType.Press
                    };
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            return editPanel;
        }

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

        private Panel CreateDelayActionControls(DelayAction da, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // Label "Délai:"
            var delayLabel = new TextBlock
            {
                Text = "Délai:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            editPanel.Children.Add(delayLabel);

            // TextBox pour la durée
            var durationTextBox = new TextBox
            {
                Text = da.GetDurationInUnit(da.Unit).ToString("0.##"),
                Width = 80,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            durationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(durationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            durationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(durationTextBox.Text, out double value) || value < 0)
                {
                    durationTextBox.Text = da.GetDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(durationTextBox);

            // TextBox pour la durée minimale (visible seulement si aléatoire)
            var minDurationTextBox = new TextBox
            {
                Text = da.GetMinDurationInUnit(da.Unit).ToString("0.##"),
                Width = 70,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            minDurationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(minDurationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetMinDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            minDurationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(minDurationTextBox.Text, out double value) || value < 0)
                {
                    minDurationTextBox.Text = da.GetMinDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(minDurationTextBox);

            // Label "et" (visible seulement si aléatoire)
            var andLabel = new TextBlock
            {
                Text = "et",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(andLabel);

            // TextBox pour la durée maximale (visible seulement si aléatoire)
            var maxDurationTextBox = new TextBox
            {
                Text = da.GetMaxDurationInUnit(da.Unit).ToString("0.##"),
                Width = 70,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            maxDurationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(maxDurationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetMaxDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            maxDurationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(maxDurationTextBox.Text, out double value) || value < 0)
                {
                    maxDurationTextBox.Text = da.GetMaxDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(maxDurationTextBox);

            // CheckBox pour le mode aléatoire (déclaré après min/max pour pouvoir les référencer)
            var randomCheckBox = new CheckBox
            {
                Content = "Aléatoire",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = da.IsRandom
            };
            randomCheckBox.Checked += (s, e) =>
            {
                SaveState();
                da.IsRandom = true;
                minDurationTextBox.Visibility = Visibility.Visible;
                andLabel.Visibility = Visibility.Visible;
                maxDurationTextBox.Visibility = Visibility.Visible;
                durationTextBox.Visibility = Visibility.Collapsed;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            randomCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                da.IsRandom = false;
                minDurationTextBox.Visibility = Visibility.Collapsed;
                andLabel.Visibility = Visibility.Collapsed;
                maxDurationTextBox.Visibility = Visibility.Collapsed;
                durationTextBox.Visibility = Visibility.Visible;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            // Insérer la CheckBox après le TextBox durée (position 2)
            editPanel.Children.Insert(2, randomCheckBox);

            // ComboBox pour l'unité de temps
            var unitComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0)
            };
            unitComboBox.Items.Add("ms");
            unitComboBox.Items.Add("s");
            unitComboBox.Items.Add("min");
            
            // Mapper l'unité actuelle vers l'index
            unitComboBox.SelectedIndex = da.Unit switch
            {
                TimeUnit.Milliseconds => 0,
                TimeUnit.Seconds => 1,
                TimeUnit.Minutes => 2,
                _ => 0
            };
            
            unitComboBox.SelectionChanged += (s, e) =>
            {
                if (unitComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    // Garder la valeur numérique actuelle (pas de conversion)
                    double currentValue = TryParseDouble(durationTextBox.Text, out double val) ? val : da.GetDurationInUnit(da.Unit);
                    var newUnit = unitComboBox.SelectedIndex switch
                    {
                        0 => TimeUnit.Milliseconds,
                        1 => TimeUnit.Seconds,
                        2 => TimeUnit.Minutes,
                        _ => TimeUnit.Milliseconds
                    };
                    da.Unit = newUnit;
                    // Appliquer la valeur dans la nouvelle unité (sans conversion)
                    da.SetDurationFromUnit(currentValue, newUnit);
                    durationTextBox.Text = currentValue.ToString("0.##");
                    // Mettre à jour aussi min/max si aléatoire
                    if (da.IsRandom)
                    {
                        double minValue = TryParseDouble(minDurationTextBox.Text, out double minVal) ? minVal : da.GetMinDurationInUnit(da.Unit);
                        double maxValue = TryParseDouble(maxDurationTextBox.Text, out double maxVal) ? maxVal : da.GetMaxDurationInUnit(da.Unit);
                        da.SetMinDurationFromUnit(minValue, newUnit);
                        da.SetMaxDurationFromUnit(maxValue, newUnit);
                        minDurationTextBox.Text = minValue.ToString("0.##");
                        maxDurationTextBox.Text = maxValue.ToString("0.##");
                    }
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            editPanel.Children.Add(unitComboBox);

            return editPanel;
        }

        private Panel CreateTextActionControls(TextAction ta, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // Label "Texte:"
            var textLabel = new TextBlock
            {
                Text = "Texte:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            editPanel.Children.Add(textLabel);

            // TextBox pour le texte
            var textTextBox = new TextBox
            {
                Text = ta.Text ?? "",
                MinWidth = 200,
                MaxWidth = 400,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                AcceptsReturn = true,
                TextWrapping = TextWrapping.Wrap,
                MaxHeight = 60
            };
            textTextBox.TextChanged += (s, e) =>
            {
                SaveState();
                ta.Text = textTextBox.Text;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            textTextBox.LostFocus += (s, e) =>
            {
                RefreshBlocks();
            };
            editPanel.Children.Add(textTextBox);

            // CheckBox pour coller tout d'un coup
            var pasteAtOnceCheckBox = new CheckBox
            {
                Content = "Coller",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.PasteAtOnce
            };
            pasteAtOnceCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.PasteAtOnce = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            pasteAtOnceCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.PasteAtOnce = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(pasteAtOnceCheckBox);

            // CheckBox pour la frappe naturelle (masqué si "Coller")
            var naturalTypingCheckBox = new CheckBox
            {
                Content = "Frappe naturelle",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.UseNaturalTyping,
                Visibility = ta.PasteAtOnce ? Visibility.Collapsed : Visibility.Visible
            };
            naturalTypingCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.UseNaturalTyping = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            naturalTypingCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.UseNaturalTyping = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(naturalTypingCheckBox);

            // TextBox pour la vitesse de frappe (visible si pas de frappe naturelle et pas "Coller")
            var speedLabel = new TextBlock
            {
                Text = "Vitesse:",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            editPanel.Children.Add(speedLabel);

            var speedTextBox = new TextBox
            {
                Text = ta.TypingSpeed.ToString(),
                Width = 60,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            speedTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(speedTextBox.Text, out int speed) && speed >= 0)
                {
                    SaveState();
                    ta.TypingSpeed = speed;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            speedTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(speedTextBox.Text, out int speed) || speed < 0)
                {
                    speedTextBox.Text = ta.TypingSpeed.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(speedTextBox);

            var msLabel = new TextBlock
            {
                Text = "ms",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            editPanel.Children.Add(msLabel);

            // TextBox pour délai min (visible si frappe naturelle et pas "Coller")
            var minDelayLabel = new TextBlock
            {
                Text = "Min:",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(minDelayLabel);

            var minDelayTextBox = new TextBox
            {
                Text = ta.MinDelay.ToString(),
                Width = 50,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            minDelayTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(minDelayTextBox.Text, out int minDelay) && minDelay >= 0)
                {
                    SaveState();
                    ta.MinDelay = minDelay;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            minDelayTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(minDelayTextBox.Text, out int minDelay) || minDelay < 0)
                {
                    minDelayTextBox.Text = ta.MinDelay.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(minDelayTextBox);

            // Label "et"
            var andLabel = new TextBlock
            {
                Text = "et",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(andLabel);

            // TextBox pour délai max (visible si frappe naturelle et pas "Coller")
            var maxDelayLabel = new TextBlock
            {
                Text = "Max:",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(maxDelayLabel);

            var maxDelayTextBox = new TextBox
            {
                Text = ta.MaxDelay.ToString(),
                Width = 50,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            maxDelayTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(maxDelayTextBox.Text, out int maxDelay) && maxDelay >= 0)
                {
                    SaveState();
                    ta.MaxDelay = maxDelay;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            maxDelayTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(maxDelayTextBox.Text, out int maxDelay) || maxDelay < 0)
                {
                    maxDelayTextBox.Text = ta.MaxDelay.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(maxDelayTextBox);

            var msLabel2 = new TextBlock
            {
                Text = "ms",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(msLabel2);

            // Mettre à jour la visibilité des contrôles quand le mode frappe naturelle change
            naturalTypingCheckBox.Checked += (s, e) =>
            {
                speedLabel.Visibility = Visibility.Collapsed;
                speedTextBox.Visibility = Visibility.Collapsed;
                msLabel.Visibility = Visibility.Collapsed;
                minDelayLabel.Visibility = Visibility.Visible;
                minDelayTextBox.Visibility = Visibility.Visible;
                andLabel.Visibility = Visibility.Visible;
                maxDelayLabel.Visibility = Visibility.Visible;
                maxDelayTextBox.Visibility = Visibility.Visible;
                msLabel2.Visibility = Visibility.Visible;
            };
            naturalTypingCheckBox.Unchecked += (s, e) =>
            {
                speedLabel.Visibility = Visibility.Visible;
                speedTextBox.Visibility = Visibility.Visible;
                msLabel.Visibility = Visibility.Visible;
                minDelayLabel.Visibility = Visibility.Collapsed;
                minDelayTextBox.Visibility = Visibility.Collapsed;
                andLabel.Visibility = Visibility.Collapsed;
                maxDelayLabel.Visibility = Visibility.Collapsed;
                maxDelayTextBox.Visibility = Visibility.Collapsed;
                msLabel2.Visibility = Visibility.Collapsed;
            };

            return editPanel;
        }

        private void EditDelayAction(DelayAction da, int index, TextBlock titleText)
        {
            // Cette fonction n'est plus utilisée, remplacée par CreateDelayActionControls
            // Conservée pour compatibilité si nécessaire
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;
            var editPanel = CreateDelayActionControls(da, index, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditDelayActionOld(DelayAction da, int index, TextBlock titleText)
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

            var originalMargin = titleText.Margin;
            var editPanel = CreateKeyboardActionControls(ka, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
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

            var originalMargin = titleText.Margin;
            var editPanel = CreateDelayActionControls(da, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditNestedDelayActionOld(int parentIndex, int nestedIndex, TextBlock titleText)
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
        /// Crée les contrôles inline pour une action MouseAction (toujours visibles dans la carte)
        /// </summary>
        private StackPanel CreateMouseActionControls(Core.Inputs.MouseAction ma, int index, Panel parentPanel)
        {
            // Créer un panel horizontal pour tous les contrôles
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // ComboBox pour le type d'action
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 140,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            // Ordre des items dans le ComboBox (sans les "Relâcher")
            actionTypeComboBox.Items.Add("Clic gauche");      // index 0
            actionTypeComboBox.Items.Add("Clic droit");       // index 1
            actionTypeComboBox.Items.Add("Clic milieu");      // index 2
            actionTypeComboBox.Items.Add("Double-clic gauche");  // index 3
            actionTypeComboBox.Items.Add("Double-clic droit");   // index 4
            actionTypeComboBox.Items.Add("Maintenir gauche");  // index 5
            actionTypeComboBox.Items.Add("Maintenir droit");   // index 6
            actionTypeComboBox.Items.Add("Maintenir milieu");  // index 7
            actionTypeComboBox.Items.Add("Déplacer");         // index 8
            actionTypeComboBox.Items.Add("Molette haut");      // index 9
            actionTypeComboBox.Items.Add("Molette bas");       // index 10
            actionTypeComboBox.Items.Add("Molette");          // index 11

            // Mapper l'ActionType actuel vers l'index du ComboBox
            int currentIndex = ma.ActionType switch
            {
                Core.Inputs.MouseActionType.LeftClick => 0,
                Core.Inputs.MouseActionType.RightClick => 1,
                Core.Inputs.MouseActionType.MiddleClick => 2,
                Core.Inputs.MouseActionType.DoubleLeftClick => 3,
                Core.Inputs.MouseActionType.DoubleRightClick => 4,
                Core.Inputs.MouseActionType.LeftDown => 5,
                Core.Inputs.MouseActionType.RightDown => 6,
                Core.Inputs.MouseActionType.MiddleDown => 7,
                Core.Inputs.MouseActionType.Move => 8,
                Core.Inputs.MouseActionType.WheelUp => 9,
                Core.Inputs.MouseActionType.WheelDown => 10,
                Core.Inputs.MouseActionType.Wheel => 11,
                _ => 0 // Par défaut, LeftClick si c'est un type "Relâcher" non supporté
            };
            actionTypeComboBox.SelectedIndex = currentIndex;

            editPanel.Children.Add(actionTypeComboBox);

            // Fonction pour déterminer si les coordonnées doivent être affichées
            bool ShouldShowCoordinates(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.LeftClick ||
                       actionType == Core.Inputs.MouseActionType.RightClick ||
                       actionType == Core.Inputs.MouseActionType.MiddleClick ||
                       actionType == Core.Inputs.MouseActionType.DoubleLeftClick ||
                       actionType == Core.Inputs.MouseActionType.DoubleRightClick ||
                       actionType == Core.Inputs.MouseActionType.LeftDown ||
                       actionType == Core.Inputs.MouseActionType.RightDown ||
                       actionType == Core.Inputs.MouseActionType.MiddleDown ||
                       actionType == Core.Inputs.MouseActionType.Move;
            }

            bool showCoords = ShouldShowCoordinates(ma.ActionType);

            // Label et TextBox pour X (seulement pour clics et Maintenir)
            var xLabel = new TextBlock
            {
                Text = "X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(xLabel);

            var xTextBox = new TextBox
            {
                Text = ma.X >= 0 ? ma.X.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                {
                    SaveState();
                    ma.X = x;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            xTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(xTextBox.Text, out int x))
                {
                    xTextBox.Text = ma.X >= 0 ? ma.X.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(xTextBox);

            // Label et TextBox pour Y (seulement pour clics et Maintenir)
            var yLabel = new TextBlock
            {
                Text = "Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(yLabel);

            var yTextBox = new TextBox
            {
                Text = ma.Y >= 0 ? ma.Y.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                {
                    SaveState();
                    ma.Y = y;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            yTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(yTextBox.Text, out int y))
                {
                    yTextBox.Text = ma.Y >= 0 ? ma.Y.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(yTextBox);

            // Bouton pour sélectionner un point à l'écran (seulement pour clics et Maintenir)
            var selectPointButton = new Button
            {
                Content = "🎯 Sélectionner",
                MinWidth = 110,
                Height = 24,
                FontSize = 12,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner un point à l'écran (comme la pipette)",
                Cursor = Cursors.Hand,
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };

            selectPointButton.Click += (s, e) =>
            {
                SelectPointOnScreen(ma, xTextBox, yTextBox);
            };

            editPanel.Children.Add(selectPointButton);

            // Fonction pour déterminer si le delta doit être affiché (pour toutes les actions de molette)
            bool ShouldShowDelta(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.WheelUp ||
                       actionType == Core.Inputs.MouseActionType.WheelDown ||
                       actionType == Core.Inputs.MouseActionType.Wheel;
            }

            // Label et TextBox pour le delta de la molette (pour Molette haut, bas et Molette)
            bool showDelta = ShouldShowDelta(ma.ActionType);
            var deltaLabel = new TextBlock
            {
                Text = "Delta:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(deltaLabel);

            var deltaTextBox = new TextBox
            {
                Text = ma.Delta.ToString(),
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0),
                Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Delta de la molette (positif = haut, négatif = bas)"
            };
            deltaTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(deltaTextBox.Text, out int delta))
                {
                    SaveState();
                    ma.Delta = delta;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            deltaTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(deltaTextBox.Text, out int delta))
                {
                    deltaTextBox.Text = ma.Delta.ToString();
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(deltaTextBox);

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControls(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move)
            bool showMoveControls = ShouldShowMoveControls(ma.ActionType);
            var relativeMoveCheckBox = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(relativeMoveCheckBox);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBox.Items.Add("Instantané");
            moveSpeedComboBox.Items.Add("Rapide");
            moveSpeedComboBox.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBox.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBox.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveSpeedComboBox);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBox = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBox.Items.Add("Linéaire");
            moveEasingComboBox.Items.Add("Accélération");
            moveEasingComboBox.Items.Add("Décélération");
            moveEasingComboBox.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBox.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBox.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveEasingComboBox);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBox = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(bezierCheckBox);

            // Label et TextBox pour le point de contrôle X (uniquement pour Move avec Bézier)
            var controlXLabel = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlXLabel);

            var controlXTextBox = new TextBox
            {
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBox.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBox.Text, out int controlX))
                {
                    controlXTextBox.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlXTextBox);

            // Label et TextBox pour le point de contrôle Y (uniquement pour Move avec Bézier)
            var controlYLabel = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlYLabel);

            var controlYTextBox = new TextBox
            {
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBox.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBox.Text, out int controlY))
                {
                    controlYTextBox.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlYTextBox);

            // Bouton pour sélectionner le point de contrôle à l'écran (uniquement pour Move avec Bézier)
            var selectControlPointButton = new Button
            {
                Content = "🎯 Ctrl",
                MinWidth = 70,
                Height = 24,
                FontSize = 12,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButton.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBox.Text = ma.ControlX.ToString();
                    controlYTextBox.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(selectControlPointButton);

            // Ajouter les handlers après la déclaration de toutes les variables
            bezierCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                // Mettre à jour la visibilité des contrôles Bézier
                bool showBezierControls = showMoveControls && ma.UseBezierPath;
                controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                // Mettre à jour la visibilité des contrôles Bézier
                bool showBezierControls = showMoveControls && ma.UseBezierPath;
                controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Initialiser le delta avec des valeurs par défaut selon le type d'action
                    if (ma.ActionType == Core.Inputs.MouseActionType.WheelUp)
                    {
                        // Initialiser à 120 seulement si le delta est 0 (nouvelle action ou pas encore configuré)
                        if (ma.Delta == 0)
                        {
                            ma.Delta = 120;
                            deltaTextBox.Text = "120";
                        }
                    }
                    else if (ma.ActionType == Core.Inputs.MouseActionType.WheelDown)
                    {
                        // Initialiser à -120 seulement si le delta est 0 (nouvelle action ou pas encore configuré)
                        if (ma.Delta == 0)
                        {
                            ma.Delta = -120;
                            deltaTextBox.Text = "-120";
                        }
                    }
                    else if (ma.ActionType == Core.Inputs.MouseActionType.Wheel)
                    {
                        // Pour Wheel, garder la valeur actuelle ou 0 par défaut
                        deltaTextBox.Text = ma.Delta.ToString();
                    }
                    
                    // Mettre à jour la visibilité des contrôles selon le type d'action
                    bool showCoords = ShouldShowCoordinates(ma.ActionType);
                    xLabel.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    xTextBox.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    yLabel.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    yTextBox.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    selectPointButton.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showDelta = ShouldShowDelta(ma.ActionType);
                    deltaLabel.Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed;
                    deltaTextBox.Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showMoveControls = ShouldShowMoveControls(ma.ActionType);
                    relativeMoveCheckBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bool showBezierControls = showMoveControls && ma.UseBezierPath;
                    controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            return editPanel;
        }

        /// <summary>
        /// Sélectionne un point à l'écran (capture seulement les coordonnées)
        /// </summary>
        private void SelectPointOnScreen(Core.Inputs.MouseAction ma, TextBox xTextBox, TextBox yTextBox)
        {
            try
            {
                // Utiliser PointSelectorWindow qui capture seulement les coordonnées
                var pointSelector = new PointSelectorWindow
                {
                    Owner = Application.Current.MainWindow
                };
                
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.X = pointSelector.SelectedX;
                    ma.Y = pointSelector.SelectedY;
                    
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                    }
                    
                    // Mettre à jour les TextBox
                    xTextBox.Text = ma.X.ToString();
                    yTextBox.Text = ma.Y.ToString();
                    
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Erreur lors de la sélection de point: {ex.Message}");
                MessageBox.Show(
                    $"Erreur lors de la sélection de point : {ex.Message}",
                    "Erreur",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }
        }

        /// <summary>
        /// Édition inline d'une MouseAction au niveau principal (désactivé, maintenant on utilise CreateMouseActionControls)
        /// </summary>
        private void EditMouseAction(Core.Inputs.MouseAction ma, int index, TextBlock titleText)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[index] is not Core.Inputs.MouseAction mouseAction)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            // Panel horizontal pour ComboBox (type de clic)
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 140,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                SelectedIndex = (int)mouseAction.ActionType
            };

            // Ordre doit correspondre à l'enum MouseActionType (sans les "Relâcher")
            actionTypeComboBox.Items.Add("Clic gauche");      // 0: LeftClick
            actionTypeComboBox.Items.Add("Clic droit");       // 1: RightClick
            actionTypeComboBox.Items.Add("Clic milieu");      // 2: MiddleClick
            actionTypeComboBox.Items.Add("Maintenir gauche");  // 3: LeftDown
            actionTypeComboBox.Items.Add("Maintenir droit");   // 5: RightDown (sauter 4: LeftUp)
            actionTypeComboBox.Items.Add("Maintenir milieu");  // 7: MiddleDown (sauter 6: RightUp)
            actionTypeComboBox.Items.Add("Déplacer");         // 9: Move (sauter 8: MiddleUp)
            actionTypeComboBox.Items.Add("Molette haut");      // 10: WheelUp
            actionTypeComboBox.Items.Add("Molette bas");       // 11: WheelDown
            actionTypeComboBox.Items.Add("Molette");          // 12: Wheel

            editPanel.Children.Add(actionTypeComboBox);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    mouseAction.ActionType = (Core.Inputs.MouseActionType)actionTypeComboBox.SelectedIndex;
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            // Fermeture du ComboBox : revenir au titre
            actionTypeComboBox.DropDownClosed += (s, e) =>
            {
                if (parentPanel.Children.Contains(editPanel))
                {
                    int idx = parentPanel.Children.IndexOf(editPanel);
                    if (idx >= 0)
                    {
                        parentPanel.Children.RemoveAt(idx);
                        parentPanel.Children.Insert(idx, titleText);
                    }
                }
            };

            // Échap : revenir au titre
            actionTypeComboBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    if (parentPanel.Children.Contains(editPanel))
                    {
                        int idx = parentPanel.Children.IndexOf(editPanel);
                        if (idx >= 0)
                        {
                            parentPanel.Children.RemoveAt(idx);
                            parentPanel.Children.Insert(idx, titleText);
                        }
                    }
                }
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
                Margin = new Thickness(0, 0, 8, 0)
            };

            // Ordre des items dans le ComboBox (sans les "Relâcher")
            actionTypeComboBox.Items.Add("Clic gauche");      // index 0
            actionTypeComboBox.Items.Add("Clic droit");       // index 1
            actionTypeComboBox.Items.Add("Clic milieu");      // index 2
            actionTypeComboBox.Items.Add("Double-clic gauche");  // index 3
            actionTypeComboBox.Items.Add("Double-clic droit");   // index 4
            actionTypeComboBox.Items.Add("Maintenir gauche");  // index 5
            actionTypeComboBox.Items.Add("Maintenir droit");   // index 6
            actionTypeComboBox.Items.Add("Maintenir milieu");  // index 7
            actionTypeComboBox.Items.Add("Déplacer");         // index 8
            actionTypeComboBox.Items.Add("Molette haut");      // index 9
            actionTypeComboBox.Items.Add("Molette bas");       // index 10
            actionTypeComboBox.Items.Add("Molette");          // index 11

            // Mapper l'ActionType actuel vers l'index du ComboBox
            int currentIndex = ma.ActionType switch
            {
                Core.Inputs.MouseActionType.LeftClick => 0,
                Core.Inputs.MouseActionType.RightClick => 1,
                Core.Inputs.MouseActionType.MiddleClick => 2,
                Core.Inputs.MouseActionType.DoubleLeftClick => 3,
                Core.Inputs.MouseActionType.DoubleRightClick => 4,
                Core.Inputs.MouseActionType.LeftDown => 5,
                Core.Inputs.MouseActionType.RightDown => 6,
                Core.Inputs.MouseActionType.MiddleDown => 7,
                Core.Inputs.MouseActionType.Move => 8,
                Core.Inputs.MouseActionType.WheelUp => 9,
                Core.Inputs.MouseActionType.WheelDown => 10,
                Core.Inputs.MouseActionType.Wheel => 11,
                _ => 0 // Par défaut, LeftClick si c'est un type "Relâcher" non supporté
            };
            actionTypeComboBox.SelectedIndex = currentIndex;

            editPanel.Children.Add(actionTypeComboBox);

            // Label et TextBox pour X
            var xLabel = new TextBlock
            {
                Text = "X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0)
            };
            editPanel.Children.Add(xLabel);

            var xTextBox = new TextBox
            {
                Text = ma.X >= 0 ? ma.X.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0)
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                {
                    SaveState();
                    ma.X = x;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            xTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(xTextBox.Text, out int x))
                {
                    xTextBox.Text = ma.X >= 0 ? ma.X.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(xTextBox);

            // Label et TextBox pour Y
            var yLabel = new TextBlock
            {
                Text = "Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0)
            };
            editPanel.Children.Add(yLabel);

            var yTextBox = new TextBox
            {
                Text = ma.Y >= 0 ? ma.Y.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                {
                    SaveState();
                    ma.Y = y;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            yTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(yTextBox.Text, out int y))
                {
                    yTextBox.Text = ma.Y >= 0 ? ma.Y.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(yTextBox);

            // Bouton pour sélectionner un point à l'écran (comme la pipette)
            var selectPointButton = new Button
            {
                Content = "🎯 Sélectionner",
                MinWidth = 110,
                Height = 24,
                FontSize = 12,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner un point à l'écran (comme la pipette)",
                Cursor = Cursors.Hand
            };

            selectPointButton.Click += (s, e) =>
            {
                SelectPointOnScreen(ma, xTextBox, yTextBox);
            };

            editPanel.Children.Add(selectPointButton);

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControlsNested(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move)
            bool showMoveControlsNested = ShouldShowMoveControlsNested(ma.ActionType);
            var relativeMoveCheckBoxNested = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBoxNested.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBoxNested.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(relativeMoveCheckBoxNested);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBoxNested = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBoxNested.Items.Add("Instantané");
            moveSpeedComboBoxNested.Items.Add("Rapide");
            moveSpeedComboBoxNested.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBoxNested.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBoxNested.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBoxNested.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBoxNested.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveSpeedComboBoxNested);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBoxNested = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBoxNested.Items.Add("Linéaire");
            moveEasingComboBoxNested.Items.Add("Accélération");
            moveEasingComboBoxNested.Items.Add("Décélération");
            moveEasingComboBoxNested.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBoxNested.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBoxNested.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBoxNested.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBoxNested.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveEasingComboBoxNested);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBoxNested = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            
            // Contrôles pour le point de contrôle Bézier
            bool showBezierControlsNested = showMoveControlsNested && ma.UseBezierPath;
            var controlXLabelNested = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlXLabelNested);

            var controlXTextBoxNested = new TextBox
            {
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBoxNested.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBoxNested.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBoxNested.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBoxNested.Text, out int controlX))
                {
                    controlXTextBoxNested.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlXTextBoxNested);

            var controlYLabelNested = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlYLabelNested);

            var controlYTextBoxNested = new TextBox
            {
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBoxNested.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBoxNested.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBoxNested.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBoxNested.Text, out int controlY))
                {
                    controlYTextBoxNested.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlYTextBoxNested);

            var selectControlPointButtonNested = new Button
            {
                Content = "🎯 Ctrl",
                MinWidth = 70,
                Height = 24,
                FontSize = 12,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButtonNested.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBoxNested.Text = ma.ControlX.ToString();
                    controlYTextBoxNested.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(selectControlPointButtonNested);

            bezierCheckBoxNested.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezier = showMoveControlsNested && ma.UseBezierPath;
                controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBoxNested.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezier = showMoveControlsNested && ma.UseBezierPath;
                controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            editPanel.Children.Add(bezierCheckBoxNested);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Mettre à jour la visibilité des contrôles selon le type d'action
                    bool showMoveControls = ShouldShowMoveControlsNested(ma.ActionType);
                    relativeMoveCheckBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showBezier = showMoveControls && ma.UseBezierPath;
                    controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    
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
            // Initialiser Conditions si vide (compatibilité avec l'ancien format)
            if (ifAction.Conditions == null || ifAction.Conditions.Count == 0)
            {
                ifAction.Conditions = new List<ConditionItem>();
                var conditionItem = new ConditionItem
                {
                    ConditionType = ifAction.ConditionType,
                    Condition = ifAction.Condition,
                    ActiveApplicationConfig = ifAction.ActiveApplicationConfig,
                    KeyboardKeyConfig = ifAction.KeyboardKeyConfig,
                    ProcessRunningConfig = ifAction.ProcessRunningConfig,
                    PixelColorConfig = ifAction.PixelColorConfig,
                    MousePositionConfig = ifAction.MousePositionConfig,
                    TimeDateConfig = ifAction.TimeDateConfig,
                    ImageOnScreenConfig = ifAction.ImageOnScreenConfig,
                    TextOnScreenConfig = ifAction.TextOnScreenConfig
                };
                ifAction.Conditions.Add(conditionItem);
            }

            if (ifAction.Operators == null)
            {
                ifAction.Operators = new List<LogicalOperator>();
            }

            // Créer un panel horizontal pour afficher toutes les conditions
            var mainPanel = new StackPanel
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
            mainPanel.Children.Add(ifLabel);

            // Afficher toutes les conditions existantes
            for (int i = 0; i < ifAction.Conditions.Count; i++)
            {
                var condition = ifAction.Conditions[i];
                var conditionIndex = i; // Capture pour la closure

                // Panel pour une condition
                var conditionPanel = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 8, 0)
                };

                // Label pour afficher le numéro de condition
                var conditionLabel = new TextBlock
                {
                    Text = $"[Condition{i + 1}]",
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 4, 0),
                    Foreground = new SolidColorBrush(Color.FromRgb(248, 239, 234))
                };
                conditionPanel.Children.Add(conditionLabel);

                // ComboBox pour le type de condition
                var conditionTypeComboBox = new ComboBox
                {
                    Width = 150,
                    FontSize = 11,
                    VerticalAlignment = VerticalAlignment.Center
                };
                conditionTypeComboBox.Items.Add("Booléen");
                conditionTypeComboBox.Items.Add("Application active");
                conditionTypeComboBox.Items.Add("Touche clavier");
                conditionTypeComboBox.Items.Add("Processus ouvert");
                conditionTypeComboBox.Items.Add("Pixel couleur");
                conditionTypeComboBox.Items.Add("Position souris");
                conditionTypeComboBox.Items.Add("Temps/Date");
                conditionTypeComboBox.Items.Add("Image à l'écran");
                conditionTypeComboBox.Items.Add("Texte à l'écran");
                conditionTypeComboBox.SelectedIndex = (int)condition.ConditionType;

                conditionTypeComboBox.SelectionChanged += (s, e) =>
                {
                    if (conditionTypeComboBox.SelectedIndex >= 0)
                    {
                        SaveState();
                        condition.ConditionType = (ConditionType)conditionTypeComboBox.SelectedIndex;
                        // Réinitialiser les configurations
                        condition.ActiveApplicationConfig = null;
                        condition.KeyboardKeyConfig = null;
                        condition.ProcessRunningConfig = null;
                        condition.PixelColorConfig = null;
                        condition.MousePositionConfig = null;
                        condition.TimeDateConfig = null;
                        condition.ImageOnScreenConfig = null;
                        condition.TextOnScreenConfig = null;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                };
                conditionPanel.Children.Add(conditionTypeComboBox);

                // Bouton pour configurer cette condition
                var configButton = new Button
                {
                    Content = "⚙",
                    Width = 28,
                    Height = 28,
                    FontSize = 12,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(4, 0, 0, 0),
                    Cursor = Cursors.Hand,
                    ToolTip = "Configurer cette condition"
                };
                configButton.Click += (s, e) =>
                {
                    // Créer un IfAction temporaire avec seulement cette condition pour le dialogue
                    var tempIfAction = new IfAction
                    {
                        Conditions = new List<ConditionItem> { condition },
                        Operators = new List<LogicalOperator>()
                    };
                    var dialog = new ConditionConfigDialog(tempIfAction);
                    dialog.Owner = Window.GetWindow(this);
                    if (dialog.ShowDialog() == true && dialog.Result != null && dialog.Result.Conditions.Count > 0)
                    {
                        SaveState();
                        // Copier la configuration de la condition
                        var resultCondition = dialog.Result.Conditions[0];
                        condition.ConditionType = resultCondition.ConditionType;
                        condition.Condition = resultCondition.Condition;
                        condition.ActiveApplicationConfig = resultCondition.ActiveApplicationConfig;
                        condition.KeyboardKeyConfig = resultCondition.KeyboardKeyConfig;
                        condition.ProcessRunningConfig = resultCondition.ProcessRunningConfig;
                        condition.PixelColorConfig = resultCondition.PixelColorConfig;
                        condition.MousePositionConfig = resultCondition.MousePositionConfig;
                        condition.TimeDateConfig = resultCondition.TimeDateConfig;
                        condition.ImageOnScreenConfig = resultCondition.ImageOnScreenConfig;
                        condition.TextOnScreenConfig = resultCondition.TextOnScreenConfig;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                };
                conditionPanel.Children.Add(configButton);

                // Bouton pour supprimer cette condition (toujours visible, mais désactivé si seule condition)
                var removeButton = new Button
                {
                    Content = "✕",
                    Width = 24,
                    Height = 24,
                    FontSize = 10,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(4, 0, 0, 0),
                    Cursor = Cursors.Hand,
                    ToolTip = "Supprimer cette condition",
                    IsEnabled = ifAction.Conditions.Count > 1
                };
                removeButton.Click += (s, e) =>
                {
                    if (ifAction.Conditions.Count <= 1)
                        return; // Ne pas supprimer la dernière condition
                    
                    SaveState();
                    if (conditionIndex >= 0 && conditionIndex < ifAction.Conditions.Count)
                    {
                        ifAction.Conditions.RemoveAt(conditionIndex);
                        
                        // Supprimer l'opérateur correspondant
                        if (ifAction.Operators.Count > 0)
                        {
                            if (conditionIndex == 0)
                            {
                                ifAction.Operators.RemoveAt(0);
                            }
                            else if (conditionIndex >= ifAction.Operators.Count)
                            {
                                ifAction.Operators.RemoveAt(ifAction.Operators.Count - 1);
                            }
                            else
                            {
                                ifAction.Operators.RemoveAt(conditionIndex);
                            }
                        }
                    }
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                };
                conditionPanel.Children.Add(removeButton);

                mainPanel.Children.Add(conditionPanel);

                // Opérateur logique (sauf pour la dernière condition)
                if (i < ifAction.Conditions.Count - 1)
                {
                    var operatorComboBox = new ComboBox
                    {
                        Width = 70,
                        FontSize = 12,
                        FontWeight = FontWeights.SemiBold,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(8, 0, 8, 0)
                    };
                    operatorComboBox.Items.Add("ET");
                    operatorComboBox.Items.Add("OU");

                    // Initialiser la valeur
                    if (i < ifAction.Operators.Count)
                    {
                        operatorComboBox.SelectedIndex = ifAction.Operators[i] == LogicalOperator.AND ? 0 : 1;
                    }
                    else
                    {
                        operatorComboBox.SelectedIndex = 0; // AND par défaut
                        if (ifAction.Operators.Count <= i)
                        {
                            while (ifAction.Operators.Count <= i)
                            {
                                ifAction.Operators.Add(LogicalOperator.AND);
                            }
                        }
                    }

                    var operatorIndex = i; // Capture pour la closure
                    operatorComboBox.SelectionChanged += (s, e) =>
                    {
                        if (operatorComboBox.SelectedIndex >= 0)
                        {
                            SaveState();
                            if (operatorIndex < ifAction.Operators.Count)
                            {
                                ifAction.Operators[operatorIndex] = operatorComboBox.SelectedIndex == 0 
                                    ? LogicalOperator.AND 
                                    : LogicalOperator.OR;
                            }
                            else
                            {
                                while (ifAction.Operators.Count <= operatorIndex)
                                {
                                    ifAction.Operators.Add(LogicalOperator.AND);
                                }
                                ifAction.Operators[operatorIndex] = operatorComboBox.SelectedIndex == 0 
                                    ? LogicalOperator.AND 
                                    : LogicalOperator.OR;
                            }
                            _currentMacro!.ModifiedAt = DateTime.Now;
                            RefreshBlocks();
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                    };
                    mainPanel.Children.Add(operatorComboBox);
                }
            }

            // Bouton pour ajouter une nouvelle condition
            var addButton = new Button
            {
                Content = "Ajouter condition",
                MinWidth = 120,
                Height = 28,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                Cursor = Cursors.Hand,
                ToolTip = "Ajouter une nouvelle condition",
                Padding = new Thickness(8, 0, 8, 0)
            };
            addButton.Click += (s, e) =>
            {
                SaveState();
                var newCondition = new ConditionItem
                {
                    ConditionType = ConditionType.Boolean,
                    Condition = true
                };
                ifAction.Conditions.Add(newCondition);
                
                // Ajouter un opérateur si nécessaire
                if (ifAction.Conditions.Count > 1 && ifAction.Operators.Count < ifAction.Conditions.Count - 1)
                {
                    ifAction.Operators.Add(LogicalOperator.AND);
                }
                
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };
            mainPanel.Children.Add(addButton);

            // Bouton "Configurer..." pour ouvrir le dialogue complet
            var fullConfigButton = new Button
            {
                Content = "Configurer...",
                Width = 100,
                Height = 28,
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                Cursor = Cursors.Hand,
                ToolTip = "Ouvrir le dialogue de configuration complet"
            };
            fullConfigButton.Click += (s, e) =>
            {
                var dialog = new ConditionConfigDialog(ifAction);
                dialog.Owner = Window.GetWindow(this);
                if (dialog.ShowDialog() == true && dialog.Result != null)
                {
                    SaveState();
                    var result = dialog.Result;
                    ifAction.Conditions = result.Conditions != null ? new List<ConditionItem>(result.Conditions) : new List<ConditionItem>();
                    ifAction.Operators = result.Operators != null ? new List<LogicalOperator>(result.Operators) : new List<LogicalOperator>();
                    
                    // Copier aussi les anciennes propriétés pour compatibilité
                    ifAction.ConditionType = result.ConditionType;
                    ifAction.Condition = result.Condition;
                    ifAction.ActiveApplicationConfig = result.ActiveApplicationConfig;
                    ifAction.KeyboardKeyConfig = result.KeyboardKeyConfig;
                    ifAction.ProcessRunningConfig = result.ProcessRunningConfig;
                    ifAction.PixelColorConfig = result.PixelColorConfig;
                    ifAction.MousePositionConfig = result.MousePositionConfig;
                    ifAction.TimeDateConfig = result.TimeDateConfig;
                    ifAction.ImageOnScreenConfig = result.ImageOnScreenConfig;
                    ifAction.TextOnScreenConfig = result.TextOnScreenConfig;
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            mainPanel.Children.Add(fullConfigButton);

            return mainPanel;
        }

        /// <summary>
        /// Initialise la configuration d'une condition selon son type
        /// </summary>
        private void InitializeConditionConfig(IfAction ifAction)
        {
            switch (ifAction.ConditionType)
            {
                case ConditionType.Boolean:
                    // Déjà initialisé
                    break;
                case ConditionType.ActiveApplication:
                    ifAction.ActiveApplicationConfig ??= new ActiveApplicationCondition { ProcessName = "" };
                    break;
                case ConditionType.KeyboardKey:
                    ifAction.KeyboardKeyConfig ??= new KeyboardKeyCondition { VirtualKeyCode = 0 };
                    break;
                case ConditionType.ProcessRunning:
                    ifAction.ProcessRunningConfig ??= new ProcessRunningCondition { ProcessName = "" };
                    break;
                case ConditionType.PixelColor:
                    ifAction.PixelColorConfig ??= new PixelColorCondition { X = 0, Y = 0, ExpectedColor = "#000000" };
                    break;
                case ConditionType.MousePosition:
                    ifAction.MousePositionConfig ??= new MousePositionCondition { X1 = 0, Y1 = 0, X2 = 100, Y2 = 100 };
                    break;
                case ConditionType.TimeDate:
                    ifAction.TimeDateConfig ??= new TimeDateCondition { ComparisonType = "Hour", Operator = TimeComparisonOperator.Equals, Value = 0 };
                    break;
                case ConditionType.ImageOnScreen:
                    ifAction.ImageOnScreenConfig ??= new ImageOnScreenCondition { ImagePath = "", Sensitivity = 80 };
                    break;
                case ConditionType.TextOnScreen:
                    ifAction.TextOnScreenConfig ??= new TextOnScreenCondition { Text = "" };
                    break;
            }
        }

        /// <summary>
        /// Crée le panel de configuration selon le type de condition
        /// </summary>
        private Panel CreateConditionConfigPanel(IfAction ifAction, int index)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Ajouter un bouton "Configurer..." pour toutes les conditions (même les simples)
            var configButton = new Button
            {
                Content = "Configurer...",
                Width = 100,
                Height = 28,
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                Cursor = Cursors.Hand
            };
            configButton.Click += (s, e) =>
            {
                var dialog = new ConditionConfigDialog(ifAction);
                dialog.Owner = Window.GetWindow(this);
                if (dialog.ShowDialog() == true && dialog.Result != null)
                {
                    SaveState();
                    // Copier la configuration depuis le dialogue
                    var result = dialog.Result;
                    ifAction.Conditions = result.Conditions != null ? new List<ConditionItem>(result.Conditions) : new List<ConditionItem>();
                    ifAction.Operators = result.Operators != null ? new List<LogicalOperator>(result.Operators) : new List<LogicalOperator>();
                    
                    // Copier aussi les anciennes propriétés pour compatibilité
                    ifAction.ConditionType = result.ConditionType;
                    ifAction.Condition = result.Condition;
                    ifAction.ActiveApplicationConfig = result.ActiveApplicationConfig;
                    ifAction.KeyboardKeyConfig = result.KeyboardKeyConfig;
                    ifAction.ProcessRunningConfig = result.ProcessRunningConfig;
                    ifAction.PixelColorConfig = result.PixelColorConfig;
                    ifAction.MousePositionConfig = result.MousePositionConfig;
                    ifAction.TimeDateConfig = result.TimeDateConfig;
                    ifAction.ImageOnScreenConfig = result.ImageOnScreenConfig;
                    ifAction.TextOnScreenConfig = result.TextOnScreenConfig;
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            panel.Children.Add(configButton);

            // Afficher un aperçu rapide selon le type
            var previewText = GetConditionPreview(ifAction);
            if (!string.IsNullOrEmpty(previewText))
            {
                var previewLabel = new TextBlock
                {
                    Text = previewText,
                    FontSize = 11,
                    FontStyle = FontStyles.Italic,
                    Foreground = new SolidColorBrush(Color.FromRgb(200, 200, 200)),
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(8, 0, 0, 0),
                    MaxWidth = 300,
                    TextTrimming = TextTrimming.CharacterEllipsis
                };
                panel.Children.Add(previewLabel);
            }

            return panel;
        }

        /// <summary>
        /// Obtient un aperçu textuel de la condition
        /// </summary>
        private string GetConditionPreview(IfAction ifAction)
        {
            // Si plusieurs conditions, afficher toutes les conditions avec leurs opérateurs
            if (ifAction.Conditions != null && ifAction.Conditions.Count > 1)
            {
                var previews = new List<string>();
                for (int i = 0; i < ifAction.Conditions.Count; i++)
                {
                    var condition = ifAction.Conditions[i];
                    var preview = GetConditionPreviewText(condition);
                    if (!string.IsNullOrEmpty(preview))
                        previews.Add(preview);
                    
                    // Ajouter l'opérateur entre les conditions
                    if (i < ifAction.Conditions.Count - 1 && i < ifAction.Operators.Count)
                    {
                        var op = ifAction.Operators[i] == LogicalOperator.AND ? "ET" : "OU";
                        previews.Add(op);
                    }
                }
                return string.Join(" ", previews);
            }
            
            // Une seule condition ou compatibilité avec l'ancien format
            if (ifAction.Conditions != null && ifAction.Conditions.Count == 1)
            {
                return GetConditionPreviewText(ifAction.Conditions[0]);
            }
            
            // Ancien format (compatibilité)
            return ifAction.ConditionType switch
            {
                ConditionType.Boolean => ifAction.Condition ? "Vrai" : "Faux",
                ConditionType.ActiveApplication => ifAction.ActiveApplicationConfig != null && !string.IsNullOrEmpty(ifAction.ActiveApplicationConfig.ProcessName)
                    ? $"App: {ifAction.ActiveApplicationConfig.ProcessName}"
                    : "App: (non configuré)",
                ConditionType.KeyboardKey => ifAction.KeyboardKeyConfig != null && ifAction.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Touche: {GetKeyName(ifAction.KeyboardKeyConfig.VirtualKeyCode)}"
                    : "Touche: (non configuré)",
                ConditionType.ProcessRunning => ifAction.ProcessRunningConfig != null && !string.IsNullOrEmpty(ifAction.ProcessRunningConfig.ProcessName)
                    ? $"Processus: {ifAction.ProcessRunningConfig.ProcessName}"
                    : "Processus: (non configuré)",
                ConditionType.PixelColor => ifAction.PixelColorConfig != null
                    ? $"Pixel ({ifAction.PixelColorConfig.X},{ifAction.PixelColorConfig.Y}) = {ifAction.PixelColorConfig.ExpectedColor}"
                    : "Pixel: (non configuré)",
                ConditionType.MousePosition => ifAction.MousePositionConfig != null
                    ? $"Zone ({ifAction.MousePositionConfig.X1},{ifAction.MousePositionConfig.Y1})-({ifAction.MousePositionConfig.X2},{ifAction.MousePositionConfig.Y2})"
                    : "Zone: (non configuré)",
                ConditionType.TimeDate => ifAction.TimeDateConfig != null
                    ? $"{ifAction.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(ifAction.TimeDateConfig.Operator)} {ifAction.TimeDateConfig.Value}"
                    : "Temps: (non configuré)",
                ConditionType.ImageOnScreen => ifAction.ImageOnScreenConfig != null && !string.IsNullOrEmpty(ifAction.ImageOnScreenConfig.ImagePath)
                    ? $"Image: {System.IO.Path.GetFileName(ifAction.ImageOnScreenConfig.ImagePath)}"
                    : "Image: (non configuré)",
                ConditionType.TextOnScreen => ifAction.TextOnScreenConfig != null && !string.IsNullOrEmpty(ifAction.TextOnScreenConfig.Text)
                    ? $"Texte: \"{ifAction.TextOnScreenConfig.Text.Substring(0, Math.Min(20, ifAction.TextOnScreenConfig.Text.Length))}\"..."
                    : "Texte: (non configuré)",
                _ => ""
            };
        }

        private string GetConditionPreviewText(ConditionItem condition)
        {
            if (condition == null)
                return "";

            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition ? "Vrai" : "Faux",
                ConditionType.ActiveApplication => condition.ActiveApplicationConfig != null && condition.ActiveApplicationConfig.ProcessNames != null && condition.ActiveApplicationConfig.ProcessNames.Count > 0
                    ? $"App: {string.Join(", ", condition.ActiveApplicationConfig.ProcessNames.Take(2))}"
                    : "App: (non configuré)",
                ConditionType.KeyboardKey => condition.KeyboardKeyConfig != null && condition.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Touche: {GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode)}"
                    : "Touche: (non configuré)",
                ConditionType.ProcessRunning => condition.ProcessRunningConfig != null && condition.ProcessRunningConfig.ProcessNames != null && condition.ProcessRunningConfig.ProcessNames.Count > 0
                    ? $"Processus: {string.Join(", ", condition.ProcessRunningConfig.ProcessNames.Take(2))}"
                    : "Processus: (non configuré)",
                ConditionType.PixelColor => condition.PixelColorConfig != null
                    ? $"Pixel ({condition.PixelColorConfig.X},{condition.PixelColorConfig.Y}) = {condition.PixelColorConfig.ExpectedColor}"
                    : "Pixel: (non configuré)",
                ConditionType.MousePosition => condition.MousePositionConfig != null
                    ? $"Zone ({condition.MousePositionConfig.X1},{condition.MousePositionConfig.Y1})-({condition.MousePositionConfig.X2},{condition.MousePositionConfig.Y2})"
                    : "Zone: (non configuré)",
                ConditionType.TimeDate => condition.TimeDateConfig != null
                    ? $"{condition.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(condition.TimeDateConfig.Operator)} {condition.TimeDateConfig.Value}"
                    : "Temps: (non configuré)",
                ConditionType.ImageOnScreen => condition.ImageOnScreenConfig != null && !string.IsNullOrEmpty(condition.ImageOnScreenConfig.ImagePath)
                    ? $"Image: {System.IO.Path.GetFileName(condition.ImageOnScreenConfig.ImagePath)}"
                    : "Image: (non configuré)",
                ConditionType.TextOnScreen => condition.TextOnScreenConfig != null && !string.IsNullOrEmpty(condition.TextOnScreenConfig.Text)
                    ? $"Texte: \"{condition.TextOnScreenConfig.Text.Substring(0, Math.Min(20, condition.TextOnScreenConfig.Text.Length))}\"..."
                    : "Texte: (non configuré)",
                _ => ""
            };
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
            // Si c'est un IfAction imbriqué, créer un conteneur récursif au lieu d'une simple carte
            if (action is IfAction nestedIfAction)
            {
                return CreateNestedIfActionContainer(nestedIfAction, parentIndex, nestedIndex);
            }

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
                else if (action is TextAction)
                {
                    // Pour TextAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var textControlsPanel = CreateTextActionControls((TextAction)action, parentIndex, textPanel);
                        textPanel.Children.Insert(0, textControlsPanel);
                    }
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

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 0);
            container.Children.Add(card);

            // Boutons flèches pour les actions imbriquées
            var moveButtonsContainer = CreateNestedMoveButtonsContainer(action, parentIndex, nestedIndex);
            Grid.SetColumn(moveButtonsContainer, 1);
            container.Children.Add(moveButtonsContainer);

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
            panel.Children.Add(createAddButton("📝", "Texte", new TextAction()));
            panel.Children.Add(createAddButton("⏱", "Délai", new DelayAction()));
            panel.Children.Add(createAddButton("🔀", "Si", new IfAction()));

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
                "Text" => new TextAction
                {
                    Text = "",
                    TypingSpeed = 50,
                    UseNaturalTyping = false
                },
                "Delay" => new DelayAction
                {
                    Duration = 100
                },
                "Condition" => new IfAction
                {
                    Condition = true,
                    ThenActions = new List<IInputAction>(),
                    ElseActions = new List<IInputAction>()
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
            // Si c'est un RepeatAction imbriqué, créer un conteneur récursif au lieu d'une simple carte
            if (action is RepeatAction nestedRepeatAction)
            {
                return CreateNestedRepeatActionContainer(nestedRepeatAction, parentIndex, nestedIndex, isThen);
            }

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
                else if (action is TextAction)
                {
                    // Pour TextAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var textControlsPanel = CreateTextActionControls((TextAction)action, parentIndex, textPanel);
                        textPanel.Children.Insert(0, textControlsPanel);
                    }
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

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 0);
            container.Children.Add(card);

            var moveButtonsContainer = CreateNestedIfMoveButtonsContainer(action, parentIndex, nestedIndex, isThen);
            Grid.SetColumn(moveButtonsContainer, 1);
            container.Children.Add(moveButtonsContainer);

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
            panel.Children.Add(createAddButton("📝", "Texte", new TextAction()));
            panel.Children.Add(createAddButton("⏱", "Délai", new DelayAction()));
            panel.Children.Add(createAddButton("🔁", "Répéter", new RepeatAction()));

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

            // Bouton monter (▲)
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
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
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
                    MoveNestedIfActionUp(parentIndex, nestedIndex, isThen);
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
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
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
                    MoveNestedIfActionDown(parentIndex, nestedIndex, isThen);
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
                "Text" => new TextAction { Text = "", TypingSpeed = 50, UseNaturalTyping = false },
                "Delay" => new DelayAction { Duration = 100 },
                "Repeat" => new RepeatAction
                {
                    RepeatCount = 1,
                    DelayBetweenRepeats = 0,
                    RepeatMode = RepeatMode.Once,
                    Actions = new List<IInputAction>()
                },
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

            var originalMargin = titleText.Margin;
            var editPanel = CreateKeyboardActionControls(ka, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
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
            var editPanel = CreateDelayActionControls(da, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditNestedIfDelayActionOld(int parentIndex, int nestedIndex, bool isThen, TextBlock titleText)
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
                MinWidth = 140,
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Ordre des items dans le ComboBox (sans les "Relâcher")
            clickTypeComboBox.Items.Add("Clic gauche");      // index 0
            clickTypeComboBox.Items.Add("Clic droit");       // index 1
            clickTypeComboBox.Items.Add("Clic milieu");      // index 2
            clickTypeComboBox.Items.Add("Double-clic gauche");  // index 3
            clickTypeComboBox.Items.Add("Double-clic droit");   // index 4
            clickTypeComboBox.Items.Add("Maintenir gauche");  // index 5
            clickTypeComboBox.Items.Add("Maintenir droit");   // index 6
            clickTypeComboBox.Items.Add("Maintenir milieu");  // index 7
            clickTypeComboBox.Items.Add("Déplacer");         // index 8
            clickTypeComboBox.Items.Add("Molette haut");      // index 9
            clickTypeComboBox.Items.Add("Molette bas");       // index 10
            clickTypeComboBox.Items.Add("Molette");          // index 11

            // Mapper l'ActionType actuel vers l'index du ComboBox
            int currentIndex = ma.ActionType switch
            {
                Core.Inputs.MouseActionType.LeftClick => 0,
                Core.Inputs.MouseActionType.RightClick => 1,
                Core.Inputs.MouseActionType.MiddleClick => 2,
                Core.Inputs.MouseActionType.DoubleLeftClick => 3,
                Core.Inputs.MouseActionType.DoubleRightClick => 4,
                Core.Inputs.MouseActionType.LeftDown => 5,
                Core.Inputs.MouseActionType.RightDown => 6,
                Core.Inputs.MouseActionType.MiddleDown => 7,
                Core.Inputs.MouseActionType.Move => 8,
                Core.Inputs.MouseActionType.WheelUp => 9,
                Core.Inputs.MouseActionType.WheelDown => 10,
                Core.Inputs.MouseActionType.Wheel => 11,
                _ => 0 // Par défaut, LeftClick si c'est un type "Relâcher" non supporté
            };
            clickTypeComboBox.SelectedIndex = currentIndex;

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControlsIf(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move) - déclaré avant SelectionChanged
            bool showMoveControlsIf = ShouldShowMoveControlsIf(ma.ActionType);
            var relativeMoveCheckBoxIf = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBoxIf.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBoxIf.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(relativeMoveCheckBoxIf);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBoxIf = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBoxIf.Items.Add("Instantané");
            moveSpeedComboBoxIf.Items.Add("Rapide");
            moveSpeedComboBoxIf.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBoxIf.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBoxIf.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBoxIf.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBoxIf.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveSpeedComboBoxIf);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBoxIf = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBoxIf.Items.Add("Linéaire");
            moveEasingComboBoxIf.Items.Add("Accélération");
            moveEasingComboBoxIf.Items.Add("Décélération");
            moveEasingComboBoxIf.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBoxIf.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBoxIf.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBoxIf.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBoxIf.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveEasingComboBoxIf);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBoxIf = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(bezierCheckBoxIf);

            // Contrôles pour le point de contrôle Bézier
            bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
            var controlXLabelIf = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlXLabelIf);

            var controlXTextBoxIf = new TextBox
            {
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBoxIf.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBoxIf.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBoxIf.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBoxIf.Text, out int controlX))
                {
                    controlXTextBoxIf.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlXTextBoxIf);

            var controlYLabelIf = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlYLabelIf);

            var controlYTextBoxIf = new TextBox
            {
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBoxIf.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBoxIf.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBoxIf.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBoxIf.Text, out int controlY))
                {
                    controlYTextBoxIf.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlYTextBoxIf);

            var selectControlPointButtonIf = new Button
            {
                Content = "🎯 Ctrl",
                MinWidth = 70,
                Height = 24,
                FontSize = 12,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButtonIf.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBoxIf.Text = ma.ControlX.ToString();
                    controlYTextBoxIf.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(selectControlPointButtonIf);

            // Ajouter les handlers après la déclaration de toutes les variables
            bezierCheckBoxIf.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBoxIf.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };

            // Ajouter le SelectionChanged après la déclaration de toutes les variables
            clickTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (clickTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = clickTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Mettre à jour la visibilité des contrôles de déplacement
                    bool showMoveControlsIf = ma.ActionType == Core.Inputs.MouseActionType.Move;
                    relativeMoveCheckBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                    controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    
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
        /// Crée un conteneur récursif pour un IfAction imbriqué dans un RepeatAction
        /// </summary>
        private FrameworkElement CreateNestedIfActionContainer(IfAction ifAction, int repeatActionIndex, int nestedIndex)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Créer une carte simple pour l'IfAction (sans boutons monter/descendre car c'est imbriqué)
            var card = CreateActionCard(ifAction, repeatActionIndex);
            container.Children.Add(card);

            // Section Then
            var thenSection = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20, 4, 0, 4)
            };

            var thenHeader = new TextBlock
            {
                Text = "Then:",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
                Foreground = new SolidColorBrush(Color.FromRgb(34, 139, 34))
            };
            thenSection.Children.Add(thenHeader);

            if (ifAction.ThenActions != null && ifAction.ThenActions.Count > 0)
            {
                var thenContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4),
                    Background = new SolidColorBrush(Color.FromArgb(10, 34, 139, 34))
                };

                for (int i = 0; i < ifAction.ThenActions.Count; i++)
                {
                    var nestedAction = ifAction.ThenActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, repeatActionIndex, nestedIndex, true);
                    thenContainer.Children.Add(nestedCard);
                }
                thenSection.Children.Add(thenContainer);
            }

            var addThenActionsPanel = CreateAddIfActionsPanel(ifAction, repeatActionIndex, true);
            thenSection.Children.Add(addThenActionsPanel);
            container.Children.Add(thenSection);

            // Section Else
            var elseSection = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20, 4, 0, 4)
            };

            var elseHeader = new TextBlock
            {
                Text = "Else:",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
                Foreground = new SolidColorBrush(Color.FromRgb(200, 80, 80))
            };
            elseSection.Children.Add(elseHeader);

            if (ifAction.ElseActions != null && ifAction.ElseActions.Count > 0)
            {
                var elseContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4),
                    Background = new SolidColorBrush(Color.FromArgb(10, 200, 80, 80))
                };

                for (int i = 0; i < ifAction.ElseActions.Count; i++)
                {
                    var nestedAction = ifAction.ElseActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, repeatActionIndex, nestedIndex, false);
                    elseContainer.Children.Add(nestedCard);
                }
                elseSection.Children.Add(elseContainer);
            }

            var addElseActionsPanel = CreateAddIfActionsPanel(ifAction, repeatActionIndex, false);
            elseSection.Children.Add(addElseActionsPanel);
            container.Children.Add(elseSection);

            return container;
        }

        /// <summary>
        /// Crée un conteneur récursif pour un RepeatAction imbriqué dans un IfAction
        /// </summary>
        private FrameworkElement CreateNestedRepeatActionContainer(RepeatAction repeatAction, int ifActionIndex, int nestedIndex, bool isThen)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Créer une carte simple pour le RepeatAction (sans boutons monter/descendre car c'est imbriqué)
            var card = CreateActionCard(repeatAction, ifActionIndex);
            container.Children.Add(card);

            // Créer un conteneur pour les actions imbriquées
            if (repeatAction.Actions != null && repeatAction.Actions.Count > 0)
            {
                var nestedContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(20, 4, 0, 4),
                    Background = new SolidColorBrush(Color.FromArgb(10, 138, 43, 226))
                };

                for (int i = 0; i < repeatAction.Actions.Count; i++)
                {
                    var nestedAction = repeatAction.Actions[i];
                    var nestedCard = CreateNestedActionCard(nestedAction, ifActionIndex, i);
                    nestedContainer.Children.Add(nestedCard);
                }
                container.Children.Add(nestedContainer);
            }

            // Ajouter un panel pour ajouter de nouvelles actions
            var addActionsPanel = CreateAddActionsPanel(repeatAction, ifActionIndex);
            container.Children.Add(addActionsPanel);

            return container;
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

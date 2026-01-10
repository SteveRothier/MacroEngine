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
                var actionContainer = CreateActionCardWithButtons(action, i);
                TimelineStackPanel.Children.Add(actionContainer);
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

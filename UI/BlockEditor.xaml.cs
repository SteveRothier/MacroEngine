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
using System.Windows.Shapes;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;

namespace MacroEngine.UI
{
    /// <summary>
    /// Éditeur de macros en blocs Scratch-like
    /// </summary>
    public partial class BlockEditor : UserControl
    {
        private Macro? _currentMacro;
        private int _draggedIndex = -1;
        private FrameworkElement? _draggedElement;
        private Point _dragStartPoint;
        
        // Popup pour le drag visuel
        private Popup? _dragPopup;
        private Point _dragOffset; // Décalage entre le curseur et le coin du bloc
        
        // Largeur maximale des blocs (réduite)
        private const double BLOCK_MAX_WIDTH = 260;

        // Événement déclenché quand la macro est modifiée
        public event EventHandler? MacroChanged;

        public BlockEditor()
        {
            InitializeComponent();
            DrawGridPattern();
            Loaded += BlockEditor_Loaded;
            SizeChanged += BlockEditor_SizeChanged;
        }

        private void BlockEditor_Loaded(object sender, RoutedEventArgs e)
        {
            DrawGridPattern();
        }

        private void BlockEditor_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            DrawGridPattern();
        }

        /// <summary>
        /// Dessine la grille de fond discrète
        /// </summary>
        private void DrawGridPattern()
        {
            GridCanvas.Children.Clear();
            
            double width = ActualWidth > 0 ? ActualWidth : 600;
            double height = ActualHeight > 0 ? ActualHeight : 500;
            
            double gridSize = 20;
            var gridColor = (Color)Application.Current.Resources["EditorGridColor"];
            var brush = new SolidColorBrush(gridColor);
            brush.Opacity = 0.5;

            // Lignes verticales
            for (double x = gridSize; x < width; x += gridSize)
            {
                var line = new Line
                {
                    X1 = x,
                    Y1 = 0,
                    X2 = x,
                    Y2 = height,
                    Stroke = brush,
                    StrokeThickness = 1
                };
                GridCanvas.Children.Add(line);
            }

            // Lignes horizontales
            for (double y = gridSize; y < height; y += gridSize)
            {
                var line = new Line
                {
                    X1 = 0,
                    Y1 = y,
                    X2 = width,
                    Y2 = y,
                    Stroke = brush,
                    StrokeThickness = 1
                };
                GridCanvas.Children.Add(line);
            }
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
        }

        /// <summary>
        /// Rafraîchit l'affichage des blocs
        /// </summary>
        public void RefreshBlocks()
        {
            BlocksItemsControl.Items.Clear();

            if (_currentMacro == null || _currentMacro.Actions.Count == 0)
            {
                EmptyStatePanel.Visibility = Visibility.Visible;
                return;
            }

            EmptyStatePanel.Visibility = Visibility.Collapsed;

            for (int i = 0; i < _currentMacro.Actions.Count; i++)
            {
                var action = _currentMacro.Actions[i];
                var block = CreateBlockForAction(action, i);
                BlocksItemsControl.Items.Add(block);
            }
        }

        /// <summary>
        /// Crée un bloc visuel pour une action avec effet d'imbrication Scratch-like
        /// L'encoche du haut est à l'intérieur du bloc, le connecteur du bas rentre dans l'encoche du bloc suivant
        /// </summary>
        private FrameworkElement CreateBlockForAction(IInputAction action, int index)
        {
            string styleName;
            string icon;
            SolidColorBrush blockColor;
            SolidColorBrush darkColor;
            
            // Couleur de fond de l'éditeur pour créer l'effet d'encoche
            var bgColor = (SolidColorBrush)FindResource("BackgroundPrimaryBrush");
            
            // Déterminer les couleurs selon le type d'action
            switch (action)
            {
                case KeyboardAction:
                    styleName = "BlockKeyboard";
                    icon = "⌨";
                    blockColor = (SolidColorBrush)FindResource("BlockKeyboardBrush");
                    darkColor = (SolidColorBrush)FindResource("BlockKeyboardDarkBrush");
                    break;
                case Core.Inputs.MouseAction:
                    styleName = "BlockMouse";
                    icon = "🖱";
                    blockColor = (SolidColorBrush)FindResource("BlockMouseBrush");
                    darkColor = (SolidColorBrush)FindResource("BlockMouseDarkBrush");
                    break;
                case DelayAction:
                    styleName = "BlockDelay";
                    icon = "⏱";
                    blockColor = (SolidColorBrush)FindResource("BlockDelayBrush");
                    darkColor = (SolidColorBrush)FindResource("BlockDelayDarkBrush");
                    break;
                default:
                    styleName = "BlockKeyboard";
                    icon = "❓";
                    blockColor = (SolidColorBrush)FindResource("BlockKeyboardBrush");
                    darkColor = (SolidColorBrush)FindResource("BlockKeyboardDarkBrush");
                    break;
            }

            // Hauteur du connecteur/encoche pour l'imbrication
            const double NOTCH_HEIGHT = 8;
            
            // Conteneur principal avec effet d'imbrication
            var container = new Grid();
            container.Tag = index;
            container.MaxWidth = BLOCK_MAX_WIDTH;
            container.HorizontalAlignment = HorizontalAlignment.Left;
            // Marge négative en bas pour que le connecteur chevauche l'encoche du bloc suivant
            container.Margin = new Thickness(0, 0, 0, -NOTCH_HEIGHT);
            // ZIndex pour que le connecteur soit visible au-dessus du bloc suivant
            Panel.SetZIndex(container, 1000 - index);
            
            container.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Bloc principal avec encoche interne
            container.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Connecteur bas

            // Bloc principal avec encoche intégrée
            var blockContainer = new Grid();
            Grid.SetRow(blockContainer, 0);
            
            // Le bloc principal
            var block = new Border();
            block.Style = (Style)FindResource(styleName);
            block.Tag = index;
            block.AllowDrop = true;
            block.Margin = new Thickness(0);
            blockContainer.Children.Add(block);
            
            // Encoche en haut à l'INTÉRIEUR du bloc (trou qui reçoit le connecteur du bloc précédent)
            var topNotch = new Border
            {
                Width = 30,
                Height = NOTCH_HEIGHT,
                Background = bgColor,
                CornerRadius = new CornerRadius(0, 0, 4, 4),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(20, 0, 0, 0)
            };
            blockContainer.Children.Add(topNotch);
            
            container.Children.Add(blockContainer);

            // Événements de drag & drop
            container.MouseLeftButtonDown += Block_MouseLeftButtonDown;
            container.MouseMove += Block_MouseMove;
            container.MouseLeftButtonUp += Block_MouseLeftButtonUp;
            block.Drop += Block_Drop;
            block.DragEnter += Block_DragEnter;
            block.DragLeave += Block_DragLeave;

            // Contenu du bloc
            var grid = new Grid();
            grid.Margin = new Thickness(0, 6, 0, 0); // Décalage pour laisser place à l'encoche
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Icône
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Contenu éditable
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Bouton supprimer

            // Bouton supprimer
            var deleteButton = new Button
            {
                Content = "✕",
                Style = (Style)FindResource("BlockDeleteButton"),
                Tag = index
            };
            deleteButton.Click += DeleteBlock_Click;
            Grid.SetColumn(deleteButton, 2);
            grid.Children.Add(deleteButton);

            // Afficher le bouton au survol
            container.MouseEnter += (s, e) => deleteButton.Visibility = Visibility.Visible;
            container.MouseLeave += (s, e) => deleteButton.Visibility = Visibility.Collapsed;

            // Remplir le contenu selon le type
            switch (action)
            {
                case KeyboardAction ka:
                    CreateKeyboardBlockContent(grid, icon, ka, index);
                    break;
                case Core.Inputs.MouseAction ma:
                    CreateMouseBlockContent(grid, icon, ma, index);
                    break;
                case DelayAction da:
                    CreateDelayBlockContent(grid, icon, da, index);
                    break;
                default:
                    CreateDefaultBlockContent(grid, icon, action.Type.ToString());
                    break;
            }

            block.Child = grid;

            // Connecteur en bas (languette qui SORT du bloc et rentre dans l'encoche du bloc suivant)
            var bottomConnector = new Border
            {
                Width = 30,
                Height = NOTCH_HEIGHT,
                Background = blockColor,
                CornerRadius = new CornerRadius(0, 0, 4, 4),
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(20, 0, 0, 0)
            };
            Grid.SetRow(bottomConnector, 1);
            container.Children.Add(bottomConnector);

            return container;
        }

        private void CreateKeyboardBlockContent(Grid grid, string icon, KeyboardAction ka, int index)
        {
            // Icône
            var iconText = new TextBlock
            {
                Text = icon,
                Style = (Style)FindResource("BlockIcon")
            };
            Grid.SetColumn(iconText, 0);
            grid.Children.Add(iconText);

            // Contenu avec TextBox qui capture directement la touche
            var contentStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            
            var mainStack = new StackPanel { Orientation = Orientation.Horizontal };
            
            var keyTextBox = new TextBox
            {
                Text = GetKeyName(ka.VirtualKeyCode),
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(6, 2, 6, 2),
                FontWeight = FontWeights.Bold,
                FontSize = 13,
                Cursor = Cursors.Hand,
                Tag = index,
                MinWidth = 40,
                TextAlignment = TextAlignment.Center,
                Focusable = true
            };
            // Capture directe de la touche quand on appuie
            keyTextBox.PreviewKeyDown += KeyTextBox_PreviewKeyDown;
            keyTextBox.GotFocus += KeyTextBox_GotFocus;
            keyTextBox.LostFocus += KeyTextBox_LostFocus;
            mainStack.Children.Add(keyTextBox);

            contentStack.Children.Add(mainStack);

            // Type d'action
            var typeText = new TextBlock
            {
                Text = ka.ActionType == KeyboardActionType.Down ? "Appuyer" : 
                       ka.ActionType == KeyboardActionType.Up ? "Relâcher" : "Appuyer+Relâcher",
                Style = (Style)FindResource("BlockTextSecondary")
            };
            contentStack.Children.Add(typeText);

            Grid.SetColumn(contentStack, 1);
            grid.Children.Add(contentStack);
        }

        private void CreateMouseBlockContent(Grid grid, string icon, Core.Inputs.MouseAction ma, int index)
        {
            // Icône
            var iconText = new TextBlock
            {
                Text = icon,
                Style = (Style)FindResource("BlockIcon")
            };
            Grid.SetColumn(iconText, 0);
            grid.Children.Add(iconText);

            // Contenu
            var contentStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            
            var mainText = new TextBlock
            {
                Text = GetMouseActionText(ma),
                Style = (Style)FindResource("BlockText")
            };
            contentStack.Children.Add(mainText);

            if (ma.X >= 0 && ma.Y >= 0)
            {
                var posText = new TextBlock
                {
                    Text = $"({ma.X}, {ma.Y})",
                    Style = (Style)FindResource("BlockTextSecondary")
                };
                contentStack.Children.Add(posText);
            }

            Grid.SetColumn(contentStack, 1);
            grid.Children.Add(contentStack);
        }

        private void CreateDelayBlockContent(Grid grid, string icon, DelayAction da, int index)
        {
            // Icône
            var iconText = new TextBlock
            {
                Text = icon,
                Style = (Style)FindResource("BlockIcon")
            };
            Grid.SetColumn(iconText, 0);
            grid.Children.Add(iconText);

            // Contenu avec TextBox éditable (chiffres uniquement)
            var contentStack = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            
            var delayTextBox = new TextBox
            {
                Text = da.Duration.ToString(),
                Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(6, 2, 6, 2),
                FontWeight = FontWeights.Bold,
                FontSize = 13,
                Tag = index,
                Width = 50,
                TextAlignment = TextAlignment.Center
            };
            // N'accepter que les chiffres
            delayTextBox.PreviewTextInput += DelayTextBox_PreviewTextInput;
            delayTextBox.LostFocus += DelayTextBox_LostFocus;
            // Empêcher le collage de texte non numérique
            DataObject.AddPastingHandler(delayTextBox, DelayTextBox_Pasting);
            contentStack.Children.Add(delayTextBox);

            var msText = new TextBlock
            {
                Text = " ms",
                Style = (Style)FindResource("BlockText"),
                VerticalAlignment = VerticalAlignment.Center
            };
            contentStack.Children.Add(msText);

            Grid.SetColumn(contentStack, 1);
            grid.Children.Add(contentStack);
        }

        private void CreateDefaultBlockContent(Grid grid, string icon, string text)
        {
            // Icône
            var iconText = new TextBlock
            {
                Text = icon,
                Style = (Style)FindResource("BlockIcon")
            };
            Grid.SetColumn(iconText, 0);
            grid.Children.Add(iconText);

            // Texte
            var mainText = new TextBlock
            {
                Text = text,
                Style = (Style)FindResource("BlockText"),
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(mainText, 1);
            grid.Children.Add(mainText);
        }

        #region Édition inline

        private void KeyTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox)
            {
                // Indiquer visuellement que le champ attend une touche
                textBox.Background = new SolidColorBrush(Color.FromArgb(80, 255, 255, 255));
                textBox.Text = "...";
            }
        }

        private void KeyTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox && textBox.Tag is int index && _currentMacro != null)
            {
                // Restaurer l'affichage de la touche actuelle
                textBox.Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255));
                if (index >= 0 && index < _currentMacro.Actions.Count && _currentMacro.Actions[index] is KeyboardAction ka)
                {
                    textBox.Text = GetKeyName(ka.VirtualKeyCode);
                }
            }
        }

        private void KeyTextBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (sender is TextBox textBox && textBox.Tag is int index && _currentMacro != null)
            {
                e.Handled = true; // Empêcher la saisie normale
                
                // Ignorer les touches de modification seules
                if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                    e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                    e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                    e.Key == Key.LWin || e.Key == Key.RWin ||
                    e.Key == Key.Tab)
                {
                    return;
                }

                // Capturer la touche
                int virtualKey = KeyInterop.VirtualKeyFromKey(e.Key);
                if (virtualKey != 0 && index >= 0 && index < _currentMacro.Actions.Count && _currentMacro.Actions[index] is KeyboardAction ka)
                {
                    ka.VirtualKeyCode = (ushort)virtualKey;
                    textBox.Text = GetKeyName((ushort)virtualKey);
                    textBox.Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255));
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                    
                    // Retirer le focus pour confirmer visuellement
                    Keyboard.ClearFocus();
                }
            }
        }

        private void DelayTextBox_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            // N'accepter que les chiffres
            e.Handled = !int.TryParse(e.Text, out _);
        }

        private void DelayTextBox_Pasting(object sender, DataObjectPastingEventArgs e)
        {
            // Empêcher le collage de texte non numérique
            if (e.DataObject.GetDataPresent(typeof(string)))
            {
                string text = (string)e.DataObject.GetData(typeof(string));
                if (!int.TryParse(text, out _))
                {
                    e.CancelCommand();
                }
            }
            else
            {
                e.CancelCommand();
            }
        }

        private void DelayTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox && textBox.Tag is int index && _currentMacro != null)
            {
                if (int.TryParse(textBox.Text, out int delay) && delay > 0)
                {
                    if (index >= 0 && index < _currentMacro.Actions.Count && _currentMacro.Actions[index] is DelayAction da)
                    {
                        if (da.Duration != delay)
                        {
                            da.Duration = delay;
                            _currentMacro.ModifiedAt = DateTime.Now;
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                    }
                }
                else
                {
                    // Restaurer la valeur précédente si invalide
                    if (index >= 0 && index < _currentMacro.Actions.Count && _currentMacro.Actions[index] is DelayAction da)
                    {
                        textBox.Text = da.Duration.ToString();
                    }
                }
            }
        }

        #endregion

        #region Drag & Drop

        private void Block_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is FrameworkElement element && element.Tag is int index)
            {
                _dragStartPoint = e.GetPosition(this);
                _draggedIndex = index;
                _draggedElement = element;
                
                // Stocker le décalage entre le curseur et le coin supérieur gauche du bloc
                _dragOffset = e.GetPosition(element);
            }
        }

        private void Block_MouseMove(object sender, MouseEventArgs e)
        {
            if (e.LeftButton != MouseButtonState.Pressed || _draggedElement == null || _draggedIndex < 0)
                return;

            Point currentPos = e.GetPosition(this);
            Vector diff = _dragStartPoint - currentPos;

            // Démarrer le drag si on a bougé assez
            if (Math.Abs(diff.X) > SystemParameters.MinimumHorizontalDragDistance ||
                Math.Abs(diff.Y) > SystemParameters.MinimumVerticalDragDistance)
            {
                // Créer une capture visuelle du bloc
                CreateDragVisual(_draggedElement);
                
                _draggedElement.Opacity = 0.3;
                
                DataObject dragData = new DataObject("BlockIndex", _draggedIndex);
                
                // S'abonner à l'événement de mise à jour de position
                _draggedElement.GiveFeedback += DraggedElement_GiveFeedback;
                
                DragDrop.DoDragDrop(_draggedElement, dragData, DragDropEffects.Move);
                
                // Nettoyer
                _draggedElement.GiveFeedback -= DraggedElement_GiveFeedback;
                HideDragVisual();
                
                _draggedElement.Opacity = 1.0;
                _draggedElement = null;
                _draggedIndex = -1;
            }
        }

        private void CreateDragVisual(FrameworkElement element)
        {
            double width = element.ActualWidth > 0 ? element.ActualWidth : BLOCK_MAX_WIDTH;
            double height = element.ActualHeight > 0 ? element.ActualHeight : 60;
            
            // Créer un rectangle avec un VisualBrush pour copier l'apparence
            var visualBrush = new VisualBrush(element)
            {
                Opacity = 0.85,
                Stretch = Stretch.None
            };

            var dragBorder = new Border
            {
                Width = width,
                Height = height,
                Background = visualBrush,
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = Colors.Black,
                    Opacity = 0.4,
                    BlurRadius = 15,
                    ShadowDepth = 5
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
                // Positionner le bloc en gardant le décalage initial du curseur
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

        private void Block_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _draggedElement = null;
            _draggedIndex = -1;
        }

        private void Block_DragEnter(object sender, DragEventArgs e)
        {
            if (sender is Border block)
            {
                block.BorderThickness = new Thickness(2, 0, 0, 3);
                block.BorderBrush = Brushes.White;
            }
        }

        private void Block_DragLeave(object sender, DragEventArgs e)
        {
            if (sender is Border block)
            {
                // Restaurer le style original
                block.BorderThickness = new Thickness(0, 0, 0, 3);
                RefreshBlockBorderBrush(block);
            }
        }

        private void RefreshBlockBorderBrush(Border block)
        {
            if (block.Tag is int index && _currentMacro != null && index < _currentMacro.Actions.Count)
            {
                var action = _currentMacro.Actions[index];
                switch (action)
                {
                    case KeyboardAction:
                        block.BorderBrush = (SolidColorBrush)FindResource("BlockKeyboardDarkBrush");
                        break;
                    case Core.Inputs.MouseAction:
                        block.BorderBrush = (SolidColorBrush)FindResource("BlockMouseDarkBrush");
                        break;
                    case DelayAction:
                        block.BorderBrush = (SolidColorBrush)FindResource("BlockDelayDarkBrush");
                        break;
                }
            }
        }

        private void Block_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent("BlockIndex") && sender is Border targetBlock && targetBlock.Tag is int targetIndex)
            {
                int sourceIndex = (int)e.Data.GetData("BlockIndex");
                
                if (sourceIndex != targetIndex && _currentMacro != null)
                {
                    // Réorganiser les actions
                    var action = _currentMacro.Actions[sourceIndex];
                    _currentMacro.Actions.RemoveAt(sourceIndex);
                    
                    // Ajuster l'index cible si nécessaire
                    if (sourceIndex < targetIndex)
                        targetIndex--;
                    
                    _currentMacro.Actions.Insert(targetIndex, action);
                    _currentMacro.ModifiedAt = DateTime.Now;
                    
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            }
            
            e.Handled = true;
        }

        private void BlocksItemsControl_DragOver(object sender, DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent("BlockIndex") ? DragDropEffects.Move : DragDropEffects.None;
            e.Handled = true;
        }

        private void BlocksItemsControl_Drop(object sender, DragEventArgs e)
        {
            // Drop à la fin de la liste si on drop sur le conteneur
            if (e.Data.GetDataPresent("BlockIndex") && _currentMacro != null)
            {
                int sourceIndex = (int)e.Data.GetData("BlockIndex");
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
            // Ajouter directement une action Press sans dialogue (sans touche par défaut)
            _currentMacro.Actions.Add(new KeyboardAction
            {
                VirtualKeyCode = 0, // Pas de touche par défaut
                ActionType = KeyboardActionType.Press
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddMouse_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            // Ajouter un clic gauche par défaut
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

            // Ajouter directement un délai de 100ms (éditable inline dans le bloc)
            _currentMacro.Actions.Add(new DelayAction
            {
                Duration = 100
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void DeleteBlock_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is int index && _currentMacro != null)
            {
                if (index >= 0 && index < _currentMacro.Actions.Count)
                {
                    _currentMacro.Actions.RemoveAt(index);
                    _currentMacro.ModifiedAt = DateTime.Now;
                    
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            }
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

        #region Helpers

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

        private string GetMouseActionText(Core.Inputs.MouseAction ma)
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

        #endregion
    }

    /// <summary>
    /// Dialogue simple pour capturer une touche
    /// </summary>
    public class KeyCaptureDialog : Window
    {
        public int CapturedKey { get; private set; }
        private TextBlock _instructionText;

        public KeyCaptureDialog()
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
    /// Dialogue simple pour entrer un délai
    /// </summary>
    public class DelayInputDialog : Window
    {
        public int DelayValue { get; set; } = 100;
        private TextBox _delayTextBox;

        public DelayInputDialog()
        {
            Title = "Ajouter un délai";
            Width = 300;
            Height = 180;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode = ResizeMode.NoResize;
            Background = (SolidColorBrush)Application.Current.Resources["BackgroundPrimaryBrush"];

            var stack = new StackPanel { Margin = new Thickness(20) };

            var label = new TextBlock
            {
                Text = "Durée du délai (ms):",
                Margin = new Thickness(0, 0, 0, 10),
                Style = (Style)Application.Current.Resources["TextBody"]
            };
            stack.Children.Add(label);

            _delayTextBox = new TextBox
            {
                Text = DelayValue.ToString(),
                Style = (Style)Application.Current.Resources["TextBoxModern"],
                Margin = new Thickness(0, 0, 0, 20)
            };
            stack.Children.Add(_delayTextBox);

            var buttonPanel = new StackPanel 
            { 
                Orientation = Orientation.Horizontal, 
                HorizontalAlignment = HorizontalAlignment.Right 
            };

            var cancelBtn = new Button
            {
                Content = "Annuler",
                Style = (Style)Application.Current.Resources["ButtonSecondary"],
                Margin = new Thickness(0, 0, 10, 0),
                Padding = new Thickness(16, 8, 16, 8)
            };
            cancelBtn.Click += (s, e) => { DialogResult = false; Close(); };
            buttonPanel.Children.Add(cancelBtn);

            var okBtn = new Button
            {
                Content = "OK",
                Style = (Style)Application.Current.Resources["ButtonPrimary"],
                Padding = new Thickness(16, 8, 16, 8)
            };
            okBtn.Click += OkBtn_Click;
            buttonPanel.Children.Add(okBtn);

            stack.Children.Add(buttonPanel);
            Content = stack;
        }

        private void OkBtn_Click(object sender, RoutedEventArgs e)
        {
            if (int.TryParse(_delayTextBox.Text, out int delay) && delay > 0)
            {
                DelayValue = delay;
                DialogResult = true;
                Close();
            }
            else
            {
                MessageBox.Show("Veuillez entrer un nombre valide.", "Erreur", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
    }
}


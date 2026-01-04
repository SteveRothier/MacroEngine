using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
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
        private Border? _draggedBlock;
        private Point _dragStartPoint;

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
        /// Crée un bloc visuel pour une action
        /// </summary>
        private Border CreateBlockForAction(IInputAction action, int index)
        {
            string styleName;
            string icon;
            string text;
            string secondaryText = "";

            switch (action)
            {
                case KeyboardAction ka:
                    styleName = "BlockKeyboard";
                    icon = "⌨";
                    text = GetKeyName(ka.VirtualKeyCode);
                    secondaryText = ka.ActionType == KeyboardActionType.Down ? "Appuyer" : 
                                    ka.ActionType == KeyboardActionType.Up ? "Relâcher" : "Appuyer+Relâcher";
                    break;

                case Core.Inputs.MouseAction ma:
                    styleName = "BlockMouse";
                    icon = "🖱";
                    text = GetMouseActionText(ma);
                    if (ma.X >= 0 && ma.Y >= 0)
                        secondaryText = $"({ma.X}, {ma.Y})";
                    break;

                case DelayAction da:
                    styleName = "BlockDelay";
                    icon = "⏱";
                    text = $"{da.Duration} ms";
                    secondaryText = "Attendre";
                    break;

                default:
                    styleName = "BlockKeyboard";
                    icon = "❓";
                    text = action.Type.ToString();
                    break;
            }

            var block = new Border();
            block.Style = (Style)FindResource(styleName);
            block.Tag = index;
            block.AllowDrop = true;

            // Événements de drag & drop
            block.MouseLeftButtonDown += Block_MouseLeftButtonDown;
            block.MouseMove += Block_MouseMove;
            block.MouseLeftButtonUp += Block_MouseLeftButtonUp;
            block.Drop += Block_Drop;
            block.DragEnter += Block_DragEnter;
            block.DragLeave += Block_DragLeave;

            // Contenu du bloc
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // Icône
            var iconText = new TextBlock
            {
                Text = icon,
                Style = (Style)FindResource("BlockIcon")
            };
            Grid.SetColumn(iconText, 0);
            grid.Children.Add(iconText);

            // Texte principal et secondaire
            var textStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            
            var mainText = new TextBlock
            {
                Text = text,
                Style = (Style)FindResource("BlockText")
            };
            textStack.Children.Add(mainText);

            if (!string.IsNullOrEmpty(secondaryText))
            {
                var secText = new TextBlock
                {
                    Text = secondaryText,
                    Style = (Style)FindResource("BlockTextSecondary")
                };
                textStack.Children.Add(secText);
            }
            Grid.SetColumn(textStack, 1);
            grid.Children.Add(textStack);

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
            block.MouseEnter += (s, e) => deleteButton.Visibility = Visibility.Visible;
            block.MouseLeave += (s, e) => deleteButton.Visibility = Visibility.Collapsed;

            block.Child = grid;

            return block;
        }

        #region Drag & Drop

        private void Block_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border block && block.Tag is int index)
            {
                _dragStartPoint = e.GetPosition(this);
                _draggedIndex = index;
                _draggedBlock = block;
            }
        }

        private void Block_MouseMove(object sender, MouseEventArgs e)
        {
            if (e.LeftButton != MouseButtonState.Pressed || _draggedBlock == null || _draggedIndex < 0)
                return;

            Point currentPos = e.GetPosition(this);
            Vector diff = _dragStartPoint - currentPos;

            // Démarrer le drag si on a bougé assez
            if (Math.Abs(diff.X) > SystemParameters.MinimumHorizontalDragDistance ||
                Math.Abs(diff.Y) > SystemParameters.MinimumVerticalDragDistance)
            {
                _draggedBlock.Opacity = 0.6;
                
                DataObject dragData = new DataObject("BlockIndex", _draggedIndex);
                DragDrop.DoDragDrop(_draggedBlock, dragData, DragDropEffects.Move);
                
                _draggedBlock.Opacity = 1.0;
                _draggedBlock = null;
                _draggedIndex = -1;
            }
        }

        private void Block_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _draggedBlock = null;
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

            // Ouvrir un dialogue pour sélectionner la touche
            var dialog = new KeyCaptureDialog
            {
                Owner = Window.GetWindow(this)
            };

            if (dialog.ShowDialog() == true && dialog.CapturedKey != 0)
            {
                // Ajouter appui + relâchement
                _currentMacro.Actions.Add(new KeyboardAction
                {
                    VirtualKeyCode = (ushort)dialog.CapturedKey,
                    ActionType = KeyboardActionType.Down
                });
                _currentMacro.Actions.Add(new KeyboardAction
                {
                    VirtualKeyCode = (ushort)dialog.CapturedKey,
                    ActionType = KeyboardActionType.Up
                });
                _currentMacro.ModifiedAt = DateTime.Now;
                
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
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

            // Ouvrir un dialogue pour le délai
            var dialog = new DelayInputDialog
            {
                Owner = Window.GetWindow(this),
                DelayValue = 100
            };

            if (dialog.ShowDialog() == true)
            {
                _currentMacro.Actions.Add(new DelayAction
                {
                    Duration = dialog.DelayValue
                });
                _currentMacro.ModifiedAt = DateTime.Now;
                
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
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


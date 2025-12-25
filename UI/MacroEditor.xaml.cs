using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;
using MacroEngine.Core.Hooks;

namespace MacroEngine.UI
{
    public partial class MacroEditor : UserControl
    {
        private Macro _currentMacro;
        private Stack<List<IInputAction>> _undoStack = new Stack<List<IInputAction>>();
        private Stack<List<IInputAction>> _redoStack = new Stack<List<IInputAction>>();
        private bool _isUndoRedo = false;
        private bool _isCapturingShortcutKey = false;
        private KeyboardHook _keyboardHook;

        public event EventHandler MacroModified;

        public MacroEditor()
        {
            InitializeComponent();
            MacroNameTextBox.TextChanged += MacroNameTextBox_TextChanged;
            MacroDescriptionTextBox.TextChanged += MacroDescriptionTextBox_TextChanged;
            
            // Initialiser le hook clavier pour capturer F10 et autres touches système
            _keyboardHook = new KeyboardHook();
            _keyboardHook.KeyDown += KeyboardHook_KeyDown;
            
            this.Unloaded += MacroEditor_Unloaded;
        }

        private void MacroEditor_Unloaded(object sender, RoutedEventArgs e)
        {
            // Nettoyer le hook
            if (_keyboardHook != null)
            {
                _keyboardHook.KeyDown -= KeyboardHook_KeyDown;
                _keyboardHook.Uninstall();
                _keyboardHook.Dispose();
            }
        }

        private void KeyboardHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Capturer F10 via le hook bas niveau même pendant la capture
            if (_isCapturingShortcutKey && e.VirtualKeyCode == 0x79) // VK_F10
            {
                e.Handled = true;
                Dispatcher.Invoke(() =>
                {
                    if (_currentMacro != null)
                    {
                        _currentMacro.ShortcutKeyCode = 0x79;
                        UpdateShortcutDisplay();
                        CheckForShortcutConflicts();
                        ShortcutKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
                    }
                });
            }
        }

        private void MacroNameTextBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            if (_currentMacro != null)
            {
                _currentMacro.Name = MacroNameTextBox.Text;
                OnMacroModified();
            }
        }

        private void MacroDescriptionTextBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            if (_currentMacro != null)
            {
                _currentMacro.Description = MacroDescriptionTextBox.Text;
                OnMacroModified();
            }
        }

        private void OnMacroModified()
        {
            MacroModified?.Invoke(this, EventArgs.Empty);
        }

        public void LoadMacro(Macro macro)
        {
            _currentMacro = macro;
            if (macro != null)
            {
                MacroNameTextBox.Text = macro.Name;
                MacroDescriptionTextBox.Text = macro.Description;
                UpdateShortcutDisplay();
                
                // Initialiser la liste d'actions si elle est null
                if (macro.Actions == null)
                {
                    macro.Actions = new List<IInputAction>();
                }
                
                ActionsDataGrid.ItemsSource = macro.Actions;
                
                // Réinitialiser l'historique
                _undoStack.Clear();
                _redoStack.Clear();
                SaveState();
                UpdateUndoRedoButtons();
            }
            else
            {
                MacroNameTextBox.Text = string.Empty;
                MacroDescriptionTextBox.Text = string.Empty;
                ShortcutKeyTextBox.Text = "Aucune touche";
                ActionsDataGrid.ItemsSource = null;
                _undoStack.Clear();
                _redoStack.Clear();
                UpdateUndoRedoButtons();
            }
        }

        private void UpdateShortcutDisplay()
        {
            if (_currentMacro != null)
            {
                if (_currentMacro.ShortcutKeyCode != 0)
                {
                    ShortcutKeyTextBox.Text = GetKeyName(_currentMacro.ShortcutKeyCode);
                }
                else
                {
                    ShortcutKeyTextBox.Text = "Aucune touche";
                }
            }
        }

        private string GetKeyName(int virtualKeyCode)
        {
            if (virtualKeyCode == 0)
            {
                return "Aucune touche";
            }
            
            return virtualKeyCode switch
            {
                0x08 => "Backspace", 0x09 => "Tab", 0x0D => "Enter",
                0x10 => "Shift", 0x11 => "Ctrl", 0x12 => "Alt", 0x1B => "Esc",
                0x20 => "Espace", 0x21 => "Page Up", 0x22 => "Page Down",
                0x23 => "End", 0x24 => "Home", 0x2C => "Print Screen",
                0x2D => "Insert", 0x2E => "Delete",
                0x30 => "0", 0x31 => "1", 0x32 => "2", 0x33 => "3", 0x34 => "4",
                0x35 => "5", 0x36 => "6", 0x37 => "7", 0x38 => "8", 0x39 => "9",
                0x41 => "A", 0x42 => "B", 0x43 => "C", 0x44 => "D", 0x45 => "E",
                0x46 => "F", 0x47 => "G", 0x48 => "H", 0x49 => "I", 0x4A => "J",
                0x4B => "K", 0x4C => "L", 0x4D => "M", 0x4E => "N", 0x4F => "O",
                0x50 => "P", 0x51 => "Q", 0x52 => "R", 0x53 => "S", 0x54 => "T",
                0x55 => "U", 0x56 => "V", 0x57 => "W", 0x58 => "X", 0x59 => "Y", 0x5A => "Z",
                0x70 => "F1", 0x71 => "F2", 0x72 => "F3", 0x73 => "F4",
                0x74 => "F5", 0x75 => "F6", 0x76 => "F7", 0x77 => "F8",
                0x78 => "F9", 0x79 => "F10", 0x7A => "F11", 0x7B => "F12",
                _ => $"VK{virtualKeyCode:X2}"
            };
        }

        private int KeyToVirtualKeyCode(Key key)
        {
            if (key >= Key.F1 && key <= Key.F12)
            {
                return 0x70 + ((int)key - (int)Key.F1);
            }
            
            int vkCode = KeyInterop.VirtualKeyFromKey(key);
            if (vkCode == 0)
            {
                return key switch
                {
                    Key.LeftShift => 0xA0,
                    Key.RightShift => 0xA1,
                    Key.LeftCtrl => 0xA2,
                    Key.RightCtrl => 0xA3,
                    Key.LeftAlt => 0xA4,
                    Key.RightAlt => 0xA5,
                    _ => 0
                };
            }
            return vkCode;
        }

        private void SaveState()
        {
            if (_currentMacro?.Actions != null)
            {
                // Créer une copie profonde de la liste d'actions
                var state = _currentMacro.Actions.Select(a => a.Clone()).ToList();
                _undoStack.Push(state);
                // Limiter la taille de l'historique à 50 états
                if (_undoStack.Count > 50)
                {
                    var temp = new Stack<List<IInputAction>>();
                    for (int i = 0; i < 50; i++)
                    {
                        temp.Push(_undoStack.Pop());
                    }
                    _undoStack = temp;
                }
                _redoStack.Clear(); // Vider redo quand on fait une nouvelle action
            }
        }

        private void RestoreState(List<IInputAction> state)
        {
            if (_currentMacro?.Actions != null)
            {
                _isUndoRedo = true;
                _currentMacro.Actions.Clear();
                _currentMacro.Actions.AddRange(state.Select(a => a.Clone()));
                ActionsDataGrid.Items.Refresh();
                OnMacroModified();
                UpdateUndoRedoButtons();
                _isUndoRedo = false;
            }
        }

        private void UpdateUndoRedoButtons()
        {
            // Undo est possible s'il y a plus d'un état (état actuel + au moins un état précédent)
            UndoButton.IsEnabled = _undoStack.Count > 1;
            RedoButton.IsEnabled = _redoStack.Count > 0;
        }

        private void Undo_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro?.Actions == null || _undoStack.Count <= 1)
                return; // Besoin d'au moins 2 états (état actuel + état précédent)

            // Sauvegarder l'état actuel dans redo
            var currentState = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _redoStack.Push(currentState);

            // Retirer l'état actuel (il est dans redo maintenant)
            _undoStack.Pop();
            
            // Restaurer l'état précédent
            var previousState = _undoStack.Peek(); // Ne pas pop, on garde pour pouvoir undo à nouveau
            RestoreState(previousState);
        }

        private void Redo_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro?.Actions == null || _redoStack.Count == 0)
                return;

            // Sauvegarder l'état actuel dans undo
            var currentState = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _undoStack.Push(currentState);

            // Restaurer l'état suivant
            var nextState = _redoStack.Pop();
            RestoreState(nextState);
        }

        public void RefreshActions()
        {
            try
            {
                if (_currentMacro != null && ActionsDataGrid != null && ActionsDataGrid.ItemsSource != null)
                {
                    // Utiliser BeginInvoke pour éviter les problèmes de thread
                    ActionsDataGrid.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        try
                        {
                            ActionsDataGrid.Items.Refresh();
                            
                            // Scroller vers la dernière ligne (la plus récente) seulement si nécessaire
                            if (ActionsDataGrid.Items.Count > 0)
                            {
                                var lastItem = ActionsDataGrid.Items[ActionsDataGrid.Items.Count - 1];
                                ActionsDataGrid.ScrollIntoView(lastItem);
                                // Ne pas changer la sélection à chaque rafraîchissement
                            }
                        }
                        catch (Exception ex)
                        {
                            System.Diagnostics.Debug.WriteLine($"Erreur lors du rafraîchissement du DataGrid: {ex.Message}");
                        }
                    }), System.Windows.Threading.DispatcherPriority.Background);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Erreur dans RefreshActions: {ex.Message}");
            }
        }

        private void AddKeyboardAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            if (!_isUndoRedo)
                SaveState();

            // Pour l'instant, on crée une action avec la touche A par défaut
            // TODO: Créer un dialogue de sélection de touche
            
            var action = new KeyboardAction
            {
                Name = GetKeyName(0x41), // A
                VirtualKeyCode = 0x41
            };
            _currentMacro.Actions.Add(action);
            ActionsDataGrid.Items.Refresh();
            OnMacroModified();
            UpdateUndoRedoButtons();
        }

        private string GetKeyName(ushort vkCode)
        {
            // Conversion basique des codes de touches courants
            return vkCode switch
            {
                0x20 => "Espace",
                0x0D => "Entrée",
                0x08 => "Retour",
                0x09 => "Tab",
                0x1B => "Échap",
                0x41 => "A", 0x42 => "B", 0x43 => "C", 0x44 => "D", 0x45 => "E",
                0x46 => "F", 0x47 => "G", 0x48 => "H", 0x49 => "I", 0x4A => "J",
                0x4B => "K", 0x4C => "L", 0x4D => "M", 0x4E => "N", 0x4F => "O",
                0x50 => "P", 0x51 => "Q", 0x52 => "R", 0x53 => "S", 0x54 => "T",
                0x55 => "U", 0x56 => "V", 0x57 => "W", 0x58 => "X", 0x59 => "Y", 0x5A => "Z",
                0x30 => "0", 0x31 => "1", 0x32 => "2", 0x33 => "3", 0x34 => "4",
                0x35 => "5", 0x36 => "6", 0x37 => "7", 0x38 => "8", 0x39 => "9",
                0x10 => "Shift", 0x11 => "Ctrl", 0x12 => "Alt",
                0x70 => "F1", 0x71 => "F2", 0x72 => "F3", 0x73 => "F4",
                0x74 => "F5", 0x75 => "F6", 0x76 => "F7", 0x77 => "F8",
                0x78 => "F9", 0x79 => "F10", 0x7A => "F11", 0x7B => "F12",
                _ => $"VK{vkCode:X2}"
            };
        }


        private void AddDelayAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = new DelayAction
            {
                Name = "100ms",
                Duration = 100
            };
            _currentMacro.Actions.Add(action);
            ActionsDataGrid.Items.Refresh();
            OnMacroModified();
            UpdateUndoRedoButtons();
        }

        private void DeleteAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null || ActionsDataGrid.SelectedItem == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = ActionsDataGrid.SelectedItem as IInputAction;
            if (action != null)
            {
                _currentMacro.Actions.Remove(action);
                ActionsDataGrid.Items.Refresh();
                OnMacroModified();
                UpdateUndoRedoButtons();
            }
        }

        private void MoveUpAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null || ActionsDataGrid.SelectedItem == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = ActionsDataGrid.SelectedItem as IInputAction;
            if (action != null)
            {
                int index = _currentMacro.Actions.IndexOf(action);
                if (index > 0)
                {
                    _currentMacro.Actions.RemoveAt(index);
                    _currentMacro.Actions.Insert(index - 1, action);
                    ActionsDataGrid.Items.Refresh();
                    ActionsDataGrid.SelectedItem = action;
                    OnMacroModified();
                    UpdateUndoRedoButtons();
                }
            }
        }

        private void MoveDownAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null || ActionsDataGrid.SelectedItem == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = ActionsDataGrid.SelectedItem as IInputAction;
            if (action != null)
            {
                int index = _currentMacro.Actions.IndexOf(action);
                if (index < _currentMacro.Actions.Count - 1)
                {
                    _currentMacro.Actions.RemoveAt(index);
                    _currentMacro.Actions.Insert(index + 1, action);
                    ActionsDataGrid.Items.Refresh();
                    ActionsDataGrid.SelectedItem = action;
                    OnMacroModified();
                    UpdateUndoRedoButtons();
                }
            }
        }

        private void CaptureShortcutKeyButton_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;
            ShortcutKeyTextBox.Focus();
        }

        private void ShortcutKeyTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;
            ShortcutKeyTextBox.Text = "Appuyez sur une touche...";
            _isCapturingShortcutKey = true;
            
            try
            {
                _keyboardHook.Install();
            }
            catch { }
        }

        private void ShortcutKeyTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            _isCapturingShortcutKey = false;
            UpdateShortcutDisplay();
            
            try
            {
                _keyboardHook.Uninstall();
            }
            catch { }
        }

        private void ShortcutKeyTextBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (_isCapturingShortcutKey && _currentMacro != null && e.Key == Key.F10)
            {
                e.Handled = true;
                _currentMacro.ShortcutKeyCode = 0x79;
                UpdateShortcutDisplay();
                CheckForShortcutConflicts();
                ShortcutKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
            }
        }

        private void ShortcutKeyTextBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (!_isCapturingShortcutKey || _currentMacro == null)
                return;

            if (e.Key == Key.F10)
            {
                e.Handled = true;
                return;
            }
            
            e.Handled = true;
            
            if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                e.Key == Key.LWin || e.Key == Key.RWin)
            {
                return;
            }

            var keyCode = KeyToVirtualKeyCode(e.Key);
            if (keyCode == 0)
            {
                if (e.Key == Key.F10)
                {
                    keyCode = 0x79;
                }
                else
                {
                    return;
                }
            }
            
            _currentMacro.ShortcutKeyCode = keyCode;
            UpdateShortcutDisplay();
            CheckForShortcutConflicts();
            OnMacroModified();
            ShortcutKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
        }

        private void CheckForShortcutConflicts()
        {
            // Cette méthode sera appelée depuis MainWindow après que toutes les macros soient chargées
            // Pour l'instant, on ne fait rien ici - la validation se fera dans MainWindow
        }
    }
}


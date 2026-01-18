using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;
using MacroEngine.Core.Hooks;
using MacroEngine.Core.Processes;

namespace MacroEngine.UI
{
    public partial class MacroEditor : UserControl
    {
        private Macro? _currentMacro;
        private Stack<List<IInputAction>> _undoStack = new Stack<List<IInputAction>>();
        private Stack<List<IInputAction>> _redoStack = new Stack<List<IInputAction>>();
        private bool _isUndoRedo = false;
        private bool _isCapturingShortcutKey = false;
        private KeyboardHook _keyboardHook;

        public event EventHandler? MacroModified;

        public MacroEditor()
        {
            InitializeComponent();
            
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
                        _isCapturingShortcutKey = false;
                        OnMacroModified();
                    }
                });
            }
        }

        // Note: Les champs Nom et Description sont maintenant gérés dans MainWindow (panneau Propriétés)

        private void OnMacroModified()
        {
            MacroModified?.Invoke(this, EventArgs.Empty);
        }

        public void LoadMacro(Macro macro)
        {
            _currentMacro = macro;
            if (macro != null)
            {
                // Initialiser la liste d'actions si elle est null
                if (macro.Actions == null)
                {
                    macro.Actions = new List<IInputAction>();
                }
                
                // Initialiser la liste des applications cibles si elle est null
                if (macro.TargetApplications == null)
                {
                    macro.TargetApplications = new List<string>();
                }
                
                ActionsDataGrid.ItemsSource = macro.Actions;
                
                // Charger les options de répétition
                UpdateRepeatOptionsDisplay();
                
                // Réinitialiser l'historique
                _undoStack.Clear();
                _redoStack.Clear();
                SaveState();
                UpdateUndoRedoButtons();
            }
            else
            {
                ActionsDataGrid.ItemsSource = null;
                _undoStack.Clear();
                _redoStack.Clear();
                UpdateUndoRedoButtons();
                ResetRepeatOptions();
            }
        }

        // Note: UpdateShortcutDisplay est maintenant géré dans MainWindow (panneau Propriétés)

        private string GetKeyName(int virtualKeyCode)
        {
            if (virtualKeyCode == 0)
            {
                return "Aucune touche";
            }
            
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
                0xBA => ";",      // Point-virgule (AZERTY)
                0xBB => "=",      // Égal
                0xBC => ",",      // Virgule
                0xBD => "-",      // Tiret
                0xBE => ":",      // Deux-points (produit par Shift + ; sur AZERTY)
                0xBF => "!",      // Point d'exclamation (produit par Shift + : sur AZERTY)
                0xC0 => "ù",      // U accent grave
                0xDB => "[",      // Crochet ouvrant
                0xDC => "\\",     // Antislash
                0xDD => "]",      // Crochet fermant
                0xDE => "^",      // Circonflexe
                _ => $"Touche {virtualKeyCode}"
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

        private DateTime _lastRefreshTime = DateTime.MinValue;
        private const int MIN_REFRESH_INTERVAL_MS = 1000; // Rafraîchir max 1 fois par seconde
        private bool _refreshPending = false;
        
        public void RefreshActions()
        {
            try
            {
                // Throttle: ne pas rafraîchir trop souvent
                var now = DateTime.Now;
                if ((now - _lastRefreshTime).TotalMilliseconds < MIN_REFRESH_INTERVAL_MS)
                {
                    // Marquer un rafraîchissement en attente
                    if (!_refreshPending)
                    {
                        _refreshPending = true;
                        // Programmer un rafraîchissement différé
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            if (_refreshPending)
                            {
                                _refreshPending = false;
                                RefreshActionsInternal();
                            }
                        }), System.Windows.Threading.DispatcherPriority.ApplicationIdle);
                    }
                    return;
                }
                    
                RefreshActionsInternal();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Erreur dans RefreshActions: {ex.Message}");
            }
        }
        
        private void RefreshActionsInternal()
        {
            _lastRefreshTime = DateTime.Now;
            
            if (_currentMacro != null && ActionsDataGrid != null && ActionsDataGrid.ItemsSource != null)
            {
                // Ne pas rafraîchir si l'utilisateur scrolle (focus sur le DataGrid)
                if (ActionsDataGrid.IsMouseOver && Mouse.LeftButton == MouseButtonState.Pressed)
                    return;
                    
                ActionsDataGrid.Items.Refresh();
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
            if (vkCode == 0)
            {
                return "Aucune touche";
            }
            
            return vkCode switch
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
                0xBA => ";",      // Point-virgule (AZERTY)
                0xBB => "=",      // Égal
                0xBC => ",",      // Virgule
                0xBD => "-",      // Tiret
                0xBE => ":",      // Deux-points (produit par Shift + ; sur AZERTY)
                0xBF => "!",      // Point d'exclamation (produit par Shift + : sur AZERTY)
                0xC0 => "ù",      // U accent grave
                0xDB => "[",      // Crochet ouvrant
                0xDC => "\\",     // Antislash
                0xDD => "]",      // Crochet fermant
                0xDE => "^",      // Circonflexe
                _ => $"Touche {vkCode}"
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

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private void AddMouseAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = new Core.Inputs.MouseAction
            {
                Name = "Clic gauche",
                ActionType = Core.Inputs.MouseActionType.LeftClick,
                X = -1,
                Y = -1
            };
            _currentMacro.Actions.Add(action);
            ActionsDataGrid.Items.Refresh();
            OnMacroModified();
            UpdateUndoRedoButtons();
        }

        private void AddMouseActionAdvanced_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            var dialog = new MouseActionDialog
            {
                Owner = Window.GetWindow(this)
            };

            if (dialog.ShowDialog() == true && dialog.ResultAction != null)
            {
                if (!_isUndoRedo)
                    SaveState();

                _currentMacro.Actions.Add(dialog.ResultAction);
                ActionsDataGrid.Items.Refresh();
                OnMacroModified();
                UpdateUndoRedoButtons();
            }
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

        // Note: Les méthodes de gestion du raccourci sont maintenant dans MainWindow (panneau Propriétés)

        private bool _isEditingCell = false;
        private IInputAction? _actionBeforeEdit = null;

        private void ActionsDataGrid_BeginningEdit(object sender, DataGridBeginningEditEventArgs e)
        {
            if (_currentMacro == null || e.Row.Item is not IInputAction action)
                return;

            if (!_isUndoRedo && !_isEditingCell)
            {
                SaveState();
                _isEditingCell = true;
                // Cloner l'action avant modification pour pouvoir restaurer si nécessaire
                _actionBeforeEdit = action.Clone();
            }
        }

        private void ActionsDataGrid_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e)
        {
            if (_currentMacro == null || e.Row.Item is not IInputAction action)
            {
                _isEditingCell = false;
                _actionBeforeEdit = null;
                return;
            }

            try
            {
                var columnHeader = e.Column?.Header?.ToString();
                if (columnHeader == "Nom" && e.EditingElement is System.Windows.Controls.TextBox textBox)
                {
                    string newValue = textBox.Text;
                    bool isValid = false;
                    
                    // Valider et préparer les modifications sans les appliquer immédiatement
                    if (action is KeyboardAction keyboardAction)
                    {
                        int newKeyCode = NameToVirtualKeyCode(newValue);
                        if (newKeyCode > 0)
                        {
                            // Reporter la mise à jour après la fin de l'édition
                            Dispatcher.BeginInvoke(new Action(() =>
                            {
                                try
                                {
                                    keyboardAction.VirtualKeyCode = (ushort)newKeyCode;
                                    keyboardAction.Name = GetKeyName((ushort)newKeyCode);
                                    ActionsDataGrid.Items.Refresh();
                                    OnMacroModified();
                                    UpdateUndoRedoButtons();
                                }
                                catch (Exception ex)
                                {
                                    System.Diagnostics.Debug.WriteLine($"Erreur lors de la mise à jour de KeyboardAction: {ex.Message}");
                                }
                            }), System.Windows.Threading.DispatcherPriority.Input);
                            isValid = true;
                        }
                    }
                    else if (action is DelayAction delayAction)
                    {
                        int newDuration = ExtractDurationFromText(newValue);
                        if (newDuration >= 0)
                        {
                            // Reporter la mise à jour après la fin de l'édition
                            Dispatcher.BeginInvoke(new Action(() =>
                            {
                                try
                                {
                                    delayAction.Duration = newDuration;
                                    delayAction.Name = $"{newDuration}ms";
                                    ActionsDataGrid.Items.Refresh();
                                    OnMacroModified();
                                    UpdateUndoRedoButtons();
                                }
                                catch (Exception ex)
                                {
                                    System.Diagnostics.Debug.WriteLine($"Erreur lors de la mise à jour de DelayAction: {ex.Message}");
                                }
                            }), System.Windows.Threading.DispatcherPriority.Input);
                            isValid = true;
                        }
                    }

                    if (!isValid)
                    {
                        // Restaurer l'ancien nom si validation échoue
                        e.Cancel = true;
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            try
                            {
                                if (_actionBeforeEdit != null)
                                {
                                    if (action is KeyboardAction keyboardAction && _actionBeforeEdit is KeyboardAction oldKeyboardAction)
                                    {
                                        keyboardAction.Name = oldKeyboardAction.Name;
                                        keyboardAction.VirtualKeyCode = oldKeyboardAction.VirtualKeyCode;
                                    }
                                    else if (action is DelayAction delayAction && _actionBeforeEdit is DelayAction oldDelayAction)
                                    {
                                        delayAction.Name = oldDelayAction.Name;
                                        delayAction.Duration = oldDelayAction.Duration;
                                    }
                                    ActionsDataGrid.Items.Refresh();
                                }
                            }
                            catch { }
                        }), System.Windows.Threading.DispatcherPriority.Input);
                    }
                }
            }
            catch (Exception ex)
            {
                e.Cancel = true;
                System.Diagnostics.Debug.WriteLine($"Erreur dans CellEditEnding: {ex.Message}");
            }
            finally
            {
                _isEditingCell = false;
                _actionBeforeEdit = null;
            }
        }

        private int NameToVirtualKeyCode(string name)
        {
            // Conversion du nom en VirtualKeyCode (même logique que GetKeyName mais inverse)
            string normalizedName = name.Trim().ToUpper();
            return normalizedName switch
            {
                "BACKSPACE" => 0x08,
                "TAB" => 0x09,
                "CLEAR" => 0x0C,
                "ENTER" => 0x0D,
                "ENTRÉE" => 0x0D,
                "SHIFT" => 0x10,
                "CTRL" => 0x11,
                "ALT" => 0x12,
                "PAUSE" => 0x13,
                "CAPS LOCK" => 0x14,
                "ÉCHAP" => 0x1B,
                "ESC" => 0x1B,
                "ESPACE" => 0x20,
                "SPACE" => 0x20,
                "PAGE UP" => 0x21,
                "PAGE DOWN" => 0x22,
                "END" => 0x23,
                "HOME" => 0x24,
                "FLÈCHE GAUCHE" => 0x25,
                "FLÈCHE HAUT" => 0x26,
                "FLÈCHE DROITE" => 0x27,
                "FLÈCHE BAS" => 0x28,
                "PRINT SCREEN" => 0x2C,
                "INSERT" => 0x2D,
                "DELETE" => 0x2E,
                "SUPPR" => 0x2E,
                "0" => 0x30, "1" => 0x31, "2" => 0x32, "3" => 0x33, "4" => 0x34,
                "5" => 0x35, "6" => 0x36, "7" => 0x37, "8" => 0x38, "9" => 0x39,
                "A" => 0x41, "B" => 0x42, "C" => 0x43, "D" => 0x44, "E" => 0x45,
                "F" => 0x46, "G" => 0x47, "H" => 0x48, "I" => 0x49, "J" => 0x4A,
                "K" => 0x4B, "L" => 0x4C, "M" => 0x4D, "N" => 0x4E, "O" => 0x4F,
                "P" => 0x50, "Q" => 0x51, "R" => 0x52, "S" => 0x53, "T" => 0x54,
                "U" => 0x55, "V" => 0x56, "W" => 0x57, "X" => 0x58, "Y" => 0x59, "Z" => 0x5A,
                "WINDOWS GAUCHE" => 0x5B,
                "WINDOWS DROIT" => 0x5C,
                "MENU" => 0x5D,
                "PAVÉ NUMÉRIQUE 0" => 0x60,
                "PAVÉ NUMÉRIQUE 1" => 0x61,
                "PAVÉ NUMÉRIQUE 2" => 0x62,
                "PAVÉ NUMÉRIQUE 3" => 0x63,
                "PAVÉ NUMÉRIQUE 4" => 0x64,
                "PAVÉ NUMÉRIQUE 5" => 0x65,
                "PAVÉ NUMÉRIQUE 6" => 0x66,
                "PAVÉ NUMÉRIQUE 7" => 0x67,
                "PAVÉ NUMÉRIQUE 8" => 0x68,
                "PAVÉ NUMÉRIQUE 9" => 0x69,
                "PAVÉ NUMÉRIQUE *" => 0x6A,
                "PAVÉ NUMÉRIQUE +" => 0x6B,
                "PAVÉ NUMÉRIQUE ENTRÉE" => 0x6C,
                "PAVÉ NUMÉRIQUE -" => 0x6D,
                "PAVÉ NUMÉRIQUE ." => 0x6E,
                "PAVÉ NUMÉRIQUE /" => 0x6F,
                "F1" => 0x70, "F2" => 0x71, "F3" => 0x72, "F4" => 0x73,
                "F5" => 0x74, "F6" => 0x75, "F7" => 0x76, "F8" => 0x77,
                "F9" => 0x78, "F10" => 0x79, "F11" => 0x7A, "F12" => 0x7B,
                "NUM LOCK" => 0x90,
                "SCROLL LOCK" => 0x91,
                "SHIFT GAUCHE" => 0xA0,
                "SHIFT DROIT" => 0xA1,
                "CTRL GAUCHE" => 0xA2,
                "CTRL DROIT" => 0xA3,
                "ALT GAUCHE" => 0xA4,
                "ALT DROIT" => 0xA5,
                ";" => 0xBA,
                "=" => 0xBB,
                "," => 0xBC,
                "-" => 0xBD,
                "." => 0xBE,
                "/" => 0xBF,
                "Ù" => 0xC0,
                "ù" => 0xC0,
                "[" => 0xDB,
                "\\" => 0xDC,
                "]" => 0xDD,
                "^" => 0xDE,
                ")" => 0x30, // Shift + 0
                "$" => 0x34, // Shift + 4
                "*" => 0x38, // Shift + 8 (ou pavé numérique *)
                ":" => 0xBA, // Shift + ; (même code que ;)
                "!" => 0x31, // Shift + 1
                _ => 0
            };
        }

        private int ExtractDurationFromText(string text)
        {
            // Extraire le nombre du texte (ex: "100ms" -> 100, "100" -> 100)
            if (string.IsNullOrWhiteSpace(text))
                return -1;
                
            text = text.Trim().ToLower();
            if (text.EndsWith("ms"))
            {
                text = text.Substring(0, text.Length - 2).Trim();
            }
            
            if (int.TryParse(text, out int duration) && duration >= 0)
            {
                return duration;
            }
            return -1; // Retourner -1 pour indiquer une erreur
        }

        private void ActionsDataGrid_LoadingRow(object sender, DataGridRowEventArgs e)
        {
            if (e.Row.Item is IInputAction action && action.Type == InputActionType.Condition)
            {
                // Style pour les conditions If
                e.Row.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(232, 245, 233)); // #E8F5E9
                e.Row.BorderBrush = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(76, 175, 80)); // #4CAF50
                e.Row.BorderThickness = new Thickness(0, 0, 0, 2);
                e.Row.FontWeight = FontWeights.SemiBold;
                e.Row.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(46, 125, 50)); // #2E7D32
            }
        }

        private void ActionsDataGrid_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (ActionsDataGrid.SelectedItem == null)
                return;

            // Supprimer avec la touche SUPPR
            if (e.Key == Key.Delete && ActionsDataGrid.SelectedItem is IInputAction action)
            {
                e.Handled = true;
                
                if (_currentMacro != null)
                {
                    if (!_isUndoRedo)
                        SaveState();

                    _currentMacro.Actions.Remove(action);
                    ActionsDataGrid.Items.Refresh();
                    OnMacroModified();
                    UpdateUndoRedoButtons();
                }
            }
        }

        // Note: La gestion des applications cibles est maintenant dans MainWindow (panneau Propriétés)
        #region Gestion des Applications Cibles - Désactivé
        #endregion
        
        #region Repeat Options
        
        private void UpdateRepeatOptionsDisplay()
        {
            if (_currentMacro == null) return;
            
            // Sélectionner le mode de répétition
            switch (_currentMacro.RepeatMode)
            {
                case RepeatMode.Once:
                    RepeatModeComboBox.SelectedIndex = 0;
                    RepeatCountPanel.Visibility = Visibility.Collapsed;
                    DelayPanel.Visibility = Visibility.Collapsed;
                    RepeatInfoText.Visibility = Visibility.Collapsed;
                    break;
                case RepeatMode.RepeatCount:
                    RepeatModeComboBox.SelectedIndex = 1;
                    RepeatCountPanel.Visibility = Visibility.Visible;
                    DelayPanel.Visibility = Visibility.Visible;
                    RepeatInfoText.Visibility = Visibility.Collapsed;
                    RepeatCountTextBox.Text = _currentMacro.RepeatCount.ToString();
                    DelayBetweenTextBox.Text = _currentMacro.DelayBetweenRepeats.ToString();
                    break;
                case RepeatMode.UntilStopped:
                    RepeatModeComboBox.SelectedIndex = 2;
                    RepeatCountPanel.Visibility = Visibility.Collapsed;
                    DelayPanel.Visibility = Visibility.Visible;
                    RepeatInfoText.Visibility = Visibility.Visible;
                    DelayBetweenTextBox.Text = _currentMacro.DelayBetweenRepeats.ToString();
                    break;
            }
        }
        
        private void ResetRepeatOptions()
        {
            RepeatModeComboBox.SelectedIndex = 0;
            RepeatCountPanel.Visibility = Visibility.Collapsed;
            DelayPanel.Visibility = Visibility.Collapsed;
            RepeatInfoText.Visibility = Visibility.Collapsed;
            RepeatCountTextBox.Text = "1";
            DelayBetweenTextBox.Text = "0";
        }
        
        private void RepeatModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_currentMacro == null || RepeatModeComboBox.SelectedItem == null) return;
            
            var selectedItem = RepeatModeComboBox.SelectedItem as ComboBoxItem;
            var tag = selectedItem?.Tag?.ToString();
            
            switch (tag)
            {
                case "Once":
                    _currentMacro.RepeatMode = RepeatMode.Once;
                    _currentMacro.RepeatCount = 1;
                    RepeatCountPanel.Visibility = Visibility.Collapsed;
                    DelayPanel.Visibility = Visibility.Collapsed;
                    RepeatInfoText.Visibility = Visibility.Collapsed;
                    break;
                case "RepeatCount":
                    _currentMacro.RepeatMode = RepeatMode.RepeatCount;
                    RepeatCountPanel.Visibility = Visibility.Visible;
                    DelayPanel.Visibility = Visibility.Visible;
                    RepeatInfoText.Visibility = Visibility.Collapsed;
                    if (int.TryParse(RepeatCountTextBox.Text, out int count) && count > 0)
                        _currentMacro.RepeatCount = count;
                    else
                        _currentMacro.RepeatCount = 2;
                    RepeatCountTextBox.Text = _currentMacro.RepeatCount.ToString();
                    break;
                case "UntilStopped":
                    _currentMacro.RepeatMode = RepeatMode.UntilStopped;
                    _currentMacro.RepeatCount = 0; // 0 = infini
                    RepeatCountPanel.Visibility = Visibility.Collapsed;
                    DelayPanel.Visibility = Visibility.Visible;
                    RepeatInfoText.Visibility = Visibility.Visible;
                    break;
            }
            
            OnMacroModified();
        }
        
        private void RepeatCountTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_currentMacro == null) return;
            
            if (int.TryParse(RepeatCountTextBox.Text, out int count) && count > 0)
            {
                _currentMacro.RepeatCount = count;
                OnMacroModified();
            }
        }
        
        private void DelayBetweenTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_currentMacro == null) return;
            
            if (int.TryParse(DelayBetweenTextBox.Text, out int delay) && delay >= 0)
            {
                _currentMacro.DelayBetweenRepeats = delay;
                OnMacroModified();
            }
        }
        
        #endregion
    }
}

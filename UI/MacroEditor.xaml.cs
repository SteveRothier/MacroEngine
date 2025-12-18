using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;

namespace MacroEngine.UI
{
    public partial class MacroEditor : UserControl
    {
        private Macro _currentMacro;
        private Stack<List<IInputAction>> _undoStack = new Stack<List<IInputAction>>();
        private Stack<List<IInputAction>> _redoStack = new Stack<List<IInputAction>>();
        private bool _isUndoRedo = false;

        public event EventHandler MacroModified;

        public MacroEditor()
        {
            InitializeComponent();
            MacroNameTextBox.TextChanged += MacroNameTextBox_TextChanged;
            MacroDescriptionTextBox.TextChanged += MacroDescriptionTextBox_TextChanged;
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
                ActionsDataGrid.ItemsSource = null;
                _undoStack.Clear();
                _redoStack.Clear();
                UpdateUndoRedoButtons();
            }
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
                0x41 => "Touche A",
                0x42 => "Touche B",
                0x43 => "Touche C",
                0x44 => "Touche D",
                0x45 => "Touche E",
                0x46 => "Touche F",
                0x47 => "Touche G",
                0x48 => "Touche H",
                0x49 => "Touche I",
                0x4A => "Touche J",
                0x4B => "Touche K",
                0x4C => "Touche L",
                0x4D => "Touche M",
                0x4E => "Touche N",
                0x4F => "Touche O",
                0x50 => "Touche P",
                0x51 => "Touche Q",
                0x52 => "Touche R",
                0x53 => "Touche S",
                0x54 => "Touche T",
                0x55 => "Touche U",
                0x56 => "Touche V",
                0x57 => "Touche W",
                0x58 => "Touche X",
                0x59 => "Touche Y",
                0x5A => "Touche Z",
                0x20 => "Espace",
                0x0D => "Entrée",
                0x08 => "Retour arrière",
                0x09 => "Tabulation",
                0x1B => "Échap",
                _ => $"Touche 0x{vkCode:X2}"
            };
        }


        private void AddDelayAction_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            if (!_isUndoRedo)
                SaveState();

            var action = new DelayAction
            {
                Name = "Délai",
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
    }
}


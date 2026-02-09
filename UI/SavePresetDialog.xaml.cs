using System;
using System.Windows;
using System.Windows.Controls;
using MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    public partial class SavePresetDialog : Window
    {
        public string? PresetName { get; private set; }
        public string? PresetDescription { get; private set; }
        public string? PresetCategory { get; private set; }

        private readonly IInputAction _action;

        public SavePresetDialog(IInputAction action)
        {
            InitializeComponent();
            _action = action;

            // Pré-remplir le nom avec un nom suggéré basé sur le type d'action
            PresetNameTextBox.Text = GetSuggestedName(action);
            PresetNameTextBox.SelectAll();
            PresetNameTextBox.Focus();

            // Pré-sélectionner la catégorie basée sur le type d'action
            CategoryComboBox.Text = GetSuggestedCategory(action);
        }

        private void Window_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key != System.Windows.Input.Key.Escape)
                return;
            if (System.Windows.Input.Keyboard.FocusedElement is not TextBox)
                return;
            Focus();
            e.Handled = true;
        }

        private string GetSuggestedName(IInputAction action)
        {
            return action switch
            {
                KeyboardAction ka => $"Touche {GetKeyName(ka.VirtualKeyCode)}",
                MouseAction ma => $"Clic {ma.ActionType}",
                DelayAction da => $"Délai {da.Duration}ms",
                TextAction ta => $"Texte: {(ta.Text?.Length > 20 ? ta.Text.Substring(0, 20) + "..." : ta.Text)}",
                IfAction => "Condition If/Then/Else",
                RepeatAction => "Répéter",
                VariableAction va => $"Variable {va.VariableName}",
                _ => "Action personnalisée"
            };
        }

        private string GetSuggestedCategory(IInputAction action)
        {
            return action switch
            {
                KeyboardAction => "Clavier",
                MouseAction => "Souris",
                DelayAction => "Délais",
                TextAction => "Texte",
                IfAction => "Conditions",
                RepeatAction => "Boucles",
                VariableAction => "Variables",
                _ => "Général"
            };
        }

        private string GetKeyName(int virtualKeyCode)
        {
            // Mapping simple pour les touches les plus courantes
            return virtualKeyCode switch
            {
                0x20 => "Espace",
                0x0D => "Entrée",
                0x1B => "Échap",
                0x09 => "Tab",
                0x08 => "Retour",
                0x10 => "Shift",
                0x11 => "Ctrl",
                0x12 => "Alt",
                >= 0x41 and <= 0x5A => ((char)virtualKeyCode).ToString(),
                >= 0x30 and <= 0x39 => ((char)virtualKeyCode).ToString(),
                _ => $"0x{virtualKeyCode:X2}"
            };
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            var name = PresetNameTextBox.Text?.Trim();
            
            if (string.IsNullOrWhiteSpace(name))
            {
                MessageBox.Show("Veuillez entrer un nom pour le preset.", 
                    "Nom requis", MessageBoxButton.OK, MessageBoxImage.Warning);
                PresetNameTextBox.Focus();
                return;
            }

            PresetName = name;
            PresetDescription = DescriptionTextBox.Text?.Trim();
            PresetCategory = CategoryComboBox.Text?.Trim();
            
            if (string.IsNullOrWhiteSpace(PresetCategory))
            {
                PresetCategory = "Général";
            }

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

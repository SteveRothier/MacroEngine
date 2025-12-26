using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MacroEngine.Core.Models;

namespace MacroEngine.UI
{
    public partial class MacroSelectionDialog : Window
    {
        public List<Macro> SelectedMacros { get; private set; }
        private readonly List<Macro> _availableMacros;
        private readonly List<string> _excludedMacroIds;

        public MacroSelectionDialog(List<Macro> availableMacros, List<string> excludedMacroIds)
        {
            InitializeComponent();
            _availableMacros = availableMacros ?? new List<Macro>();
            _excludedMacroIds = excludedMacroIds ?? new List<string>();
            SelectedMacros = new List<Macro>();

            // Filtrer les macros disponibles (exclure celles déjà dans le profil)
            var available = _availableMacros
                .Where(m => !_excludedMacroIds.Contains(m.Id))
                .ToList();
            
            MacrosListBox.ItemsSource = available;
            MacrosListBox.SelectionMode = SelectionMode.Multiple;
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            SelectedMacros = MacrosListBox.SelectedItems.Cast<Macro>().ToList();
            DialogResult = true;
            Close();
        }

        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}


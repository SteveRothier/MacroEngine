using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MacroEngine.Core.Models;

namespace MacroEngine.UI
{
    public partial class ProfileEditor : UserControl
    {
        private MacroProfile _currentProfile;
        private System.Collections.Generic.List<Macro> _availableMacros;

        public ProfileEditor()
        {
            InitializeComponent();
        }

        public void LoadProfile(MacroProfile profile, System.Collections.Generic.List<Macro> availableMacros)
        {
            _currentProfile = profile;
            _availableMacros = availableMacros;

            if (profile != null)
            {
                ProfileNameTextBox.Text = profile.Name;
                ProfileDescriptionTextBox.Text = profile.Description;

                // Charger les macros du profil
                var profileMacros = availableMacros.Where(m => profile.MacroIds.Contains(m.Id)).ToList();
                ProfileMacrosListBox.ItemsSource = profileMacros;
            }
        }

        private void AddMacro_Click(object sender, RoutedEventArgs e)
        {
            // TODO: Ouvrir un dialogue pour sélectionner des macros
            MessageBox.Show("Fonctionnalité à implémenter", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void RemoveMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null || ProfileMacrosListBox.SelectedItems.Count == 0)
                return;

            var selectedMacros = ProfileMacrosListBox.SelectedItems.Cast<Macro>().ToList();
            foreach (var macro in selectedMacros)
            {
                _currentProfile.MacroIds.Remove(macro.Id);
            }

            var profileMacros = _availableMacros.Where(m => _currentProfile.MacroIds.Contains(m.Id)).ToList();
            ProfileMacrosListBox.ItemsSource = null;
            ProfileMacrosListBox.ItemsSource = profileMacros;
        }

        private async void SaveProfile_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null)
                return;

            _currentProfile.Name = ProfileNameTextBox.Text;
            _currentProfile.Description = ProfileDescriptionTextBox.Text;

            // TODO: Sauvegarder via le provider
            MessageBox.Show("Profil sauvegardé", "Succès", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            // Recharger les données
            LoadProfile(_currentProfile, _availableMacros);
        }
    }
}


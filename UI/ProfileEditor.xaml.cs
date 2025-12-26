using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;

namespace MacroEngine.UI
{
    public partial class ProfileEditor : UserControl
    {
        private MacroProfile? _currentProfile;
        private List<Macro>? _availableMacros;
        private IProfileProvider? _profileProvider;

        public event EventHandler? ProfileSaved;

        public ProfileEditor()
        {
            InitializeComponent();
        }

        public void SetProfileProvider(IProfileProvider provider)
        {
            _profileProvider = provider;
        }

        public void LoadProfile(MacroProfile profile, List<Macro> availableMacros, IProfileProvider? profileProvider = null)
        {
            _currentProfile = profile;
            _availableMacros = availableMacros;
            
            if (profileProvider != null)
            {
                _profileProvider = profileProvider;
            }

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
            if (_currentProfile == null || _availableMacros == null)
                return;

            // Créer et afficher le dialogue de sélection
            var dialog = new MacroSelectionDialog(
                _availableMacros, 
                _currentProfile.MacroIds // Macros à exclure
            );
            dialog.Owner = Window.GetWindow(this);

            if (dialog.ShowDialog() == true && dialog.SelectedMacros.Count > 0)
            {
                // Ajouter les IDs des macros sélectionnées au profil
                foreach (var macro in dialog.SelectedMacros)
                {
                    if (!_currentProfile.MacroIds.Contains(macro.Id))
                    {
                        _currentProfile.MacroIds.Add(macro.Id);
                    }
                }

                // Recharger la liste affichée
                if (_availableMacros != null && _currentProfile != null)
                {
                    var profileMacros = _availableMacros
                        .Where(m => _currentProfile.MacroIds.Contains(m.Id))
                        .ToList();
                    ProfileMacrosListBox.ItemsSource = null;
                    ProfileMacrosListBox.ItemsSource = profileMacros;
                }
            }
        }

        private void RemoveMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null || ProfileMacrosListBox.SelectedItems.Count == 0)
                return;

            var selectedMacros = ProfileMacrosListBox.SelectedItems.Cast<Macro>().ToList();
            foreach (var macro in selectedMacros)
            {
                _currentProfile?.MacroIds.Remove(macro.Id);
            }

            if (_availableMacros != null && _currentProfile != null)
            {
                var profileMacros = _availableMacros.Where(m => _currentProfile.MacroIds.Contains(m.Id)).ToList();
                ProfileMacrosListBox.ItemsSource = null;
                ProfileMacrosListBox.ItemsSource = profileMacros;
            }
            else
            {
                ProfileMacrosListBox.ItemsSource = null;
            }
        }

        private async void SaveProfile_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null)
                return;

            if (_profileProvider == null)
            {
                MessageBox.Show("Erreur: Provider de profils non initialisé.", 
                               "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Valider les données
            if (string.IsNullOrWhiteSpace(ProfileNameTextBox.Text))
            {
                MessageBox.Show("Le nom du profil ne peut pas être vide.", 
                               "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
                ProfileNameTextBox.Focus();
                return;
            }

            // Mettre à jour le profil
            _currentProfile.Name = ProfileNameTextBox.Text.Trim();
            _currentProfile.Description = ProfileDescriptionTextBox.Text.Trim();
            _currentProfile.ModifiedAt = DateTime.Now;

            // Sauvegarder via le provider
            try
            {
                bool success = await _profileProvider.SaveProfileAsync(_currentProfile);

                if (success)
                {
                    MessageBox.Show("Profil sauvegardé avec succès.", 
                                   "Succès", MessageBoxButton.OK, MessageBoxImage.Information);
                    
                    // Notifier que le profil a été sauvegardé
                    ProfileSaved?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    MessageBox.Show("Erreur lors de la sauvegarde du profil.", 
                                   "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors de la sauvegarde: {ex.Message}", 
                               "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            // Recharger les données
            if (_currentProfile != null && _availableMacros != null)
            {
                LoadProfile(_currentProfile, _availableMacros);
            }
        }
    }
}


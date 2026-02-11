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
        private List<Macro>? _profileMacrosFull;
        private IProfileProvider? _profileProvider;

        public event EventHandler? ProfileSaved;
        public event EventHandler? ProfileCancelled;

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
                ProfileNameErrorText.Visibility = Visibility.Collapsed;
                MacroSearchTextBox.Text = "";

                var profileMacros = availableMacros.Where(m => profile.MacroIds.Contains(m.Id)).ToList();
                _profileMacrosFull = profileMacros;
                ApplyMacroSearchFilter();
            }
        }

        private void MacroSearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            MacroSearchPlaceholder.Visibility = string.IsNullOrWhiteSpace(MacroSearchTextBox?.Text)
                ? Visibility.Visible : Visibility.Collapsed;
            ApplyMacroSearchFilter();
        }

        private void ApplyMacroSearchFilter()
        {
            if (_profileMacrosFull == null)
                return;
            var query = (MacroSearchTextBox?.Text ?? "").Trim();
            if (string.IsNullOrEmpty(query))
            {
                ProfileMacrosListBox.ItemsSource = null;
                ProfileMacrosListBox.ItemsSource = _profileMacrosFull;
                return;
            }
            var q = query.ToLowerInvariant();
            var filtered = _profileMacrosFull
                .Where(m => (m.Name?.ToLowerInvariant().Contains(q) == true) ||
                           (m.Description?.ToLowerInvariant().Contains(q) == true))
                .ToList();
            ProfileMacrosListBox.ItemsSource = null;
            ProfileMacrosListBox.ItemsSource = filtered;
        }

        private void AddMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null || _availableMacros == null)
                return;

            // Afficher toutes les macros (de tous les profils) ; les doublons sont ignorés à l'ajout
            var dialog = new MacroSelectionDialog(
                _availableMacros,
                new List<string>() // Ne pas exclure : montrer toutes les macros
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
                _profileMacrosFull = _availableMacros.Where(m => _currentProfile.MacroIds.Contains(m.Id)).ToList();
                ApplyMacroSearchFilter();
            }
            else
            {
                _profileMacrosFull = null;
                ProfileMacrosListBox.ItemsSource = null;
            }
        }

        private async void SaveProfile_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile == null)
                return;

            ProfileNameErrorText.Visibility = Visibility.Collapsed;

            if (_profileProvider == null)
                return;

            if (string.IsNullOrWhiteSpace(ProfileNameTextBox.Text))
            {
                ProfileNameErrorText.Text = "Le nom ne peut pas être vide.";
                ProfileNameErrorText.Visibility = Visibility.Visible;
                ProfileNameTextBox.Focus();
                return;
            }

            _currentProfile.Name = ProfileNameTextBox.Text.Trim();
            _currentProfile.ModifiedAt = DateTime.Now;

            try
            {
                bool success = await _profileProvider.SaveProfileAsync(_currentProfile);
                if (success)
                    ProfileSaved?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception ex)
            {
                ProfileNameErrorText.Text = ex.Message;
                ProfileNameErrorText.Visibility = Visibility.Visible;
            }
        }

        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            if (_currentProfile != null && _availableMacros != null)
                LoadProfile(_currentProfile, _availableMacros);
            ProfileCancelled?.Invoke(this, EventArgs.Empty);
        }
    }
}


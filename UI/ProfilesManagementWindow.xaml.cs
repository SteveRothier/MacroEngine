using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Shell;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;

namespace MacroEngine.UI
{
    public partial class ProfilesManagementWindow : Window
    {
        private readonly IProfileProvider _profileProvider;
        private readonly List<Macro> _macros;
        private MacroProfile? _newProfileBeingEdited;

        public ProfilesManagementWindow(IProfileProvider profileProvider, List<Macro> macros)
        {
            InitializeComponent();
            _profileProvider = profileProvider ?? throw new ArgumentNullException(nameof(profileProvider));
            _macros = macros ?? new List<Macro>();

            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);

            Loaded += async (s, e) => await RefreshProfilesListAsync();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                else
                    DragMove();
            }
        }

        private void MinimizeButton_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

        private void MaximizeButton_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

        private async System.Threading.Tasks.Task RefreshProfilesListAsync()
        {
            StatusText.Visibility = Visibility.Collapsed;
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                // Profil en cours (actif) en premier dans la liste
                var ordered = profiles.OrderByDescending(p => p.IsActive).ToList();
                ProfilesListBox.ItemsSource = null;
                ProfilesListBox.ItemsSource = ordered;
            }
            catch (Exception ex)
            {
                StatusText.Text = "Erreur : " + ex.Message;
                StatusText.Visibility = Visibility.Visible;
            }
        }

        private void ShowEditor(MacroProfile profile)
        {
            _newProfileBeingEdited = null;
            EditorContent.Content = null;
            var editor = new ProfileEditor();
            editor.SetProfileProvider(_profileProvider);
            editor.LoadProfile(profile, _macros, _profileProvider);
            editor.ProfileSaved += async (s, args) =>
            {
                await RefreshProfilesListAsync();
            };
            editor.ProfileCancelled += (s, args) =>
            {
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
                ProfilesListBox.SelectedItem = null;
            };
            EditorContent.Content = editor;
            PlaceholderText.Visibility = Visibility.Collapsed;
        }

        private void HideEditor()
        {
            EditorContent.Content = null;
            PlaceholderText.Visibility = Visibility.Visible;
        }

        private async void ProfilesListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            bool hasSelection = ProfilesListBox.SelectedItem is MacroProfile;
            ActivateProfileButton.IsEnabled = hasSelection;
            DeleteProfileButton.IsEnabled = hasSelection;

            if (_newProfileBeingEdited != null)
                return;

            if (ProfilesListBox.SelectedItem is MacroProfile profile)
            {
                try
                {
                    var profiles = await _profileProvider.LoadProfilesAsync();
                    var fresh = profiles.FirstOrDefault(p => p.Id == profile.Id);
                    ShowEditor(fresh ?? profile);
                }
                catch (Exception ex)
                {
                    StatusText.Text = "Erreur : " + ex.Message;
                    StatusText.Visibility = Visibility.Visible;
                    ShowEditor(profile);
                }
            }
            else
            {
                HideEditor();
            }
        }

        private void ProfilesListBox_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (ProfilesListBox.SelectedItem is MacroProfile)
                ShowEditor((MacroProfile)ProfilesListBox.SelectedItem);
        }

        private void NewProfileButton_Click(object sender, RoutedEventArgs e)
        {
            var newProfile = new MacroProfile
            {
                Id = Guid.NewGuid().ToString(),
                Name = "Nouveau profil",
                Description = "",
                MacroIds = new List<string>(),
                CreatedAt = DateTime.Now,
                ModifiedAt = DateTime.Now
            };
            _newProfileBeingEdited = newProfile;
            var editor = new ProfileEditor();
            editor.SetProfileProvider(_profileProvider);
            editor.LoadProfile(newProfile, _macros, _profileProvider);
            editor.ProfileSaved += async (s, args) =>
            {
                _newProfileBeingEdited = null;
                await RefreshProfilesListAsync();
            };
            editor.ProfileCancelled += (s, args) =>
            {
                _newProfileBeingEdited = null;
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
            };
            EditorContent.Content = editor;
            PlaceholderText.Visibility = Visibility.Collapsed;
        }

        private async void DeleteProfileButton_Click(object sender, RoutedEventArgs e)
        {
            if (ProfilesListBox.SelectedItem is not MacroProfile profile)
                return;
            if (MessageBox.Show($"Supprimer le profil « {profile.Name} » ?", "Confirmation", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
                return;
            try
            {
                await _profileProvider.DeleteProfileAsync(profile.Id);
                HideEditor();
                StatusText.Visibility = Visibility.Collapsed;
                await RefreshProfilesListAsync();
            }
            catch (Exception ex)
            {
                StatusText.Text = "Erreur : " + ex.Message;
                StatusText.Visibility = Visibility.Visible;
            }
        }

        private async void ActivateProfileButton_Click(object sender, RoutedEventArgs e)
        {
            if (ProfilesListBox.SelectedItem is not MacroProfile profile)
                return;
            try
            {
                await _profileProvider.ActivateProfileAsync(profile.Id);
                StatusText.Visibility = Visibility.Collapsed;
                await RefreshProfilesListAsync();
            }
            catch (Exception ex)
            {
                StatusText.Text = "Erreur : " + ex.Message;
                StatusText.Visibility = Visibility.Visible;
            }
        }
    }
}

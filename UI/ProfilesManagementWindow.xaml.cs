using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;

namespace MacroEngine.UI
{
    public partial class ProfilesManagementWindow : Window
    {
        private readonly IProfileProvider _profileProvider;
        private readonly List<Macro> _macros;
        private List<MacroProfile> _profiles = new List<MacroProfile>();

        public ProfilesManagementWindow(IProfileProvider profileProvider, List<Macro> macros)
        {
            InitializeComponent();
            _profileProvider = profileProvider ?? throw new ArgumentNullException(nameof(profileProvider));
            _macros = macros ?? new List<Macro>();
            Loaded += ProfilesManagementWindow_Loaded;
        }

        private async void ProfilesManagementWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await RefreshProfilesAsync();
        }

        private async Task RefreshProfilesAsync()
        {
            try
            {
                _profiles = await _profileProvider.LoadProfilesAsync() ?? new List<MacroProfile>();
                ProfilesListBox.ItemsSource = null;
                ProfilesListBox.ItemsSource = _profiles;
                UpdateButtonsState();
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Visibility = Visibility.Visible;
            }
        }

        private void UpdateButtonsState()
        {
            var selected = ProfilesListBox?.SelectedItem as MacroProfile;
            ActivateProfileButton.IsEnabled = selected != null;
            DeleteProfileButton.IsEnabled = selected != null;
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

        private void MinimizeButton_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void MaximizeButton_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            UpdateMaximizeButtonContent();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void UpdateMaximizeButtonContent()
        {
            if (MaximizeButton != null)
                MaximizeButton.Content = LucideIcons.CreateIcon(WindowState == WindowState.Maximized ? LucideIcons.Square : LucideIcons.Maximize, 14);
        }

        protected override void OnStateChanged(EventArgs e)
        {
            base.OnStateChanged(e);
            UpdateMaximizeButtonContent();
        }

        private void NewProfileButton_Click(object sender, RoutedEventArgs e)
        {
            var newProfile = new MacroProfile
            {
                Id = Guid.NewGuid().ToString(),
                Name = "Nouveau Profil",
                Description = "",
                MacroIds = new List<string>(),
                CreatedAt = DateTime.Now,
                ModifiedAt = DateTime.Now
            };
            var editor = new ProfileEditor();
            editor.SetProfileProvider(_profileProvider);
            editor.LoadProfile(newProfile, _macros, _profileProvider);
            editor.ProfileSaved += async (s, args) =>
            {
                await RefreshProfilesAsync();
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
            };
            editor.ProfileCancelled += (s, args) =>
            {
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
            };
            EditorContent.Content = editor;
            PlaceholderText.Visibility = Visibility.Collapsed;
            StatusText.Visibility = Visibility.Collapsed;
        }

        private void ProfilesListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            UpdateButtonsState();
            var selected = ProfilesListBox?.SelectedItem as MacroProfile;
            if (selected == null)
            {
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
                return;
            }
            var editor = new ProfileEditor();
            editor.SetProfileProvider(_profileProvider);
            editor.LoadProfile(selected, _macros, _profileProvider);
            editor.ProfileSaved += async (s, args) =>
            {
                await RefreshProfilesAsync();
            };
            EditorContent.Content = editor;
            PlaceholderText.Visibility = Visibility.Collapsed;
            StatusText.Visibility = Visibility.Collapsed;
        }

        private void ProfilesListBox_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            // La sélection affiche déjà l'éditeur
        }

        private async void ActivateProfileButton_Click(object sender, RoutedEventArgs e)
        {
            var selected = ProfilesListBox?.SelectedItem as MacroProfile;
            if (selected == null) return;
            try
            {
                StatusText.Visibility = Visibility.Collapsed;
                await _profileProvider.ActivateProfileAsync(selected.Id);
                await RefreshProfilesAsync();
                StatusText.Text = $"Profil « {selected.Name} » activé.";
                StatusText.Foreground = (Brush)FindResource("SuccessBrush");
                StatusText.Visibility = Visibility.Visible;
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = (Brush)FindResource("ErrorBrush");
                StatusText.Visibility = Visibility.Visible;
            }
        }

        private async void DeleteProfileButton_Click(object sender, RoutedEventArgs e)
        {
            var selected = ProfilesListBox?.SelectedItem as MacroProfile;
            if (selected == null) return;
            var dialog = new ConfirmDeleteProfileDialog(selected.Name)
            {
                Owner = this
            };
            if (dialog.ShowDialog() != true) return;
            try
            {
                StatusText.Visibility = Visibility.Collapsed;
                await _profileProvider.DeleteProfileAsync(selected.Id);
                await RefreshProfilesAsync();
                EditorContent.Content = null;
                PlaceholderText.Visibility = Visibility.Visible;
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = (Brush)FindResource("ErrorBrush");
                StatusText.Visibility = Visibility.Visible;
            }
        }
    }
}

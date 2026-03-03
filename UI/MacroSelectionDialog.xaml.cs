using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Shell;
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

            var available = _availableMacros
                .Where(m => !_excludedMacroIds.Contains(m.Id))
                .ToList();
            MacrosListBox.ItemsSource = available;
            MacrosListBox.SelectionMode = SelectionMode.Multiple;

            var chrome = new WindowChrome
            {
                CaptionHeight = 40,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);
            Loaded += (s, _) => UpdateMaximizeButtonContent();
        }

        private void UpdateMaximizeButtonContent()
        {
            if (MaximizeButton != null)
                MaximizeButton.Content = LucideIcons.CreateIcon(WindowState == WindowState.Maximized ? LucideIcons.Restore : LucideIcons.Maximize, 14);
        }

        protected override void OnStateChanged(EventArgs e)
        {
            base.OnStateChanged(e);
            UpdateMaximizeButtonContent();
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
            UpdateMaximizeButtonContent();
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
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


using System;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    public partial class ImageOnScreenPopoverWindow : Window
    {
        private readonly ImageOnScreenCondition _target;
        private readonly ImageOnScreenCondition _temp;
        private readonly double _contentScreenX;
        private readonly double _contentScreenY;
        private bool _isClosing;
        private DateTime _loadedAt;

        public ImageOnScreenPopoverWindow(ImageOnScreenCondition config, double contentScreenX = double.NaN, double contentScreenY = double.NaN)
        {
            _target = config ?? new ImageOnScreenCondition();
            _temp = new ImageOnScreenCondition
            {
                ImagePath = _target.ImagePath ?? "",
                Sensitivity = _target.Sensitivity,
                SearchArea = _target.SearchArea?.ToArray()
            };

            _contentScreenX = contentScreenX;
            _contentScreenY = contentScreenY;

            InitializeComponent();
            var textSecondary = TryFindResource("TextSecondaryBrush") as System.Windows.Media.Brush ?? Brushes.White;
            var errorBrush = TryFindResource("ErrorBrush") as System.Windows.Media.Brush ?? Brushes.Red;

            var browseIcon = LucideIcons.CreateIcon(LucideIcons.FolderSearch, 13);
            browseIcon.Foreground = textSecondary;
            browseIcon.HorizontalAlignment = HorizontalAlignment.Center;
            browseIcon.VerticalAlignment = VerticalAlignment.Center;
            BrowseButton.Content = browseIcon;
            BrowseButton.MouseEnter += (s, e) => browseIcon.Foreground = errorBrush;
            BrowseButton.MouseLeave += (s, e) => browseIcon.Foreground = textSecondary;

            var pasteIcon = LucideIcons.CreateIcon(LucideIcons.ClipboardPaste, 13);
            pasteIcon.Foreground = textSecondary;
            pasteIcon.HorizontalAlignment = HorizontalAlignment.Center;
            pasteIcon.VerticalAlignment = VerticalAlignment.Center;
            PasteButton.Content = pasteIcon;
            PasteButton.MouseEnter += (s, e) => pasteIcon.Foreground = errorBrush;
            PasteButton.MouseLeave += (s, e) => pasteIcon.Foreground = textSecondary;

            var vsl = SystemParameters.VirtualScreenLeft;
            var vst = SystemParameters.VirtualScreenTop;
            Left = vsl;
            Top = vst;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;

            SensitivitySlider.Value = Math.Max(0, Math.Min(100, _temp.Sensitivity));
            PathTextBox.Text = _temp.ImagePath ?? "";

            LoadPreview();
            UpdateSensitivityText();
            UpdateZoneUi();
            Loaded += (_, _) =>
            {
                _loadedAt = DateTime.UtcNow;
                double w = RootBorder.ActualWidth > 0 ? RootBorder.ActualWidth : 260;
                double h = RootBorder.ActualHeight > 0 ? RootBorder.ActualHeight : 360;
                double left = double.IsNaN(_contentScreenX) ? (SystemParameters.VirtualScreenWidth - w) / 2 + vsl : _contentScreenX - vsl;
                double top = double.IsNaN(_contentScreenY) ? (SystemParameters.VirtualScreenHeight - h) / 2 + vst : _contentScreenY - vst;

                Canvas.SetLeft(ContentContainer, left);
                Canvas.SetTop(ContentContainer, top);
            };

            PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    CloseAsCancel();
                }
            };
        }

        private void UpdateSensitivityText()
        {
            if (SensitivityValueTextRight != null)
                SensitivityValueTextRight.Text = $"{(int)SensitivitySlider.Value}%";
        }

        private void ClearImageButton_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;
            _temp.ImagePath = "";
            PathTextBox.Text = "";
            LoadPreview(); // rafraichit PreviewImage/PreviewHint
        }

        private void UpdateClearImageButtonVisibility()
        {
            try
            {
                var path = (_temp.ImagePath ?? "").Trim();
                var hasImage = !string.IsNullOrWhiteSpace(path) && File.Exists(path);
                if (ClearImageButton != null)
                    ClearImageButton.Visibility = hasImage ? Visibility.Visible : Visibility.Collapsed;
            }
            catch { }
        }

        private void ClearImageButton_MouseEnter(object sender, MouseEventArgs e)
        {
            try
            {
                if (ClearImageIcon != null)
                    ClearImageIcon.Foreground = TryFindResource("ErrorBrush") as System.Windows.Media.Brush ?? Brushes.Red;
            }
            catch { }
        }

        private void ClearImageButton_MouseLeave(object sender, MouseEventArgs e)
        {
            try
            {
                if (ClearImageIcon != null)
                    ClearImageIcon.Foreground = TryFindResource("TextSecondaryBrush") as System.Windows.Media.Brush ?? Brushes.White;
            }
            catch { }
        }

        private void ZonePickButton_MouseEnter(object sender, System.Windows.Input.MouseEventArgs e)
        {
            try
            {
                if (ZonePickIcon != null)
                    ZonePickIcon.Foreground = TryFindResource("ErrorBrush") as System.Windows.Media.Brush ?? Brushes.Red;
            }
            catch { }
        }

        private void ZonePickButton_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
        {
            try
            {
                if (ZonePickIcon != null)
                    ZonePickIcon.Foreground = TryFindResource("TextSecondaryBrush") as System.Windows.Media.Brush ?? Brushes.White;
            }
            catch { }
        }

        private void UpdateZoneUi()
        {
            int vsw = (int)SystemParameters.VirtualScreenWidth;
            int vsh = (int)SystemParameters.VirtualScreenHeight;

            // Toujours afficher des coordonnées (pas "Tout l'écran")
            bool hasZone = _temp.SearchArea != null && _temp.SearchArea.Length == 4;

            if (hasZone)
            {
                int x1 = _temp.SearchArea[0];
                int y1 = _temp.SearchArea[1];
                int x2 = _temp.SearchArea[2];
                int y2 = _temp.SearchArea[3];
                ZoneInfoText.Text = $"{x1}, {x2} -> {y1}, {y2}";

                ZoneInfoText.IsHitTestVisible = true;
                ZoneInfoText.Cursor = Cursors.Hand;
            }
            else
            {
                ZoneInfoText.Text = "Tout l'écran";
                ZoneInfoText.Cursor = Cursors.Arrow;
                // Permet de voir le texte, mais pas de cliquer pour afficher la visualisation.
                ZoneInfoText.IsHitTestVisible = false;
            }
        }

        private void LoadPreview()
        {
            try
            {
                var path = (_temp.ImagePath ?? "").Trim();
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(path, UriKind.Absolute);
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.EndInit();

                    PreviewImage.Source = bitmap;
                    PreviewImage.Visibility = Visibility.Visible;
                    PreviewHint.Visibility = Visibility.Collapsed;
                }
                else
                {
                    PreviewImage.Source = null;
                    PreviewImage.Visibility = Visibility.Collapsed;
                    PreviewHint.Visibility = Visibility.Visible;
                }
                UpdateClearImageButtonVisibility();
            }
            catch
            {
                PreviewImage.Source = null;
                PreviewImage.Visibility = Visibility.Collapsed;
                PreviewHint.Visibility = Visibility.Visible;
                UpdateClearImageButtonVisibility();
            }
        }

        private void ApplyTempToTargetAndClose()
        {
            if (_isClosing) return;
            _isClosing = true;

            _target.ImagePath = _temp.ImagePath ?? "";
            _target.Sensitivity = _temp.Sensitivity;
            _target.SearchArea = _temp.SearchArea?.ToArray();

            DialogResult = true;
            Close();
        }

        private void CloseAsCancel()
        {
            if (_isClosing) return;
            _isClosing = true;
            DialogResult = false;
            Close();
        }

        private void OverlayGrid_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (_isClosing) return;
            if ((DateTime.UtcNow - _loadedAt).TotalMilliseconds < 250) return;

            var src = e.OriginalSource as DependencyObject;
            while (src != null)
            {
                if (src == RootBorder) return;
                src = VisualTreeHelper.GetParent(src);
            }
            // Pas de bouton OK/Annuler : fermer = appliquer les changements
            ApplyTempToTargetAndClose();
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;
            // Pas de bouton OK : le bouton X applique et ferme
            ApplyTempToTargetAndClose();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;
            CloseAsCancel();
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;
            ApplyTempToTargetAndClose();
        }

        private void PathTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            _temp.ImagePath = PathTextBox.Text ?? "";
            LoadPreview();
        }

        private void PathTextBox_GotKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            try
            {
                // Sélectionne tout pour que l'utilisateur puisse remplacer directement.
                PathTextBox.SelectAll();
                PathTextBox.CaretIndex = PathTextBox.Text?.Length ?? 0;
            }
            catch { }
        }

        private void PasteButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // 1) Coller une image depuis le presse-papier (bitmap)
                if (Clipboard.ContainsImage())
                {
                    var img = Clipboard.GetImage();
                    if (img != null)
                    {
                        var tempPath = SaveClipboardImageToTempPng(img);
                        if (!string.IsNullOrWhiteSpace(tempPath))
                        {
                            PathTextBox.Text = tempPath;
                            _temp.ImagePath = tempPath;
                            LoadPreview();
                        }
                    }
                    return;
                }

                // 2) Coller un chemin texte
                if (Clipboard.ContainsText())
                {
                    var txt = Clipboard.GetText();
                    if (!string.IsNullOrWhiteSpace(txt))
                    {
                        PathTextBox.Text = txt.Trim();
                        _temp.ImagePath = PathTextBox.Text;
                        LoadPreview();
                    }
                }
            }
            catch { }
        }

        private static string? SaveClipboardImageToTempPng(BitmapSource image)
        {
            if (image == null) return null;
            try
            {
                var dir = Path.Combine(Path.GetTempPath(), "MacroEngine");
                Directory.CreateDirectory(dir);
                var filePath = Path.Combine(dir, $"clipboard_image_{Guid.NewGuid():N}.png");

                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(image));
                using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.Read);
                encoder.Save(fs);
                return filePath;
            }
            catch
            {
                return null;
            }
        }

        private void BrowseButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif|Tous les fichiers|*.*",
                    Title = "Sélectionner une image"
                };
                if (dialog.ShowDialog() == true)
                {
                    PathTextBox.Text = dialog.FileName;
                    _temp.ImagePath = dialog.FileName;
                    LoadPreview();
                }
            }
            catch { }
        }

        private void SensitivitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            _temp.Sensitivity = (int)SensitivitySlider.Value;
            UpdateSensitivityText();
        }

        private void ZonePickButton_Click(object sender, RoutedEventArgs e)
        {
            OpenZoneSelector();
        }

        private void ZoneInfoText_MouseEnter(object sender, MouseEventArgs e)
        {
            try
            {
                ZoneInfoText.Foreground = TryFindResource("ErrorBrush") as System.Windows.Media.Brush ?? Brushes.Red;
                ZoneInfoText.TextDecorations = TextDecorations.Underline;
            }
            catch { }
        }

        private void ZoneInfoText_MouseLeave(object sender, MouseEventArgs e)
        {
            try
            {
                ZoneInfoText.Foreground = TryFindResource("TextPrimaryBrush") as System.Windows.Media.Brush ?? Brushes.White;
                ZoneInfoText.TextDecorations = null;
            }
            catch { }
        }

        private void ZoneInfoText_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            e.Handled = true;
            try
            {
                if (_temp.SearchArea == null || _temp.SearchArea.Length != 4)
                {
                    OpenZoneSelector();
                    return;
                }

                var area = _temp.SearchArea;
                var preview = new ZonePreviewWindow(area[0], area[1], area[2], area[3])
                {
                    Owner = Owner ?? this
                };
                preview.ShowDialog();
            }
            catch { }
        }

        private void OpenZoneSelector()
        {
            try
            {
                var owner = Owner ?? this;
                var zoneSelector = new ZoneSelectorWindow { Owner = owner };
                if (zoneSelector.ShowDialog() == true)
                {
                    _temp.SearchArea = new int[]
                    {
                        zoneSelector.X1,
                        zoneSelector.Y1,
                        zoneSelector.X2,
                        zoneSelector.Y2
                    };
                    UpdateZoneUi();
                }
            }
            catch { }
        }

        // Note: on n'a volontairement pas d'autres surcharges pour éviter toute ambiguite XAML.
    }
}


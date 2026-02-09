using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Shell;
using MacroEngine.Core.Models;
using MacroEngine.Core.Hooks;
using MacroEngine.Core.Services;

namespace MacroEngine.UI
{
    public partial class SettingsWindow : Window
    {
        private MacroEngineConfig _config;
        private int _capturedExecuteKeyCode;
        private int _capturedStopKeyCode;
        private bool _isCapturingExecuteKey = false;
        private bool _isCapturingStopKey = false;
        private KeyboardHook _keyboardHook;

        public MacroEngineConfig Config { get; private set; } = new MacroEngineConfig();

        public SettingsWindow(MacroEngineConfig config)
        {
            InitializeComponent();
            _config = config ?? new MacroEngineConfig();

            var chrome = new WindowChrome
            {
                CaptionHeight = 44,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);
            
            // Utiliser les valeurs par défaut si elles sont à 0 (non initialisées)
            _capturedExecuteKeyCode = _config.ExecuteMacroKeyCode != 0 ? _config.ExecuteMacroKeyCode : 0x79; // F10 par défaut
            _capturedStopKeyCode = _config.StopMacroKeyCode != 0 ? _config.StopMacroKeyCode : 0x7A; // F11 par défaut
            
            // Initialiser le hook clavier pour capturer F10 et autres touches système
            _keyboardHook = new KeyboardHook();
            _keyboardHook.KeyDown += KeyboardHook_KeyDown;
            
            UpdateKeyDisplay();
            LoadTesseractInfo();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
            {
                if (e.ClickCount == 2)
                {
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                }
                else
                {
                    DragMove();
                }
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
                MaximizeButton.Content = WindowState == WindowState.Maximized ? "❐" : "□";
        }

        protected override void OnStateChanged(EventArgs e)
        {
            base.OnStateChanged(e);
            UpdateMaximizeButtonContent();
        }

        private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Escape)
                return;
            if (Keyboard.FocusedElement is not System.Windows.Controls.TextBox)
                return;
            Focus();
            e.Handled = true;
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            // Nettoyer le hook
            if (_keyboardHook != null)
            {
                _keyboardHook.KeyDown -= KeyboardHook_KeyDown;
                _keyboardHook.Uninstall();
                _keyboardHook.Dispose();
            }
            base.OnClosing(e);
        }

        private void KeyboardHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Capturer F10 via le hook bas niveau même pendant la capture
            if (_isCapturingExecuteKey && e.VirtualKeyCode == 0x79) // VK_F10
            {
                e.Handled = true;
                Dispatcher.Invoke(() =>
                {
                    _capturedExecuteKeyCode = 0x79;
                    ExecuteKeyTextBox.Text = GetKeyName(0x79);
                    
                    if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedStopKeyCode != 0)
                    {
                        MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                            "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                    
                    ExecuteKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
                });
            }
            else if (_isCapturingStopKey && e.VirtualKeyCode == 0x79) // VK_F10
            {
                e.Handled = true;
                Dispatcher.Invoke(() =>
                {
                    _capturedStopKeyCode = 0x79;
                    StopKeyTextBox.Text = GetKeyName(0x79);
                    
                    if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedExecuteKeyCode != 0)
                    {
                        MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                            "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                    
                    StopKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
                });
            }
        }

        private void UpdateKeyDisplay()
        {
            ExecuteKeyTextBox.Text = GetKeyName(_capturedExecuteKeyCode);
            StopKeyTextBox.Text = GetKeyName(_capturedStopKeyCode);
        }

        private string GetKeyName(int virtualKeyCode)
        {
            // Si le code est 0, retourner une valeur par défaut
            if (virtualKeyCode == 0)
            {
                return "Aucune touche";
            }
            
            // Codes de touches courants
            return virtualKeyCode switch
            {
                0x08 => "Backspace",
                0x09 => "Tab",
                0x0C => "Clear",
                0x0D => "Enter",
                0x10 => "Shift",
                0x11 => "Ctrl",
                0x12 => "Alt",
                0x13 => "Pause",
                0x14 => "Caps Lock",
                0x1B => "Esc",
                0x20 => "Espace",
                0x21 => "Page Up",
                0x22 => "Page Down",
                0x23 => "End",
                0x24 => "Home",
                0x25 => "Flèche Gauche",
                0x26 => "Flèche Haut",
                0x27 => "Flèche Droite",
                0x28 => "Flèche Bas",
                0x2C => "Print Screen",
                0x2D => "Insert",
                0x2E => "Delete",
                0x30 => "0",
                0x31 => "1",
                0x32 => "2",
                0x33 => "3",
                0x34 => "4",
                0x35 => "5",
                0x36 => "6",
                0x37 => "7",
                0x38 => "8",
                0x39 => "9",
                0x41 => "A",
                0x42 => "B",
                0x43 => "C",
                0x44 => "D",
                0x45 => "E",
                0x46 => "F",
                0x47 => "G",
                0x48 => "H",
                0x49 => "I",
                0x4A => "J",
                0x4B => "K",
                0x4C => "L",
                0x4D => "M",
                0x4E => "N",
                0x4F => "O",
                0x50 => "P",
                0x51 => "Q",
                0x52 => "R",
                0x53 => "S",
                0x54 => "T",
                0x55 => "U",
                0x56 => "V",
                0x57 => "W",
                0x58 => "X",
                0x59 => "Y",
                0x5A => "Z",
                0x60 => "Pavé numérique 0",
                0x61 => "Pavé numérique 1",
                0x62 => "Pavé numérique 2",
                0x63 => "Pavé numérique 3",
                0x64 => "Pavé numérique 4",
                0x65 => "Pavé numérique 5",
                0x66 => "Pavé numérique 6",
                0x67 => "Pavé numérique 7",
                0x68 => "Pavé numérique 8",
                0x69 => "Pavé numérique 9",
                0x6A => "Pavé numérique *",
                0x6B => "Pavé numérique +",
                0x6C => "Pavé numérique Entrée",
                0x6D => "Pavé numérique -",
                0x6E => "Pavé numérique .",
                0x6F => "Pavé numérique /",
                0x70 => "F1",
                0x71 => "F2",
                0x72 => "F3",
                0x73 => "F4",
                0x74 => "F5",
                0x75 => "F6",
                0x76 => "F7",
                0x77 => "F8",
                0x78 => "F9",
                0x79 => "F10",
                0x7A => "F11",
                0x7B => "F12",
                0x90 => "Num Lock",
                0x91 => "Scroll Lock",
                0xA0 => "Shift Gauche",
                0xA1 => "Shift Droit",
                0xA2 => "Ctrl Gauche",
                0xA3 => "Ctrl Droit",
                0xA4 => "Alt Gauche",
                0xA5 => "Alt Droit",
                0xBA => ";",      // Point-virgule (AZERTY)
                0xBB => "=",      // Égal
                0xBC => ",",      // Virgule
                0xBD => "-",      // Tiret
                0xBE => ":",      // Deux-points (produit par Shift + ; sur AZERTY)
                0xBF => "!",      // Point d'exclamation (produit par Shift + : sur AZERTY)
                0xC0 => "ù",      // U accent grave
                0xDB => "[",      // Crochet ouvrant
                0xDC => "\\",     // Antislash
                0xDD => "]",      // Crochet fermant
                0xDE => "^",      // Circonflexe
                _ => $"Touche {virtualKeyCode}"
            };
        }
        
        /// <summary>
        /// Convertit une touche WPF Key en code virtuel Windows de manière plus fiable
        /// </summary>
        private int KeyToVirtualKeyCode(Key key)
        {
            // Mapping direct pour les touches de fonction qui peuvent poser problème
            if (key >= Key.F1 && key <= Key.F12)
            {
                return 0x70 + ((int)key - (int)Key.F1); // F1 = 0x70, F2 = 0x71, etc.
            }
            
            // Utiliser KeyInterop pour les autres touches
            int vkCode = KeyInterop.VirtualKeyFromKey(key);
            
            // Si KeyInterop retourne 0, essayer un mapping manuel pour certaines touches courantes
            if (vkCode == 0)
            {
                return key switch
                {
                    Key.LeftShift => 0xA0,
                    Key.RightShift => 0xA1,
                    Key.LeftCtrl => 0xA2,
                    Key.RightCtrl => 0xA3,
                    Key.LeftAlt => 0xA4,
                    Key.RightAlt => 0xA5,
                    Key.LWin => 0x5B,
                    Key.RWin => 0x5C,
                    _ => 0
                };
            }
            
            return vkCode;
        }

        private void ExecuteKeyTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            ExecuteKeyTextBox.Text = "Appuyez sur une touche...";
            _isCapturingExecuteKey = true;
            
            // Installer le hook pour capturer F10 et autres touches système
            try
            {
                _keyboardHook.Install();
            }
            catch { }
        }

        private void ExecuteKeyTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            _isCapturingExecuteKey = false;
            if (_capturedExecuteKeyCode != 0)
            {
                ExecuteKeyTextBox.Text = GetKeyName(_capturedExecuteKeyCode);
            }
            
            // Désinstaller le hook si on n'est plus en train de capturer aucune touche
            if (!_isCapturingStopKey)
            {
                try
                {
                    _keyboardHook.Uninstall();
                }
                catch { }
            }
        }

        private void StopKeyTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            StopKeyTextBox.Text = "Appuyez sur une touche...";
            _isCapturingStopKey = true;
            
            // Installer le hook pour capturer F10 et autres touches système
            try
            {
                _keyboardHook.Install();
            }
            catch { }
        }

        private void StopKeyTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            _isCapturingStopKey = false;
            if (_capturedStopKeyCode != 0)
            {
                StopKeyTextBox.Text = GetKeyName(_capturedStopKeyCode);
            }
            
            // Désinstaller le hook si on n'est plus en train de capturer aucune touche
            if (!_isCapturingExecuteKey)
            {
                try
                {
                    _keyboardHook.Uninstall();
                }
                catch { }
            }
        }

        private void ExecuteKeyTextBox_KeyDown(object sender, KeyEventArgs e)
        {
            // Intercepter F10 avant qu'il n'ouvre le menu
            if (_isCapturingExecuteKey && e.Key == Key.F10)
            {
                e.Handled = true;
                var keyCode = 0x79; // VK_F10
                _capturedExecuteKeyCode = keyCode;
                ExecuteKeyTextBox.Text = GetKeyName(keyCode);
                
                // Vérifier si les deux raccourcis sont identiques
                if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedStopKeyCode != 0)
                {
                    MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                        "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
                
                ExecuteKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
            }
        }

        private void ExecuteKeyTextBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (!_isCapturingExecuteKey)
                return;

            // Toujours gérer l'événement pour empêcher les comportements par défaut (comme F10 qui ouvre le menu)
            // Mais F10 est géré dans KeyDown car PreviewKeyDown peut ne pas être suffisant
            if (e.Key == Key.F10)
            {
                e.Handled = true;
                return; // Laisser KeyDown gérer F10
            }
            
            e.Handled = true;
            
            // Ignorer les touches de modification seules
            if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                e.Key == Key.LWin || e.Key == Key.RWin)
            {
                return;
            }

            // Convertir la touche WPF en code virtuel avec notre méthode améliorée
            var keyCode = KeyToVirtualKeyCode(e.Key);
            
            // Vérifier que le code virtuel est valide (non-nul)
            if (keyCode == 0)
            {
                // Si KeyInterop retourne 0, essayer de mapper directement F10
                if (e.Key == Key.F10)
                {
                    keyCode = 0x79; // VK_F10
                }
                else
                {
                    return;
                }
            }
            
            _capturedExecuteKeyCode = keyCode;
            ExecuteKeyTextBox.Text = GetKeyName(keyCode);
            
            // Vérifier si les deux raccourcis sont identiques et afficher un avertissement
            if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedStopKeyCode != 0)
            {
                MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                    "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            
            ExecuteKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
        }

        private void StopKeyTextBox_KeyDown(object sender, KeyEventArgs e)
        {
            // Intercepter F10 avant qu'il n'ouvre le menu
            if (_isCapturingStopKey && e.Key == Key.F10)
            {
                e.Handled = true;
                var keyCode = 0x79; // VK_F10
                _capturedStopKeyCode = keyCode;
                StopKeyTextBox.Text = GetKeyName(keyCode);
                
                // Vérifier si les deux raccourcis sont identiques
                if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedExecuteKeyCode != 0)
                {
                    MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                        "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
                
                StopKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
            }
        }

        private void StopKeyTextBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (!_isCapturingStopKey)
                return;

            // Toujours gérer l'événement pour empêcher les comportements par défaut (comme F10 qui ouvre le menu)
            // Mais F10 est géré dans KeyDown car PreviewKeyDown peut ne pas être suffisant
            if (e.Key == Key.F10)
            {
                e.Handled = true;
                return; // Laisser KeyDown gérer F10
            }
            
            e.Handled = true;
            
            // Ignorer les touches de modification seules
            if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                e.Key == Key.LWin || e.Key == Key.RWin)
            {
                return;
            }

            // Convertir la touche WPF en code virtuel avec notre méthode améliorée
            var keyCode = KeyToVirtualKeyCode(e.Key);
            
            // Vérifier que le code virtuel est valide (non-nul)
            if (keyCode == 0)
            {
                return;
            }
            
            _capturedStopKeyCode = keyCode;
            StopKeyTextBox.Text = GetKeyName(keyCode);
            
            // Vérifier si les deux raccourcis sont identiques et afficher un avertissement
            if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedExecuteKeyCode != 0)
            {
                MessageBox.Show("Attention : Les raccourcis d'exécution et d'arrêt sont identiques. Ils doivent être différents.", 
                    "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            
            StopKeyTextBox.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next));
        }

        private void CaptureExecuteKeyButton_Click(object sender, RoutedEventArgs e)
        {
            ExecuteKeyTextBox.Focus();
        }

        private void CaptureStopKeyButton_Click(object sender, RoutedEventArgs e)
        {
            StopKeyTextBox.Focus();
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            // Vérifier que les deux raccourcis sont différents
            if (_capturedExecuteKeyCode == _capturedStopKeyCode && _capturedExecuteKeyCode != 0)
            {
                MessageBox.Show("Les raccourcis d'exécution et d'arrêt ne peuvent pas être identiques.", 
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            // Créer une nouvelle configuration avec les valeurs capturées
            Config = new MacroEngineConfig
            {
                MaxCPS = _config.MaxCPS,
                FullScreenMode = _config.FullScreenMode,
                EnableHooks = _config.EnableHooks,
                DefaultDelay = _config.DefaultDelay,
                ActiveProfileId = _config.ActiveProfileId,
                GlobalSettings = _config.GlobalSettings,
                ExecuteMacroKeyCode = _capturedExecuteKeyCode,
                StopMacroKeyCode = _capturedStopKeyCode
            };

            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void LoadTesseractInfo()
        {
            try
            {
                string tessdataPath = TesseractDataDownloader.GetTessdataPath();
                TessdataPathTextBox.Text = tessdataPath;

                // Vérifier les fichiers présents
                string[] requiredLanguages = { "fra", "eng" };
                List<string> presentFiles = new List<string>();
                List<string> missingFiles = new List<string>();

                if (Directory.Exists(tessdataPath))
                {
                    foreach (var lang in requiredLanguages)
                    {
                        string fileName = $"{lang}.traineddata";
                        string filePath = Path.Combine(tessdataPath, fileName);
                        
                        if (File.Exists(filePath))
                        {
                            var fileInfo = new FileInfo(filePath);
                            presentFiles.Add($"{fileName} ({fileInfo.Length / 1024 / 1024.0:F2} MB)");
                        }
                        else
                        {
                            missingFiles.Add(fileName);
                        }
                    }

                    // Afficher tous les fichiers .traineddata présents (pas seulement fra et eng)
                    var allTrainedDataFiles = Directory.GetFiles(tessdataPath, "*.traineddata")
                        .Select(f => new FileInfo(f))
                        .Where(fi => !requiredLanguages.Contains(Path.GetFileNameWithoutExtension(fi.Name)))
                        .Select(fi => $"{fi.Name} ({fi.Length / 1024 / 1024.0:F2} MB)");

                    presentFiles.AddRange(allTrainedDataFiles);
                }

                // Mettre à jour la liste
                TessdataFilesListBox.ItemsSource = presentFiles;

                // Mettre à jour le statut
                if (missingFiles.Count == 0 && presentFiles.Count > 0)
                {
                    TessdataStatusTextBlock.Text = $"✓ Tous les fichiers requis sont présents ({presentFiles.Count} fichier(s))";
                    TessdataStatusTextBlock.Foreground = System.Windows.Media.Brushes.Green;
                }
                else if (missingFiles.Count > 0)
                {
                    TessdataStatusTextBlock.Text = $"⚠ Fichiers manquants : {string.Join(", ", missingFiles)}";
                    TessdataStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;
                }
                else
                {
                    TessdataStatusTextBlock.Text = "Aucun fichier Tesseract trouvé. Les fichiers seront téléchargés automatiquement au démarrage.";
                    TessdataStatusTextBlock.Foreground = System.Windows.Media.Brushes.Gray;
                }
            }
            catch (Exception ex)
            {
                TessdataStatusTextBlock.Text = $"Erreur lors du chargement des informations : {ex.Message}";
                TessdataStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private void OpenTessdataFolderButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                string tessdataPath = TesseractDataDownloader.GetTessdataPath();
                
                // Créer le dossier s'il n'existe pas
                if (!Directory.Exists(tessdataPath))
                {
                    Directory.CreateDirectory(tessdataPath);
                }

                // Ouvrir le dossier dans l'explorateur Windows
                Process.Start(new ProcessStartInfo
                {
                    FileName = tessdataPath,
                    UseShellExecute = true,
                    Verb = "open"
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Impossible d'ouvrir le dossier : {ex.Message}", 
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}


using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Shell;
using Microsoft.Win32;
using MacroEngine.Core.Engine;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;
using MacroEngine.Core.Hooks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Storage;
using MacroEngine.Core.Processes;
using Engine = MacroEngine.Core.Engine;

namespace MacroEngine.UI
{
    public partial class MainWindow : Window
    {
        private readonly ILogger _logger;
        private readonly IMacroEngine _macroEngine;
        private readonly IProfileProvider _profileProvider;
        private readonly MacroStorage _macroStorage;
        private readonly ConfigStorage _configStorage;
        private readonly ObservableCollection<LogEntry> _logEntries;
        private List<Macro> _macros;
        private Macro? _selectedMacro;
        private TimelineEditor _blockEditor;
        private LogsWindow? _logsWindow;
        private MacroEngineConfig _appConfig;
        
        // Hooks pour l'enregistrement
        private KeyboardHook _keyboardHook;
        private MouseHook _mouseHook;
        
        // Hooks globaux pour exécution et arrêt de macro
        private KeyboardHook _globalExecuteHook;
        private KeyboardHook _globalStopHook;
        
        // Hook global pour les raccourcis par macro
        private KeyboardHook _globalMacroShortcutsHook;
        private Dictionary<int, Macro> _macroShortcuts = new Dictionary<int, Macro>();
        private bool _isRecording = false;
        private bool _isRecordingPaused = false;
        private bool _isCapturingShortcut = false;
        private bool _recordMouseClicks = true;
        private volatile bool _stopRequested = false;
        private DateTime _lastActionTime;
        private readonly object _pressedKeysLock = new object();
        private HashSet<int> _pressedKeys = new HashSet<int>();
        private Dictionary<int, DateTime> _keyDownTimes = new Dictionary<int, DateTime>();
        private DateTime _lastEditorRefresh = DateTime.MinValue;
        private const int EDITOR_REFRESH_INTERVAL_MS = 50; // Rafraîchir l'éditeur max toutes les 50ms pour un affichage réactif
        private System.Collections.ObjectModel.ObservableCollection<ActionLogItem>? _actionLogItems;
        private DateTime _lastKeyRecorded = DateTime.MinValue;
        private const int MIN_KEY_INTERVAL_MS = 50; // Intervalle minimum entre deux touches enregistrées (50ms = 20 touches/seconde max)
        
        // Queue thread-safe pour les événements souris
        private readonly System.Collections.Concurrent.ConcurrentQueue<(int X, int Y, Core.Hooks.MouseButton Button, DateTime Time)> _mouseEventQueue = new();
        private System.Windows.Threading.DispatcherTimer? _mouseEventProcessorTimer;
        private int _rapidKeyWarningCount = 0;
        private DateTime _lastRapidKeyWarning = DateTime.MinValue;
        private readonly object _recordingLock = new object();
        private volatile int _recordingInProgress = 0;
        
        // Timer pour la sauvegarde automatique
        private System.Windows.Threading.DispatcherTimer? _autoSaveTimer;
        private const int AUTO_SAVE_DELAY_MS = 2000; // Sauvegarder 2 secondes après la dernière modification

        // Surveillance des applications (détection d'application active)
        private ProcessMonitor? _processMonitor;
        private string _currentForegroundProcess = string.Empty;

        // Enregistrement des mouvements souris
        private DateTime _lastMouseMoveRecorded = DateTime.MinValue;
        private const int MIN_MOUSE_MOVE_INTERVAL_MS = 100; // Intervalle minimum entre deux mouvements (10 mouvements/seconde max)
        private const int MIN_MOUSE_MOVE_DISTANCE = 20; // Distance minimale en pixels pour enregistrer un mouvement

        public MainWindow()
        {
            InitializeComponent();

            // Barre de titre personnalisée (supprime la barre blanche du cadre système)
            var chrome = new WindowChrome
            {
                CaptionHeight = 56,
                ResizeBorderThickness = new Thickness(5),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            WindowChrome.SetWindowChrome(this, chrome);

            // Initialiser le système de logging
            _logEntries = new ObservableCollection<LogEntry>();
            _logger = new Logger
            {
                MinimumLevel = LogLevel.Info // Niveau par défaut, configurable
            };
            
            // Ajouter les writers de logs
            var fileWriter = new FileLogWriter("Logs", LogLevel.Debug);
            var uiWriter = new UiLogWriter(_logEntries, Dispatcher, LogLevel.Debug);
            _logger.AddWriter(fileWriter);
            _logger.AddWriter(uiWriter);
            
            _logger.Info("Application démarrée", "MainWindow");
            
            _macroEngine = new Engine.MacroEngine(_logger);
            _profileProvider = new AppProfileProvider();
            _macroStorage = new MacroStorage("Data/macros.json", _logger);
            _configStorage = new ConfigStorage("Data/config.json", _logger);
            _macros = new List<Macro>();
            _appConfig = new MacroEngineConfig(); // Configuration par défaut en attendant le chargement

            // Initialiser l'éditeur de macro en Timeline
            _blockEditor = new TimelineEditor();
            _blockEditor.MacroChanged += BlockEditor_MacroChanged;
            MacroEditorContainer.Content = _blockEditor;

            // Initialiser les hooks pour l'enregistrement
            _keyboardHook = new KeyboardHook();
            _mouseHook = new MouseHook();
            InitializeRecordingHooks();

            // Initialiser les hooks globaux pour exécution et arrêt
            _globalExecuteHook = new KeyboardHook();
            _globalExecuteHook.KeyDown += GlobalExecuteHook_KeyDown;
            _globalStopHook = new KeyboardHook();
            _globalStopHook.KeyDown += GlobalStopHook_KeyDown;
            
            // Initialiser le hook pour les raccourcis par macro
            _globalMacroShortcutsHook = new KeyboardHook();
            _globalMacroShortcutsHook.KeyDown += GlobalMacroShortcutsHook_KeyDown;

            InitializeEngine();
            InitializeAutoSave();
            
            // Initialiser la surveillance des applications
            InitializeProcessMonitor();
            
            // Charger la configuration et réinitialiser les hooks après
            _ = LoadConfigAndInitializeHooksAsync();
            
            LoadMacros();
            LoadProfiles();
            
            // Initialiser l'état des boutons
            ExecuteButton.IsEnabled = true;
            StartButton.IsEnabled = true;
            PauseButton.IsEnabled = false;
            StopButton.IsEnabled = false;
        }

        private void InitializeRecordingHooks()
        {
            _keyboardHook.KeyDown += KeyboardHook_KeyDown;
            _keyboardHook.KeyUp += KeyboardHook_KeyUp;
            _mouseHook.MouseDown += MouseHook_MouseDown;
            _mouseHook.MouseUp += MouseHook_MouseUp;
            _mouseHook.MouseMove += MouseHook_MouseMove;
        }

        private void InitializeProcessMonitor()
        {
            _processMonitor = new ProcessMonitor();
            _processMonitor.MonitorInterval = 500; // Vérifier toutes les 500ms
            _processMonitor.ForegroundChanged += ProcessMonitor_ForegroundChanged;
            _processMonitor.StartMonitoring();
            _logger?.Info("Surveillance des applications activée", "MainWindow");
        }

        private void ProcessMonitor_ForegroundChanged(object? sender, ForegroundChangedEventArgs e)
        {
            _currentForegroundProcess = e.CurrentProcessName;
            
            // Mettre à jour l'affichage de l'application active
            Dispatcher.Invoke(() =>
            {
                UpdateActiveApplicationDisplay(e.CurrentProcessName, e.WindowTitle);
                
                // Vérifier si une macro doit être exécutée automatiquement
                CheckAutoExecuteMacros(e.CurrentProcessName);
            });
        }

        private void UpdateActiveApplicationDisplay(string processName, string windowTitle)
        {
            // Mettre à jour le texte de l'application active dans la barre latérale
            if (ActiveAppText != null)
            {
                var displayText = !string.IsNullOrEmpty(windowTitle) 
                    ? $"{processName}\n{windowTitle}" 
                    : processName;
                    
                ActiveAppText.Text = displayText;
                ActiveAppText.Foreground = System.Windows.Media.Brushes.DarkBlue;
            }
        }

        private void CheckAutoExecuteMacros(string processName)
        {
            // Chercher les macros qui doivent s'exécuter automatiquement pour cette application
            foreach (var macro in _macros)
            {
                if (macro.AutoExecuteOnFocus && 
                    macro.TargetApplications != null &&
                    macro.TargetApplications.Any(app => 
                        string.Equals(app, processName, StringComparison.OrdinalIgnoreCase)))
                {
                    // Exécuter la macro si elle n'est pas déjà en cours
                    if (_macroEngine.State == MacroEngineState.Idle)
                    {
                        _logger?.Info($"Exécution automatique de la macro '{macro.Name}' pour {processName}", "MainWindow");
                        _selectedMacro = macro;
                        MacrosListBox.SelectedItem = macro;
                        _ = ExecuteMacroAsync();
                    }
                    break; // Une seule macro auto-exécutée à la fois
                }
            }
        }

        /// <summary>
        /// Vérifie si le raccourci de la macro est actif pour l'application actuelle
        /// </summary>
        private bool IsMacroShortcutActiveForCurrentApp(Macro macro)
        {
            // Si pas d'applications cibles, le raccourci est toujours actif
            if (macro.TargetApplications == null || macro.TargetApplications.Count == 0)
            {
                return true;
            }

            // Vérifier si l'application actuelle est dans la liste des cibles
            return macro.TargetApplications.Any(app => 
                string.Equals(app, _currentForegroundProcess, StringComparison.OrdinalIgnoreCase));
        }

        private async System.Threading.Tasks.Task LoadConfigAndInitializeHooksAsync()
        {
            try
            {
                _appConfig = await _configStorage.LoadConfigAsync();
                _logger?.Info($"Configuration chargée - Exécuter: VK{_appConfig.ExecuteMacroKeyCode:X2}, Arrêter: VK{_appConfig.StopMacroKeyCode:X2}", "MainWindow");
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du chargement de la configuration", ex, "MainWindow");
                _appConfig = new MacroEngineConfig(); // Utiliser les valeurs par défaut
            }
            
            // Initialiser les hooks avec la configuration chargée
            InitializeGlobalHooks();
            
            // Mettre à jour le texte du bouton Exécuter avec le raccourci
            UpdateExecuteButtonText();
            
            ApplyTestAndActionsPanelVisibility();
        }
        
        private void ApplyTestAndActionsPanelVisibility()
        {
            if (BottomPanelRow == null || _appConfig == null)
                return;
            bool showActions = _appConfig.ShowActionsPanel;
            bool showTest = _appConfig.ShowTestPanel;
            if (ActionsPanelBorder != null)
                ActionsPanelBorder.Visibility = showActions ? Visibility.Visible : Visibility.Collapsed;
            if (TestPanelBorder != null)
                TestPanelBorder.Visibility = showTest ? Visibility.Visible : Visibility.Collapsed;
            BottomPanelRow.Height = (showActions || showTest) ? new GridLength(180) : new GridLength(0);
        }
        
        private void UpdateExecuteButtonText()
        {
            if (ExecuteButton != null && _appConfig != null)
            {
                var keyCode = _appConfig.ExecuteMacroKeyCode != 0 ? _appConfig.ExecuteMacroKeyCode : 0x79;
                var keyName = GetKeyNameForShortcut((ushort)keyCode);
                ExecuteButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Play, $" Exécuter ({keyName})");
            }
            
            if (StopButton != null && _appConfig != null)
            {
                var keyCode = _appConfig.StopMacroKeyCode != 0 ? _appConfig.StopMacroKeyCode : 0x7A;
                var keyName = GetKeyNameForShortcut((ushort)keyCode);
                StopButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Stop, $" Arrêter ({keyName})");
            }
        }
        
        private string GetKeyNameForShortcut(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0)
            {
                return "F10";
            }
            
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
                0x41 => "a",
                0x42 => "b",
                0x43 => "c",
                0x44 => "d",
                0x45 => "e",
                0x46 => "f",
                0x47 => "g",
                0x48 => "h",
                0x49 => "i",
                0x4A => "j",
                0x4B => "k",
                0x4C => "l",
                0x4D => "m",
                0x4E => "n",
                0x4F => "o",
                0x50 => "p",
                0x51 => "q",
                0x52 => "r",
                0x53 => "s",
                0x54 => "t",
                0x55 => "u",
                0x56 => "v",
                0x57 => "w",
                0x58 => "x",
                0x59 => "y",
                0x5A => "z",
                0x5B => "Windows Gauche",
                0x5C => "Windows Droit",
                0x5D => "Menu",
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
                0xBD => "8",      // Huit (touche 8 sur AZERTY, pas le tiret)
                0xBE => ":",      // Deux-points (Shift + ; sur AZERTY)
                0xBF => "!",      // Point d'exclamation (Shift + : sur AZERTY)
                0xC0 => "ù",      // U accent grave
                0xDB => "[",      // Crochet ouvrant
                0xDC => "\\",     // Antislash
                0xDD => "]",      // Crochet fermant
                0xDE => "^",      // Circonflexe
                _ => $"Touche {virtualKeyCode}"
            };
        }

        private void InitializeGlobalHooks()
        {
            // Désinstaller les hooks existants
            try
            {
                _globalExecuteHook.Uninstall();
                _globalStopHook.Uninstall();
                _globalMacroShortcutsHook.Uninstall();
            }
            catch { }

            // Installer les hooks avec les raccourcis de la configuration
            try
            {
                if (_appConfig?.EnableHooks == true)
                {
                    _globalExecuteHook.Install();
                    _globalStopHook.Install();
                    UpdateMacroShortcuts();
                    _globalMacroShortcutsHook.Install();
                    _mouseHook.Install(); // Pour capturer la molette (conditions "Molette haut/bas")
                    _logger?.Debug($"Hooks globaux installés - Exécuter: VK{_appConfig?.ExecuteMacroKeyCode:X2}, Arrêter: VK{_appConfig?.StopMacroKeyCode:X2}", "MainWindow");
                }
            }
            catch (Exception ex)
            {
                _logger?.Error("Impossible d'installer les hooks globaux", ex, "MainWindow");
            }
        }

        private void UpdateMacroShortcuts()
        {
            _macroShortcuts.Clear();
            var conflicts = new List<(Macro macro, int keyCode)>();
            
            foreach (var macro in _macros)
            {
                if (macro.ShortcutKeyCode != 0 && macro.IsEnabled)
                {
                    // Vérifier les conflits avec les raccourcis globaux
                    if (_appConfig != null && 
                        (macro.ShortcutKeyCode == _appConfig.ExecuteMacroKeyCode || 
                         macro.ShortcutKeyCode == _appConfig.StopMacroKeyCode))
                    {
                        _logger?.Warning($"Le raccourci de la macro '{macro.Name}' (VK{macro.ShortcutKeyCode:X2}) entre en conflit avec un raccourci global", "MainWindow");
                        continue; // Ne pas ajouter ce raccourci
                    }
                    
                    // Vérifier les conflits entre macros - si plusieurs macros ont le même raccourci, on prend la première
                    if (!_macroShortcuts.ContainsKey(macro.ShortcutKeyCode))
                    {
                        _macroShortcuts[macro.ShortcutKeyCode] = macro;
                    }
                    else
                    {
                        conflicts.Add((macro, macro.ShortcutKeyCode));
                        _logger?.Warning($"Conflit de raccourci détecté: plusieurs macros utilisent VK{macro.ShortcutKeyCode:X2}", "MainWindow");
                    }
                }
            }
            
            // Afficher un message si des conflits sont détectés
            if (conflicts.Count > 0)
            {
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    var conflictMessage = "Conflits de raccourcis détectés:\n" + 
                        string.Join("\n", conflicts.Select(c => $"- '{c.macro.Name}' utilise {GetKeyNameForShortcut((ushort)c.keyCode)} (déjà utilisé)"));
                    MessageBox.Show(conflictMessage, "Avertissement", MessageBoxButton.OK, MessageBoxImage.Warning);
                }), System.Windows.Threading.DispatcherPriority.Normal);
            }
            
            _logger?.Debug($"{_macroShortcuts.Count} raccourci(s) de macro(s) enregistré(s)", "MainWindow");
        }

        private void GlobalMacroShortcutsHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Vérifier si cette touche correspond à un raccourci de macro
            if (_macroShortcuts.TryGetValue(e.VirtualKeyCode, out var macro))
            {
                // Ne pas exécuter si on est en train d'enregistrer
                if (_isRecording)
                    return;
                    
                // Vérifier que ce n'est pas le raccourci global d'exécution ou d'arrêt
                if (_appConfig != null && 
                    (e.VirtualKeyCode == _appConfig.ExecuteMacroKeyCode || 
                     e.VirtualKeyCode == _appConfig.StopMacroKeyCode))
                {
                    return;
                }
                
                // Vérifier si la macro est activée
                if (!macro.IsEnabled)
                {
                    return; // La macro est désactivée
                }
                
                // Le raccourci fonctionne depuis n'importe quelle application (global).
                // TargetApplications ne limite que l'exécution automatique au focus, pas le raccourci clavier.

                e.Handled = true;
                
                // Mode toggle: si la macro est en cours, l'arrêter
                if (_macroEngine.State != MacroEngineState.Idle && _selectedMacro?.Id == macro.Id)
                {
                    // Arrêter la macro en cours
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        _stopRequested = true;
                        _macroEngine.StopMacroAsync();
                        StatusText.Text = "Macro arrêtée (raccourci)";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }), System.Windows.Threading.DispatcherPriority.Normal);
                }
                else if (_macroEngine.State == MacroEngineState.Idle)
                {
                    // Lancer la macro
                    Dispatcher.BeginInvoke(new Action(async () =>
                    {
                        _selectedMacro = macro;
                        MacrosListBox.SelectedItem = macro;
                        await ExecuteMacroAsync();
                    }), System.Windows.Threading.DispatcherPriority.Normal);
                }
            }
        }

        private void DisableGlobalHooks()
        {
            // Désinstaller les hooks globaux
            try
            {
                _globalExecuteHook.Uninstall();
                _globalStopHook.Uninstall();
                _globalMacroShortcutsHook.Uninstall();
                _logger?.Debug("Hooks globaux désactivés", "MainWindow");
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors de la désactivation des hooks globaux", ex, "MainWindow");
            }
        }

        private void InitializeAutoSave()
        {
            _autoSaveTimer = new System.Windows.Threading.DispatcherTimer();
            _autoSaveTimer.Interval = TimeSpan.FromMilliseconds(AUTO_SAVE_DELAY_MS);
            _autoSaveTimer.Tick += AutoSaveTimer_Tick;
        }

        private async void AutoSaveTimer_Tick(object? sender, EventArgs e)
        {
            _autoSaveTimer?.Stop();
            
            if (_selectedMacro != null && _macros.Contains(_selectedMacro))
            {
                try
                {
                    _selectedMacro.ModifiedAt = DateTime.Now;
                    await _macroStorage.SaveMacrosAsync(_macros);
                    
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "Sauvegarde automatique effectuée";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    });
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Erreur lors de la sauvegarde automatique: {ex.Message}");
                }
            }
        }

        private void TriggerAutoSave()
        {
            if (_selectedMacro == null || _autoSaveTimer == null)
                return;

            // Redémarrer le timer : sauvegarder après AUTO_SAVE_DELAY_MS de non-modification
            _autoSaveTimer.Stop();
            _autoSaveTimer.Start();
        }

        private void MacroEditor_MacroModified(object? sender, EventArgs e)
        {
            // Déclencher la sauvegarde automatique quand la macro est modifiée
            TriggerAutoSave();
            
            // Vérifier les conflits de raccourcis avant de mettre à jour
            if (_selectedMacro != null && _selectedMacro.ShortcutKeyCode != 0)
            {
                // Vérifier si le raccourci entre en conflit avec un raccourci global
                if (_appConfig != null && 
                    (_selectedMacro.ShortcutKeyCode == _appConfig.ExecuteMacroKeyCode || 
                     _selectedMacro.ShortcutKeyCode == _appConfig.StopMacroKeyCode))
                {
                    _logger?.Warning($"Le raccourci de la macro '{_selectedMacro.Name}' entre en conflit avec un raccourci global", "MainWindow");
                    MessageBox.Show(
                        $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par un raccourci global.\nVeuillez choisir un autre raccourci.",
                        "Conflit de raccourci",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                    _selectedMacro.ShortcutKeyCode = 0; // Réinitialiser le raccourci
                }
                else
                {
                    // Vérifier les conflits avec d'autres macros
                    var conflictingMacro = _macros.FirstOrDefault(m => 
                        m.Id != _selectedMacro.Id && 
                        m.ShortcutKeyCode == _selectedMacro.ShortcutKeyCode && 
                        m.ShortcutKeyCode != 0);
                    
                    if (conflictingMacro != null)
                    {
                        _logger?.Warning($"Le raccourci de la macro '{_selectedMacro.Name}' entre en conflit avec '{conflictingMacro.Name}'", "MainWindow");
                        MessageBox.Show(
                            $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par la macro '{conflictingMacro.Name}'.\nVeuillez choisir un autre raccourci.",
                            "Conflit de raccourci",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning);
                        _selectedMacro.ShortcutKeyCode = 0; // Réinitialiser le raccourci
                    }
                }
            }
            
            // Mettre à jour les raccourcis de macros
            UpdateMacroShortcuts();
            if (_appConfig?.EnableHooks == true)
            {
                try
                {
                    _globalMacroShortcutsHook.Uninstall();
                    _globalMacroShortcutsHook.Install();
                }
                catch { }
            }
            
            // Rafraîchir l'affichage de la liste pour mettre à jour les raccourcis
            MacrosListBox.Items.Refresh();
        }

        private void BlockEditor_MacroChanged(object? sender, EventArgs e)
        {
            // Appeler la même logique que MacroEditor_MacroModified
            MacroEditor_MacroModified(sender, e);
            UpdateMacroSummary();
            // Mettre à jour les raccourcis globaux (au cas où IsEnabled a changé)
            UpdateMacroShortcuts();
        }

        private void GlobalExecuteHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Vérifier que c'est le raccourci configuré pour exécuter et qu'on n'est pas en train d'enregistrer
            if (_appConfig != null && 
                e.VirtualKeyCode == _appConfig.ExecuteMacroKeyCode && 
                !_isRecording && 
                _macroEngine.State == MacroEngineState.Idle)
            {
                // Bloquer la propagation pour éviter qu'il ouvre des menus
                e.Handled = true;
                
                // Exécuter la macro de manière asynchrone
                _ = ExecuteMacroAsync();
            }
        }

        private void GlobalStopHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Vérifier que c'est le raccourci configuré pour arrêter (F11 par défaut)
            bool isStopKey = _appConfig != null && e.VirtualKeyCode == _appConfig.StopMacroKeyCode;
            
            if (isStopKey)
            {
                // Bloquer la propagation seulement si une macro est en cours
                if (_macroEngine.State != MacroEngineState.Idle || _isRecording)
                {
                    e.Handled = true;
                }
                
                // Arrêter la macro ou l'enregistrement
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (_isRecording)
                    {
                        StopRecording();
                    }
                    else if (_macroEngine.State != MacroEngineState.Idle)
                    {
                        _stopRequested = true;
                        _macroEngine.StopMacroAsync();
                        StatusText.Text = "Macro arrêtée (F11)";
                    }
                }), System.Windows.Threading.DispatcherPriority.Normal);
            }
        }

        private void InitializeEngine()
        {
            _macroEngine.StateChanged += MacroEngine_StateChanged;
            _macroEngine.ErrorOccurred += MacroEngine_ErrorOccurred;
            _macroEngine.ActionExecuted += MacroEngine_ActionExecuted;
        }

        private void MacroEngine_StateChanged(object? sender, MacroEngineEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                EngineStateText.Text = e.CurrentState.ToString();
                
                // Gérer l'état des boutons selon le mode (enregistrement vs exécution)
                bool isExecuting = e.CurrentState != MacroEngineState.Idle;
                
                ExecuteButton.IsEnabled = e.CurrentState == MacroEngineState.Idle && !_isRecording;
                StartButton.IsEnabled = !_isRecording && !isExecuting;
                
                // Les boutons Pause/Stop fonctionnent pour l'exécution ET l'enregistrement
                PauseButton.IsEnabled = isExecuting || _isRecording;
                StopButton.IsEnabled = isExecuting || _isRecording;
            });
        }

        private void MacroEngine_ErrorOccurred(object? sender, MacroEngineErrorEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                StatusText.Text = $"Erreur: {e.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            });
        }

        private void MacroEngine_ActionExecuted(object? sender, ActionExecutedEventArgs e)
        {
            // Utiliser BeginInvoke avec priorité basse pour permettre à l'UI de se mettre à jour
            // Cela permet au texte de s'afficher touche par touche dans la zone de test
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Background, new System.Action(() =>
            {
                var actionItem = new ActionLogItem
                {
                    Timestamp = e.Timestamp.ToString("HH:mm:ss.fff"),
                    Description = e.ActionDescription ?? e.Action?.Name ?? "Action inconnue"
                };
                
                // Ajouter en haut de la liste
                var items = ActionsListBox.ItemsSource as System.Collections.ObjectModel.ObservableCollection<ActionLogItem> ?? 
                           new System.Collections.ObjectModel.ObservableCollection<ActionLogItem>();
                
                if (ActionsListBox.ItemsSource == null)
                {
                    ActionsListBox.ItemsSource = items;
                }
                
                items.Add(actionItem);
                
                // Limiter à 100 actions (supprimer les plus anciennes en haut)
                while (items.Count > 100)
                {
                    items.RemoveAt(0);
                }
                
                // Scroller vers le bas pour voir la nouvelle action
                if (ActionsListBox.Items.Count > 0)
                {
                    ActionsListBox.ScrollIntoView(ActionsListBox.Items[ActionsListBox.Items.Count - 1]);
                }
                
                ActionsCountText.Text = $"{items.Count} action(s)";
                
                // Mettre à jour le statut
                StatusText.Text = $"Action: {actionItem.Description}";
            }));
        }

        private void ClearActionsButton_Click(object sender, RoutedEventArgs e)
        {
            if (ActionsListBox.ItemsSource is System.Collections.ObjectModel.ObservableCollection<ActionLogItem> items)
            {
                items.Clear();
                ActionsCountText.Text = "0 action(s)";
            }
        }

        private void TestTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            // Effacer le texte de placeholder si c'est le texte par défaut
            if (TestTextBox.Text == "Tapez ici pour tester vos macros...")
            {
                TestTextBox.Text = string.Empty;
            }
        }

        private async void LoadMacros()
        {
            try
            {
                _macros = await _macroStorage.LoadMacrosAsync();
                
                // Créer une macro de test par défaut si aucune macro n'existe
                if (_macros.Count == 0)
                {
                    var testMacro = CreateTestMacro();
                    _macros.Add(testMacro);
                    // Sauvegarder la macro de test
                    await _macroStorage.SaveMacrosAsync(_macros);
                }
                
                MacrosListBox.ItemsSource = _macros;
                
                // Sélectionner automatiquement la première macro
                if (_macros.Count > 0)
                {
                    // Forcer la sélection de la première macro
                    _ = this.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        MacrosListBox.SelectedIndex = 0;
                        _selectedMacro = _macros[0];
                        if (_blockEditor != null)
                        {
                            _blockEditor.LoadMacro(_selectedMacro);
                        }
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur chargement macros: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private Macro CreateTestMacro()
        {
            var macro = new Macro
            {
                Name = "Macro de Test",
                Description = "Une macro de test simple avec quelques touches",
                RepeatCount = 1
            };

            // Ajouter quelques actions de test
            var actions = new List<MacroEngine.Core.Inputs.IInputAction>();

            // Appuyer sur 'H'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "H",
                VirtualKeyCode = 0x48, // H
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "200ms",
                Duration = 200
            });

            // Appuyer sur 'e'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "E",
                VirtualKeyCode = 0x45, // E
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "200ms",
                Duration = 200
            });

            // Appuyer sur 'l'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "L",
                VirtualKeyCode = 0x4C, // L
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "200ms",
                Duration = 200
            });

            // Appuyer sur 'l'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "L",
                VirtualKeyCode = 0x4C, // L
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "200ms",
                Duration = 200
            });

            // Appuyer sur 'o'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "O",
                VirtualKeyCode = 0x4F, // O
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Entrée
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "Entrée",
                VirtualKeyCode = 0x0D, // Enter
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            macro.Actions = actions;
            
            // Vérifier que les actions sont bien initialisées
            if (macro.Actions == null || macro.Actions.Count == 0)
            {
                throw new InvalidOperationException("La macro de test n'a pas pu être créée avec des actions");
            }
            
            return macro;
        }

        private async void LoadProfiles()
        {
            await LoadProfilesAsync();
        }

        private async Task LoadProfilesAsync()
        {
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                var activeProfile = profiles.FirstOrDefault(p => p.IsActive);
                ActiveProfileText.Text = activeProfile?.Name ?? "Aucun";
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du chargement des profils", ex, "MainWindow");
                StatusText.Text = $"Erreur chargement profils: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private void ShortcutTextBlock_Loaded(object sender, RoutedEventArgs e)
        {
            if (sender is TextBlock textBlock && textBlock.DataContext is Macro macro)
            {
                if (macro.ShortcutKeyCode != 0)
                {
                    textBlock.Text = $"Raccourci: {GetKeyNameForShortcut((ushort)macro.ShortcutKeyCode)}";
                }
                else
                {
                    textBlock.Text = "";
                    textBlock.Visibility = Visibility.Collapsed;
                }
            }
        }

        private void MacrosListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _selectedMacro = MacrosListBox.SelectedItem as Macro;
            if (_selectedMacro != null)
            {
                // Charger l'éditeur avec la macro sélectionnée
                _blockEditor.LoadMacro(_selectedMacro);
            }
            else
            {
                // Vider l'éditeur si aucune macro sélectionnée
                _blockEditor.LoadMacro(null!); // null! car LoadMacro accepte null
            }

            // Mettre à jour le panneau de propriétés
            UpdateMacroPropertiesPanel();
        }

        private async void ExecuteMacro_Click(object sender, RoutedEventArgs e)
        {
            await ExecuteMacroAsync();
        }

        private async System.Threading.Tasks.Task ExecuteMacroAsync()
        {
            try
        {
            if (_selectedMacro == null)
            {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "Aucune macro sélectionnée";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    });
                return;
            }

            // Vérifier si la macro est activée
            if (!_selectedMacro.IsEnabled)
            {
                Dispatcher.Invoke(() =>
                {
                    StatusText.Text = "La macro est désactivée";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                });
                return;
            }

                if (_selectedMacro?.Actions == null || _selectedMacro.Actions.Count == 0)
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "La macro sélectionnée ne contient aucune action";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    });
                    return;
                }

                if (_isRecording)
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "Impossible d'exécuter : enregistrement en cours";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    });
                    return;
                }

                if (_macroEngine.State != MacroEngineState.Idle)
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "Une macro est déjà en cours d'exécution";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    });
                    return;
                }

                // Réinitialiser le flag d'arrêt
                _stopRequested = false;
                
                // Déterminer le nombre de répétitions
                int repeatCount = 1;
                bool repeatUntilStopped = false;
                int delayBetween = _selectedMacro.DelayBetweenRepeats;
                
                switch (_selectedMacro.RepeatMode)
                {
                    case RepeatMode.Once:
                        repeatCount = 1;
                        break;
                    case RepeatMode.RepeatCount:
                        repeatCount = Math.Max(1, _selectedMacro.RepeatCount);
                        break;
                    case RepeatMode.UntilStopped:
                        repeatUntilStopped = true;
                        repeatCount = int.MaxValue; // Boucle infinie jusqu'à arrêt
                        break;
                }
                
                // Si la macro utilise la molette (condition) ou la surveillance continue, installer le hook souris pour capturer la molette
                bool mouseHookInstalledForExecution = false;
                if ((_selectedMacro.ContinuousMonitoring || MacroHasMouseWheelCondition(_selectedMacro)) && !_mouseHook.IsEnabled)
                {
                    try
                    {
                        mouseHookInstalledForExecution = _mouseHook.Install();
                    }
                    catch { /* ignorer */ }
                }

                // Exécuter la macro avec répétition
                int currentRepeat = 0;
                bool success = true;
                bool wasStopped = false;
                
                for (int i = 0; i < repeatCount && !_stopRequested; i++)
                {
                    currentRepeat = i + 1;
                    
                    string statusText = repeatUntilStopped 
                        ? $"Exécution en boucle (#{currentRepeat})... Appuyez sur le raccourci ou F11 pour arrêter"
                        : repeatCount > 1 
                            ? $"Exécution {currentRepeat}/{repeatCount}..."
                            : "Exécution de la macro en cours...";
                    
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = statusText;
                        StatusText.Foreground = System.Windows.Media.Brushes.Black;
                    });
                    
                    success = await _macroEngine.StartMacroAsync(_selectedMacro);
                    
                    // Vérifier si arrêt demandé
                    if (_stopRequested)
                    {
                        wasStopped = true;
                        break;
                    }
                    
                    if (!success)
                        break;
                    
                    // Délai entre les répétitions (sauf pour la dernière)
                    bool hasMoreIterations = repeatUntilStopped || (i + 1) < repeatCount;
                    if (hasMoreIterations && delayBetween > 0 && !_stopRequested)
                    {
                        Dispatcher.Invoke(() =>
                        {
                            StatusText.Text = $"Pause {delayBetween}ms avant répétition...";
                        });
                        
                        // Délai avec vérification d'arrêt toutes les 50ms
                        int remainingDelay = delayBetween;
                        while (remainingDelay > 0 && !_stopRequested)
                        {
                            int waitTime = Math.Min(50, remainingDelay);
                            await System.Threading.Tasks.Task.Delay(waitTime);
                            remainingDelay -= waitTime;
                        }
                        
                        if (_stopRequested)
                        {
                            wasStopped = true;
                            break;
                        }
                    }
                }
                
                _stopRequested = false;

                // Désinstaller le hook souris si on l'avait installé pour l'exécution (molette / surveillance continue)
                if (mouseHookInstalledForExecution && !_isRecording)
                {
                    try { _mouseHook.Uninstall(); } catch { /* ignorer */ }
                }
                
                Dispatcher.Invoke(() =>
                {
                    if (wasStopped)
                    {
                        StatusText.Text = $"Macro arrêtée après {currentRepeat} répétition(s)";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                    else if (success)
                    {
                        string completedText = repeatCount > 1 || repeatUntilStopped
                            ? $"Exécution terminée ({currentRepeat} répétition(s))"
                            : "Exécution terminée";
                        StatusText.Text = completedText;
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    }
                    else
                    {
                        StatusText.Text = "Exécution arrêtée";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                });
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() =>
                {
                    StatusText.Text = $"Erreur exécution: {ex.Message}";
                    StatusText.Foreground = System.Windows.Media.Brushes.Red;
                });
                System.Diagnostics.Debug.WriteLine($"Erreur lors de l'exécution: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private void StartMacro_Click(object sender, RoutedEventArgs e)
        {
            try
        {
            if (_selectedMacro == null)
            {
                StatusText.Text = "Veuillez sélectionner une macro";
                StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                return;
            }

                if (_macroEngine.State != MacroEngineState.Idle)
                {
                    StatusText.Text = "Veuillez arrêter l'exécution avant de commencer l'enregistrement";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                if (!_isRecording)
                {
                    // Démarrer l'enregistrement
                    StartRecording();
                }
                // Note: Pour arrêter l'enregistrement, utiliser le bouton "Arrêter"
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur enregistrement: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private void StartRecording()
        {
            if (_isRecording)
                return;

            _logger.Info($"Démarrage de l'enregistrement pour la macro '{_selectedMacro?.Name ?? "inconnue"}'", "MainWindow");
            _isRecording = true;
            _lastActionTime = DateTime.Now;
            _lastKeyRecorded = DateTime.MinValue;
            _rapidKeyWarningCount = 0;
            _lastRapidKeyWarning = DateTime.MinValue;
            _recordingInProgress = 0;
            _lastMouseMoveRecorded = DateTime.MinValue;
            _recordMouseClicks = true; // Toujours enregistrer les clics
            
            // Initialiser le cache des coordonnées de la fenêtre
            _cachedWindowHandle = new WindowInteropHelper(this).Handle;
            if (_cachedWindowHandle != IntPtr.Zero)
            {
                GetWindowRect(_cachedWindowHandle, out _cachedWindowRect);
                System.Diagnostics.Debug.WriteLine($"[StartRecording] Window rect cached: ({_cachedWindowRect.Left},{_cachedWindowRect.Top},{_cachedWindowRect.Right},{_cachedWindowRect.Bottom})");
            }
            _lastWindowRectUpdate = DateTime.Now;
            
            // Cacher les rectangles des boutons de contrôle
            CacheControlButtonRects();
            
            // Initialiser la collection pour le log d'actions
            _actionLogItems = new System.Collections.ObjectModel.ObservableCollection<ActionLogItem>();
            ActionsListBox.ItemsSource = _actionLogItems;
            
            // Initialiser le timer pour traiter les événements souris par lots
            _mouseEventProcessorTimer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(100) // Traiter tous les 100ms
            };
            _mouseEventProcessorTimer.Tick += ProcessMouseEventQueue;
            _mouseEventProcessorTimer.Start();
            
            lock (_pressedKeysLock)
            {
                _pressedKeys.Clear();
            }
            _keyDownTimes.Clear();

            // Initialiser la liste d'actions si nécessaire
            if (_selectedMacro != null && _selectedMacro.Actions == null)
            {
                _selectedMacro.Actions = new List<IInputAction>();
            }
            else
            {
                // Optionnel : vider les actions existantes ou les conserver
                // Pour l'instant, on les conserve pour permettre d'ajouter des actions
            }

            // Désinstaller les hooks globaux pendant l'enregistrement
            try
            {
                _globalExecuteHook.Uninstall();
                _globalStopHook.Uninstall();
            }
            catch { }

            // Installer les hooks
            try
            {
                bool keyboardInstalled = _keyboardHook.Install();
                bool mouseInstalled = _mouseHook.Install();
                
                System.Diagnostics.Debug.WriteLine($"[StartRecording] Keyboard hook: {keyboardInstalled}, Mouse hook: {mouseInstalled}, RecordMouseClicks: {_recordMouseClicks}");
                _logger?.Info($"Hooks installés - Clavier: {keyboardInstalled}, Souris: {mouseInstalled}, Enregistrer clics: {_recordMouseClicks}", "MainWindow");
                
                if (!mouseInstalled)
                {
                    _logger?.Warning("Le hook souris n'a pas pu être installé!", "MainWindow");
                }
            }
            catch (Exception ex)
            {
                _isRecording = false;
                MessageBox.Show($"Impossible d'installer les hooks. Assurez-vous que l'application a les privilèges administrateur.\n\nErreur: {ex.Message}", 
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Mettre à jour l'interface
            StartButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Record, " Enregistrement...");
            StatusText.Text = "Enregistrement en cours... Appuyez sur les touches ou cliquez avec la souris (max 20 touches/seconde)";
            StatusText.Foreground = System.Windows.Media.Brushes.Black;
            ExecuteButton.IsEnabled = false; // Désactiver l'exécution pendant l'enregistrement
            PauseButton.IsEnabled = true;
            PauseButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Pause, " Pause");
            StopButton.IsEnabled = true;
            _isRecordingPaused = false;
            
            _logger?.Info("Hooks d'enregistrement installés avec succès", "MainWindow");
        }

        private void StopRecording()
        {
            if (!_isRecording)
                return;

            _logger.Info($"Arrêt de l'enregistrement. {_selectedMacro?.Actions?.Count ?? 0} action(s) enregistrée(s)", "MainWindow");
            _isRecording = false;

            // Désinstaller les hooks
            _keyboardHook.Uninstall();
            _mouseHook.Uninstall();
            _logger.Debug("Hooks d'enregistrement désinstallés", "MainWindow");
            
            // Arrêter le timer de traitement des événements souris
            _mouseEventProcessorTimer?.Stop();
            _mouseEventProcessorTimer = null;
            
            // Vider la queue restante
            while (_mouseEventQueue.TryDequeue(out _)) { }

            // Réinstaller les hooks globaux après l'enregistrement
            InitializeGlobalHooks();

            // Traiter les touches restantes appuyées
            ProcessRemainingKeys();

            // Mettre à jour l'interface
            StartButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Record, " Enregistrer");
            StatusText.Text = $"Enregistrement terminé. {_selectedMacro?.Actions?.Count ?? 0} action(s) enregistrée(s)";
            ExecuteButton.IsEnabled = _macroEngine.State == MacroEngineState.Idle; // Réactiver l'exécution si le moteur est inactif
            PauseButton.IsEnabled = false;
            StopButton.IsEnabled = false;

            // Rafraîchir l'éditeur
            if (_blockEditor != null && _selectedMacro != null)
            {
                _blockEditor.LoadMacro(_selectedMacro);
            }

            // Sauvegarder automatiquement après l'enregistrement
            if (_selectedMacro != null)
            {
                _selectedMacro.ModifiedAt = DateTime.Now;
                _ = _macroStorage.SaveMacrosAsync(_macros);
            }
        }

        private void KeyboardHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            if (!_isRecording || _isRecordingPaused)
                return;

            var keyCode = e.VirtualKeyCode;
            var timestamp = DateTime.Now;
            
            // Filtrer les répétitions automatiques : si la touche est déjà dans _pressedKeys,
            // c'est une répétition automatique du système (quand on maintient la touche)
            // On doit vérifier cela AVANT BeginInvoke pour éviter les race conditions
            lock (_pressedKeysLock)
            {
                if (_pressedKeys.Contains(keyCode))
                {
                    // Cette touche est déjà pressée, c'est une répétition automatique - on ignore
                    return;
                }
            }
            
            // Limiter la vitesse d'enregistrement pour éviter les crashes
            var timeSinceLastKey = (timestamp - _lastKeyRecorded).TotalMilliseconds;
            if (timeSinceLastKey < MIN_KEY_INTERVAL_MS)
            {
                // Trop rapide ! Ignorer cette touche pour éviter le crash
                _rapidKeyWarningCount++;
                
                // Afficher un avertissement toutes les 10 touches ignorées ou toutes les 2 secondes
                var timeSinceLastWarning = (timestamp - _lastRapidKeyWarning).TotalMilliseconds;
                if (_rapidKeyWarningCount >= 10 || timeSinceLastWarning > 2000)
                {
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        try
                        {
                            StatusText.Text = $"⚠ Attention : Enregistrement trop rapide ! ({_rapidKeyWarningCount} touches ignorées) - Max 20 touches/seconde";
                            StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                        }
                        catch { }
                    }), System.Windows.Threading.DispatcherPriority.Background);
                    _lastRapidKeyWarning = timestamp;
                    _rapidKeyWarningCount = 0;
                }
                return;
            }
            
            // Vérifier si une opération d'enregistrement est déjà en cours (éviter la surcharge)
            if (System.Threading.Interlocked.CompareExchange(ref _recordingInProgress, 1, 0) != 0)
            {
                // Une opération est déjà en cours, ignorer cette touche
                _rapidKeyWarningCount++;
                return;
            }
            
            // Ajouter la touche après avoir vérifié la vitesse
            lock (_pressedKeysLock)
            {
                _pressedKeys.Add(keyCode);
            }
            _lastKeyRecorded = timestamp;
            
            // Utiliser BeginInvoke avec priorité Background pour éviter la surcharge
            Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    // Vérifier à nouveau que l'enregistrement est toujours actif
                    if (!_isRecording || _isRecordingPaused || _selectedMacro == null)
                    {
                        // Si l'enregistrement s'est arrêté, retirer la touche
                        lock (_pressedKeysLock)
                        {
                            _pressedKeys.Remove(keyCode);
                        }
                        return;
                    }

                    // Vérifier que la liste d'actions existe
                    if (_selectedMacro != null && _selectedMacro.Actions == null)
                    {
                        _selectedMacro.Actions = new List<IInputAction>();
                    }

                    // Enregistrer le temps de pression
                    _keyDownTimes[keyCode] = timestamp;

                    // Ajouter un délai si nécessaire
                    AddDelayIfNeeded();

                    // Ignorer les touches modificateurs seules (on les détecte avec la touche principale)
                    if (IsModifierKey(keyCode))
                    {
                        lock (_pressedKeysLock)
                        {
                            _pressedKeys.Remove(keyCode);
                        }
                        return;
                    }

                    // Utiliser les modificateurs détectés par le hook (plus fiable)
                    Core.Inputs.ModifierKeys modifiers = Core.Inputs.ModifierKeys.None;
                    if (e.HasShift) modifiers |= Core.Inputs.ModifierKeys.Shift;
                    
                    // Alt Gr = Ctrl + Alt (on les stocke tous les deux pour l'exécution)
                    if (e.HasAltGr)
                    {
                        modifiers |= Core.Inputs.ModifierKeys.Control;
                        modifiers |= Core.Inputs.ModifierKeys.Alt;
                    }
                    else
                    {
                        // Si ce n'est pas Alt Gr, ajouter Ctrl et Alt séparément
                        if (e.HasCtrl) modifiers |= Core.Inputs.ModifierKeys.Control;
                        if (e.HasAlt) modifiers |= Core.Inputs.ModifierKeys.Alt;
                    }
                    
                    // Windows keys
                    if (IsKeyPressed(0x5B) || IsKeyPressed(0x5C))
                        modifiers |= Core.Inputs.ModifierKeys.Windows;

                    // Utiliser le caractère Unicode si disponible (plus fiable pour multilingue)
                    // Sinon, utiliser GetKeyName comme fallback
                    string keyName;
                    if (!string.IsNullOrEmpty(e.UnicodeCharacter))
                    {
                        keyName = e.UnicodeCharacter;
                    }
                    else
                    {
                        keyName = GetKeyName((ushort)keyCode);
                    }

                    // Créer une action clavier avec les modificateurs
                    var keyboardAction = new KeyboardAction
                    {
                        Name = FormatKeyNameWithModifiers(keyName, modifiers),
                        VirtualKeyCode = (ushort)keyCode,
                        ActionType = KeyboardActionType.Press,
                        Modifiers = modifiers
                    };

                    if (_selectedMacro != null && _selectedMacro.Actions != null)
                    {
                        _selectedMacro.Actions.Add(keyboardAction);
                    }
                    _lastActionTime = timestamp;

                    // Construire la description avec les modificateurs pour l'affichage
                    string actionDescription = FormatKeyNameWithModifiers(keyName, modifiers);
                    
                    // Afficher dans la zone d'actions
                    var actionItem = new ActionLogItem
                    {
                        Timestamp = timestamp.ToString("HH:mm:ss.fff"),
                        Description = $"Enregistré: {actionDescription}"
                    };

                    // Protéger l'accès à ActionsListBox
                    if (ActionsListBox != null)
                    {
                        var items = ActionsListBox.ItemsSource as System.Collections.ObjectModel.ObservableCollection<ActionLogItem> ??
                                   new System.Collections.ObjectModel.ObservableCollection<ActionLogItem>();

                        if (ActionsListBox.ItemsSource == null)
                        {
                            ActionsListBox.ItemsSource = items;
                        }

                        items.Add(actionItem);
                        
                        // Limiter à 100 actions (supprimer les plus anciennes en haut)
                        while (items.Count > 100)
                        {
                            items.RemoveAt(0);
                        }

                        // Mettre à jour le compteur seulement tous les 10 éléments pour réduire la charge
                        if (items.Count % 10 == 0 && ActionsCountText != null && _selectedMacro != null)
                        {
                            try
                            {
                                ActionsCountText.Text = $"{_selectedMacro.Actions?.Count ?? 0} action(s)";
                            }
                            catch
                            {
                                // Ignorer les erreurs de mise à jour du texte
                            }
                        }
                        
                        // Scroller vers le bas uniquement de temps en temps pour éviter la surcharge
                        if (ActionsListBox.Items.Count > 0 && ActionsListBox.Items.Count % 10 == 0)
                        {
                            try
                            {
                                ActionsListBox.ScrollIntoView(ActionsListBox.Items[ActionsListBox.Items.Count - 1]);
                            }
                            catch
                            {
                                // Ignorer les erreurs de scroll
                            }
                        }
                    }
                    
                    // Rafraîchir l'éditeur moins fréquemment pour éviter la surcharge (toutes les 500ms)
                    var now = DateTime.Now;
                    if ((now - _lastEditorRefresh).TotalMilliseconds >= EDITOR_REFRESH_INTERVAL_MS)
                    {
                        _lastEditorRefresh = now;
                        RefreshMacroEditor();
                    }
                }
                catch (Exception ex)
                {
                    // Log l'erreur mais ne bloque pas l'enregistrement
                    System.Diagnostics.Debug.WriteLine($"Erreur lors de l'enregistrement de la touche: {ex.Message}");
                    System.Diagnostics.Debug.WriteLine($"Stack trace: {ex.StackTrace}");
                    
                    // Retirer la touche en cas d'erreur pour éviter qu'elle reste bloquée
                    lock (_pressedKeysLock)
                    {
                        _pressedKeys.Remove(keyCode);
                    }
                    
                    // Afficher un message d'erreur à l'utilisateur
                    try
                    {
                        StatusText.Text = "⚠ Erreur lors de l'enregistrement. Ralentissez la saisie.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Red;
                    }
                    catch { }
                }
                finally
                {
                    // Libérer le verrou d'enregistrement
                    System.Threading.Interlocked.Exchange(ref _recordingInProgress, 0);
                }
            }), System.Windows.Threading.DispatcherPriority.Background);
        }

        private void KeyboardHook_KeyUp(object? sender, KeyboardHookEventArgs e)
        {
            if (!_isRecording || _isRecordingPaused)
                return;

            var keyCode = e.VirtualKeyCode;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                lock (_pressedKeysLock)
                {
                    _pressedKeys.Remove(keyCode);
                }
                _keyDownTimes.Remove(keyCode);
            }), System.Windows.Threading.DispatcherPriority.Normal);
        }

        private void MouseHook_MouseDown(object? sender, MouseHookEventArgs e)
        {
            // Vérifications ultra-rapides - retourner immédiatement
            if (!_isRecording || _isRecordingPaused || !_recordMouseClicks)
                return;

            // Vérifier si le clic est sur un bouton de contrôle
            if (IsClickOnRecordingControls(e.X, e.Y))
                return;

            // Ajouter à la queue et retourner IMMÉDIATEMENT
            // Le timer traitera les événements par lots
            _mouseEventQueue.Enqueue((e.X, e.Y, e.Button, DateTime.Now));
        }
        
        private void ProcessMouseEventQueue(object? sender, EventArgs e)
        {
            if (!_isRecording || _isRecordingPaused || _selectedMacro == null)
                return;
                
            // Traiter max 10 événements par tick pour éviter les blocages
            int processed = 0;
            while (processed < 10 && _mouseEventQueue.TryDequeue(out var evt))
            {
                processed++;
                
                _selectedMacro.Actions ??= new List<IInputAction>();

                // Ajouter un délai si nécessaire
                AddDelayIfNeeded();

                var mouseAction = new Core.Inputs.MouseAction
                {
                    Name = $"Clic {evt.Button}",
                    ActionType = evt.Button switch
                    {
                        Core.Hooks.MouseButton.Left => MouseActionType.LeftClick,
                        Core.Hooks.MouseButton.Right => MouseActionType.RightClick,
                        Core.Hooks.MouseButton.Middle => MouseActionType.MiddleClick,
                        _ => MouseActionType.LeftClick
                    },
                    X = evt.X,
                    Y = evt.Y
                };

                _selectedMacro.Actions.Add(mouseAction);
                _lastActionTime = evt.Time;
                
                // Ajouter au log
                _actionLogItems?.Add(new ActionLogItem
                {
                    Timestamp = evt.Time.ToString("HH:mm:ss.fff"),
                    Description = $"Clic {evt.Button} à ({evt.X}, {evt.Y})"
                });
            }
            
            // Mise à jour UI une seule fois après le traitement du lot
            if (processed > 0)
            {
                ActionsCountText.Text = $"{_selectedMacro?.Actions?.Count ?? 0} action(s)";
                
                // Limiter le log à 50 entrées
                while (_actionLogItems?.Count > 50)
                    _actionLogItems.RemoveAt(0);
                
                // Rafraîchir l'éditeur
                var now = DateTime.Now;
                if ((now - _lastEditorRefresh).TotalMilliseconds >= 500)
                {
                    _lastEditorRefresh = now;
                    RefreshMacroEditor();
                    TriggerAutoSave();
                }
            }
        }

        private void MouseHook_MouseUp(object? sender, MouseHookEventArgs e)
        {
            // Les clics sont déjà gérés dans MouseDown avec LeftClick/RightClick
        }

        private void MouseHook_MouseMove(object? sender, MouseHookEventArgs e)
        {
            // Mouvements de souris non enregistrés (option retirée de l'UI)
        }

        private void AddDelayIfNeeded()
        {
            // Toujours enregistrer les délais (option retirée de l'UI)

            if (_selectedMacro != null && _selectedMacro.Actions?.Count > 0)
            {
                // Ne pas ajouter de délai si la dernière action est déjà un délai
                var lastAction = _selectedMacro.Actions[_selectedMacro.Actions.Count - 1];
                if (lastAction is DelayAction)
                {
                    return; // Délai déjà ajouté, ne pas en ajouter un autre
                }

                var now = DateTime.Now;
                var elapsed = (now - _lastActionTime).TotalMilliseconds;
                if (elapsed > 50) // Ajouter un délai si plus de 50ms entre les actions
                {
                    var delayAction = new DelayAction
                    {
                        Name = $"{elapsed:F0}ms",
                        Duration = (int)elapsed
                    };
                    if (_selectedMacro != null)
                    {
                        _selectedMacro.Actions.Add(delayAction);
                        // Mettre à jour _lastActionTime après avoir ajouté le délai pour éviter les délais multiples
                        _lastActionTime = now;
                    }
                }
            }
        }

        private void ProcessRemainingKeys()
        {
            // Libérer toutes les touches restantes appuyées
            lock (_pressedKeysLock)
            {
                var keysToRemove = _pressedKeys.ToList();
                foreach (var keyCode in keysToRemove)
                {
                    _pressedKeys.Remove(keyCode);
                    _keyDownTimes.Remove(keyCode);
                }
            }
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0)
            {
                return "Aucune touche";
            }
            
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
                0x41 => "a",
                0x42 => "b",
                0x43 => "c",
                0x44 => "d",
                0x45 => "e",
                0x46 => "f",
                0x47 => "g",
                0x48 => "h",
                0x49 => "i",
                0x4A => "j",
                0x4B => "k",
                0x4C => "l",
                0x4D => "m",
                0x4E => "n",
                0x4F => "o",
                0x50 => "p",
                0x51 => "q",
                0x52 => "r",
                0x53 => "s",
                0x54 => "t",
                0x55 => "u",
                0x56 => "v",
                0x57 => "w",
                0x58 => "x",
                0x59 => "y",
                0x5A => "z",
                0x5B => "Windows Gauche",
                0x5C => "Windows Droit",
                0x5D => "Menu",
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
                0xBD => "8",      // Huit (touche 8 sur AZERTY, pas le tiret)
                0xBE => ":",      // Deux-points (Shift + ; sur AZERTY)
                0xBF => "!",      // Point d'exclamation (Shift + : sur AZERTY)
                0xC0 => "ù",      // U accent grave
                0xDB => "[",      // Crochet ouvrant
                0xDC => "\\",     // Antislash
                0xDD => "]",      // Crochet fermant
                0xDE => "^",      // Circonflexe
                _ => $"Touche {virtualKeyCode}"
            };
        }

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        private bool IsKeyPressed(int virtualKeyCode)
        {
            // Vérifier si la touche est actuellement pressée
            return (GetAsyncKeyState(virtualKeyCode) & 0x8000) != 0;
        }

        private bool IsModifierKey(int vkCode)
        {
            return vkCode == 0x10 || vkCode == 0x11 || vkCode == 0x12 || 
                   vkCode == 0xA0 || vkCode == 0xA1 || vkCode == 0xA2 || 
                   vkCode == 0xA3 || vkCode == 0xA4 || vkCode == 0xA5 ||
                   vkCode == 0x5B || vkCode == 0x5C;
        }

        private string FormatKeyNameWithModifiers(string keyName, Core.Inputs.ModifierKeys modifiers)
        {
            // Si on a un caractère Unicode (de ToUnicode), il contient déjà le caractère avec les modificateurs
            // Pas besoin d'afficher les modificateurs car le caractère est déjà le résultat final
            
            if (modifiers == Core.Inputs.ModifierKeys.None)
                return keyName;

            // Détecter Alt Gr (Ctrl + Alt ensemble) - ne pas afficher les modificateurs dans ce cas
            bool hasCtrl = (modifiers & Core.Inputs.ModifierKeys.Control) != 0;
            bool hasAlt = (modifiers & Core.Inputs.ModifierKeys.Alt) != 0;
            bool isAltGr = hasCtrl && hasAlt;

            // Si c'est Alt Gr, ne pas afficher les modificateurs (juste le caractère)
            if (isAltGr)
            {
                return keyName;
            }

            // Ne pas afficher Shift car le caractère Unicode contient déjà le résultat avec Shift
            // Ne garder que Ctrl, Alt et Windows si nécessaire
            var parts = new List<string>();
            if (hasCtrl) parts.Add("Ctrl");
            if (hasAlt) parts.Add("Alt");
            if ((modifiers & Core.Inputs.ModifierKeys.Windows) != 0) parts.Add("Win");

            return parts.Count > 0 ? string.Join("+", parts) + "+" + keyName : keyName;
        }

        private void PauseMacro_Click(object sender, RoutedEventArgs e)
        {
            // Si on est en train d'enregistrer, gérer la pause de l'enregistrement
            if (_isRecording)
            {
                if (!_isRecordingPaused)
                {
                    // Mettre en pause l'enregistrement
                    _isRecordingPaused = true;
                    PauseButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Play, " Reprendre");
                    StatusText.Text = "Enregistrement en pause";
                }
                else
                {
                    // Reprendre l'enregistrement
                    _isRecordingPaused = false;
                    PauseButton.Content = LucideIcons.CreateIconWithText(LucideIcons.Pause, " Pause");
                    StatusText.Text = "Enregistrement en cours... Appuyez sur les touches ou cliquez avec la souris";
                }
            }
            else
            {
                // Gérer la pause de l'exécution de macro (si nécessaire dans le futur)
            if (_macroEngine.State == MacroEngineState.Running)
            {
                    _macroEngine.PauseMacroAsync();
                    StatusText.Text = "Exécution en pause";
            }
            else if (_macroEngine.State == MacroEngineState.Paused)
            {
                    _macroEngine.ResumeMacroAsync();
                StatusText.Text = "Exécution en cours...";
                }
            }
        }

        private void StopMacro_Click(object sender, RoutedEventArgs e)
        {
            // Si on est en train d'enregistrer, arrêter l'enregistrement
            if (_isRecording)
            {
                StopRecording();
            }
            else
            {
                // Arrêter l'exécution de macro
                _stopRequested = true;
                _macroEngine.StopMacroAsync();
                StatusText.Text = "Arrêté";
            }
        }

        private void RefreshMacroEditor()
        {
            if (_blockEditor != null && _selectedMacro != null)
            {
                // On est déjà sur le thread UI, pas besoin de Dispatcher.Invoke
                _blockEditor.RefreshBlocks();
            }
        }

        // Cache pour les coordonnées de la fenêtre (mis à jour périodiquement)
        private RECT _cachedWindowRect;
        private DateTime _lastWindowRectUpdate = DateTime.MinValue;
        private IntPtr _cachedWindowHandle = IntPtr.Zero;
        
        // Cache des rectangles des boutons de contrôle
        private List<RECT> _controlButtonRects = new List<RECT>();
        
        private void CacheControlButtonRects()
        {
            _controlButtonRects.Clear();
            
            try
            {
                // Liste des boutons de contrôle à ignorer
                var controlButtons = new FrameworkElement[] 
                { 
                    StartButton, StopButton, PauseButton, ExecuteButton
                };
                
                foreach (var button in controlButtons)
                {
                    if (button != null && button.IsVisible)
                    {
                        try
                        {
                            var transform = button.TransformToAncestor(this);
                            var topLeft = transform.Transform(new Point(0, 0));
                            var bottomRight = transform.Transform(new Point(button.ActualWidth, button.ActualHeight));
                            
                            // Convertir en coordonnées écran
                            var screenTopLeft = PointToScreen(topLeft);
                            var screenBottomRight = PointToScreen(bottomRight);
                            
                            _controlButtonRects.Add(new RECT
                            {
                                Left = (int)screenTopLeft.X,
                                Top = (int)screenTopLeft.Y,
                                Right = (int)screenBottomRight.X,
                                Bottom = (int)screenBottomRight.Y
                            });
                        }
                        catch { }
                    }
                }
                
                System.Diagnostics.Debug.WriteLine($"[CacheControlButtonRects] {_controlButtonRects.Count} boutons de contrôle cachés");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[CacheControlButtonRects] Erreur: {ex.Message}");
            }
        }

        /// <summary>
        /// Indique si la macro contient une condition "Molette haut/bas" (nécessite le hook souris pendant l'exécution).
        /// </summary>
        private static bool MacroHasMouseWheelCondition(Macro macro)
        {
            if (macro?.Actions == null) return false;
            return ActionsContainMouseWheelCondition(macro.Actions);
        }

        private static bool ActionsContainMouseWheelCondition(IEnumerable<IInputAction> actions)
        {
            if (actions == null) return false;
            foreach (var action in actions)
            {
                if (action is IfAction ifAction)
                {
                    if (IfActionHasMouseWheelCondition(ifAction)) return true;
                    if (ifAction.ThenActions != null && ActionsContainMouseWheelCondition(ifAction.ThenActions)) return true;
                    if (ifAction.ElseActions != null && ActionsContainMouseWheelCondition(ifAction.ElseActions)) return true;
                    if (ifAction.ElseIfBranches != null)
                    {
                        foreach (var branch in ifAction.ElseIfBranches)
                        {
                            if (branch?.ConditionGroups != null)
                            {
                                foreach (var group in branch.ConditionGroups)
                                {
                                    if (group?.Conditions != null && group.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                                        return true;
                                }
                            }
                            if (branch?.Conditions != null && branch.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                                return true;
                            if (branch?.Actions != null && ActionsContainMouseWheelCondition(branch.Actions)) return true;
                        }
                    }
                    if (ifAction.ConditionGroups != null)
                    {
                        foreach (var group in ifAction.ConditionGroups)
                        {
                            if (group?.Conditions != null && group.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                                return true;
                        }
                    }
                    if (ifAction.Conditions != null && ifAction.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                        return true;
                }
                else if (action is RepeatAction repeatAction && repeatAction.Actions != null && ActionsContainMouseWheelCondition(repeatAction.Actions))
                    return true;
            }
            return false;
        }

        private static bool IfActionHasMouseWheelCondition(IfAction ifAction)
        {
            if (ifAction.ConditionGroups != null)
            {
                foreach (var group in ifAction.ConditionGroups)
                {
                    if (group?.Conditions != null && group.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                        return true;
                }
            }
            if (ifAction.Conditions != null && ifAction.Conditions.Any(c => c?.MouseClickConfig != null && (c.MouseClickConfig.ClickType == 6 || c.MouseClickConfig.ClickType == 7)))
                return true;
            return false;
        }
        
        private bool IsClickOnRecordingControls(int x, int y)
        {
            foreach (var rect in _controlButtonRects)
            {
                if (x >= rect.Left && x <= rect.Right && y >= rect.Top && y <= rect.Bottom)
                {
                    return true;
                }
            }
            return false;
        }
        
        private bool IsClickInApplicationWindow(int x, int y)
        {
            try
            {
                // Mettre à jour le cache toutes les 500ms ou si le handle n'est pas encore récupéré
                var now = DateTime.Now;
                if (_cachedWindowHandle == IntPtr.Zero || (now - _lastWindowRectUpdate).TotalMilliseconds > 500)
                {
                    // Doit être fait sur le thread UI
                    if (Dispatcher.CheckAccess())
                    {
                        _cachedWindowHandle = new WindowInteropHelper(this).Handle;
                        if (_cachedWindowHandle != IntPtr.Zero)
                        {
                            GetWindowRect(_cachedWindowHandle, out _cachedWindowRect);
                        }
                        _lastWindowRectUpdate = now;
                    }
                    else
                    {
                        // Si on n'est pas sur le thread UI, utiliser le cache existant
                        // ou ne pas filtrer si pas de cache
                        if (_cachedWindowHandle == IntPtr.Zero)
                            return false;
                    }
                }
                
                if (_cachedWindowHandle == IntPtr.Zero)
                    return false;

                // Mettre à jour les coordonnées de la fenêtre (peut être fait depuis n'importe quel thread)
                GetWindowRect(_cachedWindowHandle, out RECT rect);
                
                // Vérifier si le point est dans le rectangle
                bool isInWindow = x >= rect.Left && x <= rect.Right && y >= rect.Top && y <= rect.Bottom;
                
                System.Diagnostics.Debug.WriteLine($"[IsClickInApplicationWindow] Click({x},{y}) Window({rect.Left},{rect.Top},{rect.Right},{rect.Bottom}) InWindow={isInWindow}");
                
                return isInWindow;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[IsClickInApplicationWindow] Erreur: {ex.Message}");
                // En cas d'erreur, on ne filtre pas (mieux vaut enregistrer que de perdre des actions)
            }

            return false;
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        private void NewMacro_Click(object sender, RoutedEventArgs e)
        {
            var macro = new Macro
            {
                Name = "Nouvelle Macro",
                Description = "Description de la macro"
            };
            _macros.Add(macro);
            MacrosListBox.ItemsSource = null;
            MacrosListBox.ItemsSource = _macros;
            MacrosListBox.SelectedItem = macro;
        }

        private void DeleteMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro != null)
            {
                _macros.Remove(_selectedMacro);
                MacrosListBox.ItemsSource = null;
                MacrosListBox.ItemsSource = _macros;
                _selectedMacro = null;
            }
        }


        private void NewProfile_Click(object sender, RoutedEventArgs e)
        {
            // Créer un nouveau profil
            var newProfile = new MacroProfile
            {
                Id = Guid.NewGuid().ToString(),
                Name = "Nouveau Profil",
                Description = "",
                MacroIds = new List<string>(),
                CreatedAt = DateTime.Now,
                ModifiedAt = DateTime.Now
            };

            // Créer une fenêtre pour éditer le profil
            var profileWindow = new Window
            {
                Title = "Nouveau Profil",
                Width = 600,
                Height = 500,
                Owner = this,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var profileEditor = new ProfileEditor();
            profileEditor.SetProfileProvider(_profileProvider);
            profileEditor.LoadProfile(newProfile, _macros, _profileProvider);

            // Gérer la sauvegarde
            profileEditor.ProfileSaved += async (s, args) =>
            {
                // Recharger les profils après sauvegarde
                await LoadProfilesAsync();
                profileWindow.Close();
            };

            profileWindow.Content = profileEditor;
            profileWindow.ShowDialog();
        }

        private async void ManageProfiles_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var profilesWindow = new Window
                {
                    Title = "Gérer les Profils",
                    Width = 700,
                    Height = 500,
                    Owner = this,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner
                };

                var grid = new Grid();
                grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
                grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

                // ListBox pour afficher les profils
                var profilesListBox = new ListBox();
                var profiles = await _profileProvider.LoadProfilesAsync();
                profilesListBox.ItemsSource = profiles;
                profilesListBox.DisplayMemberPath = "Name";

                Grid.SetRow(profilesListBox, 0);
                grid.Children.Add(profilesListBox);

                // Panel de boutons
                var buttonPanel = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    Margin = new Thickness(10)
                };

                var editButton = new Button { Content = "Modifier", Margin = new Thickness(0, 0, 5, 0), Padding = new Thickness(10, 5, 10, 5) };
                var deleteButton = new Button { Content = "Supprimer", Margin = new Thickness(0, 0, 5, 0), Padding = new Thickness(10, 5, 10, 5) };
                var activateButton = new Button { Content = "Activer", Margin = new Thickness(0, 0, 5, 0), Padding = new Thickness(10, 5, 10, 5) };
                var closeButton = new Button { Content = "Fermer", Padding = new Thickness(10, 5, 10, 5) };

                editButton.Click += (s, args) =>
                {
                    if (profilesListBox.SelectedItem is MacroProfile profile)
                    {
                        // Ouvrir l'éditeur
                        var editWindow = new Window
                        {
                            Title = $"Éditer: {profile.Name}",
                            Width = 600,
                            Height = 500,
                            Owner = profilesWindow,
                            WindowStartupLocation = WindowStartupLocation.CenterOwner
                        };

                        var editor = new ProfileEditor();
                        editor.SetProfileProvider(_profileProvider);
                        editor.LoadProfile(profile, _macros, _profileProvider);

                        editor.ProfileSaved += async (sender, e) =>
                        {
                            await RefreshProfilesList(profilesListBox);
                            editWindow.Close();
                        };

                        editWindow.Content = editor;
                        editWindow.ShowDialog();
                    }
                    else
                    {
                        StatusText.Text = "Veuillez sélectionner un profil à modifier.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                };

                deleteButton.Click += async (s, args) =>
                {
                    if (profilesListBox.SelectedItem is MacroProfile profile)
                    {
                        var result = MessageBox.Show(
                            $"Êtes-vous sûr de vouloir supprimer le profil '{profile.Name}' ?",
                            "Confirmation",
                            MessageBoxButton.YesNo,
                            MessageBoxImage.Question);

                        if (result == MessageBoxResult.Yes)
                        {
                            await _profileProvider.DeleteProfileAsync(profile.Id);
                            await RefreshProfilesList(profilesListBox);
                            await LoadProfilesAsync(); // Recharger dans MainWindow
                        }
                    }
                    else
                    {
                        StatusText.Text = "Veuillez sélectionner un profil à supprimer.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                };

                activateButton.Click += async (s, args) =>
                {
                    if (profilesListBox.SelectedItem is MacroProfile profile)
                    {
                        await _profileProvider.ActivateProfileAsync(profile.Id);
                        await RefreshProfilesList(profilesListBox);
                        await LoadProfilesAsync(); // Recharger dans MainWindow
                        
                        StatusText.Text = $"Profil '{profile.Name}' activé.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    }
                    else
                    {
                        StatusText.Text = "Veuillez sélectionner un profil à activer.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                };

                closeButton.Click += (s, args) => profilesWindow.Close();

                buttonPanel.Children.Add(editButton);
                buttonPanel.Children.Add(deleteButton);
                buttonPanel.Children.Add(activateButton);
                buttonPanel.Children.Add(closeButton);

                Grid.SetRow(buttonPanel, 1);
                grid.Children.Add(buttonPanel);

                profilesWindow.Content = grid;
                profilesWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors de la gestion des profils", ex, "MainWindow");
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private async Task RefreshProfilesList(ListBox listBox)
        {
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                listBox.ItemsSource = null;
                listBox.ItemsSource = profiles;
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du rafraîchissement de la liste des profils", ex, "MainWindow");
            }
        }

        private async void ChangeProfile_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                
                if (profiles.Count == 0)
                {
                    StatusText.Text = "Aucun profil disponible. Créez d'abord un profil.";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                var selectWindow = new Window
                {
                    Title = "Sélectionner un Profil",
                    Width = 400,
                    Height = 300,
                    Owner = this,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner
                };

                var grid = new Grid();
                grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
                grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

                var profilesListBox = new ListBox();
                profilesListBox.ItemsSource = profiles;
                profilesListBox.DisplayMemberPath = "Name";

                Grid.SetRow(profilesListBox, 0);
                grid.Children.Add(profilesListBox);

                var buttonPanel = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    Margin = new Thickness(10)
                };

                var activateButton = new Button 
                { 
                    Content = "Activer", 
                    Margin = new Thickness(0, 0, 5, 0), 
                    Padding = new Thickness(10, 5, 10, 5) 
                };
                var cancelButton = new Button 
                { 
                    Content = "Annuler", 
                    Padding = new Thickness(10, 5, 10, 5) 
                };

                activateButton.Click += async (s, args) =>
                {
                    if (profilesListBox.SelectedItem is MacroProfile profile)
                    {
                        await _profileProvider.ActivateProfileAsync(profile.Id);
                        await LoadProfilesAsync();
                        selectWindow.Close();
                        
                        StatusText.Text = $"Profil '{profile.Name}' activé.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    }
                    else
                    {
                        StatusText.Text = "Veuillez sélectionner un profil.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                };

                cancelButton.Click += (s, args) => selectWindow.Close();

                buttonPanel.Children.Add(activateButton);
                buttonPanel.Children.Add(cancelButton);

                Grid.SetRow(buttonPanel, 1);
                grid.Children.Add(buttonPanel);

                selectWindow.Content = grid;
                selectWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du changement de profil", ex, "MainWindow");
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private async void Settings_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Désactiver les hooks globaux pour empêcher l'exécution des macros pendant la configuration
                DisableGlobalHooks();
                
                var settingsWindow = new SettingsWindow(_appConfig ?? new MacroEngineConfig());
                settingsWindow.Owner = this;
                
                try
                {
                    if (settingsWindow.ShowDialog() == true && settingsWindow.Config != null)
                    {
                        // Sauvegarder la nouvelle configuration
                        await _configStorage.SaveConfigAsync(settingsWindow.Config);
                        _appConfig = settingsWindow.Config;
                        
                        // Réinstaller les hooks avec les nouveaux raccourcis
                        InitializeGlobalHooks();
                        
                        // Mettre à jour le texte du bouton Exécuter avec le nouveau raccourci
                        UpdateExecuteButtonText();
                        
                        ApplyTestAndActionsPanelVisibility();
                        
                        _logger?.Info($"Configuration mise à jour - Exécuter: VK{_appConfig.ExecuteMacroKeyCode:X2}, Arrêter: VK{_appConfig.StopMacroKeyCode:X2}", "MainWindow");
                        
                        StatusText.Text = "Configuration sauvegardée.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    }
                    else
                    {
                        // Réactiver les hooks même si l'utilisateur a annulé
                        InitializeGlobalHooks();
                    }
                }
                finally
                {
                    // S'assurer que les hooks sont réactivés même en cas d'erreur
                    InitializeGlobalHooks();
                }
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors de l'ouverture de la fenêtre de configuration", ex, "MainWindow");
                StatusText.Text = $"Erreur configuration: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
                
                // Réactiver les hooks en cas d'erreur
                InitializeGlobalHooks();
            }
        }

        private void ShowLogs_Click(object sender, RoutedEventArgs e)
        {
            if (_logsWindow == null)
            {
                _logsWindow = new LogsWindow(_logEntries, _logger);
            }
            _logsWindow.Show();
            _logsWindow.Activate();
        }

        private async void SaveMacro_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_selectedMacro == null)
                {
                    StatusText.Text = "Aucune macro sélectionnée";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                // Mettre à jour la date de modification
                _selectedMacro.ModifiedAt = DateTime.Now;

                // Sauvegarder toutes les macros
                await _macroStorage.SaveMacrosAsync(_macros);

                StatusText.Text = $"Macro '{_selectedMacro.Name}' sauvegardée";
                StatusText.Foreground = System.Windows.Media.Brushes.Green;
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de la sauvegarde: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private async void ExportMacro_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_selectedMacro == null)
                {
                    StatusText.Text = "Aucune macro sélectionnée";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                var saveDialog = new SaveFileDialog
                {
                    Filter = "Fichiers JSON (*.json)|*.json|Tous les fichiers (*.*)|*.*",
                    FileName = $"{_selectedMacro.Name}.json",
                    DefaultExt = "json",
                    Title = "Exporter la macro"
                };

                if (saveDialog.ShowDialog() == true)
                {
                    await _macroStorage.ExportMacroAsync(_selectedMacro, saveDialog.FileName);
                    
                    StatusText.Text = $"Macro '{_selectedMacro.Name}' exportée vers {System.IO.Path.GetFileName(saveDialog.FileName)}";
                    StatusText.Foreground = System.Windows.Media.Brushes.Green;
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de l'export: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private async void ImportMacro_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var openDialog = new OpenFileDialog
                {
                    Filter = "Fichiers JSON (*.json)|*.json|Tous les fichiers (*.*)|*.*",
                    DefaultExt = "json",
                    Title = "Importer une macro"
                };

                if (openDialog.ShowDialog() == true)
                {
                    var importedMacro = await _macroStorage.ImportMacroAsync(openDialog.FileName);
                    
                    // Vérifier si une macro avec le même nom existe déjà
                    var existingMacro = _macros.FirstOrDefault(m => m.Name == importedMacro.Name);
                    if (existingMacro != null)
                    {
                        var result = MessageBox.Show(
                            $"Une macro nommée '{importedMacro.Name}' existe déjà.\n\nVoulez-vous la remplacer ou créer une copie avec un nom différent?",
                            "Macro existante",
                            MessageBoxButton.YesNoCancel,
                            MessageBoxImage.Question,
                            MessageBoxResult.Cancel);

                        if (result == MessageBoxResult.Yes)
                        {
                            // Remplacer la macro existante
                            var index = _macros.IndexOf(existingMacro);
                            _macros[index] = importedMacro;
                            importedMacro.Id = existingMacro.Id; // Garder l'ID original
                        }
                        else if (result == MessageBoxResult.No)
                        {
                            // Créer une copie avec un nom différent
                            importedMacro.Name = $"{importedMacro.Name} (Importé)";
                            _macros.Add(importedMacro);
                        }
                        else
                        {
                            // Annuler
                            return;
                        }
                    }
                    else
                    {
                        // Ajouter la nouvelle macro
                        _macros.Add(importedMacro);
                    }

                    // Sauvegarder toutes les macros
                    await _macroStorage.SaveMacrosAsync(_macros);

                    // Rafraîchir la liste et sélectionner la macro importée
                    MacrosListBox.ItemsSource = null;
                    MacrosListBox.ItemsSource = _macros;
                    MacrosListBox.SelectedItem = importedMacro;

                    StatusText.Text = $"Macro '{importedMacro.Name}' importée avec succès";
                    StatusText.Foreground = System.Windows.Media.Brushes.Green;
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de l'import: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        #region Propriétés de la macro (panneau droite)

        private void MacroNameTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_selectedMacro != null && MacroNameTextBox.Text != _selectedMacro.Name)
            {
                _selectedMacro.Name = MacroNameTextBox.Text;
                _selectedMacro.ModifiedAt = DateTime.Now;
                // Rafraîchir la liste des macros pour montrer le nouveau nom
                var index = MacrosListBox.SelectedIndex;
                MacrosListBox.Items.Refresh();
                MacrosListBox.SelectedIndex = index;
                _ = _macroStorage.SaveMacrosAsync(_macros);
            }
        }

        private void MacroDescriptionTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_selectedMacro != null && MacroDescriptionTextBox.Text != _selectedMacro.Description)
            {
                _selectedMacro.Description = MacroDescriptionTextBox.Text;
                _selectedMacro.ModifiedAt = DateTime.Now;
                _ = _macroStorage.SaveMacrosAsync(_macros);
            }
        }

        private void SetShortcut_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null)
            {
                StatusText.Text = "Veuillez sélectionner une macro.";
                StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                return;
            }

            _isCapturingShortcut = true;
            if (ShortcutDisplayText != null)
            {
                ShortcutDisplayText.Inlines.Clear();
                ShortcutDisplayText.Inlines.Add(new System.Windows.Documents.Run(LucideIcons.Keyboard) { FontFamily = (System.Windows.Media.FontFamily)Application.Current.FindResource("FontLucide") });
                ShortcutDisplayText.Inlines.Add(new System.Windows.Documents.Run(" En cours…"));
            }
            StatusText.Text = "Appuyez sur une touche (Échap = annuler)";
            StatusText.Foreground = System.Windows.Media.Brushes.Orange;
            PreviewKeyDown += CaptureShortcut_PreviewKeyDown;
            Focus();
        }

        private void CaptureShortcut_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (!_isCapturingShortcut || _selectedMacro == null)
                return;

            PreviewKeyDown -= CaptureShortcut_PreviewKeyDown;
            _isCapturingShortcut = false;

            if (e.Key == Key.Escape)
            {
                if (ShortcutDisplayText != null)
                    ShortcutDisplayText.Text = _selectedMacro.ShortcutKeyCode > 0 ? GetKeyName((ushort)_selectedMacro.ShortcutKeyCode) : "Non défini";
                StatusText.Text = "Raccourci non modifié.";
                StatusText.Foreground = System.Windows.Media.Brushes.Gray;
                e.Handled = true;
                return;
            }

            if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                e.Key == Key.LWin || e.Key == Key.RWin)
            {
                if (ShortcutDisplayText != null)
                    ShortcutDisplayText.Text = _selectedMacro.ShortcutKeyCode > 0 ? GetKeyName((ushort)_selectedMacro.ShortcutKeyCode) : "Non défini";
                StatusText.Text = "Appuyez sur une touche (Échap = annuler)";
                PreviewKeyDown += CaptureShortcut_PreviewKeyDown;
                _isCapturingShortcut = true;
                e.Handled = true;
                return;
            }

            e.Handled = true;
            int vkCode = System.Windows.Input.KeyInterop.VirtualKeyFromKey(e.Key);
            if (vkCode == 0)
            {
                if (ShortcutDisplayText != null)
                    ShortcutDisplayText.Text = _selectedMacro.ShortcutKeyCode > 0 ? GetKeyName((ushort)_selectedMacro.ShortcutKeyCode) : "Non défini";
                return;
            }

            _selectedMacro.ShortcutKeyCode = vkCode;
            _selectedMacro.ModifiedAt = DateTime.Now;

            if (_appConfig != null &&
                (_selectedMacro.ShortcutKeyCode == _appConfig.ExecuteMacroKeyCode ||
                 _selectedMacro.ShortcutKeyCode == _appConfig.StopMacroKeyCode))
            {
                MessageBox.Show(
                    $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par un raccourci global.\nVeuillez choisir un autre raccourci.",
                    "Conflit de raccourci",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                _selectedMacro.ShortcutKeyCode = 0;
            }
            else
            {
                var conflictingMacro = _macros.FirstOrDefault(m =>
                    m.Id != _selectedMacro.Id &&
                    m.ShortcutKeyCode == _selectedMacro.ShortcutKeyCode &&
                    m.ShortcutKeyCode != 0);
                if (conflictingMacro != null)
                {
                    MessageBox.Show(
                        $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par la macro '{conflictingMacro.Name}'.\nVeuillez choisir un autre raccourci.",
                        "Conflit de raccourci",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                    _selectedMacro.ShortcutKeyCode = 0;
                }
            }

            UpdateMacroShortcuts();
            if (_appConfig?.EnableHooks == true)
            {
                try
                {
                    _globalMacroShortcutsHook?.Uninstall();
                    _globalMacroShortcutsHook?.Install();
                }
                catch { }
            }

            if (ShortcutDisplayText != null)
                ShortcutDisplayText.Text = _selectedMacro.ShortcutKeyCode > 0 ? GetKeyName((ushort)_selectedMacro.ShortcutKeyCode) : "Non défini";
            MacrosListBox.Items.Refresh();
            _ = _macroStorage.SaveMacrosAsync(_macros);

            if (_selectedMacro.ShortcutKeyCode != 0)
            {
                StatusText.Text = $"Raccourci : {GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}";
                StatusText.Foreground = System.Windows.Media.Brushes.Green;
            }
            else
            {
                StatusText.Text = "Raccourci non défini (conflit).";
                StatusText.Foreground = System.Windows.Media.Brushes.Orange;
            }
        }

        private void SelectApps_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null)
            {
                StatusText.Text = "Veuillez sélectionner une macro.";
                StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                return;
            }

            // Ouvrir le dialogue de sélection d'applications
            var dialog = new AppSelectorDialog();
            dialog.Owner = this;
            // Charger les applications déjà sélectionnées
            if (_selectedMacro.TargetApplications != null)
            {
                dialog.SelectedApplications = _selectedMacro.TargetApplications;
            }
            if (dialog.ShowDialog() == true)
            {
                _selectedMacro.TargetApplications = dialog.SelectedApplications;
                _selectedMacro.ModifiedAt = DateTime.Now;
                UpdateTargetAppsDisplay();
                _ = _macroStorage.SaveMacrosAsync(_macros);
            }
        }

        private void UpdateTargetAppsDisplay()
        {
            if (TargetAppsPanel == null) return;

            TargetAppsPanel.Children.Clear();

            if (_selectedMacro == null || _selectedMacro.TargetApplications == null || _selectedMacro.TargetApplications.Count == 0)
            {
                var noAppsText = new System.Windows.Controls.TextBlock
                {
                    Text = "Toutes les applications",
                    Style = (Style)FindResource("TextMuted")
                };
                TargetAppsPanel.Children.Add(noAppsText);
            }
            else
            {
                foreach (var app in _selectedMacro.TargetApplications)
                {
                    var appName = System.IO.Path.GetFileNameWithoutExtension(app);
                    var tag = new Border
                    {
                        Background = (System.Windows.Media.Brush)FindResource("AccentPrimaryBrush"),
                        CornerRadius = new CornerRadius(4),
                        Padding = new Thickness(8, 4, 8, 4),
                        Margin = new Thickness(0, 0, 4, 4)
                    };
                    tag.Child = new System.Windows.Controls.TextBlock
                    {
                        Text = appName,
                        Foreground = System.Windows.Media.Brushes.White,
                        FontSize = 11
                    };
                    TargetAppsPanel.Children.Add(tag);
                }
            }
        }

        private void UpdateMacroPropertiesPanel()
        {
            if (_selectedMacro != null)
            {
                MacroNameTextBox.Text = _selectedMacro.Name;
                MacroDescriptionTextBox.Text = _selectedMacro.Description ?? "";
                UpdateMacroSummary();
                // Afficher le raccourci
                if (_selectedMacro.ShortcutKeyCode > 0)
                {
                    ShortcutDisplayText.Text = GetKeyName((ushort)_selectedMacro.ShortcutKeyCode);
                }
                else
                {
                    ShortcutDisplayText.Text = "Non défini";
                }

                UpdateTargetAppsDisplay();

                // Surveillance continue
                ContinuousMonitoringCheckBox.IsChecked = _selectedMacro.ContinuousMonitoring;
                ContinuousMonitoringOptionsPanel.Visibility = _selectedMacro.ContinuousMonitoring ? Visibility.Visible : Visibility.Collapsed;
                ContinuousMonitoringIntervalTextBox.Text = _selectedMacro.ContinuousMonitoringIntervalMs.ToString();
            }
            else
            {
                MacroNameTextBox.Text = "";
                MacroDescriptionTextBox.Text = "";
                MacroSummaryText.Text = "";
                ShortcutDisplayText.Text = "Non défini";
                UpdateTargetAppsDisplay();
                ContinuousMonitoringCheckBox.IsChecked = false;
                ContinuousMonitoringOptionsPanel.Visibility = Visibility.Collapsed;
            }
        }

        /// <summary>
        /// Met à jour le résumé de la macro (ce qu'elle fait) dans le panneau propriétés.
        /// </summary>
        private void UpdateMacroSummary()
        {
            MacroSummaryText.Text = GetMacroSummary(_selectedMacro);
        }

        /// <summary>
        /// Génère un résumé lisible et logique décrivant ce que fait la macro (phrases naturelles).
        /// Regroupe les actions consécutives identiques ou de même catégorie (ex. "fait 3 pauses", "appuie sur les touches A, B, C").
        /// </summary>
        private string GetMacroSummary(Macro? macro)
        {
            if (macro == null) return "";
            var actions = macro.Actions;
            if (actions == null || actions.Count == 0) return "Aucune action définie.";
            const int maxActions = 20;
            const int maxLength = 400;
            var items = new List<(string phrase, string category)>();
            for (int i = 0; i < Math.Min(actions.Count, maxActions); i++)
            {
                var phrase = GetActionSummaryPhrase(actions[i], nestedDepth: 0);
                if (!string.IsNullOrEmpty(phrase))
                    items.Add((phrase, GetCategoryKey(phrase)));
            }
            var grouped = MergeConsecutiveItems(items);
            var parts = grouped.Select(g => FormatGroupedPhrase(g.phrases, g.counts)).ToList();
            string description = parts.Count == 1 ? parts[0] : string.Join(", puis ", parts);
            if (description.Length > maxLength)
                description = description.Substring(0, maxLength - 1).TrimEnd() + "…";
            if (actions.Count > maxActions)
                description += " (plus d'actions à la suite)";
            if (!description.EndsWith(".") && !description.EndsWith("…") && !description.EndsWith(")"))
                description += ".";
            if (description.Length > 0)
                description = char.ToUpperInvariant(description[0]) + description.Substring(1);
            return description;
        }

        /// <summary>
        /// Fusionne les items consécutifs identiques (même phrase) ou de même catégorie (pour regroupement sémantique).
        /// </summary>
        private static List<(List<string> phrases, List<int> counts)> MergeConsecutiveItems(List<(string phrase, string category)> items)
        {
            var result = new List<(List<string> phrases, List<int> counts)>();
            foreach (var (phrase, category) in items)
            {
                bool merged = false;
                if (result.Count > 0)
                {
                    var last = result[result.Count - 1];
                    bool samePhrase = last.phrases.Count == 1 && string.Equals(last.phrases[0], phrase, StringComparison.OrdinalIgnoreCase);
                    bool sameCategory = !string.IsNullOrEmpty(category) && last.phrases.Count > 0 &&
                        GetCategoryKey(last.phrases[0]) == category && GetCategoryKey(phrase) == category;
                    if (samePhrase)
                    {
                        result[result.Count - 1] = (last.phrases, new List<int> { last.counts[0] + 1 });
                        merged = true;
                    }
                    else if (sameCategory && CanMergeCategory(category, last.phrases, phrase))
                    {
                        last.phrases.Add(phrase);
                        last.counts.Add(1);
                        result[result.Count - 1] = (last.phrases, last.counts);
                        merged = true;
                    }
                }
                if (!merged)
                    result.Add((new List<string> { phrase }, new List<int> { 1 }));
            }
            return result;
        }

        private static string GetCategoryKey(string phrase)
        {
            if (phrase.StartsWith("appuie sur la touche ", StringComparison.OrdinalIgnoreCase)) return "key_press";
            if (phrase.StartsWith("maintient la touche ", StringComparison.OrdinalIgnoreCase)) return "key_down";
            if (phrase.StartsWith("relâche la touche ", StringComparison.OrdinalIgnoreCase)) return "key_up";
            if (phrase == "fait un clic gauche" || phrase == "fait un clic droit" || phrase == "fait un clic milieu" ||
                phrase == "fait un double-clic gauche" || phrase == "fait un double-clic droit") return "click";
            if (phrase.StartsWith("fait une pause", StringComparison.OrdinalIgnoreCase)) return "pause";
            if (phrase == "scroll avec la molette vers le haut" || phrase == "scroll avec la molette vers le bas") return "wheel";
            return "";
        }

        private static bool CanMergeCategory(string category, List<string> existingPhrases, string newPhrase)
        {
            const int maxMerged = 5;
            if (existingPhrases.Count >= maxMerged) return false;
            if (category == "key_press" || category == "key_down" || category == "key_up") return true;
            if (category == "click") return true;
            if (category == "pause") return true;
            if (category == "wheel") return true;
            return false;
        }

        /// <summary>
        /// Formate un groupe de phrases (même phrase répétée ou catégorie commune) pour le résumé.
        /// </summary>
        private static string FormatGroupedPhrase(List<string> phrases, List<int> counts)
        {
            if (phrases == null || phrases.Count == 0) return "";
            if (phrases.Count == 1 && counts.Count == 1)
                return FormatGroupedPhraseSingle(phrases[0], counts[0]);
            string cat = GetCategoryKey(phrases[0]);
            if (cat == "key_press" && phrases.All(p => p.StartsWith("appuie sur la touche ", StringComparison.OrdinalIgnoreCase)))
            {
                var keys = new List<string>();
                for (int i = 0; i < phrases.Count; i++)
                {
                    string key = phrases[i].Substring("appuie sur la touche ".Length);
                    for (int j = 0; j < counts[i]; j++) keys.Add(key);
                }
                return FormatKeyList(keys, "appuie sur les touches ");
            }
            if (cat == "key_down" && phrases.All(p => p.StartsWith("maintient la touche ", StringComparison.OrdinalIgnoreCase)))
            {
                var keys = new List<string>();
                for (int i = 0; i < phrases.Count; i++)
                {
                    string key = phrases[i].Substring("maintient la touche ".Length).Replace(" enfoncée", "");
                    for (int j = 0; j < counts[i]; j++) keys.Add(key);
                }
                return FormatKeyList(keys, "maintient les touches ");
            }
            if (cat == "key_up" && phrases.All(p => p.StartsWith("relâche la touche ", StringComparison.OrdinalIgnoreCase)))
            {
                var keys = new List<string>();
                for (int i = 0; i < phrases.Count; i++)
                {
                    string key = phrases[i].Substring("relâche la touche ".Length);
                    for (int j = 0; j < counts[i]; j++) keys.Add(key);
                }
                return FormatKeyList(keys, "relâche les touches ");
            }
            if (cat == "click")
            {
                int total = counts.Sum();
                var types = new List<string>();
                for (int i = 0; i < phrases.Count; i++)
                {
                    string t = phrases[i] switch
                    {
                        "fait un clic gauche" => "gauche",
                        "fait un clic droit" => "droit",
                        "fait un clic milieu" => "milieu",
                        "fait un double-clic gauche" => "double gauche",
                        "fait un double-clic droit" => "double droit",
                        _ => "clic"
                    };
                    for (int j = 0; j < counts[i]; j++) types.Add(t);
                }
                string detail = types.Count <= 3 ? string.Join(", ", types) : $"{string.Join(", ", types.Take(2))}, … ({total} au total)";
                return total == 1 ? phrases[0] : $"fait {total} clics ({detail})";
            }
            if (cat == "pause")
            {
                int total = counts.Sum();
                return total == 1 ? phrases[0] : $"fait {total} pauses";
            }
            if (cat == "wheel")
            {
                int total = counts.Sum();
                bool allUp = phrases.All(p => p.Contains("haut", StringComparison.OrdinalIgnoreCase));
                bool allDown = phrases.All(p => p.Contains("bas", StringComparison.OrdinalIgnoreCase));
                if (total == 1) return phrases[0];
                if (allUp) return $"scroll {total} fois avec la molette vers le haut";
                if (allDown) return $"scroll {total} fois avec la molette vers le bas";
                return $"scroll {total} fois avec la molette";
            }
            return FormatGroupedPhraseSingle(phrases[0], counts[0]);
        }

        private static string FormatKeyList(List<string> keys, string prefix)
        {
            const int maxShow = 4;
            var distinct = keys.Distinct().ToList();
            if (distinct.Count == 1) return $"{prefix.TrimEnd().Replace("les touches", "la touche")} {distinct[0]} (×{keys.Count})";
            string list = distinct.Count <= maxShow
                ? string.Join(", ", distinct.Take(maxShow))
                : string.Join(", ", distinct.Take(maxShow - 1)) + " et " + (distinct.Count - maxShow + 1) + " autres";
            if (keys.Count > 1) list += $" (×{keys.Count})";
            return prefix + list;
        }

        /// <summary>
        /// Formate une phrase unique répétée (count > 1 = pluriel / N fois).
        /// </summary>
        private static string FormatGroupedPhraseSingle(string phrase, int count)
        {
            if (count <= 1) return phrase;
            if (phrase.StartsWith("fait une pause aléatoire", StringComparison.OrdinalIgnoreCase))
                return $"fait {count} pauses aléatoires";
            if (phrase.StartsWith("fait une pause selon la variable ", StringComparison.OrdinalIgnoreCase))
                return $"fait {count} pauses selon la variable {phrase.Substring("fait une pause selon la variable ".Length)}";
            if (phrase == "fait une pause (durée variable)")
                return $"fait {count} pauses (durée variable)";
            if (phrase == "fait une pause")
                return $"fait {count} pauses";
            if (phrase == "fait un clic gauche") return $"fait {count} clics gauches";
            if (phrase == "fait un clic droit") return $"fait {count} clics droits";
            if (phrase == "fait un clic milieu") return $"fait {count} clics milieux";
            if (phrase == "fait un double-clic gauche") return $"fait {count} double-clics gauches";
            if (phrase == "fait un double-clic droit") return $"fait {count} double-clics droits";
            if (phrase == "déplace le curseur") return $"déplace {count} fois le curseur";
            if (phrase == "utilise la molette") return $"utilise {count} fois la molette";
            if (phrase == "scroll en continu") return $"scroll {count} fois en continu";
            if (phrase.StartsWith("appuie sur la touche ", StringComparison.OrdinalIgnoreCase))
                return $"appuie {count} fois sur la touche {phrase.Substring("appuie sur la touche ".Length)}";
            if (phrase.StartsWith("maintient la touche ", StringComparison.OrdinalIgnoreCase))
                return $"maintient {count} fois la touche {phrase.Substring("maintient la touche ".Length)}";
            if (phrase.StartsWith("relâche la touche ", StringComparison.OrdinalIgnoreCase))
                return $"relâche {count} fois la touche {phrase.Substring("relâche la touche ".Length)}";
            if (phrase.StartsWith("maintient le clic ", StringComparison.OrdinalIgnoreCase))
                return $"maintient {count} fois le clic {phrase.Substring("maintient le clic ".Length)}";
            if (phrase.StartsWith("relâche le clic ", StringComparison.OrdinalIgnoreCase))
                return $"relâche {count} fois le clic {phrase.Substring("relâche le clic ".Length)}";
            if (phrase.StartsWith("scroll avec la molette vers le ", StringComparison.OrdinalIgnoreCase))
                return $"scroll {count} fois avec la molette vers le {phrase.Substring("scroll avec la molette vers le ".Length)}";
            const string tapePrefix = "tape le texte ";
            if (phrase.StartsWith(tapePrefix, StringComparison.OrdinalIgnoreCase))
                return phrase.Length > tapePrefix.Length ? $"tape {count} fois le texte {phrase.Substring(tapePrefix.Length)}" : $"tape {count} fois du texte";
            const string collePrefix = "colle le texte ";
            if (phrase.StartsWith(collePrefix, StringComparison.OrdinalIgnoreCase))
                return phrase.Length > collePrefix.Length ? $"colle {count} fois le texte {phrase.Substring(collePrefix.Length)}" : $"colle {count} fois du texte";
            if (phrase.StartsWith("définit la variable ", StringComparison.OrdinalIgnoreCase))
                return $"définit {count} fois la variable {phrase.Substring("définit la variable ".Length)}";
            if (phrase.StartsWith("incrémente ", StringComparison.OrdinalIgnoreCase))
                return $"incrémente {count} fois {phrase.Substring("incrémente ".Length)}";
            if (phrase.StartsWith("décrémente ", StringComparison.OrdinalIgnoreCase))
                return $"décrémente {count} fois {phrase.Substring("décrémente ".Length)}";
            if (phrase.StartsWith("inverse la valeur de ", StringComparison.OrdinalIgnoreCase))
                return $"inverse {count} fois la valeur de {phrase.Substring("inverse la valeur de ".Length)}";
            if (phrase.StartsWith("modifie ", StringComparison.OrdinalIgnoreCase))
                return $"modifie {count} fois {phrase.Substring("modifie ".Length)}";
            if (phrase == "saisit du texte vide") return $"saisit {count} fois du texte vide";
            if (phrase == "tape du texte (masqué)" || phrase == "colle du texte (masqué)")
                return phrase.StartsWith("tape") ? $"tape {count} fois du texte (masqué)" : $"colle {count} fois du texte (masqué)";
            if (phrase == "effectue une action souris") return $"effectue {count} actions souris";
            return $"{phrase} (×{count})";
        }

        /// <summary>
        /// Formate une phrase pour le résumé : si count > 1, utilise un pluriel ou "N fois".
        /// </summary>
        private static string FormatGroupedPhrase(string phrase, int count)
        {
            if (count <= 1) return phrase;
            if (phrase.StartsWith("fait une pause aléatoire", StringComparison.OrdinalIgnoreCase))
                return $"fait {count} pauses aléatoires";
            if (phrase.StartsWith("fait une pause selon la variable ", StringComparison.OrdinalIgnoreCase))
                return $"fait {count} pauses selon la variable {phrase.Substring("fait une pause selon la variable ".Length)}";
            if (phrase == "fait une pause (durée variable)")
                return $"fait {count} pauses (durée variable)";
            if (phrase == "fait une pause")
                return $"fait {count} pauses";
            if (phrase == "fait un clic gauche") return $"fait {count} clics gauches";
            if (phrase == "fait un clic droit") return $"fait {count} clics droits";
            if (phrase == "fait un clic milieu") return $"fait {count} clics milieux";
            if (phrase == "fait un double-clic gauche") return $"fait {count} double-clics gauches";
            if (phrase == "fait un double-clic droit") return $"fait {count} double-clics droits";
            if (phrase == "déplace le curseur") return $"déplace {count} fois le curseur";
            if (phrase == "utilise la molette") return $"utilise {count} fois la molette";
            if (phrase == "scroll en continu") return $"scroll {count} fois en continu";
            if (phrase.StartsWith("appuie sur la touche ", StringComparison.OrdinalIgnoreCase))
                return $"appuie {count} fois sur la touche {phrase.Substring("appuie sur la touche ".Length)}";
            if (phrase.StartsWith("maintient la touche ", StringComparison.OrdinalIgnoreCase))
                return $"maintient {count} fois la touche {phrase.Substring("maintient la touche ".Length)}";
            if (phrase.StartsWith("relâche la touche ", StringComparison.OrdinalIgnoreCase))
                return $"relâche {count} fois la touche {phrase.Substring("relâche la touche ".Length)}";
            if (phrase.StartsWith("maintient le clic ", StringComparison.OrdinalIgnoreCase))
                return $"maintient {count} fois le clic {phrase.Substring("maintient le clic ".Length)}";
            if (phrase.StartsWith("relâche le clic ", StringComparison.OrdinalIgnoreCase))
                return $"relâche {count} fois le clic {phrase.Substring("relâche le clic ".Length)}";
            if (phrase.StartsWith("scroll avec la molette vers le ", StringComparison.OrdinalIgnoreCase))
                return $"scroll {count} fois avec la molette vers le {phrase.Substring("scroll avec la molette vers le ".Length)}";
            const string tapePrefix = "tape le texte ";
            if (phrase.StartsWith(tapePrefix, StringComparison.OrdinalIgnoreCase))
                return phrase.Length > tapePrefix.Length ? $"tape {count} fois le texte {phrase.Substring(tapePrefix.Length)}" : $"tape {count} fois du texte";
            const string collePrefix = "colle le texte ";
            if (phrase.StartsWith(collePrefix, StringComparison.OrdinalIgnoreCase))
                return phrase.Length > collePrefix.Length ? $"colle {count} fois le texte {phrase.Substring(collePrefix.Length)}" : $"colle {count} fois du texte";
            if (phrase.StartsWith("définit la variable ", StringComparison.OrdinalIgnoreCase))
                return $"définit {count} fois la variable {phrase.Substring("définit la variable ".Length)}";
            if (phrase.StartsWith("incrémente ", StringComparison.OrdinalIgnoreCase))
                return $"incrémente {count} fois {phrase.Substring("incrémente ".Length)}";
            if (phrase.StartsWith("décrémente ", StringComparison.OrdinalIgnoreCase))
                return $"décrémente {count} fois {phrase.Substring("décrémente ".Length)}";
            if (phrase.StartsWith("inverse la valeur de ", StringComparison.OrdinalIgnoreCase))
                return $"inverse {count} fois la valeur de {phrase.Substring("inverse la valeur de ".Length)}";
            if (phrase.StartsWith("modifie ", StringComparison.OrdinalIgnoreCase))
                return $"modifie {count} fois {phrase.Substring("modifie ".Length)}";
            return $"{phrase} (×{count})";
        }

        /// <summary>
        /// Retourne une phrase courte et naturelle décrivant une action (pour le résumé de macro).
        /// </summary>
        private string GetActionSummaryPhrase(IInputAction action, int nestedDepth)
        {
            const int maxNested = 2;
            if (action == null) return "";

            if (action is KeyboardAction ka)
            {
                string key = ka.VirtualKeyCode != 0 ? GetKeyName(ka.VirtualKeyCode) : "?";
                return ka.ActionType switch
                {
                    Core.Inputs.KeyboardActionType.Down => $"maintient la touche {key} enfoncée",
                    Core.Inputs.KeyboardActionType.Up => $"relâche la touche {key}",
                    _ => $"appuie sur la touche {key}"
                };
            }
            if (action is DelayAction da)
            {
                if (da.UseVariableDelay)
                    return string.IsNullOrWhiteSpace(da.VariableName) ? "fait une pause (durée variable)" : $"fait une pause selon la variable {da.VariableName}";
                if (da.IsRandom)
                    return "fait une pause aléatoire";
                return "fait une pause";
            }
            if (action is Core.Inputs.MouseAction ma)
            {
                return ma.ActionType switch
                {
                    Core.Inputs.MouseActionType.LeftClick => "fait un clic gauche",
                    Core.Inputs.MouseActionType.RightClick => "fait un clic droit",
                    Core.Inputs.MouseActionType.MiddleClick => "fait un clic milieu",
                    Core.Inputs.MouseActionType.DoubleLeftClick => "fait un double-clic gauche",
                    Core.Inputs.MouseActionType.DoubleRightClick => "fait un double-clic droit",
                    Core.Inputs.MouseActionType.Move => "déplace le curseur",
                    Core.Inputs.MouseActionType.LeftDown => "maintient le clic gauche enfoncé",
                    Core.Inputs.MouseActionType.RightDown => "maintient le clic droit enfoncé",
                    Core.Inputs.MouseActionType.MiddleDown => "maintient le clic milieu enfoncé",
                    Core.Inputs.MouseActionType.LeftUp => "relâche le clic gauche",
                    Core.Inputs.MouseActionType.RightUp => "relâche le clic droit",
                    Core.Inputs.MouseActionType.MiddleUp => "relâche le clic milieu",
                    Core.Inputs.MouseActionType.WheelUp => "scroll avec la molette vers le haut",
                    Core.Inputs.MouseActionType.WheelDown => "scroll avec la molette vers le bas",
                    Core.Inputs.MouseActionType.Wheel => "utilise la molette",
                    Core.Inputs.MouseActionType.WheelContinuous => "scroll en continu",
                    _ => "effectue une action souris"
                };
            }
            if (action is TextAction ta)
            {
                if (ta.HideInLogs && !string.IsNullOrEmpty(ta.Text))
                    return ta.PasteAtOnce ? "colle du texte (masqué)" : "tape du texte (masqué)";
                if (string.IsNullOrEmpty(ta.Text)) return "saisit du texte vide";
                string preview = ta.Text.Length <= 18 ? ta.Text : ta.Text.Substring(0, 15) + "…";
                return ta.PasteAtOnce ? $"colle le texte « {preview} »" : $"tape le texte « {preview} »";
            }
            if (action is VariableAction va)
            {
                string name = string.IsNullOrWhiteSpace(va.VariableName) ? "variable" : va.VariableName;
                return va.Operation switch
                {
                    Core.Inputs.VariableOperation.Set => $"définit la variable {name}",
                    Core.Inputs.VariableOperation.Increment => $"incrémente {name}",
                    Core.Inputs.VariableOperation.Decrement => $"décrémente {name}",
                    Core.Inputs.VariableOperation.Toggle => $"inverse la valeur de {name}",
                    _ => $"modifie {name}"
                };
            }
            if (action is RepeatAction ra && nestedDepth < maxNested && ra.Actions != null && ra.Actions.Count > 0)
            {
                string repeatDesc = ra.RepeatMode switch
                {
                    MacroEngine.Core.Models.RepeatMode.RepeatCount => ra.RepeatCount == 1 ? "une fois" : $"{ra.RepeatCount} fois",
                    MacroEngine.Core.Models.RepeatMode.UntilStopped => "en boucle jusqu'à arrêt",
                    MacroEngine.Core.Models.RepeatMode.WhileKeyPressed => "tant qu'une touche reste pressée",
                    MacroEngine.Core.Models.RepeatMode.WhileClickPressed => "tant qu'un bouton de souris reste enfoncé",
                    _ => "une fois"
                };
                var inner = new List<string>();
                int limit = Math.Min(ra.Actions.Count, 4);
                for (int i = 0; i < limit; i++)
                    inner.Add(GetActionSummaryPhrase(ra.Actions[i], nestedDepth + 1));
                string innerStr = string.Join(", puis ", inner);
                if (ra.Actions.Count > limit) innerStr += ", etc.";
                return $"répète {repeatDesc} la séquence : {innerStr}";
            }
            if (action is IfAction ifa && nestedDepth < maxNested)
            {
                string cond = "une condition";
                if (ifa.ConditionGroups != null && ifa.ConditionGroups.Count > 0)
                {
                    var first = ifa.ConditionGroups[0];
                    if (first?.Conditions != null && first.Conditions.Count > 0)
                        cond = first.Conditions.Count == 1 ? "une condition" : $"{first.Conditions.Count} conditions (toutes requises)";
                }
                else if (ifa.Conditions != null && ifa.Conditions.Count > 0)
                    cond = ifa.Conditions.Count == 1 ? "une condition" : $"{ifa.Conditions.Count} conditions";
                return $"vérifie {cond}, puis exécute des actions selon le résultat (alors / sinon)";
            }
            return action.Name ?? action.Type.ToString();
        }

        private void ContinuousMonitoringCheckBox_Changed(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null) return;
            _selectedMacro.ContinuousMonitoring = ContinuousMonitoringCheckBox.IsChecked == true;
            ContinuousMonitoringOptionsPanel.Visibility = _selectedMacro.ContinuousMonitoring ? Visibility.Visible : Visibility.Collapsed;
            _selectedMacro.ModifiedAt = DateTime.Now;
        }

        private void ContinuousMonitoringInterval_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_selectedMacro == null) return;
            if (int.TryParse(ContinuousMonitoringIntervalTextBox.Text, out int ms) && ms > 0 && ms <= 10000)
            {
                _selectedMacro.ContinuousMonitoringIntervalMs = ms;
                _selectedMacro.ModifiedAt = DateTime.Now;
            }
        }


        #endregion

        private void Exit_Click(object sender, RoutedEventArgs e)
        {
            _logger.Info("Arrêt de l'application demandé", "MainWindow");
            
            // Arrêter l'enregistrement si actif
            if (_isRecording)
            {
                StopRecording();
            }

            // Arrêter le moteur de macro s'il est en cours d'exécution
            try
            {
                if (_macroEngine.State != Engine.MacroEngineState.Idle)
                {
                    _ = _macroEngine.StopMacroAsync();
                }
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors de l'arrêt du moteur de macro", ex, "MainWindow");
            }

            // Nettoyer tous les hooks
            try
            {
                _keyboardHook?.Dispose();
                _mouseHook?.Dispose();
                _globalExecuteHook?.Dispose();
                _globalStopHook?.Dispose();
                _globalMacroShortcutsHook?.Dispose();
                _processMonitor?.Dispose();
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du nettoyage des hooks", ex, "MainWindow");
            }
            
            // Fermer la fenêtre de logs si ouverte
            _logsWindow?.Close();

            _logger?.Info("Application arrêtée", "MainWindow");
            _logger?.Dispose();

            Application.Current.Shutdown();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
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
            Exit_Click(sender, e);
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
    }

    /// <summary>
    /// Classe pour représenter un élément de log d'action
    /// </summary>
    public class ActionLogItem
    {
        public string Timestamp { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
    }
}


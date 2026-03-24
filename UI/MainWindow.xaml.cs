using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
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

        // Liste macros : sélection uniquement au clic (pas au survol avec clic maintenu)
        private object? _macrosListPressedItem;

        /// <summary>Ignore les chargements obsolètes quand on change de macro plusieurs fois vite.</summary>
        private int _macroSelectionLoadGeneration;

        /// <summary>Évite de rescanner tous les processus à chaque changement de macro (liste identique).</summary>
        private List<ProcessIconItem>? _cachedProcessIconItems;
        private DateTime _processIconListUtc = DateTime.MinValue;
        private static readonly TimeSpan ProcessIconListCacheTtl = TimeSpan.FromSeconds(25);

        // Évite d'écraser l'icône/couleur de la macro quand on met à jour les listes depuis la macro
        private bool _updatingIconFromMacro;
        private bool _isPropsPanelOpen = false;
        /// <summary>Évite que la synchro du toggle déclenche Checked/Unchecked (boucle).</summary>
        private bool _syncingMacroEnableToggle;
        private const double PropsPanelWidth = 320.0;
        private const double PropsPanelHiddenOffset = 16.0; // masque la bordure gauche orange hors écran
        private static readonly TimeSpan PropsPanelAnimDuration = TimeSpan.FromMilliseconds(250);

        // True seulement après un clic souris sur une des listes d'icônes : on n'applique la sélection à la macro que dans ce cas
        private bool _userClickedIconList;
        
        // Exécution pas-à-pas (1 clic = 1 action racine)
        private int _stepExecutionIndex = 0;
        private string _stepExecutionMacroId = string.Empty;
        private bool _isStepExecuting = false;

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
                CaptionHeight = 36,
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
            _blockEditor.RecordButton.Click += StartMacro_Click;
            _blockEditor.StopButton.Click += StopMacro_Click;
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
            
            _ = LoadMacrosAndProfilesAsync();
            
            // Initialiser l'état des boutons
            _blockEditor.RecordButton.IsEnabled = true;
            _blockEditor.StopButton.IsEnabled = false;

            // Sélection de la liste macros : uniquement au clic, pas au survol avec clic maintenu
            MacrosListBox.PreviewMouseLeftButtonDown += MacrosListBox_PreviewMouseLeftButtonDown;
            MacrosListBox.PreviewMouseLeftButtonUp += MacrosListBox_PreviewMouseLeftButtonUp;

            // Ctrl+Z / Ctrl+Y au niveau fenêtre pour fonctionner même avec le focus dans un champ (TextBox, etc.)
            PreviewKeyDown += MainWindow_PreviewKeyDown;

            // Animation smooth au chargement (transition 0.2s ease) sur la colonne gauche
            Loaded += MainWindow_Loaded;
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            if (LeftColumnBorder == null) return;
            var anim = new System.Windows.Media.Animation.DoubleAnimation(0.97, 1,
                new System.Windows.Duration(TimeSpan.FromMilliseconds(200)))
            {
                EasingFunction = new System.Windows.Media.Animation.QuadraticEase { EasingMode = System.Windows.Media.Animation.EasingMode.EaseOut }
            };
            LeftColumnBorder.BeginAnimation(UIElement.OpacityProperty, anim);
            InitializeIconComboBoxes();
            UpdatePropsPanelVisibility(immediate: true);
        }

        private void PropsToggleButton_Click(object sender, RoutedEventArgs e)
        {
            _isPropsPanelOpen = !_isPropsPanelOpen;
            UpdatePropsPanelVisibility(immediate: false);
        }

        private async void QuickAddAction_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null)
            {
                StatusText.Text = "Sélectionnez une macro d'abord.";
                return;
            }

            if (sender is not FrameworkElement fe || fe.Tag is not string tag)
                return;

            _selectedMacro.Actions ??= new List<IInputAction>();

            if (tag == "undo")
            {
                _blockEditor?.PerformUndo();
                return;
            }
            if (tag == "redo")
            {
                _blockEditor?.PerformRedo();
                return;
            }
            if (tag == "presets")
            {
                try
                {
                    var presetStorage = new PresetStorage();
                    var dialog = new PresetsDialog(presetStorage);
                    dialog.PresetSelected += (_, preset) =>
                    {
                        if (preset?.Actions == null) return;
                        if (_blockEditor is TimelineEditor teUndo)
                            teUndo.PrepareUndoForExternalMutation();
                        foreach (var a in preset.Actions)
                        {
                            if (a == null) continue;
                            var cloned = a.Clone();
                            if (cloned != null) _selectedMacro.Actions.Add(cloned);
                        }
                        _selectedMacro.ModifiedAt = DateTime.Now;
                        ActionsCountText.Text = $"{_selectedMacro.Actions.Count} action(s)";
                        ScheduleMacroEditorRefresh(forceFullRebuild: true);
                        TriggerAutoSave();
                    };
                    dialog.Owner = this;
                    dialog.ShowDialog();
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erreur lors de l'ouverture des presets:\n{ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                return;
            }

            IInputAction? actionToAdd = tag switch
            {
                "keyboard" => new KeyboardAction
                {
                    Name = "Touche",
                    ActionType = KeyboardActionType.Press,
                    VirtualKeyCode = 0
                },
                "mouse" => new Core.Inputs.MouseAction
                {
                    Name = "Clic",
                    ActionType = MouseActionType.LeftClick,
                    X = -1,
                    Y = -1
                },
                "text" => new TextAction
                {
                    Name = "Texte",
                    Text = "",
                    TypingSpeed = 50
                },
                "delay" => new DelayAction
                {
                    Name = "100ms",
                    Duration = 100
                },
                "variable" => new VariableAction
                {
                    Name = "Variable",
                    VariableName = "var",
                    VariableType = VariableType.Number,
                    Operation = VariableOperation.Set,
                    Value = "0"
                },
                "condition" => new IfAction
                {
                    Name = "If",
                    Conditions = new List<ConditionItem> { new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true } },
                    Operators = new List<LogicalOperator>()
                },
                "repeat" => new RepeatAction
                {
                    Name = "Répéter",
                    RepeatMode = RepeatMode.RepeatCount,
                    RepeatCount = 2,
                    Actions = new List<IInputAction>()
                },
                _ => null
            };

            if (actionToAdd == null) return;

            if (_blockEditor is TimelineEditor teUndo)
                teUndo.PrepareUndoForExternalMutation();

            _selectedMacro.Actions.Add(actionToAdd);
            _selectedMacro.ModifiedAt = DateTime.Now;
            ActionsCountText.Text = $"{_selectedMacro.Actions.Count} action(s)";
            ScheduleMacroEditorRefresh();
            TriggerAutoSave();
        }

        private void UpdatePropsPanelVisibility(bool immediate)
        {
            if (PropsPanelBorder == null || PropsPanelTranslate == null) return;

            double targetX = _isPropsPanelOpen ? 0 : (PropsPanelWidth + PropsPanelHiddenOffset);

            // Toujours présent en overlay : on masque l'interaction quand il est fermé.
            PropsPanelBorder.Visibility = Visibility.Visible;
            PropsPanelBorder.IsHitTestVisible = _isPropsPanelOpen;

            if (immediate)
            {
                PropsPanelTranslate.BeginAnimation(TranslateTransform.XProperty, null);
                PropsPanelTranslate.X = targetX;
                return;
            }

            double currentX = PropsPanelTranslate.X;
            var frames = new DoubleAnimationUsingKeyFrames
            {
                Duration = new Duration(PropsPanelAnimDuration),
                FillBehavior = FillBehavior.HoldEnd
            };
            frames.KeyFrames.Add(new DiscreteDoubleKeyFrame(currentX, KeyTime.FromTimeSpan(TimeSpan.Zero)));
            // Approximation directe du cubic-bezier(0.22,1,0.36,1)
            frames.KeyFrames.Add(new SplineDoubleKeyFrame(targetX, KeyTime.FromTimeSpan(PropsPanelAnimDuration), new KeySpline(0.22, 1.0, 0.36, 1.0)));

            frames.Completed += (_, _) =>
            {
                PropsPanelTranslate.X = targetX;
                // Quand fermé, ne capte plus les clics.
                PropsPanelBorder.IsHitTestVisible = _isPropsPanelOpen;
            };

            PropsPanelTranslate.BeginAnimation(TranslateTransform.XProperty, frames);
        }

        private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (Keyboard.Modifiers != System.Windows.Input.ModifierKeys.Control)
                return;
            var content = MacroEditorContainer?.Content;
            if (e.Key == Key.Z)
            {
                if (content is TimelineEditor te)
                    te.PerformUndo();
                else if (content is BlockEditor be)
                    be.PerformUndo();
                e.Handled = true;
            }
            else if (e.Key == Key.Y)
            {
                if (content is TimelineEditor te)
                    te.PerformRedo();
                else if (content is BlockEditor be)
                    be.PerformRedo();
                e.Handled = true;
            }
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
                ActiveAppText.Foreground = (System.Windows.Media.Brush)FindResource("TextPrimaryBrush");
            }
        }

        private void CheckAutoExecuteMacros(string processName)
        {
            // Ne pas exécuter automatiquement si on définit un raccourci
            if (_isCapturingShortcut)
                return;
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
            if (_appConfig == null)
                return;

            if (_blockEditor?.StopButton != null && !_isRecording)
            {
                var keyCode = _appConfig.StopMacroKeyCode != 0 ? _appConfig.StopMacroKeyCode : 0x7A;
                var keyName = GetKeyNameForShortcut((ushort)keyCode);
                _blockEditor.StopButton.ToolTip = $"Arrêter l'enregistrement ({keyName})";
            }

            UpdateExecutionToolbarShortcutHints();
        }

        /// <summary>
        /// Raccourcis à droite de l’icône ; libellés LANCER / ARRÊTER dessous.
        /// LANCER : raccourci de la macro si défini, sinon raccourci global Exécuter (F10 par défaut).
        /// ARRÊTER : raccourci global.
        /// </summary>
        private void UpdateExecutionToolbarShortcutHints()
        {
            if (StopGlobalShortcutHintText != null && _appConfig != null)
            {
                var stopKeyCode = _appConfig.StopMacroKeyCode != 0 ? _appConfig.StopMacroKeyCode : 0x7A;
                StopGlobalShortcutHintText.Text = FormatShortcutHintDisplay(
                    GetKeyNameForShortcut((ushort)stopKeyCode));
            }

            if (ExecuteMacroShortcutHintText != null)
            {
                if (_selectedMacro != null && _selectedMacro.ShortcutKeyCode > 0)
                {
                    ExecuteMacroShortcutHintText.Text = FormatShortcutHintDisplay(
                        GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode));
                    ExecuteMacroShortcutHintText.Visibility = Visibility.Visible;
                }
                else
                {
                    // Aucun raccourci sur la macro : afficher le raccourci global « Exécuter » (souvent F10).
                    ushort executeVk = 0x79;
                    if (_appConfig != null && _appConfig.ExecuteMacroKeyCode != 0)
                        executeVk = (ushort)_appConfig.ExecuteMacroKeyCode;
                    ExecuteMacroShortcutHintText.Text = FormatShortcutHintDisplay(GetKeyNameForShortcut(executeVk));
                    ExecuteMacroShortcutHintText.Visibility = Visibility.Visible;
                }
            }
        }

        /// <summary>
        /// Si le libellé contient plusieurs mots : 1ʳᵉ ligne = premier mot, 2ᵉ ligne = le reste (ex. « Flèche » / « Haut »).
        /// </summary>
        private static string FormatShortcutHintDisplay(string keyName)
        {
            if (string.IsNullOrWhiteSpace(keyName))
                return string.Empty;
            var parts = keyName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
                return keyName;
            return parts[0] + Environment.NewLine + string.Join(' ', parts.Skip(1));
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
                    new AlertDialog("Avertissement", conflictMessage, this).ShowDialog();
                }), System.Windows.Threading.DispatcherPriority.Normal);
            }
            
            _logger?.Debug($"{_macroShortcuts.Count} raccourci(s) de macro(s) enregistré(s)", "MainWindow");
        }

        private void GlobalMacroShortcutsHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Vérifier si cette touche correspond à un raccourci de macro
            if (_macroShortcuts.TryGetValue(e.VirtualKeyCode, out var macro))
            {
                // Ne pas exécuter si on est en train d'enregistrer ou de définir un raccourci
                if (_isRecording || _isCapturingShortcut)
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
                
                // Les macros avec applications cibles ne s'exécutent que lorsque l'une d'elles est active
                if (!IsMacroShortcutActiveForCurrentApp(macro))
                {
                    return; // Une autre app est active, ne pas exécuter
                }

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

        /// <summary>
        /// Conflits raccourci, dictionnaire des raccourcis macros, réinstallation du hook, refresh liste.
        /// Coûteux : appelé en différé depuis l’éditeur timeline pour éviter le lag (undo/redo, édition).
        /// </summary>
        private void ApplyMacroEditorHeavyRefresh()
        {
            if (_selectedMacro != null && _selectedMacro.ShortcutKeyCode != 0)
            {
                if (_appConfig != null &&
                    (_selectedMacro.ShortcutKeyCode == _appConfig.ExecuteMacroKeyCode ||
                     _selectedMacro.ShortcutKeyCode == _appConfig.StopMacroKeyCode))
                {
                    _logger?.Warning($"Le raccourci de la macro '{_selectedMacro.Name}' entre en conflit avec un raccourci global", "MainWindow");
                    new AlertDialog("Conflit de raccourci",
                        $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par un raccourci global.\nVeuillez choisir un autre raccourci.",
                        this).ShowDialog();
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
                        _logger?.Warning($"Le raccourci de la macro '{_selectedMacro.Name}' entre en conflit avec '{conflictingMacro.Name}'", "MainWindow");
                        new AlertDialog("Conflit de raccourci",
                            $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par la macro '{conflictingMacro.Name}'.\nVeuillez choisir un autre raccourci.",
                            this).ShowDialog();
                        _selectedMacro.ShortcutKeyCode = 0;
                    }
                }
            }

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

            MacrosListBox.Items.Refresh();
        }

        private bool _macroHeavyRefreshScheduled;
        private bool _triggerModeRefreshScheduled;

        private void ScheduleDeferredTriggerModeRefresh()
        {
            if (_triggerModeRefreshScheduled) return;
            _triggerModeRefreshScheduled = true;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                _triggerModeRefreshScheduled = false;
                UpdateTriggerModeRecommendedText();
            }), System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }

        private void ScheduleDeferredMacroHeavyRefresh()
        {
            if (_macroHeavyRefreshScheduled) return;
            _macroHeavyRefreshScheduled = true;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                _macroHeavyRefreshScheduled = false;
                ApplyMacroEditorHeavyRefresh();
            }), System.Windows.Threading.DispatcherPriority.ContextIdle);
        }

        private void BlockEditor_MacroChanged(object? sender, EventArgs e)
        {
            TriggerAutoSave();
            // Undo/redo : seule la liste d’actions change — pas de raccourci / IsEnabled / liste macros
            if (e is MacroActionsChangedOnlyEventArgs)
            {
                ScheduleDeferredTriggerModeRefresh();
                return;
            }

            UpdateMacroSummary();
            UpdateTriggerModeRecommendedText();
            ScheduleDeferredMacroHeavyRefresh();
        }

        /// <summary>Aligne le switch Activer/Désactiver de la barre du haut sur la macro sélectionnée.</summary>
        private void SyncMacroEnableToggleFromSelection()
        {
            if (MacroEnableToggle == null) return;
            _syncingMacroEnableToggle = true;
            try
            {
                if (_selectedMacro != null)
                {
                    MacroEnableToggle.IsEnabled = true;
                    MacroEnableToggle.IsChecked = _selectedMacro.IsEnabled;
                }
                else
                {
                    MacroEnableToggle.IsEnabled = false;
                    MacroEnableToggle.IsChecked = false;
                }
            }
            finally
            {
                _syncingMacroEnableToggle = false;
            }
        }

        private void MacroEnableToggle_Checked(object sender, RoutedEventArgs e)
        {
            if (_syncingMacroEnableToggle || _selectedMacro == null) return;
            _selectedMacro.IsEnabled = true;
            _selectedMacro.ModifiedAt = DateTime.Now;
            TriggerAutoSave();
            UpdateTriggerModeRecommendedText();
            // Activer/désactiver : appliquer tout de suite les hooks / raccourcis (pas de délai)
            ApplyMacroEditorHeavyRefresh();
        }

        private void MacroEnableToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            if (_syncingMacroEnableToggle || _selectedMacro == null) return;
            _selectedMacro.IsEnabled = false;
            _selectedMacro.ModifiedAt = DateTime.Now;
            TriggerAutoSave();
            UpdateTriggerModeRecommendedText();
            ApplyMacroEditorHeavyRefresh();
        }

        private void GlobalExecuteHook_KeyDown(object? sender, KeyboardHookEventArgs e)
        {
            // Vérifier que c'est le raccourci configuré pour exécuter et qu'on n'est pas en train d'enregistrer ou de définir un raccourci
            if (_appConfig != null && 
                e.VirtualKeyCode == _appConfig.ExecuteMacroKeyCode && 
                !_isRecording && 
                !_isCapturingShortcut &&
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
                
                _blockEditor.RecordButton.IsEnabled = !_isRecording && !isExecuting;
                
                // Le bouton Stop fonctionne pour l'exécution ET l'enregistrement
                _blockEditor.StopButton.IsEnabled = isExecuting || _isRecording;
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

        /// <summary>
        /// Charge d'abord les macros puis les profils, pour que le premier profil (par défaut) reçoive toutes les macros.
        /// </summary>
        private async Task LoadMacrosAndProfilesAsync()
        {
            await LoadMacrosAsync();
            await LoadProfilesAsync();
        }

        private async Task LoadMacrosAsync()
        {
            try
            {
                _macros = await _macroStorage.LoadMacrosAsync();
                InvalidateProcessIconListCache();

                if (_macros.Count == 0)
                {
                    var testMacro = CreateTestMacro();
                    _macros.Add(testMacro);
                    await _macroStorage.SaveMacrosAsync(_macros);
                }
                
                // La liste des macros est remplie par LoadProfilesAsync -> RefreshMacrosListForActiveProfileAsync (macros du profil actif)
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur chargement macros: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        private async void LoadMacros()
        {
            await LoadMacrosAsync();
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

                await RefreshMacrosListForActiveProfileAsync();
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du chargement des profils", ex, "MainWindow");
                StatusText.Text = $"Erreur chargement profils: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        /// <summary>
        /// Affiche dans la liste uniquement les macros du profil actif.
        /// </summary>
        private async Task RefreshMacrosListForActiveProfileAsync()
        {
            if (_macros == null) return;
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                var activeProfile = profiles.FirstOrDefault(p => p.IsActive);
                var ids = activeProfile?.MacroIds ?? new List<string>();
                var filtered = _macros.Where(m => !string.IsNullOrEmpty(m.Id) && ids.Contains(m.Id)).ToList();
                MacrosListBox.ItemsSource = filtered;

                if (filtered.Count > 0)
                {
                    if (_selectedMacro != null && ids.Contains(_selectedMacro.Id))
                        MacrosListBox.SelectedItem = _selectedMacro;
                    else
                    {
                        MacrosListBox.SelectedIndex = 0;
                        _selectedMacro = filtered[0];
                        if (_blockEditor != null)
                            _blockEditor.LoadMacro(_selectedMacro);
                        SyncMacroEnableToggleFromSelection();
                    }
                }
                else
                {
                    MacrosListBox.SelectedIndex = -1;
                    _selectedMacro = null;
                    if (_blockEditor != null)
                        _blockEditor.LoadMacro(null!);
                    SyncMacroEnableToggleFromSelection();
                    UpdateMacroPropertiesPanel();
                }
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors du rafraîchissement de la liste des macros", ex, "MainWindow");
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
            ResetStepExecution();
            // Mise à jour immédiate des champs visibles pour éviter l'affichage de l'ancienne macro
            if (_selectedMacro != null)
            {
                MacroNameTextBox.Text = _selectedMacro.Name;
                MacroDescriptionTextBox.Text = _selectedMacro.Description ?? "";
                ShortcutDisplayText.Text = _selectedMacro.ShortcutKeyCode > 0 ? GetKeyName((ushort)_selectedMacro.ShortcutKeyCode) : "Non défini";
                if (ClearShortcutButton != null)
                    ClearShortcutButton.Visibility = _selectedMacro.ShortcutKeyCode != 0 ? Visibility.Visible : Visibility.Collapsed;
            }
            else
            {
                MacroNameTextBox.Text = "";
                MacroDescriptionTextBox.Text = "";
                ShortcutDisplayText.Text = "Non défini";
                if (ClearShortcutButton != null)
                    ClearShortcutButton.Visibility = Visibility.Collapsed;
            }
            UpdateExecutionToolbarShortcutHints();
            // ApplicationIdle : laisse d’abord peindre la liste (sélection) puis charge timeline + propriétés.
            // Génération : si l’utilisateur clique plusieurs macros vite, on n’applique que le dernier chargement.
            int gen = ++_macroSelectionLoadGeneration;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                if (gen != _macroSelectionLoadGeneration)
                    return;
                if (_selectedMacro != null)
                    _blockEditor.LoadMacro(_selectedMacro);
                else
                    _blockEditor.LoadMacro(null!);
                SyncMacroEnableToggleFromSelection();
                UpdateMacroPropertiesPanel();
            }), System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }

        private void MacrosListBox_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            var item = GetListBoxItemAt(MacrosListBox, e.GetPosition(MacrosListBox));
            _macrosListPressedItem = item?.DataContext;
            e.Handled = true;
        }

        private void MacrosListBox_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (_macrosListPressedItem != null)
            {
                MacrosListBox.SelectedItem = _macrosListPressedItem;
                _macrosListPressedItem = null;
            }
        }

        private static ListBoxItem? GetListBoxItemAt(ListBox listBox, Point position)
        {
            var element = listBox.InputHitTest(position) as DependencyObject;
            while (element != null)
            {
                if (element is ListBoxItem item)
                    return item;
                element = VisualTreeHelper.GetParent(element);
            }
            return null;
        }

        private async void ExecuteMacro_Click(object sender, RoutedEventArgs e)
        {
            // Une exécution complète repart toujours du début.
            ResetStepExecution();
            await ExecuteMacroAsync();
        }

        private async void StepMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_isStepExecuting)
                return;

            try
            {
                if (_selectedMacro == null)
                {
                    StatusText.Text = "Veuillez sélectionner une macro";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                if (!_selectedMacro.IsEnabled)
                {
                    StatusText.Text = "La macro est désactivée";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                if (_isRecording)
                {
                    StatusText.Text = "Impossible d'exécuter en pas à pas pendant l'enregistrement";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                if (_macroEngine.State != MacroEngineState.Idle)
                {
                    StatusText.Text = "Une macro est déjà en cours d'exécution";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                if (_selectedMacro.Actions == null || _selectedMacro.Actions.Count == 0)
                {
                    StatusText.Text = "La macro sélectionnée ne contient aucune action";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                    return;
                }

                // Si on change de macro, on repart du début.
                if (_stepExecutionMacroId != _selectedMacro.Id)
                {
                    _stepExecutionMacroId = _selectedMacro.Id;
                    _stepExecutionIndex = 0;
                }

                // Fin atteinte : prochain clic repart à 0.
                if (_stepExecutionIndex >= _selectedMacro.Actions.Count)
                {
                    _stepExecutionIndex = 0;
                }

                var actionToRun = _selectedMacro.Actions[_stepExecutionIndex];
                int actionNumber = _stepExecutionIndex + 1;
                int total = _selectedMacro.Actions.Count;

                _isStepExecuting = true;
                StatusText.Text = $"Pas à pas: exécution action {actionNumber}/{total}";
                StatusText.Foreground = System.Windows.Media.Brushes.Black;

                await _macroEngine.ExecuteActionsAsync(new[] { actionToRun });

                _stepExecutionIndex++;

                if (_stepExecutionIndex >= total)
                {
                    StatusText.Text = "Pas à pas terminé (fin de la macro). Re-cliquez pour repartir au début.";
                    StatusText.Foreground = System.Windows.Media.Brushes.Green;
                }
                else
                {
                    StatusText.Text = $"Pas à pas prêt: prochaine action {_stepExecutionIndex + 1}/{total}";
                    StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur pas à pas: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
            }
            finally
            {
                _isStepExecuting = false;
            }
        }

        private void ResetStepExecution()
        {
            _stepExecutionIndex = 0;
            _stepExecutionMacroId = _selectedMacro?.Id ?? string.Empty;
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
                bool usePollingLoop = _selectedMacro.TriggerMode == MacroTriggerMode.ContinuousPolling || 
                                     _selectedMacro.TriggerMode == MacroTriggerMode.EventDriven;
                if ((usePollingLoop || MacroHasMouseWheelCondition(_selectedMacro)) && !_mouseHook.IsEnabled)
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
                // En enregistrement : le bouton Enregistrer affiche Pause/Reprendre
                if (_isRecording)
                {
                    if (!_isRecordingPaused)
                    {
                        _isRecordingPaused = true;
                        _blockEditor.IsRecordingPaused = true;
                        StatusText.Text = "Enregistrement en pause";
                        _blockEditor.RecordButton.ToolTip = "Reprendre l'enregistrement";
                    }
                    else
                    {
                        _isRecordingPaused = false;
                        _blockEditor.IsRecordingPaused = false;
                        StatusText.Text = "Enregistrement en cours... Appuyez sur les touches ou cliquez avec la souris";
                        _blockEditor.RecordButton.ToolTip = "Mettre en pause l'enregistrement";
                    }
                    return;
                }

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

                    StartRecording();
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

            // Mettre à jour l'interface (Pause/Reprendre sur le bouton Enregistrer)
            StatusText.Text = "Enregistrement en cours... Appuyez sur les touches ou cliquez avec la souris (max 20 touches/seconde)";
            StatusText.Foreground = System.Windows.Media.Brushes.Black;
            _blockEditor.StopButton.IsEnabled = true;
            _blockEditor.IsRecording = true;
            _blockEditor.IsRecordingPaused = false;
            _blockEditor.RecordButton.ToolTip = "Mettre en pause l'enregistrement";
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
            StatusText.Text = $"Enregistrement terminé. {_selectedMacro?.Actions?.Count ?? 0} action(s) enregistrée(s)";
            _blockEditor.StopButton.IsEnabled = false;
            _blockEditor.IsRecording = false;
            _blockEditor.IsRecordingPaused = false;
            _blockEditor.RecordButton.ToolTip = "Enregistrer une macro";
            UpdateExecuteButtonText();

            // Rafraîchir l'éditeur
            if (_blockEditor != null && _selectedMacro != null)
            {
                _blockEditor.LoadMacro(_selectedMacro);
                SyncMacroEnableToggleFromSelection();
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
                    StatusText.Text = "Enregistrement en pause";
                }
                else
                {
                    // Reprendre l'enregistrement
                    _isRecordingPaused = false;
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
            // Si on est en train d'enregistrer : arrêter l'enregistrement
            if (_isRecording)
            {
                StopRecording();
            }
            else
            {
                // Arrêter l'exécution de macro
                ResetStepExecution();
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

        /// <summary>
        /// Regroupe les rafraîchissements timeline : le clic rend la main tout de suite.
        /// Si <paramref name="forceFullRebuild"/> (presets, import multiple), une seule reconstruction complète.
        /// Sinon, append incrémental sur la timeline quand c’est possible.
        /// </summary>
        private bool _macroEditorRefreshScheduled;
        private bool _macroEditorRefreshForceFull;

        private void ScheduleMacroEditorRefresh(bool forceFullRebuild = false)
        {
            if (forceFullRebuild)
                _macroEditorRefreshForceFull = true;
            if (_macroEditorRefreshScheduled) return;
            _macroEditorRefreshScheduled = true;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                _macroEditorRefreshScheduled = false;
                bool full = _macroEditorRefreshForceFull;
                _macroEditorRefreshForceFull = false;
                if (full || _blockEditor is not TimelineEditor te)
                    RefreshMacroEditor();
                else
                    te.RefreshAfterExternalMutation();
            }), System.Windows.Threading.DispatcherPriority.Background);
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
                    _blockEditor.RecordButton, _blockEditor.StopButton
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

        private async void NewMacro_Click(object sender, RoutedEventArgs e)
        {
            var macro = new Macro
            {
                Name = "Nouvelle Macro",
                Description = "Description de la macro"
            };
            _macros.Add(macro);

            // Persister tout de suite pour que la macro vide survive au redémarrage
            await _macroStorage.SaveMacrosAsync(_macros);

            // Ajouter la nouvelle macro au profil actif
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                var activeProfile = profiles.FirstOrDefault(p => p.IsActive);
                if (activeProfile != null && !activeProfile.MacroIds.Contains(macro.Id))
                {
                    activeProfile.MacroIds.Add(macro.Id);
                    await _profileProvider.SaveProfileAsync(activeProfile);
                }
            }
            catch { /* ignorer */ }

            await RefreshMacrosListForActiveProfileAsync();
            MacrosListBox.SelectedItem = macro;
        }

        private async void DeleteMacro_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro != null)
            {
                _macros.Remove(_selectedMacro);
                _selectedMacro = null;
                await RefreshMacrosListForActiveProfileAsync();
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
                var profilesWindow = new ProfilesManagementWindow(_profileProvider, _macros)
                {
                    Owner = this
                };
                profilesWindow.ShowDialog();
                await LoadProfilesAsync();
            }
            catch (Exception ex)
            {
                _logger?.Error("Erreur lors de la gestion des profils", ex, "MainWindow");
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
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

                var dialog = new SelectProfileDialog(profiles)
                {
                    Owner = this
                };
                if (dialog.ShowDialog() != true || dialog.SelectedProfile == null)
                    return;

                await _profileProvider.ActivateProfileAsync(dialog.SelectedProfile.Id);
                        await LoadProfilesAsync();
                await RefreshMacrosListForActiveProfileAsync();
                StatusText.Text = $"Profil '{dialog.SelectedProfile.Name}' activé.";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
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

                    // Ajouter la macro importée au profil actif
                    try
                    {
                        var profiles = await _profileProvider.LoadProfilesAsync();
                        var activeProfile = profiles.FirstOrDefault(p => p.IsActive);
                        if (activeProfile != null && !string.IsNullOrEmpty(importedMacro.Id) && !activeProfile.MacroIds.Contains(importedMacro.Id))
                        {
                            activeProfile.MacroIds.Add(importedMacro.Id);
                            await _profileProvider.SaveProfileAsync(activeProfile);
                        }
                    }
                    catch { /* ignorer */ }

                    await RefreshMacrosListForActiveProfileAsync();
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

        private void MacroDescriptionTextBox_PreviewMouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (sender is not System.Windows.Controls.TextBox tb) return;
            var pos = e.GetPosition(tb);
            var index = tb.GetCharacterIndexFromPoint(pos, snapToText: false);
            // Si clic sur le texte : comportement normal (ne pas gérer). Si clic sur zone vide : mettre curseur à la fin
            if (index < 0)
            {
                tb.Focus();
                tb.SelectionStart = tb.Text?.Length ?? 0;
                tb.SelectionLength = 0;
                e.Handled = true;
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

        private void ClearShortcut_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null) return;
            _selectedMacro.ShortcutKeyCode = 0;
            _selectedMacro.ModifiedAt = DateTime.Now;
            if (ShortcutDisplayText != null)
                ShortcutDisplayText.Text = "Non défini";
            if (ClearShortcutButton != null)
                ClearShortcutButton.Visibility = Visibility.Collapsed;
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
            MacrosListBox.Items.Refresh();
            _ = _macroStorage.SaveMacrosAsync(_macros);
            UpdateExecuteButtonText();
            StatusText.Text = "Raccourci supprimé.";
            StatusText.Foreground = System.Windows.Media.Brushes.Gray;
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
                new AlertDialog("Conflit de raccourci",
                    $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par un raccourci global.\nVeuillez choisir un autre raccourci.",
                    this).ShowDialog();
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
                    new AlertDialog("Conflit de raccourci",
                        $"Le raccourci '{GetKeyNameForShortcut((ushort)_selectedMacro.ShortcutKeyCode)}' est déjà utilisé par la macro '{conflictingMacro.Name}'.\nVeuillez choisir un autre raccourci.",
                        this).ShowDialog();
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
            if (ClearShortcutButton != null)
                ClearShortcutButton.Visibility = _selectedMacro.ShortcutKeyCode != 0 ? Visibility.Visible : Visibility.Collapsed;
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

            UpdateExecutionToolbarShortcutHints();
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

        /// <summary>Extrait une couleur dominante depuis une icône (BitmapSource) pour le dégradé du chip.
        /// Favorise les pixels saturés pour une couleur plus représentative de l'app.</summary>
        private static System.Windows.Media.Color GetDominantColorFromIcon(BitmapSource? source)
        {
            if (source == null || source.PixelWidth < 1 || source.PixelHeight < 1)
                return System.Windows.Media.Color.FromRgb(0x6B, 0x3E, 0x26); // Accent cuivre par défaut

            try
            {
                var format = source.Format;
                if (format != PixelFormats.Bgra32 && format != PixelFormats.Bgr32)
                {
                    var converted = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
                    converted.Freeze();
                    source = converted;
                }

                int w = source.PixelWidth;
                int h = source.PixelHeight;
                int stride = (w * 4 + 3) & ~3;
                var pixels = new byte[stride * h];
                source.CopyPixels(pixels, stride, 0);

                // Moyenne pondérée par saturation : les pixels saturés (couleurs vives) pèsent plus
                double rSum = 0, gSum = 0, bSum = 0;
                double weightSum = 0;
                for (int y = 0; y < h; y++)
                {
                    for (int x = 0; x < w; x++)
                    {
                        int i = y * stride + x * 4;
                        byte b_ = pixels[i], g_ = pixels[i + 1], r_ = pixels[i + 2], a = pixels[i + 3];
                        if (a < 80) continue;
                        int maxC = Math.Max(r_, Math.Max(g_, b_));
                        int minC = Math.Min(r_, Math.Min(g_, b_));
                        int lum = (r_ + g_ + b_) / 3;
                        // Ignorer blanc/gris clair
                        if (lum > 240 && Math.Abs(r_ - g_) < 15 && Math.Abs(g_ - b_) < 15) continue;
                        if (lum < 20) continue; // Noir
                        // Saturation : max-min, normalisée [0,1]. Plus saturé = plus de poids
                        int sat = maxC - minC;
                        double weight = 0.1 + (sat / 255.0) * 0.9; // min 0.1 pour ne pas exclure les gris colorés
                        rSum += r_ * weight;
                        gSum += g_ * weight;
                        bSum += b_ * weight;
                        weightSum += weight;
                    }
                }

                if (weightSum < 0.01)
                    return System.Windows.Media.Color.FromRgb(0x6B, 0x3E, 0x26);
                return System.Windows.Media.Color.FromRgb(
                    (byte)Math.Clamp((int)(rSum / weightSum), 0, 255),
                    (byte)Math.Clamp((int)(gSum / weightSum), 0, 255),
                    (byte)Math.Clamp((int)(bSum / weightSum), 0, 255));
            }
            catch
            {
                return System.Windows.Media.Color.FromRgb(0x6B, 0x3E, 0x26);
            }
        }

        /// <summary>État du dégradé d'un chip pour animation au survol.</summary>
        private sealed class ChipGradientState
        {
            public BitmapSource? Icon;
            public required LinearGradientBrush Brush;
            public required GradientStop FadeStop;
            public required GradientStop BaseStop2;
            public System.Windows.Media.Color ColorSecondary;
            public System.Windows.Media.Color ColorTertiary;
        }

        private static readonly Duration ChipHoverDuration = new Duration(TimeSpan.FromMilliseconds(180));
        private static readonly Duration ChipRightClickDuration = new Duration(TimeSpan.FromMilliseconds(80));

        /// <param name="isHover">Si true, le dégradé s'étend plus (plus de distance vers la droite).</param>
        private void ApplyChipGradient(Border tag, BitmapSource? icon, bool isHover = false)
        {
            var colorSecondary = System.Windows.Media.Colors.Transparent;
            var colorTertiary = System.Windows.Media.Colors.Transparent;
            if (FindResource("BackgroundSecondaryColor") is System.Windows.Media.Color c)
                colorSecondary = c;
            else if (FindResource("BackgroundSecondaryBrush") is SolidColorBrush brush)
                colorSecondary = brush.Color;
            if (FindResource("BackgroundTertiaryColor") is System.Windows.Media.Color c3)
                colorTertiary = c3;
            else if (FindResource("BackgroundTertiaryBrush") is SolidColorBrush brush3)
                colorTertiary = brush3.Color;

            var iconColor = GetDominantColorFromIcon(icon);
            double fadeOffset = isHover ? 0.65 : 0.35;
            var baseColor = isHover ? colorTertiary : colorSecondary;

            var stop0 = new GradientStop(System.Windows.Media.Color.FromArgb(0x30, iconColor.R, iconColor.G, iconColor.B), 0.0);
            var stop1 = new GradientStop(baseColor, fadeOffset);
            var stop2 = new GradientStop(baseColor, 1.0);

            // Dégradé diagonal : bas gauche → un peu moins haut, un peu plus bas à droite
            var gradient = new LinearGradientBrush
            {
                StartPoint = new Point(0, 1),
                EndPoint = new Point(1, 1),
                GradientStops = new GradientStopCollection { stop0, stop1, stop2 }
            };
            // Ne pas Freeze pour permettre l'animation
            tag.Background = gradient;
            tag.Tag = new ChipGradientState
            {
                Icon = icon,
                Brush = gradient,
                FadeStop = stop1,
                BaseStop2 = stop2,
                ColorSecondary = colorSecondary,
                ColorTertiary = colorTertiary
            };
        }

        private void AnimateChipHover(Border tag, bool isHover)
        {
            if (tag?.Tag is not ChipGradientState state) return;

            var fadeStop = state.FadeStop;
            var baseStop2 = state.BaseStop2;
            double targetOffset = isHover ? 0.65 : 0.35;
            var targetBaseColor = isHover ? state.ColorTertiary : state.ColorSecondary;

            var animOffset = new DoubleAnimation(targetOffset, ChipHoverDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            fadeStop.BeginAnimation(GradientStop.OffsetProperty, animOffset);

            var animColor = new ColorAnimation(targetBaseColor, ChipHoverDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            fadeStop.BeginAnimation(GradientStop.ColorProperty, animColor);
            baseStop2.BeginAnimation(GradientStop.ColorProperty, animColor);
        }

        private void Chip_RightClickDown(Border tag)
        {
            if (tag.RenderTransform is not ScaleTransform scale)
            {
                scale = new ScaleTransform(1, 1);
                tag.RenderTransformOrigin = new Point(0.5, 0.5);
                tag.RenderTransform = scale;
            }
            var anim = new DoubleAnimation(0.96, ChipRightClickDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
        }

        private void Chip_RightClickUp(Border tag)
        {
            var scale = tag.RenderTransform as ScaleTransform;
            if (scale == null) return;
            var anim = new DoubleAnimation(1.0, ChipRightClickDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
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
                var chipTextBrush = (System.Windows.Media.Brush?)FindResource("TextPrimaryBrush") ?? System.Windows.Media.Brushes.White;
                foreach (var app in _selectedMacro.TargetApplications)
                {
                    var appName = System.IO.Path.GetFileNameWithoutExtension(app);
                    if (string.IsNullOrEmpty(appName)) appName = app;
                    var tag = new Border { Cursor = Cursors.Hand };
                    if (FindResource("ProcessChipStyle") is Style processChipStyle)
                        tag.Style = processChipStyle;
                    else
                    {
                        tag.BorderBrush = (System.Windows.Media.Brush)FindResource("BorderLightBrush");
                        tag.BorderThickness = new Thickness(1);
                        tag.CornerRadius = new CornerRadius(4);
                        tag.Padding = new Thickness(6, 4, 4, 4);
                        tag.Margin = new Thickness(0, 0, 3, 3);
                    }
                    var stack = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
                    var iconContainer = new Grid { Width = 14, Height = 14, Margin = new Thickness(0, 0, 6, 0) };
                    var img = new System.Windows.Controls.Image
                    {
                        Width = 14,
                        Height = 14,
                        Stretch = Stretch.Uniform,
                        VerticalAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = HorizontalAlignment.Center
                    };
                    RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                    if (ProcessMonitor.TryGetCachedIcon(appName, out var cachedIcon) && cachedIcon != null)
                    {
                        img.Source = cachedIcon;
                        iconContainer.Children.Add(img);
                        var cachedBs = cachedIcon as BitmapSource;
                        tag.Tag = cachedBs;
                        ApplyChipGradient(tag, cachedBs, false);
                    }
                    else
                    {
                        var placeholder = new TextBlock
                        {
                            Text = LucideIcons.RefreshCcw,
                            FontSize = 10,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Foreground = chipTextBrush,
                            RenderTransformOrigin = new Point(0.5, 0.5),
                            RenderTransform = new RotateTransform(0)
                        };
                        placeholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
                        placeholder.Loaded += (s, _) =>
                        {
                            var rt = (RotateTransform)placeholder.RenderTransform;
                            var anim = new DoubleAnimation(0, -360, new Duration(TimeSpan.FromSeconds(1))) { RepeatBehavior = RepeatBehavior.Forever };
                            rt.BeginAnimation(RotateTransform.AngleProperty, anim);
                        };
                        iconContainer.Children.Add(placeholder);
                        iconContainer.Children.Add(img);
                        tag.Tag = null;
                        ApplyChipGradient(tag, null, false);
                        _ = Task.Run(() =>
                        {
                            var icon = ProcessMonitor.GetIconForProcessName(appName);
                            Dispatcher.BeginInvoke(new Action(() =>
                            {
                                if (icon != null)
                                {
                                    img.Source = icon;
                                    var iconBs = icon as BitmapSource;
                                    tag.Tag = iconBs;
                                    ApplyChipGradient(tag, iconBs, false);
                                }
                                ((RotateTransform)placeholder.RenderTransform).BeginAnimation(RotateTransform.AngleProperty, null);
                                placeholder.Visibility = Visibility.Collapsed;
                            }));
                        });
                    }
                    tag.RenderTransform = new ScaleTransform(1, 1);
                    tag.RenderTransformOrigin = new Point(0.5, 0.5);
                    tag.MouseEnter += (s, _) => AnimateChipHover(tag, true);
                    tag.MouseLeave += (s, _) => AnimateChipHover(tag, false);
                    tag.PreviewMouseRightButtonDown += (s, _) => Chip_RightClickDown(tag);
                    tag.PreviewMouseRightButtonUp += (s, _) => Chip_RightClickUp(tag);
                    stack.Children.Add(iconContainer);
                    stack.Children.Add(new TextBlock
                    {
                        Text = appName,
                        Foreground = chipTextBrush,
                        FontSize = 12,
                        VerticalAlignment = VerticalAlignment.Center
                    });
                    tag.Child = stack;

                    var appToRemove = app;
                    var contextMenu = new ContextMenu();
                    if (FindResource("ContextMenuDefaultStyle") is Style contextMenuStyle)
                        contextMenu.Style = contextMenuStyle;
                    var removeItem = new MenuItem
                    {
                        Header = new StackPanel
                        {
                            Orientation = Orientation.Horizontal,
                            Children =
                            {
                                new TextBlock
                                {
                                    Text = LucideIcons.Trash,
                                    FontFamily = (FontFamily)FindResource("FontLucide"),
                                    FontSize = 12,
                                    Margin = new Thickness(0, 0, 8, 0),
                                    VerticalAlignment = VerticalAlignment.Center
                                },
                                new TextBlock
                                {
                                    Text = "Supprimer",
                                    FontSize = 12,
                                    VerticalAlignment = VerticalAlignment.Center
                                }
                            }
                        },
                        Tag = appToRemove
                    };
                    if (FindResource("ContextMenuItemDefaultStyle") is Style deleteStyle)
                        removeItem.Style = deleteStyle;
                    removeItem.Click += (s, e) =>
                    {
                        if (_selectedMacro?.TargetApplications == null) return;
                        _selectedMacro.TargetApplications.Remove(appToRemove);
                        _selectedMacro.ModifiedAt = DateTime.Now;
                        UpdateTargetAppsDisplay();
                        _ = _macroStorage.SaveMacrosAsync(_macros);
                    };
                    contextMenu.Items.Add(removeItem);
                    contextMenu.Opened += (s, _) => Chip_RightClickUp(tag);
                    tag.ContextMenu = contextMenu;

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
                UpdateIconComboBoxesFromMacro(_selectedMacro);
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
                if (ClearShortcutButton != null)
                    ClearShortcutButton.Visibility = _selectedMacro.ShortcutKeyCode != 0 ? Visibility.Visible : Visibility.Collapsed;

                UpdateTargetAppsDisplay();

                // Surveillance continue
                SelectTriggerModeInComboBox(_selectedMacro.TriggerMode);
                TriggerModeOptionsPanel.Visibility = _selectedMacro.TriggerMode == MacroTriggerMode.ContinuousPolling ? Visibility.Visible : Visibility.Collapsed;
                ContinuousMonitoringIntervalTextBox.Text = _selectedMacro.ContinuousMonitoringIntervalMs.ToString();
                UpdateTriggerModeRecommendedText();
            }
            else
            {
                MacroNameTextBox.Text = "";
                MacroDescriptionTextBox.Text = "";
                ShortcutDisplayText.Text = "Non défini";
                if (ClearShortcutButton != null)
                    ClearShortcutButton.Visibility = Visibility.Collapsed;
                IconLucidePanel.Visibility = Visibility.Collapsed;
                IconColorPanel.Visibility = Visibility.Collapsed;
                IconProcessPanel.Visibility = Visibility.Collapsed;
                UpdateTargetAppsDisplay();
                SelectTriggerModeInComboBox(MacroTriggerMode.SingleExecution);
                TriggerModeOptionsPanel.Visibility = Visibility.Collapsed;
                UpdateTriggerModeRecommendedText();
            }
        }

        private void InitializeIconComboBoxes()
        {
            if (IconTypeComboBox == null) return;
            IconTypeComboBox.ItemsSource = new[]
            {
                new { Label = "Icône processus", Value = "Process" }
            };
            IconTypeComboBox.DisplayMemberPath = "Label";
            IconTypeComboBox.SelectedValuePath = "Value";

            LucideIconsListBox.ItemsSource = new[]
            {
                new { Label = "Aucune", Code = "" },
                new { Label = "Plus", Code = "E081" },
                new { Label = "Lecture", Code = "E080" },
                new { Label = "Pause", Code = "E07F" },
                new { Label = "Stop", Code = "E083" },
                new { Label = "Enregistrer", Code = "E345" },
                new { Label = "Paramètres", Code = "E30B" },
                new { Label = "Actualiser", Code = "E148" },
                new { Label = "Fermer", Code = "E084" },
                new { Label = "Croix", Code = "E1E5" },
                new { Label = "X", Code = "E1B2" },
                new { Label = "Moins", Code = "E11C" },
                new { Label = "Presse-papiers", Code = "E085" },
                new { Label = "Dossier", Code = "E0D7" },
                new { Label = "Dossier ouvert", Code = "E247" },
                new { Label = "Télécharger", Code = "E0B2" },
                new { Label = "Envoyer", Code = "E19E" },
                new { Label = "Fichier texte", Code = "E0CC" },
                new { Label = "Carré", Code = "E167" },
                new { Label = "Restaurer", Code = "E09E" },
                new { Label = "Clavier", Code = "E284" },
                new { Label = "Souris", Code = "E11F" },
                new { Label = "Horloge", Code = "E087" },
                new { Label = "Boîte", Code = "E061" },
                new { Label = "Corbeille", Code = "E18E" },
                new { Label = "Répéter", Code = "E146" },
                new { Label = "Annuler", Code = "E19B" },
                new { Label = "Aide", Code = "E082" },
                new { Label = "Valider", Code = "E072" },
                new { Label = "Bibliothèque", Code = "E100" },
                new { Label = "Viseur", Code = "E0AC" },
                new { Label = "Œil", Code = "E0BA" },
                new { Label = "Goutte", Code = "E0B4" },
                new { Label = "Copier", Code = "E09E" },
                new { Label = "Texte", Code = "E198" },
                new { Label = "Marqueur", Code = "E238" },
                new { Label = "Tri", Code = "E376" },
                new { Label = "Éclair", Code = "E0E0" },
                new { Label = "E086", Code = "E086" },
                new { Label = "E088", Code = "E088" },
                new { Label = "E089", Code = "E089" },
                new { Label = "E08A", Code = "E08A" },
                new { Label = "E08B", Code = "E08B" },
                new { Label = "E08C", Code = "E08C" },
                new { Label = "E08D", Code = "E08D" },
                new { Label = "E08E", Code = "E08E" },
                new { Label = "E08F", Code = "E08F" },
                new { Label = "E090", Code = "E090" },
                new { Label = "E091", Code = "E091" },
                new { Label = "E092", Code = "E092" },
                new { Label = "E093", Code = "E093" },
                new { Label = "E094", Code = "E094" },
                new { Label = "E095", Code = "E095" },
                new { Label = "E096", Code = "E096" },
                new { Label = "E097", Code = "E097" },
                new { Label = "E098", Code = "E098" },
                new { Label = "E099", Code = "E099" },
                new { Label = "E09A", Code = "E09A" },
                new { Label = "E09B", Code = "E09B" },
                new { Label = "E09C", Code = "E09C" },
                new { Label = "E09D", Code = "E09D" },
                new { Label = "E09F", Code = "E09F" },
                new { Label = "E0A0", Code = "E0A0" },
                new { Label = "E0A1", Code = "E0A1" },
                new { Label = "E0A2", Code = "E0A2" },
                new { Label = "E0A3", Code = "E0A3" },
                new { Label = "E0A4", Code = "E0A4" },
                new { Label = "E0A5", Code = "E0A5" },
                new { Label = "E0A6", Code = "E0A6" },
                new { Label = "E0A7", Code = "E0A7" },
                new { Label = "E0A8", Code = "E0A8" },
                new { Label = "E0A9", Code = "E0A9" },
                new { Label = "E0AA", Code = "E0AA" },
                new { Label = "E0AB", Code = "E0AB" },
                new { Label = "E0AD", Code = "E0AD" },
                new { Label = "E0AE", Code = "E0AE" },
                new { Label = "E0AF", Code = "E0AF" },
                new { Label = "E0B0", Code = "E0B0" },
                new { Label = "E0B1", Code = "E0B1" },
                new { Label = "E0B3", Code = "E0B3" },
                new { Label = "E0B5", Code = "E0B5" },
                new { Label = "E0B6", Code = "E0B6" },
                new { Label = "E0B7", Code = "E0B7" },
                new { Label = "E0B8", Code = "E0B8" },
                new { Label = "E0B9", Code = "E0B9" },
                new { Label = "E0BB", Code = "E0BB" },
                new { Label = "E0BC", Code = "E0BC" },
                new { Label = "E0BD", Code = "E0BD" },
                new { Label = "E0BE", Code = "E0BE" },
                new { Label = "E0BF", Code = "E0BF" },
                new { Label = "E0C0", Code = "E0C0" },
                new { Label = "E0C1", Code = "E0C1" },
                new { Label = "E0C2", Code = "E0C2" },
                new { Label = "E0C3", Code = "E0C3" },
                new { Label = "E0C4", Code = "E0C4" },
                new { Label = "E0C5", Code = "E0C5" },
                new { Label = "E0C6", Code = "E0C6" },
                new { Label = "E0C7", Code = "E0C7" },
                new { Label = "E0C8", Code = "E0C8" },
                new { Label = "E0C9", Code = "E0C9" },
                new { Label = "E0CA", Code = "E0CA" },
                new { Label = "E0CB", Code = "E0CB" },
                new { Label = "E0CD", Code = "E0CD" },
                new { Label = "E0CE", Code = "E0CE" },
                new { Label = "E0CF", Code = "E0CF" },
                new { Label = "E0D0", Code = "E0D0" },
                new { Label = "E0D1", Code = "E0D1" },
                new { Label = "E0D2", Code = "E0D2" },
                new { Label = "E0D3", Code = "E0D3" },
                new { Label = "E0D4", Code = "E0D4" },
                new { Label = "E0D5", Code = "E0D5" },
                new { Label = "E0D6", Code = "E0D6" },
                new { Label = "E0D8", Code = "E0D8" },
                new { Label = "E0D9", Code = "E0D9" },
                new { Label = "E0DA", Code = "E0DA" },
                new { Label = "E0DB", Code = "E0DB" },
                new { Label = "E0DC", Code = "E0DC" },
                new { Label = "E0DD", Code = "E0DD" },
                new { Label = "E0DE", Code = "E0DE" },
                new { Label = "E0DF", Code = "E0DF" },
                new { Label = "E0E1", Code = "E0E1" },
                new { Label = "E0E2", Code = "E0E2" },
                new { Label = "E0E3", Code = "E0E3" },
                new { Label = "E0E4", Code = "E0E4" },
                new { Label = "E0E5", Code = "E0E5" },
                new { Label = "E0E6", Code = "E0E6" },
                new { Label = "E0E7", Code = "E0E7" },
                new { Label = "E0E8", Code = "E0E8" },
                new { Label = "E0E9", Code = "E0E9" },
                new { Label = "E0EA", Code = "E0EA" },
                new { Label = "E0EB", Code = "E0EB" },
                new { Label = "E0EC", Code = "E0EC" },
                new { Label = "E0ED", Code = "E0ED" },
                new { Label = "E0EE", Code = "E0EE" },
                new { Label = "E0EF", Code = "E0EF" },
                new { Label = "E0F0", Code = "E0F0" },
                new { Label = "E0F1", Code = "E0F1" },
                new { Label = "E0F2", Code = "E0F2" },
                new { Label = "E0F3", Code = "E0F3" },
                new { Label = "E0F4", Code = "E0F4" },
                new { Label = "E0F5", Code = "E0F5" },
                new { Label = "E0F6", Code = "E0F6" },
                new { Label = "E0F7", Code = "E0F7" },
                new { Label = "E0F8", Code = "E0F8" },
                new { Label = "E0F9", Code = "E0F9" },
                new { Label = "E0FA", Code = "E0FA" },
                new { Label = "E0FB", Code = "E0FB" },
                new { Label = "E0FC", Code = "E0FC" },
                new { Label = "E0FD", Code = "E0FD" },
                new { Label = "E0FE", Code = "E0FE" },
                new { Label = "E0FF", Code = "E0FF" },
                new { Label = "E101", Code = "E101" },
                new { Label = "E102", Code = "E102" },
                new { Label = "E103", Code = "E103" },
                new { Label = "E104", Code = "E104" },
                new { Label = "E105", Code = "E105" },
                new { Label = "E106", Code = "E106" },
                new { Label = "E107", Code = "E107" },
                new { Label = "E108", Code = "E108" },
                new { Label = "E109", Code = "E109" },
                new { Label = "E10A", Code = "E10A" },
                new { Label = "E10B", Code = "E10B" },
                new { Label = "E10C", Code = "E10C" },
                new { Label = "E10D", Code = "E10D" },
                new { Label = "E10E", Code = "E10E" },
                new { Label = "E10F", Code = "E10F" },
                new { Label = "E110", Code = "E110" },
                new { Label = "E111", Code = "E111" },
                new { Label = "E112", Code = "E112" },
                new { Label = "E113", Code = "E113" },
                new { Label = "E114", Code = "E114" },
                new { Label = "E115", Code = "E115" },
                new { Label = "E116", Code = "E116" },
                new { Label = "E117", Code = "E117" },
                new { Label = "E118", Code = "E118" },
                new { Label = "E119", Code = "E119" },
                new { Label = "E11A", Code = "E11A" },
                new { Label = "E11B", Code = "E11B" },
                new { Label = "E11D", Code = "E11D" },
                new { Label = "E11E", Code = "E11E" },
                new { Label = "E120", Code = "E120" },
                new { Label = "E121", Code = "E121" },
                new { Label = "E122", Code = "E122" },
                new { Label = "E123", Code = "E123" },
                new { Label = "E124", Code = "E124" },
                new { Label = "E125", Code = "E125" },
                new { Label = "E126", Code = "E126" },
                new { Label = "E127", Code = "E127" },
                new { Label = "E128", Code = "E128" },
                new { Label = "E129", Code = "E129" },
                new { Label = "E12A", Code = "E12A" },
                new { Label = "E12B", Code = "E12B" },
                new { Label = "E12C", Code = "E12C" },
                new { Label = "E12D", Code = "E12D" },
                new { Label = "E12E", Code = "E12E" },
                new { Label = "E12F", Code = "E12F" },
                new { Label = "E130", Code = "E130" },
                new { Label = "E140", Code = "E140" },
                new { Label = "E141", Code = "E141" },
                new { Label = "E142", Code = "E142" },
                new { Label = "E143", Code = "E143" },
                new { Label = "E144", Code = "E144" },
                new { Label = "E145", Code = "E145" },
                new { Label = "E147", Code = "E147" },
                new { Label = "E149", Code = "E149" },
                new { Label = "E14A", Code = "E14A" },
                new { Label = "E14B", Code = "E14B" },
                new { Label = "E14C", Code = "E14C" },
                new { Label = "E14D", Code = "E14D" },
                new { Label = "E14E", Code = "E14E" },
                new { Label = "E14F", Code = "E14F" },
                new { Label = "E150", Code = "E150" },
                new { Label = "E160", Code = "E160" },
                new { Label = "E161", Code = "E161" },
                new { Label = "E162", Code = "E162" },
                new { Label = "E163", Code = "E163" },
                new { Label = "E164", Code = "E164" },
                new { Label = "E165", Code = "E165" },
                new { Label = "E166", Code = "E166" },
                new { Label = "E168", Code = "E168" },
                new { Label = "E169", Code = "E169" },
                new { Label = "E16A", Code = "E16A" },
                new { Label = "E170", Code = "E170" },
                new { Label = "E180", Code = "E180" },
                new { Label = "E190", Code = "E190" },
                new { Label = "E1A0", Code = "E1A0" },
                new { Label = "E1B0", Code = "E1B0" },
                new { Label = "E1C0", Code = "E1C0" },
                new { Label = "E1D0", Code = "E1D0" },
                new { Label = "E1F0", Code = "E1F0" },
                new { Label = "E200", Code = "E200" },
                new { Label = "E210", Code = "E210" },
                new { Label = "E220", Code = "E220" },
                new { Label = "E230", Code = "E230" },
                new { Label = "E240", Code = "E240" },
                new { Label = "E250", Code = "E250" },
                new { Label = "E260", Code = "E260" },
                new { Label = "E270", Code = "E270" },
                new { Label = "E280", Code = "E280" },
                new { Label = "E290", Code = "E290" },
                new { Label = "E2A0", Code = "E2A0" },
                new { Label = "E2B0", Code = "E2B0" },
                new { Label = "E2C0", Code = "E2C0" },
                new { Label = "E2D0", Code = "E2D0" },
                new { Label = "E2E0", Code = "E2E0" },
                new { Label = "E2F0", Code = "E2F0" },
                new { Label = "E300", Code = "E300" },
                new { Label = "E310", Code = "E310" },
                new { Label = "E320", Code = "E320" },
                new { Label = "E330", Code = "E330" },
                new { Label = "E340", Code = "E340" },
                new { Label = "E350", Code = "E350" },
                new { Label = "E360", Code = "E360" },
                new { Label = "E370", Code = "E370" },
                new { Label = "E380", Code = "E380" },
                new { Label = "E390", Code = "E390" },
                new { Label = "E3A0", Code = "E3A0" },
                new { Label = "E3B0", Code = "E3B0" },
                new { Label = "E3C0", Code = "E3C0" },
                new { Label = "E3D0", Code = "E3D0" },
                new { Label = "E3E0", Code = "E3E0" },
                new { Label = "E3F0", Code = "E3F0" }
            };
            LucideIconsListBox.SelectedValuePath = "Code";

            IconColorListBox.ItemsSource = new[]
            {
                new { Label = "Blanc", Code = "#E6E4EA" },
                new { Label = "Cuivre", Code = "#7F4A2E" },
                new { Label = "Vert", Code = "#4FB58C" },
                new { Label = "Bleu", Code = "#4FA3D1" },
                new { Label = "Orange", Code = "#C97A3A" },
                new { Label = "Rouge", Code = "#C94A4A" },
                new { Label = "Jaune", Code = "#D4A84B" },
                new { Label = "Violet", Code = "#9B7DD6" },
                new { Label = "Rose", Code = "#E07A9E" },
                new { Label = "Cyan", Code = "#3DB8C7" },
                new { Label = "Turquoise", Code = "#5BC0BE" },
                new { Label = "Menthe", Code = "#6BCB8A" },
                new { Label = "Corail", Code = "#E07B6F" },
                new { Label = "Lavande", Code = "#B8A9D4" },
                new { Label = "Or", Code = "#C9A227" },
                new { Label = "Bordeaux", Code = "#A63D4B" }
            };
            IconColorListBox.SelectedValuePath = "Code";

            LucideIconsListBox.PreviewMouseLeftButtonDown += (s, _) => _userClickedIconList = true;
            IconColorListBox.PreviewMouseLeftButtonDown += (s, _) => _userClickedIconList = true;
            ProcessIconsListBox.PreviewMouseLeftButtonDown += ProcessIconsListBox_PreviewMouseLeftButtonDown;
        }

        private void DetachIconListHandlers()
        {
            LucideIconsListBox.SelectionChanged -= LucideIconListBox_SelectionChanged;
            IconColorListBox.SelectionChanged -= IconColorListBox_SelectionChanged;
            ProcessIconsListBox.SelectionChanged -= ProcessIconsListBox_SelectionChanged;
        }

        private void ReattachIconListHandlers()
        {
            LucideIconsListBox.SelectionChanged += LucideIconListBox_SelectionChanged;
            IconColorListBox.SelectionChanged += IconColorListBox_SelectionChanged;
            ProcessIconsListBox.SelectionChanged += ProcessIconsListBox_SelectionChanged;
        }

        private void UpdateIconComboBoxesFromMacro(Macro macro, bool clearUpdatingFlag = true, Action? onProcessListReady = null)
        {
            if (IconTypeComboBox == null) return;
            _userClickedIconList = false;
            _updatingIconFromMacro = true;
            DetachIconListHandlers();
            try
            {
                IconTypeComboBox.SelectedValue = "Process";
                IconLucidePanel.Visibility = Visibility.Collapsed;
                IconColorPanel.Visibility = Visibility.Collapsed;
                IconProcessPanel.Visibility = Visibility.Visible;
                RefreshProcessIconsList(() =>
                {
                    ReattachIconListHandlers();
                    onProcessListReady?.Invoke();
                });
                LucideIconsListBox.SelectedIndex = -1;
                IconColorListBox.SelectedIndex = -1;
                // Label sous le tableau d'icônes retiré
            }
            finally
            {
                if (clearUpdatingFlag)
                    _updatingIconFromMacro = false;
            }
        }

        private void IconTypeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_updatingIconFromMacro || _selectedMacro == null || IconTypeComboBox?.SelectedValue is not string value) return;
            _userClickedIconList = false;
            _updatingIconFromMacro = true;
            try
            {
                _selectedMacro.IconType = "Process";
                IconLucidePanel.Visibility = Visibility.Collapsed;
                IconColorPanel.Visibility = Visibility.Collapsed;
                IconProcessPanel.Visibility = Visibility.Visible;
                _selectedMacro.ModifiedAt = DateTime.Now;
                MacrosListBox.Items.Refresh();
                _ = _macroStorage.SaveMacrosAsync(_macros);
                UpdateIconComboBoxesFromMacro(_selectedMacro, clearUpdatingFlag: false,
                    onProcessListReady: () => _updatingIconFromMacro = false);
            }
            finally { }
        }

        private async void LucideIconListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!_userClickedIconList || _selectedMacro == null || LucideIconsListBox?.SelectedValue is not string code) return;
            _userClickedIconList = false;
            var t = _selectedMacro.IconType ?? "";
            if (!string.Equals(t, "Lucide", StringComparison.OrdinalIgnoreCase) && !string.Equals(t, "None", StringComparison.OrdinalIgnoreCase)) return;
            var current = _selectedMacro.LucideIconCode ?? "";
            if (string.Equals(code ?? "", current, StringComparison.OrdinalIgnoreCase)) return;
            _selectedMacro.IconType = "Lucide";
            _selectedMacro.LucideIconCode = code ?? "";
            _selectedMacro.ModifiedAt = DateTime.Now;
            MacrosListBox.Items.Refresh();
            try { await _macroStorage.SaveMacrosAsync(_macros); } catch { /* ignore */ }
        }

        private async void IconColorListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!_userClickedIconList || _selectedMacro == null || IconColorListBox?.SelectedValue is not string color) return;
            _userClickedIconList = false;
            var t = _selectedMacro.IconType ?? "";
            if (!string.Equals(t, "Lucide", StringComparison.OrdinalIgnoreCase) && !string.Equals(t, "None", StringComparison.OrdinalIgnoreCase)) return;
            if (string.Equals(color ?? "", _selectedMacro.IconColor ?? "", StringComparison.OrdinalIgnoreCase)) return;
            _selectedMacro.IconType = "Lucide";
            _selectedMacro.IconColor = color ?? "";
            _selectedMacro.ModifiedAt = DateTime.Now;
            MacrosListBox.Items.Refresh();
            try { await _macroStorage.SaveMacrosAsync(_macros); } catch { /* ignore */ }
        }

        /// <summary>Élément affiché dans la liste des processus (actifs + cibles).</summary>
        private sealed class ProcessIconItem
        {
            public string Path { get; set; } = string.Empty;
            public string DisplayName { get; set; } = string.Empty;
        }

        private void InvalidateProcessIconListCache()
        {
            _cachedProcessIconItems = null;
            _processIconListUtc = DateTime.MinValue;
        }

        /// <summary>Applique la liste d’icônes processus et la sélection pour la macro courante (thread UI).</summary>
        private void ApplyProcessIconsListToUi(List<ProcessIconItem> list, Action? onComplete)
        {
            if (ProcessIconsListBox == null) return;
            _userClickedIconList = false;
            _updatingIconFromMacro = true;
            try
            {
                ProcessIconsListBox.SelectedValuePath = "Path";
                ProcessIconsListBox.ItemsSource = list;
                var currentPath = _selectedMacro?.ProcessIconPath ?? "";
                if (string.IsNullOrEmpty(currentPath))
                    ProcessIconsListBox.SelectedIndex = -1;
                else
                    ProcessIconsListBox.SelectedValue = currentPath;
            }
            finally
            {
                if (onComplete != null)
                    onComplete();
                else
                    _updatingIconFromMacro = false;
            }
        }

        /// <param name="forceRebuild">true après import / parcours .exe : invalide le cache.</param>
        private void RefreshProcessIconsList(Action? onComplete = null, bool forceRebuild = false)
        {
            if (ProcessIconsListBox == null) return;

            if (!forceRebuild &&
                _cachedProcessIconItems != null &&
                DateTime.UtcNow - _processIconListUtc < ProcessIconListCacheTtl)
            {
                ApplyProcessIconsListToUi(_cachedProcessIconItems, onComplete);
                return;
            }

            _ = Task.Run(() =>
            {
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var list = new List<ProcessIconItem>();

                // 1) Processus actifs (avec fenêtre)
                try
                {
                    foreach (var p in ProcessMonitor.GetRunningProcesses())
                    {
                        if (string.IsNullOrEmpty(p.ExecutablePath) || !seen.Add(p.ExecutablePath)) continue;
                        list.Add(new ProcessIconItem { Path = p.ExecutablePath, DisplayName = p.ProcessName });
                    }
                }
                catch { }

                // 2) ProcessIconPath de toutes les macros
                if (_macros != null)
                {
                    foreach (var m in _macros)
                    {
                        var path = m.ProcessIconPath?.Trim();
                        if (string.IsNullOrEmpty(path) || !File.Exists(path) || !seen.Add(path)) continue;
                        list.Add(new ProcessIconItem { Path = path, DisplayName = System.IO.Path.GetFileNameWithoutExtension(path) });
                    }
                }

                // 3) Applications cibles de toutes les macros (résoudre nom → chemin si possible)
                if (_macros != null)
                {
                    foreach (var m in _macros)
                    {
                        if (m.TargetApplications == null) continue;
                        foreach (var app in m.TargetApplications)
                        {
                            var name = System.IO.Path.GetFileNameWithoutExtension(app?.Trim() ?? "");
                            if (string.IsNullOrEmpty(name)) continue;
                            string? path = null;
                            if ((app ?? "").Contains('\\') || (app ?? "").Contains("/"))
                                path = File.Exists(app!) ? app : null;
                            if (string.IsNullOrEmpty(path))
                            {
                                try
                                {
                                    foreach (var proc in Process.GetProcessesByName(name))
                                    {
                                        try
                                        {
                                            path = proc.MainModule?.FileName;
                                            proc.Dispose();
                                            break;
                                        }
                                        catch { proc.Dispose(); }
                                    }
                                }
                                catch { }
                            }
                            if (!string.IsNullOrEmpty(path) && seen.Add(path))
                                list.Add(new ProcessIconItem { Path = path, DisplayName = name });
                        }
                    }
                }

                list = list.OrderBy(x => x.DisplayName, StringComparer.OrdinalIgnoreCase).ToList();
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    _cachedProcessIconItems = list;
                    _processIconListUtc = DateTime.UtcNow;
                    ApplyProcessIconsListToUi(list, onComplete);
                }));
            });
        }

        private async void ProcessIconsListBox_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (_selectedMacro == null) return;
            if (!string.Equals(_selectedMacro.IconType ?? "", "Process", StringComparison.OrdinalIgnoreCase))
                _selectedMacro.IconType = "Process";
            // Trouver l'item cliqué (recliquer sur l'icône déjà sélectionnée = retirer l'icône)
            var dep = e.OriginalSource as DependencyObject;
            while (dep != null && dep is not ListBoxItem)
                dep = VisualTreeHelper.GetParent(dep);
            if (dep is ListBoxItem lbi && lbi.DataContext is ProcessIconItem clickedItem)
            {
                var currentPath = _selectedMacro.ProcessIconPath ?? "";
                if (string.Equals(clickedItem.Path ?? "", currentPath, StringComparison.OrdinalIgnoreCase))
                {
                    e.Handled = true;
                    _selectedMacro.ProcessIconPath = "";
                    _selectedMacro.ModifiedAt = DateTime.Now;
                    MacrosListBox.Items.Refresh();
                    ProcessIconsListBox.SelectedIndex = -1;
                    try { await _macroStorage.SaveMacrosAsync(_macros); } catch { }
                    return;
                }
            }
            _userClickedIconList = true;
        }

        private async void ProcessIconsListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!_userClickedIconList || _selectedMacro == null) return;
            _userClickedIconList = false;
            if (!string.Equals(_selectedMacro.IconType ?? "", "Process", StringComparison.OrdinalIgnoreCase))
                _selectedMacro.IconType = "Process";
            if (ProcessIconsListBox?.SelectedItem is ProcessIconItem item)
            {
                var newPath = item.Path ?? "";
                _selectedMacro.ProcessIconPath = newPath;
                _selectedMacro.ModifiedAt = DateTime.Now;
                MacrosListBox.Items.Refresh();
                try { await _macroStorage.SaveMacrosAsync(_macros); } catch { }
            }
        }

        private async void AddProcessIcon_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedMacro == null) return;
            var dlg = new OpenFileDialog
            {
                Filter = "Exécutables (*.exe)|*.exe|Tous les fichiers (*.*)|*.*",
                Title = "Sélectionner un processus (fichier .exe)"
            };
            if (dlg.ShowDialog() == true && !string.IsNullOrEmpty(dlg.FileName))
            {
                _selectedMacro.IconType = "Process";
                _selectedMacro.ProcessIconPath = dlg.FileName;
                _selectedMacro.ModifiedAt = DateTime.Now;
                InvalidateProcessIconListCache();
                UpdateIconComboBoxesFromMacro(_selectedMacro);
                MacrosListBox.Items.Refresh();
                try { await _macroStorage.SaveMacrosAsync(_macros); } catch { }
            }
        }

        /// <summary>
        /// Met à jour le résumé de la macro (ce qu'elle fait) dans le panneau propriétés.
        /// </summary>
        private void UpdateMacroSummary()
        {
            // Résumé retiré de l'UI.
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

        private void TriggerModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_selectedMacro == null || TriggerModeComboBox?.SelectedItem is not TriggerModeOption option) return;
            var mode = option.Mode;
            if (_selectedMacro.TriggerMode == mode) return; // Éviter boucle lors du chargement
            _selectedMacro.TriggerMode = mode;
            TriggerModeOptionsPanel.Visibility = mode == MacroTriggerMode.ContinuousPolling ? Visibility.Visible : Visibility.Collapsed;
            _selectedMacro.ModifiedAt = DateTime.Now;
            UpdateTriggerModeRecommendedText();
            _ = _macroStorage.SaveMacrosAsync(_macros);
        }

        private void SelectTriggerModeInComboBox(MacroTriggerMode mode)
        {
            if (TriggerModeComboBox?.Items == null) return;
            var option = TriggerModeComboBox.Items.OfType<TriggerModeOption>().FirstOrDefault(o => o.Mode == mode);
            if (option != null)
                TriggerModeComboBox.SelectedItem = option;
        }

        private static MacroTriggerMode GetRecommendedTriggerMode(Macro? macro)
        {
            var (mode, _) = GetRecommendedTriggerModeWithContext(macro);
            return mode;
        }

        private static IEnumerable<IInputAction> FlattenActions(IEnumerable<IInputAction> actions)
        {
            foreach (var a in actions)
            {
                yield return a;
                if (a is IfAction ifa)
                {
                    foreach (var child in FlattenActions(ifa.ThenActions ?? Enumerable.Empty<IInputAction>()))
                        yield return child;
                    foreach (var child in FlattenActions(ifa.ElseActions ?? Enumerable.Empty<IInputAction>()))
                        yield return child;
                    foreach (var branch in ifa.ElseIfBranches ?? Enumerable.Empty<ElseIfBranch>())
                    {
                        foreach (var g in branch.ConditionGroups ?? Enumerable.Empty<ConditionGroup>())
                            foreach (var _ in g.Conditions ?? Enumerable.Empty<ConditionItem>()) { }
                        foreach (var child in FlattenActions(branch.Actions ?? Enumerable.Empty<IInputAction>()))
                            yield return child;
                    }
                }
                else if (a is RepeatAction ra)
                {
                    foreach (var child in FlattenActions(ra.Actions ?? Enumerable.Empty<IInputAction>()))
                        yield return child;
                }
            }
        }

        private static IEnumerable<ConditionType> GetConditionTypesFromIf(IfAction ifAction)
        {
            foreach (var g in ifAction.ConditionGroups ?? Enumerable.Empty<ConditionGroup>())
                foreach (var c in g.Conditions ?? Enumerable.Empty<ConditionItem>())
                    yield return c.ConditionType;
            foreach (var c in ifAction.Conditions ?? Enumerable.Empty<ConditionItem>())
                yield return c.ConditionType;
            foreach (var branch in ifAction.ElseIfBranches ?? Enumerable.Empty<ElseIfBranch>())
                foreach (var g in branch.ConditionGroups ?? Enumerable.Empty<ConditionGroup>())
                    foreach (var c in g.Conditions ?? Enumerable.Empty<ConditionItem>())
                        yield return c.ConditionType;
        }

        private void UpdateTriggerModeRecommendedText()
        {
            const string tipSingle = "Une fois au déclenchement.";
            const string tipEvent = "Pour conditions clavier/souris/app/temps.";
            const string tipPolling = "Pour conditions pixel/image/texte à l'écran.";

            var recommended = _selectedMacro != null ? GetRecommendedTriggerModeWithContext(_selectedMacro).mode : MacroTriggerMode.SingleExecution;
            var options = new List<TriggerModeOption>
            {
                new() { Label = "Exécution unique", Tooltip = tipSingle, Mode = MacroTriggerMode.SingleExecution, IsRecommended = recommended == MacroTriggerMode.SingleExecution },
                new() { Label = "Déclenchement sur événement", Tooltip = tipEvent, Mode = MacroTriggerMode.EventDriven, IsRecommended = recommended == MacroTriggerMode.EventDriven },
                new() { Label = "Surveillance continue", Tooltip = tipPolling, Mode = MacroTriggerMode.ContinuousPolling, IsRecommended = recommended == MacroTriggerMode.ContinuousPolling }
            };

            var currentMode = _selectedMacro?.TriggerMode ?? MacroTriggerMode.SingleExecution;
            TriggerModeComboBox.ItemsSource = options;
            TriggerModeComboBox.SelectedItem = options.FirstOrDefault(o => o.Mode == currentMode) ?? options[0];

            TriggerModeComboBox.ToolTip = currentMode switch
            {
                MacroTriggerMode.SingleExecution => tipSingle,
                MacroTriggerMode.EventDriven => tipEvent,
                MacroTriggerMode.ContinuousPolling => tipPolling,
                _ => tipSingle
            };
        }

        private static (MacroTriggerMode mode, bool hasConditions) GetRecommendedTriggerModeWithContext(Macro? macro)
        {
            if (macro?.Actions == null || macro.Actions.Count == 0)
                return (MacroTriggerMode.SingleExecution, false);
            bool hasPollingCondition = false;
            bool hasEventCondition = false;
            bool hasAnyCondition = false;
            foreach (var action in FlattenActions(macro.Actions))
            {
                if (action is IfAction ifAction)
                {
                    foreach (var ct in GetConditionTypesFromIf(ifAction))
                    {
                        hasAnyCondition = true;
                        if (ct == ConditionType.PixelColor || ct == ConditionType.ImageOnScreen || ct == ConditionType.TextOnScreen)
                            hasPollingCondition = true;
                        else if (ct == ConditionType.KeyboardKey || ct == ConditionType.MouseClick || ct == ConditionType.MousePosition ||
                                 ct == ConditionType.ActiveApplication || ct == ConditionType.TimeDate || ct == ConditionType.ProcessRunning)
                            hasEventCondition = true;
                    }
                }
            }
            if (!hasAnyCondition) return (MacroTriggerMode.SingleExecution, false);
            if (hasPollingCondition) return (MacroTriggerMode.ContinuousPolling, true);
            if (hasEventCondition) return (MacroTriggerMode.EventDriven, true);
            return (MacroTriggerMode.SingleExecution, true);
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
                MaximizeButton.Content = LucideIcons.CreateIcon(WindowState == WindowState.Maximized ? LucideIcons.Restore : LucideIcons.Maximize, 12);
        }

        protected override void OnStateChanged(EventArgs e)
        {
            base.OnStateChanged(e);
            UpdateMaximizeButtonContent();
        }
    }

    /// <summary>
    /// Option pour le ComboBox du mode de déclenchement (affichage liste + sélection).
    /// </summary>
    public sealed class TriggerModeOption
    {
        public string Label { get; set; } = string.Empty;
        public string Tooltip { get; set; } = string.Empty;
        public MacroTriggerMode Mode { get; set; }
        public bool IsRecommended { get; set; }

        public override string ToString() => Label;
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


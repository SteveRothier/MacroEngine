using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using Microsoft.Win32;
using MacroEngine.Core.Engine;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Models;
using MacroEngine.Core.Profiles;
using MacroEngine.Core.Hooks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Storage;
using Engine = MacroEngine.Core.Engine;

namespace MacroEngine.UI
{
    public partial class MainWindow : Window
    {
        private readonly ILogger _logger;
        private readonly IMacroEngine _macroEngine;
        private readonly IProfileProvider _profileProvider;
        private readonly MacroStorage _macroStorage;
        private readonly ObservableCollection<LogEntry> _logEntries;
        private List<Macro> _macros;
        private Macro _selectedMacro;
        private MacroEditor _macroEditor;
        private LogsWindow? _logsWindow;
        
        // Hooks pour l'enregistrement
        private KeyboardHook _keyboardHook;
        private MouseHook _mouseHook;
        
        // Hook global pour F10 (exécution de macro)
        private KeyboardHook _globalExecuteHook;
        private const int VK_F10 = 0x79; // Code virtuel de la touche F10
        private bool _isRecording = false;
        private bool _isRecordingPaused = false;
        private DateTime _lastActionTime;
        private readonly object _pressedKeysLock = new object();
        private HashSet<int> _pressedKeys = new HashSet<int>();
        private Dictionary<int, DateTime> _keyDownTimes = new Dictionary<int, DateTime>();
        private DateTime _lastEditorRefresh = DateTime.MinValue;
        private const int EDITOR_REFRESH_INTERVAL_MS = 50; // Rafraîchir l'éditeur max toutes les 50ms pour un affichage réactif
        private DateTime _lastKeyRecorded = DateTime.MinValue;
        private const int MIN_KEY_INTERVAL_MS = 50; // Intervalle minimum entre deux touches enregistrées (50ms = 20 touches/seconde max)
        private int _rapidKeyWarningCount = 0;
        private DateTime _lastRapidKeyWarning = DateTime.MinValue;
        private readonly object _recordingLock = new object();
        private volatile int _recordingInProgress = 0;
        
        // Timer pour la sauvegarde automatique
        private System.Windows.Threading.DispatcherTimer _autoSaveTimer;
        private const int AUTO_SAVE_DELAY_MS = 2000; // Sauvegarder 2 secondes après la dernière modification

        public MainWindow()
        {
            InitializeComponent();
            
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
            _macros = new List<Macro>();

            // Initialiser l'éditeur de macro
            _macroEditor = new MacroEditor();
            _macroEditor.MacroModified += MacroEditor_MacroModified;
            MacroEditorContainer.Content = _macroEditor;

            // Initialiser les hooks pour l'enregistrement
            _keyboardHook = new KeyboardHook();
            _mouseHook = new MouseHook();
            InitializeRecordingHooks();

            // Initialiser le hook global pour F10 (exécution)
            _globalExecuteHook = new KeyboardHook();
            _globalExecuteHook.KeyDown += GlobalExecuteHook_KeyDown;
            InitializeGlobalExecuteHook();

            InitializeEngine();
            InitializeAutoSave();
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
        }

        private void InitializeGlobalExecuteHook()
        {
            // Installer le hook global pour F10
            try
            {
                _globalExecuteHook.Install();
            }
            catch (Exception ex)
            {
                // Si l'installation échoue, on continue quand même
                System.Diagnostics.Debug.WriteLine($"Impossible d'installer le hook global F10: {ex.Message}");
            }
        }

        private void InitializeAutoSave()
        {
            _autoSaveTimer = new System.Windows.Threading.DispatcherTimer();
            _autoSaveTimer.Interval = TimeSpan.FromMilliseconds(AUTO_SAVE_DELAY_MS);
            _autoSaveTimer.Tick += AutoSaveTimer_Tick;
        }

        private async void AutoSaveTimer_Tick(object sender, EventArgs e)
        {
            _autoSaveTimer.Stop();
            
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
            if (_selectedMacro == null)
                return;

            // Redémarrer le timer : sauvegarder après AUTO_SAVE_DELAY_MS de non-modification
            _autoSaveTimer.Stop();
            _autoSaveTimer.Start();
        }

        private void MacroEditor_MacroModified(object sender, EventArgs e)
        {
            // Déclencher la sauvegarde automatique quand la macro est modifiée
            TriggerAutoSave();
        }

        private void GlobalExecuteHook_KeyDown(object sender, KeyboardHookEventArgs e)
        {
            // Vérifier que c'est F10 et qu'on n'est pas en train d'enregistrer
            if (e.VirtualKeyCode == VK_F10 && !_isRecording && _macroEngine.State == MacroEngineState.Idle)
            {
                // Bloquer la propagation de F10 pour éviter qu'il ouvre des menus
                e.Handled = true;
                
                // Exécuter la macro de manière asynchrone
                _ = ExecuteMacroAsync();
            }
        }

        private void InitializeEngine()
        {
            _macroEngine.StateChanged += MacroEngine_StateChanged;
            _macroEngine.ErrorOccurred += MacroEngine_ErrorOccurred;
            _macroEngine.ActionExecuted += MacroEngine_ActionExecuted;
        }

        private void MacroEngine_StateChanged(object sender, MacroEngineEventArgs e)
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

        private void MacroEngine_ErrorOccurred(object sender, MacroEngineErrorEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                StatusText.Text = $"Erreur: {e.Message}";
                MessageBox.Show(e.Message, "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            });
        }

        private void MacroEngine_ActionExecuted(object sender, ActionExecutedEventArgs e)
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
                    this.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        MacrosListBox.SelectedIndex = 0;
                        _selectedMacro = _macros[0];
                        if (_macroEditor != null)
                        {
                            _macroEditor.LoadMacro(_selectedMacro);
                        }
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors du chargement des macros: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
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
                Name = "Touche H",
                VirtualKeyCode = 0x48, // H
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "Délai 200ms",
                Duration = 200
            });

            // Appuyer sur 'e'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "Touche E",
                VirtualKeyCode = 0x45, // E
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "Délai 200ms",
                Duration = 200
            });

            // Appuyer sur 'l'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "Touche L",
                VirtualKeyCode = 0x4C, // L
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "Délai 200ms",
                Duration = 200
            });

            // Appuyer sur 'l'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "Touche L",
                VirtualKeyCode = 0x4C, // L
                ActionType = MacroEngine.Core.Inputs.KeyboardActionType.Press
            });

            // Délai
            actions.Add(new MacroEngine.Core.Inputs.DelayAction
            {
                Name = "Délai 200ms",
                Duration = 200
            });

            // Appuyer sur 'o'
            actions.Add(new MacroEngine.Core.Inputs.KeyboardAction
            {
                Name = "Touche O",
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
            try
            {
                var profiles = await _profileProvider.LoadProfilesAsync();
                var activeProfile = profiles.FirstOrDefault(p => p.IsActive);
                ActiveProfileText.Text = activeProfile?.Name ?? "Aucun";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors du chargement des profils: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void MacrosListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _selectedMacro = MacrosListBox.SelectedItem as Macro;
            if (_selectedMacro != null)
            {
                // Charger l'éditeur avec la macro sélectionnée
                _macroEditor.LoadMacro(_selectedMacro);
            }
            else
            {
                // Vider l'éditeur si aucune macro sélectionnée
                _macroEditor.LoadMacro(null);
            }
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
                        MessageBox.Show("Veuillez sélectionner une macro", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
                    });
                    return;
                }

                if (_selectedMacro.Actions == null || _selectedMacro.Actions.Count == 0)
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "La macro sélectionnée ne contient aucune action";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                        MessageBox.Show("La macro sélectionnée ne contient aucune action", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
                    });
                    return;
                }

                if (_isRecording)
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusText.Text = "Impossible d'exécuter : enregistrement en cours";
                        StatusText.Foreground = System.Windows.Media.Brushes.Orange;
                        MessageBox.Show("Veuillez arrêter l'enregistrement avant d'exécuter une macro", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
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

                // Exécuter la macro
                Dispatcher.Invoke(() =>
                {
                    StatusText.Text = "Exécution de la macro en cours...";
                    StatusText.Foreground = System.Windows.Media.Brushes.Black;
                });
                
                bool success = await _macroEngine.StartMacroAsync(_selectedMacro);
                
                Dispatcher.Invoke(() =>
                {
                    if (success)
                    {
                        StatusText.Text = "Exécution terminée";
                        StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    }
                    else
                    {
                        StatusText.Text = "Erreur lors de l'exécution";
                        StatusText.Foreground = System.Windows.Media.Brushes.Red;
                    }
                });
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() =>
                {
                    StatusText.Text = $"Erreur: {ex.Message}";
                    StatusText.Foreground = System.Windows.Media.Brushes.Red;
                    MessageBox.Show($"Erreur lors de l'exécution: {ex.Message}\n\nDétails: {ex.StackTrace}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
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
                MessageBox.Show("Veuillez sélectionner une macro", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

                if (_macroEngine.State != MacroEngineState.Idle)
                {
                    MessageBox.Show("Veuillez arrêter l'exécution avant de commencer l'enregistrement", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
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
                StatusText.Text = $"Erreur: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
                MessageBox.Show($"Erreur lors de l'enregistrement: {ex.Message}\n\nDétails: {ex.StackTrace}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
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
            lock (_pressedKeysLock)
            {
                _pressedKeys.Clear();
            }
            _keyDownTimes.Clear();

            // Initialiser la liste d'actions si nécessaire
            if (_selectedMacro.Actions == null)
            {
                _selectedMacro.Actions = new List<IInputAction>();
            }
            else
            {
                // Optionnel : vider les actions existantes ou les conserver
                // Pour l'instant, on les conserve pour permettre d'ajouter des actions
            }

            // Désinstaller le hook global F10 pendant l'enregistrement
            _globalExecuteHook.Uninstall();

            // Installer les hooks
            try
            {
                _keyboardHook.Install();
                _mouseHook.Install();
            }
            catch (Exception ex)
            {
                _isRecording = false;
                MessageBox.Show($"Impossible d'installer les hooks. Assurez-vous que l'application a les privilèges administrateur.\n\nErreur: {ex.Message}", 
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Mettre à jour l'interface
            StartButton.Content = "● Enregistrement...";
            StatusText.Text = "Enregistrement en cours... Appuyez sur les touches ou cliquez avec la souris (max 20 touches/seconde)";
            StatusText.Foreground = System.Windows.Media.Brushes.Black;
            ExecuteButton.IsEnabled = false; // Désactiver l'exécution pendant l'enregistrement
            PauseButton.IsEnabled = true;
            PauseButton.Content = "⏸ Pause";
            StopButton.IsEnabled = true;
            _isRecordingPaused = false;
            
            _logger.Info("Hooks d'enregistrement installés avec succès", "MainWindow");
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

            // Réinstaller le hook global F10 après l'enregistrement
            InitializeGlobalExecuteHook();

            // Traiter les touches restantes appuyées
            ProcessRemainingKeys();

            // Mettre à jour l'interface
            StartButton.Content = "● Enregistrer";
            StatusText.Text = $"Enregistrement terminé. {_selectedMacro.Actions.Count} action(s) enregistrée(s)";
            ExecuteButton.IsEnabled = _macroEngine.State == MacroEngineState.Idle; // Réactiver l'exécution si le moteur est inactif
            PauseButton.IsEnabled = false;
            StopButton.IsEnabled = false;

            // Rafraîchir l'éditeur
            if (_macroEditor != null && _selectedMacro != null)
            {
                _macroEditor.LoadMacro(_selectedMacro);
            }

            // Sauvegarder automatiquement après l'enregistrement
            _selectedMacro.ModifiedAt = DateTime.Now;
            _ = _macroStorage.SaveMacrosAsync(_macros);
        }

        private void KeyboardHook_KeyDown(object sender, KeyboardHookEventArgs e)
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
                    if (_selectedMacro.Actions == null)
                    {
                        _selectedMacro.Actions = new List<IInputAction>();
                    }

                    // Enregistrer le temps de pression
                    _keyDownTimes[keyCode] = timestamp;

                    // Ajouter un délai si nécessaire
                    AddDelayIfNeeded();

                    // Créer une action clavier
                    var keyboardAction = new KeyboardAction
                    {
                        Name = $"Touche {GetKeyName((ushort)keyCode)}",
                        VirtualKeyCode = (ushort)keyCode,
                        ActionType = KeyboardActionType.Press
                    };

                    _selectedMacro.Actions.Add(keyboardAction);
                    _lastActionTime = timestamp;

                    // Afficher dans la zone d'actions
                    var actionItem = new ActionLogItem
                    {
                        Timestamp = timestamp.ToString("HH:mm:ss.fff"),
                        Description = $"Enregistré: {keyboardAction.Name}"
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
                        if (items.Count % 10 == 0 && ActionsCountText != null)
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

        private void KeyboardHook_KeyUp(object sender, KeyboardHookEventArgs e)
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

        private void MouseHook_MouseDown(object sender, MouseHookEventArgs e)
        {
            if (!_isRecording || _isRecordingPaused)
                return;

            // Vérifier si le clic est dans la fenêtre de l'application (ne pas enregistrer les clics sur les boutons)
            if (IsClickInApplicationWindow(e.X, e.Y))
                return;

            var x = e.X;
            var y = e.Y;
            var button = e.Button;
            var timestamp = DateTime.Now;

            Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    // Vérifier à nouveau que l'enregistrement est toujours actif
                    if (!_isRecording || _isRecordingPaused)
                        return;

                    // Vérifier que la liste d'actions existe
                    if (_selectedMacro.Actions == null)
                    {
                        _selectedMacro.Actions = new List<IInputAction>();
                    }

                    // Ajouter un délai si nécessaire
                    AddDelayIfNeeded();

                    MouseActionType actionType = button switch
                    {
                        MouseButton.Left => MouseActionType.LeftClick,
                        MouseButton.Right => MouseActionType.RightClick,
                        MouseButton.Middle => MouseActionType.MiddleClick,
                        _ => MouseActionType.LeftClick
                    };

                    var mouseAction = new MouseAction
                    {
                        Name = $"Clic {button}",
                        ActionType = actionType,
                        X = x,
                        Y = y
                    };

                    _selectedMacro.Actions.Add(mouseAction);
                    _lastActionTime = timestamp;
                    
                    // Déclencher la sauvegarde automatique
                    TriggerAutoSave();

                    // Afficher dans la zone d'actions
                    var actionItem = new ActionLogItem
                    {
                        Timestamp = timestamp.ToString("HH:mm:ss.fff"),
                        Description = $"Enregistré: {mouseAction.Name} à ({x}, {y})"
                    };

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

                    ActionsCountText.Text = $"{_selectedMacro.Actions.Count} action(s)";
                    
                    // Scroller vers le bas uniquement de temps en temps pour éviter la surcharge
                    if (ActionsListBox.Items.Count > 0 && ActionsListBox.Items.Count % 5 == 0)
                    {
                        ActionsListBox.ScrollIntoView(ActionsListBox.Items[ActionsListBox.Items.Count - 1]);
                    }
                    
                    // Rafraîchir l'éditeur moins fréquemment pour éviter la surcharge
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
                    System.Diagnostics.Debug.WriteLine($"Erreur lors de l'enregistrement du clic: {ex.Message}");
                    System.Diagnostics.Debug.WriteLine($"Stack trace: {ex.StackTrace}");
                }
            }), System.Windows.Threading.DispatcherPriority.Input);
        }

        private void MouseHook_MouseUp(object sender, MouseHookEventArgs e)
        {
            // Les clics sont déjà gérés dans MouseDown avec LeftClick/RightClick
        }

        private void AddDelayIfNeeded()
        {
            // Ne pas ajouter de délai si la checkbox est décochée
            if (RecordDelaysCheckBox.IsChecked == false)
                return;

            if (_selectedMacro.Actions.Count > 0)
            {
                var elapsed = (DateTime.Now - _lastActionTime).TotalMilliseconds;
                if (elapsed > 50) // Ajouter un délai si plus de 50ms entre les actions
                {
                    var delayAction = new DelayAction
                    {
                        Name = $"Délai {elapsed:F0}ms",
                        Duration = (int)elapsed
                    };
                    _selectedMacro.Actions.Add(delayAction);
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
            return virtualKeyCode switch
            {
                0x20 => "Espace",
                0x0D => "Entrée",
                0x08 => "Retour",
                0x09 => "Tab",
                0x1B => "Échap",
                0x41 => "A", 0x42 => "B", 0x43 => "C", 0x44 => "D", 0x45 => "E",
                0x46 => "F", 0x47 => "G", 0x48 => "H", 0x49 => "I", 0x4A => "J",
                0x4B => "K", 0x4C => "L", 0x4D => "M", 0x4E => "N", 0x4F => "O",
                0x50 => "P", 0x51 => "Q", 0x52 => "R", 0x53 => "S", 0x54 => "T",
                0x55 => "U", 0x56 => "V", 0x57 => "W", 0x58 => "X", 0x59 => "Y", 0x5A => "Z",
                0x30 => "0", 0x31 => "1", 0x32 => "2", 0x33 => "3", 0x34 => "4",
                0x35 => "5", 0x36 => "6", 0x37 => "7", 0x38 => "8", 0x39 => "9",
                0x10 => "Shift", 0x11 => "Ctrl", 0x12 => "Alt",
                _ => $"VK{virtualKeyCode:X}"
            };
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
                    PauseButton.Content = "▶ Reprendre";
                    StatusText.Text = "Enregistrement en pause";
                }
                else
                {
                    // Reprendre l'enregistrement
                    _isRecordingPaused = false;
                    PauseButton.Content = "⏸ Pause";
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
                // Arrêter l'exécution de macro (si nécessaire dans le futur)
                _macroEngine.StopMacroAsync();
            StatusText.Text = "Arrêté";
            }
        }

        private void RefreshMacroEditor()
        {
            if (_macroEditor != null && _selectedMacro != null)
            {
                // Rafraîchir le DataGrid pour afficher les nouvelles actions
                Dispatcher.Invoke(() =>
                {
                    _macroEditor.RefreshActions();
                });
            }
        }

        private bool IsClickInApplicationWindow(int x, int y)
        {
            try
            {
                // Obtenir les limites de la fenêtre de l'application
                var windowHandle = new WindowInteropHelper(this).Handle;
                if (windowHandle == IntPtr.Zero)
                    return false;

                // Obtenir le rectangle de la fenêtre
                if (GetWindowRect(windowHandle, out RECT rect))
                {
                    // Vérifier si le point est dans le rectangle
                    return x >= rect.Left && x <= rect.Right && y >= rect.Top && y <= rect.Bottom;
                }
            }
            catch
            {
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
            // Ouvrir l'éditeur de profil
        }

        private void ManageProfiles_Click(object sender, RoutedEventArgs e)
        {
            // Ouvrir le gestionnaire de profils
        }

        private void ChangeProfile_Click(object sender, RoutedEventArgs e)
        {
            // Ouvrir le sélecteur de profil
        }

        private void Settings_Click(object sender, RoutedEventArgs e)
        {
            // Configuration
            MessageBox.Show("Configuration à implémenter", "Configuration", MessageBoxButton.OK, MessageBoxImage.Information);
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

        private void OpenMacro_Click(object sender, RoutedEventArgs e)
        {
            // Ouvrir une macro (fonctionnalité à implémenter si nécessaire)
            MessageBox.Show("Utilisez 'Importer Macro' pour importer une macro depuis un fichier JSON", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private async void SaveMacro_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_selectedMacro == null)
                {
                    MessageBox.Show("Aucune macro sélectionnée", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                // Mettre à jour la date de modification
                _selectedMacro.ModifiedAt = DateTime.Now;

                // Sauvegarder toutes les macros
                await _macroStorage.SaveMacrosAsync(_macros);

                StatusText.Text = $"Macro '{_selectedMacro.Name}' sauvegardée";
                StatusText.Foreground = System.Windows.Media.Brushes.Green;
                MessageBox.Show($"Macro '{_selectedMacro.Name}' sauvegardée avec succès", "Succès", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de la sauvegarde: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
                MessageBox.Show($"Erreur lors de la sauvegarde: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void ExportMacro_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_selectedMacro == null)
                {
                    MessageBox.Show("Aucune macro sélectionnée", "Information", MessageBoxButton.OK, MessageBoxImage.Information);
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
                    
                    StatusText.Text = $"Macro '{_selectedMacro.Name}' exportée avec succès";
                    StatusText.Foreground = System.Windows.Media.Brushes.Green;
                    MessageBox.Show($"Macro '{_selectedMacro.Name}' exportée avec succès vers:\n{saveDialog.FileName}", 
                        "Export réussi", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de l'export: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
                MessageBox.Show($"Erreur lors de l'export de la macro: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
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
                    MessageBox.Show($"Macro '{importedMacro.Name}' importée avec succès depuis:\n{openDialog.FileName}", 
                        "Import réussi", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Erreur lors de l'import: {ex.Message}";
                StatusText.Foreground = System.Windows.Media.Brushes.Red;
                MessageBox.Show($"Erreur lors de l'import de la macro: {ex.Message}", "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Exit_Click(object sender, RoutedEventArgs e)
        {
            _logger.Info("Arrêt de l'application demandé", "MainWindow");
            
            // Arrêter l'enregistrement si actif
            if (_isRecording)
            {
                StopRecording();
            }

            // Nettoyer les hooks
            _keyboardHook?.Dispose();
            _mouseHook?.Dispose();
            _globalExecuteHook?.Dispose();
            
            // Fermer la fenêtre de logs si ouverte
            _logsWindow?.Close();

            _logger.Info("Application arrêtée", "MainWindow");
            _logger.Dispose();

            Application.Current.Shutdown();
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


using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Moteur d'exécution de macros haute performance
    /// </summary>
    public class MacroEngine : IMacroEngine
    {
        private MacroEngineState _state = MacroEngineState.Idle;
        private Macro _currentMacro;
        private CancellationTokenSource _cancellationTokenSource;
        private readonly TimingEngine _timingEngine;
        private readonly object _lockObject = new object();
        private readonly ILogger? _logger;

        public event EventHandler<MacroEngineEventArgs> StateChanged;
        public event EventHandler<MacroEngineErrorEventArgs> ErrorOccurred;
        public event EventHandler<ActionExecutedEventArgs> ActionExecuted;

        public MacroEngine(ILogger? logger = null)
        {
            _logger = logger;
            _timingEngine = new TimingEngine(Config.MaxCPS);
            _logger?.Info("MacroEngine initialisé", "MacroEngine");
        }

        public MacroEngineState State
        {
            get
            {
                lock (_lockObject)
                {
                    return _state;
                }
            }
            private set
            {
                lock (_lockObject)
                {
                    var previousState = _state;
                    _state = value;
                    
                    // Logger les transitions d'état importantes
                    if (previousState != value)
                    {
                        _logger?.Info($"État changé: {previousState} → {value}", "MacroEngine");
                    }
                    
                    StateChanged?.Invoke(this, new MacroEngineEventArgs
                    {
                        PreviousState = previousState,
                        CurrentState = value,
                        Macro = _currentMacro
                    });
                }
            }
        }

        public Macro CurrentMacro => _currentMacro;
        public MacroEngineConfig Config { get; set; } = new MacroEngineConfig();

        public async Task<bool> StartMacroAsync(Macro macro)
        {
            if (macro == null)
            {
                _logger?.Warning("Tentative de démarrage avec une macro null", "MacroEngine");
                return false;
            }

            lock (_lockObject)
            {
                if (_state != MacroEngineState.Idle)
                {
                    _logger?.Warning($"Tentative de démarrage alors que l'état est {_state}", "MacroEngine");
                    return false;
                }

                _currentMacro = macro;
                _cancellationTokenSource = new CancellationTokenSource();
                State = MacroEngineState.Running;
            }

            _logger?.Info($"Démarrage de la macro '{macro.Name}' ({macro.Actions?.Count ?? 0} actions)", "MacroEngine");
            _timingEngine.Reset();

            try
            {
                await ExecuteMacroAsync(macro, _cancellationTokenSource.Token);
                return true;
            }
            catch (OperationCanceledException)
            {
                _logger?.Info($"Macro '{macro.Name}' arrêtée par l'utilisateur", "MacroEngine");
                return true;
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de l'exécution de la macro '{macro.Name}'", ex, "MacroEngine");
                ErrorOccurred?.Invoke(this, new MacroEngineErrorEventArgs
                {
                    Exception = ex,
                    Message = $"Erreur lors de l'exécution de la macro: {ex.Message}",
                    Macro = macro
                });
                return false;
            }
            finally
            {
                lock (_lockObject)
                {
                    _logger?.Info($"Macro '{macro.Name}' terminée", "MacroEngine");
                    State = MacroEngineState.Idle;
                    _currentMacro = null;
                    _cancellationTokenSource?.Dispose();
                    _cancellationTokenSource = null;
                }
            }
        }

        public async Task StopMacroAsync()
        {
            lock (_lockObject)
            {
                if (_state == MacroEngineState.Idle)
                    return;

                _logger?.Info($"Arrêt d'urgence de la macro '{_currentMacro?.Name ?? "inconnue"}'", "MacroEngine");
                State = MacroEngineState.Stopping;
            }

            _cancellationTokenSource?.Cancel();

            // Attendre que l'exécution se termine
            while (State != MacroEngineState.Idle)
            {
                await Task.Delay(10);
            }
        }

        public async Task PauseMacroAsync()
        {
            lock (_lockObject)
            {
                if (_state != MacroEngineState.Running)
                    return;

                _logger?.Info($"Pause de la macro '{_currentMacro?.Name ?? "inconnue"}'", "MacroEngine");
                State = MacroEngineState.Paused;
            }
        }

        public async Task ResumeMacroAsync()
        {
            lock (_lockObject)
            {
                if (_state != MacroEngineState.Paused)
                    return;

                _logger?.Info($"Reprise de la macro '{_currentMacro?.Name ?? "inconnue"}'", "MacroEngine");
                State = MacroEngineState.Running;
            }
        }

        public async Task ExecuteActionsAsync(IEnumerable<IInputAction> actions)
        {
            if (actions == null)
                return;

            var actionList = actions.ToList();
            if (actionList.Count == 0)
                return;

            foreach (var action in actionList)
            {
                if (_cancellationTokenSource?.Token.IsCancellationRequested == true)
                    break;

                // Attendre si en pause
                while (State == MacroEngineState.Paused)
                {
                    await Task.Delay(10);
                    if (_cancellationTokenSource?.Token.IsCancellationRequested == true)
                        return;
                }

                if (State == MacroEngineState.Stopping)
                    break;

                try
                {
                    // Exécuter l'action directement (keybd_event fonctionne sur n'importe quel thread)
                    // Les Thread.Sleep() dans Execute() bloquent, mais on force la mise à jour de l'UI après
                    action.Execute();
                    
                    // Notifier l'exécution de l'action immédiatement
                    // L'utilisation de BeginInvoke dans MainWindow permet à l'UI de se mettre à jour
                    var description = GetActionDescription(action);
                    ActionExecuted?.Invoke(this, new ActionExecutedEventArgs
                    {
                        Action = action,
                        ActionDescription = description
                    });
                    
                    // Petit délai pour permettre au système de traiter l'action et à l'UI de se mettre à jour
                    // Utiliser Task.Delay au lieu de Thread.Sleep pour ne pas bloquer le thread UI
                    await Task.Delay(10);
                    await Task.Yield();
                    
                    // Vérifier si l'action suivante est une DelayAction pour ne pas ajouter de délai supplémentaire
                    int currentIndex = actionList.IndexOf(action);
                    bool nextActionIsDelay = currentIndex < actionList.Count - 1 && actionList[currentIndex + 1] is DelayAction;
                    
                    // Délai supplémentaire entre les actions pour permettre au système de traiter les touches
                    // Important pour que les touches soient correctement reçues par les applications
                    // Ne pas ajouter de délai si l'action courante est une DelayAction ou si la suivante est une DelayAction
                    if (!(action is DelayAction) && !nextActionIsDelay)
                    {
                        if (action is KeyboardAction)
                        {
                            // Délai plus long entre les touches pour garantir qu'elles sont traitées
                            await Task.Delay(150);
                        }
                        else
                        {
                            // Pour les autres types d'actions (Mouse, etc.), petit délai
                            await Task.Delay(20);
                        }
                    }
                    // Pas de délai supplémentaire pour DelayAction ou avant une DelayAction car le délai est déjà dans Duration
                    
                    _timingEngine.WaitForNextInterval();
                }
                catch (Exception ex)
                {
                    _logger?.Error($"Erreur lors de l'exécution de l'action '{action.Name}'", ex, "MacroEngine");
                    ErrorOccurred?.Invoke(this, new MacroEngineErrorEventArgs
                    {
                        Exception = ex,
                        Message = $"Erreur lors de l'exécution de l'action {action.Name}: {ex.Message}",
                        Macro = _currentMacro
                    });
                }
            }
        }

        private async Task ExecuteMacroAsync(Macro macro, CancellationToken cancellationToken)
        {
            if (macro.Actions == null || macro.Actions.Count == 0)
                return;

            for (int repeat = 0; repeat < macro.RepeatCount; repeat++)
            {
                if (cancellationToken.IsCancellationRequested)
                    break;

                await ExecuteActionsAsync(macro.Actions);

                if (repeat < macro.RepeatCount - 1 && macro.DelayBetweenRepeats > 0)
                {
                    await Task.Delay(macro.DelayBetweenRepeats, cancellationToken);
                }
            }
        }

        private string GetActionDescription(IInputAction action)
        {
            if (action == null)
                return "Action inconnue";

            switch (action.Type)
            {
                case InputActionType.Keyboard:
                    if (action is KeyboardAction kbAction)
                    {
                        var keyName = GetKeyName(kbAction.VirtualKeyCode);
                        var modifiers = GetModifiersString(kbAction.Modifiers);
                        var actionType = kbAction.ActionType switch
                        {
                            KeyboardActionType.Down => "↓",
                            KeyboardActionType.Up => "↑",
                            KeyboardActionType.Press => "",
                            _ => ""
                        };
                        return $"{modifiers}{keyName}{actionType}";
                    }
                    return $"Clavier: {action.Name}";

                case InputActionType.Mouse:
                    if (action is MouseAction mouseAction)
                    {
                        var mouseType = mouseAction.ActionType switch
                        {
                            MouseActionType.LeftClick => "Clic gauche",
                            MouseActionType.RightClick => "Clic droit",
                            MouseActionType.MiddleClick => "Clic milieu",
                            MouseActionType.LeftDown => "Bouton gauche ↓",
                            MouseActionType.LeftUp => "Bouton gauche ↑",
                            MouseActionType.RightDown => "Bouton droit ↓",
                            MouseActionType.RightUp => "Bouton droit ↑",
                            MouseActionType.MiddleDown => "Bouton milieu ↓",
                            MouseActionType.MiddleUp => "Bouton milieu ↑",
                            MouseActionType.Move => "Déplacement",
                            MouseActionType.WheelUp => "Molette ↑",
                            MouseActionType.WheelDown => "Molette ↓",
                            MouseActionType.Wheel => $"Molette ({mouseAction.Delta})",
                            _ => "Action souris"
                        };
                        if (mouseAction.X >= 0 && mouseAction.Y >= 0)
                            return $"{mouseType} à ({mouseAction.X}, {mouseAction.Y})";
                        return mouseType;
                    }
                    return $"Souris: {action.Name}";

                case InputActionType.Delay:
                    if (action is DelayAction delayAction)
                    {
                        return $"Délai: {delayAction.Duration}ms";
                    }
                    return $"Délai: {action.Name}";

                default:
                    return action.Name;
            }
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            // Codes de touches courants
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

        private string GetModifiersString(ModifierKeys modifiers)
        {
            var parts = new List<string>();
            if ((modifiers & ModifierKeys.Control) != 0) parts.Add("Ctrl");
            if ((modifiers & ModifierKeys.Shift) != 0) parts.Add("Shift");
            if ((modifiers & ModifierKeys.Alt) != 0) parts.Add("Alt");
            if ((modifiers & ModifierKeys.Windows) != 0) parts.Add("Win");
            return parts.Count > 0 ? string.Join("+", parts) + "+" : "";
        }
    }
}


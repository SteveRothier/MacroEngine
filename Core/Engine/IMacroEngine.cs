using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MacroEngine.Core.Models;
using MacroEngine.Core.Inputs;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Interface du moteur d'exécution de macros
    /// </summary>
    public interface IMacroEngine
    {
        /// <summary>
        /// Événement déclenché lors d'un changement d'état
        /// </summary>
        event EventHandler<MacroEngineEventArgs> StateChanged;

        /// <summary>
        /// Événement déclenché lors d'une erreur
        /// </summary>
        event EventHandler<MacroEngineErrorEventArgs> ErrorOccurred;

        /// <summary>
        /// Événement déclenché lors de l'exécution d'une action
        /// </summary>
        event EventHandler<ActionExecutedEventArgs> ActionExecuted;

        /// <summary>
        /// Événement déclenché quand une condition Si échoue en mode debug (affiche quelle condition a échoué).
        /// </summary>
        event EventHandler<ConditionFailedEventArgs>? ConditionFailed;

        /// <summary>
        /// État actuel du moteur
        /// </summary>
        MacroEngineState State { get; }

        /// <summary>
        /// Macro actuellement en cours d'exécution
        /// </summary>
        Macro? CurrentMacro { get; }

        /// <summary>
        /// Configuration du moteur
        /// </summary>
        MacroEngineConfig Config { get; set; }

        /// <summary>
        /// Démarre l'exécution d'une macro
        /// </summary>
        Task<bool> StartMacroAsync(Macro macro);

        /// <summary>
        /// Arrête l'exécution de la macro en cours
        /// </summary>
        Task StopMacroAsync();

        /// <summary>
        /// Met en pause l'exécution
        /// </summary>
        Task PauseMacroAsync();

        /// <summary>
        /// Reprend l'exécution
        /// </summary>
        Task ResumeMacroAsync();

        /// <summary>
        /// Exécute une liste d'actions
        /// </summary>
        Task ExecuteActionsAsync(IEnumerable<IInputAction> actions);
    }

    /// <summary>
    /// États du moteur de macros
    /// </summary>
    public enum MacroEngineState
    {
        Idle,
        Running,
        Paused,
        Stopping
    }

    /// <summary>
    /// Arguments pour les événements du moteur
    /// </summary>
    public class MacroEngineEventArgs : EventArgs
    {
        public MacroEngineState PreviousState { get; set; }
        public MacroEngineState CurrentState { get; set; }
        public Macro? Macro { get; set; }
    }

    /// <summary>
    /// Arguments pour les erreurs du moteur
    /// </summary>
    public class MacroEngineErrorEventArgs : EventArgs
    {
        public Exception? Exception { get; set; }
        public string Message { get; set; } = string.Empty;
        public Macro? Macro { get; set; }
    }

    /// <summary>
    /// Arguments pour l'exécution d'une action
    /// </summary>
    public class ActionExecutedEventArgs : EventArgs
    {
        public IInputAction? Action { get; set; }
        public string ActionDescription { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.Now;
    }

    /// <summary>
    /// Arguments pour l'échec d'une condition (mode debug).
    /// </summary>
    public class ConditionFailedEventArgs : EventArgs
    {
        public string Message { get; set; } = string.Empty;
        /// <summary>
        /// Liste des conditions qui ont échoué (pour affichage détaillé).
        /// </summary>
        public List<string> FailedConditions { get; set; } = new List<string>();
    }
}


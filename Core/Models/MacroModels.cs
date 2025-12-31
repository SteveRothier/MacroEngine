using System;
using System.Collections.Generic;
using MacroEngine.Core.Inputs;

namespace MacroEngine.Core.Models
{
    /// <summary>
    /// Modèle représentant une macro complète
    /// </summary>
    public class Macro
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<IInputAction> Actions { get; set; } = new List<IInputAction>();
        public bool IsEnabled { get; set; } = true;
        
        /// <summary>
        /// Nombre de répétitions (1 = une seule exécution, 0 = infini jusqu'à interruption)
        /// </summary>
        public int RepeatCount { get; set; } = 1;
        
        /// <summary>
        /// Délai en millisecondes entre chaque répétition
        /// </summary>
        public int DelayBetweenRepeats { get; set; } = 0;
        
        /// <summary>
        /// Mode de répétition
        /// </summary>
        public RepeatMode RepeatMode { get; set; } = RepeatMode.Once;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime ModifiedAt { get; set; } = DateTime.Now;
        
        /// <summary>
        /// Code virtuel de la touche pour exécuter cette macro (0 = aucun raccourci)
        /// </summary>
        public int ShortcutKeyCode { get; set; } = 0;

        /// <summary>
        /// Liste des noms de processus pour lesquels cette macro est active
        /// Si vide, la macro est disponible pour toutes les applications
        /// </summary>
        public List<string> TargetApplications { get; set; } = new List<string>();

        /// <summary>
        /// Mode de déclenchement par application
        /// </summary>
        public AppTriggerMode AppTriggerMode { get; set; } = AppTriggerMode.Manual;

        /// <summary>
        /// Indique si la macro doit s'exécuter automatiquement quand l'application cible passe au premier plan
        /// </summary>
        public bool AutoExecuteOnFocus { get; set; } = false;
    }

    /// <summary>
    /// Mode de répétition de la macro
    /// </summary>
    public enum RepeatMode
    {
        /// <summary>
        /// Exécuter une seule fois
        /// </summary>
        Once,

        /// <summary>
        /// Répéter X fois (selon RepeatCount)
        /// </summary>
        RepeatCount,

        /// <summary>
        /// Répéter jusqu'à interruption (Échap ou bouton Stop)
        /// </summary>
        UntilStopped
    }

    /// <summary>
    /// Mode de déclenchement par application
    /// </summary>
    public enum AppTriggerMode
    {
        /// <summary>
        /// Exécution manuelle uniquement
        /// </summary>
        Manual,

        /// <summary>
        /// Raccourci actif seulement quand l'application cible est au premier plan
        /// </summary>
        ActiveOnlyInApp,

        /// <summary>
        /// Exécution automatique quand l'application passe au premier plan
        /// </summary>
        AutoOnFocus,

        /// <summary>
        /// Exécution automatique quand l'application est lancée
        /// </summary>
        AutoOnLaunch
    }

    /// <summary>
    /// Modèle représentant un profil de macros
    /// </summary>
    public class MacroProfile
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<string> MacroIds { get; set; } = new List<string>();
        public bool IsActive { get; set; } = false;
        public Dictionary<string, object> Settings { get; set; } = new Dictionary<string, object>();
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime ModifiedAt { get; set; } = DateTime.Now;
    }

    /// <summary>
    /// Configuration globale de l'application
    /// </summary>
    public class MacroEngineConfig
    {
        public int MaxCPS { get; set; } = 1000;
        public bool FullScreenMode { get; set; } = true;
        public bool EnableHooks { get; set; } = true;
        public int DefaultDelay { get; set; } = 10; // ms
        public string ActiveProfileId { get; set; } = string.Empty;
        public Dictionary<string, object> GlobalSettings { get; set; } = new Dictionary<string, object>();
        
        /// <summary>
        /// Code virtuel de la touche pour exécuter la macro sélectionnée (par défaut F10 = 0x79)
        /// </summary>
        public int ExecuteMacroKeyCode { get; set; } = 0x79; // F10 par défaut
        
        /// <summary>
        /// Code virtuel de la touche pour arrêter la macro en cours (par défaut F11 = 0x7A)
        /// </summary>
        public int StopMacroKeyCode { get; set; } = 0x7A; // F11 par défaut
    }

    /// <summary>
    /// Événement de macro
    /// </summary>
    public class MacroEvent
    {
        public string MacroId { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public MacroEventType Type { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public enum MacroEventType
    {
        Started,
        Stopped,
        Paused,
        Resumed,
        Error,
        Completed
    }
}


using System;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Interface de base pour toutes les actions d'entrée
    /// </summary>
    public interface IInputAction
    {
        /// <summary>
        /// Identifiant unique de l'action
        /// </summary>
        string Id { get; set; }

        /// <summary>
        /// Nom de l'action
        /// </summary>
        string Name { get; set; }

        /// <summary>
        /// Type d'action
        /// </summary>
        InputActionType Type { get; }

        /// <summary>
        /// Délai avant l'exécution (en millisecondes)
        /// </summary>
        int DelayBefore { get; set; }

        /// <summary>
        /// Délai après l'exécution (en millisecondes)
        /// </summary>
        int DelayAfter { get; set; }

        /// <summary>
        /// Exécute l'action
        /// </summary>
        void Execute();

        /// <summary>
        /// Clone l'action
        /// </summary>
        IInputAction Clone();
    }

    /// <summary>
    /// Types d'actions d'entrée
    /// </summary>
    public enum InputActionType
    {
        Keyboard,
        Mouse,
        Delay,
        Custom
    }
}


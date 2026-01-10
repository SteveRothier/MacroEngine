namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Interface pour toutes les actions d'entrée (clavier, souris, délai)
    /// </summary>
    public interface IInputAction
    {
        /// <summary>
        /// Identifiant unique de l'action
        /// </summary>
        string Id { get; set; }

        /// <summary>
        /// Nom de l'action (pour affichage)
        /// </summary>
        string Name { get; set; }

        /// <summary>
        /// Type d'action
        /// </summary>
        InputActionType Type { get; }

        /// <summary>
        /// Exécute l'action
        /// </summary>
        void Execute();

        /// <summary>
        /// Crée une copie de l'action
        /// </summary>
        IInputAction Clone();
    }

    /// <summary>
    /// Types d'actions disponibles
    /// </summary>
    public enum InputActionType
    {
        /// <summary>
        /// Action clavier
        /// </summary>
        Keyboard,

        /// <summary>
        /// Action souris
        /// </summary>
        Mouse,

        /// <summary>
        /// Délai/pause
        /// </summary>
        Delay,

        /// <summary>
        /// Répétition d'actions (groupe d'actions répétées)
        /// </summary>
        Repeat
    }
}

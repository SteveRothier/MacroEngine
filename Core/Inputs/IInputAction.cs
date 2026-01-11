namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Interface pour toutes les actions d'entrÃ©e (clavier, souris, dÃ©lai)
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
        /// ExÃ©cute l'action
        /// </summary>
        void Execute();

        /// <summary>
        /// CrÃ©e une copie de l'action
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
        /// DÃ©lai/pause
        /// </summary>
        Delay,

        /// <summary>
        /// RÃ©pÃ©tition d'actions (groupe d'actions rÃ©pÃ©tÃ©es)
        /// </summary>
        Repeat,

        /// <summary>
        /// Action conditionnelle (If/Then/Else)
        /// </summary>
        Condition
    }
}

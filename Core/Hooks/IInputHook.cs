using System;

namespace MacroEngine.Core.Hooks
{
    /// <summary>
    /// Interface pour les hooks d'entrée système
    /// </summary>
    public interface IInputHook : IDisposable
    {
        /// <summary>
        /// Événement déclenché lors d'une pression de touche
        /// </summary>
        event EventHandler<KeyboardHookEventArgs> KeyDown;

        /// <summary>
        /// Événement déclenché lors d'un relâchement de touche
        /// </summary>
        event EventHandler<KeyboardHookEventArgs> KeyUp;

        /// <summary>
        /// Événement déclenché lors d'un clic de souris
        /// </summary>
        event EventHandler<MouseHookEventArgs> MouseDown;

        /// <summary>
        /// Événement déclenché lors d'un relâchement de souris
        /// </summary>
        event EventHandler<MouseHookEventArgs> MouseUp;

        /// <summary>
        /// Événement déclenché lors d'un mouvement de souris
        /// </summary>
        event EventHandler<MouseHookEventArgs> MouseMove;

        /// <summary>
        /// Active le hook
        /// </summary>
        bool IsEnabled { get; set; }

        /// <summary>
        /// Installe le hook
        /// </summary>
        bool Install();

        /// <summary>
        /// Désinstalle le hook
        /// </summary>
        bool Uninstall();
    }

    /// <summary>
    /// Arguments pour les événements de clavier
    /// </summary>
    public class KeyboardHookEventArgs : EventArgs
    {
        public int VirtualKeyCode { get; set; }
        public int ScanCode { get; set; }
        public bool IsExtended { get; set; }
        public bool IsInjected { get; set; }
        public bool Handled { get; set; }
    }

    /// <summary>
    /// Arguments pour les événements de souris
    /// </summary>
    public class MouseHookEventArgs : EventArgs
    {
        public int X { get; set; }
        public int Y { get; set; }
        public MouseButton Button { get; set; }
        public int Delta { get; set; }
        public bool Handled { get; set; }
    }

    public enum MouseButton
    {
        Left,
        Right,
        Middle,
        XButton1,
        XButton2
    }
}


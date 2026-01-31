using System;
using System.Collections.Generic;
using System.Threading;
using MacroEngine.Core.Inputs;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Contexte d'exécution d'une macro (variables, touches maintenues, etc.), accessible pendant l'exécution.
    /// </summary>
    public class ExecutionContext
    {
        private static readonly AsyncLocal<ExecutionContext?> _current = new AsyncLocal<ExecutionContext?>();
        private readonly List<ushort> _heldKeys = new List<ushort>();

        public static ExecutionContext? Current
        {
            get => _current.Value;
            set => _current.Value = value;
        }

        public MacroVariableStore Variables { get; } = new MacroVariableStore();

        /// <summary>
        /// Active le mode debug pour les conditions (affiche quelle condition a échoué)
        /// </summary>
        public bool ConditionDebugEnabled { get; set; } = false;

        /// <summary>
        /// Liste des conditions qui ont échoué (pour le mode debug)
        /// </summary>
        public List<string> ConditionDebugFailures { get; } = new List<string>();

        /// <summary>
        /// Information sur la dernière condition qui a échoué (pour le mode debug)
        /// </summary>
        public string? LastFailedConditionInfo { get; set; }

        /// <summary>
        /// Enregistre une touche comme maintenue (pour relâche automatique à la fin de la macro).
        /// </summary>
        public void AddHeldKey(ushort virtualKeyCode)
        {
            lock (_heldKeys)
            {
                _heldKeys.Add(virtualKeyCode);
            }
        }

        /// <summary>
        /// Retire une touche de la liste des touches maintenues (après un Relâcher explicite).
        /// </summary>
        public void RemoveHeldKey(ushort virtualKeyCode)
        {
            lock (_heldKeys)
            {
                int idx = _heldKeys.IndexOf(virtualKeyCode);
                if (idx >= 0)
                    _heldKeys.RemoveAt(idx);
            }
        }

        /// <summary>
        /// Relâche toutes les touches encore maintenues (sécurité à la fin de la macro).
        /// </summary>
        public void ReleaseAllHeldKeys()
        {
            lock (_heldKeys)
            {
                for (int i = _heldKeys.Count - 1; i >= 0; i--)
                {
                    KeyboardAction.ReleaseKey(_heldKeys[i]);
                }
                _heldKeys.Clear();
            }
        }

        private readonly List<uint> _heldMouseButtons = new List<uint>();

        /// <summary>
        /// Enregistre un bouton de souris comme maintenu (pour relâche automatique à la fin de la macro).
        /// </summary>
        public void AddHeldMouseButton(uint upFlag)
        {
            lock (_heldMouseButtons)
            {
                _heldMouseButtons.Add(upFlag);
            }
        }

        /// <summary>
        /// Retire un bouton de souris de la liste des boutons maintenus (après un Relâcher explicite).
        /// </summary>
        public void RemoveHeldMouseButton(uint upFlag)
        {
            lock (_heldMouseButtons)
            {
                int idx = _heldMouseButtons.IndexOf(upFlag);
                if (idx >= 0)
                    _heldMouseButtons.RemoveAt(idx);
            }
        }

        /// <summary>
        /// Relâche tous les boutons de souris encore maintenus (sécurité à la fin de la macro).
        /// </summary>
        public void ReleaseAllHeldMouseButtons()
        {
            lock (_heldMouseButtons)
            {
                for (int i = _heldMouseButtons.Count - 1; i >= 0; i--)
                {
                    MouseAction.ReleaseMouseButton(_heldMouseButtons[i]);
                }
                _heldMouseButtons.Clear();
            }
        }
    }
}

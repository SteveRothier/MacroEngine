using System;
using System.Collections.Generic;
using System.Linq;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action conditionnelle If/Then/Else
    /// </summary>
    public class IfAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "If";
        public InputActionType Type => InputActionType.Condition;

        /// <summary>
        /// Condition (pour l'instant, simple boolÃ©en - Ã  dÃ©velopper plus tard)
        /// </summary>
        public bool Condition { get; set; } = true;

        /// <summary>
        /// Liste des actions Ã  exÃ©cuter si la condition est vraie (Then)
        /// </summary>
        public List<IInputAction> ThenActions { get; set; } = new List<IInputAction>();

        /// <summary>
        /// Liste des actions Ã  exÃ©cuter si la condition est fausse (Else)
        /// </summary>
        public List<IInputAction> ElseActions { get; set; } = new List<IInputAction>();

        public void Execute()
        {
            if (Condition)
            {
                // ExÃ©cuter les actions Then
                if (ThenActions != null)
                {
                    foreach (var action in ThenActions)
                    {
                        if (action != null)
                        {
                            action.Execute();
                        }
                    }
                }
            }
            else
            {
                // ExÃ©cuter les actions Else
                if (ElseActions != null)
                {
                    foreach (var action in ElseActions)
                    {
                        if (action != null)
                        {
                            action.Execute();
                        }
                    }
                }
            }
        }

        public IInputAction Clone()
        {
            return new IfAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Condition = this.Condition,
                ThenActions = this.ThenActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>(),
                ElseActions = this.ElseActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>()
            };
        }
    }
}

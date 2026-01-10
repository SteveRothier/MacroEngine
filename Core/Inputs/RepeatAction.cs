using System;
using System.Collections.Generic;
using System.Linq;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour répéter un groupe d'actions
    /// </summary>
    public class RepeatAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Repeat";
        public InputActionType Type => InputActionType.Repeat;

        /// <summary>
        /// Liste des actions à répéter
        /// </summary>
        public List<IInputAction> Actions { get; set; } = new List<IInputAction>();

        /// <summary>
        /// Mode de répétition
        /// </summary>
        public RepeatMode RepeatMode { get; set; } = RepeatMode.Once;

        /// <summary>
        /// Nombre de répétitions (utilisé si RepeatMode = RepeatCount)
        /// </summary>
        public int RepeatCount { get; set; } = 1;

        /// <summary>
        /// Délai en millisecondes entre chaque répétition
        /// </summary>
        public int DelayBetweenRepeats { get; set; } = 0;

        /// <summary>
        /// Code virtuel de la touche à surveiller (utilisé si RepeatMode = WhileKeyPressed)
        /// </summary>
        public ushort KeyCodeToMonitor { get; set; } = 0;

        /// <summary>
        /// Type de clic à surveiller (utilisé si RepeatMode = WhileClickPressed)
        /// 0 = Clic gauche, 1 = Clic droit, 2 = Clic milieu
        /// </summary>
        public int ClickTypeToMonitor { get; set; } = 0;

        public void Execute()
        {
            if (Actions == null || Actions.Count == 0)
                return;

            int iterations = RepeatCount == 0 ? int.MaxValue : RepeatCount;
            
            for (int i = 0; i < iterations; i++)
            {
                // Exécuter toutes les actions dans le groupe
                foreach (var action in Actions)
                {
                    if (action != null)
                    {
                        action.Execute();
                    }
                }

                // Délai entre les répétitions (sauf après la dernière)
                if (i < iterations - 1 && DelayBetweenRepeats > 0)
                {
                    System.Threading.Thread.Sleep(DelayBetweenRepeats);
                }
            }
        }

        public IInputAction Clone()
        {
            return new RepeatAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                RepeatMode = this.RepeatMode,
                RepeatCount = this.RepeatCount,
                DelayBetweenRepeats = this.DelayBetweenRepeats,
                KeyCodeToMonitor = this.KeyCodeToMonitor,
                ClickTypeToMonitor = this.ClickTypeToMonitor,
                Actions = this.Actions.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList()
            };
        }
    }
}

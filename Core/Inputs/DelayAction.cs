using System;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour introduire un délai dans une macro
    /// </summary>
    public class DelayAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Delay";
        public InputActionType Type => InputActionType.Delay;

        /// <summary>
        /// Durée du délai en millisecondes
        /// </summary>
        public int Duration { get; set; } = 100;

        public void Execute()
        {
            if (Duration > 0)
                System.Threading.Thread.Sleep(Duration);
        }

        public IInputAction Clone()
        {
            return new DelayAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Duration = this.Duration
            };
        }
    }
}


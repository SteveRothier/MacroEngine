using System;
using System.Threading;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour introduire un délai/pause dans une macro
    /// </summary>
    public class DelayAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Delay";
        public InputActionType Type => InputActionType.Delay;

        /// <summary>
        /// Durée du délai en millisecondes (stockage interne)
        /// </summary>
        public int Duration { get; set; } = 100;

        /// <summary>
        /// Unité de temps pour l'affichage et la saisie
        /// </summary>
        public TimeUnit Unit { get; set; } = TimeUnit.Milliseconds;

        /// <summary>
        /// Obtient la durée dans l'unité spécifiée
        /// </summary>
        public double GetDurationInUnit(TimeUnit unit)
        {
            return unit switch
            {
                TimeUnit.Milliseconds => Duration,
                TimeUnit.Seconds => Duration / 1000.0,
                TimeUnit.Minutes => Duration / 60000.0,
                _ => Duration
            };
        }

        /// <summary>
        /// Définit la durée depuis une valeur dans l'unité spécifiée
        /// </summary>
        public void SetDurationFromUnit(double value, TimeUnit unit)
        {
            Duration = unit switch
            {
                TimeUnit.Milliseconds => (int)Math.Round(value),
                TimeUnit.Seconds => (int)Math.Round(value * 1000),
                TimeUnit.Minutes => (int)Math.Round(value * 60000),
                _ => (int)Math.Round(value)
            };
        }

        public void Execute()
        {
            if (Duration > 0)
            {
                Thread.Sleep(Duration);
            }
        }

        public IInputAction Clone()
        {
            return new DelayAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Duration = this.Duration,
                Unit = this.Unit
            };
        }
    }

    /// <summary>
    /// Unités de temps pour les délais
    /// </summary>
    public enum TimeUnit
    {
        Milliseconds,  // Millisecondes
        Seconds,        // Secondes
        Minutes         // Minutes
    }
}

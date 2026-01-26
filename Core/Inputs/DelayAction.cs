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
        /// Active le mode délai aléatoire entre MinDuration et MaxDuration
        /// </summary>
        public bool IsRandom { get; set; } = false;

        /// <summary>
        /// Durée minimale en millisecondes (pour mode aléatoire)
        /// </summary>
        public int MinDuration { get; set; } = 100;

        /// <summary>
        /// Durée maximale en millisecondes (pour mode aléatoire)
        /// </summary>
        public int MaxDuration { get; set; } = 500;

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

        /// <summary>
        /// Obtient la durée minimale dans l'unité spécifiée
        /// </summary>
        public double GetMinDurationInUnit(TimeUnit unit)
        {
            return unit switch
            {
                TimeUnit.Milliseconds => MinDuration,
                TimeUnit.Seconds => MinDuration / 1000.0,
                TimeUnit.Minutes => MinDuration / 60000.0,
                _ => MinDuration
            };
        }

        /// <summary>
        /// Définit la durée minimale depuis une valeur dans l'unité spécifiée
        /// </summary>
        public void SetMinDurationFromUnit(double value, TimeUnit unit)
        {
            MinDuration = unit switch
            {
                TimeUnit.Milliseconds => (int)Math.Round(value),
                TimeUnit.Seconds => (int)Math.Round(value * 1000),
                TimeUnit.Minutes => (int)Math.Round(value * 60000),
                _ => (int)Math.Round(value)
            };
        }

        /// <summary>
        /// Obtient la durée maximale dans l'unité spécifiée
        /// </summary>
        public double GetMaxDurationInUnit(TimeUnit unit)
        {
            return unit switch
            {
                TimeUnit.Milliseconds => MaxDuration,
                TimeUnit.Seconds => MaxDuration / 1000.0,
                TimeUnit.Minutes => MaxDuration / 60000.0,
                _ => MaxDuration
            };
        }

        /// <summary>
        /// Définit la durée maximale depuis une valeur dans l'unité spécifiée
        /// </summary>
        public void SetMaxDurationFromUnit(double value, TimeUnit unit)
        {
            MaxDuration = unit switch
            {
                TimeUnit.Milliseconds => (int)Math.Round(value),
                TimeUnit.Seconds => (int)Math.Round(value * 1000),
                TimeUnit.Minutes => (int)Math.Round(value * 60000),
                _ => (int)Math.Round(value)
            };
        }

        public void Execute()
        {
            int delayToUse;
            
            if (IsRandom)
            {
                // Générer un délai aléatoire entre MinDuration et MaxDuration
                if (MinDuration >= MaxDuration)
                {
                    delayToUse = MinDuration;
                }
                else
                {
                    var random = new Random();
                    delayToUse = random.Next(MinDuration, MaxDuration + 1);
                }
            }
            else
            {
                delayToUse = Duration;
            }

            if (delayToUse > 0)
            {
                Thread.Sleep(delayToUse);
            }
        }

        public IInputAction Clone()
        {
            return new DelayAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Duration = this.Duration,
                Unit = this.Unit,
                IsRandom = this.IsRandom,
                MinDuration = this.MinDuration,
                MaxDuration = this.MaxDuration
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

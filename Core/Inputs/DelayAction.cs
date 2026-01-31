using System;
using System.Threading;
using Engine = MacroEngine.Core.Engine;

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
        /// Active le mode basé sur variable
        /// </summary>
        public bool UseVariableDelay { get; set; } = false;

        /// <summary>
        /// Nom de la variable à utiliser pour le délai
        /// </summary>
        public string VariableName { get; set; } = "";

        /// <summary>
        /// Multiplicateur à appliquer à la valeur de la variable (ex: 1.5 pour baseDelay * 1.5)
        /// </summary>
        public double VariableMultiplier { get; set; } = 1.0;

        /// <summary>
        /// Pourcentage de jitter (variation aléatoire) autour de la valeur (ex: 10 pour ±10%)
        /// </summary>
        public double JitterPercent { get; set; } = 0;

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
            double delayToUse;
            
            if (UseVariableDelay && !string.IsNullOrWhiteSpace(VariableName))
            {
                // Mode basé sur variable
                var context = Engine.ExecutionContext.Current;
                if (context?.Variables != null)
                {
                    // Récupérer la valeur numérique de la variable
                    double baseValue = context.Variables.GetNumber(VariableName);
                    
                    // Appliquer le multiplicateur
                    delayToUse = baseValue * VariableMultiplier;
                }
                else
                {
                    // Variable non trouvée, utiliser Duration par défaut
                    delayToUse = Duration;
                }
            }
            else if (IsRandom)
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

            // Appliquer le jitter si configuré
            if (JitterPercent > 0)
            {
                var random = new Random();
                // Générer une variation entre -JitterPercent% et +JitterPercent%
                double jitterFactor = 1.0 + (random.NextDouble() * 2 - 1) * (JitterPercent / 100.0);
                delayToUse *= jitterFactor;
            }

            int finalDelay = (int)Math.Round(delayToUse);
            if (finalDelay > 0)
            {
                Thread.Sleep(finalDelay);
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
                MaxDuration = this.MaxDuration,
                UseVariableDelay = this.UseVariableDelay,
                VariableName = this.VariableName,
                VariableMultiplier = this.VariableMultiplier,
                JitterPercent = this.JitterPercent
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

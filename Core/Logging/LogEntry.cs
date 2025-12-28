using System;

namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Représente une entrée de log
    /// </summary>
    public class LogEntry
    {
        /// <summary>
        /// Niveau de log
        /// </summary>
        public LogLevel Level { get; set; }

        /// <summary>
        /// Message de log
        /// </summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>
        /// Timestamp de l'entrée
        /// </summary>
        public DateTime Timestamp { get; set; }

        /// <summary>
        /// Exception associée (si applicable)
        /// </summary>
        public Exception? Exception { get; set; }

        /// <summary>
        /// Nom du composant/source du log
        /// </summary>
        public string Source { get; set; } = string.Empty;

        /// <summary>
        /// Formatte l'entrée de log pour affichage
        /// </summary>
        public override string ToString()
        {
            var timestamp = Timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var levelStr = Level.ToString().PadRight(7);
            var sourceStr = string.IsNullOrEmpty(Source) ? "" : $"[{Source}] ";
            var message = Message;

            if (Exception != null)
            {
                message += $"\nException: {Exception.GetType().Name}: {Exception.Message}";
                if (Exception.StackTrace != null)
                {
                    message += $"\nStack Trace:\n{Exception.StackTrace}";
                }
            }

            return $"{timestamp} [{levelStr}] {sourceStr}{message}";
        }
    }
}









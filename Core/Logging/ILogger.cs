using System;

namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Interface du système de logging
    /// </summary>
    public interface ILogger
    {
        /// <summary>
        /// Niveau de log minimum accepté
        /// </summary>
        LogLevel MinimumLevel { get; set; }

        /// <summary>
        /// Enregistre un message de niveau Debug
        /// </summary>
        void Debug(string message, string? source = null);

        /// <summary>
        /// Enregistre un message de niveau Info
        /// </summary>
        void Info(string message, string? source = null);

        /// <summary>
        /// Enregistre un message de niveau Warning
        /// </summary>
        void Warning(string message, string? source = null);

        /// <summary>
        /// Enregistre un message de niveau Error
        /// </summary>
        void Error(string message, string? source = null);

        /// <summary>
        /// Enregistre une exception avec un message
        /// </summary>
        void Error(string message, Exception exception, string? source = null);

        /// <summary>
        /// Ajoute un writer de logs
        /// </summary>
        void AddWriter(ILogWriter writer);

        /// <summary>
        /// Supprime un writer de logs
        /// </summary>
        void RemoveWriter(ILogWriter writer);

        /// <summary>
        /// Libère les ressources du logger
        /// </summary>
        void Dispose();
    }
}









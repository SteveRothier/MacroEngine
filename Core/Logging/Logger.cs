using System;
using System.Collections.Generic;
using System.Linq;

namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Implémentation principale du système de logging (thread-safe)
    /// </summary>
    public class Logger : ILogger
    {
        private readonly object _lockObject = new object();
        private readonly List<ILogWriter> _writers = new List<ILogWriter>();
        private LogLevel _minimumLevel = LogLevel.Info;

        public LogLevel MinimumLevel
        {
            get
            {
                lock (_lockObject)
                {
                    return _minimumLevel;
                }
            }
            set
            {
                lock (_lockObject)
                {
                    _minimumLevel = value;
                }
            }
        }

        public void Debug(string message, string? source = null)
        {
            Log(LogLevel.Debug, message, null, source);
        }

        public void Info(string message, string? source = null)
        {
            Log(LogLevel.Info, message, null, source);
        }

        public void Warning(string message, string? source = null)
        {
            Log(LogLevel.Warning, message, null, source);
        }

        public void Error(string message, string? source = null)
        {
            Log(LogLevel.Error, message, null, source);
        }

        public void Error(string message, Exception exception, string? source = null)
        {
            Log(LogLevel.Error, message, exception, source);
        }

        public void AddWriter(ILogWriter writer)
        {
            if (writer == null)
                throw new ArgumentNullException(nameof(writer));

            lock (_lockObject)
            {
                if (!_writers.Contains(writer))
                {
                    _writers.Add(writer);
                }
            }
        }

        public void RemoveWriter(ILogWriter writer)
        {
            if (writer == null)
                return;

            lock (_lockObject)
            {
                _writers.Remove(writer);
            }
        }

        private void Log(LogLevel level, string message, Exception? exception, string? source)
        {
            // Vérification rapide du niveau avant de créer l'entrée
            if (level < MinimumLevel)
                return;

            var entry = new LogEntry
            {
                Level = level,
                Message = message ?? string.Empty,
                Timestamp = DateTime.Now,
                Exception = exception,
                Source = source ?? string.Empty
            };

            // Obtenir une copie thread-safe de la liste des writers
            List<ILogWriter> writersCopy;
            lock (_lockObject)
            {
                writersCopy = _writers.Where(w => w.AcceptsLevel(level)).ToList();
            }

            // Écrire dans chaque writer (hors du lock pour éviter les deadlocks)
            foreach (var writer in writersCopy)
            {
                try
                {
                    writer.Write(entry);
                }
                catch
                {
                    // Ne pas lever d'exception si l'écriture échoue
                    // pour ne pas perturber l'application
                }
            }
        }

        public void Dispose()
        {
            lock (_lockObject)
            {
                foreach (var writer in _writers)
                {
                    try
                    {
                        writer.Dispose();
                    }
                    catch
                    {
                        // Ignorer les erreurs de dispose
                    }
                }
                _writers.Clear();
            }
        }
    }
}







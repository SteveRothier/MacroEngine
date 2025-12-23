using System;
using System.IO;
using System.Threading;

namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Writer de logs vers un fichier avec rotation quotidienne
    /// </summary>
    public class FileLogWriter : ILogWriter
    {
        private readonly object _lockObject = new object();
        private readonly string _logsDirectory;
        private readonly LogLevel _minimumLevel;
        private string? _currentLogFile;
        private DateTime _currentDate;

        public FileLogWriter(string logsDirectory = "Logs", LogLevel minimumLevel = LogLevel.Debug)
        {
            _logsDirectory = logsDirectory ?? "Logs";
            _minimumLevel = minimumLevel;
            _currentDate = DateTime.Now.Date;

            // Créer le dossier de logs s'il n'existe pas
            if (!Directory.Exists(_logsDirectory))
            {
                Directory.CreateDirectory(_logsDirectory);
            }
        }

        public bool AcceptsLevel(LogLevel level)
        {
            return level >= _minimumLevel;
        }

        public void Write(LogEntry entry)
        {
            if (entry == null || !AcceptsLevel(entry.Level))
                return;

            lock (_lockObject)
            {
                // Vérifier si on doit créer un nouveau fichier (rotation quotidienne)
                var today = DateTime.Now.Date;
                if (_currentLogFile == null || _currentDate != today)
                {
                    _currentDate = today;
                    _currentLogFile = Path.Combine(_logsDirectory, $"macros_{today:yyyy-MM-dd}.log");
                }

                try
                {
                    // Écrire dans le fichier (mode append)
                    File.AppendAllText(_currentLogFile, entry.ToString() + Environment.NewLine);
                }
                catch
                {
                    // Ne pas lever d'exception pour ne pas perturber l'application
                    // Les erreurs d'écriture de log ne doivent pas faire planter l'app
                }
            }
        }

        public void Dispose()
        {
            // Pas de ressources à libérer pour FileLogWriter
        }
    }
}





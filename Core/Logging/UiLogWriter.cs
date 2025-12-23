using System;
using System.Collections.ObjectModel;
using System.Windows.Threading;

namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Writer de logs vers l'interface utilisateur WPF (thread-safe)
    /// </summary>
    public class UiLogWriter : ILogWriter
    {
        private readonly object _lockObject = new object();
        private readonly ObservableCollection<LogEntry> _logEntries;
        private readonly Dispatcher _dispatcher;
        private readonly LogLevel _minimumLevel;
        private readonly int _maxEntries;

        /// <summary>
        /// Collection observable des entrées de log (peut être bindée à l'UI)
        /// </summary>
        public ObservableCollection<LogEntry> LogEntries => _logEntries;

        public UiLogWriter(ObservableCollection<LogEntry> logEntries, Dispatcher dispatcher, 
            LogLevel minimumLevel = LogLevel.Info, int maxEntries = 1000)
        {
            _logEntries = logEntries ?? throw new ArgumentNullException(nameof(logEntries));
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
            _minimumLevel = minimumLevel;
            _maxEntries = maxEntries;
        }

        public bool AcceptsLevel(LogLevel level)
        {
            return level >= _minimumLevel;
        }

        public void Write(LogEntry entry)
        {
            if (entry == null || !AcceptsLevel(entry.Level))
                return;

            // Utiliser Dispatcher.BeginInvoke pour thread-safety avec WPF
            _dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
            {
                lock (_lockObject)
                {
                    _logEntries.Add(entry);

                    // Limiter le nombre d'entrées pour éviter les problèmes de mémoire
                    while (_logEntries.Count > _maxEntries)
                    {
                        _logEntries.RemoveAt(0);
                    }
                }
            }));
        }

        public void Dispose()
        {
            lock (_lockObject)
            {
                _logEntries.Clear();
            }
        }
    }
}





using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Timers;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MacroEngine.Core.Processes
{
    /// <summary>
    /// Service pour surveiller les processus et détecter l'application au premier plan
    /// </summary>
    public class ProcessMonitor : IDisposable
    {
        private Timer? _monitorTimer;
        private string _lastForegroundProcessName = string.Empty;
        private IntPtr _lastForegroundWindow = IntPtr.Zero;
        private bool _isMonitoring = false;

        /// <summary>
        /// Événement déclenché quand l'application au premier plan change
        /// </summary>
        public event EventHandler<ForegroundChangedEventArgs>? ForegroundChanged;

        /// <summary>
        /// Intervalle de vérification en millisecondes (par défaut 500ms)
        /// </summary>
        public int MonitorInterval { get; set; } = 500;

        /// <summary>
        /// Indique si la surveillance est active
        /// </summary>
        public bool IsMonitoring => _isMonitoring;

        /// <summary>
        /// Démarre la surveillance des applications au premier plan
        /// </summary>
        public void StartMonitoring()
        {
            if (_isMonitoring) return;

            _monitorTimer = new Timer(MonitorInterval);
            _monitorTimer.Elapsed += MonitorTimer_Elapsed;
            _monitorTimer.AutoReset = true;
            _monitorTimer.Start();
            _isMonitoring = true;
        }

        /// <summary>
        /// Arrête la surveillance
        /// </summary>
        public void StopMonitoring()
        {
            if (!_isMonitoring) return;

            _monitorTimer?.Stop();
            _monitorTimer?.Dispose();
            _monitorTimer = null;
            _isMonitoring = false;
        }

        private void MonitorTimer_Elapsed(object? sender, ElapsedEventArgs e)
        {
            try
            {
                var foregroundWindow = GetForegroundWindow();
                if (foregroundWindow != _lastForegroundWindow)
                {
                    _lastForegroundWindow = foregroundWindow;
                    
                    GetWindowThreadProcessId(foregroundWindow, out uint processId);
                    if (processId > 0)
                    {
                        try
                        {
                            var process = Process.GetProcessById((int)processId);
                            var processName = process.ProcessName;
                            
                            if (processName != _lastForegroundProcessName)
                            {
                                var oldProcessName = _lastForegroundProcessName;
                                _lastForegroundProcessName = processName;

                                ForegroundChanged?.Invoke(this, new ForegroundChangedEventArgs
                                {
                                    PreviousProcessName = oldProcessName,
                                    CurrentProcessName = processName,
                                    ProcessId = (int)processId,
                                    WindowHandle = foregroundWindow,
                                    WindowTitle = GetWindowTitle(foregroundWindow)
                                });
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        /// <summary>
        /// Obtient la liste des processus en cours avec fenêtre visible
        /// </summary>
        public static List<ProcessInfo> GetRunningProcesses()
        {
            var processes = new List<ProcessInfo>();
            var processNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    // Ignorer les processus sans fenêtre principale
                    if (process.MainWindowHandle == IntPtr.Zero)
                        continue;

                    // Ignorer les doublons
                    if (processNames.Contains(process.ProcessName))
                        continue;

                    processNames.Add(process.ProcessName);

                    var info = new ProcessInfo
                    {
                        ProcessName = process.ProcessName,
                        ProcessId = process.Id,
                        WindowTitle = process.MainWindowTitle,
                        ExecutablePath = GetProcessPath(process)
                    };

                    processes.Add(info);
                }
                catch
                {
                    // Ignorer les processus inaccessibles
                }
            }

            return processes.OrderBy(p => p.ProcessName).ToList();
        }

        /// <summary>
        /// Obtient tous les processus en cours (même sans fenêtre)
        /// </summary>
        public static List<ProcessInfo> GetAllProcesses()
        {
            var processes = new List<ProcessInfo>();
            var processNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    // Ignorer les doublons
                    if (processNames.Contains(process.ProcessName))
                        continue;

                    processNames.Add(process.ProcessName);

                    var info = new ProcessInfo
                    {
                        ProcessName = process.ProcessName,
                        ProcessId = process.Id,
                        WindowTitle = process.MainWindowTitle,
                        ExecutablePath = GetProcessPath(process),
                        HasMainWindow = process.MainWindowHandle != IntPtr.Zero
                    };

                    processes.Add(info);
                }
                catch
                {
                    // Ignorer les processus inaccessibles
                }
            }

            return processes.OrderBy(p => p.ProcessName).ToList();
        }

        /// <summary>
        /// Obtient le nom du processus actuellement au premier plan
        /// </summary>
        public static string? GetForegroundProcessName()
        {
            try
            {
                var foregroundWindow = GetForegroundWindow();
                GetWindowThreadProcessId(foregroundWindow, out uint processId);
                
                if (processId > 0)
                {
                    var process = Process.GetProcessById((int)processId);
                    return process.ProcessName;
                }
            }
            catch { }

            return null;
        }

        /// <summary>
        /// Vérifie si un processus spécifique est actuellement au premier plan
        /// </summary>
        public static bool IsProcessInForeground(string processName)
        {
            var foregroundProcessName = GetForegroundProcessName();
            return string.Equals(foregroundProcessName, processName, StringComparison.OrdinalIgnoreCase);
        }

        private static readonly ConcurrentDictionary<string, ImageSource?> _iconCache =
            new ConcurrentDictionary<string, ImageSource?>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Tente de récupérer une icône déjà en cache (sans déclencher de chargement).
        /// </summary>
        public static bool TryGetCachedIcon(string processName, out ImageSource? icon)
        {
            icon = null;
            if (string.IsNullOrEmpty(processName))
                return false;
            return _iconCache.TryGetValue(processName, out icon);
        }

        /// <summary>
        /// Charge l'icône d'une application par son nom de processus (pour lazy-load).
        /// Les icônes sont mises en cache pour éviter de recharger à chaque affichage.
        /// À appeler depuis un thread de fond.
        /// </summary>
        public static ImageSource? GetIconForProcessName(string processName)
        {
            if (string.IsNullOrEmpty(processName))
                return null;
            return _iconCache.GetOrAdd(processName, LoadIconForProcessNameInternal);
        }

        private static ImageSource? LoadIconForProcessNameInternal(string processName)
        {
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    if (!string.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase))
                        continue;
                    var path = GetProcessPath(process);
                    if (string.IsNullOrEmpty(path) || !File.Exists(path))
                        continue;
                    try
                    {
                        using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(path))
                        {
                            if (icon == null)
                                return null;
                            using (var clone = (System.Drawing.Icon)icon.Clone())
                            {
                                var bitmap = Imaging.CreateBitmapSourceFromHIcon(
                                    clone.Handle,
                                    Int32Rect.Empty,
                                    BitmapSizeOptions.FromWidthAndHeight(16, 16));
                                bitmap.Freeze();
                                return bitmap;
                            }
                        }
                    }
                    catch
                    {
                        return null;
                    }
                }
                catch { }
                finally
                {
                    process.Dispose();
                }
            }
            return null;
        }

        private static string GetProcessPath(Process process)
        {
            try
            {
                return process.MainModule?.FileName ?? string.Empty;
            }
            catch
            {
                // Accès refusé pour certains processus système
                return string.Empty;
            }
        }

        private static string GetWindowTitle(IntPtr hWnd)
        {
            const int maxLength = 256;
            var sb = new StringBuilder(maxLength);
            GetWindowText(hWnd, sb, maxLength);
            return sb.ToString();
        }

        public void Dispose()
        {
            StopMonitoring();
        }

        // WinAPI imports
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    }

    /// <summary>
    /// Informations sur un processus
    /// </summary>
    public class ProcessInfo
    {
        private ImageSource? _icon;
        private bool _iconLoaded = false;

        public string ProcessName { get; set; } = string.Empty;
        public int ProcessId { get; set; }
        public string WindowTitle { get; set; } = string.Empty;
        public string ExecutablePath { get; set; } = string.Empty;
        public bool HasMainWindow { get; set; } = false;

        /// <summary>
        /// Icône de l'application
        /// </summary>
        public ImageSource? Icon
        {
            get
            {
                if (!_iconLoaded)
                {
                    _iconLoaded = true;
                    _icon = LoadIcon();
                }
                return _icon;
            }
        }

        /// <summary>
        /// Nom affiché (nom du processus + titre si disponible)
        /// </summary>
        public string DisplayName
        {
            get
            {
                if (!string.IsNullOrEmpty(WindowTitle))
                    return $"{ProcessName} - {WindowTitle}";
                return ProcessName;
            }
        }

        private ImageSource? LoadIcon()
        {
            string path = ExecutablePath;
            if (string.IsNullOrEmpty(path))
            {
                try
                {
                    using (var process = Process.GetProcessById(ProcessId))
                    {
                        path = process.MainModule?.FileName ?? string.Empty;
                    }
                }
                catch { }
            }
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return null;

            try
            {
                using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(path))
                {
                    if (icon == null)
                        return null;
                    // Clone pour éviter que le handle soit libéré avant la copie par WPF
                    using (var clone = (System.Drawing.Icon)icon.Clone())
                    {
                        var bitmap = Imaging.CreateBitmapSourceFromHIcon(
                            clone.Handle,
                            Int32Rect.Empty,
                            BitmapSizeOptions.FromWidthAndHeight(16, 16));
                        bitmap.Freeze();
                        return bitmap;
                    }
                }
            }
            catch
            {
                // Ignorer les erreurs d'extraction d'icône
            }
            return null;
        }

        public override string ToString() => DisplayName;
    }

    /// <summary>
    /// Arguments pour l'événement de changement d'application au premier plan
    /// </summary>
    public class ForegroundChangedEventArgs : EventArgs
    {
        public string PreviousProcessName { get; set; } = string.Empty;
        public string CurrentProcessName { get; set; } = string.Empty;
        public int ProcessId { get; set; }
        public IntPtr WindowHandle { get; set; }
        public string WindowTitle { get; set; } = string.Empty;
    }
}


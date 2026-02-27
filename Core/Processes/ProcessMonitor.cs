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
                        ExecutablePath = GetProcessPath(process),
                        MainWindowHandle = process.MainWindowHandle
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
                        HasMainWindow = process.MainWindowHandle != IntPtr.Zero,
                        MainWindowHandle = process.MainWindowHandle
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

        private static string GetIconCacheFolder()
        {
            var folder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MacroEngine", "IconCache");
            try
            {
                if (!Directory.Exists(folder))
                    Directory.CreateDirectory(folder);
            }
            catch { }
            return folder;
        }

        private static string GetSafeCacheFileName(string processName)
        {
            if (string.IsNullOrEmpty(processName)) return "_";
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder(processName.Length);
            foreach (var c in processName)
                sb.Append(Array.IndexOf(invalid, c) >= 0 ? '_' : c);
            if (sb.Length == 0) return "_";
            return sb.ToString() + ".png";
        }

        private static bool TryLoadIconFromDiskCache(string processName, out ImageSource? icon)
        {
            icon = null;
            if (string.IsNullOrEmpty(processName)) return false;
            try
            {
                var path = Path.Combine(GetIconCacheFolder(), GetSafeCacheFileName(processName));
                if (!File.Exists(path)) return false;
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.UriSource = new Uri(path, UriKind.Absolute);
                bitmap.EndInit();
                bitmap.Freeze();
                icon = bitmap;
                return true;
            }
            catch { }
            return false;
        }

        private static void SaveIconToDiskCache(string processName, ImageSource? icon)
        {
            if (string.IsNullOrEmpty(processName) || icon == null) return;
            if (icon is not BitmapSource bitmap) return;
            try
            {
                var folder = GetIconCacheFolder();
                var path = Path.Combine(folder, GetSafeCacheFileName(processName));
                using (var stream = File.Create(path))
                {
                    var encoder = new PngBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(bitmap));
                    encoder.Save(stream);
                }
            }
            catch { }
        }

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
        /// Les icônes sont mises en cache (mémoire + disque) pour réaffichage même après redémarrage.
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
            // 1) Essayer le cache disque (icône sauvegardée lors d'un affichage précédent)
            if (TryLoadIconFromDiskCache(processName, out var diskIcon) && diskIcon != null)
                return diskIcon;

            // 2) Charger depuis un processus en cours (exe ou fenêtre)
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    if (!string.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase))
                        continue;
                    ImageSource? result = null;
                    // 2a) Icône de l'exécutable
                    var path = GetProcessPath(process);
                    if (!string.IsNullOrEmpty(path) && File.Exists(path))
                    {
                        try
                        {
                            using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(path))
                            {
                                if (icon != null)
                                {
                                    using (var clone = (System.Drawing.Icon)icon.Clone())
                                    {
                                        var bitmap = Imaging.CreateBitmapSourceFromHIcon(
                                            clone.Handle,
                                            Int32Rect.Empty,
                                            BitmapSizeOptions.FromWidthAndHeight(16, 16));
                                        bitmap.Freeze();
                                        result = bitmap;
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                    // 2b) Sinon icône de la fenêtre
                    if (result == null && process.MainWindowHandle != IntPtr.Zero)
                        result = GetIconFromWindow(process.MainWindowHandle);

                    if (result != null)
                    {
                        SaveIconToDiskCache(processName, result);
                        return result;
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

        /// <summary>
        /// Récupère l'icône associée à une fenêtre (WM_GETICON puis GetClassLongPtr en secours).
        /// Utilisé par ProcessInfo et par LoadIconForProcessNameInternal.
        /// </summary>
        public static ImageSource? GetIconFromWindow(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero) return null;
            try
            {
                IntPtr hIcon = SendMessage(hWnd, WM_GETICON, (IntPtr)ICON_SMALL, IntPtr.Zero);
                if (hIcon == IntPtr.Zero)
                    hIcon = SendMessage(hWnd, WM_GETICON, (IntPtr)ICON_BIG, IntPtr.Zero);
                if (hIcon == IntPtr.Zero)
                    hIcon = GetClassLongPtr(hWnd, GCLP_HICONSM);
                if (hIcon == IntPtr.Zero)
                    hIcon = GetClassLongPtr(hWnd, GCLP_HICON);
                if (hIcon == IntPtr.Zero)
                    return null;
                // Cloner l'icône pour obtenir une copie exploitable (évite problèmes d'affichage avec le handle fenêtre)
                using (var icon = System.Drawing.Icon.FromHandle(hIcon))
                {
                    if (icon == null || icon.Width <= 0 || icon.Height <= 0)
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

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr GetClassLongPtr(IntPtr hWnd, int nIndex);

        private const uint WM_GETICON = 0x7F;
        private const int ICON_SMALL = 0;
        private const int ICON_BIG = 1;
        private const int GCLP_HICON = -14;
        private const int GCLP_HICONSM = -34;
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
        /// <summary>Handle de la fenêtre principale (capturé à la création pour l'icône fenêtre).</summary>
        public IntPtr MainWindowHandle { get; set; } = IntPtr.Zero;

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
            // 1) Essayer l'icône de l'exécutable
            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                try
                {
                    using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(path))
                    {
                        if (icon != null)
                        {
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
                }
                catch { }
            }
            // 2) Si pas d'icône processus, essayer l'icône de la fenêtre (handle capturé à la création)
            if (MainWindowHandle != IntPtr.Zero)
            {
                var windowIcon = ProcessMonitor.GetIconFromWindow(MainWindowHandle);
                if (windowIcon != null)
                    return windowIcon;
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


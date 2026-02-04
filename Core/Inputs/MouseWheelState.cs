using System;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// État global de la molette (mis à jour par le MouseHook) pour les conditions "Molette haut/bas".
    /// </summary>
    public static class MouseWheelState
    {
        private static readonly object _lock = new object();
        private static int _lastDirection; // 1 = haut, -1 = bas, 0 = inconnu
        private static DateTime _lastTimeUtc;

        /// <summary>Dernière direction : 1 = molette haut, -1 = molette bas, 0 = aucune.</summary>
        public static int LastDirection
        {
            get { lock (_lock) return _lastDirection; }
            set { lock (_lock) { _lastDirection = value; _lastTimeUtc = DateTime.UtcNow; } }
        }

        /// <summary>Heure du dernier événement molette.</summary>
        public static DateTime LastTimeUtc
        {
            get { lock (_lock) return _lastTimeUtc; }
        }

        /// <summary>Fenêtre de validité en ms (au-delà, la condition molette est fausse).</summary>
        public const int ValidityWindowMs = 300;

        /// <summary>True si la dernière action molette était "haut" et récente.</summary>
        public static bool WasWheelUp()
        {
            lock (_lock)
            {
                if (_lastDirection != 1) return false;
                return (DateTime.UtcNow - _lastTimeUtc).TotalMilliseconds <= ValidityWindowMs;
            }
        }

        /// <summary>True si la dernière action molette était "bas" et récente.</summary>
        public static bool WasWheelDown()
        {
            lock (_lock)
            {
                if (_lastDirection != -1) return false;
                return (DateTime.UtcNow - _lastTimeUtc).TotalMilliseconds <= ValidityWindowMs;
            }
        }
    }
}

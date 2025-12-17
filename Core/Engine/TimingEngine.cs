using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Moteur de timing haute précision pour les macros haute fréquence
    /// </summary>
    public class TimingEngine
    {
        private readonly Stopwatch _stopwatch;
        private readonly int _targetCPS;
        private readonly double _targetIntervalMs;
        private long _lastExecutionTicks = 0;

        public TimingEngine(int targetCPS = 1000)
        {
            _targetCPS = targetCPS;
            _targetIntervalMs = 1000.0 / targetCPS;
            _stopwatch = Stopwatch.StartNew();
        }

        /// <summary>
        /// Attend jusqu'au prochain intervalle de timing
        /// </summary>
        public void WaitForNextInterval()
        {
            if (_targetCPS <= 0)
                return;

            long currentTicks = _stopwatch.ElapsedTicks;
            long targetTicks = (long)(_lastExecutionTicks + (_targetIntervalMs * Stopwatch.Frequency / 1000.0));

            if (currentTicks < targetTicks)
            {
                long waitTicks = targetTicks - currentTicks;
                double waitMs = (waitTicks * 1000.0) / Stopwatch.Frequency;

                if (waitMs > 1.0)
                {
                    Thread.Sleep((int)(waitMs - 1));
                }

                // Spin wait pour la précision finale
                while (_stopwatch.ElapsedTicks < targetTicks)
                {
                    Thread.SpinWait(1);
                }
            }

            _lastExecutionTicks = _stopwatch.ElapsedTicks;
        }

        /// <summary>
        /// Réinitialise le timing
        /// </summary>
        public void Reset()
        {
            _lastExecutionTicks = 0;
            _stopwatch.Restart();
        }

        /// <summary>
        /// Obtient le CPS actuel
        /// </summary>
        public double GetCurrentCPS()
        {
            if (_stopwatch.ElapsedMilliseconds == 0)
                return 0;

            return 1000.0 / _targetIntervalMs;
        }
    }
}


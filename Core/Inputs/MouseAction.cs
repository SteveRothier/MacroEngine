using System;
using System.Runtime.InteropServices;
using System.Threading;
using Engine = MacroEngine.Core.Engine;
using MacroEngine.Core.Hooks;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour simuler un événement souris
    /// </summary>
    public class MouseAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Mouse Action";
        public InputActionType Type => InputActionType.Mouse;

        /// <summary>
        /// Type d'action souris
        /// </summary>
        public MouseActionType ActionType { get; set; } = MouseActionType.LeftClick;

        /// <summary>
        /// Position X (optionnel, -1 pour position actuelle)
        /// </summary>
        public int X { get; set; } = -1;

        /// <summary>
        /// Position Y (optionnel, -1 pour position actuelle)
        /// </summary>
        public int Y { get; set; } = -1;

        /// <summary>
        /// Delta pour la molette (si applicable)
        /// </summary>
        public int Delta { get; set; } = 0;

        /// <summary>
        /// Mode de déplacement relatif (true) ou absolu (false) - uniquement pour Move
        /// </summary>
        public bool IsRelativeMove { get; set; } = false;

        /// <summary>
        /// Vitesse du déplacement - uniquement pour Move
        /// </summary>
        public MoveSpeed MoveSpeed { get; set; } = MoveSpeed.Instant;

        /// <summary>
        /// Type d'easing pour le déplacement - uniquement pour Move
        /// </summary>
        public MoveEasing MoveEasing { get; set; } = MoveEasing.Linear;

        /// <summary>
        /// Utiliser une trajectoire courbe (Bézier) - uniquement pour Move
        /// </summary>
        public bool UseBezierPath { get; set; } = false;

        /// <summary>
        /// Point de contrôle X pour la courbe de Bézier - uniquement pour Move avec UseBezierPath
        /// </summary>
        public int ControlX { get; set; } = -1;

        /// <summary>
        /// Point de contrôle Y pour la courbe de Bézier - uniquement pour Move avec UseBezierPath
        /// </summary>
        public int ControlY { get; set; } = -1;

        /// <summary>
        /// Durée de maintien en ms pour "Maintenir" (0 = illimité, relâché à la fin de la macro ou par une action Relâcher).
        /// </summary>
        public int HoldDurationMs { get; set; }

        /// <summary>
        /// Durée du scroll continu en ms (pour WheelContinuous)
        /// </summary>
        public int ScrollDurationMs { get; set; }

        /// <summary>
        /// Intervalle entre chaque tick de scroll en ms (pour WheelContinuous, défaut 50ms)
        /// </summary>
        public int ScrollIntervalMs { get; set; } = 50;

        /// <summary>
        /// Activer le clic conditionnel (exécuter seulement si le curseur est dans la zone)
        /// </summary>
        public bool ConditionalZoneEnabled { get; set; }

        /// <summary>
        /// Zone conditionnelle - X minimum
        /// </summary>
        public int ConditionalZoneX1 { get; set; }

        /// <summary>
        /// Zone conditionnelle - Y minimum
        /// </summary>
        public int ConditionalZoneY1 { get; set; }

        /// <summary>
        /// Zone conditionnelle - X maximum
        /// </summary>
        public int ConditionalZoneX2 { get; set; }

        /// <summary>
        /// Zone conditionnelle - Y maximum
        /// </summary>
        public int ConditionalZoneY2 { get; set; }

        /// <summary>
        /// Relâche un bouton de souris (utilisé pour la relâche automatique à la fin de la macro).
        /// </summary>
        public static void ReleaseMouseButton(uint upFlags)
        {
            INPUT input = new INPUT
            {
                type = INPUT_MOUSE,
                mi = new MOUSEINPUT
                {
                    dx = 0,
                    dy = 0,
                    mouseData = 0,
                    dwFlags = upFlags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            };
            SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(10);
        }

        public void Execute()
        {
            // Vérifier la zone conditionnelle (pour les clics)
            if (ConditionalZoneEnabled && IsClickAction(ActionType))
            {
                GetCursorPos(out POINT cursorPos);
                if (!IsInConditionalZone(cursorPos.X, cursorPos.Y))
                    return; // Ne pas exécuter le clic si le curseur n'est pas dans la zone
            }

            // Exécuter l'action
            switch (ActionType)
            {
                case MouseActionType.Move:
                    // Gérer le déplacement (relatif ou absolu, avec vitesse)
                    if (IsRelativeMove)
                    {
                        // Déplacement relatif : obtenir la position actuelle et ajouter X, Y
                        GetCursorPos(out POINT currentPos);
                        int targetX = currentPos.X + X;
                        int targetY = currentPos.Y + Y;
                        int controlX = UseBezierPath && ControlX >= 0 ? (IsRelativeMove ? currentPos.X + ControlX : ControlX) : -1;
                        int controlY = UseBezierPath && ControlY >= 0 ? (IsRelativeMove ? currentPos.Y + ControlY : ControlY) : -1;
                        MoveCursorTo(currentPos.X, currentPos.Y, targetX, targetY, MoveSpeed, MoveEasing, UseBezierPath, controlX, controlY);
                    }
                    else
                    {
                        // Déplacement absolu
                        if (X >= 0 && Y >= 0)
                        {
                            GetCursorPos(out POINT startPos);
                            int controlX = UseBezierPath && ControlX >= 0 ? ControlX : -1;
                            int controlY = UseBezierPath && ControlY >= 0 ? ControlY : -1;
                            MoveCursorTo(startPos.X, startPos.Y, X, Y, MoveSpeed, MoveEasing, UseBezierPath, controlX, controlY);
                        }
                    }
                    break;
                case MouseActionType.LeftClick:
                case MouseActionType.RightClick:
                case MouseActionType.MiddleClick:
                case MouseActionType.DoubleLeftClick:
                case MouseActionType.DoubleRightClick:
                case MouseActionType.LeftDown:
                case MouseActionType.RightDown:
                case MouseActionType.MiddleDown:
                    // Pour les clics, déplacer d'abord si nécessaire (absolu uniquement)
                    if (X >= 0 && Y >= 0)
                    {
                        SetCursorPos(X, Y);
                    }
                    break;
                default:
                    // Pour les autres actions, déplacer si nécessaire (absolu uniquement)
                    if (X >= 0 && Y >= 0)
                    {
                        SetCursorPos(X, Y);
                    }
                    break;
            }

            // Exécuter l'action de clic/molette
            switch (ActionType)
            {
                case MouseActionType.LeftClick:
                    MouseEvent(MOUSEEVENTF_LEFTDOWN);
                    MouseEvent(MOUSEEVENTF_LEFTUP);
                    break;
                case MouseActionType.RightClick:
                    MouseEvent(MOUSEEVENTF_RIGHTDOWN);
                    MouseEvent(MOUSEEVENTF_RIGHTUP);
                    break;
                case MouseActionType.MiddleClick:
                    MouseEvent(MOUSEEVENTF_MIDDLEDOWN);
                    MouseEvent(MOUSEEVENTF_MIDDLEUP);
                    break;
                case MouseActionType.LeftDown:
                    MouseEvent(MOUSEEVENTF_LEFTDOWN);
                    if (HoldDurationMs > 0)
                    {
                        Thread.Sleep(HoldDurationMs);
                        MouseEvent(MOUSEEVENTF_LEFTUP);
                    }
                    else
                    {
                        Engine.ExecutionContext.Current?.AddHeldMouseButton(MOUSEEVENTF_LEFTUP);
                    }
                    break;
                case MouseActionType.LeftUp:
                    MouseEvent(MOUSEEVENTF_LEFTUP);
                    Engine.ExecutionContext.Current?.RemoveHeldMouseButton(MOUSEEVENTF_LEFTUP);
                    break;
                case MouseActionType.RightDown:
                    MouseEvent(MOUSEEVENTF_RIGHTDOWN);
                    if (HoldDurationMs > 0)
                    {
                        Thread.Sleep(HoldDurationMs);
                        MouseEvent(MOUSEEVENTF_RIGHTUP);
                    }
                    else
                    {
                        Engine.ExecutionContext.Current?.AddHeldMouseButton(MOUSEEVENTF_RIGHTUP);
                    }
                    break;
                case MouseActionType.RightUp:
                    MouseEvent(MOUSEEVENTF_RIGHTUP);
                    Engine.ExecutionContext.Current?.RemoveHeldMouseButton(MOUSEEVENTF_RIGHTUP);
                    break;
                case MouseActionType.MiddleDown:
                    MouseEvent(MOUSEEVENTF_MIDDLEDOWN);
                    if (HoldDurationMs > 0)
                    {
                        Thread.Sleep(HoldDurationMs);
                        MouseEvent(MOUSEEVENTF_MIDDLEUP);
                    }
                    else
                    {
                        Engine.ExecutionContext.Current?.AddHeldMouseButton(MOUSEEVENTF_MIDDLEUP);
                    }
                    break;
                case MouseActionType.MiddleUp:
                    MouseEvent(MOUSEEVENTF_MIDDLEUP);
                    Engine.ExecutionContext.Current?.RemoveHeldMouseButton(MOUSEEVENTF_MIDDLEUP);
                    break;
                case MouseActionType.Move:
                    // Déjà géré ci-dessus
                    break;
                case MouseActionType.WheelUp:
                    MouseEvent(MOUSEEVENTF_WHEEL, 120);
                    break;
                case MouseActionType.WheelDown:
                    MouseEvent(MOUSEEVENTF_WHEEL, -120);
                    break;
                case MouseActionType.Wheel:
                    MouseEvent(MOUSEEVENTF_WHEEL, Delta);
                    break;
                case MouseActionType.WheelContinuous:
                    ExecuteWheelContinuous();
                    break;
                case MouseActionType.DoubleLeftClick:
                    // Double-clic gauche : deux clics rapides
                    MouseEvent(MOUSEEVENTF_LEFTDOWN);
                    MouseEvent(MOUSEEVENTF_LEFTUP);
                    System.Threading.Thread.Sleep(50); // Délai entre les deux clics
                    MouseEvent(MOUSEEVENTF_LEFTDOWN);
                    MouseEvent(MOUSEEVENTF_LEFTUP);
                    break;
                case MouseActionType.DoubleRightClick:
                    // Double-clic droit : deux clics rapides
                    MouseEvent(MOUSEEVENTF_RIGHTDOWN);
                    MouseEvent(MOUSEEVENTF_RIGHTUP);
                    System.Threading.Thread.Sleep(50); // Délai entre les deux clics
                    MouseEvent(MOUSEEVENTF_RIGHTDOWN);
                    MouseEvent(MOUSEEVENTF_RIGHTUP);
                    break;
            }
        }

        private void MouseEvent(uint dwFlags, int dwData = 0)
        {
            INPUT input = new INPUT
            {
                type = INPUT_MOUSE,
                mi = new MOUSEINPUT
                {
                    dx = 0,
                    dy = 0,
                    mouseData = (uint)dwData,
                    dwFlags = dwFlags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            };

            SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        private bool IsClickAction(MouseActionType actionType)
        {
            return actionType == MouseActionType.LeftClick ||
                   actionType == MouseActionType.RightClick ||
                   actionType == MouseActionType.MiddleClick ||
                   actionType == MouseActionType.DoubleLeftClick ||
                   actionType == MouseActionType.DoubleRightClick ||
                   actionType == MouseActionType.LeftDown ||
                   actionType == MouseActionType.RightDown ||
                   actionType == MouseActionType.MiddleDown;
        }

        private bool IsInConditionalZone(int x, int y)
        {
            int minX = Math.Min(ConditionalZoneX1, ConditionalZoneX2);
            int maxX = Math.Max(ConditionalZoneX1, ConditionalZoneX2);
            int minY = Math.Min(ConditionalZoneY1, ConditionalZoneY2);
            int maxY = Math.Max(ConditionalZoneY1, ConditionalZoneY2);
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        }

        private void ExecuteWheelContinuous()
        {
            int duration = ScrollDurationMs > 0 ? ScrollDurationMs : 1000;
            int interval = ScrollIntervalMs > 0 ? ScrollIntervalMs : 50;
            int delta = Delta != 0 ? Delta : 120;

            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            while (stopwatch.ElapsedMilliseconds < duration)
            {
                MouseEvent(MOUSEEVENTF_WHEEL, delta);
                Thread.Sleep(interval);
            }
        }

        public IInputAction Clone()
        {
            return new MouseAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                ActionType = this.ActionType,
                X = this.X,
                Y = this.Y,
                Delta = this.Delta,
                IsRelativeMove = this.IsRelativeMove,
                MoveSpeed = this.MoveSpeed,
                MoveEasing = this.MoveEasing,
                UseBezierPath = this.UseBezierPath,
                ControlX = this.ControlX,
                ControlY = this.ControlY,
                HoldDurationMs = this.HoldDurationMs,
                ScrollDurationMs = this.ScrollDurationMs,
                ScrollIntervalMs = this.ScrollIntervalMs,
                ConditionalZoneEnabled = this.ConditionalZoneEnabled,
                ConditionalZoneX1 = this.ConditionalZoneX1,
                ConditionalZoneY1 = this.ConditionalZoneY1,
                ConditionalZoneX2 = this.ConditionalZoneX2,
                ConditionalZoneY2 = this.ConditionalZoneY2
            };
        }

        // Constantes WinAPI
        private const int INPUT_MOUSE = 0;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public int type;
            public MOUSEINPUT mi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        /// <summary>
        /// Déplace le curseur vers une position avec une vitesse, un easing et optionnellement une courbe de Bézier
        /// </summary>
        private void MoveCursorTo(int startX, int startY, int targetX, int targetY, MoveSpeed speed, MoveEasing easing, bool useBezier, int controlX, int controlY)
        {
            if (speed == MoveSpeed.Instant)
            {
                SetCursorPos(targetX, targetY);
                return;
            }

            int distance = (int)Math.Sqrt(Math.Pow(targetX - startX, 2) + Math.Pow(targetY - startY, 2));
            
            if (distance == 0)
                return;

            // Déterminer le nombre d'étapes et le délai selon la vitesse
            int steps;
            int delayMs;
            
            switch (speed)
            {
                case MoveSpeed.Fast:
                    steps = Math.Max(5, distance / 20); // 5-50 étapes selon la distance
                    delayMs = 1;
                    break;
                case MoveSpeed.Gradual:
                    steps = Math.Max(10, distance / 5); // 10-200+ étapes selon la distance
                    delayMs = 2;
                    break;
                default:
                    SetCursorPos(targetX, targetY);
                    return;
            }

            // Déplacement progressif avec easing et optionnellement Bézier
            for (int i = 0; i <= steps; i++)
            {
                double t = (double)i / steps; // Ratio linéaire de 0 à 1
                double easedT = ApplyEasing(t, easing); // Appliquer l'easing
                
                int currentX, currentY;
                
                if (useBezier && controlX >= 0 && controlY >= 0)
                {
                    // Courbe de Bézier quadratique : B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
                    // P₀ = point de départ, P₁ = point de contrôle, P₂ = point d'arrivée
                    double oneMinusT = 1 - easedT;
                    double tSquared = easedT * easedT;
                    double oneMinusTSquared = oneMinusT * oneMinusT;
                    
                    currentX = (int)(oneMinusTSquared * startX + 2 * oneMinusT * easedT * controlX + tSquared * targetX);
                    currentY = (int)(oneMinusTSquared * startY + 2 * oneMinusT * easedT * controlY + tSquared * targetY);
                }
                else
                {
                    // Déplacement linéaire
                    currentX = startX + (int)((targetX - startX) * easedT);
                    currentY = startY + (int)((targetY - startY) * easedT);
                }
                
                SetCursorPos(currentX, currentY);
                
                if (i < steps && delayMs > 0)
                {
                    System.Threading.Thread.Sleep(delayMs);
                }
            }
        }

        /// <summary>
        /// Applique une fonction d'easing à un ratio de 0 à 1
        /// </summary>
        private double ApplyEasing(double t, MoveEasing easing)
        {
            // Clamp t entre 0 et 1
            t = Math.Max(0, Math.Min(1, t));
            
            return easing switch
            {
                MoveEasing.Linear => t, // Pas d'easing, linéaire
                MoveEasing.EaseIn => t * t, // Accélération (démarrage lent, fin rapide)
                MoveEasing.EaseOut => 1 - (1 - t) * (1 - t), // Décélération (démarrage rapide, fin lente)
                MoveEasing.EaseInOut => t < 0.5 
                    ? 2 * t * t // Première moitié : accélération
                    : 1 - Math.Pow(-2 * t + 2, 2) / 2, // Seconde moitié : décélération
                _ => t
            };
        }
    }

    public enum MouseActionType
    {
        LeftClick,
        RightClick,
        MiddleClick,
        LeftDown,
        LeftUp,
        RightDown,
        RightUp,
        MiddleDown,
        MiddleUp,
        Move,
        WheelUp,
        WheelDown,
        Wheel,
        DoubleLeftClick,
        DoubleRightClick,
        WheelContinuous
    }

    /// <summary>
    /// Vitesse de déplacement de la souris
    /// </summary>
    public enum MoveSpeed
    {
        Instant,    // Déplacement instantané
        Fast,       // Déplacement rapide (quelques ms)
        Gradual     // Déplacement graduel (plus lent, plus naturel)
    }

    /// <summary>
    /// Type d'easing (courbe d'accélération/décélération) pour le déplacement
    /// </summary>
    public enum MoveEasing
    {
        Linear,      // Linéaire (pas d'easing)
        EaseIn,      // Accélération (démarrage lent, fin rapide)
        EaseOut,     // Décélération (démarrage rapide, fin lente)
        EaseInOut    // Ease-in-out (démarrage et fin lents, milieu rapide)
    }
}


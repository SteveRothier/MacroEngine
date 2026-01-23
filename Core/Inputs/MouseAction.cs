using System;
using System.Runtime.InteropServices;
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

        public void Execute()
        {
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
                        MoveCursorTo(targetX, targetY, MoveSpeed);
                    }
                    else
                    {
                        // Déplacement absolu
                        if (X >= 0 && Y >= 0)
                        {
                            MoveCursorTo(X, Y, MoveSpeed);
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
                    break;
                case MouseActionType.LeftUp:
                    MouseEvent(MOUSEEVENTF_LEFTUP);
                    break;
                case MouseActionType.RightDown:
                    MouseEvent(MOUSEEVENTF_RIGHTDOWN);
                    break;
                case MouseActionType.RightUp:
                    MouseEvent(MOUSEEVENTF_RIGHTUP);
                    break;
                case MouseActionType.MiddleDown:
                    MouseEvent(MOUSEEVENTF_MIDDLEDOWN);
                    break;
                case MouseActionType.MiddleUp:
                    MouseEvent(MOUSEEVENTF_MIDDLEUP);
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
                MoveSpeed = this.MoveSpeed
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
        /// Déplace le curseur vers une position avec une vitesse donnée
        /// </summary>
        private void MoveCursorTo(int targetX, int targetY, MoveSpeed speed)
        {
            if (speed == MoveSpeed.Instant)
            {
                SetCursorPos(targetX, targetY);
                return;
            }

            GetCursorPos(out POINT startPos);
            int startX = startPos.X;
            int startY = startPos.Y;

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

            // Déplacement progressif
            for (int i = 0; i <= steps; i++)
            {
                double ratio = (double)i / steps;
                int currentX = startX + (int)((targetX - startX) * ratio);
                int currentY = startY + (int)((targetY - startY) * ratio);
                
                SetCursorPos(currentX, currentY);
                
                if (i < steps && delayMs > 0)
                {
                    System.Threading.Thread.Sleep(delayMs);
                }
            }
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
        DoubleRightClick
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
}


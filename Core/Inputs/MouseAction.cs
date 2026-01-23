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

        public void Execute()
        {
            // Déplacer la souris si nécessaire
            if (X >= 0 && Y >= 0)
            {
                SetCursorPos(X, Y);
            }

            // Exécuter l'action
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
                    // Déjà géré par SetCursorPos
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
                Delta = this.Delta
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
}


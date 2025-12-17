using System;
using System.Runtime.InteropServices;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour simuler une pression de touche clavier
    /// </summary>
    public class KeyboardAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Keyboard Action";
        public InputActionType Type => InputActionType.Keyboard;
        public int DelayBefore { get; set; } = 0;
        public int DelayAfter { get; set; } = 0;

        /// <summary>
        /// Code de touche virtuelle
        /// </summary>
        public ushort VirtualKeyCode { get; set; }

        /// <summary>
        /// Type d'action clavier (Down, Up, Press)
        /// </summary>
        public KeyboardActionType ActionType { get; set; } = KeyboardActionType.Press;

        /// <summary>
        /// Touches de modification (Ctrl, Alt, Shift, Win)
        /// </summary>
        public ModifierKeys Modifiers { get; set; } = ModifierKeys.None;

        public void Execute()
        {
            if (DelayBefore > 0)
                System.Threading.Thread.Sleep(DelayBefore);

            if (Modifiers != ModifierKeys.None)
            {
                SendModifierKeys(Modifiers, true);
            }

            if (ActionType == KeyboardActionType.Down || ActionType == KeyboardActionType.Press)
            {
                SendKeyDown(VirtualKeyCode);
            }

            if (ActionType == KeyboardActionType.Up || ActionType == KeyboardActionType.Press)
            {
                SendKeyUp(VirtualKeyCode);
            }

            if (Modifiers != ModifierKeys.None)
            {
                SendModifierKeys(Modifiers, false);
            }

            if (DelayAfter > 0)
                System.Threading.Thread.Sleep(DelayAfter);
        }

        private void SendModifierKeys(ModifierKeys modifiers, bool down)
        {
            if ((modifiers & ModifierKeys.Control) != 0)
                SendKey(VK_CONTROL, down);
            if ((modifiers & ModifierKeys.Alt) != 0)
                SendKey(VK_MENU, down);
            if ((modifiers & ModifierKeys.Shift) != 0)
                SendKey(VK_SHIFT, down);
            if ((modifiers & ModifierKeys.Windows) != 0)
                SendKey(VK_LWIN, down);
        }

        private void SendKey(ushort vk, bool down)
        {
            INPUT input = new INPUT
            {
                type = INPUT_KEYBOARD,
                ki = new KEYBDINPUT
                {
                    wVk = vk,
                    wScan = 0,
                    dwFlags = down ? 0 : KEYEVENTF_KEYUP,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            };

            SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        private void SendKeyDown(ushort vk)
        {
            SendKey(vk, true);
        }

        private void SendKeyUp(ushort vk)
        {
            SendKey(vk, false);
        }

        public IInputAction Clone()
        {
            return new KeyboardAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                DelayBefore = this.DelayBefore,
                DelayAfter = this.DelayAfter,
                VirtualKeyCode = this.VirtualKeyCode,
                ActionType = this.ActionType,
                Modifiers = this.Modifiers
            };
        }

        // Constantes WinAPI
        private const ushort VK_CONTROL = 0x11;
        private const ushort VK_MENU = 0x12;
        private const ushort VK_SHIFT = 0x10;
        private const ushort VK_LWIN = 0x5B;
        private const int INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public int type;
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    }

    public enum KeyboardActionType
    {
        Down,
        Up,
        Press
    }

    [Flags]
    public enum ModifierKeys
    {
        None = 0,
        Control = 1,
        Alt = 2,
        Shift = 4,
        Windows = 8
    }
}


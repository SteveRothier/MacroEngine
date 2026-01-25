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
            if (Modifiers != ModifierKeys.None)
            {
                SendModifierKeys(Modifiers, true);
            }

            if (ActionType == KeyboardActionType.Down || ActionType == KeyboardActionType.Press)
            {
                SendKeyDown(VirtualKeyCode);
                // Délai entre Down et Up pour que le système traite correctement la touche
                if (ActionType == KeyboardActionType.Press)
                {
                    System.Threading.Thread.Sleep(80);
                }
            }

            if (ActionType == KeyboardActionType.Up || ActionType == KeyboardActionType.Press)
            {
                SendKeyUp(VirtualKeyCode);
                // Délai après Up pour que le système finalise la touche
                if (ActionType == KeyboardActionType.Press)
                {
                    System.Threading.Thread.Sleep(50);
                }
            }

            if (Modifiers != ModifierKeys.None)
            {
                SendModifierKeys(Modifiers, false);
            }
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
            // Utiliser keybd_event qui est plus fiable pour envoyer des touches
            // keybd_event fonctionne mieux que SendInput dans certains cas
            keybd_event((byte)vk, 0, down ? 0 : KEYEVENTF_KEYUP, 0);
            
            // Petit délai pour s'assurer que le système traite l'événement
            System.Threading.Thread.Sleep(10);
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
        private const ushort VK_RWIN = 0x5C;
        private const ushort VK_APPS = 0x5D; // Touche Menu contextuel
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

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
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


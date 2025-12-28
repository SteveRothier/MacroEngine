using System;
using System.Runtime.InteropServices;
using System.Text;

namespace MacroEngine.Core.Hooks
{
    /// <summary>
    /// Hook pour capturer les événements clavier globaux
    /// </summary>
    public class KeyboardHook : IInputHook
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private LowLevelKeyboardProc _proc;
        private IntPtr _hookId = IntPtr.Zero;
        private bool _isEnabled = false;

        public event EventHandler<KeyboardHookEventArgs>? KeyDown;
        public event EventHandler<KeyboardHookEventArgs>? KeyUp;
#pragma warning disable CS0067 // Event is never used
        public event EventHandler<MouseHookEventArgs>? MouseDown;
        public event EventHandler<MouseHookEventArgs>? MouseUp;
        public event EventHandler<MouseHookEventArgs>? MouseMove;
#pragma warning restore CS0067

        public bool IsEnabled
        {
            get => _isEnabled;
            set
            {
                if (value && _hookId == IntPtr.Zero)
                    Install();
                else if (!value && _hookId != IntPtr.Zero)
                    Uninstall();
            }
        }

        public KeyboardHook()
        {
            _proc = HookCallback;
        }

        public bool Install()
        {
            if (_hookId != IntPtr.Zero)
                return false;

            _hookId = SetHook(_proc);
            _isEnabled = _hookId != IntPtr.Zero;
            return _isEnabled;
        }

        public bool Uninstall()
        {
            if (_hookId == IntPtr.Zero)
                return false;

            bool result = UnhookWindowsHookEx(_hookId);
            if (result)
            {
                _hookId = IntPtr.Zero;
                _isEnabled = false;
            }
            return result;
        }

        private IntPtr SetHook(LowLevelKeyboardProc proc)
        {
            using (var curProcess = System.Diagnostics.Process.GetCurrentProcess())
            using (var curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc,
                    GetModuleHandle(curModule?.ModuleName ?? string.Empty), 0);
            }
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                KBDLLHOOKSTRUCT hookStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                bool isKeyDown = wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN;
                bool isKeyUp = wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP;

                // Obtenir le layout de clavier actuel
                IntPtr hkl = GetKeyboardLayout(0);
                uint keyboardLayout = (uint)hkl.ToInt64();

                // Détecter les modificateurs depuis l'état du clavier
                bool hasShift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
                bool hasCtrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                bool hasAlt = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
                bool hasAltGr = hasCtrl && hasAlt; // Alt Gr = Ctrl + Alt

                // Obtenir le caractère Unicode produit par cette touche (seulement pour KeyDown)
                string? unicodeChar = null;
                if (isKeyDown)
                {
                    unicodeChar = GetUnicodeCharacter(hookStruct.vkCode, hookStruct.scanCode, hasShift, hasCtrl, hasAlt, hkl);
                }

                var args = new KeyboardHookEventArgs
                {
                    VirtualKeyCode = (int)hookStruct.vkCode,
                    ScanCode = (int)(hookStruct.scanCode & 0xFF),
                    IsExtended = (hookStruct.flags & 0x01) != 0,
                    IsInjected = (hookStruct.flags & 0x10) != 0,
                    UnicodeCharacter = unicodeChar,
                    HasShift = hasShift,
                    HasCtrl = hasCtrl,
                    HasAlt = hasAlt,
                    HasAltGr = hasAltGr,
                    KeyboardLayout = keyboardLayout
                };

                if (isKeyDown)
                    KeyDown?.Invoke(this, args);
                else if (isKeyUp)
                    KeyUp?.Invoke(this, args);

                if (args.Handled)
                    return (IntPtr)1;
            }

            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        /// <summary>
        /// Obtient le caractère Unicode produit par une touche en tenant compte du layout de clavier
        /// </summary>
        private string? GetUnicodeCharacter(uint vkCode, uint scanCode, bool shift, bool ctrl, bool alt, IntPtr hkl)
        {
            // Ignorer les touches modificateurs et les touches système
            if (vkCode == VK_SHIFT || vkCode == VK_CONTROL || vkCode == VK_MENU ||
                vkCode == 0x5B || vkCode == 0x5C) // Windows keys
            {
                return null;
            }

            // Créer un état de clavier pour ToUnicode
            byte[] keyboardState = new byte[256];
            
            // Définir les états des modificateurs
            if (shift) keyboardState[VK_SHIFT] = 0x80;
            if (ctrl) keyboardState[VK_CONTROL] = 0x80;
            if (alt) keyboardState[VK_MENU] = 0x80;
            
            // Convertir scanCode en format étendu si nécessaire
            uint sc = scanCode;
            if ((scanCode & 0xE000) != 0)
                sc = (scanCode & 0xFF) | 0xE000;
            else
                sc = scanCode & 0xFF;

            // Buffer pour recevoir le caractère Unicode
            StringBuilder unicodeBuffer = new StringBuilder(10);
            
            // Appeler ToUnicode pour obtenir le caractère
            int result = ToUnicodeEx(
                vkCode,
                sc,
                keyboardState,
                unicodeBuffer,
                unicodeBuffer.Capacity,
                0,
                hkl
            );

            // Si un caractère a été obtenu, le retourner
            if (result > 0 && unicodeBuffer.Length > 0)
            {
                return unicodeBuffer.ToString();
            }

            return null;
        }

        public void Dispose()
        {
            Uninstall();
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook,
            LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode,
            IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        // Constantes pour les modificateurs
        private const ushort VK_SHIFT = 0x10;
        private const ushort VK_CONTROL = 0x11;
        private const ushort VK_MENU = 0x12; // Alt

        // Nouvelles API Windows pour ToUnicode
        [DllImport("user32.dll")]
        private static extern IntPtr GetKeyboardLayout(uint idThread);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int ToUnicodeEx(
            uint wVirtKey,
            uint wScanCode,
            byte[] lpKeyState,
            [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pwszBuff,
            int cchBuff,
            uint wFlags,
            IntPtr dwhkl
        );

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }
    }
}


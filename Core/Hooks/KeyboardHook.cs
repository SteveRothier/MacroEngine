using System;
using System.Runtime.InteropServices;

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

        public event EventHandler<KeyboardHookEventArgs> KeyDown;
        public event EventHandler<KeyboardHookEventArgs> KeyUp;
        public event EventHandler<MouseHookEventArgs> MouseDown;
        public event EventHandler<MouseHookEventArgs> MouseUp;
        public event EventHandler<MouseHookEventArgs> MouseMove;

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
                    GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                KBDLLHOOKSTRUCT hookStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                bool isKeyDown = wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN;
                bool isKeyUp = wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP;

                var args = new KeyboardHookEventArgs
                {
                    VirtualKeyCode = (int)hookStruct.vkCode,
                    ScanCode = (int)(hookStruct.scanCode & 0xFF),
                    IsExtended = (hookStruct.flags & 0x01) != 0,
                    IsInjected = (hookStruct.flags & 0x10) != 0
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


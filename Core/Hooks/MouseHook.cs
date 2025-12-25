using System;
using System.Runtime.InteropServices;

namespace MacroEngine.Core.Hooks
{
    /// <summary>
    /// Hook pour capturer les événements souris globaux
    /// </summary>
    public class MouseHook : IInputHook
    {
        private const int WH_MOUSE_LL = 14;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_LBUTTONUP = 0x0202;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_RBUTTONUP = 0x0205;
        private const int WM_MBUTTONDOWN = 0x0207;
        private const int WM_MBUTTONUP = 0x0208;
        private const int WM_MOUSEMOVE = 0x0200;
        private const int WM_MOUSEWHEEL = 0x020A;

        private LowLevelMouseProc _proc;
        private IntPtr _hookId = IntPtr.Zero;
        private bool _isEnabled = false;

#pragma warning disable CS0067 // Event is never used
        public event EventHandler<KeyboardHookEventArgs>? KeyDown;
        public event EventHandler<KeyboardHookEventArgs>? KeyUp;
#pragma warning restore CS0067
        public event EventHandler<MouseHookEventArgs>? MouseDown;
        public event EventHandler<MouseHookEventArgs>? MouseUp;
        public event EventHandler<MouseHookEventArgs>? MouseMove;

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

        public MouseHook()
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

        private IntPtr SetHook(LowLevelMouseProc proc)
        {
            using (var curProcess = System.Diagnostics.Process.GetCurrentProcess())
            using (var curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_MOUSE_LL, proc,
                    GetModuleHandle(curModule?.ModuleName ?? string.Empty), 0);
            }
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                MSLLHOOKSTRUCT hookStruct = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                int wParamValue = wParam.ToInt32();

                var args = new MouseHookEventArgs
                {
                    X = hookStruct.pt.x,
                    Y = hookStruct.pt.y,
                    Delta = (int)(hookStruct.mouseData >> 16)
                };

                switch (wParamValue)
                {
                    case WM_LBUTTONDOWN:
                        args.Button = MouseButton.Left;
                        MouseDown?.Invoke(this, args);
                        break;
                    case WM_LBUTTONUP:
                        args.Button = MouseButton.Left;
                        MouseUp?.Invoke(this, args);
                        break;
                    case WM_RBUTTONDOWN:
                        args.Button = MouseButton.Right;
                        MouseDown?.Invoke(this, args);
                        break;
                    case WM_RBUTTONUP:
                        args.Button = MouseButton.Right;
                        MouseUp?.Invoke(this, args);
                        break;
                    case WM_MBUTTONDOWN:
                        args.Button = MouseButton.Middle;
                        MouseDown?.Invoke(this, args);
                        break;
                    case WM_MBUTTONUP:
                        args.Button = MouseButton.Middle;
                        MouseUp?.Invoke(this, args);
                        break;
                    case WM_MOUSEMOVE:
                        MouseMove?.Invoke(this, args);
                        break;
                }

                if (args.Handled)
                    return (IntPtr)1;
            }

            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        public void Dispose()
        {
            Uninstall();
        }

        private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT
        {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook,
            LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode,
            IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }
}


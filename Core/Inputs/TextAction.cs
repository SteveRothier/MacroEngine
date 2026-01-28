using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action pour saisir du texte directement
    /// </summary>
    public class TextAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Text";
        public InputActionType Type => InputActionType.Text;

        /// <summary>
        /// Texte à saisir
        /// </summary>
        public string Text { get; set; } = string.Empty;

        /// <summary>
        /// Vitesse de frappe (délai en millisecondes entre chaque caractère)
        /// </summary>
        public int TypingSpeed { get; set; } = 50;

        /// <summary>
        /// Utiliser une frappe naturelle avec délais aléatoires
        /// </summary>
        public bool UseNaturalTyping { get; set; } = false;

        /// <summary>
        /// Délai minimum pour la frappe naturelle (millisecondes)
        /// </summary>
        public int MinDelay { get; set; } = 30;

        /// <summary>
        /// Délai maximum pour la frappe naturelle (millisecondes)
        /// </summary>
        public int MaxDelay { get; set; } = 80;

        public void Execute()
        {
            if (string.IsNullOrEmpty(Text))
                return;

            foreach (char c in Text)
            {
                // Gérer les caractères spéciaux
                if (c == '\n')
                {
                    // Retour à la ligne : Envoyer Entrée
                    SendKey(0x0D); // VK_RETURN
                }
                else if (c == '\t')
                {
                    // Tabulation
                    SendKey(0x09); // VK_TAB
                }
                else if (c == '\r')
                {
                    // Retour chariot (ignoré, géré avec \n)
                    continue;
                }
                else
                {
                    // Caractère normal : utiliser SendInput pour supporter Unicode
                    SendChar(c);
                }

                // Délai entre les caractères
                int delay = UseNaturalTyping
                    ? GetRandomDelay()
                    : TypingSpeed;

                if (delay > 0)
                {
                    Thread.Sleep(delay);
                }
            }
        }

        /// <summary>
        /// Génère un délai aléatoire pour la frappe naturelle
        /// </summary>
        private int GetRandomDelay()
        {
            if (MinDelay >= MaxDelay)
                return MinDelay;

            var random = new Random();
            return random.Next(MinDelay, MaxDelay + 1);
        }

        /// <summary>
        /// Envoie une touche virtuelle
        /// </summary>
        private void SendKey(ushort vk)
        {
            keybd_event((byte)vk, 0, 0, 0);
            Thread.Sleep(10);
            keybd_event((byte)vk, 0, KEYEVENTF_KEYUP, 0);
            Thread.Sleep(10);
        }

        /// <summary>
        /// Envoie un caractère Unicode en utilisant SendInput
        /// </summary>
        private void SendChar(char c)
        {
            // Pour les caractères ASCII simples, utiliser VkKeyScan
            short vkScan = VkKeyScan(c);
            
            if (vkScan != -1)
            {
                byte vk = (byte)(vkScan & 0xFF);
                byte shift = (byte)((vkScan >> 8) & 0xFF);

                // Si Shift est nécessaire
                if (shift != 0)
                {
                    keybd_event(0x10, 0, 0, 0); // VK_SHIFT down
                }

                // Envoyer la touche
                keybd_event(vk, 0, 0, 0);
                Thread.Sleep(10);
                keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
                Thread.Sleep(10);

                // Relâcher Shift si nécessaire
                if (shift != 0)
                {
                    keybd_event(0x10, 0, KEYEVENTF_KEYUP, 0);
                    Thread.Sleep(10);
                }
            }
            else
            {
                // Pour les caractères Unicode complexes, utiliser SendInput avec Unicode
                SendUnicodeChar(c);
            }
        }

        /// <summary>
        /// Envoie un caractère Unicode complexe
        /// </summary>
        private void SendUnicodeChar(char c)
        {
            var inputs = new INPUT[2];

            // Key down
            inputs[0] = new INPUT
            {
                type = INPUT_KEYBOARD,
                ki = new KEYBDINPUT
                {
                    wVk = 0,
                    wScan = c,
                    dwFlags = KEYEVENTF_UNICODE,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            };

            // Key up
            inputs[1] = new INPUT
            {
                type = INPUT_KEYBOARD,
                ki = new KEYBDINPUT
                {
                    wVk = 0,
                    wScan = c,
                    dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            };

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(10);
        }

        public IInputAction Clone()
        {
            return new TextAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Text = this.Text,
                TypingSpeed = this.TypingSpeed,
                UseNaturalTyping = this.UseNaturalTyping,
                MinDelay = this.MinDelay,
                MaxDelay = this.MaxDelay
            };
        }

        // Constantes WinAPI
        private const int INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

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

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern short VkKeyScan(char ch);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    }
}

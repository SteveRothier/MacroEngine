using System.Windows;
using System.Windows.Input;

namespace MacroEngine.UI
{
    /// <summary>
    /// Dialogue modal pour capturer une touche et l'utiliser comme raccourci de macro.
    /// </summary>
    public partial class ShortcutCaptureDialog : Window
    {
        /// <summary>
        /// Code virtuel de la touche capturée (0 si annulé ou invalide).
        /// </summary>
        public int CapturedKeyCode { get; private set; }

        public ShortcutCaptureDialog()
        {
            InitializeComponent();
            PreviewKeyDown += ShortcutCaptureDialog_PreviewKeyDown;
            Loaded += (s, e) =>
            {
                Activate();
                Focus();
            };
        }

        private void ShortcutCaptureDialog_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            // Échap = annuler
            if (e.Key == Key.Escape)
            {
                e.Handled = true;
                CapturedKeyCode = 0;
                DialogResult = false;
                Close();
                return;
            }

            // Ignorer les touches de modification seules (on ne capture qu'une touche simple pour le raccourci macro)
            if (e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                e.Key == Key.LWin || e.Key == Key.RWin)
            {
                e.Handled = true;
                return;
            }

            e.Handled = true;

            int vkCode = KeyInterop.VirtualKeyFromKey(e.Key);
            if (vkCode == 0)
                return;

            CapturedKeyCode = vkCode;
            DialogResult = true;
            Close();
        }
    }
}

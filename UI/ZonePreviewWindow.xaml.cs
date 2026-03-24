using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace MacroEngine.UI
{
    public partial class ZonePreviewWindow : Window
    {
        public ZonePreviewWindow(int x1, int y1, int x2, int y2)
        {
            InitializeComponent();
            Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = SystemParameters.VirtualScreenLeft;
            Top = SystemParameters.VirtualScreenTop;
            Width = SystemParameters.VirtualScreenWidth;
            Height = SystemParameters.VirtualScreenHeight;

            int w = Math.Abs(x2 - x1);
            int h = Math.Abs(y2 - y1);
            int left = Math.Min(x1, x2);
            int top = Math.Min(y1, y2);

            Canvas.SetLeft(PreviewRect, left);
            Canvas.SetTop(PreviewRect, top);
            PreviewRect.Width = Math.Max(1, w);
            PreviewRect.Height = Math.Max(1, h);

            LabelText.Text = $"{left},{top} → {left + w},{top + h}   ({w} × {h})";
            double labelLeft = Math.Max(0, Math.Min(left, (int)(Width - 220)));
            double labelTop = top + h + 6;
            if (labelTop + 28 > Height) labelTop = top - 28 - 6;
            Canvas.SetLeft(LabelBorder, labelLeft);
            Canvas.SetTop(LabelBorder, labelTop);

            KeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape) { e.Handled = true; Close(); }
            };
            PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape) { e.Handled = true; Close(); }
            };
        }

        private void PreviewCanvas_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            Close();
        }
    }
}

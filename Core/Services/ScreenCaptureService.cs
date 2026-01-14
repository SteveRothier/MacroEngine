using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service pour capturer des zones spécifiques de l'écran avec BitBlt
    /// </summary>
    public class ScreenCaptureService
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

        private const int SRCCOPY = 0x00CC0020;

        /// <summary>
        /// Capture une zone spécifique de l'écran
        /// </summary>
        /// <param name="x">Coordonnée X du coin supérieur gauche</param>
        /// <param name="y">Coordonnée Y du coin supérieur gauche</param>
        /// <param name="width">Largeur de la zone</param>
        /// <param name="height">Hauteur de la zone</param>
        /// <returns>Bitmap de la zone capturée, ou null en cas d'erreur</returns>
        public Bitmap? CaptureRegion(int x, int y, int width, int height)
        {
            if (width <= 0 || height <= 0)
                return null;

            try
            {
                IntPtr hdcScreen = GetDC(IntPtr.Zero);
                IntPtr hdcMem = CreateCompatibleDC(hdcScreen);
                IntPtr hBitmap = CreateCompatibleBitmap(hdcScreen, width, height);
                IntPtr hOld = SelectObject(hdcMem, hBitmap);

                BitBlt(hdcMem, 0, 0, width, height, hdcScreen, x, y, SRCCOPY);

                Bitmap bitmap = Image.FromHbitmap(hBitmap);

                SelectObject(hdcMem, hOld);
                DeleteObject(hBitmap);
                DeleteDC(hdcMem);
                ReleaseDC(IntPtr.Zero, hdcScreen);

                return bitmap;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Capture une zone rectangulaire définie par deux points
        /// </summary>
        public Bitmap? CaptureRectangle(int x1, int y1, int x2, int y2)
        {
            int x = Math.Min(x1, x2);
            int y = Math.Min(y1, y2);
            int width = Math.Abs(x2 - x1);
            int height = Math.Abs(y2 - y1);

            return CaptureRegion(x, y, width, height);
        }

        /// <summary>
        /// Capture un pixel spécifique
        /// </summary>
        public Color? CapturePixel(int x, int y)
        {
            using (var bitmap = CaptureRegion(x, y, 1, 1))
            {
                if (bitmap != null)
                {
                    return bitmap.GetPixel(0, 0);
                }
            }
            return null;
        }
    }
}

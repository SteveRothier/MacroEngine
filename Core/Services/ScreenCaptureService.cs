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

        [DllImport("gdi32.dll")]
        private static extern int GetDIBits(IntPtr hdc, IntPtr hbmp, uint uStartScan, uint cScanLines, byte[] lpvBits, ref BITMAPINFO lpbmi, uint uUsage);

        private const int SRCCOPY = 0x00CC0020;
        private const uint DIB_RGB_COLORS = 0;

        [StructLayout(LayoutKind.Sequential)]
        private struct BITMAPINFOHEADER
        {
            public uint biSize;
            public int biWidth;
            public int biHeight;
            public ushort biPlanes;
            public ushort biBitCount;
            public uint biCompression;
            public uint biSizeImage;
            public int biXPelsPerMeter;
            public int biYPelsPerMeter;
            public uint biClrUsed;
            public uint biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BITMAPINFO
        {
            public BITMAPINFOHEADER bmiHeader;
            public uint bmiColors;
        }

        private IntPtr _hdcScreen = IntPtr.Zero;
        private IntPtr _hdcMem = IntPtr.Zero;
        private IntPtr _hBitmap = IntPtr.Zero;
        private IntPtr _hOld = IntPtr.Zero;
        private int _cachedW;
        private int _cachedH;

        private void EnsureCache(int width, int height)
        {
            if (width <= 0 || height <= 0)
                return;

            if (_hdcScreen != IntPtr.Zero && _hdcMem != IntPtr.Zero && _hBitmap != IntPtr.Zero && _cachedW == width && _cachedH == height)
                return;

            DisposeCache();

            _hdcScreen = GetDC(IntPtr.Zero);
            _hdcMem = CreateCompatibleDC(_hdcScreen);
            _hBitmap = CreateCompatibleBitmap(_hdcScreen, width, height);
            _hOld = SelectObject(_hdcMem, _hBitmap);
            _cachedW = width;
            _cachedH = height;
        }

        private void DisposeCache()
        {
            if (_hdcMem != IntPtr.Zero && _hOld != IntPtr.Zero)
            {
                SelectObject(_hdcMem, _hOld);
                _hOld = IntPtr.Zero;
            }
            if (_hBitmap != IntPtr.Zero)
            {
                DeleteObject(_hBitmap);
                _hBitmap = IntPtr.Zero;
            }
            if (_hdcMem != IntPtr.Zero)
            {
                DeleteDC(_hdcMem);
                _hdcMem = IntPtr.Zero;
            }
            if (_hdcScreen != IntPtr.Zero)
            {
                ReleaseDC(IntPtr.Zero, _hdcScreen);
                _hdcScreen = IntPtr.Zero;
            }
            _cachedW = 0;
            _cachedH = 0;
        }

        public bool CaptureRegionBgra(int x, int y, int width, int height, byte[] buffer)
        {
            if (width <= 0 || height <= 0)
                return false;
            if (buffer == null || buffer.Length < width * height * 4)
                return false;

            try
            {
                EnsureCache(width, height);
                if (_hdcScreen == IntPtr.Zero || _hdcMem == IntPtr.Zero || _hBitmap == IntPtr.Zero)
                    return false;

                BitBlt(_hdcMem, 0, 0, width, height, _hdcScreen, x, y, SRCCOPY);

                var bmi = new BITMAPINFO
                {
                    bmiHeader = new BITMAPINFOHEADER
                    {
                        biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(),
                        biWidth = width,
                        biHeight = -height,
                        biPlanes = 1,
                        biBitCount = 32,
                        biCompression = 0,
                        biSizeImage = (uint)(width * height * 4)
                    },
                    bmiColors = 0
                };

                int got = GetDIBits(_hdcMem, _hBitmap, 0, (uint)height, buffer, ref bmi, DIB_RGB_COLORS);
                return got == height;
            }
            catch
            {
                return false;
            }
        }

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

        ~ScreenCaptureService()
        {
            try { DisposeCache(); } catch { }
        }
    }
}

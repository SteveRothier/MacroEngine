using System;
using System.Drawing;
using System.Drawing.Imaging;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service pour le pré-traitement d'images (grayscale, contraste, etc.)
    /// </summary>
    public class ImagePreprocessorService
    {
        /// <summary>
        /// Convertit une image en niveaux de gris
        /// </summary>
        public Bitmap ConvertToGrayscale(Bitmap original)
        {
            if (original == null)
                return null!;

            Bitmap grayscale = new Bitmap(original.Width, original.Height);

            for (int x = 0; x < original.Width; x++)
            {
                for (int y = 0; y < original.Height; y++)
                {
                    Color pixel = original.GetPixel(x, y);
                    int gray = (int)(0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B);
                    grayscale.SetPixel(x, y, Color.FromArgb(gray, gray, gray));
                }
            }

            return grayscale;
        }

        /// <summary>
        /// Ajuste le contraste d'une image
        /// </summary>
        /// <param name="original">Image originale</param>
        /// <param name="contrast">Valeur de contraste (-100 à 100)</param>
        public Bitmap AdjustContrast(Bitmap original, int contrast)
        {
            if (original == null)
                return null!;

            // Normaliser le contraste entre -100 et 100
            double factor = (100.0 + contrast) / 100.0;
            factor = factor * factor; // Pour un effet plus prononcé

            Bitmap result = new Bitmap(original.Width, original.Height);

            for (int x = 0; x < original.Width; x++)
            {
                for (int y = 0; y < original.Height; y++)
                {
                    Color pixel = original.GetPixel(x, y);
                    
                    int r = Clamp((int)(((pixel.R / 255.0 - 0.5) * factor + 0.5) * 255.0));
                    int g = Clamp((int)(((pixel.G / 255.0 - 0.5) * factor + 0.5) * 255.0));
                    int b = Clamp((int)(((pixel.B / 255.0 - 0.5) * factor + 0.5) * 255.0));

                    result.SetPixel(x, y, Color.FromArgb(r, g, b));
                }
            }

            return result;
        }

        /// <summary>
        /// Applique un seuillage (binarisation) pour améliorer l'OCR
        /// </summary>
        public Bitmap ApplyThreshold(Bitmap original, int threshold = 128)
        {
            if (original == null)
                return null!;

            Bitmap result = new Bitmap(original.Width, original.Height);

            for (int x = 0; x < original.Width; x++)
            {
                for (int y = 0; y < original.Height; y++)
                {
                    Color pixel = original.GetPixel(x, y);
                    int gray = (int)(0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B);
                    int value = gray > threshold ? 255 : 0;
                    result.SetPixel(x, y, Color.FromArgb(value, value, value));
                }
            }

            return result;
        }

        /// <summary>
        /// Prépare une image pour l'OCR (grayscale + contraste + seuillage)
        /// </summary>
        public Bitmap PrepareForOCR(Bitmap original, int contrast = 20)
        {
            if (original == null)
                return null!;

            var grayscale = ConvertToGrayscale(original);
            var contrasted = AdjustContrast(grayscale, contrast);
            grayscale.Dispose();
            var thresholded = ApplyThreshold(contrasted);
            contrasted.Dispose();

            return thresholded;
        }

        private int Clamp(int value)
        {
            return Math.Max(0, Math.Min(255, value));
        }
    }
}

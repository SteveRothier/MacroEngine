using System;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using MacroEngine.Core.Inputs;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service centralisé pour l'évaluation des conditions avec cache et optimisations
    /// </summary>
    public class ConditionEvaluationService : IDisposable
    {
        private static ConditionEvaluationService? _instance;
        private static readonly object _lock = new object();

        private readonly ScreenCaptureService _screenCapture;
        private readonly ImagePreprocessorService _imagePreprocessor;
        private readonly OCRService _ocrService;
        private readonly ImageDetectionService _imageDetection;

        private ConditionEvaluationService()
        {
            _screenCapture = new ScreenCaptureService();
            _imagePreprocessor = new ImagePreprocessorService();
            _ocrService = new OCRService();
            _imageDetection = new ImageDetectionService(_screenCapture);
        }

        public static ConditionEvaluationService Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        if (_instance == null)
                        {
                            _instance = new ConditionEvaluationService();
                        }
                    }
                }
                return _instance;
            }
        }

        /// <summary>
        /// Évalue une condition de pixel couleur
        /// </summary>
        public bool EvaluatePixelColor(int x, int y, string expectedColorHex, int tolerance, ColorMatchMode matchMode)
        {
            try
            {
                var pixelColor = _screenCapture.CapturePixel(x, y);
                if (pixelColor == null)
                    return false;

                // Parser la couleur attendue
                Color expectedColor;
                try
                {
                    string hex = expectedColorHex.TrimStart('#');
                    if (hex.Length == 6)
                    {
                        int r = Convert.ToInt32(hex.Substring(0, 2), 16);
                        int g = Convert.ToInt32(hex.Substring(2, 2), 16);
                        int b = Convert.ToInt32(hex.Substring(4, 2), 16);
                        expectedColor = Color.FromArgb(r, g, b);
                    }
                    else
                    {
                        return false;
                    }
                }
                catch
                {
                    return false;
                }

                // Comparer avec tolérance
                int toleranceValue = (int)(255 * tolerance / 100.0);
                int diffR = Math.Abs(pixelColor.Value.R - expectedColor.R);
                int diffG = Math.Abs(pixelColor.Value.G - expectedColor.G);
                int diffB = Math.Abs(pixelColor.Value.B - expectedColor.B);

                return diffR <= toleranceValue && diffG <= toleranceValue && diffB <= toleranceValue;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue une condition d'image à l'écran
        /// </summary>
        public async Task<bool> EvaluateImageOnScreenAsync(string imagePath, int sensitivity, int[]? searchArea = null)
        {
            try
            {
                return await _imageDetection.FindImageAsync(imagePath, sensitivity, searchArea);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue une condition de texte à l'écran
        /// </summary>
        public async Task<bool> EvaluateTextOnScreenAsync(string searchText, int[]? searchArea = null)
        {
            try
            {
                // Déterminer la zone de recherche
                int x1, y1, x2, y2;
                if (searchArea != null && searchArea.Length >= 4)
                {
                    x1 = searchArea[0];
                    y1 = searchArea[1];
                    x2 = searchArea[2];
                    y2 = searchArea[3];
                }
                else
                {
                    // Zone limitée par défaut
                    var screen = System.Windows.Forms.Screen.PrimaryScreen;
                    if (screen == null) return false;

                    var screenWidth = screen.Bounds.Width;
                    var screenHeight = screen.Bounds.Height;
                    int marginX = screenWidth / 10;
                    int marginY = screenHeight / 10;
                    x1 = marginX;
                    y1 = marginY;
                    x2 = screenWidth - marginX;
                    y2 = screenHeight - marginY;
                }

                int width = Math.Abs(x2 - x1);
                int height = Math.Abs(y2 - y1);

                // Limiter la taille maximale
                const int maxSize = 1920;
                if (width > maxSize) width = maxSize;
                if (height > maxSize) height = maxSize;

                using (var captured = _screenCapture.CaptureRectangle(x1, y1, x1 + width, y1 + height))
                {
                    if (captured == null)
                        return false;

                    // Pré-traiter l'image pour l'OCR
                    using (var processed = _imagePreprocessor.PrepareForOCR(captured))
                    {
                        // Extraire les caractères uniques du texte recherché pour la whitelist
                        var whitelist = new string(searchText.Where(c => char.IsLetterOrDigit(c) || char.IsWhiteSpace(c) || char.IsPunctuation(c)).Distinct().ToArray());

                        // Effectuer l'OCR
                        var detectedText = await _ocrService.RecognizeTextAsync(processed, whitelist);

                        if (detectedText != null)
                        {
                            // Vérifier si le texte recherché est présent
                            return detectedText.Contains(searchText, StringComparison.OrdinalIgnoreCase);
                        }
                    }
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        public void Dispose()
        {
            _ocrService?.Dispose();
            _imageDetection?.ClearCache();
        }
    }
}

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service pour détecter des images à l'écran avec cache et thread secondaire
    /// </summary>
    public class ImageDetectionService
    {
        private readonly ScreenCaptureService _screenCapture;
        private readonly Dictionary<string, (bool found, DateTime timestamp, Rectangle? location)> _cache = new();
        private readonly object _cacheLock = new object();
        private DateTime _lastAnalysis = DateTime.MinValue;
        private readonly TimeSpan _cooldown = TimeSpan.FromMilliseconds(500);
        private readonly object _cooldownLock = new object();

        public ImageDetectionService(ScreenCaptureService screenCapture)
        {
            _screenCapture = screenCapture;
        }

        /// <summary>
        /// Recherche une image dans une zone spécifique de l'écran
        /// </summary>
        /// <param name="templatePath">Chemin vers l'image template</param>
        /// <param name="sensitivity">Sensibilité en pourcentage (0-100)</param>
        /// <param name="searchArea">Zone de recherche (null = tout l'écran, mais on limite quand même)</param>
        /// <returns>True si l'image est trouvée</returns>
        public async Task<bool> FindImageAsync(string templatePath, int sensitivity, int[]? searchArea = null)
        {
            if (!File.Exists(templatePath))
                return false;

            // Vérifier le cooldown
            lock (_cooldownLock)
            {
                var timeSinceLastAnalysis = DateTime.Now - _lastAnalysis;
                if (timeSinceLastAnalysis < _cooldown)
                {
                    // Vérifier le cache
                    string cacheKey = GenerateCacheKey(templatePath, sensitivity, searchArea);
                    lock (_cacheLock)
                    {
                        if (_cache.TryGetValue(cacheKey, out var cached))
                        {
                            if (DateTime.Now - cached.timestamp < TimeSpan.FromSeconds(1))
                            {
                                return cached.found;
                            }
                            _cache.Remove(cacheKey);
                        }
                    }
                }
                _lastAnalysis = DateTime.Now;
            }

            return await Task.Run(() =>
            {
                try
                {
                    using (var template = new Bitmap(templatePath))
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
                            // Limiter à une zone raisonnable (pas tout l'écran)
                            var screen = Screen.PrimaryScreen;
                            if (screen == null) return false;
                            
                            var screenWidth = screen.Bounds.Width;
                            var screenHeight = screen.Bounds.Height;
                            
                            // Zone par défaut : centre de l'écran, 80% de la taille
                            int marginX = screenWidth / 10;
                            int marginY = screenHeight / 10;
                            x1 = marginX;
                            y1 = marginY;
                            x2 = screenWidth - marginX;
                            y2 = screenHeight - marginY;
                        }

                        int searchWidth = Math.Abs(x2 - x1);
                        int searchHeight = Math.Abs(y2 - y1);

                        // Limiter la taille maximale de recherche (sécurité)
                        const int maxSearchSize = 1920;
                        if (searchWidth > maxSearchSize) searchWidth = maxSearchSize;
                        if (searchHeight > maxSearchSize) searchHeight = maxSearchSize;

                        using (var screenCapture = _screenCapture.CaptureRectangle(x1, y1, x1 + searchWidth, y1 + searchHeight))
                        {
                            if (screenCapture == null)
                                return false;

                            bool found = TemplateMatch(screenCapture, template, sensitivity / 100.0);

                            // Mettre en cache
                            string cacheKey = GenerateCacheKey(templatePath, sensitivity, searchArea);
                            lock (_cacheLock)
                            {
                                _cache[cacheKey] = (found, DateTime.Now, null);
                                
                                // Nettoyer le cache
                                if (_cache.Count > 50)
                                {
                                    var oldest = _cache.OrderBy(kvp => kvp.Value.timestamp).First();
                                    _cache.Remove(oldest.Key);
                                }
                            }

                            return found;
                        }
                    }
                }
                catch
                {
                    return false;
                }
            });
        }

        /// <summary>
        /// Effectue une correspondance de template avec sensibilité
        /// </summary>
        private bool TemplateMatch(Bitmap source, Bitmap template, double sensitivity)
        {
            if (source.Width < template.Width || source.Height < template.Height)
                return false;

            // Recherche simple : comparer des échantillons
            int sampleCount = Math.Min(100, template.Width * template.Height);
            int matches = 0;
            Random random = new Random();

            for (int i = 0; i < sampleCount; i++)
            {
                int tx = random.Next(template.Width);
                int ty = random.Next(template.Height);
                int sx = random.Next(source.Width - template.Width + 1);
                int sy = random.Next(source.Height - template.Height + 1);

                Color templatePixel = template.GetPixel(tx, ty);
                Color sourcePixel = source.GetPixel(sx + tx, sy + ty);

                // Comparaison avec tolérance
                int diff = Math.Abs(templatePixel.R - sourcePixel.R) +
                          Math.Abs(templatePixel.G - sourcePixel.G) +
                          Math.Abs(templatePixel.B - sourcePixel.B);

                if (diff < 30) // Tolérance de couleur
                {
                    matches++;
                }
            }

            double matchRatio = (double)matches / sampleCount;
            return matchRatio >= sensitivity;
        }

        private string GenerateCacheKey(string templatePath, int sensitivity, int[]? searchArea)
        {
            string areaKey = searchArea != null ? string.Join(",", searchArea) : "default";
            return $"{templatePath}_{sensitivity}_{areaKey}";
        }

        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _cache.Clear();
            }
        }
    }
}

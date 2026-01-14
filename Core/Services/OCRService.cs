using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Tesseract;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service OCR avec Tesseract, cache et cooldown
    /// </summary>
    public class OCRService : IDisposable
    {
        private readonly Dictionary<string, (string text, DateTime timestamp)> _cache = new();
        private readonly object _cacheLock = new object();
        private DateTime _lastAnalysis = DateTime.MinValue;
        private readonly TimeSpan _cooldown = TimeSpan.FromMilliseconds(500); // Cooldown de 500ms
        private readonly object _cooldownLock = new object();
        private TesseractEngine? _engine;
        private readonly object _engineLock = new object();

        /// <summary>
        /// Initialise le moteur Tesseract
        /// </summary>
        private TesseractEngine? GetEngine()
        {
            if (_engine == null)
            {
                lock (_engineLock)
                {
                    if (_engine == null)
                    {
                        try
                        {
                            // Obtenir le chemin du dossier tessdata
                            string tessdataPath = TesseractDataDownloader.GetTessdataPath();
                            string[] requiredLanguages = { "fra", "eng" };

                            // Vérifier si les fichiers existent, sinon essayer de les télécharger
                            if (!TesseractDataDownloader.CheckTessdataExists(tessdataPath, requiredLanguages))
                            {
                                // Télécharger les fichiers en arrière-plan (ne pas bloquer)
                                _ = Task.Run(async () =>
                                {
                                    try
                                    {
                                        await TesseractDataDownloader.DownloadTessdataAsync(tessdataPath, requiredLanguages);
                                    }
                                    catch
                                    {
                                        // Échec silencieux du téléchargement
                                    }
                                });

                                // Pour l'instant, retourner null si les fichiers ne sont pas présents
                                // L'utilisateur devra attendre le téléchargement ou redémarrer l'application
                                return null;
                            }

                            _engine = new TesseractEngine(tessdataPath, "fra+eng", EngineMode.Default);
                            _engine.SetVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}\"'-");
                        }
                        catch
                        {
                            // Si Tesseract n'est pas disponible, on retourne null
                            return null;
                        }
                    }
                }
            }
            return _engine;
        }

        /// <summary>
        /// Effectue l'OCR sur une image avec cache et cooldown
        /// </summary>
        /// <param name="image">Image à analyser</param>
        /// <param name="whitelist">Liste blanche de caractères (optionnel)</param>
        /// <param name="cacheKey">Clé de cache (optionnel, générée automatiquement si null)</param>
        /// <returns>Texte détecté ou null</returns>
        public async Task<string?> RecognizeTextAsync(System.Drawing.Bitmap image, string? whitelist = null, string? cacheKey = null)
        {
            // Vérifier le cooldown
            lock (_cooldownLock)
            {
                var timeSinceLastAnalysis = DateTime.Now - _lastAnalysis;
                if (timeSinceLastAnalysis < _cooldown)
                {
                    // Vérifier le cache
                    if (cacheKey == null)
                        cacheKey = GenerateCacheKey(image);

                    lock (_cacheLock)
                    {
                        if (_cache.TryGetValue(cacheKey, out var cached))
                        {
                            if (DateTime.Now - cached.timestamp < TimeSpan.FromSeconds(2))
                            {
                                return cached.text;
                            }
                            _cache.Remove(cacheKey);
                        }
                    }
                }
                _lastAnalysis = DateTime.Now;
            }

            // Générer la clé de cache si non fournie
            if (cacheKey == null)
            {
                cacheKey = GenerateCacheKey(image);
            }

            // Vérifier le cache
            lock (_cacheLock)
            {
                if (_cache.TryGetValue(cacheKey, out var cached))
                {
                    // Cache valide pendant 2 secondes
                    if (DateTime.Now - cached.timestamp < TimeSpan.FromSeconds(2))
                    {
                        return cached.text;
                    }
                    _cache.Remove(cacheKey);
                }
            }

            // Exécuter l'OCR sur un thread secondaire
            return await Task.Run(() =>
            {
                try
                {
                    var engine = GetEngine();
                    if (engine == null)
                        return null;

                    // Appliquer la whitelist si fournie
                    if (!string.IsNullOrEmpty(whitelist))
                    {
                        engine.SetVariable("tessedit_char_whitelist", whitelist);
                    }

                    // Convertir Bitmap en Pix pour Tesseract
                    // Utiliser un fichier temporaire (méthode la plus fiable)
                    Pix pix;
                    string tempFile = Path.Combine(Path.GetTempPath(), $"tesseract_{Guid.NewGuid()}.png");
                    try
                    {
                        image.Save(tempFile, System.Drawing.Imaging.ImageFormat.Png);
                        pix = Pix.LoadFromFile(tempFile);
                    }
                    catch
                    {
                        return null; // Erreur lors de la conversion
                    }

                    try
                    {
                        using (var page = engine.Process(pix))
                        {
                            string text = page.GetText().Trim();
                            
                            // Mettre en cache
                            lock (_cacheLock)
                            {
                                _cache[cacheKey] = (text, DateTime.Now);
                                
                                // Nettoyer le cache ancien (garder seulement les 50 dernières entrées)
                                if (_cache.Count > 50)
                                {
                                    var oldest = _cache.OrderBy(kvp => kvp.Value.timestamp).First();
                                    _cache.Remove(oldest.Key);
                                }
                            }

                            return string.IsNullOrWhiteSpace(text) ? null : text;
                        }
                    }
                    finally
                    {
                        pix.Dispose();
                        
                        // Nettoyer le fichier temporaire
                        try
                        {
                            if (File.Exists(tempFile))
                                File.Delete(tempFile);
                        }
                        catch { }
                    }
                }
                catch
                {
                    return null;
                }
            });
        }

        /// <summary>
        /// Génère une clé de cache basée sur les dimensions et un hash simple de l'image
        /// </summary>
        private string GenerateCacheKey(System.Drawing.Bitmap image)
        {
            // Clé simple basée sur les dimensions et quelques pixels
            // Pour un vrai cache, on pourrait utiliser un hash MD5 de l'image
            int sample = 0;
            int sampleCount = Math.Min(10, image.Width * image.Height);
            int step = Math.Max(1, (image.Width * image.Height) / sampleCount);

            for (int i = 0; i < sampleCount; i++)
            {
                int x = (i * step) % image.Width;
                int y = (i * step) / image.Width;
                if (y < image.Height)
                {
                    var pixel = image.GetPixel(x, y);
                    sample ^= pixel.GetHashCode();
                }
            }

            return $"{image.Width}x{image.Height}_{sample}";
        }

        /// <summary>
        /// Nettoie le cache
        /// </summary>
        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _cache.Clear();
            }
        }

        public void Dispose()
        {
            lock (_engineLock)
            {
                _engine?.Dispose();
                _engine = null;
            }
            ClearCache();
        }
    }
}

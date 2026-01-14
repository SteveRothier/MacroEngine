using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace MacroEngine.Core.Services
{
    /// <summary>
    /// Service pour télécharger automatiquement les fichiers de données Tesseract
    /// </summary>
    public class TesseractDataDownloader
    {
        private const string TESSDATA_FAST_URL = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/";

        /// <summary>
        /// Télécharge les fichiers de données Tesseract nécessaires
        /// </summary>
        /// <param name="tessdataPath">Chemin du dossier tessdata</param>
        /// <param name="languages">Langues à télécharger (ex: "fra", "eng")</param>
        /// <returns>True si le téléchargement a réussi</returns>
        public static async Task<bool> DownloadTessdataAsync(string tessdataPath, string[] languages)
        {
            try
            {
                // Créer le dossier tessdata s'il n'existe pas
                if (!Directory.Exists(tessdataPath))
                {
                    Directory.CreateDirectory(tessdataPath);
                }

                using (var httpClient = new HttpClient())
                {
                    httpClient.Timeout = TimeSpan.FromMinutes(5);

                    foreach (var lang in languages)
                    {
                        string fileName = $"{lang}.traineddata";
                        string filePath = Path.Combine(tessdataPath, fileName);

                        // Vérifier si le fichier existe déjà
                        if (File.Exists(filePath))
                        {
                            continue; // Fichier déjà présent
                        }

                        try
                        {
                            string url = TESSDATA_FAST_URL + fileName;
                            var response = await httpClient.GetAsync(url);
                            
                            if (response.IsSuccessStatusCode)
                            {
                                var fileData = await response.Content.ReadAsByteArrayAsync();
                                await File.WriteAllBytesAsync(filePath, fileData);
                            }
                            else
                            {
                                return false; // Échec du téléchargement
                            }
                        }
                        catch
                        {
                            return false;
                        }
                    }

                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Vérifie si les fichiers tessdata sont présents
        /// </summary>
        public static bool CheckTessdataExists(string tessdataPath, string[] languages)
        {
            if (!Directory.Exists(tessdataPath))
                return false;

            foreach (var lang in languages)
            {
                string fileName = $"{lang}.traineddata";
                string filePath = Path.Combine(tessdataPath, fileName);
                
                if (!File.Exists(filePath))
                    return false;
            }

            return true;
        }

        /// <summary>
        /// Obtient le chemin du dossier tessdata (crée si nécessaire)
        /// </summary>
        public static string GetTessdataPath()
        {
            // Essayer d'abord dans le dossier de l'application
            string appPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tessdata");
            if (Directory.Exists(appPath))
                return appPath;

            // Sinon, utiliser AppData
            string appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "MacroEngine",
                "tessdata"
            );

            // Créer le dossier s'il n'existe pas
            if (!Directory.Exists(appDataPath))
            {
                try
                {
                    Directory.CreateDirectory(appDataPath);
                }
                catch
                {
                    // Si on ne peut pas créer, retourner quand même le chemin
                }
            }

            return appDataPath;
        }
    }
}

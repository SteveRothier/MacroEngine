using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Services;
using MacroEngine.UI;

namespace MacroEngine
{
    public partial class App : Application
    {
        private ILogger? _appLogger;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            
            // Initialiser les dossiers nécessaires
            EnsureDirectoriesExist();
            
            // Initialiser un logger minimal pour l'application
            InitializeApplicationLogger();
            
            _appLogger?.Info("Application démarrée", "App");
            
            // Télécharger les fichiers Tesseract en arrière-plan si nécessaire
            _ = Task.Run(async () =>
            {
                try
                {
                    await EnsureTesseractDataAsync();
                }
                catch (Exception ex)
                {
                    _appLogger?.Error("Erreur lors du téléchargement des fichiers Tesseract", ex, "App");
                }
            });
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _appLogger?.Info("Arrêt de l'application en cours...", "App");
            
            // Nettoyer les hooks et services via MainWindow si elle existe
            CleanupMainWindow();
            
            // Nettoyer le logger
            _appLogger?.Info("Application arrêtée", "App");
            _appLogger?.Dispose();
            
            base.OnExit(e);
        }

        private void EnsureDirectoriesExist()
        {
            try
            {
                // Créer les dossiers nécessaires s'ils n'existent pas
                if (!Directory.Exists("Data"))
                {
                    Directory.CreateDirectory("Data");
                }
                
                if (!Directory.Exists("Logs"))
                {
                    Directory.CreateDirectory("Logs");
                }
            }
            catch (Exception ex)
            {
                // Logger l'erreur si possible, sinon afficher un message
                System.Diagnostics.Debug.WriteLine($"Erreur lors de la création des dossiers: {ex.Message}");
            }
        }

        private void InitializeApplicationLogger()
        {
            try
            {
                _appLogger = new Logger
                {
                    MinimumLevel = LogLevel.Info
                };
                
                // Ajouter uniquement le FileLogWriter pour le logger de l'application
                var fileWriter = new FileLogWriter("Logs", LogLevel.Debug);
                _appLogger.AddWriter(fileWriter);
            }
            catch (Exception ex)
            {
                // Si on ne peut pas initialiser le logger, on continue quand même
                System.Diagnostics.Debug.WriteLine($"Erreur lors de l'initialisation du logger: {ex.Message}");
            }
        }

        private async Task EnsureTesseractDataAsync()
        {
            try
            {
                string tessdataPath = TesseractDataDownloader.GetTessdataPath();
                string[] requiredLanguages = { "fra", "eng" };

                // Vérifier si les fichiers existent déjà
                if (TesseractDataDownloader.CheckTessdataExists(tessdataPath, requiredLanguages))
                {
                    _appLogger?.Info("Fichiers Tesseract déjà présents", "App");
                    return;
                }

                _appLogger?.Info("Téléchargement des fichiers Tesseract en cours...", "App");

                // Télécharger les fichiers
                bool success = await TesseractDataDownloader.DownloadTessdataAsync(tessdataPath, requiredLanguages);

                if (success)
                {
                    _appLogger?.Info("Fichiers Tesseract téléchargés avec succès", "App");
                }
                else
                {
                    _appLogger?.Warning("Échec du téléchargement des fichiers Tesseract. L'OCR ne sera pas disponible.", "App");
                }
            }
            catch (Exception ex)
            {
                _appLogger?.Error("Erreur lors de la vérification/téléchargement des fichiers Tesseract", ex, "App");
            }
        }

        private void CleanupMainWindow()
        {
            try
            {
                // Le nettoyage détaillé est géré dans MainWindow.Exit_Click
                // Cette méthode sert principalement à logger la fermeture
                // Les hooks seront nettoyés automatiquement via Dispose lors de la fermeture de MainWindow
            }
            catch (Exception ex)
            {
                _appLogger?.Error("Erreur lors du nettoyage de MainWindow", ex, "App");
            }
        }
    }
}

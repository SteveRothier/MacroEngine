using System;
using System.IO;
using System.Windows;
using MacroEngine.Core.Logging;
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


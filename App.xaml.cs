using System.Windows;

namespace MacroEngine
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            
            // Initialisation de l'application
            // TODO: Charger la configuration, initialiser les services, etc.
        }

        protected override void OnExit(ExitEventArgs e)
        {
            // Nettoyage avant la fermeture
            // TODO: Sauvegarder les données, arrêter les services, etc.
            
            base.OnExit(e);
        }
    }
}


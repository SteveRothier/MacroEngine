using System;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Plugins
{
    /// <summary>
    /// Interface pour les plugins de macros
    /// </summary>
    public interface IMacroPlugin
    {
        /// <summary>
        /// Nom du plugin
        /// </summary>
        string Name { get; }

        /// <summary>
        /// Version du plugin
        /// </summary>
        string Version { get; }

        /// <summary>
        /// Description du plugin
        /// </summary>
        string Description { get; }

        /// <summary>
        /// Initialise le plugin
        /// </summary>
        bool Initialize();

        /// <summary>
        /// Arrête le plugin
        /// </summary>
        void Shutdown();

        /// <summary>
        /// Exécute une action personnalisée
        /// </summary>
        bool ExecuteAction(string actionName, object parameters);

        /// <summary>
        /// Événement déclenché par le plugin
        /// </summary>
        event EventHandler<PluginEventArgs> PluginEvent;
    }

    /// <summary>
    /// Arguments pour les événements de plugin
    /// </summary>
    public class PluginEventArgs : EventArgs
    {
        public string EventName { get; set; }
        public object Data { get; set; }
    }
}


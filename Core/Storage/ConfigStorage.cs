using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Storage
{
    /// <summary>
    /// Service de sauvegarde et chargement de la configuration de l'application
    /// </summary>
    public class ConfigStorage
    {
        private readonly string _configFilePath;
        private readonly ILogger? _logger;

        public ConfigStorage(string configFilePath = "Data/config.json", ILogger? logger = null)
        {
            _configFilePath = configFilePath;
            _logger = logger;
        }

        /// <summary>
        /// Charge la configuration depuis le fichier
        /// </summary>
        public async Task<MacroEngineConfig> LoadConfigAsync()
        {
            try
            {
                if (!File.Exists(_configFilePath))
                {
                    _logger?.Debug($"Fichier de configuration introuvable: {_configFilePath}, utilisation des valeurs par défaut", "ConfigStorage");
                    return new MacroEngineConfig();
                }

                _logger?.Debug($"Chargement de la configuration depuis {_configFilePath}", "ConfigStorage");
                string json = await File.ReadAllTextAsync(_configFilePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true
                };

                var config = JsonSerializer.Deserialize<MacroEngineConfig>(json, options);
                if (config == null)
                {
                    _logger?.Warning("Configuration désérialisée est null, utilisation des valeurs par défaut", "ConfigStorage");
                    return new MacroEngineConfig();
                }

                _logger?.Info("Configuration chargée avec succès", "ConfigStorage");
                return config;
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors du chargement de la configuration depuis {_configFilePath}", ex, "ConfigStorage");
                // Retourner la configuration par défaut en cas d'erreur
                return new MacroEngineConfig();
            }
        }

        /// <summary>
        /// Sauvegarde la configuration dans le fichier
        /// </summary>
        public async Task SaveConfigAsync(MacroEngineConfig config)
        {
            try
            {
                _logger?.Debug($"Sauvegarde de la configuration vers {_configFilePath}", "ConfigStorage");
                var directory = Path.GetDirectoryName(_configFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                    _logger?.Debug($"Dossier créé: {directory}", "ConfigStorage");
                }

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true
                };

                string json = JsonSerializer.Serialize(config, options);
                await File.WriteAllTextAsync(_configFilePath, json);
                _logger?.Info("Configuration sauvegardée avec succès", "ConfigStorage");
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de la sauvegarde de la configuration vers {_configFilePath}", ex, "ConfigStorage");
                throw new Exception($"Erreur lors de la sauvegarde de la configuration: {ex.Message}", ex);
            }
        }
    }
}







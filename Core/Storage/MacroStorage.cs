using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Storage
{
    /// <summary>
    /// Service de sauvegarde et chargement des macros
    /// </summary>
    public class MacroStorage
    {
        private readonly string _macrosFilePath;

        public MacroStorage(string macrosFilePath = "Data/macros.json")
        {
            _macrosFilePath = macrosFilePath;
        }

        /// <summary>
        /// Charge toutes les macros depuis le fichier
        /// </summary>
        public async Task<List<Macro>> LoadMacrosAsync()
        {
            try
            {
                if (!File.Exists(_macrosFilePath))
                {
                    return new List<Macro>();
                }

                string json = await File.ReadAllTextAsync(_macrosFilePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                var macrosData = JsonSerializer.Deserialize<List<MacroData>>(json, options);
                return macrosData?.Select(m => new Macro
                {
                    Id = m.Id,
                    Name = m.Name,
                    Description = m.Description,
                    Actions = m.Actions ?? new List<IInputAction>(),
                    IsEnabled = m.IsEnabled,
                    RepeatCount = m.RepeatCount,
                    DelayBetweenRepeats = m.DelayBetweenRepeats,
                    CreatedAt = m.CreatedAt,
                    ModifiedAt = m.ModifiedAt
                }).ToList() ?? new List<Macro>();
            }
            catch (Exception ex)
            {
                throw new Exception($"Erreur lors du chargement des macros: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Sauvegarde toutes les macros dans le fichier
        /// </summary>
        public async Task SaveMacrosAsync(List<Macro> macros)
        {
            try
            {
                var directory = Path.GetDirectoryName(_macrosFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var macrosData = macros.Select(m => new MacroData
                {
                    Id = m.Id,
                    Name = m.Name,
                    Description = m.Description,
                    Actions = m.Actions ?? new List<IInputAction>(),
                    IsEnabled = m.IsEnabled,
                    RepeatCount = m.RepeatCount,
                    DelayBetweenRepeats = m.DelayBetweenRepeats,
                    CreatedAt = m.CreatedAt,
                    ModifiedAt = m.ModifiedAt
                }).ToList();

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                string json = JsonSerializer.Serialize(macrosData, options);
                await File.WriteAllTextAsync(_macrosFilePath, json);
            }
            catch (Exception ex)
            {
                throw new Exception($"Erreur lors de la sauvegarde des macros: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Sauvegarde une macro spécifique (mise à jour si elle existe déjà)
        /// </summary>
        public async Task SaveMacroAsync(Macro macro)
        {
            var macros = await LoadMacrosAsync();
            var existingIndex = macros.FindIndex(m => m.Id == macro.Id);
            
            if (existingIndex >= 0)
            {
                macros[existingIndex] = macro;
            }
            else
            {
                macros.Add(macro);
            }

            await SaveMacrosAsync(macros);
        }

        private class MacroData
        {
            public string Id { get; set; }
            public string Name { get; set; }
            public string Description { get; set; }
            public List<IInputAction> Actions { get; set; }
            public bool IsEnabled { get; set; }
            public int RepeatCount { get; set; }
            public int DelayBetweenRepeats { get; set; }
            public DateTime CreatedAt { get; set; }
            public DateTime ModifiedAt { get; set; }
        }

        /// <summary>
        /// Convertisseur JSON personnalisé pour les actions d'entrée
        /// </summary>
        private class InputActionJsonConverter : JsonConverter<IInputAction>
        {
            public override IInputAction Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                using (JsonDocument doc = JsonDocument.ParseValue(ref reader))
                {
                    var root = doc.RootElement;
                    
                    // Détecter le type en fonction des propriétés présentes
                    if (root.TryGetProperty("VirtualKeyCode", out _))
                    {
                        return JsonSerializer.Deserialize<KeyboardAction>(root.GetRawText(), options);
                    }
                    else if (root.TryGetProperty("Duration", out _))
                    {
                        return JsonSerializer.Deserialize<DelayAction>(root.GetRawText(), options);
                    }
                    else if (root.TryGetProperty("ActionType", out var actionTypeProp))
                    {
                        // Pour MouseAction, vérifier si c'est un MouseActionType
                        var actionTypeStr = actionTypeProp.GetString();
                        if (actionTypeStr != null && Enum.TryParse<MouseActionType>(actionTypeStr, out _))
                        {
                            return JsonSerializer.Deserialize<MouseAction>(root.GetRawText(), options);
                        }
                    }
                    
                    throw new NotSupportedException($"Type d'action non reconnu dans le JSON");
                }
            }

            public override void Write(Utf8JsonWriter writer, IInputAction value, JsonSerializerOptions options)
            {
                // Sérialiser en utilisant le type réel de l'objet
                JsonSerializer.Serialize(writer, value, value.GetType(), options);
            }
        }
    }
}


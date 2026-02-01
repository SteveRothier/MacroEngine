using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Logging;

namespace MacroEngine.Core.Storage
{
    /// <summary>
    /// Service de sauvegarde et chargement des presets d'actions
    /// </summary>
    public class PresetStorage
    {
        private readonly string _presetsFilePath;
        private readonly ILogger? _logger;

        public PresetStorage(string presetsFilePath = "Data/presets.json", ILogger? logger = null)
        {
            _presetsFilePath = presetsFilePath;
            _logger = logger;
        }

        /// <summary>
        /// Charge tous les presets depuis le fichier
        /// </summary>
        public async Task<List<ActionPreset>> LoadPresetsAsync()
        {
            try
            {
                if (!File.Exists(_presetsFilePath))
                {
                    _logger?.Debug($"Fichier de presets introuvable: {_presetsFilePath}", "PresetStorage");
                    return new List<ActionPreset>();
                }

                _logger?.Debug($"Chargement des presets depuis {_presetsFilePath}", "PresetStorage");
                string json = await File.ReadAllTextAsync(_presetsFilePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                var presets = JsonSerializer.Deserialize<List<ActionPreset>>(json, options) ?? new List<ActionPreset>();
                
                _logger?.Info($"{presets.Count} preset(s) chargé(s) depuis {_presetsFilePath}", "PresetStorage");
                return presets;
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors du chargement des presets depuis {_presetsFilePath}", ex, "PresetStorage");
                return new List<ActionPreset>();
            }
        }

        /// <summary>
        /// Sauvegarde tous les presets dans le fichier
        /// </summary>
        public async Task SavePresetsAsync(List<ActionPreset> presets)
        {
            try
            {
                _logger?.Debug($"Sauvegarde de {presets?.Count ?? 0} preset(s) vers {_presetsFilePath}", "PresetStorage");
                var directory = Path.GetDirectoryName(_presetsFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                    _logger?.Debug($"Dossier créé: {directory}", "PresetStorage");
                }

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                string json = JsonSerializer.Serialize(presets ?? new List<ActionPreset>(), options);
                await File.WriteAllTextAsync(_presetsFilePath, json);
                _logger?.Info($"{(presets?.Count ?? 0)} preset(s) sauvegardé(s) avec succès vers {_presetsFilePath}", "PresetStorage");
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de la sauvegarde des presets vers {_presetsFilePath}", ex, "PresetStorage");
                throw new Exception($"Erreur lors de la sauvegarde des presets: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Ajoute un nouveau preset
        /// </summary>
        public async Task AddPresetAsync(ActionPreset preset)
        {
            var presets = await LoadPresetsAsync();
            presets.Add(preset);
            await SavePresetsAsync(presets);
        }

        /// <summary>
        /// Supprime un preset par son ID
        /// </summary>
        public async Task DeletePresetAsync(string presetId)
        {
            var presets = await LoadPresetsAsync();
            presets.RemoveAll(p => p.Id == presetId);
            await SavePresetsAsync(presets);
        }

        /// <summary>
        /// Met à jour un preset existant
        /// </summary>
        public async Task UpdatePresetAsync(ActionPreset preset)
        {
            var presets = await LoadPresetsAsync();
            var existingIndex = presets.FindIndex(p => p.Id == preset.Id);
            
            if (existingIndex >= 0)
            {
                presets[existingIndex] = preset;
                await SavePresetsAsync(presets);
            }
        }

        /// <summary>
        /// Convertisseur JSON personnalisé pour les actions d'entrée (copié de MacroStorage)
        /// </summary>
        private class InputActionJsonConverter : JsonConverter<IInputAction>
        {
            public override IInputAction Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                using (JsonDocument doc = JsonDocument.ParseValue(ref reader))
                {
                    var root = doc.RootElement;
                    
                    if (root.TryGetProperty("Type", out var typeProp))
                    {
                        int typeValue = typeProp.ValueKind == JsonValueKind.Number 
                            ? typeProp.GetInt32() 
                            : (int)Enum.Parse<InputActionType>(typeProp.GetString() ?? "Keyboard");
                        
                        var inputActionType = (InputActionType)typeValue;
                        
                        return inputActionType switch
                        {
                            InputActionType.Keyboard => JsonSerializer.Deserialize<KeyboardAction>(root.GetRawText(), options) 
                                ?? throw new InvalidOperationException("Impossible de désérialiser KeyboardAction"),
                            InputActionType.Mouse => JsonSerializer.Deserialize<MouseAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser MouseAction"),
                            InputActionType.Delay => JsonSerializer.Deserialize<DelayAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser DelayAction"),
                            InputActionType.Repeat => JsonSerializer.Deserialize<RepeatAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser RepeatAction"),
                            InputActionType.Condition => JsonSerializer.Deserialize<IfAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser IfAction"),
                            InputActionType.Text => JsonSerializer.Deserialize<TextAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser TextAction"),
                            InputActionType.Variable => JsonSerializer.Deserialize<VariableAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser VariableAction"),
                            _ => throw new NotSupportedException($"Type d'action non supporté: {inputActionType}")
                        };
                    }
                    
                    if (root.TryGetProperty("VirtualKeyCode", out _))
                    {
                        return JsonSerializer.Deserialize<KeyboardAction>(root.GetRawText(), options) 
                            ?? throw new InvalidOperationException("Impossible de désérialiser KeyboardAction");
                    }
                    else if (root.TryGetProperty("Duration", out _))
                    {
                        return JsonSerializer.Deserialize<DelayAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser DelayAction");
                    }
                    else if (root.TryGetProperty("Actions", out _) && (root.TryGetProperty("RepeatMode", out _) || root.TryGetProperty("RepeatCount", out _)))
                    {
                        return JsonSerializer.Deserialize<RepeatAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser RepeatAction");
                    }
                    else if (root.TryGetProperty("ThenActions", out _) || root.TryGetProperty("ElseActions", out _))
                    {
                        return JsonSerializer.Deserialize<IfAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser IfAction");
                    }
                    else if (root.TryGetProperty("X", out _) || root.TryGetProperty("Y", out _))
                    {
                        return JsonSerializer.Deserialize<MouseAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser MouseAction");
                    }
                    else if (root.TryGetProperty("Text", out _) || root.TryGetProperty("TypingSpeed", out _))
                    {
                        return JsonSerializer.Deserialize<TextAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser TextAction");
                    }
                    else if (root.TryGetProperty("VariableName", out _) || root.TryGetProperty("Operation", out _))
                    {
                        return JsonSerializer.Deserialize<VariableAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser VariableAction");
                    }
                    
                    throw new NotSupportedException($"Type d'action non reconnu dans le JSON");
                }
            }

            public override void Write(Utf8JsonWriter writer, IInputAction value, JsonSerializerOptions options)
            {
                JsonSerializer.Serialize(writer, value, value.GetType(), options);
            }
        }
    }

    /// <summary>
    /// Modèle représentant un preset d'action(s)
    /// </summary>
    public class ActionPreset
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<IInputAction> Actions { get; set; } = new List<IInputAction>();
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime ModifiedAt { get; set; } = DateTime.Now;
        
        /// <summary>
        /// Catégorie du preset (pour organiser les presets)
        /// </summary>
        public string Category { get; set; } = "Général";
    }
}

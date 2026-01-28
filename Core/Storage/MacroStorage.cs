using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Logging;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Storage
{
    /// <summary>
    /// Service de sauvegarde et chargement des macros
    /// </summary>
    public class MacroStorage
    {
        private readonly string _macrosFilePath;
        private readonly ILogger? _logger;

        public MacroStorage(string macrosFilePath = "Data/macros.json", ILogger? logger = null)
        {
            _macrosFilePath = macrosFilePath;
            _logger = logger;
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
                    _logger?.Debug($"Fichier de macros introuvable: {_macrosFilePath}", "MacroStorage");
                    return new List<Macro>();
                }

                _logger?.Debug($"Chargement des macros depuis {_macrosFilePath}", "MacroStorage");
                string json = await File.ReadAllTextAsync(_macrosFilePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                var macrosData = JsonSerializer.Deserialize<List<MacroData>>(json, options);
                var macros = macrosData?.Select(m => new Macro
                {
                    Id = m.Id,
                    Name = m.Name,
                    Description = m.Description,
                    Actions = m.Actions ?? new List<IInputAction>(),
                    IsEnabled = m.IsEnabled,
                    RepeatCount = m.RepeatCount,
                    DelayBetweenRepeats = m.DelayBetweenRepeats,
                    CreatedAt = m.CreatedAt,
                    ModifiedAt = m.ModifiedAt,
                    ShortcutKeyCode = m.ShortcutKeyCode,
                    TargetApplications = m.TargetApplications ?? new List<string>(),
                    AppTriggerMode = m.AppTriggerMode,
                    AutoExecuteOnFocus = m.AutoExecuteOnFocus
                }).ToList() ?? new List<Macro>();
                
                _logger?.Info($"{macros.Count} macro(s) chargée(s) depuis {_macrosFilePath}", "MacroStorage");
                return macros;
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors du chargement des macros depuis {_macrosFilePath}", ex, "MacroStorage");
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
                _logger?.Debug($"Sauvegarde de {macros?.Count ?? 0} macro(s) vers {_macrosFilePath}", "MacroStorage");
                var directory = Path.GetDirectoryName(_macrosFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                    _logger?.Debug($"Dossier créé: {directory}", "MacroStorage");
                }

                var macrosData = (macros ?? new List<Macro>()).Select(m => new MacroData
                {
                    Id = m.Id,
                    Name = m.Name,
                    Description = m.Description,
                    Actions = m.Actions ?? new List<IInputAction>(),
                    IsEnabled = m.IsEnabled,
                    RepeatCount = m.RepeatCount,
                    DelayBetweenRepeats = m.DelayBetweenRepeats,
                    CreatedAt = m.CreatedAt,
                    ModifiedAt = m.ModifiedAt,
                    ShortcutKeyCode = m.ShortcutKeyCode,
                    TargetApplications = m.TargetApplications ?? new List<string>(),
                    AppTriggerMode = m.AppTriggerMode,
                    AutoExecuteOnFocus = m.AutoExecuteOnFocus
                }).ToList();

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                string json = JsonSerializer.Serialize(macrosData, options);
                await File.WriteAllTextAsync(_macrosFilePath, json);
                _logger?.Info($"{(macros?.Count ?? 0)} macro(s) sauvegardée(s) avec succès vers {_macrosFilePath}", "MacroStorage");
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de la sauvegarde des macros vers {_macrosFilePath}", ex, "MacroStorage");
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

        /// <summary>
        /// Exporte une macro vers un fichier JSON
        /// </summary>
        public async Task ExportMacroAsync(Macro macro, string filePath)
        {
            try
            {
                _logger?.Info($"Export de la macro '{macro.Name}' vers {filePath}", "MacroStorage");
                var macroData = new MacroData
                {
                    Id = macro.Id,
                    Name = macro.Name,
                    Description = macro.Description,
                    Actions = macro.Actions ?? new List<IInputAction>(),
                    IsEnabled = macro.IsEnabled,
                    RepeatCount = macro.RepeatCount,
                    DelayBetweenRepeats = macro.DelayBetweenRepeats,
                    CreatedAt = macro.CreatedAt,
                    ModifiedAt = macro.ModifiedAt,
                    ShortcutKeyCode = macro.ShortcutKeyCode,
                    TargetApplications = macro.TargetApplications ?? new List<string>(),
                    AppTriggerMode = macro.AppTriggerMode,
                    AutoExecuteOnFocus = macro.AutoExecuteOnFocus
                };

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                string json = JsonSerializer.Serialize(macroData, options);
                await File.WriteAllTextAsync(filePath, json);
                _logger?.Info($"Macro '{macro.Name}' exportée avec succès vers {filePath}", "MacroStorage");
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de l'export de la macro '{macro.Name}' vers {filePath}", ex, "MacroStorage");
                throw new Exception($"Erreur lors de l'export de la macro: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Importe une macro depuis un fichier JSON
        /// </summary>
        public async Task<Macro> ImportMacroAsync(string filePath)
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    _logger?.Error($"Fichier introuvable lors de l'import: {filePath}", "MacroStorage");
                    throw new FileNotFoundException($"Le fichier '{filePath}' n'existe pas.");
                }

                _logger?.Info($"Import de la macro depuis {filePath}", "MacroStorage");
                string json = await File.ReadAllTextAsync(filePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true,
                    Converters = { new InputActionJsonConverter() }
                };

                var macroData = JsonSerializer.Deserialize<MacroData>(json, options);
                if (macroData == null)
                {
                    _logger?.Error($"Impossible de désérialiser la macro depuis {filePath}", "MacroStorage");
                    throw new Exception("Impossible de désérialiser la macro depuis le fichier JSON.");
                }

                // Générer un nouvel ID pour éviter les conflits
                var importedMacro = new Macro
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = macroData.Name,
                    Description = macroData.Description,
                    Actions = macroData.Actions ?? new List<IInputAction>(),
                    IsEnabled = macroData.IsEnabled,
                    RepeatCount = macroData.RepeatCount,
                    DelayBetweenRepeats = macroData.DelayBetweenRepeats,
                    CreatedAt = macroData.CreatedAt,
                    ModifiedAt = DateTime.Now,
                    ShortcutKeyCode = macroData.ShortcutKeyCode,
                    TargetApplications = macroData.TargetApplications ?? new List<string>(),
                    AppTriggerMode = macroData.AppTriggerMode,
                    AutoExecuteOnFocus = macroData.AutoExecuteOnFocus
                };

                _logger?.Info($"Macro '{importedMacro.Name}' importée avec succès depuis {filePath}", "MacroStorage");
                return importedMacro;
            }
            catch (Exception ex)
            {
                _logger?.Error($"Erreur lors de l'import de la macro depuis {filePath}", ex, "MacroStorage");
                throw new Exception($"Erreur lors de l'import de la macro: {ex.Message}", ex);
            }
        }

        private class MacroData
        {
            public string Id { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public List<IInputAction> Actions { get; set; } = new List<IInputAction>();
            public bool IsEnabled { get; set; }
            public int RepeatCount { get; set; }
            public int DelayBetweenRepeats { get; set; }
            public DateTime CreatedAt { get; set; }
            public DateTime ModifiedAt { get; set; }
            public int ShortcutKeyCode { get; set; } = 0;
            public List<string> TargetApplications { get; set; } = new List<string>();
            public AppTriggerMode AppTriggerMode { get; set; } = AppTriggerMode.Manual;
            public bool AutoExecuteOnFocus { get; set; } = false;
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
                    
                    // D'abord essayer de détecter par la propriété "Type" (InputActionType enum)
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
                                ?? throw new InvalidOperationException("Impossible de dÃ©sÃ©rialiser IfAction"),
                            InputActionType.Text => JsonSerializer.Deserialize<TextAction>(root.GetRawText(), options)
                                ?? throw new InvalidOperationException("Impossible de désérialiser TextAction"),
                            _ => throw new NotSupportedException($"Type d'action non supporté: {inputActionType}")
                        };
                    }
                    
                    // Fallback: détecter le type en fonction des propriétés présentes
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
                        // RepeatAction a une propriété Actions et RepeatMode/RepeatCount
                        return JsonSerializer.Deserialize<RepeatAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser RepeatAction");
                    }
                    else if (root.TryGetProperty("ThenActions", out _) || root.TryGetProperty("ElseActions", out _))
                    {
                        // IfAction a des propriÃ©tÃ©s ThenActions et ElseActions
                        return JsonSerializer.Deserialize<IfAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de dÃ©sÃ©rialiser IfAction");
                    }
                    else if (root.TryGetProperty("X", out _) || root.TryGetProperty("Y", out _))
                    {
                        // MouseAction a des propriétés X et Y
                        return JsonSerializer.Deserialize<MouseAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser MouseAction");
                    }
                    else if (root.TryGetProperty("Text", out _) || root.TryGetProperty("TypingSpeed", out _))
                    {
                        // TextAction a des propriétés Text et TypingSpeed
                        return JsonSerializer.Deserialize<TextAction>(root.GetRawText(), options)
                            ?? throw new InvalidOperationException("Impossible de désérialiser TextAction");
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


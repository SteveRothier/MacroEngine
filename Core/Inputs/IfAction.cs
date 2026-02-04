using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using MacroEngine.Core.Engine;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Action conditionnelle If/Then/Else
    /// </summary>
    public class IfAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "If";
        public InputActionType Type => InputActionType.Condition;

        /// <summary>
        /// Liste des conditions à évaluer (mode plat, utilisé si ConditionGroups est vide)
        /// </summary>
        public List<ConditionItem> Conditions { get; set; } = new List<ConditionItem>();

        /// <summary>
        /// Opérateurs logiques entre les conditions (AND/OR) — mode plat
        /// </summary>
        public List<LogicalOperator> Operators { get; set; } = new List<LogicalOperator>();

        /// <summary>
        /// Groupes de conditions : (A ET B) OU (C ET D). Chaque groupe est une liste de conditions en ET, les groupes sont en OU.
        /// Si non vide, utilisé à la place de Conditions/Operators.
        /// </summary>
        public List<ConditionGroup> ConditionGroups { get; set; } = new List<ConditionGroup>();

        /// <summary>
        /// Branches Else If (facultatif). Évaluées dans l'ordre si la condition principale est fausse.
        /// </summary>
        public List<ElseIfBranch> ElseIfBranches { get; set; } = new List<ElseIfBranch>();

        // Propriétés de compatibilité avec l'ancien format (pour la rétrocompatibilité)
        /// <summary>
        /// Type de condition (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public ConditionType ConditionType
        {
            get => Conditions.Count > 0 ? Conditions[0].ConditionType : ConditionType.Boolean;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = value });
                }
                else
                {
                    Conditions[0].ConditionType = value;
                }
            }
        }

        /// <summary>
        /// Condition booléenne simple (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public bool Condition
        {
            get => Conditions.Count > 0 && Conditions[0].ConditionType == ConditionType.Boolean ? Conditions[0].Condition : true;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.Boolean, Condition = value });
                }
                else if (Conditions[0].ConditionType == ConditionType.Boolean)
                {
                    Conditions[0].Condition = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Application active" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public ActiveApplicationCondition? ActiveApplicationConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].ActiveApplicationConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.ActiveApplication, ActiveApplicationConfig = value });
                }
                else
                {
                    Conditions[0].ActiveApplicationConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Touche clavier" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public KeyboardKeyCondition? KeyboardKeyConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].KeyboardKeyConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.KeyboardKey, KeyboardKeyConfig = value });
                }
                else
                {
                    Conditions[0].KeyboardKeyConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Processus ouvert" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public ProcessRunningCondition? ProcessRunningConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].ProcessRunningConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.ProcessRunning, ProcessRunningConfig = value });
                }
                else
                {
                    Conditions[0].ProcessRunningConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Pixel couleur" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public PixelColorCondition? PixelColorConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].PixelColorConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.PixelColor, PixelColorConfig = value });
                }
                else
                {
                    Conditions[0].PixelColorConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Position souris" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public MousePositionCondition? MousePositionConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].MousePositionConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.MousePosition, MousePositionConfig = value });
                }
                else
                {
                    Conditions[0].MousePositionConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Temps/Date" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public TimeDateCondition? TimeDateConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].TimeDateConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.TimeDate, TimeDateConfig = value });
                }
                else
                {
                    Conditions[0].TimeDateConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Image à l'écran" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public ImageOnScreenCondition? ImageOnScreenConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].ImageOnScreenConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.ImageOnScreen, ImageOnScreenConfig = value });
                }
                else
                {
                    Conditions[0].ImageOnScreenConfig = value;
                }
            }
        }

        /// <summary>
        /// Configuration pour condition "Texte à l'écran" (obsolète, utiliser Conditions)
        /// </summary>
        [System.Text.Json.Serialization.JsonIgnore]
        public TextOnScreenCondition? TextOnScreenConfig
        {
            get => Conditions.Count > 0 ? Conditions[0].TextOnScreenConfig : null;
            set
            {
                if (Conditions.Count == 0)
                {
                    Conditions.Add(new ConditionItem { ConditionType = ConditionType.TextOnScreen, TextOnScreenConfig = value });
                }
                else
                {
                    Conditions[0].TextOnScreenConfig = value;
                }
            }
        }

        /// <summary>
        /// Liste des actions à exécuter si la condition est vraie (Then)
        /// </summary>
        public List<IInputAction> ThenActions { get; set; } = new List<IInputAction>();

        /// <summary>
        /// Liste des actions à exécuter si la condition est fausse (Else)
        /// </summary>
        public List<IInputAction> ElseActions { get; set; } = new List<IInputAction>();

        public void Execute()
        {
            bool conditionResult = EvaluateCondition(out _);

            if (conditionResult)
            {
                ExecuteActions(ThenActions);
            }
            else
            {
                // Else If : tester chaque branche dans l'ordre
                bool elseIfMatched = false;
                if (ElseIfBranches != null)
                {
                    foreach (var branch in ElseIfBranches)
                    {
                        if (branch == null || branch.Conditions == null || branch.Conditions.Count == 0)
                            continue;
                        if (EvaluateBranch(branch, out _))
                        {
                            ExecuteActions(branch.Actions);
                            elseIfMatched = true;
                            break;
                        }
                    }
                }
                if (!elseIfMatched && ElseActions != null)
                {
                    foreach (var action in ElseActions)
                    {
                        if (action != null)
                            action.Execute();
                    }
                }
            }
        }

        private static void ExecuteActions(List<IInputAction>? actions)
        {
            if (actions == null) return;
            foreach (var action in actions)
            {
                if (action != null)
                    action.Execute();
            }
        }

        /// <summary>
        /// Évalue la condition principale (groupes OU mode plat). En mode debug, remplit ExecutionContext.ConditionDebugFailures.
        /// </summary>
        private bool EvaluateCondition(out List<string>? debugFailures)
        {
            debugFailures = null;
            var context = ExecutionContext.Current;
            if (context != null && context.ConditionDebugEnabled)
                context.ConditionDebugFailures.Clear();

            // Mode groupes : (G1) OU (G2) OU ... où chaque groupe = conditions en ET
            if (ConditionGroups != null && ConditionGroups.Count > 0)
            {
                bool anyGroupTrue = false;
                foreach (var group in ConditionGroups)
                {
                    if (group?.Conditions == null || group.Conditions.Count == 0) continue;
                    bool groupResult = true;
                    for (int j = 0; j < group.Conditions.Count; j++)
                    {
                        bool r = EvaluateConditionItem(group.Conditions[j]);
                        if (!r && context?.ConditionDebugEnabled == true)
                            context.ConditionDebugFailures.Add($"Groupe, condition: {GetConditionDescription(group.Conditions[j])}");
                        groupResult = groupResult && r;
                        if (!groupResult) break;
                    }
                    if (groupResult) { anyGroupTrue = true; break; }
                }
                if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                    debugFailures = context.ConditionDebugFailures;
                return anyGroupTrue;
            }

            // Mode plat (Conditions + Operators) ou compatibilité
            if (Conditions == null || Conditions.Count == 0)
            {
                bool r = ConditionType switch
                {
                    ConditionType.Boolean => Condition,
                    ConditionType.ActiveApplication => EvaluateActiveApplicationCondition(),
                    ConditionType.KeyboardKey => EvaluateKeyboardKeyCondition(),
                    ConditionType.ProcessRunning => EvaluateProcessRunningCondition(),
                    ConditionType.PixelColor => EvaluatePixelColorCondition(),
                    ConditionType.MousePosition => EvaluateMousePositionCondition(),
                    ConditionType.TimeDate => EvaluateTimeDateCondition(),
                    ConditionType.ImageOnScreen => EvaluateImageOnScreenCondition(),
                    ConditionType.TextOnScreen => EvaluateTextOnScreenCondition(),
                    _ => Condition
                };
                if (!r && context?.ConditionDebugEnabled == true)
                    context.ConditionDebugFailures.Add("Condition principale (ancien format)");
                if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                    debugFailures = context.ConditionDebugFailures;
                return r;
            }

            if (Conditions.Count == 1)
            {
                bool r = EvaluateConditionItem(Conditions[0]);
                if (!r && context?.ConditionDebugEnabled == true)
                    context.ConditionDebugFailures.Add(GetConditionDescription(Conditions[0]));
                if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                    debugFailures = context.ConditionDebugFailures;
                return r;
            }

            var results = new List<bool>();
            for (int i = 0; i < Conditions.Count; i++)
            {
                bool r = EvaluateConditionItem(Conditions[i]);
                if (!r && context?.ConditionDebugEnabled == true)
                    context.ConditionDebugFailures.Add($"Condition {i + 1}: {GetConditionDescription(Conditions[i])}");
                results.Add(r);
            }

            bool result = results[0];
            for (int i = 0; i < Operators.Count && i < results.Count - 1; i++)
            {
                bool nextResult = results[i + 1];
                result = Operators[i] == LogicalOperator.AND ? (result && nextResult) : (result || nextResult);
            }
            if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                debugFailures = context.ConditionDebugFailures;
            return result;
        }

        /// <summary>
        /// Évalue une branche Else If (Conditions + Operators en mode plat). Utilisé par le moteur pour l'exécution asynchrone.
        /// </summary>
        public bool EvaluateElseIfBranch(ElseIfBranch branch)
        {
            return EvaluateBranch(branch, out _);
        }

        /// <summary>
        /// Évalue une branche Else If (supporte les groupes et le mode plat).
        /// </summary>
        private bool EvaluateBranch(ElseIfBranch branch, out List<string>? debugFailures)
        {
            debugFailures = null;
            var context = ExecutionContext.Current;
            
            // Mode groupes : (G1) OU (G2) OU ... où chaque groupe = conditions en ET
            if (branch.ConditionGroups != null && branch.ConditionGroups.Count > 0)
            {
                bool anyGroupTrue = false;
                foreach (var group in branch.ConditionGroups)
                {
                    if (group?.Conditions == null || group.Conditions.Count == 0) continue;
                    bool groupResult = true;
                    for (int j = 0; j < group.Conditions.Count; j++)
                    {
                        bool r = EvaluateConditionItem(group.Conditions[j]);
                        if (!r && context?.ConditionDebugEnabled == true)
                            context.ConditionDebugFailures.Add($"Else If Groupe, condition: {GetConditionDescription(group.Conditions[j])}");
                        groupResult = groupResult && r;
                        if (!groupResult) break;
                    }
                    if (groupResult) { anyGroupTrue = true; break; }
                }
                if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                    debugFailures = context.ConditionDebugFailures;
                return anyGroupTrue;
            }
            
            // Mode plat (Conditions + Operators)
            if (branch.Conditions == null || branch.Conditions.Count == 0) return false;
            if (branch.Conditions.Count == 1)
            {
                bool r = EvaluateConditionItem(branch.Conditions[0]);
                if (!r && context?.ConditionDebugEnabled == true)
                    context.ConditionDebugFailures.Add($"Else If: {GetConditionDescription(branch.Conditions[0])}");
                if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                    debugFailures = context.ConditionDebugFailures;
                return r;
            }
            
            var results = new List<bool>();
            for (int i = 0; i < branch.Conditions.Count; i++)
            {
                bool r = EvaluateConditionItem(branch.Conditions[i]);
                if (!r && context?.ConditionDebugEnabled == true)
                    context.ConditionDebugFailures.Add($"Else If condition {i + 1}: {GetConditionDescription(branch.Conditions[i])}");
                results.Add(r);
            }
            
            bool res = results[0];
            for (int i = 0; i < branch.Operators.Count && i < results.Count - 1; i++)
                res = branch.Operators[i] == LogicalOperator.AND ? (res && results[i + 1]) : (res || results[i + 1]);
            
            if (context?.ConditionDebugEnabled == true && context.ConditionDebugFailures.Count > 0)
                debugFailures = context.ConditionDebugFailures;
            return res;
        }

        private static string GetMouseClickConditionLabel(int clickType)
        {
            return clickType switch
            {
                0 => "Clic gauche",
                1 => "Clic droit",
                2 => "Clic milieu",
                3 => "Maintenir gauche",
                4 => "Maintenir droit",
                5 => "Maintenir milieu",
                6 => "Molette haut",
                7 => "Molette bas",
                _ => "Clic gauche"
            };
        }

        /// <summary>
        /// Description courte d'une condition (pour le mode debug).
        /// </summary>
        private static string GetConditionDescription(ConditionItem condition)
        {
            if (condition == null) return "(vide)";
            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition ? "Vrai" : "Faux",
                ConditionType.ActiveApplication => condition.ActiveApplicationConfig != null && condition.ActiveApplicationConfig.ProcessNames != null && condition.ActiveApplicationConfig.ProcessNames.Count > 0
                    ? $"Application active: {string.Join(", ", condition.ActiveApplicationConfig.ProcessNames.Take(2))}"
                    : "Application active",
                ConditionType.KeyboardKey => condition.KeyboardKeyConfig != null && condition.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Touche clavier (VK {condition.KeyboardKeyConfig.VirtualKeyCode})"
                    : "Touche clavier",
                ConditionType.ProcessRunning => condition.ProcessRunningConfig != null && condition.ProcessRunningConfig.ProcessNames != null && condition.ProcessRunningConfig.ProcessNames.Count > 0
                    ? $"Processus ouvert: {string.Join(", ", condition.ProcessRunningConfig.ProcessNames.Take(2))}"
                    : "Processus ouvert",
                ConditionType.PixelColor => condition.PixelColorConfig != null
                    ? $"Pixel ({condition.PixelColorConfig.X},{condition.PixelColorConfig.Y}) = {condition.PixelColorConfig.ExpectedColor}"
                    : "Pixel couleur",
                ConditionType.MousePosition => condition.MousePositionConfig != null
                    ? $"Position souris zone ({condition.MousePositionConfig.X1},{condition.MousePositionConfig.Y1})-({condition.MousePositionConfig.X2},{condition.MousePositionConfig.Y2})"
                    : "Position souris",
                ConditionType.TimeDate => condition.TimeDateConfig != null
                    ? $"Temps/Date {condition.TimeDateConfig.ComparisonType} {condition.TimeDateConfig.Operator} {condition.TimeDateConfig.Value}"
                    : "Temps/Date",
                ConditionType.ImageOnScreen => condition.ImageOnScreenConfig != null && !string.IsNullOrEmpty(condition.ImageOnScreenConfig.ImagePath)
                    ? $"Image: {System.IO.Path.GetFileName(condition.ImageOnScreenConfig.ImagePath)}"
                    : "Image à l'écran",
                ConditionType.TextOnScreen => condition.TextOnScreenConfig != null && !string.IsNullOrEmpty(condition.TextOnScreenConfig.Text)
                    ? $"Texte à l'écran: \"{condition.TextOnScreenConfig.Text.Substring(0, Math.Min(15, condition.TextOnScreenConfig.Text.Length))}\"..."
                    : "Texte à l'écran",
                ConditionType.Variable => !string.IsNullOrEmpty(condition.VariableName) ? $"Variable \"{condition.VariableName}\"" : "Variable",
                ConditionType.MouseClick => condition.MouseClickConfig != null
                    ? GetMouseClickConditionLabel(condition.MouseClickConfig.ClickType)
                    : "Clic",
                _ => condition.ConditionType.ToString()
            };
        }

        /// <summary>
        /// Évalue une condition individuelle
        /// </summary>
        private bool EvaluateConditionItem(ConditionItem condition)
        {
            if (condition == null)
                return false;

            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition,
                ConditionType.ActiveApplication => EvaluateActiveApplicationCondition(condition.ActiveApplicationConfig),
                ConditionType.KeyboardKey => EvaluateKeyboardKeyCondition(condition.KeyboardKeyConfig),
                ConditionType.ProcessRunning => EvaluateProcessRunningCondition(condition.ProcessRunningConfig),
                ConditionType.PixelColor => EvaluatePixelColorCondition(condition.PixelColorConfig),
                ConditionType.MousePosition => EvaluateMousePositionCondition(condition.MousePositionConfig),
                ConditionType.TimeDate => EvaluateTimeDateCondition(condition.TimeDateConfig),
                ConditionType.ImageOnScreen => EvaluateImageOnScreenCondition(condition.ImageOnScreenConfig),
                ConditionType.TextOnScreen => EvaluateTextOnScreenCondition(condition.TextOnScreenConfig),
                ConditionType.Variable => EvaluateVariableCondition(condition.VariableName),
                ConditionType.MouseClick => EvaluateMouseClickCondition(condition.MouseClickConfig),
                _ => false
            };
        }

        /// <summary>
        /// Évalue la condition "Clic souris" (bouton pressé ou molette récente).
        /// ClickType: 0-2 = clic gauche/droit/milieu, 3-5 = maintenir gauche/droit/milieu, 6 = molette haut, 7 = molette bas.
        /// </summary>
        private bool EvaluateMouseClickCondition(MouseClickCondition? config)
        {
            if (config == null) return false;
            if (config.ClickType == 6)
                return MouseWheelState.WasWheelUp();
            if (config.ClickType == 7)
                return MouseWheelState.WasWheelDown();
            int vKey = config.ClickType switch
            {
                0 => 0x01, // Clic gauche
                1 => 0x02, // Clic droit
                2 => 0x04, // Clic milieu
                3 => 0x01, // Maintenir gauche
                4 => 0x02, // Maintenir droit
                5 => 0x04, // Maintenir milieu
                _ => 0x01
            };
            return IsKeyPressed((ushort)vKey);
        }

        /// <summary>
        /// Évalue la condition "Variable" (valeur d'une variable du contexte d'exécution).
        /// </summary>
        private bool EvaluateVariableCondition(string? variableName)
        {
            if (string.IsNullOrWhiteSpace(variableName))
                return false;
            var store = ExecutionContext.Current?.Variables;
            if (store == null)
                return false;
            return store.GetBoolean(variableName.Trim());
        }

        /// <summary>
        /// Retourne le résultat de l'évaluation de la condition au moment de l'exécution (pour le moteur).
        /// En mode debug, remplit ExecutionContext.ConditionDebugFailures avec les conditions qui ont échoué.
        /// </summary>
        public bool GetConditionResult()
        {
            return EvaluateCondition(out _);
        }

        /// <summary>
        /// Évalue la condition "Application active"
        /// </summary>
        private bool EvaluateActiveApplicationCondition(ActiveApplicationCondition? config = null)
        {
            var configToUse = config ?? ActiveApplicationConfig;
            if (configToUse == null || 
                configToUse.ProcessNames == null || 
                configToUse.ProcessNames.Count == 0)
            {
                // Compatibilité avec l'ancien format (un seul processus)
                if (!string.IsNullOrEmpty(configToUse?.ProcessName))
                {
                    return EvaluateSingleProcess(configToUse.ProcessName, configToUse);
                }
                return false;
            }

            try
            {
                // Vérifier si au moins un des processus sélectionnés correspond
                foreach (var processName in configToUse.ProcessNames)
                {
                    if (EvaluateSingleProcess(processName, configToUse))
                        return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue si un processus spécifique correspond à la condition
        /// </summary>
        private bool EvaluateSingleProcess(string processName, ActiveApplicationCondition? config = null)
        {
            if (string.IsNullOrEmpty(processName))
                return false;

            var configToUse = config ?? ActiveApplicationConfig;
            if (configToUse == null)
                return false;

            try
            {
                var processes = System.Diagnostics.Process.GetProcessesByName(processName);
                if (processes.Length == 0)
                    return false;

                if (configToUse.AnyWindow)
                    return true; // Peu importe la fenêtre active, le processus existe

                // Vérifier si une fenêtre du processus est active
                var activeWindow = GetForegroundWindow();
                foreach (var process in processes)
                {
                    if (process.MainWindowHandle == activeWindow)
                    {
                        if (!string.IsNullOrEmpty(configToUse.WindowTitle))
                        {
                            var title = process.MainWindowTitle;
                            return configToUse.TitleMatchMode switch
                            {
                                TextMatchMode.Exact => title == configToUse.WindowTitle,
                                TextMatchMode.Contains => title.Contains(configToUse.WindowTitle, StringComparison.OrdinalIgnoreCase),
                                _ => true
                            };
                        }
                        return true;
                    }
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Touche clavier"
        /// </summary>
        private bool EvaluateKeyboardKeyCondition(KeyboardKeyCondition? config = null)
        {
            var configToUse = config ?? KeyboardKeyConfig;
            if (configToUse == null || configToUse.VirtualKeyCode == 0)
                return false;

            try
            {
                bool keyPressed = IsKeyPressed(configToUse.VirtualKeyCode);
                
                // Vérifier les modificateurs
                if (configToUse.RequireCtrl && !IsKeyPressed(0x11)) // VK_CONTROL
                    return false;
                if (configToUse.RequireAlt && !IsKeyPressed(0x12)) // VK_MENU
                    return false;
                if (configToUse.RequireShift && !IsKeyPressed(0x10)) // VK_SHIFT
                    return false;

                return keyPressed;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Processus ouvert"
        /// </summary>
        private bool EvaluateProcessRunningCondition(ProcessRunningCondition? config = null)
        {
            var configToUse = config ?? ProcessRunningConfig;
            if (configToUse == null || 
                configToUse.ProcessNames == null || 
                configToUse.ProcessNames.Count == 0)
            {
                // Compatibilité avec l'ancien format (un seul processus)
                if (!string.IsNullOrEmpty(configToUse?.ProcessName))
                {
                    return EvaluateSingleProcessRunning(configToUse.ProcessName);
                }
                return false;
            }

            try
            {
                // Vérifier si au moins un des processus sélectionnés est ouvert
                foreach (var processName in configToUse.ProcessNames)
                {
                    if (EvaluateSingleProcessRunning(processName))
                        return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue si un processus spécifique est ouvert
        /// </summary>
        private bool EvaluateSingleProcessRunning(string processName)
        {
            if (string.IsNullOrEmpty(processName))
                return false;

            try
            {
                var processes = System.Diagnostics.Process.GetProcessesByName(processName);
                return processes.Length > 0;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Pixel couleur"
        /// </summary>
        private bool EvaluatePixelColorCondition(PixelColorCondition? config = null)
        {
            var configToUse = config ?? PixelColorConfig;
            if (configToUse == null)
                return false;

            try
            {
                return Core.Services.ConditionEvaluationService.Instance.EvaluatePixelColor(
                    configToUse.X,
                    configToUse.Y,
                    configToUse.ExpectedColor,
                    configToUse.Tolerance,
                    configToUse.MatchMode
                );
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Position souris"
        /// </summary>
        private bool EvaluateMousePositionCondition(MousePositionCondition? config = null)
        {
            var configToUse = config ?? MousePositionConfig;
            if (configToUse == null)
                return false;

            try
            {
                var pos = System.Windows.Forms.Control.MousePosition;
                int x = pos.X;
                int y = pos.Y;

                int x1 = Math.Min(configToUse.X1, configToUse.X2);
                int x2 = Math.Max(configToUse.X1, configToUse.X2);
                int y1 = Math.Min(configToUse.Y1, configToUse.Y2);
                int y2 = Math.Max(configToUse.Y1, configToUse.Y2);

                return x >= x1 && x <= x2 && y >= y1 && y <= y2;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Temps/Date"
        /// </summary>
        private bool EvaluateTimeDateCondition(TimeDateCondition? config = null)
        {
            var configToUse = config ?? TimeDateConfig;
            if (configToUse == null)
                return false;

            try
            {
                var now = DateTime.Now;
                int currentValue = configToUse.ComparisonType switch
                {
                    "Hour" => now.Hour,
                    "Minute" => now.Minute,
                    "Day" => (int)now.DayOfWeek, // 0=Dimanche, 1=Lundi, ..., 6=Samedi
                    "Month" => now.Month,
                    "Year" => now.Year,
                    _ => 0
                };

                return configToUse.Operator switch
                {
                    TimeComparisonOperator.Equals => currentValue == configToUse.Value,
                    TimeComparisonOperator.GreaterThan => currentValue > configToUse.Value,
                    TimeComparisonOperator.LessThan => currentValue < configToUse.Value,
                    TimeComparisonOperator.GreaterThanOrEqual => currentValue >= configToUse.Value,
                    TimeComparisonOperator.LessThanOrEqual => currentValue <= configToUse.Value,
                    _ => false
                };
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Image à l'écran"
        /// </summary>
        private bool EvaluateImageOnScreenCondition(ImageOnScreenCondition? config = null)
        {
            var configToUse = config ?? ImageOnScreenConfig;
            if (configToUse == null || string.IsNullOrEmpty(configToUse.ImagePath))
                return false;

            try
            {
                var task = Core.Services.ConditionEvaluationService.Instance.EvaluateImageOnScreenAsync(
                    configToUse.ImagePath,
                    configToUse.Sensitivity,
                    configToUse.SearchArea
                );
                
                // Attendre avec timeout de 2 secondes
                if (task.Wait(TimeSpan.FromSeconds(2)))
                {
                    return task.Result;
                }
                
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Évalue la condition "Texte à l'écran"
        /// </summary>
        private bool EvaluateTextOnScreenCondition(TextOnScreenCondition? config = null)
        {
            var configToUse = config ?? TextOnScreenConfig;
            if (configToUse == null || string.IsNullOrEmpty(configToUse.Text))
                return false;

            try
            {
                var task = Core.Services.ConditionEvaluationService.Instance.EvaluateTextOnScreenAsync(
                    configToUse.Text,
                    configToUse.SearchArea
                );
                
                // Attendre avec timeout de 3 secondes
                if (task.Wait(TimeSpan.FromSeconds(3)))
                {
                    return task.Result;
                }
                
                return false;
            }
            catch
            {
                return false;
            }
        }

        // Helpers pour les conditions
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        private bool IsKeyPressed(ushort virtualKeyCode)
        {
            return (GetAsyncKeyState(virtualKeyCode) & 0x8000) != 0;
        }

        public IInputAction Clone()
        {
            var cloned = new IfAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                Conditions = this.Conditions?.Select(c => CloneConditionItem(c)).ToList() ?? new List<ConditionItem>(),
                Operators = this.Operators?.ToList() ?? new List<LogicalOperator>(),
                ConditionGroups = this.ConditionGroups?.Select(g => new ConditionGroup
                {
                    Conditions = g.Conditions?.Select(c => CloneConditionItem(c)).ToList() ?? new List<ConditionItem>()
                }).ToList() ?? new List<ConditionGroup>(),
                ElseIfBranches = this.ElseIfBranches?.Select(b => new ElseIfBranch
                {
                    Conditions = b.Conditions?.Select(c => CloneConditionItem(c)).ToList() ?? new List<ConditionItem>(),
                    Operators = b.Operators?.ToList() ?? new List<LogicalOperator>(),
                    Actions = b.Actions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>()
                }).ToList() ?? new List<ElseIfBranch>(),
                ThenActions = this.ThenActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>(),
                ElseActions = this.ElseActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>()
            };

            // Si Conditions est vide mais que les anciennes propriétés sont définies, créer une ConditionItem pour compatibilité
            if (cloned.Conditions.Count == 0 && ConditionType != ConditionType.Boolean)
            {
                cloned.Conditions.Add(new ConditionItem
                {
                    ConditionType = this.ConditionType,
                    Condition = this.Condition,
                    ActiveApplicationConfig = this.ActiveApplicationConfig != null ? new ActiveApplicationCondition
                    {
                        ProcessNames = this.ActiveApplicationConfig.ProcessNames != null 
                            ? new List<string>(this.ActiveApplicationConfig.ProcessNames)
                            : new List<string>(),
                        WindowTitle = this.ActiveApplicationConfig.WindowTitle,
                        TitleMatchMode = this.ActiveApplicationConfig.TitleMatchMode,
                        AnyWindow = this.ActiveApplicationConfig.AnyWindow
                    } : null,
                    KeyboardKeyConfig = this.KeyboardKeyConfig != null ? new KeyboardKeyCondition
                    {
                        VirtualKeyCode = this.KeyboardKeyConfig.VirtualKeyCode,
                        State = this.KeyboardKeyConfig.State,
                        RequireCtrl = this.KeyboardKeyConfig.RequireCtrl,
                        RequireAlt = this.KeyboardKeyConfig.RequireAlt,
                        RequireShift = this.KeyboardKeyConfig.RequireShift
                    } : null,
                    ProcessRunningConfig = this.ProcessRunningConfig != null ? new ProcessRunningCondition
                    {
                        ProcessNames = this.ProcessRunningConfig.ProcessNames != null 
                            ? new List<string>(this.ProcessRunningConfig.ProcessNames)
                            : new List<string>(),
                        AnyWindow = this.ProcessRunningConfig.AnyWindow
                    } : null,
                    PixelColorConfig = this.PixelColorConfig != null ? new PixelColorCondition
                    {
                        X = this.PixelColorConfig.X,
                        Y = this.PixelColorConfig.Y,
                        ExpectedColor = this.PixelColorConfig.ExpectedColor,
                        Tolerance = this.PixelColorConfig.Tolerance,
                        MatchMode = this.PixelColorConfig.MatchMode
                    } : null,
                    MousePositionConfig = this.MousePositionConfig != null ? new MousePositionCondition
                    {
                        X1 = this.MousePositionConfig.X1,
                        Y1 = this.MousePositionConfig.Y1,
                        X2 = this.MousePositionConfig.X2,
                        Y2 = this.MousePositionConfig.Y2
                    } : null,
                    TimeDateConfig = this.TimeDateConfig != null ? new TimeDateCondition
                    {
                        ComparisonType = this.TimeDateConfig.ComparisonType,
                        Operator = this.TimeDateConfig.Operator,
                        Value = this.TimeDateConfig.Value
                    } : null,
                    ImageOnScreenConfig = this.ImageOnScreenConfig != null ? new ImageOnScreenCondition
                    {
                        ImagePath = this.ImageOnScreenConfig.ImagePath,
                        Sensitivity = this.ImageOnScreenConfig.Sensitivity,
                        SearchArea = this.ImageOnScreenConfig.SearchArea?.ToArray()
                    } : null,
                    TextOnScreenConfig = this.TextOnScreenConfig != null ? new TextOnScreenCondition
                    {
                        Text = this.TextOnScreenConfig.Text,
                        SearchArea = this.TextOnScreenConfig.SearchArea?.ToArray()
                    } : null
                });
            }

            return cloned;
        }

        /// <summary>
        /// Clone une ConditionItem
        /// </summary>
        private ConditionItem CloneConditionItem(ConditionItem item)
        {
            if (item == null)
                return new ConditionItem();

            return new ConditionItem
            {
                ConditionType = item.ConditionType,
                Condition = item.Condition,
                ActiveApplicationConfig = item.ActiveApplicationConfig != null ? new ActiveApplicationCondition
                {
                    ProcessNames = item.ActiveApplicationConfig.ProcessNames != null 
                        ? new List<string>(item.ActiveApplicationConfig.ProcessNames)
                        : new List<string>(),
                    WindowTitle = item.ActiveApplicationConfig.WindowTitle,
                    TitleMatchMode = item.ActiveApplicationConfig.TitleMatchMode,
                    AnyWindow = item.ActiveApplicationConfig.AnyWindow
                } : null,
                KeyboardKeyConfig = item.KeyboardKeyConfig != null ? new KeyboardKeyCondition
                {
                    VirtualKeyCode = item.KeyboardKeyConfig.VirtualKeyCode,
                    State = item.KeyboardKeyConfig.State,
                    RequireCtrl = item.KeyboardKeyConfig.RequireCtrl,
                    RequireAlt = item.KeyboardKeyConfig.RequireAlt,
                    RequireShift = item.KeyboardKeyConfig.RequireShift
                } : null,
                ProcessRunningConfig = item.ProcessRunningConfig != null ? new ProcessRunningCondition
                {
                    ProcessNames = item.ProcessRunningConfig.ProcessNames != null 
                        ? new List<string>(item.ProcessRunningConfig.ProcessNames)
                        : new List<string>(),
                    AnyWindow = item.ProcessRunningConfig.AnyWindow
                } : null,
                PixelColorConfig = item.PixelColorConfig != null ? new PixelColorCondition
                {
                    X = item.PixelColorConfig.X,
                    Y = item.PixelColorConfig.Y,
                    ExpectedColor = item.PixelColorConfig.ExpectedColor,
                    Tolerance = item.PixelColorConfig.Tolerance,
                    MatchMode = item.PixelColorConfig.MatchMode
                } : null,
                MousePositionConfig = item.MousePositionConfig != null ? new MousePositionCondition
                {
                    X1 = item.MousePositionConfig.X1,
                    Y1 = item.MousePositionConfig.Y1,
                    X2 = item.MousePositionConfig.X2,
                    Y2 = item.MousePositionConfig.Y2
                } : null,
                TimeDateConfig = item.TimeDateConfig != null ? new TimeDateCondition
                {
                    ComparisonType = item.TimeDateConfig.ComparisonType,
                    Operator = item.TimeDateConfig.Operator,
                    Value = item.TimeDateConfig.Value
                } : null,
                ImageOnScreenConfig = item.ImageOnScreenConfig != null ? new ImageOnScreenCondition
                {
                    ImagePath = item.ImageOnScreenConfig.ImagePath,
                    Sensitivity = item.ImageOnScreenConfig.Sensitivity,
                    SearchArea = item.ImageOnScreenConfig.SearchArea?.ToArray()
                } : null,
                TextOnScreenConfig = item.TextOnScreenConfig != null ? new TextOnScreenCondition
                {
                    Text = item.TextOnScreenConfig.Text,
                    SearchArea = item.TextOnScreenConfig.SearchArea?.ToArray()
                } : null,
                MouseClickConfig = item.MouseClickConfig != null ? new MouseClickCondition
                {
                    ClickType = item.MouseClickConfig.ClickType
                } : null,
                VariableName = item.VariableName
            };
        }
    }
}

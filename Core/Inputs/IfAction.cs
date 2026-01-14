using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

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
        /// Type de condition
        /// </summary>
        public ConditionType ConditionType { get; set; } = ConditionType.Boolean;

        /// <summary>
        /// Condition booléenne simple (pour ConditionType.Boolean)
        /// </summary>
        public bool Condition { get; set; } = true;

        /// <summary>
        /// Configuration pour condition "Application active"
        /// </summary>
        public ActiveApplicationCondition? ActiveApplicationConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Touche clavier"
        /// </summary>
        public KeyboardKeyCondition? KeyboardKeyConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Processus ouvert"
        /// </summary>
        public ProcessRunningCondition? ProcessRunningConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Pixel couleur"
        /// </summary>
        public PixelColorCondition? PixelColorConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Position souris"
        /// </summary>
        public MousePositionCondition? MousePositionConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Temps/Date"
        /// </summary>
        public TimeDateCondition? TimeDateConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Image à l'écran"
        /// </summary>
        public ImageOnScreenCondition? ImageOnScreenConfig { get; set; }

        /// <summary>
        /// Configuration pour condition "Texte à l'écran"
        /// </summary>
        public TextOnScreenCondition? TextOnScreenConfig { get; set; }

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
            bool conditionResult = EvaluateCondition();

            if (conditionResult)
            {
                // Exécuter les actions Then
                if (ThenActions != null)
                {
                    foreach (var action in ThenActions)
                    {
                        if (action != null)
                        {
                            action.Execute();
                        }
                    }
                }
            }
            else
            {
                // Exécuter les actions Else
                if (ElseActions != null)
                {
                    foreach (var action in ElseActions)
                    {
                        if (action != null)
                        {
                            action.Execute();
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Évalue la condition selon son type
        /// </summary>
        private bool EvaluateCondition()
        {
            return ConditionType switch
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
        }

        /// <summary>
        /// Évalue la condition "Application active"
        /// </summary>
        private bool EvaluateActiveApplicationCondition()
        {
            if (ActiveApplicationConfig == null || string.IsNullOrEmpty(ActiveApplicationConfig.ProcessName))
                return false;

            try
            {
                var processes = System.Diagnostics.Process.GetProcessesByName(ActiveApplicationConfig.ProcessName);
                if (processes.Length == 0)
                    return false;

                if (ActiveApplicationConfig.AnyWindow)
                    return true; // Peu importe la fenêtre active, le processus existe

                // Vérifier si une fenêtre du processus est active
                var activeWindow = GetForegroundWindow();
                foreach (var process in processes)
                {
                    if (process.MainWindowHandle == activeWindow)
                    {
                        if (!string.IsNullOrEmpty(ActiveApplicationConfig.WindowTitle))
                        {
                            var title = process.MainWindowTitle;
                            return ActiveApplicationConfig.TitleMatchMode switch
                            {
                                TextMatchMode.Exact => title == ActiveApplicationConfig.WindowTitle,
                                TextMatchMode.Contains => title.Contains(ActiveApplicationConfig.WindowTitle, StringComparison.OrdinalIgnoreCase),
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
        private bool EvaluateKeyboardKeyCondition()
        {
            if (KeyboardKeyConfig == null || KeyboardKeyConfig.VirtualKeyCode == 0)
                return false;

            try
            {
                bool keyPressed = IsKeyPressed(KeyboardKeyConfig.VirtualKeyCode);
                
                // Vérifier les modificateurs
                if (KeyboardKeyConfig.RequireCtrl && !IsKeyPressed(0x11)) // VK_CONTROL
                    return false;
                if (KeyboardKeyConfig.RequireAlt && !IsKeyPressed(0x12)) // VK_MENU
                    return false;
                if (KeyboardKeyConfig.RequireShift && !IsKeyPressed(0x10)) // VK_SHIFT
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
        private bool EvaluateProcessRunningCondition()
        {
            if (ProcessRunningConfig == null || string.IsNullOrEmpty(ProcessRunningConfig.ProcessName))
                return false;

            try
            {
                var processes = System.Diagnostics.Process.GetProcessesByName(ProcessRunningConfig.ProcessName);
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
        private bool EvaluatePixelColorCondition()
        {
            if (PixelColorConfig == null)
                return false;

            try
            {
                return Core.Services.ConditionEvaluationService.Instance.EvaluatePixelColor(
                    PixelColorConfig.X,
                    PixelColorConfig.Y,
                    PixelColorConfig.ExpectedColor,
                    PixelColorConfig.Tolerance,
                    PixelColorConfig.MatchMode
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
        private bool EvaluateMousePositionCondition()
        {
            if (MousePositionConfig == null)
                return false;

            try
            {
                var pos = System.Windows.Forms.Control.MousePosition;
                int x = pos.X;
                int y = pos.Y;

                int x1 = Math.Min(MousePositionConfig.X1, MousePositionConfig.X2);
                int x2 = Math.Max(MousePositionConfig.X1, MousePositionConfig.X2);
                int y1 = Math.Min(MousePositionConfig.Y1, MousePositionConfig.Y2);
                int y2 = Math.Max(MousePositionConfig.Y1, MousePositionConfig.Y2);

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
        private bool EvaluateTimeDateCondition()
        {
            if (TimeDateConfig == null)
                return false;

            try
            {
                var now = DateTime.Now;
                int currentValue = TimeDateConfig.ComparisonType switch
                {
                    "Hour" => now.Hour,
                    "Minute" => now.Minute,
                    "Day" => now.Day,
                    "Month" => now.Month,
                    "Year" => now.Year,
                    _ => 0
                };

                return TimeDateConfig.Operator switch
                {
                    TimeComparisonOperator.Equals => currentValue == TimeDateConfig.Value,
                    TimeComparisonOperator.GreaterThan => currentValue > TimeDateConfig.Value,
                    TimeComparisonOperator.LessThan => currentValue < TimeDateConfig.Value,
                    TimeComparisonOperator.GreaterThanOrEqual => currentValue >= TimeDateConfig.Value,
                    TimeComparisonOperator.LessThanOrEqual => currentValue <= TimeDateConfig.Value,
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
        private bool EvaluateImageOnScreenCondition()
        {
            if (ImageOnScreenConfig == null || string.IsNullOrEmpty(ImageOnScreenConfig.ImagePath))
                return false;

            try
            {
                var task = Core.Services.ConditionEvaluationService.Instance.EvaluateImageOnScreenAsync(
                    ImageOnScreenConfig.ImagePath,
                    ImageOnScreenConfig.Sensitivity,
                    ImageOnScreenConfig.SearchArea
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
        private bool EvaluateTextOnScreenCondition()
        {
            if (TextOnScreenConfig == null || string.IsNullOrEmpty(TextOnScreenConfig.Text))
                return false;

            try
            {
                var task = Core.Services.ConditionEvaluationService.Instance.EvaluateTextOnScreenAsync(
                    TextOnScreenConfig.Text,
                    TextOnScreenConfig.SearchArea
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
            return new IfAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = this.Name,
                ConditionType = this.ConditionType,
                Condition = this.Condition,
                ActiveApplicationConfig = this.ActiveApplicationConfig != null ? new ActiveApplicationCondition
                {
                    ProcessName = this.ActiveApplicationConfig.ProcessName,
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
                    ProcessName = this.ProcessRunningConfig.ProcessName,
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
                } : null,
                ThenActions = this.ThenActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>(),
                ElseActions = this.ElseActions?.Select(a => a?.Clone()).Where(a => a != null).Cast<IInputAction>().ToList() ?? new List<IInputAction>()
            };
        }
    }
}

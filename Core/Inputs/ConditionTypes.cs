using System;
using System.Collections.Generic;
using System.Linq;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Types de conditions disponibles pour IfAction
    /// </summary>
    public enum ConditionType
    {
        /// <summary>
        /// Condition booléenne simple (vrai/faux)
        /// </summary>
        Boolean,

        /// <summary>
        /// Si une application est active (fenêtre au premier plan)
        /// </summary>
        ActiveApplication,

        /// <summary>
        /// Si une touche clavier est pressée/maintenue
        /// </summary>
        KeyboardKey,

        /// <summary>
        /// Si un processus est ouvert
        /// </summary>
        ProcessRunning,

        /// <summary>
        /// Si un pixel à une position donnée a une couleur spécifique
        /// </summary>
        PixelColor,

        /// <summary>
        /// Si la souris est dans une zone spécifique
        /// </summary>
        MousePosition,

        /// <summary>
        /// Si une condition de temps/date est remplie
        /// </summary>
        TimeDate,

        /// <summary>
        /// Si une image est visible à l'écran
        /// </summary>
        ImageOnScreen,

        /// <summary>
        /// Si un texte est visible à l'écran
        /// </summary>
        TextOnScreen,

        /// <summary>
        /// Valeur d'une variable (nombre, texte ou booléen)
        /// </summary>
        Variable,

        /// <summary>
        /// Si un bouton de souris est pressé (clic gauche, droit, milieu)
        /// </summary>
        MouseClick
    }

    /// <summary>
    /// Configuration pour condition "Clic souris" (bouton pressé ou molette).
    /// </summary>
    public class MouseClickCondition
    {
        /// <summary>
        /// Type : 0 = Clic gauche, 1 = Clic droit, 2 = Clic milieu,
        /// 3 = Maintenir gauche, 4 = Maintenir droit, 5 = Maintenir milieu,
        /// 6 = Molette haut, 7 = Molette bas.
        /// </summary>
        public int ClickType { get; set; } = 0;
    }

    /// <summary>
    /// Mode de comparaison pour les conditions de texte
    /// </summary>
    public enum TextMatchMode
    {
        /// <summary>
        /// Correspondance exacte
        /// </summary>
        Exact,

        /// <summary>
        /// Contient le texte
        /// </summary>
        Contains
    }

    /// <summary>
    /// État d'une touche clavier
    /// </summary>
    public enum KeyState
    {
        /// <summary>
        /// Touche maintenue (pressée)
        /// </summary>
        Pressed,

        /// <summary>
        /// Touche appuyée (momentanément)
        /// </summary>
        PressedOnce
    }

    /// <summary>
    /// Mode de comparaison de couleur
    /// </summary>
    public enum ColorMatchMode
    {
        /// <summary>
        /// Mode RGB
        /// </summary>
        RGB,

        /// <summary>
        /// Mode HSV
        /// </summary>
        HSV
    }

    /// <summary>
    /// Opérateur de comparaison pour temps/date
    /// </summary>
    public enum TimeComparisonOperator
    {
        /// <summary>
        /// Égal à
        /// </summary>
        Equals,

        /// <summary>
        /// Supérieur à
        /// </summary>
        GreaterThan,

        /// <summary>
        /// Inférieur à
        /// </summary>
        LessThan,

        /// <summary>
        /// Supérieur ou égal à
        /// </summary>
        GreaterThanOrEqual,

        /// <summary>
        /// Inférieur ou égal à
        /// </summary>
        LessThanOrEqual
    }

    /// <summary>
    /// Configuration pour condition "Application active"
    /// </summary>
    public class ActiveApplicationCondition
    {
        /// <summary>
        /// Liste des noms de processus (multi-sélection)
        /// </summary>
        public List<string> ProcessNames { get; set; } = new List<string>();

        /// <summary>
        /// Titre de la fenêtre (optionnel)
        /// </summary>
        public string? WindowTitle { get; set; }

        /// <summary>
        /// Mode de correspondance pour le titre
        /// </summary>
        public TextMatchMode TitleMatchMode { get; set; } = TextMatchMode.Contains;

        /// <summary>
        /// Peu importe la fenêtre active (vérifie juste si le processus existe)
        /// </summary>
        public bool AnyWindow { get; set; } = false;

        // Propriété de compatibilité pour l'ancien format (un seul processus)
        [System.Text.Json.Serialization.JsonIgnore]
        public string ProcessName
        {
            get => ProcessNames.FirstOrDefault() ?? "";
            set
            {
                ProcessNames.Clear();
                if (!string.IsNullOrEmpty(value))
                    ProcessNames.Add(value);
            }
        }
    }

    /// <summary>
    /// Configuration pour condition "Touche clavier"
    /// </summary>
    public class KeyboardKeyCondition
    {
        /// <summary>
        /// Code virtuel de la touche
        /// </summary>
        public ushort VirtualKeyCode { get; set; } = 0;

        /// <summary>
        /// État de la touche (maintenue/appuyée)
        /// </summary>
        public KeyState State { get; set; } = KeyState.Pressed;

        /// <summary>
        /// Requiert Ctrl
        /// </summary>
        public bool RequireCtrl { get; set; } = false;

        /// <summary>
        /// Requiert Alt
        /// </summary>
        public bool RequireAlt { get; set; } = false;

        /// <summary>
        /// Requiert Shift
        /// </summary>
        public bool RequireShift { get; set; } = false;
    }

    /// <summary>
    /// Configuration pour condition "Processus ouvert"
    /// </summary>
    public class ProcessRunningCondition
    {
        /// <summary>
        /// Liste des noms de processus (multi-sélection)
        /// </summary>
        public List<string> ProcessNames { get; set; } = new List<string>();

        /// <summary>
        /// Peu importe la fenêtre active
        /// </summary>
        public bool AnyWindow { get; set; } = true;

        // Propriété de compatibilité pour l'ancien format (un seul processus)
        [System.Text.Json.Serialization.JsonIgnore]
        public string ProcessName
        {
            get => ProcessNames.FirstOrDefault() ?? "";
            set
            {
                ProcessNames.Clear();
                if (!string.IsNullOrEmpty(value))
                    ProcessNames.Add(value);
            }
        }
    }

    /// <summary>
    /// Configuration pour condition "Pixel couleur"
    /// </summary>
    public class PixelColorCondition
    {
        /// <summary>
        /// Coordonnée X du pixel
        /// </summary>
        public int X { get; set; } = 0;

        /// <summary>
        /// Coordonnée Y du pixel
        /// </summary>
        public int Y { get; set; } = 0;

        /// <summary>
        /// Couleur attendue (format hex: #FF0000)
        /// </summary>
        public string ExpectedColor { get; set; } = "#000000";

        /// <summary>
        /// Tolérance en pourcentage (0-100)
        /// </summary>
        public int Tolerance { get; set; } = 0;

        /// <summary>
        /// Mode de comparaison (RGB/HSV)
        /// </summary>
        public ColorMatchMode MatchMode { get; set; } = ColorMatchMode.RGB;
    }

    /// <summary>
    /// Configuration pour condition "Position souris"
    /// </summary>
    public class MousePositionCondition
    {
        /// <summary>
        /// Coordonnée X1 (coin supérieur gauche)
        /// </summary>
        public int X1 { get; set; } = 0;

        /// <summary>
        /// Coordonnée Y1 (coin supérieur gauche)
        /// </summary>
        public int Y1 { get; set; } = 0;

        /// <summary>
        /// Coordonnée X2 (coin inférieur droit)
        /// </summary>
        public int X2 { get; set; } = 0;

        /// <summary>
        /// Coordonnée Y2 (coin inférieur droit)
        /// </summary>
        public int Y2 { get; set; } = 0;
    }

    /// <summary>
    /// Configuration pour condition "Temps/Date"
    /// </summary>
    public class TimeDateCondition
    {
        /// <summary>
        /// Type de comparaison (heure, date, etc.)
        /// </summary>
        public string ComparisonType { get; set; } = "Hour"; // Hour, Minute, Day, Month, Year

        /// <summary>
        /// Opérateur de comparaison
        /// </summary>
        public TimeComparisonOperator Operator { get; set; } = TimeComparisonOperator.Equals;

        /// <summary>
        /// Valeur de comparaison
        /// </summary>
        public int Value { get; set; } = 0;
    }

    /// <summary>
    /// Configuration pour condition "Image à l'écran"
    /// </summary>
    public class ImageOnScreenCondition
    {
        /// <summary>
        /// Chemin vers l'image de référence
        /// </summary>
        public string ImagePath { get; set; } = "";

        /// <summary>
        /// Sensibilité en pourcentage (0-100)
        /// </summary>
        public int Sensitivity { get; set; } = 80;

        /// <summary>
        /// Zone de recherche (X1, Y1, X2, Y2) - null pour tout l'écran
        /// </summary>
        public int[]? SearchArea { get; set; } = null;
    }

    /// <summary>
    /// Configuration pour condition "Texte à l'écran"
    /// </summary>
    public class TextOnScreenCondition
    {
        /// <summary>
        /// Texte à rechercher
        /// </summary>
        public string Text { get; set; } = "";

        /// <summary>
        /// Zone de recherche (X1, Y1, X2, Y2) - null pour tout l'écran
        /// </summary>
        public int[]? SearchArea { get; set; } = null;
    }

    /// <summary>
    /// Opérateur logique pour combiner plusieurs conditions
    /// </summary>
    public enum LogicalOperator
    {
        /// <summary>
        /// ET logique (toutes les conditions doivent être vraies)
        /// </summary>
        AND,

        /// <summary>
        /// OU logique (au moins une condition doit être vraie)
        /// </summary>
        OR
    }

    /// <summary>
    /// Représente une condition individuelle avec sa configuration
    /// </summary>
    public class ConditionItem
    {
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
        /// Configuration pour condition "Clic souris"
        /// </summary>
        public MouseClickCondition? MouseClickConfig { get; set; }

        /// <summary>
        /// Nom de la variable (pour ConditionType.Variable) — valeur booléenne ou vérité (nombre != 0, texte non vide)
        /// </summary>
        public string? VariableName { get; set; }
    }

    /// <summary>
    /// Groupe de conditions liées par AND.
    /// Exemple: Groupe1 = (A AND B), Groupe2 = (C AND D)
    /// Les groupes sont ensuite combinés avec OR: Groupe1 OR Groupe2 = (A AND B) OR (C AND D)
    /// </summary>
    public class ConditionGroup
    {
        /// <summary>
        /// Liste des conditions dans ce groupe (toutes liées par AND)
        /// </summary>
        public List<ConditionItem> Conditions { get; set; } = new List<ConditionItem>();

        /// <summary>
        /// Nom du groupe (optionnel, pour l'UI)
        /// </summary>
        public string? Name { get; set; }
    }

    /// <summary>
    /// Représente une branche Else If avec sa condition et ses actions
    /// </summary>
    public class ElseIfBranch
    {
        /// <summary>
        /// Groupes de conditions pour ce Else If (évalués avec OR entre les groupes, AND dans chaque groupe)
        /// Si non vide, utilisé à la place de Conditions/Operators
        /// </summary>
        public List<ConditionGroup> ConditionGroups { get; set; } = new List<ConditionGroup>();

        /// <summary>
        /// Conditions (mode plat, pour rétrocompatibilité). Utilisé si ConditionGroups est vide.
        /// </summary>
        public List<ConditionItem> Conditions { get; set; } = new List<ConditionItem>();

        /// <summary>
        /// Opérateurs logiques entre les conditions (mode plat, pour rétrocompatibilité)
        /// </summary>
        public List<LogicalOperator> Operators { get; set; } = new List<LogicalOperator>();

        /// <summary>
        /// Actions à exécuter si cette condition Else If est vraie
        /// </summary>
        public List<IInputAction> Actions { get; set; } = new List<IInputAction>();
    }
}

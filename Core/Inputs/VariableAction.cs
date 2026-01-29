using System;
using System.Globalization;
using System.Text.RegularExpressions;
using MacroEngine.Core.Engine;

namespace MacroEngine.Core.Inputs
{
    /// <summary>
    /// Type de variable (nombre, texte, booléen)
    /// </summary>
    public enum VariableType
    {
        Number,
        Text,
        Boolean
    }

    /// <summary>
    /// Opération à effectuer sur la variable
    /// </summary>
    public enum VariableOperation
    {
        /// <summary>Définir la valeur</summary>
        Set,
        /// <summary>Incrémenter (Number)</summary>
        Increment,
        /// <summary>Décrémenter (Number)</summary>
        Decrement,
        /// <summary>Inverser (Boolean)</summary>
        Toggle,
        /// <summary>Évaluer une expression (ex: counter + 1)</summary>
        EvaluateExpression
    }

    /// <summary>
    /// Action permettant de créer, modifier et utiliser des variables dans les macros.
    /// </summary>
    public class VariableAction : IInputAction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "Variable";
        public InputActionType Type => InputActionType.Variable;

        /// <summary>Nom de la variable</summary>
        public string VariableName { get; set; } = "";

        /// <summary>Type de la variable</summary>
        public VariableType VariableType { get; set; } = VariableType.Number;

        /// <summary>Opération à effectuer</summary>
        public VariableOperation Operation { get; set; } = VariableOperation.Set;

        /// <summary>Valeur ou expression (ex: "0", "counter + 1", "true")</summary>
        public string Value { get; set; } = "";

        /// <summary>Pas pour Incrémenter/Décrémenter (défaut 1)</summary>
        public double Step { get; set; } = 1;

        public void Execute()
        {
            var store = ExecutionContext.Current?.Variables;
            if (store == null)
                return;

            string name = NormalizeVariableName(VariableName);
            if (string.IsNullOrEmpty(name))
                return;

            switch (Operation)
            {
                case VariableOperation.Set:
                    SetValue(store, name);
                    break;
                case VariableOperation.Increment:
                    IncrementValue(store, name);
                    break;
                case VariableOperation.Decrement:
                    DecrementValue(store, name);
                    break;
                case VariableOperation.Toggle:
                    ToggleValue(store, name);
                    break;
                case VariableOperation.EvaluateExpression:
                    EvaluateAndSet(store, name);
                    break;
            }
        }

        private void SetValue(MacroVariableStore store, string name)
        {
            switch (VariableType)
            {
                case VariableType.Number:
                    if (double.TryParse(Value?.Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double n))
                        store.SetNumber(name, n);
                    break;
                case VariableType.Text:
                    store.SetText(name, Value ?? "");
                    break;
                case VariableType.Boolean:
                    store.SetBoolean(name, ParseBool(Value));
                    break;
            }
        }

        private void IncrementValue(MacroVariableStore store, string name)
        {
            double current = store.GetNumber(name);
            double step = Step;
            if (double.IsNaN(step) || double.IsInfinity(step)) step = 1;
            store.SetNumber(name, current + step);
        }

        private void DecrementValue(MacroVariableStore store, string name)
        {
            double current = store.GetNumber(name);
            double step = Step;
            if (double.IsNaN(step) || double.IsInfinity(step)) step = 1;
            store.SetNumber(name, current - step);
        }

        private static string NormalizeVariableName(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            value = value.Trim();
            if (value.Length == 0) return "";
            var normalized = new System.Text.StringBuilder();
            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                if (char.IsLetterOrDigit(c) || c == '_')
                    normalized.Append(c);
                else if (c == ' ' && normalized.Length > 0 && i < value.Length - 1 && value[i + 1] != ' ')
                    normalized.Append('_');
            }
            return normalized.Length > 0 ? normalized.ToString() : value.Trim();
        }

        private void ToggleValue(MacroVariableStore store, string name)
        {
            bool current = store.GetBoolean(name);
            store.SetBoolean(name, !current);
        }

        private void EvaluateAndSet(MacroVariableStore store, string name)
        {
            string expr = SubstituteVariables(Value ?? "", store);
            switch (VariableType)
            {
                case VariableType.Number:
                    if (TryEvaluateNumber(expr, out double num))
                        store.SetNumber(name, num);
                    break;
                case VariableType.Text:
                    store.SetText(name, expr);
                    break;
                case VariableType.Boolean:
                    if (TryEvaluateBoolean(expr, out bool b))
                        store.SetBoolean(name, b);
                    break;
            }
        }

        private static string SubstituteVariables(string expression, MacroVariableStore store)
        {
            if (string.IsNullOrEmpty(expression))
                return expression;
            // Remplace les noms de variables par leurs valeurs (mot entier uniquement)
            var pattern = @"\b([a-zA-Z_][a-zA-Z0-9_]*)\b";
            return Regex.Replace(expression, pattern, m =>
            {
                string varName = m.Groups[1].Value;
                if (store.TryGetNumber(varName, out double num))
                    return num.ToString(CultureInfo.InvariantCulture);
                if (store.TryGetText(varName, out string? text))
                    return text ?? "";
                if (store.TryGetBoolean(varName, out bool bl))
                    return bl ? "1" : "0";
                return m.Value;
            });
        }

        private static bool TryEvaluateNumber(string expression, out double result)
        {
            result = 0;
            expression = expression?.Trim() ?? "";
            if (string.IsNullOrEmpty(expression))
                return false;
            try
            {
                // Expression simple: nombres, +, -, *, /, (, ), espaces
                result = SimpleMathEvaluator.Evaluate(expression);
                return true;
            }
            catch
            {
                return double.TryParse(expression.Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out result);
            }
        }

        private static bool TryEvaluateBoolean(string expression, out bool result)
        {
            result = false;
            expression = expression?.Trim() ?? "";
            if (string.IsNullOrEmpty(expression))
                return false;
            return ParseBool(expression, out result);
        }

        private static bool ParseBool(string? value)
        {
            ParseBool(value ?? "", out bool b);
            return b;
        }

        private static bool ParseBool(string value, out bool result)
        {
            result = false;
            value = value?.Trim().ToLowerInvariant() ?? "";
            if (value == "true" || value == "1" || value == "oui" || value == "yes")
            {
                result = true;
                return true;
            }
            if (value == "false" || value == "0" || value == "non" || value == "no")
            {
                result = false;
                return true;
            }
            return false;
        }

        public IInputAction Clone()
        {
            return new VariableAction
            {
                Id = Guid.NewGuid().ToString(),
                Name = Name,
                VariableName = VariableName,
                VariableType = VariableType,
                Operation = Operation,
                Value = Value,
                Step = Step
            };
        }
    }

    /// <summary>
    /// Évaluateur d'expressions mathématiques simples (+, -, *, /, %, parenthèses, nombres).
    /// </summary>
    internal static class SimpleMathEvaluator
    {
        public static double Evaluate(string expression)
        {
            expression = expression?.Replace(" ", "") ?? "";
            if (string.IsNullOrEmpty(expression))
                return 0;
            int pos = 0;
            return ParseExpression(expression, ref pos);
        }

        private static double ParseExpression(string s, ref int pos)
        {
            double left = ParseTerm(s, ref pos);
            while (pos < s.Length)
            {
                char c = s[pos];
                if (c == '+') { pos++; left += ParseTerm(s, ref pos); }
                else if (c == '-') { pos++; left -= ParseTerm(s, ref pos); }
                else break;
            }
            return left;
        }

        private static double ParseTerm(string s, ref int pos)
        {
            double left = ParseFactor(s, ref pos);
            while (pos < s.Length)
            {
                char c = s[pos];
                if (c == '*') { pos++; left *= ParseFactor(s, ref pos); }
                else if (c == '/') { pos++; var r = ParseFactor(s, ref pos); left = r != 0 ? left / r : 0; }
                else if (c == '%') { pos++; var r = ParseFactor(s, ref pos); left = r != 0 ? left % r : 0; }
                else break;
            }
            return left;
        }

        private static double ParseFactor(string s, ref int pos)
        {
            if (pos >= s.Length)
                return 0;
            if (s[pos] == '(')
            {
                pos++;
                double v = ParseExpression(s, ref pos);
                if (pos < s.Length && s[pos] == ')') pos++;
                return v;
            }
            if (s[pos] == '-')
            {
                pos++;
                return -ParseFactor(s, ref pos);
            }
            int start = pos;
            while (pos < s.Length && (char.IsDigit(s[pos]) || s[pos] == '.' || s[pos] == ','))
                pos++;
            if (start == pos)
                return 0;
            string num = s.Substring(start, pos - start).Replace(",", ".");
            return double.TryParse(num, NumberStyles.Any, CultureInfo.InvariantCulture, out double n) ? n : 0;
        }
    }
}

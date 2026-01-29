using System;
using System.Collections.Generic;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Stockage des variables pendant l'exécution d'une macro.
    /// </summary>
    public class MacroVariableStore
    {
        private readonly Dictionary<string, object> _store = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        public void SetNumber(string name, double value)
        {
            _store[name] = value;
        }

        public void SetText(string name, string value)
        {
            _store[name] = value ?? "";
        }

        public void SetBoolean(string name, bool value)
        {
            _store[name] = value;
        }

        public double GetNumber(string name)
        {
            if (_store.TryGetValue(name, out object? o))
            {
                if (o is double d) return d;
                if (o is int i) return i;
                if (o is long l) return l;
                if (o is bool b) return b ? 1 : 0;
                if (o is string s && double.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double parsed))
                    return parsed;
            }
            return 0;
        }

        public bool TryGetNumber(string name, out double value)
        {
            value = GetNumber(name);
            return _store.ContainsKey(name);
        }

        public string GetText(string name)
        {
            if (_store.TryGetValue(name, out object? o))
                return o?.ToString() ?? "";
            return "";
        }

        public bool TryGetText(string name, out string? value)
        {
            value = GetText(name);
            return _store.ContainsKey(name);
        }

        public bool GetBoolean(string name)
        {
            if (_store.TryGetValue(name, out object? o))
            {
                if (o is bool b) return b;
                if (o is string s)
                {
                    s = s.Trim().ToLowerInvariant();
                    return s == "true" || s == "1" || s == "oui" || s == "yes";
                }
                if (o is double d) return d != 0;
                if (o is int i) return i != 0;
            }
            return false;
        }

        public bool TryGetBoolean(string name, out bool value)
        {
            value = GetBoolean(name);
            return _store.ContainsKey(name);
        }

        /// <summary>
        /// Retourne la valeur brute si elle existe (pour conditions IF, etc.)
        /// </summary>
        public bool TryGetValue(string name, out object? value)
        {
            return _store.TryGetValue(name, out value);
        }

        public void Clear()
        {
            _store.Clear();
        }
    }
}

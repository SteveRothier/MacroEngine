using System.Threading;

namespace MacroEngine.Core.Engine
{
    /// <summary>
    /// Contexte d'exécution d'une macro (variables, etc.), accessible pendant l'exécution.
    /// </summary>
    public class ExecutionContext
    {
        private static readonly AsyncLocal<ExecutionContext?> _current = new AsyncLocal<ExecutionContext?>();

        public static ExecutionContext? Current
        {
            get => _current.Value;
            set => _current.Value = value;
        }

        public MacroVariableStore Variables { get; } = new MacroVariableStore();
    }
}

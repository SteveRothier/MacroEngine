using System;

namespace MacroEngine.UI;

/// <summary>
/// Passé à <see cref="TimelineEditor.MacroChanged"/> / BlockEditor après undo/redo uniquement.
/// La fenêtre principale peut alors éviter hooks, Items.Refresh et travail lourd inutile.
/// </summary>
public sealed class MacroActionsChangedOnlyEventArgs : EventArgs
{
    public static MacroActionsChangedOnlyEventArgs Instance { get; } = new();

    private MacroActionsChangedOnlyEventArgs()
    {
    }
}

using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace MacroEngine;

/// <summary>
/// Caractères Unicode des icônes Lucide (police lucide.ttf).
/// Utiliser avec FontFamily = FontLucide pour afficher les glyphes.
/// </summary>
public static class LucideIcons
{
    // Lecture / Exécution
    public const string Play = "\uE080";       // circle-play
    public const string Pause = "\uE07F";      // circle-pause
    public const string Stop = "\uE083";       // circle-stop
    public const string Record = "\uE345";     // circle-dot

    // Paramètres / Actions
    public const string Settings = "\uE30B";    // cog
    public const string Plus = "\uE081";       // circle-plus
    public const string RefreshCcw = "\uE148";  // refresh-ccw (flèches circulaires)
    public const string Close = "\uE084";      // circle-x
    public const string Cross = "\uE1E5";      // cross
    public const string X = "\uE1B2";          // x (simple X pour fermer)
    public const string Minus = "\uE11C";     // minus

    // Fichiers / Presets
    public const string Clipboard = "\uE085"; // clipboard
    public const string Folder = "\uE0D7";     // folder
    public const string FolderOpen = "\uE247"; // folder-open
    public const string Download = "\uE0B2";  // download
    public const string Upload = "\uE19E";     // upload
    public const string FileText = "\uE0CC";   // file-text

    // Barre de titre
    public const string Maximize = "\uE167";   // square (agrandir)
    public const string Square = "\uE167";     // square (restore)

    // Blocs / Actions
    public const string Keyboard = "\uE284";    // keyboard
    public const string Mouse = "\uE11F";      // mouse-pointer
    public const string Timer = "\uE087";      // clock
    public const string Box = "\uE061";        // box
    public const string Trash = "\uE18E";      // trash-2
    public const string Repeat = "\uE146";     // repeat
    public const string Undo = "\uE19B";       // undo
    public const string HelpCircle = "\uE082"; // circle-question-mark
    public const string CheckCircle = "\uE072"; // circle-check (recommandé, validé)
    public const string Library = "\uE100";    // library

    // Sélection / Couleur
    public const string Crosshair = "\uE0AC"; // crosshair
    public const string Eye = "\uE0BA";        // eye
    public const string Droplet = "\uE0B4";    // droplet (pipette)
    public const string Copy = "\uE09E";      // copy

    // Texte / Type
    public const string Type = "\uE198";      // type

    // Indicateurs / Recommandation
    public const string FlagTriangleRight = "\uE238"; // flag-triangle-right (recommandé, marqueur)

    // Tri
    public const string ArrowUp = "\uE19E";       // upload / arrow up
    public const string ArrowDown = "\uE0B2";     // download / arrow down
    public const string ArrowUpDown = "\uE376";   // arrow-up-down (tri, sort, reorder)

    /// <summary>Crée un TextBlock affichant une icône Lucide (pour Content de bouton, etc.).</summary>
    public static TextBlock CreateIcon(string icon, double fontSize = 14)
    {
        var tb = new TextBlock { Text = icon, FontSize = fontSize };
        tb.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
        return tb;
    }

    /// <summary>Crée un panneau icône + texte pour Content (ex. "🎯 Définir zone").</summary>
    public static StackPanel CreateIconWithText(string icon, string text, double iconSize = 14)
    {
        var sp = new StackPanel { Orientation = Orientation.Horizontal };
        var tbIcon = new TextBlock { Text = icon, FontSize = iconSize };
        tbIcon.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
        sp.Children.Add(tbIcon);
        sp.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0) });
        return sp;
    }
}

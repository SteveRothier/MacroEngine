using System.Windows;
using System.Windows.Controls;

namespace MacroEngine.UI
{
    /// <summary>
    /// Comportements attachés pour TextBox (ex: sélectionner tout au focus).
    /// </summary>
    public static class TextBoxBehaviors
    {
        public static readonly DependencyProperty SelectAllOnFocusProperty =
            DependencyProperty.RegisterAttached(
                "SelectAllOnFocus",
                typeof(bool),
                typeof(TextBoxBehaviors),
                new PropertyMetadata(false, OnSelectAllOnFocusChanged));

        public static bool GetSelectAllOnFocus(TextBox element) =>
            (bool)element.GetValue(SelectAllOnFocusProperty);

        public static void SetSelectAllOnFocus(TextBox element, bool value) =>
            element.SetValue(SelectAllOnFocusProperty, value);

        private static void OnSelectAllOnFocusChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is not TextBox tb) return;
            if ((bool)e.NewValue)
                tb.GotFocus += TextBox_GotFocus;
            else
                tb.GotFocus -= TextBox_GotFocus;
        }

        private static void TextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox tb && tb.IsKeyboardFocused)
                tb.SelectAll();
        }
    }
}

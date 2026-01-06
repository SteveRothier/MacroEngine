using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace MacroEngine.Converters
{
    /// <summary>
    /// Convertit un booléen IsEnabled en texte "Activé" ou "Désactivé"
    /// </summary>
    public class BoolToStatusConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool isEnabled)
            {
                return isEnabled ? "Activé" : "Désactivé";
            }
            return "Désactivé";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    /// <summary>
    /// Convertit un code de touche en nom lisible
    /// </summary>
    public class KeyCodeToNameConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int keyCode && keyCode > 0)
            {
                return GetKeyName((ushort)keyCode);
            }
            return string.Empty;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0)
            {
                return "Aucune touche";
            }

            return virtualKeyCode switch
            {
                0x08 => "Backspace",
                0x09 => "Tab",
                0x0C => "Clear",
                0x0D => "Enter",
                0x10 => "Shift",
                0x11 => "Ctrl",
                0x12 => "Alt",
                0x13 => "Pause",
                0x14 => "Caps Lock",
                0x1B => "Esc",
                0x20 => "Espace",
                0x21 => "Page Up",
                0x22 => "Page Down",
                0x23 => "End",
                0x24 => "Home",
                0x25 => "←",
                0x26 => "↑",
                0x27 => "→",
                0x28 => "↓",
                0x2C => "Print Screen",
                0x2D => "Insert",
                0x2E => "Delete",
                0x30 => "0",
                0x31 => "1",
                0x32 => "2",
                0x33 => "3",
                0x34 => "4",
                0x35 => "5",
                0x36 => "6",
                0x37 => "7",
                0x38 => "8",
                0x39 => "9",
                0x41 => "A",
                0x42 => "B",
                0x43 => "C",
                0x44 => "D",
                0x45 => "E",
                0x46 => "F",
                0x47 => "G",
                0x48 => "H",
                0x49 => "I",
                0x4A => "J",
                0x4B => "K",
                0x4C => "L",
                0x4D => "M",
                0x4E => "N",
                0x4F => "O",
                0x50 => "P",
                0x51 => "Q",
                0x52 => "R",
                0x53 => "S",
                0x54 => "T",
                0x55 => "U",
                0x56 => "V",
                0x57 => "W",
                0x58 => "X",
                0x59 => "Y",
                0x5A => "Z",
                0x5B => "Win",
                0x5C => "Win",
                0x5D => "Menu",
                0x60 => "Num 0",
                0x61 => "Num 1",
                0x62 => "Num 2",
                0x63 => "Num 3",
                0x64 => "Num 4",
                0x65 => "Num 5",
                0x66 => "Num 6",
                0x67 => "Num 7",
                0x68 => "Num 8",
                0x69 => "Num 9",
                0x6A => "Num *",
                0x6B => "Num +",
                0x6C => "Num Entrée",
                0x6D => "Num -",
                0x6E => "Num .",
                0x6F => "Num /",
                0x70 => "F1",
                0x71 => "F2",
                0x72 => "F3",
                0x73 => "F4",
                0x74 => "F5",
                0x75 => "F6",
                0x76 => "F7",
                0x77 => "F8",
                0x78 => "F9",
                0x79 => "F10",
                0x7A => "F11",
                0x7B => "F12",
                0x90 => "Num Lock",
                0x91 => "Scroll Lock",
                0xA0 => "Shift",
                0xA1 => "Shift",
                0xA2 => "Ctrl",
                0xA3 => "Ctrl",
                0xA4 => "Alt",
                0xA5 => "Alt",
                0xBA => ";",
                0xBB => "=",
                0xBC => ",",
                0xBD => "-",
                0xBE => ".",
                0xBF => "/",
                0xC0 => "ù",
                0xDB => "[",
                0xDC => "\\",
                0xDD => "]",
                0xDE => "^",
                _ => $"VK{virtualKeyCode:X2}"
            };
        }
    }

    /// <summary>
    /// Affiche le badge de raccourci seulement si le code de touche > 0
    /// </summary>
    public class ShortcutVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int keyCode)
            {
                return keyCode > 0 ? Visibility.Visible : Visibility.Collapsed;
            }
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}


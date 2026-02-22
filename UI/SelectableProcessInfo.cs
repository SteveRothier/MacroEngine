using System.ComponentModel;

namespace MacroEngine.UI
{
    /// <summary>
    /// ProcessInfo avec état de sélection pour la ListView
    /// </summary>
    public class SelectableProcessInfo : INotifyPropertyChanged
    {
        private bool _isSelected;

        public string ProcessName { get; set; } = string.Empty;
        public int ProcessId { get; set; }
        public string WindowTitle { get; set; } = string.Empty;
        public string ExecutablePath { get; set; } = string.Empty;
        public bool HasMainWindow { get; set; }
        public System.Windows.Media.ImageSource? Icon { get; set; }

        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                if (_isSelected != value)
                {
                    _isSelected = value;
                    PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsSelected)));
                }
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
    }
}

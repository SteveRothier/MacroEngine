using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MacroEngine.Core.Models;
using MacroEngine.Core.Inputs;

namespace MacroEngine.UI
{
    public partial class TimelineEditor : UserControl
    {
        private Macro _currentMacro;
        private double _zoomLevel = 1.0;
        private double _timeScale = 10.0; // pixels par milliseconde

        public TimelineEditor()
        {
            InitializeComponent();
            ZoomSlider.ValueChanged += ZoomSlider_ValueChanged;
        }

        public void LoadMacro(Macro macro)
        {
            _currentMacro = macro;
            if (macro != null && macro.Actions == null)
            {
                macro.Actions = new System.Collections.Generic.List<MacroEngine.Core.Inputs.IInputAction>();
            }
            RefreshTimeline();
        }

        private void ZoomSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            _zoomLevel = e.NewValue;
            ZoomText.Text = $"{_zoomLevel * 100:F0}%";
            RefreshTimeline();
        }

        private void TimeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            TimeText.Text = $"{e.NewValue:F0}ms";
        }

        private void RefreshTimeline()
        {
            TimelineCanvas.Children.Clear();

            if (_currentMacro == null || _currentMacro.Actions == null)
                return;

            double currentX = 10;
            double y = 50;
            double actionHeight = 30;
            double spacing = 5;

            foreach (var action in _currentMacro.Actions)
            {
                // Calculer la largeur basée sur les délais
                double width = (action.DelayBefore + action.DelayAfter) * _timeScale * _zoomLevel;
                if (width < 20) width = 20;

                // Dessiner le rectangle de l'action
                var rect = new System.Windows.Shapes.Rectangle
                {
                    Width = width,
                    Height = actionHeight,
                    Fill = GetActionColor(action.Type),
                    Stroke = Brushes.Black,
                    StrokeThickness = 1
                };

                Canvas.SetLeft(rect, currentX);
                Canvas.SetTop(rect, y);
                TimelineCanvas.Children.Add(rect);

                // Ajouter le texte
                var text = new TextBlock
                {
                    Text = action.Name,
                    FontSize = 10,
                    Foreground = Brushes.Black
                };

                Canvas.SetLeft(text, currentX + 5);
                Canvas.SetTop(text, y + 5);
                TimelineCanvas.Children.Add(text);

                currentX += width + spacing;
            }

            // Ajuster la largeur du canvas
            TimelineCanvas.Width = Math.Max(currentX + 10, 2000);
        }

        private Brush GetActionColor(InputActionType type)
        {
            return type switch
            {
                InputActionType.Keyboard => Brushes.LightBlue,
                InputActionType.Mouse => Brushes.LightGreen,
                InputActionType.Delay => Brushes.LightYellow,
                _ => Brushes.LightGray
            };
        }
    }
}


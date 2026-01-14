using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MacroEngine.UI
{
    public partial class ZoneSelectorWindow : Window
    {
        private Point _startPoint;
        private bool _isSelecting = false;
        private Rectangle? _selectionRect;

        public int X1 { get; private set; }
        public int Y1 { get; private set; }
        public int X2 { get; private set; }
        public int Y2 { get; private set; }

        public ZoneSelectorWindow()
        {
            InitializeComponent();
            
            // Masquer la fenêtre de dialogue parente temporairement
            Owner = Application.Current.MainWindow;
            WindowStartupLocation = WindowStartupLocation.Manual;
            
            // S'assurer que la fenêtre peut recevoir les événements
            Focusable = true;
            CaptureMouse();
            
            MouseDown += ZoneSelectorWindow_MouseDown;
            MouseMove += ZoneSelectorWindow_MouseMove;
            MouseUp += ZoneSelectorWindow_MouseUp;
            KeyDown += ZoneSelectorWindow_KeyDown;
            PreviewKeyDown += ZoneSelectorWindow_PreviewKeyDown;
        }

        private void ZoneSelectorWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            // Capturer ESC même si la fenêtre n'a pas le focus
            if (e.Key == Key.Escape)
            {
                e.Handled = true;
                DialogResult = false;
                Close();
            }
        }

        private void ZoneSelectorWindow_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
            {
                _isSelecting = true;
                _startPoint = e.GetPosition(SelectionCanvas);
                
                X1 = (int)_startPoint.X;
                Y1 = (int)_startPoint.Y;

                // Créer le rectangle de sélection
                _selectionRect = new Rectangle
                {
                    Stroke = Brushes.Red,
                    StrokeThickness = 2,
                    StrokeDashArray = new DoubleCollection(new[] { 5.0, 5.0 }),
                    Fill = new SolidColorBrush(Color.FromArgb(32, 255, 0, 0))
                };

                Canvas.SetLeft(_selectionRect, X1);
                Canvas.SetTop(_selectionRect, Y1);
                _selectionRect.Width = 0;
                _selectionRect.Height = 0;
                _selectionRect.Visibility = Visibility.Visible;

                SelectionCanvas.Children.Add(_selectionRect);
                if (CoordinatesTextBlock != null)
                    CoordinatesTextBlock.Visibility = Visibility.Visible;
                
                // Capturer la souris pour continuer à recevoir les événements même en dehors de la fenêtre
                CaptureMouse();
            }
        }

        private void ZoneSelectorWindow_MouseMove(object sender, MouseEventArgs e)
        {
            if (_isSelecting && _selectionRect != null)
            {
                Point currentPoint = e.GetPosition(SelectionCanvas);
                
                int x1 = (int)Math.Min(_startPoint.X, currentPoint.X);
                int y1 = (int)Math.Min(_startPoint.Y, currentPoint.Y);
                int x2 = (int)Math.Max(_startPoint.X, currentPoint.X);
                int y2 = (int)Math.Max(_startPoint.Y, currentPoint.Y);

                Canvas.SetLeft(_selectionRect, x1);
                Canvas.SetTop(_selectionRect, y1);
                _selectionRect.Width = Math.Max(0, x2 - x1);
                _selectionRect.Height = Math.Max(0, y2 - y1);

                // Mettre à jour les coordonnées affichées
                if (CoordinatesTextBlock != null)
                {
                    CoordinatesTextBlock.Text = $"X1: {x1}, Y1: {y1} | X2: {x2}, Y2: {y2} | Largeur: {x2 - x1}, Hauteur: {y2 - y1}";
                    Canvas.SetLeft(CoordinatesTextBlock, Math.Min(currentPoint.X + 10, SelectionCanvas.ActualWidth - 200));
                    Canvas.SetTop(CoordinatesTextBlock, Math.Min(currentPoint.Y + 10, SelectionCanvas.ActualHeight - 30));
                }
            }
        }

        private void ZoneSelectorWindow_MouseUp(object sender, MouseButtonEventArgs e)
        {
            if (_isSelecting && _selectionRect != null)
            {
                // Libérer la capture de la souris
                ReleaseMouseCapture();
                
                Point endPoint = e.GetPosition(SelectionCanvas);
                
                X1 = (int)Math.Min(_startPoint.X, endPoint.X);
                Y1 = (int)Math.Min(_startPoint.Y, endPoint.Y);
                X2 = (int)Math.Max(_startPoint.X, endPoint.X);
                Y2 = (int)Math.Max(_startPoint.Y, endPoint.Y);

                // Vérifier que la zone est valide (au moins 10x10 pixels)
                if (Math.Abs(X2 - X1) >= 10 && Math.Abs(Y2 - Y1) >= 10)
                {
                    DialogResult = true;
                    Close();
                }
                else
                {
                    MessageBox.Show("La zone sélectionnée est trop petite. Veuillez sélectionner une zone d'au moins 10x10 pixels.", 
                        "Zone trop petite", MessageBoxButton.OK, MessageBoxImage.Information);
                    
                    // Réinitialiser
                    SelectionCanvas.Children.Remove(_selectionRect);
                    _selectionRect = null;
                    _isSelecting = false;
                    if (CoordinatesTextBlock != null)
                        CoordinatesTextBlock.Visibility = Visibility.Collapsed;
                }
            }
        }

        private void ZoneSelectorWindow_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                ReleaseMouseCapture();
                DialogResult = false;
                Close();
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            ReleaseMouseCapture();
            base.OnClosed(e);
        }
    }
}

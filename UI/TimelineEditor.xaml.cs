using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using MacroEngine.Core.Inputs;
using MacroEngine.Core.Models;
using MacroEngine.Core.Hooks;
using MacroEngine.Core.Processes;
using MacroEngine.Core.Storage;

namespace MacroEngine.UI
{
    /// <summary>
    /// Éditeur de macros basé sur une Timeline verticale
    /// </summary>
    public partial class TimelineEditor : UserControl
    {
        private Macro? _currentMacro;
        
        // Historique Undo/Redo
        private Stack<List<IInputAction>> _undoStack = new Stack<List<IInputAction>>();
        private Stack<List<IInputAction>> _redoStack = new Stack<List<IInputAction>>();
        private bool _isUndoRedo = false;
        
        // Gestionnaire de presets
        private readonly PresetStorage _presetStorage = new PresetStorage();

        // Événement déclenché quand la macro est modifiée
        public event EventHandler? MacroChanged;

        /// <summary>True si la barre d'outils doit afficher uniquement les icônes (pas assez de place).</summary>
        public static readonly DependencyProperty IsToolbarCompactProperty =
            DependencyProperty.Register(nameof(IsToolbarCompact), typeof(bool), typeof(TimelineEditor), new PropertyMetadata(false));
        public bool IsToolbarCompact
        {
            get => (bool)GetValue(IsToolbarCompactProperty);
            set => SetValue(IsToolbarCompactProperty, value);
        }

        /// <summary>True si un enregistrement est en cours (bouton Enregistrer affiche Enregistrement + animation).</summary>
        public static readonly DependencyProperty IsRecordingProperty =
            DependencyProperty.Register(nameof(IsRecording), typeof(bool), typeof(TimelineEditor), new PropertyMetadata(false, OnIsRecordingOrPausedChanged));
        public bool IsRecording
        {
            get => (bool)GetValue(IsRecordingProperty);
            set => SetValue(IsRecordingProperty, value);
        }

        /// <summary>True si l'enregistrement est en pause (bouton affiche icône pause).</summary>
        public static readonly DependencyProperty IsRecordingPausedProperty =
            DependencyProperty.Register(nameof(IsRecordingPaused), typeof(bool), typeof(TimelineEditor), new PropertyMetadata(false, OnIsRecordingOrPausedChanged));
        public bool IsRecordingPaused
        {
            get => (bool)GetValue(IsRecordingPausedProperty);
            set => SetValue(IsRecordingPausedProperty, value);
        }

        private static void OnIsRecordingOrPausedChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            ((TimelineEditor)d).UpdateRecordPulseAnimation();
        }

        private System.Windows.Media.Animation.Storyboard? _recordPulseStoryboard;

        private void UpdateRecordPulseAnimation()
        {
            if (RecordDotAnim == null) return;
            var shouldAnimate = IsRecording && !IsRecordingPaused;
            if (shouldAnimate)
            {
                if (_recordPulseStoryboard == null)
                {
                    _recordPulseStoryboard = new System.Windows.Media.Animation.Storyboard
                    {
                        RepeatBehavior = System.Windows.Media.Animation.RepeatBehavior.Forever
                    };
                    var anim = new System.Windows.Media.Animation.DoubleAnimation(1, 0.4, new System.Windows.Duration(TimeSpan.FromSeconds(0.5)))
                    {
                        AutoReverse = true
                    };
                    System.Windows.Media.Animation.Storyboard.SetTarget(anim, RecordDotAnim);
                    System.Windows.Media.Animation.Storyboard.SetTargetProperty(anim, new PropertyPath(UIElement.OpacityProperty));
                    _recordPulseStoryboard.Children.Add(anim);
                }
                _recordPulseStoryboard.Begin(this, true);
            }
            else
            {
                _recordPulseStoryboard?.Stop(this);
                if (RecordDotAnim != null)
                    RecordDotAnim.Opacity = 1;
            }
        }

        /// <summary>Récupère une couleur du thème (Colors.xaml) par clé.</summary>
        private static Color GetThemeColor(string key)
        {
            var res = Application.Current.TryFindResource(key);
            if (res is Color c) return c;
            if (res is SolidColorBrush b) return b.Color;
            return Colors.Gray;
        }

        /// <summary>Récupère un pinceau du thème (Colors.xaml) par clé.</summary>
        private static SolidColorBrush GetThemeBrush(string key)
        {
            var res = Application.Current.TryFindResource(key);
            if (res is SolidColorBrush b) return b;
            if (res is Color c) return new SolidColorBrush(c);
            return new SolidColorBrush(Colors.Gray);
        }

        /// <summary>Style input action : texte seul, barre horizontale au-dessus quand sélectionné.</summary>
        private static Style? GetActionTextBoxStyle()
        {
            return Application.Current?.TryFindResource("TextBoxAction") as Style;
        }

        public TimelineEditor()
        {
            InitializeComponent();
            Loaded += TimelineEditor_Loaded;
            SizeChanged += TimelineEditor_SizeChanged;

            // Raccourcis Undo/Redo (PreviewKeyDown pour capter avant les contrôles enfants, majuscule et minuscule)
            PreviewKeyDown += TimelineEditor_PreviewKeyDown;
        }

        private const double ToolbarCompactThreshold = 520d;

        private void TimelineEditor_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            UpdateToolbarCompactMode();
        }

        private void UpdateToolbarCompactMode()
        {
            if (ToolbarScrollViewer == null) return;
            var availableWidth = ToolbarScrollViewer.ActualWidth;
            IsToolbarCompact = availableWidth > 0 && availableWidth < ToolbarCompactThreshold;
        }

        private void TimelineEditor_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (Keyboard.Modifiers != System.Windows.Input.ModifierKeys.Control)
                return;
            // Ctrl+Z pour Undo (Z et z)
            if (e.Key == Key.Z)
            {
                Undo();
                PlayUndoRedoIconRotation(UndoButton, -360);
                e.Handled = true;
            }
            // Ctrl+Y pour Redo (Y et y)
            else if (e.Key == Key.Y)
            {
                Redo();
                PlayUndoRedoIconRotation(RedoButton, 360);
                e.Handled = true;
            }
        }

        private static void PlayUndoRedoIconRotation(Button? button, double angleDegrees)
        {
            if (button?.Template == null) return;
            var host = button.Template.FindName("iconHost", button) as FrameworkElement;
            if (host?.RenderTransform is not RotateTransform rt) return;
            var sb = new Storyboard();
            var anim = new DoubleAnimation(0, angleDegrees, TimeSpan.FromMilliseconds(280))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };
            Storyboard.SetTarget(anim, host);
            Storyboard.SetTargetProperty(anim, new PropertyPath("(UIElement.RenderTransform).(RotateTransform.Angle)"));
            sb.Children.Add(anim);
            sb.Completed += (_, _) => rt.Angle = 0;
            sb.Begin();
        }

        private void TimelineEditor_Loaded(object sender, RoutedEventArgs e)
        {
            if (ToolbarScrollViewer != null)
                ToolbarScrollViewer.SizeChanged += (s, args) => UpdateToolbarCompactMode();
            Dispatcher.BeginInvoke(new Action(UpdateToolbarCompactMode), System.Windows.Threading.DispatcherPriority.Loaded);
            UpdateRecordPulseAnimation();
        }

        /// <summary>
        /// Charge une macro dans l'éditeur
        /// </summary>
        public void LoadMacro(Macro? macro)
        {
            _currentMacro = macro;
            _undoStack.Clear();
            _redoStack.Clear();
            UpdateUndoRedoButtons();

            // RefreshBlocks d’abord ; cloner les actions pour undo seulement une fois l’UI construite
            // (évite un pic CPU UI sur le thread de rendu au moment du clic sur une autre macro).
            RefreshBlocks(() =>
            {
                if (_currentMacro == null || _isUndoRedo)
                    return;
                var state = _currentMacro.Actions.Select(a => a.Clone()).ToList();
                _undoStack.Push(state);
                TrimUndoStackIfNeeded();
                _redoStack.Clear();
                UpdateUndoRedoButtons();
            });
        }

        /// <summary>Génération incrémentée à chaque RefreshBlocks pour annuler un rebuild par lots en cours.</summary>
        private int _timelineRefreshGeneration;

        /// <summary>Au-delà : reconstruction par petits lots sur plusieurs trames (UI réactive pendant undo/chargement).</summary>
        private const int TimelineRebuildChunkThreshold = 14;

        private const int TimelineRebuildChunkSize = 5;

        private void ClearTimelineActionBlocks()
        {
            var childrenToRemove = TimelineStackPanel.Children.Cast<UIElement>()
                .Where(c => c != EmptyStatePanel)
                .ToList();
            
            foreach (var child in childrenToRemove)
                TimelineStackPanel.Children.Remove(child);
            }

        /// <summary>Crée le conteneur timeline pour l’action à l’index donné (racine macro).</summary>
        private FrameworkElement CreateTimelineBlockForActionIndex(int index)
        {
            var action = _currentMacro!.Actions[index];
            if (action is RepeatAction ra)
                return CreateRepeatActionContainer(ra, index);
            if (action is IfAction ifAction)
                return CreateIfActionContainer(ifAction, index);
            return CreateActionCardWithButtons(action, index);
        }

        /// <summary>
        /// Rafraîchit l'affichage des actions dans la Timeline.
        /// </summary>
        /// <param name="layoutComplete">Appelé quand tout est affiché (y compris rebuild par lots). Utile pour enchaîner MacroChanged.</param>
        public void RefreshBlocks(Action? layoutComplete = null)
        {
            _timelineRefreshGeneration++;
            int gen = _timelineRefreshGeneration;

            void CompleteIfCurrent()
            {
                if (gen == _timelineRefreshGeneration)
                    layoutComplete?.Invoke();
            }

            ClearTimelineActionBlocks();

            if (_currentMacro == null || _currentMacro.Actions.Count == 0)
            {
                EmptyStatePanel.Visibility = Visibility.Visible;
                CompleteIfCurrent();
                return;
            }

            EmptyStatePanel.Visibility = Visibility.Collapsed;

            int count = _currentMacro.Actions.Count;
            if (count <= TimelineRebuildChunkThreshold)
            {
                TimelineStackPanel.BeginInit();
                try
                {
                    for (int i = 0; i < count; i++)
                        TimelineStackPanel.Children.Add(CreateTimelineBlockForActionIndex(i));
                }
                finally
                {
                    TimelineStackPanel.EndInit();
                }

                CompleteIfCurrent();
                return;
            }

            // Macros longues : plusieurs trames pour garder la fenêtre interactive (undo/redo, premier chargement).
            int idx = 0;
            void Step()
            {
                if (gen != _timelineRefreshGeneration)
                    return;

                int end = Math.Min(idx + TimelineRebuildChunkSize, count);
                TimelineStackPanel.BeginInit();
                try
                {
                    for (; idx < end; idx++)
                        TimelineStackPanel.Children.Add(CreateTimelineBlockForActionIndex(idx));
                }
                finally
                {
                    TimelineStackPanel.EndInit();
                }

                if (idx >= count)
                    CompleteIfCurrent();
                else
                    Dispatcher.BeginInvoke((Action)Step, System.Windows.Threading.DispatcherPriority.Background);
            }

            Step();
        }

        /// <summary>Nombre de conteneurs d’actions affichés (hors panneau vide).</summary>
        private int CountDisplayedTimelineBlocks()
        {
            return TimelineStackPanel.Children.Cast<UIElement>().Count(c => c != EmptyStatePanel);
        }

        /// <summary>
        /// Après modification de <see cref="Macro.Actions"/> depuis l’extérieur (barre du haut, etc.) :
        /// append O(1) si une seule action a été ajoutée en fin, sinon reconstruction complète.
        /// Met à jour l’historique annuler/refaire.
        /// </summary>
        public void RefreshAfterExternalMutation()
        {
            if (_currentMacro == null)
            {
                RefreshBlocks();
                return;
            }

            int n = _currentMacro.Actions.Count;
            int uiBlocks = CountDisplayedTimelineBlocks();

            if (n == 0)
            {
                RefreshBlocks();
                return;
            }

            // Exactement une action de plus que l’affichage actuel → ajout en fin (cas barre du haut)
            if (n == uiBlocks + 1)
            {
                AppendBlockAtEnd();
                return;
            }

            // Déjà aligné (ex. double planification)
            if (n == uiBlocks)
                return;

            RefreshBlocks();
        }

        /// <summary>
        /// À appeler <b>avant</b> de modifier <see cref="Macro.Actions"/> depuis l’extérieur (barre du haut, presets),
        /// pour que Annuler restaure l’état d’avant la modification (même logique que SaveState avant Add dans la timeline).
        /// </summary>
        public void PrepareUndoForExternalMutation()
        {
            SaveState();
        }

        /// <summary>
        /// Ajoute uniquement le dernier bloc à la fin (évite de reconstruire toute la timeline à chaque ajout).
        /// À utiliser après avoir ajouté une action à la fin de _currentMacro.Actions.
        /// </summary>
        private void AppendBlockAtEnd()
        {
            if (_currentMacro == null || _currentMacro.Actions.Count == 0) return;
            var index = _currentMacro.Actions.Count - 1;
            EmptyStatePanel.Visibility = Visibility.Collapsed;
            TimelineStackPanel.Children.Add(CreateTimelineBlockForActionIndex(index));
        }

        /// <summary>
        /// Crée un conteneur avec le numéro d'étape, la carte d'action et les boutons monter/descendre (style step card).
        /// </summary>
        private FrameworkElement CreateActionCardWithButtons(IInputAction action, int index)
        {
            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(0, 0, 0, 4),
                MinWidth = 400
            };

            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) });   // Numéro étape (01, 02…)
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var stepNumberText = new TextBlock
            {
                Text = (index + 1).ToString("D2"),
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20)),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 0, 12, 0)
            };
            stepNumberText.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            Grid.SetColumn(stepNumberText, 0);
            container.Children.Add(stepNumberText);

            var card = CreateActionCard(action, index);
            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 1);
            container.Children.Add(card);
            
            return container;
        }

        private static readonly Duration ActionRightClickDuration = new Duration(TimeSpan.FromMilliseconds(80));

        /// <summary>Animation clic droit : scale down (même effet que les chips).</summary>
        private static void ActionRightClickDown(System.Windows.Controls.Border card)
        {
            if (card.RenderTransform is not ScaleTransform scale)
            {
                scale = new ScaleTransform(1, 1);
                card.RenderTransformOrigin = new Point(0.5, 0.5);
                card.RenderTransform = scale;
            }
            var anim = new DoubleAnimation(0.99, ActionRightClickDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
        }

        /// <summary>Animation clic droit : scale up.</summary>
        private static void ActionRightClickUp(System.Windows.Controls.Border card)
        {
            var scale = card.RenderTransform as ScaleTransform;
            if (scale == null) return;
            var anim = new DoubleAnimation(1.0, ActionRightClickDuration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
        }

        /// <summary>Retourne le libellé court du type d'action pour la zone type (style step card).</summary>
        private static string GetActionTypeLabel(IInputAction action)
        {
            return action switch
            {
                KeyboardAction => "TOUCHE",
                Core.Inputs.MouseAction => "CLIC",
                DelayAction => "DÉLAI",
                TextAction => "TEXTE",
                VariableAction => "VAR",
                IfAction => "SI",
                RepeatAction => "RÉPÉTER",
                _ => "ACTION"
            };
        }

        /// <summary>Segments (label, value) pour l'affichage type maquette (ACTION, X, Y, DURÉE, etc.).</summary>
        private List<(string Label, string Value)> GetActionDisplaySegments(IInputAction action, string title, string details)
        {
            var list = new List<(string, string)>();
            switch (action)
            {
                case Core.Inputs.MouseAction ma:
                    list.Add(("ACTION", title));
                    if (ma.X >= 0 && ma.Y >= 0) { list.Add(("X", ma.X.ToString())); list.Add(("Y", ma.Y.ToString())); }
                    list.Add(("", details));
                    break;
                case DelayAction da:
                    list.Add(("DURÉE", da.GetDurationInUnit(da.Unit).ToString("0")));
                    list.Add(("UNITÉ", da.Unit == Core.Inputs.TimeUnit.Milliseconds ? "ms" : da.Unit == Core.Inputs.TimeUnit.Seconds ? "s" : "min"));
                    if (da.IsRandom && da.MinDuration != da.MaxDuration)
                        list.Add(("ALÉATOIRE", $"+{Math.Abs(da.MaxDuration - da.MinDuration)}ms"));
                    list.Add(("", details));
                    break;
                case KeyboardAction ka:
                    list.Add(("TOUCHE", title));
                    list.Add(("", details));
                    break;
                case VariableAction va:
                    list.Add(("VARIABLE", va.VariableName ?? "?"));
                    var opText = va.Operation switch
                    {
                        Core.Inputs.VariableOperation.Set => "=",
                        Core.Inputs.VariableOperation.Increment => "+= 1",
                        Core.Inputs.VariableOperation.Decrement => "-= 1",
                        Core.Inputs.VariableOperation.Toggle => "toggle",
                        Core.Inputs.VariableOperation.EvaluateExpression => "expr",
                        _ => "="
                    };
                    list.Add(("OPÉRATION", opText));
                    list.Add(("", details));
                    break;
                case TextAction ta:
                    list.Add(("TEXTE", string.IsNullOrEmpty(ta.Text) ? "" : (ta.Text.Length > 20 ? ta.Text.Substring(0, 20) + "…" : ta.Text)));
                    list.Add(("", details));
                    break;
                default:
                    list.Add(("", title));
                    if (!string.IsNullOrEmpty(details)) list.Add(("", details));
                    break;
            }
            return list;
        }

        /// <summary>
        /// Crée une carte d'action pour la Timeline (style step card : fond #0D0F0D, zone type 72px, bordure #262D26).
        /// Si nestedRepeatInfo ou nestedIfInfo est fourni, la croix supprime l'action imbriquée uniquement, pas le bloc parent.
        /// </summary>
        private FrameworkElement CreateActionCard(IInputAction action, int index, NestedActionInfo? nestedRepeatInfo = null, NestedIfActionInfo? nestedIfInfo = null)
        {
            // Palette step card v2 (--bg1, --bg2, --line2, --text3)
            var bgCard = Color.FromRgb(0x0D, 0x0F, 0x0D);   // --bg1
            var bgTypeZone = Color.FromRgb(0x11, 0x13, 0x11);   // --bg2
            var borderCard = Color.FromRgb(0x5A, 0x5D, 0x5A);   // #5A5D5A (actions clic/délai/touche/variable/texte)
            var textMuted = Color.FromRgb(0x4A, 0x5A, 0x4A);   // --text3
            
            // Couleur principale de l'action (accent)
            Color primaryColor;
            Color hoverColor;
            string title;
            string details;
            
            // Déterminer les couleurs selon le type d'action avec les couleurs spécifiées
            switch (action)
            {
                case KeyboardAction ka:
                    primaryColor = Color.FromRgb(52, 200, 184);   // #34C8B8
                    hoverColor = Color.FromRgb(82, 220, 204);
                    title = GetKeyboardActionTitle(ka);
                    details = GetKeyboardActionDetails(ka);
                    break;
                case Core.Inputs.MouseAction ma:
                    primaryColor = Color.FromRgb(52, 200, 184);   // #34C8B8
                    hoverColor = Color.FromRgb(82, 220, 204);
                    title = GetMouseActionTitle(ma);
                    details = GetMouseActionDetails(ma);
                    break;
                case DelayAction da:
                    primaryColor = Color.FromRgb(232, 160, 32);   // #E8A020
                    hoverColor = Color.FromRgb(240, 184, 64);
                    title = GetDelayActionTitle(da);
                    details = "Pause";
                    break;
                case RepeatAction ra:
                    primaryColor = Color.FromRgb(57, 217, 122);   // #39D97A
                    hoverColor = Color.FromRgb(77, 237, 142);
                    var actionsCount = ra.Actions?.Count ?? 0;
                    title = GetRepeatActionTitle(ra);
                    details = $"{actionsCount} action{(actionsCount > 1 ? "s" : "")}";
                    break;
                case IfAction ifAction:
                    primaryColor = Color.FromRgb(232, 64, 64);    // #E84040
                    hoverColor = Color.FromRgb(252, 84, 84);
                    title = GetIfActionTitle(ifAction);
                    details = "";
                    break;
                case TextAction ta:
                    primaryColor = Color.FromRgb(0x4A, 0x5A, 0x4A);
                    hoverColor = Color.FromRgb(0x6A, 0x7A, 0x6A);
                    title = GetTextActionTitle(ta);
                    details = GetTextActionDetails(ta);
                    break;
                case VariableAction va:
                    primaryColor = Color.FromRgb(167, 139, 250);   // #A78BFA
                    hoverColor = Color.FromRgb(187, 159, 255);
                    title = GetVariableActionTitle(va);
                    details = GetVariableActionDetails(va);
                    break;
                default:
                    primaryColor = Color.FromRgb(0x7A, 0x92, 0x7A);
                    hoverColor = Color.FromRgb(0x9A, 0xB2, 0x9A);
                    title = action.Type.ToString();
                    details = "";
                    break;
            }

            string typeLabel = GetActionTypeLabel(action);
            var brushCard = new SolidColorBrush(bgCard);
            var brushCardHover = new SolidColorBrush(Color.FromRgb(0x11, 0x13, 0x11));   // --bg2 au hover
            var brushBorder = new SolidColorBrush(borderCard);
            var brushBorderHover = new SolidColorBrush(primaryColor);
            if (action is RepeatAction)
            {
                brushCard = new SolidColorBrush(Color.FromArgb(13, 57, 217, 122));   // vert transparent ~5%
                brushBorder = new SolidColorBrush(Color.FromArgb(0x59, 57, 217, 122)); // bordure vert ~35%
                brushCardHover = brushCard; // pas de changement de background au hover pour Répéter
            }
            if (action is IfAction)
            {
                brushCard = new SolidColorBrush(Color.FromArgb(13, 232, 64, 64));   // rouge #e84040 transparent ~5%
                brushBorder = new SolidColorBrush(Color.FromArgb(0x59, 232, 64, 64)); // bordure rouge ~35%
                brushCardHover = brushCard; // pas de changement au hover pour Si
            }

            var card = new Border
            {
                Background = brushCard,
                BorderBrush = brushBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(0),
                Margin = new Thickness(0, 0, 0, 4),
                Cursor = Cursors.Hand,
                RenderTransform = new ScaleTransform(1, 1),
                RenderTransformOrigin = new Point(0.5, 0.5),
                Tag = index,
                MinHeight = 48,
                MaxHeight = 48,
                MinWidth = 400,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch,
                CornerRadius = new CornerRadius(0)
            };

            var contentGrid = new Grid();
            contentGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength((action is RepeatAction || action is IfAction) ? 0 : 72) });
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // .step-type v2 : width 72, bg2, border-right même couleur que carte (#5A5D5A)
            var typeZone = new Border
            {
                Width = (action is RepeatAction || action is IfAction) ? 0 : 72,
                Background = new SolidColorBrush(Color.FromRgb(0x11, 0x13, 0x11)),   // --bg2
                BorderBrush = brushBorder,
                BorderThickness = new Thickness(0, 0, 1, 0),
                Padding = new Thickness(10, 10, 10, 10),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            var typeBadge = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(0x0A, primaryColor.R, primaryColor.G, primaryColor.B)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(0x52, primaryColor.R, primaryColor.G, primaryColor.B)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(7, 6, 7, 6),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            var typeLabelBlock = new TextBlock
            {
                Text = typeLabel,
                FontSize = 11,
                FontWeight = FontWeights.ExtraBold,   // 800 = ExtraBold
                Foreground = new SolidColorBrush(primaryColor),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            typeLabelBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
            if (action is RepeatAction || action is IfAction)
            {
                typeLabelBlock.Text = "";
                typeZone.Visibility = Visibility.Collapsed;
            }
            typeBadge.Child = typeLabelBlock;
            typeZone.Child = typeBadge;
            Grid.SetColumn(typeZone, 0);
            contentGrid.Children.Add(typeZone);

            // Contenu en segments : centré verticalement dans la ligne 48px
            var segments = GetActionDisplaySegments(action, title, details);
            var contentPanel = new Grid
            {
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            contentPanel.UseLayoutRounding = true;
            contentPanel.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            for (int c = 0; c < segments.Count; c++)
                contentPanel.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var titleBlock = new TextBlock
            {
                Text = title,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(primaryColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            titleBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontPrimary");
            var firstSegmentContent = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Stretch };
            firstSegmentContent.Children.Add(titleBlock);
            var lineBrush = new SolidColorBrush(borderCard);
            TextBox? delayDurationTextBox = null;
            for (int si = 0; si < segments.Count; si++)
            {
                var (segLabel, segValue) = segments[si];
                var segBorder = new Border
                {
                    BorderBrush = si < segments.Count - 1 ? lineBrush : Brushes.Transparent,
                    BorderThickness = new Thickness(0, 0, si < segments.Count - 1 ? 1 : 0, 0),
                    Padding = (si == 1 && action is DelayAction) ? new Thickness(0, 0, 0, 0) : new Thickness(10, 10, 14, 10),
                    VerticalAlignment = VerticalAlignment.Center,
                    Effect = null
                };
                if (si == 0 && (action is RepeatAction || action is IfAction))
                {
                    segBorder.BorderThickness = new Thickness(3, 0, 0, 0);
                    segBorder.BorderBrush = new SolidColorBrush(primaryColor);
                    segBorder.Padding = new Thickness(10, 12, 14, 12);
                }
                RenderOptions.SetEdgeMode(segBorder, EdgeMode.Aliased);
                var segStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
                bool isDelayFirstSegment = si == 0 && action is DelayAction;
                bool isDelayUnitSegment = si == 1 && action is DelayAction;
                if (!string.IsNullOrEmpty(segLabel) && !isDelayFirstSegment && !isDelayUnitSegment)
                {
                    var lbl = new TextBlock
                    {
                        Text = segLabel,
                        FontSize = 8,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(textMuted)
                    };
                    lbl.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                    segStack.Children.Add(lbl);
                }
                if (si == 0)
                {
                    if (action is DelayAction da)
                    {
                        // DURÉE comme X/Y : label au-dessus, TextBox en dessous (même structure que coordonnées)
                        segStack.Orientation = Orientation.Vertical;
                        segStack.HorizontalAlignment = HorizontalAlignment.Left;
                        segStack.VerticalAlignment = VerticalAlignment.Center;
                        var delayLbl = new TextBlock
                        {
                            Text = "DURÉE",
                            FontSize = 8,
                            FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(textMuted),
                            Margin = new Thickness(0, 0, 0, 1)
                        };
                        delayLbl.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        segStack.Children.Add(delayLbl);
                        var delayAccent = Color.FromRgb(201, 122, 58);
                        var durationTextBox = new TextBox
                        {
                            Text = da.GetDurationInUnit(da.Unit).ToString("0.##"),
                            Width = 72,
                            MinWidth = 56,
                            FontSize = 16,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(delayAccent),
                            Background = Brushes.Transparent,
                            BorderBrush = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            Padding = new Thickness(0),
                            TextAlignment = TextAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Center,
                            VerticalContentAlignment = VerticalAlignment.Center,
                            CaretBrush = new SolidColorBrush(delayAccent),
                            Margin = new Thickness(-4, 0, 0, 0),
                            Visibility = (da.IsRandom || da.UseVariableDelay) ? Visibility.Collapsed : Visibility.Visible
                        };
                        durationTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
                        durationTextBox.TextChanged += (s, e) =>
                        {
                            if (TryParseDouble(durationTextBox.Text, out double value) && value >= 0)
                            {
                                SaveState();
                                da.SetDurationFromUnit(value, da.Unit);
                                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            }
                        };
                        durationTextBox.LostFocus += (s, e) =>
                        {
                            if (!TryParseDouble(durationTextBox.Text, out double value) || value < 0)
                                durationTextBox.Text = da.GetDurationInUnit(da.Unit).ToString("0.##");
                            else RefreshBlocks();
                        };
                        durationTextBox.PreviewKeyDown += (s, e) => { if (e.Key == Key.Enter) { (s as TextBox)?.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next)); e.Handled = true; } };
                        segStack.Children.Add(durationTextBox);
                        delayDurationTextBox = durationTextBox;
                        segBorder.Cursor = Cursors.IBeam;
                        segBorder.PreviewMouseLeftButtonDown += (s, e) =>
                        {
                            var current = e.OriginalSource as DependencyObject;
                            var isClickOnTextBox = false;
                            while (current != null)
                            {
                                if (current == durationTextBox) { isClickOnTextBox = true; break; }
                                current = VisualTreeHelper.GetParent(current);
                            }
                            if (!isClickOnTextBox)
                            {
                                durationTextBox.Focus();
                                durationTextBox.SelectionStart = durationTextBox.Text.Length;
                                durationTextBox.SelectionLength = 0;
                                e.Handled = true;
                            }
                        };
                    }
                    else
                    {
                        segStack.Children.Add(firstSegmentContent);
                    }
                }
                else if (si == 1 && action is DelayAction da && delayDurationTextBox != null)
                {
                    var delayAccent = Color.FromRgb(201, 122, 58);
                    // Ligne pleine hauteur comme les autres : segBorder sans padding, Grid [contenu avec padding | ligne Stretch]
                    var unitCellStack = new StackPanel
                    {
                        Orientation = Orientation.Vertical,
                        HorizontalAlignment = HorizontalAlignment.Left,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    var unitLbl = new TextBlock
                    {
                        Text = "UNITÉ",
                        FontSize = 8,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(textMuted),
                        Margin = new Thickness(0, 0, 0, 1)
                    };
                    unitLbl.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                    unitCellStack.Children.Add(unitLbl);
                    var unitComboBox = new ComboBox
                    {
                        MinWidth = 56,
                        Width = 72,
                        FontSize = 16,
                        FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
                        VerticalContentAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = HorizontalAlignment.Left,
                        HorizontalContentAlignment = HorizontalAlignment.Left,
                        Margin = new Thickness(0, 0, 0, 0),
                        Padding = new Thickness(0, 0, 0, 0)
                    };
                    unitComboBox.Items.Add("ms");
                    unitComboBox.Items.Add("s");
                    unitComboBox.Items.Add("min");
                    unitComboBox.SelectedIndex = da.Unit switch
                    {
                        Core.Inputs.TimeUnit.Milliseconds => 0,
                        Core.Inputs.TimeUnit.Seconds => 1,
                        Core.Inputs.TimeUnit.Minutes => 2,
                        _ => 0
                    };
                    unitComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontDisplay");
                    if (Application.Current.TryFindResource("ComboBoxDelayUnit") is Style unitCbStyle)
                        unitComboBox.Style = unitCbStyle;
                    else
                        unitComboBox.Foreground = new SolidColorBrush(delayAccent);
                    if (Application.Current.TryFindResource("ComboBoxItemDelayUnit") is Style unitItemStyle)
                        unitComboBox.ItemContainerStyle = unitItemStyle;
                    unitComboBox.SelectionChanged += (s, e) =>
                    {
                        if (unitComboBox.SelectedIndex < 0 || _currentMacro == null) return;
                        SaveState();
                        double currentValue = TryParseDouble(delayDurationTextBox.Text, out double val) ? val : da.GetDurationInUnit(da.Unit);
                        var newUnit = unitComboBox.SelectedIndex switch
                        {
                            0 => Core.Inputs.TimeUnit.Milliseconds,
                            1 => Core.Inputs.TimeUnit.Seconds,
                            2 => Core.Inputs.TimeUnit.Minutes,
                            _ => Core.Inputs.TimeUnit.Milliseconds
                        };
                        da.Unit = newUnit;
                        da.SetDurationFromUnit(currentValue, newUnit);
                        delayDurationTextBox.Text = currentValue.ToString("0.##");
                        _currentMacro.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    };
                    unitCellStack.Children.Add(unitComboBox);
                    var delayRestPanel = CreateDelayActionRestControls(da, index, delayDurationTextBox, unitSelectorInSegment: true);
                    delayRestPanel.VerticalAlignment = VerticalAlignment.Center;
                    var unitLineBorder = new Border
                    {
                        Width = 1,
                        Background = lineBrush,
                        VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Center
            };
                    RenderOptions.SetEdgeMode(unitLineBorder, EdgeMode.Aliased);
                    var unitPartWithPadding = new Border
                    {
                        Child = unitCellStack,
                        Padding = new Thickness(10, 10, 14, 10),
                        VerticalAlignment = VerticalAlignment.Stretch
                    };
                    var restPartWithPadding = new Border
                    {
                        Child = delayRestPanel,
                        Padding = new Thickness(8, 10, 10, 10),
                        VerticalAlignment = VerticalAlignment.Stretch
                    };
                    var unitSegmentOuterGrid = new Grid { VerticalAlignment = VerticalAlignment.Stretch };
                    unitSegmentOuterGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    unitSegmentOuterGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1) });
                    unitSegmentOuterGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    unitSegmentOuterGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
                    Grid.SetColumn(unitPartWithPadding, 0);
                    Grid.SetRow(unitPartWithPadding, 0);
                    unitSegmentOuterGrid.Children.Add(unitPartWithPadding);
                    Grid.SetColumn(unitLineBorder, 1);
                    Grid.SetRow(unitLineBorder, 0);
                    unitSegmentOuterGrid.Children.Add(unitLineBorder);
                    Grid.SetColumn(restPartWithPadding, 2);
                    Grid.SetRow(restPartWithPadding, 0);
                    unitSegmentOuterGrid.Children.Add(restPartWithPadding);
                    segStack.Children.Add(unitSegmentOuterGrid);
                    segStack.Orientation = Orientation.Horizontal;
                    segStack.VerticalAlignment = VerticalAlignment.Stretch;
                }
                else if (action is Core.Inputs.MouseAction mouseAction && (segLabel == "X" || segLabel == "Y"))
                {
                    // Segments X/Y : label au-dessus, valeur en dessous, premier chiffre sous X/Y, texte aligné à gauche pour ne pas bouger
                    segStack.Orientation = Orientation.Vertical;
                    segStack.HorizontalAlignment = HorizontalAlignment.Left;
                    segStack.VerticalAlignment = VerticalAlignment.Center;
                    // Segments X/Y éditables pour l'action Clic (max 5 chiffres, chiffres uniquement)
                    var coordTextBox = new TextBox
                    {
                        Text = segValue,
                        MaxLength = 5,
                        Width = 72,
                        MinWidth = 56,
                        FontSize = 16,
                FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(primaryColor),
                        Background = Brushes.Transparent,
                        BorderBrush = Brushes.Transparent,
                        BorderThickness = new Thickness(0),
                        Padding = new Thickness(0, 0, 0, 0),
                        Margin = new Thickness(-4, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                        VerticalContentAlignment = VerticalAlignment.Center,
                        TextAlignment = TextAlignment.Left,
                        CaretBrush = new SolidColorBrush(primaryColor)
                    };
                    coordTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
                    coordTextBox.PreviewTextInput += (s, e) =>
                    {
                        foreach (char c in e.Text ?? "")
                            if (!char.IsDigit(c)) { e.Handled = true; return; }
                    };
                    coordTextBox.TextChanged += (s, e) =>
                    {
                        var t = (s as TextBox)?.Text ?? "";
                        var digitsOnly = new string(t.Where(char.IsDigit).ToArray());
                        if (digitsOnly.Length > 5) digitsOnly = digitsOnly.Substring(0, 5);
                        if (t != digitsOnly)
                        {
                            var box = (TextBox)s;
                            var pos = box.SelectionStart;
                            box.Text = digitsOnly;
                            box.SelectionStart = Math.Min(pos, digitsOnly.Length);
                        }
                    };
                    if (segLabel == "X")
                    {
                        coordTextBox.LostFocus += (s, e) =>
                        {
                            if (int.TryParse(coordTextBox.Text, out int x) && x >= 0)
                            {
                                SaveState();
                                mouseAction.X = x;
                                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            }
                            else
                                coordTextBox.Text = mouseAction.X >= 0 ? mouseAction.X.ToString() : "0";
                        };
                        coordTextBox.PreviewKeyDown += (s, e) => { if (e.Key == Key.Enter) { (s as TextBox)?.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next)); e.Handled = true; } };
                    }
                    else
                    {
                        coordTextBox.LostFocus += (s, e) =>
                        {
                            if (int.TryParse(coordTextBox.Text, out int y) && y >= 0)
                            {
                                SaveState();
                                mouseAction.Y = y;
                                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            }
                            else
                                coordTextBox.Text = mouseAction.Y >= 0 ? mouseAction.Y.ToString() : "0";
                        };
                        coordTextBox.PreviewKeyDown += (s, e) => { if (e.Key == Key.Enter) { (s as TextBox)?.MoveFocus(new TraversalRequest(FocusNavigationDirection.Next)); e.Handled = true; } };
                    }
                    segStack.Children.Add(coordTextBox);
                    // Clic n'importe où dans le segment : focus le champ et curseur à droite du texte
                    segBorder.Cursor = Cursors.IBeam;
                    segBorder.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        // Clic sur le label ou le padding : focus + curseur à la fin ; clic dans le texte : laisser le TextBox placer le curseur
                        var current = e.OriginalSource as DependencyObject;
                        var isClickOnTextBox = false;
                        while (current != null)
                        {
                            if (current == coordTextBox) { isClickOnTextBox = true; break; }
                            current = VisualTreeHelper.GetParent(current);
                        }
                        if (!isClickOnTextBox)
                        {
                            coordTextBox.Focus();
                            coordTextBox.SelectionStart = coordTextBox.Text.Length;
                            coordTextBox.SelectionLength = 0;
                            e.Handled = true;
                        }
                    };
                }
                else if (!(si == 1 && action is DelayAction))
                {
                    segStack.HorizontalAlignment = HorizontalAlignment.Left;
                    var val = new TextBlock
                    {
                        Text = segValue,
                        FontSize = (si > 0 && string.IsNullOrEmpty(segLabel)) ? 11 : 16,
                        FontWeight = (si > 0 && string.IsNullOrEmpty(segLabel)) ? FontWeights.Normal : FontWeights.Bold,
                        Foreground = (si > 0 && string.IsNullOrEmpty(segLabel)) ? new SolidColorBrush(textMuted) : new SolidColorBrush(primaryColor),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    val.SetResourceReference(TextBlock.FontFamilyProperty, string.IsNullOrEmpty(segLabel) ? "FontEditorMono" : "FontDisplay");
                    segStack.Children.Add(val);
                }
                segBorder.Child = segStack;
                Grid.SetRow(segBorder, 0);
                Grid.SetColumn(segBorder, si);
                contentPanel.Children.Add(segBorder);
            }
            Grid.SetRow(contentPanel, 0);
            Grid.SetColumn(contentPanel, 1);
            contentGrid.Children.Add(contentPanel);

            // Barre de boutons (style maquette : ⚙ | ▲ | ▼ | ✕)
            var buttonStrip = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            var settingsBtn = new Border
            {
                Background = Brushes.Transparent,
                Padding = new Thickness(8, 8, 8, 8),
                Cursor = Cursors.Hand,
                Child = new TextBlock { Text = "⚙", FontSize = 12, Foreground = new SolidColorBrush(textMuted), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center }
            };
            buttonStrip.Children.Add(settingsBtn);
            buttonStrip.Children.Add(new Rectangle { Width = 1, Height = 24, Fill = lineBrush, Margin = new Thickness(0), VerticalAlignment = VerticalAlignment.Center });
            bool canMoveUp = false, canMoveDown = false;
            if (nestedRepeatInfo != null && _currentMacro != null && nestedRepeatInfo.ParentIndex >= 0 && nestedRepeatInfo.ParentIndex < _currentMacro.Actions.Count && _currentMacro.Actions[nestedRepeatInfo.ParentIndex] is RepeatAction raN)
            {
                canMoveUp = nestedRepeatInfo.NestedIndex > 0;
                canMoveDown = raN.Actions != null && nestedRepeatInfo.NestedIndex < raN.Actions.Count - 1;
            }
            else if (nestedIfInfo != null && _currentMacro != null && nestedIfInfo.ParentIndex >= 0 && nestedIfInfo.ParentIndex < _currentMacro.Actions.Count && _currentMacro.Actions[nestedIfInfo.ParentIndex] is IfAction ifN)
            {
                var list = nestedIfInfo.IsThen ? ifN.ThenActions : (nestedIfInfo.ElseIfBranchIndex >= 0 ? ifN.ElseIfBranches?[nestedIfInfo.ElseIfBranchIndex].Actions : ifN.ElseActions);
                canMoveUp = list != null && nestedIfInfo.NestedIndex > 0;
                canMoveDown = list != null && nestedIfInfo.NestedIndex < list.Count - 1;
            }
            else if (nestedRepeatInfo == null && nestedIfInfo == null && _currentMacro != null)
            {
                canMoveUp = index > 0;
                canMoveDown = index < _currentMacro.Actions.Count - 1;
            }
            var upBtn = new Border { Width = 26, Height = 26, Background = Brushes.Transparent, Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow, Padding = new Thickness(0), Tag = index, Child = new TextBlock { Text = "▲", FontSize = 10, Foreground = new SolidColorBrush(textMuted), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            var downBtn = new Border { Width = 26, Height = 26, Background = Brushes.Transparent, Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow, Padding = new Thickness(0), Tag = index, Child = new TextBlock { Text = "▼", FontSize = 10, Foreground = new SolidColorBrush(textMuted), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            if (nestedRepeatInfo != null)
            {
                upBtn.MouseLeftButtonDown += (s, e) => { if (canMoveUp) { MoveNestedActionUp(nestedRepeatInfo); e.Handled = true; } };
                downBtn.MouseLeftButtonDown += (s, e) => { if (canMoveDown) { MoveNestedActionDown(nestedRepeatInfo); e.Handled = true; } };
            }
            else if (nestedIfInfo != null)
            {
                upBtn.MouseLeftButtonDown += (s, e) => { if (canMoveUp) { MoveNestedIfActionUp(nestedIfInfo.ParentIndex, nestedIfInfo.NestedIndex, nestedIfInfo.IsThen); e.Handled = true; } };
                downBtn.MouseLeftButtonDown += (s, e) => { if (canMoveDown) { MoveNestedIfActionDown(nestedIfInfo.ParentIndex, nestedIfInfo.NestedIndex, nestedIfInfo.IsThen); e.Handled = true; } };
            }
            else
            {
                upBtn.MouseLeftButtonDown += (s, e) => { if (canMoveUp) { MoveActionUp(index); e.Handled = true; } };
                downBtn.MouseLeftButtonDown += (s, e) => { if (canMoveDown) { MoveActionDown(index); e.Handled = true; } };
            }
            buttonStrip.Children.Add(upBtn);
            buttonStrip.Children.Add(downBtn);
            buttonStrip.Children.Add(new Rectangle { Width = 1, Height = 24, Fill = new SolidColorBrush(borderCard), Margin = new Thickness(0), VerticalAlignment = VerticalAlignment.Center });
            var deleteBtnContainer = new Border
            {
                Background = Brushes.Transparent,
                Padding = new Thickness(8, 8, 8, 8),
                Margin = new Thickness(0, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Cursor = Cursors.Hand,
                Tag = nestedRepeatInfo != null ? (object)nestedRepeatInfo : (nestedIfInfo != null ? (object)nestedIfInfo : (object)index),
                Opacity = 0.6
            };
            var deleteCrossText = new TextBlock
            {
                Text = "✕",
                FontSize = 11,
                Foreground = new SolidColorBrush(textMuted),
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            deleteBtnContainer.Child = deleteCrossText;
            if (nestedRepeatInfo != null)
                deleteBtnContainer.MouseLeftButtonDown += DeleteNestedAction_Click;
            else if (nestedIfInfo != null)
                deleteBtnContainer.MouseLeftButtonDown += DeleteNestedIfAction_Click;
            else
            {
                deleteBtnContainer.MouseLeftButtonDown += (s, e) =>
                {
                    if (s is Border b && b.Tag is int idx)
                        DeleteActionByIndex(idx);
                    e.Handled = true;
                };
            }
            deleteBtnContainer.MouseEnter += (s, e) => deleteCrossText.Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0x40, 0x40));
            deleteBtnContainer.MouseLeave += (s, e) => deleteCrossText.Foreground = new SolidColorBrush(textMuted);
            buttonStrip.Children.Add(deleteBtnContainer);
            Grid.SetColumn(buttonStrip, 2);
            contentGrid.Children.Add(buttonStrip);

            card.Child = contentGrid;

            card.MouseEnter += (s, e) =>
            {
                deleteBtnContainer.Opacity = 1;
                card.Background = brushCardHover;
                card.BorderBrush = brushBorderHover;
                typeBadge.BorderBrush = new SolidColorBrush(Color.FromArgb(0x80, hoverColor.R, hoverColor.G, hoverColor.B));
                typeBadge.Background = new SolidColorBrush(Color.FromArgb(0x1A, hoverColor.R, hoverColor.G, hoverColor.B));
            };

            card.MouseLeave += (s, e) =>
            {
                deleteBtnContainer.Opacity = 0.6;
                card.Background = brushCard;
                card.BorderBrush = brushBorder;
                typeBadge.BorderBrush = new SolidColorBrush(Color.FromArgb(0x52, primaryColor.R, primaryColor.G, primaryColor.B));
                typeBadge.Background = new SolidColorBrush(Color.FromArgb(0x0A, primaryColor.R, primaryColor.G, primaryColor.B));
            };

            // Édition inline (remplace le contenu du premier segment)
            if (action is KeyboardAction ka2)
            {
                firstSegmentContent.Children.Clear();
                firstSegmentContent.Children.Add(CreateKeyboardActionControls(ka2, index, firstSegmentContent));
            }
            else if (action is DelayAction)
            {
                // Contenu Délai construit dans la boucle des segments (segment DURÉE comme X/Y + reste en segment 1)
            }
            else if (action is Core.Inputs.MouseAction ma)
            {
                firstSegmentContent.Children.Clear();
                firstSegmentContent.Children.Add(CreateMouseActionControls(ma, index, firstSegmentContent));
            }
            else if (action is RepeatAction ra)
            {
                firstSegmentContent.Children.Clear();
                titleBlock.Text = "Répéter";
                titleBlock.Margin = new Thickness(0, -2, 0, 0);
                titleBlock.HorizontalAlignment = HorizontalAlignment.Left;
                titleBlock.VerticalAlignment = VerticalAlignment.Center;
                var titleWrap = new Grid
                {
                    MinHeight = 24,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                titleWrap.Children.Add(titleBlock);
                firstSegmentContent.Children.Add(titleWrap);
                firstSegmentContent.Children.Add(CreateRepeatActionControls(ra, index, firstSegmentContent));
            }
            else if (action is IfAction ifAction)
            {
                firstSegmentContent.Children.Clear();
                firstSegmentContent.Children.Add(CreateIfActionControls(ifAction, index, firstSegmentContent));
            }
            else if (action is TextAction ta)
            {
                firstSegmentContent.Children.Clear();
                firstSegmentContent.Children.Add(CreateTextActionControls(ta, index, firstSegmentContent));
            }
            else if (action is VariableAction va)
            {
                firstSegmentContent.Children.Clear();
                firstSegmentContent.Children.Add(CreateVariableActionControls(va, index, firstSegmentContent));
            }

            // Menu contextuel pour sauvegarder comme preset (même style que chips)
            var contextMenu = new ContextMenu();
            if (TryFindResource("ContextMenuDefaultStyle") is Style cmStyle)
                contextMenu.Style = cmStyle;

            var saveAsPresetItem = new MenuItem
            {
                Header = "💾 Sauvegarder comme preset",
                FontSize = 12
            };
            if (TryFindResource("ContextMenuItemDefaultStyle") is Style miStyle)
                saveAsPresetItem.Style = miStyle;
            saveAsPresetItem.Click += async (s, e) =>
            {
                await SaveActionAsPreset(action, index);
            };
            contextMenu.Items.Add(saveAsPresetItem);
            
            var duplicateItem = new MenuItem
            {
                Header = "📋 Dupliquer cette action",
                FontSize = 12
            };
            if (TryFindResource("ContextMenuItemDefaultStyle") is Style miStyle2)
                duplicateItem.Style = miStyle2;
            duplicateItem.Click += (s, e) =>
            {
                if (nestedRepeatInfo != null)
                    DuplicateNestedActionInRepeat(nestedRepeatInfo);
                else if (nestedIfInfo != null)
                    DuplicateNestedActionInIf(nestedIfInfo);
                else
                    DuplicateAction(index);
            };
            contextMenu.Items.Add(duplicateItem);
            contextMenu.Opened += (s, _) => ActionRightClickUp(card);

            card.PreviewMouseRightButtonDown += (s, _) => ActionRightClickDown(card);
            card.PreviewMouseRightButtonUp += (s, _) => ActionRightClickUp(card);
            card.ContextMenu = contextMenu;
            settingsBtn.MouseLeftButtonDown += (s, e) =>
            {
                if (card.ContextMenu != null) { card.ContextMenu.PlacementTarget = card; card.ContextMenu.IsOpen = true; }
                e.Handled = true;
            };

            return card;
        }

        /// <summary>
        /// Crée un conteneur séparé pour les boutons monter/descendre à droite de l'action (complètement à l'extérieur)
        /// </summary>
        private FrameworkElement CreateMoveButtonsContainer(IInputAction action, int index)
        {
            // Déterminer la couleur principale selon le type d'action
            Color primaryColor = action switch
            {
                KeyboardAction => Color.FromRgb(79, 163, 209),   // #4FA3D1
                Core.Inputs.MouseAction => Color.FromRgb(79, 181, 140),   // #4FB58C
                TextAction => Color.FromRgb(224, 177, 90),       // #E0B15A
                VariableAction => Color.FromRgb(90, 163, 163),   // #5AA3A3
                DelayAction => Color.FromRgb(201, 122, 58),      // #C97A3A
                RepeatAction => Color.FromRgb(138, 108, 209),    // #8A6CD1
                IfAction => Color.FromRgb(201, 74, 74),          // #C94A4A
                _ => Color.FromRgb(122, 30, 58)                 // #7A1E3A
            };

            // Conteneur séparé pour les boutons monter/descendre complètement à l'extérieur à droite
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(1),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                CornerRadius = new CornerRadius(0),
                Padding = new Thickness(2, 2, 2, 2),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 48,
                MaxHeight = 48,
                Visibility = Visibility.Visible
            };
            
            // Grid pour centrer parfaitement le contenu verticalement et horizontalement
            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            
            // Boutons monter/descendre pour réorganiser les actions (toujours visibles)
            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            // Bouton monter (▲)
            bool canMoveUp = index > 0;
            var moveUpBtnBorder = new Border
            {
                Width = 24,
                Height = 24,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 1), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = index
            };
            
            var moveUpBtnText = new TextBlock
            {
                Text = "▲",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = GetThemeBrush("TextMutedBrush"),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 24,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            if (!canMoveUp) moveUpBtnText.Opacity = 0.6;
            moveUpBtnBorder.Child = moveUpBtnText;
            moveUpBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveUp)
                {
                    MoveActionUp(index);
                    e.Handled = true;
                }
            };
            moveUpBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextSecondaryBrush"); // Flèche en gris plus foncé au survol
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush"); // Bordure du conteneur plus foncée au survol
                }
            };
            moveUpBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextMutedBrush"); // Flèche en gris foncé
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush"); // Bordure du conteneur normale
                }
            };

            // Bouton descendre (▼)
            bool canMoveDown = _currentMacro != null && index < _currentMacro.Actions.Count - 1;
            var moveDownBtnBorder = new Border
            {
                Width = 24,
                Height = 24,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 1, 0, 0), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = index
            };
            
            var moveDownBtnText = new TextBlock
            {
                Text = "▼",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveDown
                    ? GetThemeBrush("TextMutedBrush") // Flèche en gris foncé
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)), // Gris pour désactivé
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 1,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveDownBtnBorder.Child = moveDownBtnText;
            moveDownBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveDown)
                {
                    MoveActionDown(index);
                    e.Handled = true;
                }
            };
            moveDownBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextSecondaryBrush"); // Flèche en gris plus foncé au survol
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush"); // Bordure du conteneur plus foncée au survol
                }
            };
            moveDownBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextMutedBrush"); // Flèche en gris foncé
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush"); // Bordure du conteneur normale
                }
            };

            moveButtonsPanel.Children.Add(moveUpBtnBorder);
            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            
            // Ajouter le panel des boutons dans le grid de centrage
            centeringGrid.Children.Add(moveButtonsPanel);
            
            // Ajouter le grid de centrage dans le conteneur pour centrer les flèches
            moveButtonsContainer.Child = centeringGrid;
            
            return moveButtonsContainer;
        }

        private string GetKeyboardActionTitle(KeyboardAction ka)
        {
            if (ka.VirtualKeyCode == 0) return "Touche ?";
            return GetKeyName(ka.VirtualKeyCode);
        }

        private string GetDelayActionTitle(DelayAction da)
        {
            string unitLabel = da.Unit switch
            {
                TimeUnit.Milliseconds => "ms",
                TimeUnit.Seconds => "s",
                TimeUnit.Minutes => "min",
                _ => "ms"
            };

            string result;
            
            if (da.UseVariableDelay)
            {
                // Mode basé sur variable
                string varName = string.IsNullOrWhiteSpace(da.VariableName) ? "?" : da.VariableName;
                if (Math.Abs(da.VariableMultiplier - 1.0) < 0.001)
                {
                    result = $"{varName}";
                }
                else
                {
                    result = $"{varName} × {da.VariableMultiplier:0.##}";
                }
            }
            else if (da.IsRandom)
            {
                double minValue = da.GetMinDurationInUnit(da.Unit);
                double maxValue = da.GetMaxDurationInUnit(da.Unit);
                result = $"Entre {minValue:0.##} {unitLabel} et {maxValue:0.##} {unitLabel}";
            }
            else
            {
                double value = da.GetDurationInUnit(da.Unit);
                result = $"{value:0.##} {unitLabel}";
            }

            // Ajouter jitter si configuré
            if (da.JitterPercent > 0)
            {
                result += $" (±{da.JitterPercent:0.##}%)";
            }

            return result;
        }

        private string GetTextActionTitle(TextAction ta)
        {
            if (ta.HideInLogs && !string.IsNullOrEmpty(ta.Text))
                return "Texte (masqué)";
            if (string.IsNullOrEmpty(ta.Text))
                return "Texte vide";
            
            // Afficher les premiers caractères du texte (max 30)
            string preview = ta.Text.Length > 30 ? ta.Text.Substring(0, 30) + "..." : ta.Text;
            // Remplacer les retours à la ligne par \n pour l'affichage
            preview = preview.Replace("\n", "\\n").Replace("\r", "");
            return $"\"{preview}\"";
        }

        private string GetTextActionDetails(TextAction ta)
        {
            var details = new System.Text.StringBuilder();
            
            if (ta.ClearBefore)
                details.Append("Effacer avant • ");
            if (ta.HideInLogs)
                details.Append("Masqué logs • ");
            
            if (ta.PasteAtOnce)
            {
                details.Append("Coller");
            }
            else if (ta.UseNaturalTyping)
            {
                details.Append($"Frappe naturelle ({ta.MinDelay}-{ta.MaxDelay} ms)");
            }
            else
            {
                details.Append($"Vitesse: {ta.TypingSpeed} ms");
            }
            
            if (!string.IsNullOrEmpty(ta.Text) && !ta.HideInLogs)
            {
                details.Append($" • {ta.Text.Length} caractère{(ta.Text.Length > 1 ? "s" : "")}");
            }
            else if (!string.IsNullOrEmpty(ta.Text))
            {
                details.Append(" • ***");
            }
            
            if (!string.IsNullOrEmpty(ta.Text) && ta.Text.Contains("{") && ta.Text.Contains("}"))
                details.Append(" • variables");
            
            return details.ToString();
        }

        private string GetVariableActionTitle(VariableAction va)
        {
            string name = string.IsNullOrEmpty(va.VariableName) ? "?" : va.VariableName;
            string op = va.Operation switch
            {
                VariableOperation.Set => "=",
                VariableOperation.Increment => "++",
                VariableOperation.Decrement => "--",
                VariableOperation.Toggle => "!",
                VariableOperation.EvaluateExpression => ":=",
                _ => ""
            };
            return $"{name} {op} {(string.IsNullOrEmpty(va.Value) ? "?" : va.Value)}";
        }

        private string GetVariableActionDetails(VariableAction va)
        {
            string typeStr = va.VariableType switch
            {
                VariableType.Number => "Nombre",
                VariableType.Text => "Texte",
                VariableType.Boolean => "Booléen",
                _ => ""
            };
            string opStr = va.Operation switch
            {
                VariableOperation.Set => "Définir",
                VariableOperation.Increment => "Incrémenter",
                VariableOperation.Decrement => "Décrémenter",
                VariableOperation.Toggle => "Inverser",
                VariableOperation.EvaluateExpression => "Expression",
                _ => ""
            };
            if (va.Operation == VariableOperation.Increment || va.Operation == VariableOperation.Decrement)
            {
                double step = va.Step;
                if (double.IsNaN(step) || double.IsInfinity(step)) step = 1;
                return $"{typeStr} • {opStr} (pas {step})";
            }
            return $"{typeStr} • {opStr}";
        }

        /// <summary>
        /// Parse un double en acceptant à la fois les virgules et les points comme séparateurs décimaux
        /// </summary>
        private bool TryParseDouble(string text, out double result)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                result = 0;
                return false;
            }

            // Remplacer les virgules par des points pour le parsing
            string normalizedText = text.Replace(',', '.');
            
            // Essayer de parser avec le format invariant (point comme séparateur)
            return double.TryParse(normalizedText, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out result);
        }

        private string GetKeyboardActionDetails(KeyboardAction ka)
        {
            var parts = new System.Collections.Generic.List<string>();
            
            // Ajouter les modificateurs
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Control))
                parts.Add("Ctrl");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Alt))
                parts.Add("Alt");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Shift))
                parts.Add("Shift");
            if (ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Windows))
                parts.Add("Win");
            
            // Ajouter la touche principale
            if (ka.VirtualKeyCode != 0)
            {
                parts.Add(GetKeyName(ka.VirtualKeyCode));
            }
            
            // Ajouter le type d'action si ce n'est pas Press
            if (ka.ActionType != KeyboardActionType.Press)
            {
                var actionType = ka.ActionType == KeyboardActionType.Down ? "Maintenir" : "Relâcher";
                var baseStr = $"{string.Join(" + ", parts)} ({actionType})";
                if (ka.ActionType == KeyboardActionType.Down && ka.HoldDurationMs > 0)
                    baseStr += $" pendant {ka.HoldDurationMs} ms";
                return baseStr;
            }
            
            return parts.Count > 0 ? string.Join(" + ", parts) : "Touche ?";
        }

        private string GetMouseActionTitle(Core.Inputs.MouseAction ma)
        {
            return ma.ActionType switch
            {
                MouseActionType.LeftClick => "Clic gauche",
                MouseActionType.RightClick => "Clic droit",
                MouseActionType.MiddleClick => "Clic milieu",
                MouseActionType.DoubleLeftClick => "Double-clic gauche",
                MouseActionType.DoubleRightClick => "Double-clic droit",
                MouseActionType.Move => "Déplacer",
                MouseActionType.LeftDown => "Appuyer gauche",
                MouseActionType.LeftUp => "Relâcher gauche",
                MouseActionType.RightDown => "Appuyer droit",
                MouseActionType.RightUp => "Relâcher droit",
                MouseActionType.WheelUp => "Molette haut",
                MouseActionType.WheelDown => "Molette bas",
                MouseActionType.Wheel => "Molette",
                MouseActionType.WheelContinuous => "Scroll continu",
                _ => ma.ActionType.ToString()
            };
        }

        private string GetMouseActionDetails(Core.Inputs.MouseAction ma)
        {
            var details = new System.Text.StringBuilder();
            
            // Afficher les coordonnées pour les actions qui en ont besoin
            bool showCoords = ma.ActionType == Core.Inputs.MouseActionType.LeftClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.RightClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.MiddleClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.DoubleLeftClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.DoubleRightClick ||
                             ma.ActionType == Core.Inputs.MouseActionType.LeftDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.RightDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.MiddleDown ||
                             ma.ActionType == Core.Inputs.MouseActionType.Move;
            
            if (showCoords)
            {
                if (ma.ActionType == Core.Inputs.MouseActionType.Move)
                {
                    // Affichage spécial pour le déplacement
                    if (ma.IsRelativeMove)
                    {
                        if (ma.X != 0 || ma.Y != 0)
                        {
                            details.Append($"Déplacer de ({ma.X:+0;-0;0}, {ma.Y:+0;-0;0})");
                        }
                        else
                        {
                            details.Append("Déplacer de (0, 0)");
                        }
                    }
                    else
                    {
                        if (ma.X >= 0 && ma.Y >= 0)
                        {
                            details.Append($"Déplacer vers ({ma.X}, {ma.Y})");
                        }
                        else
                        {
                            details.Append("Déplacer vers position actuelle");
                        }
                    }
                    
                    // Afficher la vitesse si elle n'est pas instantanée
                    if (ma.MoveSpeed != Core.Inputs.MoveSpeed.Instant)
                    {
                        details.Append($" • {GetMoveSpeedLabel(ma.MoveSpeed)}");
                    }
                    
                    // Afficher l'easing si ce n'est pas linéaire
                    if (ma.MoveEasing != Core.Inputs.MoveEasing.Linear)
                    {
                        details.Append($" • {GetMoveEasingLabel(ma.MoveEasing)}");
                    }
                    
                    // Afficher le point de contrôle si Bézier est activé
                    if (ma.UseBezierPath && ma.ControlX >= 0 && ma.ControlY >= 0)
                    {
                        details.Append($" • Bézier: ({ma.ControlX}, {ma.ControlY})");
                    }
                    
                    // Afficher le point de contrôle si Bézier est activé
                    if (ma.UseBezierPath && ma.ControlX >= 0 && ma.ControlY >= 0)
                    {
                        details.Append($" • Bézier: ({ma.ControlX}, {ma.ControlY})");
                    }
                }
                else
                {
                    // Affichage normal pour les clics
                    if (ma.X >= 0 && ma.Y >= 0)
                    {
                        details.Append($"Position: ({ma.X}, {ma.Y})");
                    }
                    else
                    {
                        details.Append("Position actuelle");
                    }
                }
            }
            
            // Afficher le delta pour les actions de molette
            bool showDelta = ma.ActionType == Core.Inputs.MouseActionType.WheelUp ||
                           ma.ActionType == Core.Inputs.MouseActionType.WheelDown ||
                           ma.ActionType == Core.Inputs.MouseActionType.Wheel;
            
            if (showDelta)
            {
                if (details.Length > 0)
                {
                    details.Append(" • ");
                }
                details.Append($"Delta: {ma.Delta}");
            }
            
            // Durée de maintien pour Maintenir gauche/droit/milieu
            bool isMaintenir = ma.ActionType == Core.Inputs.MouseActionType.LeftDown ||
                              ma.ActionType == Core.Inputs.MouseActionType.RightDown ||
                              ma.ActionType == Core.Inputs.MouseActionType.MiddleDown;
            if (isMaintenir && ma.HoldDurationMs > 0)
            {
                if (details.Length > 0)
                {
                    details.Append(" • ");
                }
                details.Append($"pendant {ma.HoldDurationMs} ms");
            }
            
            // Scroll continu
            if (ma.ActionType == Core.Inputs.MouseActionType.WheelContinuous)
            {
                var dir = ma.ScrollDirection == Core.Inputs.ScrollDirection.Up ? "haut" : "bas";
                details.Append($"{dir} • {ma.ScrollDurationMs}ms / {ma.ScrollIntervalMs}ms intervalle");
            }
            
            // Zone conditionnelle
            if (ma.ConditionalZoneEnabled)
            {
                if (details.Length > 0)
                {
                    details.Append(" • ");
                }
                details.Append($"Zone: ({ma.ConditionalZoneX1},{ma.ConditionalZoneY1})→({ma.ConditionalZoneX2},{ma.ConditionalZoneY2})");
            }
            
            return details.Length > 0 ? details.ToString() : "";
        }

        private string GetMoveSpeedLabel(Core.Inputs.MoveSpeed speed)
        {
            return speed switch
            {
                Core.Inputs.MoveSpeed.Instant => "Instantané",
                Core.Inputs.MoveSpeed.Fast => "Rapide",
                Core.Inputs.MoveSpeed.Gradual => "Graduel",
                _ => "Instantané"
            };
        }

        private string GetMoveEasingLabel(Core.Inputs.MoveEasing easing)
        {
            return easing switch
            {
                Core.Inputs.MoveEasing.Linear => "Linéaire",
                Core.Inputs.MoveEasing.EaseIn => "Accélération",
                Core.Inputs.MoveEasing.EaseOut => "Décélération",
                Core.Inputs.MoveEasing.EaseInOut => "Ease-in-out",
                _ => "Linéaire"
            };
        }

        private string GetRepeatActionTitle(RepeatAction ra)
        {
            return ra.RepeatMode switch
            {
                RepeatMode.Once => "Répéter 1 fois",
                RepeatMode.RepeatCount => $"Répéter {ra.RepeatCount}x",
                RepeatMode.UntilStopped => "Répéter jusqu'à arrêt",
                RepeatMode.WhileKeyPressed => ra.KeyCodeToMonitor == 0 ? "Répéter tant que touche pressée" : $"Répéter tant que {GetKeyName(ra.KeyCodeToMonitor)} pressée",
                RepeatMode.WhileClickPressed => ra.ClickTypeToMonitor switch
                {
                    0 => "Répéter tant que clic gauche pressé",
                    1 => "Répéter tant que clic droit pressé",
                    2 => "Répéter tant que clic milieu pressé",
                    _ => "Répéter tant que clic pressé"
                },
                _ => "Répéter"
            };
        }

        private string GetIfActionTitle(IfAction ifAction)
        {
            // Mode groupes : (G1) OU (G2) où chaque groupe = conditions en ET
            if (ifAction.ConditionGroups != null && ifAction.ConditionGroups.Count > 0)
            {
                var groupTexts = new List<string>();
                foreach (var group in ifAction.ConditionGroups)
                {
                    if (group?.Conditions == null || group.Conditions.Count == 0) continue;
                    var parts = group.Conditions.Select(c => GetConditionText(c)).Where(s => !string.IsNullOrEmpty(s)).ToList();
                    if (parts.Count > 0)
                        groupTexts.Add(parts.Count == 1 ? parts[0] : "(" + string.Join(" ET ", parts) + ")");
                }
                return groupTexts.Count == 0 ? "Si" : "Si " + string.Join(" OU ", groupTexts);
            }

            // Si plusieurs conditions (mode plat), afficher un résumé
            if (ifAction.Conditions != null && ifAction.Conditions.Count > 1)
            {
                var conditionTexts = new List<string>();
                for (int i = 0; i < ifAction.Conditions.Count; i++)
                {
                    var condition = ifAction.Conditions[i];
                    var conditionText = GetConditionText(condition);
                    conditionTexts.Add(conditionText);
                    
                    if (i < ifAction.Conditions.Count - 1 && i < ifAction.Operators.Count)
                    {
                        var op = ifAction.Operators[i] == LogicalOperator.AND ? "ET" : "OU";
                        conditionTexts.Add(op);
                    }
                }
                return $"Si {string.Join(" ", conditionTexts)}";
            }
            
            // Une seule condition ou compatibilité avec l'ancien format
            if (ifAction.Conditions != null && ifAction.Conditions.Count == 1)
            {
                return GetConditionText(ifAction.Conditions[0]);
            }
            
            // Ancien format (compatibilité)
            return ifAction.ConditionType switch
            {
                ConditionType.Boolean => ifAction.Condition ? "Si (Vrai)" : "Si (Faux)",
                ConditionType.ActiveApplication => ifAction.ActiveApplicationConfig != null
                    ? $"Si {ifAction.ActiveApplicationConfig.ProcessName} est actif"
                    : "Si Application active",
                ConditionType.KeyboardKey => ifAction.KeyboardKeyConfig != null
                    ? $"Si {GetKeyName(ifAction.KeyboardKeyConfig.VirtualKeyCode)} est pressée"
                    : "Si Touche clavier",
                ConditionType.ProcessRunning => ifAction.ProcessRunningConfig != null
                    ? $"Si {ifAction.ProcessRunningConfig.ProcessName} est ouvert"
                    : "Si Processus ouvert",
                ConditionType.PixelColor => ifAction.PixelColorConfig != null
                    ? $"Si pixel ({ifAction.PixelColorConfig.X},{ifAction.PixelColorConfig.Y}) = {ifAction.PixelColorConfig.ExpectedColor}"
                    : "Si Pixel couleur",
                ConditionType.MousePosition => ifAction.MousePositionConfig != null
                    ? $"Si souris dans {ifAction.MousePositionConfig.X1},{ifAction.MousePositionConfig.Y1} → {ifAction.MousePositionConfig.X2},{ifAction.MousePositionConfig.Y2}"
                    : "Si Position souris",
                ConditionType.TimeDate => ifAction.TimeDateConfig != null
                    ? $"Si {ifAction.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(ifAction.TimeDateConfig.Operator)} {ifAction.TimeDateConfig.Value}"
                    : "Si Temps/Date",
                ConditionType.ImageOnScreen => ifAction.ImageOnScreenConfig != null
                    ? $"Si image \"{System.IO.Path.GetFileName(ifAction.ImageOnScreenConfig.ImagePath)}\" visible"
                    : "Si Image à l'écran",
                ConditionType.TextOnScreen => ifAction.TextOnScreenConfig != null
                    ? $"Si texte \"{ifAction.TextOnScreenConfig.Text}\" visible"
                    : "Si Texte à l'écran",
                ConditionType.MouseClick => ifAction.Conditions?.FirstOrDefault()?.MouseClickConfig != null
                    ? $"Si {GetMouseClickLabel(ifAction.Conditions!.First().MouseClickConfig!.ClickType)}"
                    : "Si Clic",
                ConditionType.Variable => !string.IsNullOrEmpty(ifAction.Conditions?.FirstOrDefault()?.VariableName)
                    ? $"Si variable \"{ifAction.Conditions[0].VariableName}\""
                    : "Si Variable",
                _ => "Si"
            };
        }

        private string GetConditionText(ConditionItem condition)
        {
            if (condition == null)
                return "Si (condition vide)";

            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition ? "Si (Vrai)" : "Si (Faux)",
                ConditionType.ActiveApplication => condition.ActiveApplicationConfig != null && condition.ActiveApplicationConfig.ProcessNames != null && condition.ActiveApplicationConfig.ProcessNames.Count > 0
                    ? $"Si {string.Join(" ou ", condition.ActiveApplicationConfig.ProcessNames)} est actif"
                    : "Si Application active",
                ConditionType.KeyboardKey => condition.KeyboardKeyConfig != null && condition.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Si {GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode)} est pressée"
                    : "Si Touche clavier",
                ConditionType.ProcessRunning => condition.ProcessRunningConfig != null && condition.ProcessRunningConfig.ProcessNames != null && condition.ProcessRunningConfig.ProcessNames.Count > 0
                    ? $"Si {string.Join(" ou ", condition.ProcessRunningConfig.ProcessNames)} est ouvert"
                    : "Si Processus ouvert",
                ConditionType.PixelColor => condition.PixelColorConfig != null
                    ? $"Si pixel ({condition.PixelColorConfig.X},{condition.PixelColorConfig.Y}) = {condition.PixelColorConfig.ExpectedColor}"
                    : "Si Pixel couleur",
                ConditionType.MousePosition => condition.MousePositionConfig != null
                    ? $"Si souris dans {condition.MousePositionConfig.X1},{condition.MousePositionConfig.Y1} → {condition.MousePositionConfig.X2},{condition.MousePositionConfig.Y2}"
                    : "Si Position souris",
                ConditionType.TimeDate => condition.TimeDateConfig != null
                    ? $"Si {condition.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(condition.TimeDateConfig.Operator)} {condition.TimeDateConfig.Value}"
                    : "Si Temps/Date",
                ConditionType.ImageOnScreen => condition.ImageOnScreenConfig != null && !string.IsNullOrEmpty(condition.ImageOnScreenConfig.ImagePath)
                    ? $"Si image \"{System.IO.Path.GetFileName(condition.ImageOnScreenConfig.ImagePath)}\" visible"
                    : "Si Image à l'écran",
                ConditionType.TextOnScreen => condition.TextOnScreenConfig != null && !string.IsNullOrEmpty(condition.TextOnScreenConfig.Text)
                    ? $"Si texte \"{(condition.TextOnScreenConfig.Text.Length > 30 ? condition.TextOnScreenConfig.Text.Substring(0, 30) + "..." : condition.TextOnScreenConfig.Text)}\" visible"
                    : "Si Texte à l'écran",
                ConditionType.MouseClick => condition.MouseClickConfig != null
                    ? $"Si {GetMouseClickLabel(condition.MouseClickConfig.ClickType)}"
                    : "Si Clic",
                ConditionType.Variable => !string.IsNullOrEmpty(condition.VariableName)
                    ? $"Si variable \"{condition.VariableName}\""
                    : "Si Variable",
                _ => "Si"
            };
        }

        private static string GetMouseClickLabel(int clickType)
        {
            return clickType switch
            {
                0 => "clic gauche",
                1 => "clic droit",
                2 => "clic milieu",
                3 => "maintenir gauche",
                4 => "maintenir droit",
                5 => "maintenir milieu",
                6 => "molette haut",
                7 => "molette bas",
                _ => "clic gauche"
            };
        }

        private string GetTimeOperatorSymbol(TimeComparisonOperator op)
        {
            return op switch
            {
                TimeComparisonOperator.Equals => "=",
                TimeComparisonOperator.GreaterThan => ">",
                TimeComparisonOperator.LessThan => "<",
                TimeComparisonOperator.GreaterThanOrEqual => ">=",
                TimeComparisonOperator.LessThanOrEqual => "<=",
                _ => "="
            };
        }

        private string GetKeyName(ushort virtualKeyCode)
        {
            if (virtualKeyCode == 0) return "?";
            
            // Touches spéciales
            switch (virtualKeyCode)
            {
                case 0x5B: return "Win";
                case 0x5C: return "Win (droit)";
                case 0x5D: return "Menu";
                case 0x1B: return "Échap";
                case 0x0D: return "Entrée";
                case 0x08: return "Retour";
                case 0x09: return "Tab";
                case 0x20: return "Espace";
                case 0x2E: return "Suppr";
                case 0x2D: return "Insert";
                case 0x24: return "Début";
                case 0x23: return "Fin";
                case 0x21: return "Page ↑";
                case 0x22: return "Page ↓";
                case 0x25: return "←";
                case 0x26: return "↑";
                case 0x27: return "→";
                case 0x28: return "↓";
                case 0x70: return "F1";
                case 0x71: return "F2";
                case 0x72: return "F3";
                case 0x73: return "F4";
                case 0x74: return "F5";
                case 0x75: return "F6";
                case 0x76: return "F7";
                case 0x77: return "F8";
                case 0x78: return "F9";
                case 0x79: return "F10";
                case 0x7A: return "F11";
                case 0x7B: return "F12";
            }
            
            try
            {
                var key = KeyInterop.KeyFromVirtualKey(virtualKeyCode);
                return key.ToString();
            }
            catch
            {
                return $"0x{virtualKeyCode:X2}";
            }
        }

        #region Boutons d'ajout

        private void AddKeyboard_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;
            
            SaveState();
            
            _currentMacro.Actions.Add(new KeyboardAction
            {
                VirtualKeyCode = 0,
                ActionType = KeyboardActionType.Press
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddMouse_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new Core.Inputs.MouseAction
            {
                ActionType = Core.Inputs.MouseActionType.LeftClick,
                X = -1,
                Y = -1
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddDelay_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new DelayAction
            {
                Duration = 100
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddText_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new TextAction
            {
                Text = "",
                TypingSpeed = 50,
                UseNaturalTyping = false
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddVariable_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new VariableAction
            {
                VariableName = "var",
                VariableType = VariableType.Number,
                Operation = VariableOperation.Set,
                Value = "0"
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddRepeat_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new RepeatAction
            {
                RepeatCount = 1,
                DelayBetweenRepeats = 0,
                Actions = new List<IInputAction>()
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void AddIf_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMacro == null) return;

            SaveState();

            _currentMacro.Actions.Add(new IfAction
            {
                Condition = true,
                ThenActions = new List<IInputAction>(),
                ElseActions = new List<IInputAction>()
            });
            _currentMacro.ModifiedAt = DateTime.Now;
            
            AppendBlockAtEnd();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void MoveActionUp(int index)
        {
            if (_currentMacro == null || index <= 0 || index >= _currentMacro.Actions.Count)
                return;

            SaveState();
            
            // Échanger l'action avec celle au-dessus
            var action = _currentMacro.Actions[index];
            _currentMacro.Actions.RemoveAt(index);
            _currentMacro.Actions.Insert(index - 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void MoveActionDown(int index)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count - 1)
                return;

            SaveState();
            
            // Échanger l'action avec celle en dessous
            var action = _currentMacro.Actions[index];
            _currentMacro.Actions.RemoveAt(index);
            _currentMacro.Actions.Insert(index + 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void DeleteActionByIndex(int index)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count)
                return;
            SaveState();
            _currentMacro.Actions.RemoveAt(index);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void DeleteAction_Click(object sender, RoutedEventArgs e)
        {
            if (sender is FrameworkElement fe && fe.Tag is int index)
                DeleteActionByIndex(index);
        }

        #endregion

        #region Édition inline

        private Panel CreateKeyboardActionControls(KeyboardAction ka, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action (Press, Down, Up)
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            actionTypeComboBox.Items.Add("Presser");
            actionTypeComboBox.Items.Add("Maintenir");
            actionTypeComboBox.Items.Add("Relâcher");
            
            // Mapper l'ActionType actuel vers l'index du ComboBox
            actionTypeComboBox.SelectedIndex = ka.ActionType switch
            {
                KeyboardActionType.Press => 0,
                KeyboardActionType.Down => 1,
                KeyboardActionType.Up => 2,
                _ => 0
            };
            editPanel.Children.Add(actionTypeComboBox);

            // Panneau avancé : modificateurs (Ctrl, Alt, Shift, Win)
            var advancedPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var advancedButton = new Button
            {
                Content = "Avancé",
                FontSize = 11,
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                ToolTip = "Afficher les options avancées (modificateurs)"
            };
            if (Application.Current.TryFindResource("ButtonGhost") is Style ghostStyle)
                advancedButton.Style = ghostStyle;
            advancedButton.Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194));
            bool advancedVisible = false;
            advancedButton.Click += (s, e) =>
            {
                advancedVisible = !advancedVisible;
                advancedPanel.Visibility = advancedVisible ? Visibility.Visible : Visibility.Collapsed;
                advancedButton.Content = advancedVisible ? "▲ Avancé" : "Avancé";
            };

            // CheckBoxes pour les modificateurs (texte blanc clair) — dans panneau avancé
            var ctrlCheckBox = new CheckBox
            {
                Content = "Ctrl",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Control)
            };
            ctrlCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Control;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            ctrlCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Control;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            advancedPanel.Children.Add(ctrlCheckBox);

            var altCheckBox = new CheckBox
            {
                Content = "Alt",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Alt)
            };
            altCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Alt;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            altCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Alt;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            advancedPanel.Children.Add(altCheckBox);

            var shiftCheckBox = new CheckBox
            {
                Content = "Shift",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Shift)
            };
            shiftCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Shift;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            shiftCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Shift;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            advancedPanel.Children.Add(shiftCheckBox);

            var winCheckBox = new CheckBox
            {
                Content = "Win",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 8, 0),
                IsChecked = ka.Modifiers.HasFlag(Core.Inputs.ModifierKeys.Windows)
            };
            winCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ka.Modifiers |= Core.Inputs.ModifierKeys.Windows;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            winCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ka.Modifiers &= ~Core.Inputs.ModifierKeys.Windows;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            advancedPanel.Children.Add(winCheckBox);

            // TextBox pour capturer la touche principale
            var keyTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ka.VirtualKeyCode == 0 ? "Appuyez sur une touche..." : GetKeyName(ka.VirtualKeyCode),
                MinWidth = 150,
                MaxWidth = 200,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                IsReadOnly = true,
                Background = GetThemeBrush("AccentSelectionBrush"),
                BorderBrush = GetThemeBrush("AccentPrimaryBrush"),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = Cursors.IBeam,
                ToolTip = "Cliquez puis appuyez sur une touche pour la capturer"
            };
            
            bool keyCaptured = false;
            KeyboardHook? tempKeyHook = null;
            
            keyTextBox.GotFocus += (s, e) =>
            {
                if (!keyCaptured)
                {
                    keyTextBox.Text = "Appuyez sur une touche...";
                    keyTextBox.Background = GetThemeBrush("AccentSelectionBrush");
                    tempKeyHook = new KeyboardHook();
                    tempKeyHook.KeyDown += (sender, args) =>
                    {
                        SaveState();
                        ka.VirtualKeyCode = (ushort)args.VirtualKeyCode;
                        keyTextBox.Text = GetKeyName(ka.VirtualKeyCode);
                        keyTextBox.Background = GetThemeBrush("BackgroundTertiaryBrush");
                        keyCaptured = true;
                        tempKeyHook?.Uninstall();
                        tempKeyHook = null;
                        if (_currentMacro != null)
                        {
                            _currentMacro.ModifiedAt = DateTime.Now;
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                        RefreshBlocks();
                    };
                    tempKeyHook.Install();
                }
            };
            
            keyTextBox.LostFocus += (s, e) =>
            {
                tempKeyHook?.Uninstall();
                tempKeyHook = null;
                if (keyCaptured)
                {
                    keyCaptured = false;
                }
            };
            
            keyTextBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                }
            };
            
            editPanel.Children.Add(keyTextBox);

            editPanel.Children.Add(advancedButton);
            editPanel.Children.Add(advancedPanel);

            // Durée de maintien (ms) pour "Maintenir" — optionnel, vide ou 0 = illimité (texte blanc clair)
            var holdDurationLabel = new TextBlock
            {
                Text = "Durée (optionnel):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 4, 0)
            };
            var holdDurationTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ka.HoldDurationMs > 0 ? ka.HoldDurationMs.ToString() : "",
                MinWidth = 60,
                MaxWidth = 80,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                ToolTip = "Durée en ms (laisser vide = illimité, relâché à la fin de la macro)"
            };
            // Placeholder visuel
            var placeholderText = new TextBlock
            {
                Text = "ms",
                FontSize = 12,
                Foreground = GetThemeBrush("TextMutedBrush"),
                VerticalAlignment = VerticalAlignment.Center,
                IsHitTestVisible = false,
                Margin = new Thickness(-75, 0, 0, 0),
                Visibility = string.IsNullOrEmpty(holdDurationTextBox.Text) ? Visibility.Visible : Visibility.Collapsed
            };
            holdDurationTextBox.TextChanged += (s, e) =>
            {
                placeholderText.Visibility = string.IsNullOrEmpty(holdDurationTextBox.Text) ? Visibility.Visible : Visibility.Collapsed;
            };
            var holdDurationPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            holdDurationPanel.Children.Add(holdDurationLabel);
            holdDurationPanel.Children.Add(holdDurationTextBox);
            holdDurationPanel.Children.Add(placeholderText);
            holdDurationPanel.Visibility = ka.ActionType == KeyboardActionType.Down ? Visibility.Visible : Visibility.Collapsed;
            editPanel.Children.Add(holdDurationPanel);

            void UpdateHoldDurationVisibility()
            {
                holdDurationPanel.Visibility = ka.ActionType == KeyboardActionType.Down ? Visibility.Visible : Visibility.Collapsed;
            }

            holdDurationTextBox.LostFocus += (s, e) =>
            {
                var text = holdDurationTextBox.Text.Trim();
                int ms = 0;
                if (!string.IsNullOrEmpty(text) && (!int.TryParse(text, out ms) || ms < 0))
                {
                    holdDurationTextBox.Text = ka.HoldDurationMs > 0 ? ka.HoldDurationMs.ToString() : "";
                    return;
                }
                if (ka.HoldDurationMs != ms)
                {
                    SaveState();
                    ka.HoldDurationMs = ms;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    ka.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => KeyboardActionType.Press,
                        1 => KeyboardActionType.Down,
                        2 => KeyboardActionType.Up,
                        _ => KeyboardActionType.Press
                    };
                    UpdateHoldDurationVisibility();
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            return editPanel;
        }

        private void EditKeyboardAction(KeyboardAction ka, int index, TextBlock titleText)
        {
            // Édition inline : remplacer le TextBlock par un TextBox qui capture la touche
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
            {
                System.Diagnostics.Debug.WriteLine("EditKeyboardAction: parentPanel is null");
                return;
            }
            
            bool keyCaptured = false;
            
            // Sauvegarder les propriétés du TextBlock pour restaurer plus tard
            var originalMargin = titleText.Margin;
            var originalWidth = titleText.Width;
            
            var textBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = "Appuyez sur une touche...",
                MinWidth = 150,
                MaxWidth = 300,
                TextAlignment = TextAlignment.Center,
                IsReadOnly = true,
                Background = GetThemeBrush("AccentSelectionBrush"), // Fond jaune clair pour être visible
                BorderBrush = GetThemeBrush("AccentPrimaryBrush"), // Bordure orange pour être visible
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin, // Conserver la même marge
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };
            
            // Événement PreviewKeyDown pour capturer la touche avant qu'elle ne soit traitée
            textBox.PreviewKeyDown += (s, e) =>
            {
                // Ignorer les touches de modification seules
                if (e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl ||
                    e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                    e.Key == Key.LeftAlt || e.Key == Key.RightAlt ||
                    e.Key == Key.LWin || e.Key == Key.RWin)
                {
                    e.Handled = true;
                    return;
                }
                
                // Ignorer Escape pour annuler
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                    // Restaurer le TextBlock si on annule
                    if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                    return;
                }
                
                // Capturer la touche
                try
                {
                    int virtualKeyCode = KeyInterop.VirtualKeyFromKey(e.Key);
                    SaveState();
                    ka.VirtualKeyCode = (ushort)virtualKeyCode;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    keyCaptured = true;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                    e.Handled = true;
                    Keyboard.ClearFocus();
                }
                catch
                {
                    // Ignorer les erreurs de conversion
                    e.Handled = true;
                }
            };
            
            // Nettoyer si on perd le focus sans avoir capturé de touche
            textBox.LostFocus += (s, e) =>
            {
                if (parentPanel.Children.Contains(textBox) && !keyCaptured)
                {
                    // Restaurer le TextBlock si on n'a pas capturé de touche
                    int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                    parentPanel.Children.RemoveAt(textBoxIdx);
                    parentPanel.Children.Insert(textBoxIdx, titleText);
                }
            };
            
            // Remplacer le TextBlock par le TextBox
            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
            {
                System.Diagnostics.Debug.WriteLine("EditKeyboardAction: titleText not found in parentPanel");
                return;
            }
            
            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);
            
            // Mettre le focus de manière asynchrone pour s'assurer que le layout est mis à jour
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        private Panel CreateDelayActionControls(DelayAction da, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            var delayAccent = Color.FromRgb(201, 122, 58); // #C97A3A (même style que coordonnées X/Y)
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // TextBox durée (juste l'input, comme X) : texte à gauche pour commencer juste sous "DURÉE"
            var durationTextBox = new TextBox
            {
                Text = da.GetDurationInUnit(da.Unit).ToString("0.##"),
                Width = 80,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0),
                Visibility = (da.IsRandom || da.UseVariableDelay) ? Visibility.Collapsed : Visibility.Visible
            };
            durationTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            durationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(durationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            durationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(durationTextBox.Text, out double value) || value < 0)
                {
                    durationTextBox.Text = da.GetDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };

            // Colonne « durée » : même structure que les segments X/Y (Border + Stack vertical label + champ)
            var delaySegBrush = GetThemeBrush("BorderLightBrush") ?? new SolidColorBrush(Color.FromRgb(0x1F, 0x24, 0x1F));
            var delaySegLabel = new TextBlock
            {
                Text = "DURÉE",
                FontSize = 8,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x4A, 0x5A, 0x4A)),
                Margin = new Thickness(0, 0, 0, 2)
            };
            delaySegLabel.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            var durationSegStack = new StackPanel
            {
                Orientation = Orientation.Vertical,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center
            };
            durationSegStack.Children.Add(delaySegLabel);
            durationSegStack.Children.Add(durationTextBox);
            var durationSegBorder = new Border
            {
                Child = durationSegStack,
                Padding = new Thickness(0, 0, 14, 0),
                BorderBrush = delaySegBrush,
                BorderThickness = new Thickness(0, 0, 1, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                Margin = new Thickness(0, 0, 8, 0)
            };
            editPanel.Children.Add(durationSegBorder);

            editPanel.Children.Add(CreateDelayActionRestControls(da, index, durationTextBox));
            return editPanel;
        }

        private Panel CreateDelayActionRestControls(DelayAction da, int index, TextBox durationTextBox, bool unitSelectorInSegment = false)
        {
            var delayAccent = Color.FromRgb(201, 122, 58);
            var restPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0)
            };

            // Délais aléatoire (Min et Max) – même style que durée normale
            var minDurationTextBox = new TextBox
            {
                Text = da.GetMinDurationInUnit(da.Unit).ToString("0.##"),
                Width = 70,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            minDurationTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            minDurationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(minDurationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetMinDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            minDurationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(minDurationTextBox.Text, out double value) || value < 0)
                {
                    minDurationTextBox.Text = da.GetMinDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            restPanel.Children.Add(minDurationTextBox);

            var andLabel = new TextBlock
            {
                Text = "et",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            restPanel.Children.Add(andLabel);

            var maxDurationTextBox = new TextBox
            {
                Text = da.GetMaxDurationInUnit(da.Unit).ToString("0.##"),
                Width = 70,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = da.IsRandom ? Visibility.Visible : Visibility.Collapsed
            };
            maxDurationTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            maxDurationTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(maxDurationTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.SetMaxDurationFromUnit(value, da.Unit);
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            maxDurationTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(maxDurationTextBox.Text, out double value) || value < 0)
                {
                    maxDurationTextBox.Text = da.GetMaxDurationInUnit(da.Unit).ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            restPanel.Children.Add(maxDurationTextBox);

            // Panneau avancé : Variable, Jitter
            var delayAdvancedPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var delayAdvancedButton = new Button
            {
                Content = "Avancé",
                FontSize = 11,
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                ToolTip = "Afficher les options avancées (variable, jitter)"
            };
            if (Application.Current.TryFindResource("ButtonGhost") is Style delayGhostStyle)
                delayAdvancedButton.Style = delayGhostStyle;
            delayAdvancedButton.Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194));
            bool delayAdvancedVisible = false;
            delayAdvancedButton.Click += (s, e) =>
            {
                delayAdvancedVisible = !delayAdvancedVisible;
                delayAdvancedPanel.Visibility = delayAdvancedVisible ? Visibility.Visible : Visibility.Collapsed;
                delayAdvancedButton.Content = delayAdvancedVisible ? "▲ Avancé" : "Avancé";
            };

            // CheckBox pour le mode variable (texte blanc clair) — dans panneau avancé
            var variableCheckBox = new CheckBox
            {
                Content = "Variable",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = da.UseVariableDelay,
                ToolTip = "Utiliser une variable pour définir le délai (ex: baseDelay * 1.5)"
            };

            // TextBox pour le nom de variable (même style que durée)
            var variableNameTextBox = new TextBox
            {
                Text = da.VariableName ?? "",
                Width = 100,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = da.UseVariableDelay ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Nom de la variable à utiliser pour le délai"
            };
            variableNameTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            variableNameTextBox.TextChanged += (s, e) =>
            {
                SaveState();
                da.VariableName = variableNameTextBox.Text;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            variableNameTextBox.LostFocus += (s, e) =>
            {
                RefreshBlocks();
            };
            delayAdvancedPanel.Children.Add(variableCheckBox);
            delayAdvancedPanel.Children.Add(variableNameTextBox);

            var multiplyLabel = new TextBlock
            {
                Text = "×",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                Visibility = da.UseVariableDelay ? Visibility.Visible : Visibility.Collapsed
            };
            delayAdvancedPanel.Children.Add(multiplyLabel);

            var multiplierTextBox = new TextBox
            {
                Text = da.VariableMultiplier.ToString("0.##"),
                Width = 60,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = da.UseVariableDelay ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Multiplicateur (ex: 1.5 pour baseDelay * 1.5)"
            };
            multiplierTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            multiplierTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(multiplierTextBox.Text, out double value))
                {
                    SaveState();
                    da.VariableMultiplier = value;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            multiplierTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(multiplierTextBox.Text, out double value))
                {
                    multiplierTextBox.Text = da.VariableMultiplier.ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            delayAdvancedPanel.Children.Add(multiplierTextBox);

            // CheckBox pour le mode aléatoire (texte blanc clair)
            var randomCheckBox = new CheckBox
            {
                Content = "Aléatoire",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = da.IsRandom
            };

            variableCheckBox.Checked += (s, e) =>
            {
                SaveState();
                da.UseVariableDelay = true;
                da.IsRandom = false;
                variableNameTextBox.Visibility = Visibility.Visible;
                multiplyLabel.Visibility = Visibility.Visible;
                multiplierTextBox.Visibility = Visibility.Visible;
                durationTextBox.Visibility = Visibility.Collapsed;
                minDurationTextBox.Visibility = Visibility.Collapsed;
                andLabel.Visibility = Visibility.Collapsed;
                maxDurationTextBox.Visibility = Visibility.Collapsed;
                randomCheckBox.IsChecked = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            variableCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                da.UseVariableDelay = false;
                variableNameTextBox.Visibility = Visibility.Collapsed;
                multiplyLabel.Visibility = Visibility.Collapsed;
                multiplierTextBox.Visibility = Visibility.Collapsed;
                durationTextBox.Visibility = da.IsRandom ? Visibility.Collapsed : Visibility.Visible;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };

            randomCheckBox.Checked += (s, e) =>
            {
                SaveState();
                da.IsRandom = true;
                da.UseVariableDelay = false;
                minDurationTextBox.Visibility = Visibility.Visible;
                andLabel.Visibility = Visibility.Visible;
                maxDurationTextBox.Visibility = Visibility.Visible;
                durationTextBox.Visibility = Visibility.Collapsed;
                variableNameTextBox.Visibility = Visibility.Collapsed;
                multiplyLabel.Visibility = Visibility.Collapsed;
                multiplierTextBox.Visibility = Visibility.Collapsed;
                variableCheckBox.IsChecked = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            randomCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                da.IsRandom = false;
                minDurationTextBox.Visibility = Visibility.Collapsed;
                andLabel.Visibility = Visibility.Collapsed;
                maxDurationTextBox.Visibility = Visibility.Collapsed;
                durationTextBox.Visibility = da.UseVariableDelay ? Visibility.Collapsed : Visibility.Visible;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            restPanel.Children.Add(randomCheckBox);

            restPanel.Children.Add(delayAdvancedButton);
            restPanel.Children.Add(delayAdvancedPanel);

            // Label et TextBox pour Jitter (%) — dans panneau avancé
            var jitterLabel = new TextBlock
            {
                Text = "Jitter (%):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Variation aléatoire autour de la valeur (ex: ±10%)"
            };
            delayAdvancedPanel.Children.Add(jitterLabel);

            var jitterTextBox = new TextBox
            {
                Text = da.JitterPercent.ToString("0.##"),
                Width = 50,
                MinWidth = 56,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(delayAccent),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                CaretBrush = new SolidColorBrush(delayAccent),
                Margin = new Thickness(0, 0, 8, 0),
                ToolTip = "Ex: 10 pour ±10% de variation"
            };
            jitterTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontDisplay");
            jitterTextBox.TextChanged += (s, e) =>
            {
                if (TryParseDouble(jitterTextBox.Text, out double value) && value >= 0)
                {
                    SaveState();
                    da.JitterPercent = value;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            jitterTextBox.LostFocus += (s, e) =>
            {
                if (!TryParseDouble(jitterTextBox.Text, out double value) || value < 0)
                {
                    jitterTextBox.Text = da.JitterPercent.ToString("0.##");
                }
                else
                {
                    RefreshBlocks();
                }
            };
            delayAdvancedPanel.Children.Add(jitterTextBox);

            // ComboBox pour l'unité de temps (omis si déjà dans le segment UNITÉ de la carte)
            if (!unitSelectorInSegment)
            {
            var unitComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0)
            };
            unitComboBox.Items.Add("ms");
            unitComboBox.Items.Add("s");
            unitComboBox.Items.Add("min");
            unitComboBox.SelectedIndex = da.Unit switch
            {
                TimeUnit.Milliseconds => 0,
                TimeUnit.Seconds => 1,
                TimeUnit.Minutes => 2,
                _ => 0
            };
            unitComboBox.SelectionChanged += (s, e) =>
            {
                if (unitComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    double currentValue = TryParseDouble(durationTextBox.Text, out double val) ? val : da.GetDurationInUnit(da.Unit);
                    var newUnit = unitComboBox.SelectedIndex switch
                    {
                        0 => TimeUnit.Milliseconds,
                        1 => TimeUnit.Seconds,
                        2 => TimeUnit.Minutes,
                        _ => TimeUnit.Milliseconds
                    };
                    da.Unit = newUnit;
                    da.SetDurationFromUnit(currentValue, newUnit);
                    durationTextBox.Text = currentValue.ToString("0.##");
                    if (da.IsRandom)
                    {
                        double minValue = TryParseDouble(minDurationTextBox.Text, out double minVal) ? minVal : da.GetMinDurationInUnit(da.Unit);
                        double maxValue = TryParseDouble(maxDurationTextBox.Text, out double maxVal) ? maxVal : da.GetMaxDurationInUnit(da.Unit);
                        da.SetMinDurationFromUnit(minValue, newUnit);
                        da.SetMaxDurationFromUnit(maxValue, newUnit);
                        minDurationTextBox.Text = minValue.ToString("0.##");
                        maxDurationTextBox.Text = maxValue.ToString("0.##");
                    }
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
                restPanel.Children.Add(unitComboBox);
            }

            return restPanel;
        }

        private Panel CreateTextActionControls(TextAction ta, int index, Panel parentPanel)
        {
            var originalMargin = new Thickness(0, 0, 0, 0);
            
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // Label "Texte:"
            var textLabel = new TextBlock
            {
                Text = "Texte:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            editPanel.Children.Add(textLabel);

            // TextBox pour le texte (variables: ex. "Score: {score}")
            var textTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ta.Text ?? "",
                MinWidth = 200,
                MaxWidth = 400,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                AcceptsReturn = true,
                TextWrapping = TextWrapping.Wrap,
                MaxHeight = 60,
                ToolTip = "Variables: utilisez {nomVariable} pour insérer une variable. Ex: Score: {score}"
            };
            textTextBox.TextChanged += (s, e) =>
            {
                SaveState();
                ta.Text = textTextBox.Text;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            textTextBox.LostFocus += (s, e) =>
            {
                RefreshBlocks();
            };
            editPanel.Children.Add(textTextBox);

            // Panneau avancé texte : Coller, Effacer avant, Masquer logs, Frappe naturelle, vitesse, etc.
            var textAdvancedPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var textAdvancedButton = new Button
            {
                Content = "Avancé",
                FontSize = 11,
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                ToolTip = "Afficher les options avancées (coller, effacer, vitesse, etc.)"
            };
            if (Application.Current.TryFindResource("ButtonGhost") is Style textGhostStyle)
                textAdvancedButton.Style = textGhostStyle;
            textAdvancedButton.Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194));
            bool textAdvancedVisible = false;
            textAdvancedButton.Click += (s, e) =>
            {
                textAdvancedVisible = !textAdvancedVisible;
                textAdvancedPanel.Visibility = textAdvancedVisible ? Visibility.Visible : Visibility.Collapsed;
                textAdvancedButton.Content = textAdvancedVisible ? "▲ Avancé" : "Avancé";
            };
            editPanel.Children.Add(textAdvancedButton);
            editPanel.Children.Add(textAdvancedPanel);

            // CheckBox pour coller tout d'un coup (texte blanc clair) — dans panneau avancé
            var pasteAtOnceCheckBox = new CheckBox
            {
                Content = "Coller",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.PasteAtOnce
            };
            pasteAtOnceCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.PasteAtOnce = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            pasteAtOnceCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.PasteAtOnce = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            textAdvancedPanel.Children.Add(pasteAtOnceCheckBox);

            // CheckBox Effacer avant (texte blanc clair)
            var clearBeforeCheckBox = new CheckBox
            {
                Content = "Effacer avant",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.ClearBefore,
                ToolTip = "Ctrl+A puis Suppr avant de saisir le texte"
            };
            clearBeforeCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.ClearBefore = true;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                RefreshBlocks();
            };
            clearBeforeCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.ClearBefore = false;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                RefreshBlocks();
            };
            textAdvancedPanel.Children.Add(clearBeforeCheckBox);

            // CheckBox Masquer dans les logs (texte blanc clair)
            var hideInLogsCheckBox = new CheckBox
            {
                Content = "Masquer dans les logs",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.HideInLogs,
                ToolTip = "Ne pas afficher le texte dans les logs (mots de passe)"
            };
            hideInLogsCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.HideInLogs = true;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                RefreshBlocks();
            };
            hideInLogsCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.HideInLogs = false;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                RefreshBlocks();
            };
            textAdvancedPanel.Children.Add(hideInLogsCheckBox);

            // CheckBox pour la frappe naturelle (texte blanc clair)
            var naturalTypingCheckBox = new CheckBox
            {
                Content = "Frappe naturelle",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 8, 0),
                IsChecked = ta.UseNaturalTyping,
                Visibility = ta.PasteAtOnce ? Visibility.Collapsed : Visibility.Visible
            };
            naturalTypingCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ta.UseNaturalTyping = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            naturalTypingCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ta.UseNaturalTyping = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            textAdvancedPanel.Children.Add(naturalTypingCheckBox);

            // TextBox pour la vitesse de frappe (visible si pas de frappe naturelle et pas "Coller", texte blanc clair)
            var speedLabel = new TextBlock
            {
                Text = "Vitesse:",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            textAdvancedPanel.Children.Add(speedLabel);

            var speedTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ta.TypingSpeed.ToString(),
                Width = 60,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            speedTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(speedTextBox.Text, out int speed) && speed >= 0)
                {
                    SaveState();
                    ta.TypingSpeed = speed;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            speedTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(speedTextBox.Text, out int speed) || speed < 0)
                {
                    speedTextBox.Text = ta.TypingSpeed.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            textAdvancedPanel.Children.Add(speedTextBox);

            var msLabel = new TextBlock
            {
                Text = "ms",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (ta.UseNaturalTyping || ta.PasteAtOnce) ? Visibility.Collapsed : Visibility.Visible
            };
            textAdvancedPanel.Children.Add(msLabel);

            // TextBox pour délai min (visible si frappe naturelle et pas "Coller", texte blanc clair)
            var minDelayLabel = new TextBlock
            {
                Text = "Min:",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            textAdvancedPanel.Children.Add(minDelayLabel);

            var minDelayTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ta.MinDelay.ToString(),
                Width = 50,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            minDelayTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(minDelayTextBox.Text, out int minDelay) && minDelay >= 0)
                {
                    SaveState();
                    ta.MinDelay = minDelay;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            minDelayTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(minDelayTextBox.Text, out int minDelay) || minDelay < 0)
                {
                    minDelayTextBox.Text = ta.MinDelay.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            textAdvancedPanel.Children.Add(minDelayTextBox);

            // Label "et" (texte blanc clair)
            var andLabel = new TextBlock
            {
                Text = "et",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(4, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            textAdvancedPanel.Children.Add(andLabel);

            // TextBox pour délai max (visible si frappe naturelle et pas "Coller", texte blanc clair)
            var maxDelayLabel = new TextBlock
            {
                Text = "Max:",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            textAdvancedPanel.Children.Add(maxDelayLabel);

            var maxDelayTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ta.MaxDelay.ToString(),
                Width = 50,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            maxDelayTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(maxDelayTextBox.Text, out int maxDelay) && maxDelay >= 0)
                {
                    SaveState();
                    ta.MaxDelay = maxDelay;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            maxDelayTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(maxDelayTextBox.Text, out int maxDelay) || maxDelay < 0)
                {
                    maxDelayTextBox.Text = ta.MaxDelay.ToString();
                }
                else
                {
                    RefreshBlocks();
                }
            };
            textAdvancedPanel.Children.Add(maxDelayTextBox);

            var msLabel2 = new TextBlock
            {
                Text = "ms",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0),
                Visibility = (ta.UseNaturalTyping && !ta.PasteAtOnce) ? Visibility.Visible : Visibility.Collapsed
            };
            textAdvancedPanel.Children.Add(msLabel2);

            // Mettre à jour la visibilité des contrôles quand le mode frappe naturelle change
            naturalTypingCheckBox.Checked += (s, e) =>
            {
                speedLabel.Visibility = Visibility.Collapsed;
                speedTextBox.Visibility = Visibility.Collapsed;
                msLabel.Visibility = Visibility.Collapsed;
                minDelayLabel.Visibility = Visibility.Visible;
                minDelayTextBox.Visibility = Visibility.Visible;
                andLabel.Visibility = Visibility.Visible;
                maxDelayLabel.Visibility = Visibility.Visible;
                maxDelayTextBox.Visibility = Visibility.Visible;
                msLabel2.Visibility = Visibility.Visible;
            };
            naturalTypingCheckBox.Unchecked += (s, e) =>
            {
                speedLabel.Visibility = Visibility.Visible;
                speedTextBox.Visibility = Visibility.Visible;
                msLabel.Visibility = Visibility.Visible;
                minDelayLabel.Visibility = Visibility.Collapsed;
                minDelayTextBox.Visibility = Visibility.Collapsed;
                andLabel.Visibility = Visibility.Collapsed;
                maxDelayLabel.Visibility = Visibility.Collapsed;
                maxDelayTextBox.Visibility = Visibility.Collapsed;
                msLabel2.Visibility = Visibility.Collapsed;
            };

            return editPanel;
        }

        private static readonly string[] VariableTypeLabels = { "Nombre", "Texte", "Booléen" };
        private static readonly string[] VariableOperationLabels = { "Définir", "Incrémenter", "Décrémenter", "Inverser", "Expression" };

        private Panel CreateVariableActionControls(VariableAction va, int index, Panel parentPanel)
        {
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0)
            };

            var nameLabel = new TextBlock
            {
                Text = "Nom:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };
            editPanel.Children.Add(nameLabel);

            var nameTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = va.VariableName ?? "",
                MinWidth = 80,
                MaxWidth = 150,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0),
                ToolTip = "Lettres, chiffres, tirets bas (espaces → _)"
            };
            nameTextBox.TextChanged += (s, e) =>
            {
                SaveState();
                va.VariableName = nameTextBox.Text?.Trim() ?? "";
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
            };
            nameTextBox.LostFocus += (s, e) => RefreshBlocks();
            editPanel.Children.Add(nameTextBox);

            var typeLabel = new TextBlock
            {
                Text = "Type:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };
            editPanel.Children.Add(typeLabel);

            var valueLabel = new TextBlock
            {
                Text = "Valeur:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0),
                Visibility = (va.Operation == VariableOperation.Set || va.Operation == VariableOperation.EvaluateExpression) ? Visibility.Visible : Visibility.Collapsed
            };
            var valueTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = va.Value ?? "",
                MinWidth = 120,
                MaxWidth = 250,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (va.Operation == VariableOperation.Set || va.Operation == VariableOperation.EvaluateExpression) ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Ex: 0, counter + 1, true, \"texte\""
            };
            valueTextBox.TextChanged += (s, e) =>
            {
                SaveState();
                va.Value = valueTextBox.Text ?? "";
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
            };
            valueTextBox.LostFocus += (s, e) => RefreshBlocks();

            var stepLabel = new TextBlock
            {
                Text = "Pas:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0),
                Visibility = (va.Operation == VariableOperation.Increment || va.Operation == VariableOperation.Decrement) ? Visibility.Visible : Visibility.Collapsed
            };
            var stepTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = va.Step.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Width = 50,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (va.Operation == VariableOperation.Increment || va.Operation == VariableOperation.Decrement) ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Valeur d'incrément ou de décrément"
            };
            stepTextBox.TextChanged += (s, e) =>
            {
                if (double.TryParse(stepTextBox.Text?.Replace(",", "."), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double step))
                {
                    SaveState();
                    va.Step = step;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                }
            };
            stepTextBox.LostFocus += (s, e) =>
            {
                if (!double.TryParse(stepTextBox.Text?.Replace(",", "."), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _))
                    stepTextBox.Text = va.Step.ToString(System.Globalization.CultureInfo.InvariantCulture);
                RefreshBlocks();
            };

            var opLabel = new TextBlock
            {
                Text = "Opération:",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };
            var opCombo = new ComboBox
            {
                MinWidth = 120,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0)
            };
            UpdateVariableOperationCombo(opCombo, va);
            opCombo.SelectionChanged += (s, e) =>
            {
                if (opCombo.SelectedIndex >= 0 && GetVariableOperationFromIndex(opCombo.SelectedIndex, va.VariableType, out VariableOperation selectedOp))
                {
                    SaveState();
                    va.Operation = selectedOp;
                    UpdateVariableFieldsVisibility(va, valueLabel, valueTextBox, stepLabel, stepTextBox);
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                    RefreshBlocks();
                }
            };

            var typeCombo = new ComboBox
            {
                MinWidth = 90,
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0)
            };
            foreach (var label in VariableTypeLabels) typeCombo.Items.Add(label);
            typeCombo.SelectedIndex = (int)va.VariableType;
            typeCombo.SelectionChanged += (s, e) =>
            {
                if (typeCombo.SelectedIndex >= 0)
                {
                    SaveState();
                    va.VariableType = (VariableType)typeCombo.SelectedIndex;
                    UpdateVariableOperationCombo(opCombo, va);
                    UpdateVariableFieldsVisibility(va, valueLabel, valueTextBox, stepLabel, stepTextBox);
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                    RefreshBlocks();
                }
            };

            editPanel.Children.Add(typeCombo);
            editPanel.Children.Add(opLabel);
            editPanel.Children.Add(opCombo);
            editPanel.Children.Add(valueLabel);
            editPanel.Children.Add(valueTextBox);
            editPanel.Children.Add(stepLabel);
            editPanel.Children.Add(stepTextBox);

            return editPanel;
        }

        private static void UpdateVariableOperationCombo(ComboBox opCombo, VariableAction va)
        {
            opCombo.Items.Clear();
            var ops = GetVariableOperationsForType(va.VariableType);
            foreach (var op in ops)
                opCombo.Items.Add(VariableOperationLabels[(int)op]);
            int idx = ops.IndexOf(va.Operation);
            if (idx < 0) { va.Operation = ops[0]; idx = 0; }
            opCombo.SelectedIndex = idx;
        }

        private static System.Collections.Generic.List<VariableOperation> GetVariableOperationsForType(VariableType vt)
        {
            return vt switch
            {
                VariableType.Number => new System.Collections.Generic.List<VariableOperation>
                    { VariableOperation.Set, VariableOperation.Increment, VariableOperation.Decrement, VariableOperation.EvaluateExpression },
                VariableType.Text => new System.Collections.Generic.List<VariableOperation>
                    { VariableOperation.Set, VariableOperation.EvaluateExpression },
                VariableType.Boolean => new System.Collections.Generic.List<VariableOperation>
                    { VariableOperation.Set, VariableOperation.Toggle, VariableOperation.EvaluateExpression },
                _ => new System.Collections.Generic.List<VariableOperation> { VariableOperation.Set }
            };
        }

        private static bool GetVariableOperationFromIndex(int index, VariableType vt, out VariableOperation op)
        {
            var ops = GetVariableOperationsForType(vt);
            if (index >= 0 && index < ops.Count) { op = ops[index]; return true; }
            op = VariableOperation.Set;
            return false;
        }

        private static void UpdateVariableFieldsVisibility(VariableAction va, TextBlock valueLabel, TextBox valueTextBox, TextBlock stepLabel, TextBox stepTextBox)
        {
            bool showValue = va.Operation == VariableOperation.Set || va.Operation == VariableOperation.EvaluateExpression;
            bool showStep = va.Operation == VariableOperation.Increment || va.Operation == VariableOperation.Decrement;
            valueLabel.Visibility = valueTextBox.Visibility = showValue ? Visibility.Visible : Visibility.Collapsed;
            stepLabel.Visibility = stepTextBox.Visibility = showStep ? Visibility.Visible : Visibility.Collapsed;
        }

        private void EditDelayAction(DelayAction da, int index, TextBlock titleText)
        {
            // Cette fonction n'est plus utilisée, remplacée par CreateDelayActionControls
            // Conservée pour compatibilité si nécessaire
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;
            var editPanel = CreateDelayActionControls(da, index, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditDelayActionOld(DelayAction da, int index, TextBlock titleText)
        {
            // Édition inline : remplacer le TextBlock par un TextBox qui capture le délai
            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
            {
                System.Diagnostics.Debug.WriteLine("EditDelayAction: parentPanel is null");
                return;
            }
            
            bool delaySaved = false;
            int originalDelay = da.Duration; // Sauvegarder la valeur originale pour restauration si annulé
            
            // Sauvegarder les propriétés du TextBlock pour restaurer plus tard
            var originalMargin = titleText.Margin;
            
            var textBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = da.Duration.ToString(),
                MinWidth = 60,
                MaxWidth = 120,
                TextAlignment = TextAlignment.Center,
                Background = GetThemeBrush("BackgroundTertiaryBrush"),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Margin = originalMargin,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };
            
            // Validation : n'accepter que les nombres entiers
            textBox.PreviewTextInput += (s, e) => e.Handled = !int.TryParse(e.Text, out _);
            
            // Sauvegarder automatiquement quand on perd le focus (clic ailleurs)
            textBox.LostFocus += (s, e) =>
            {
                if (delaySaved) return; // Déjà sauvegardé, ne rien faire
                
                if (int.TryParse(textBox.Text, out int delay) && delay > 0)
                {
                    SaveState();
                    da.Duration = delay;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    delaySaved = true;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    // Valeur invalide : restaurer le TextBlock avec la valeur originale
                    if (parentPanel.Children.Contains(textBox))
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                }
            };
            
            // Gestion des touches : Enter pour confirmer, Escape pour annuler
            textBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int delay) && delay > 0)
                    {
                        SaveState();
                        da.Duration = delay;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        delaySaved = true;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    Keyboard.ClearFocus();
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    Keyboard.ClearFocus();
                    // Restaurer le TextBlock avec la valeur originale si on annule
                    if (parentPanel.Children.Contains(textBox) && !delaySaved)
                    {
                        int textBoxIdx = parentPanel.Children.IndexOf(textBox);
                        parentPanel.Children.RemoveAt(textBoxIdx);
                        parentPanel.Children.Insert(textBoxIdx, titleText);
                    }
                }
            };
            
            // Remplacer le TextBlock par le TextBox
            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
            {
                System.Diagnostics.Debug.WriteLine("EditDelayAction: titleText not found in parentPanel");
                return;
            }
            
            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);
            
            // Mettre le focus de manière asynchrone pour s'assurer que le layout est mis à jour
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        /// <summary>
        /// Édition inline d'une KeyboardAction imbriquée dans un RepeatAction
        /// </summary>
        private void EditNestedKeyboardAction(NestedActionInfo info, TextBlock titleText)
        {
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex))
                return;

            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not KeyboardAction ka)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;
            var editPanel = CreateKeyboardActionControls(ka, info.ParentIndex >= 0 ? info.IfActionIndex : info.ParentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        /// <summary>
        /// Édition inline d'une DelayAction imbriquée dans un RepeatAction (niveau racine ou Repeat dans If).
        /// </summary>
        private void EditNestedDelayAction(NestedActionInfo info, TextBlock titleText)
        {
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex))
                return;

            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var indexForControls = info.IfActionIndex >= 0 ? info.IfActionIndex : info.ParentIndex;
            var originalMargin = titleText.Margin;
            var editPanel = CreateDelayActionControls(da, indexForControls, parentPanel);
            editPanel.Margin = originalMargin;

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditNestedDelayActionOld(int parentIndex, int nestedIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not RepeatAction repeatAction)
                return;

            if (repeatAction.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            bool delaySaved = false;
            int originalDelay = da.Duration;
            var originalMargin = titleText.Margin;

            var textBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = da.Duration.ToString(),
                MinWidth = 60,
                MaxWidth = 120,
                TextAlignment = TextAlignment.Center,
                Background = GetThemeBrush("BackgroundTertiaryBrush"),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(4),
                Margin = originalMargin,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left,
                Cursor = Cursors.IBeam,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            };

            textBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);

            textBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro.ModifiedAt = DateTime.Now;
                        delaySaved = true;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                        Keyboard.ClearFocus();
                    }
                    else
                    {
                        textBox.Text = originalDelay.ToString();
                    }
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    textBox.Text = originalDelay.ToString();
                    Keyboard.ClearFocus();
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                if (!delaySaved)
                {
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    else
                    {
                        textBox.Text = originalDelay.ToString();
                    }
                }
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        /// <summary>
        /// Crée les contrôles inline pour une action MouseAction (toujours visibles dans la carte)
        /// </summary>
        private StackPanel CreateMouseActionControls(Core.Inputs.MouseAction ma, int index, Panel parentPanel)
        {
            // Créer un panel horizontal pour tous les contrôles
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // ComboBox 1 : Gauche / Droit / Milieu / Molette haut / Molette bas
            var clicAccent = Color.FromRgb(52, 200, 184);   // #34C8B8
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 110,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(clicAccent),
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };
            actionTypeComboBox.SetResourceReference(ComboBox.StyleProperty, "ComboBoxNoBackground");
            actionTypeComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontDisplay");
            actionTypeComboBox.Items.Add("Gauche");        // 0
            actionTypeComboBox.Items.Add("Droit");        // 1
            actionTypeComboBox.Items.Add("Milieu");       // 2
            actionTypeComboBox.Items.Add("Molette haut"); // 3
            actionTypeComboBox.Items.Add("Molette bas");  // 4

            // ComboBox 2 : état — Maintenant / Pressé (pour clics) ou "Activée" (pour molettes)
            var stateComboBox = new ComboBox
            {
                MinWidth = 88,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)),
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            stateComboBox.SetResourceReference(ComboBox.StyleProperty, "ComboBoxNoBackground");
            stateComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontDisplay");
            stateComboBox.Items.Add("Maintenant");  // 0 = clic instantané
            stateComboBox.Items.Add("Pressé");      // 1 = maintenir (down)

            // Mapper ActionType → (typeIndex, stateIndex). Pour molette on n'utilise pas stateComboBox (affiché "Activée").
            int TypeIndexFromAction(Core.Inputs.MouseActionType t)
            {
                return t switch
                {
                    Core.Inputs.MouseActionType.LeftClick or Core.Inputs.MouseActionType.LeftDown or Core.Inputs.MouseActionType.DoubleLeftClick => 0,
                    Core.Inputs.MouseActionType.RightClick or Core.Inputs.MouseActionType.RightDown or Core.Inputs.MouseActionType.DoubleRightClick => 1,
                    Core.Inputs.MouseActionType.MiddleClick or Core.Inputs.MouseActionType.MiddleDown => 2,
                    Core.Inputs.MouseActionType.WheelUp => 3,
                    Core.Inputs.MouseActionType.WheelDown => 4,
                    _ => 0
                };
            }
            int StateIndexFromAction(Core.Inputs.MouseActionType t)
            {
                return (t == Core.Inputs.MouseActionType.LeftDown || t == Core.Inputs.MouseActionType.RightDown || t == Core.Inputs.MouseActionType.MiddleDown) ? 1 : 0;
            }

            int typeIdx = TypeIndexFromAction(ma.ActionType);
            int stateIdx = StateIndexFromAction(ma.ActionType);
            actionTypeComboBox.SelectedIndex = typeIdx;
            stateComboBox.SelectedIndex = stateIdx;

            bool isWheel = (typeIdx == 3 || typeIdx == 4);
            stateComboBox.Visibility = isWheel ? Visibility.Collapsed : Visibility.Visible;

            // Label "Activée" pour les molettes (à la place du combo état)
            var stateLabelWheel = new TextBlock
            {
                Text = "Activée",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = isWheel ? Visibility.Visible : Visibility.Collapsed
            };
            stateLabelWheel.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");

            void ApplyMouseType()
            {
                int t = actionTypeComboBox.SelectedIndex;
                int s = stateComboBox.SelectedIndex;
                ma.ActionType = (t, s) switch
                {
                    (0, 0) => Core.Inputs.MouseActionType.LeftClick,
                    (0, 1) => Core.Inputs.MouseActionType.LeftDown,
                    (1, 0) => Core.Inputs.MouseActionType.RightClick,
                    (1, 1) => Core.Inputs.MouseActionType.RightDown,
                    (2, 0) => Core.Inputs.MouseActionType.MiddleClick,
                    (2, 1) => Core.Inputs.MouseActionType.MiddleDown,
                    (3, _) => Core.Inputs.MouseActionType.WheelUp,
                    (4, _) => Core.Inputs.MouseActionType.WheelDown,
                    _ => ma.ActionType
                };
                SaveState();
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
            }

            editPanel.Children.Add(actionTypeComboBox);
            editPanel.Children.Add(stateComboBox);
            editPanel.Children.Add(stateLabelWheel);

            // Fonction pour déterminer si les coordonnées doivent être affichées
            bool ShouldShowCoordinates(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.LeftClick ||
                       actionType == Core.Inputs.MouseActionType.RightClick ||
                       actionType == Core.Inputs.MouseActionType.MiddleClick ||
                       actionType == Core.Inputs.MouseActionType.DoubleLeftClick ||
                       actionType == Core.Inputs.MouseActionType.DoubleRightClick ||
                       actionType == Core.Inputs.MouseActionType.LeftDown ||
                       actionType == Core.Inputs.MouseActionType.RightDown ||
                       actionType == Core.Inputs.MouseActionType.MiddleDown ||
                       actionType == Core.Inputs.MouseActionType.Move;
            }

            bool showCoords = ShouldShowCoordinates(ma.ActionType);

            // Label et TextBox pour X (texte blanc clair)
            var xLabel = new TextBlock
            {
                Text = "X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(xLabel);

            var xTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.X >= 0 ? ma.X.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                {
                    SaveState();
                    ma.X = x;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            xTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(xTextBox.Text, out int x))
                {
                    xTextBox.Text = ma.X >= 0 ? ma.X.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(xTextBox);

            // Label et TextBox pour Y (texte blanc clair)
            var yLabel = new TextBlock
            {
                Text = "Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(yLabel);

            var yTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.Y >= 0 ? ma.Y.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                {
                    SaveState();
                    ma.Y = y;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            yTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(yTextBox.Text, out int y))
                {
                    yTextBox.Text = ma.Y >= 0 ? ma.Y.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(yTextBox);

            // Bouton pour sélectionner un point à l'écran (seulement pour clics et Maintenir)
            var selectPointButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Crosshair, 12),
                MinWidth = 32,
                Width = 32,
                Height = 24,
                Padding = new Thickness(4, 0, 4, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner un point à l'écran (comme la pipette)",
                Cursor = Cursors.Hand,
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            if (Application.Current.TryFindResource("TimelineClicButton") is Style clicBtnStyle)
                selectPointButton.Style = clicBtnStyle;

            selectPointButton.Click += (s, e) =>
            {
                SelectPointOnScreen(ma, xTextBox, yTextBox);
            };

            editPanel.Children.Add(selectPointButton);

            // Panneau avancé souris : aperçu, zone conditionnelle, durée, delta, scroll, relatif, vitesse, Bézier
            var mouseAdvancedPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var mouseAdvancedButton = new Button
            {
                Content = "Avancé",
                FontSize = 11,
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                ToolTip = "Afficher les options avancées (zone, durée, delta, relatif, etc.)"
            };
            if (Application.Current.TryFindResource("ButtonGhost") is Style mouseGhostStyle)
                mouseAdvancedButton.Style = mouseGhostStyle;
            mouseAdvancedButton.Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194));
            bool mouseAdvancedVisible = false;
            mouseAdvancedButton.Click += (s, e) =>
            {
                mouseAdvancedVisible = !mouseAdvancedVisible;
                mouseAdvancedPanel.Visibility = mouseAdvancedVisible ? Visibility.Visible : Visibility.Collapsed;
                mouseAdvancedButton.Content = mouseAdvancedVisible ? "▲ Avancé" : "Avancé";
            };
            editPanel.Children.Add(mouseAdvancedButton);
            editPanel.Children.Add(mouseAdvancedPanel);

            // Bouton Aperçu position (snap visuel) — dans panneau avancé
            var previewPositionButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Eye, 11),
                MinWidth = 32,
                Width = 32,
                Height = 24,
                Padding = new Thickness(4, 0, 4, 0),
                Margin = new Thickness(4, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Afficher un indicateur visuel à la position X/Y",
                Cursor = Cursors.Hand,
                Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed
            };
            if (Application.Current.TryFindResource("TimelineClicButton") is Style clicBtnStyle2)
                previewPositionButton.Style = clicBtnStyle2;
            previewPositionButton.Click += (s, e) =>
            {
                if (ma.X >= 0 && ma.Y >= 0)
                {
                    ShowPositionPreview(ma.X, ma.Y);
                }
                else
                {
                    MessageBox.Show("Veuillez d'abord définir une position X/Y valide.", "Position non définie", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            };
            mouseAdvancedPanel.Children.Add(previewPositionButton);

            // Zone conditionnelle (clic seulement si curseur dans la zone)
            bool IsClickType(Core.Inputs.MouseActionType t) =>
                t == Core.Inputs.MouseActionType.LeftClick || t == Core.Inputs.MouseActionType.RightClick ||
                t == Core.Inputs.MouseActionType.MiddleClick || t == Core.Inputs.MouseActionType.DoubleLeftClick ||
                t == Core.Inputs.MouseActionType.DoubleRightClick || t == Core.Inputs.MouseActionType.LeftDown ||
                t == Core.Inputs.MouseActionType.RightDown || t == Core.Inputs.MouseActionType.MiddleDown;

            bool showConditionalZone = IsClickType(ma.ActionType);
            var conditionalZoneCheckBox = new CheckBox
            {
                Content = "Zone conditionnelle",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 4, 0),
                IsChecked = ma.ConditionalZoneEnabled,
                ToolTip = "Exécuter le clic seulement si le curseur est dans la zone définie",
                Visibility = showConditionalZone ? Visibility.Visible : Visibility.Collapsed
            };

            var zoneButton = new Button
            {
                Content = LucideIcons.CreateIconWithText(LucideIcons.Square, " Définir zone", 11),
                MinWidth = 90,
                Height = 22,
                Padding = new Thickness(4, 0, 4, 0),
                Margin = new Thickness(4, 0, 4, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Définir la zone conditionnelle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = (showConditionalZone && ma.ConditionalZoneEnabled) ? Visibility.Visible : Visibility.Collapsed
            };
            if (Application.Current.TryFindResource("TimelineClicButton") is Style clicBtnStyle3)
                zoneButton.Style = clicBtnStyle3;

            var zoneLabelText = new TextBlock
            {
                Text = ma.ConditionalZoneEnabled && (ma.ConditionalZoneX2 > ma.ConditionalZoneX1 || ma.ConditionalZoneY2 > ma.ConditionalZoneY1)
                    ? $"{ma.ConditionalZoneX1},{ma.ConditionalZoneY1} \u2192 {ma.ConditionalZoneX2},{ma.ConditionalZoneY2}"
                    : "",
                FontSize = 10,
                Foreground = GetThemeBrush("ErrorBrush"),
                VerticalAlignment = VerticalAlignment.Center
            };

            var zoneLabel = new Border
            {
                Child = zoneLabelText,
                Padding = new Thickness(4, 1, 4, 1),
                Margin = new Thickness(4, 0, 0, 0),
                BorderThickness = new Thickness(1),
                BorderBrush = GetThemeBrush("ErrorBrush"),
                CornerRadius = new CornerRadius(2),
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = (showConditionalZone && ma.ConditionalZoneEnabled) ? Visibility.Visible : Visibility.Collapsed
            };

            conditionalZoneCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ma.ConditionalZoneEnabled = true;
                zoneButton.Visibility = Visibility.Visible;
                zoneLabel.Visibility = Visibility.Visible;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
            };
            conditionalZoneCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ma.ConditionalZoneEnabled = false;
                zoneButton.Visibility = Visibility.Collapsed;
                zoneLabel.Visibility = Visibility.Collapsed;
                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
            };

            zoneButton.Click += (s, e) =>
            {
                var zoneSelectorWindow = new ZoneSelectorWindow();
                if (zoneSelectorWindow.ShowDialog() == true)
                {
                    SaveState();
                    ma.ConditionalZoneX1 = zoneSelectorWindow.X1;
                    ma.ConditionalZoneY1 = zoneSelectorWindow.Y1;
                    ma.ConditionalZoneX2 = zoneSelectorWindow.X2;
                    ma.ConditionalZoneY2 = zoneSelectorWindow.Y2;
                    zoneLabelText.Text = $"{ma.ConditionalZoneX1},{ma.ConditionalZoneY1} \u2192 {ma.ConditionalZoneX2},{ma.ConditionalZoneY2}";
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                }
            };

            mouseAdvancedPanel.Children.Add(conditionalZoneCheckBox);
            mouseAdvancedPanel.Children.Add(zoneButton);
            mouseAdvancedPanel.Children.Add(zoneLabel);

            void UpdateConditionalZoneVisibility()
            {
                bool show = IsClickType(ma.ActionType);
                conditionalZoneCheckBox.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                zoneButton.Visibility = (show && ma.ConditionalZoneEnabled) ? Visibility.Visible : Visibility.Collapsed;
                zoneLabel.Visibility = (show && ma.ConditionalZoneEnabled) ? Visibility.Visible : Visibility.Collapsed;
            }

            void UpdatePreviewButtonVisibility()
            {
                bool show = ma.ActionType == Core.Inputs.MouseActionType.LeftClick ||
                           ma.ActionType == Core.Inputs.MouseActionType.RightClick ||
                           ma.ActionType == Core.Inputs.MouseActionType.MiddleClick ||
                           ma.ActionType == Core.Inputs.MouseActionType.DoubleLeftClick ||
                           ma.ActionType == Core.Inputs.MouseActionType.DoubleRightClick ||
                           ma.ActionType == Core.Inputs.MouseActionType.LeftDown ||
                           ma.ActionType == Core.Inputs.MouseActionType.RightDown ||
                           ma.ActionType == Core.Inputs.MouseActionType.MiddleDown ||
                           ma.ActionType == Core.Inputs.MouseActionType.Move;
                previewPositionButton.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            }

            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex < 0) return;
                int typeIdxNew = actionTypeComboBox.SelectedIndex;
                bool wheel = (typeIdxNew == 3 || typeIdxNew == 4);
                stateComboBox.Visibility = wheel ? Visibility.Collapsed : Visibility.Visible;
                stateLabelWheel.Visibility = wheel ? Visibility.Visible : Visibility.Collapsed;
                if (wheel)
                    stateComboBox.SelectedIndex = 0;
                ApplyMouseType();
                bool showCoordsNew = !wheel;
                xLabel.Visibility = showCoordsNew ? Visibility.Visible : Visibility.Collapsed;
                xTextBox.Visibility = showCoordsNew ? Visibility.Visible : Visibility.Collapsed;
                yLabel.Visibility = showCoordsNew ? Visibility.Visible : Visibility.Collapsed;
                yTextBox.Visibility = showCoordsNew ? Visibility.Visible : Visibility.Collapsed;
                selectPointButton.Visibility = showCoordsNew ? Visibility.Visible : Visibility.Collapsed;
                UpdateConditionalZoneVisibility();
                UpdatePreviewButtonVisibility();
            };

            stateComboBox.SelectionChanged += (s, e) =>
            {
                if (stateComboBox.SelectedIndex < 0) return;
                ApplyMouseType();
                UpdateConditionalZoneVisibility();
            };

            // Durée de maintien (ms) pour "Maintenir" — optionnel, vide ou 0 = illimité
            bool IsMaintenirType(Core.Inputs.MouseActionType t) =>
                t == Core.Inputs.MouseActionType.LeftDown || t == Core.Inputs.MouseActionType.RightDown || t == Core.Inputs.MouseActionType.MiddleDown;

            bool showHoldDuration = IsMaintenirType(ma.ActionType);
            var holdDurationLabel = new TextBlock
            {
                Text = "Durée (optionnel):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 4, 0)
            };
            var holdDurationTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "",
                MinWidth = 60,
                MaxWidth = 80,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                ToolTip = "Durée en ms (laisser vide = illimité, relâché à la fin de la macro)"
            };
            var holdDurationPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = showHoldDuration ? Visibility.Visible : Visibility.Collapsed
            };
            holdDurationPanel.Children.Add(holdDurationLabel);
            holdDurationPanel.Children.Add(holdDurationTextBox);
            mouseAdvancedPanel.Children.Add(holdDurationPanel);

            void UpdateHoldDurationVisibility()
            {
                holdDurationPanel.Visibility = IsMaintenirType(ma.ActionType) ? Visibility.Visible : Visibility.Collapsed;
            }

            holdDurationTextBox.LostFocus += (s, e) =>
            {
                var text = holdDurationTextBox.Text.Trim();
                int ms = 0;
                if (!string.IsNullOrEmpty(text) && (!int.TryParse(text, out ms) || ms < 0))
                {
                    holdDurationTextBox.Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "";
                    return;
                }
                if (ma.HoldDurationMs != ms)
                {
                    SaveState();
                    ma.HoldDurationMs = ms;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };

            // Fonction pour déterminer si le delta doit être affiché (pour toutes les actions de molette)
            bool ShouldShowDelta(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.WheelUp ||
                       actionType == Core.Inputs.MouseActionType.WheelDown ||
                       actionType == Core.Inputs.MouseActionType.Wheel;
            }

            // Label et TextBox pour le delta de la molette (texte blanc clair)
            bool showDelta = ShouldShowDelta(ma.ActionType);
            var deltaLabel = new TextBlock
            {
                Text = "Delta:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed
            };
            mouseAdvancedPanel.Children.Add(deltaLabel);

            var deltaTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.Delta.ToString(),
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 0),
                Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Delta de la molette (positif = haut, négatif = bas)"
            };
            deltaTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(deltaTextBox.Text, out int delta))
                {
                    SaveState();
                    ma.Delta = delta;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            deltaTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(deltaTextBox.Text, out int delta))
                {
                    deltaTextBox.Text = ma.Delta.ToString();
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(deltaTextBox);

            // Contrôles pour Scroll continu (direction, durée, intervalle)
            bool showScrollContinuous = ma.ActionType == Core.Inputs.MouseActionType.WheelContinuous;
            var scrollDirectionComboBox = new ComboBox
            {
                MinWidth = 90,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showScrollContinuous ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Direction du scroll"
            };
            scrollDirectionComboBox.Items.Add("Haut");
            scrollDirectionComboBox.Items.Add("Bas");
            scrollDirectionComboBox.SelectedIndex = ma.ScrollDirection == Core.Inputs.ScrollDirection.Up ? 0 : 1;
            scrollDirectionComboBox.SelectionChanged += (s, e) =>
            {
                if (scrollDirectionComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.ScrollDirection = scrollDirectionComboBox.SelectedIndex == 0 ? Core.Inputs.ScrollDirection.Up : Core.Inputs.ScrollDirection.Down;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(scrollDirectionComboBox);

            var scrollDurationLabel = new TextBlock
            {
                Text = "Durée (ms):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showScrollContinuous ? Visibility.Visible : Visibility.Collapsed
            };
            var scrollDurationTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ScrollDurationMs > 0 ? ma.ScrollDurationMs.ToString() : "1000",
                Width = 60,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = showScrollContinuous ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Durée totale du scroll en ms"
            };
            scrollDurationTextBox.LostFocus += (s, e) =>
            {
                if (int.TryParse(scrollDurationTextBox.Text, out int dur) && dur > 0)
                {
                    SaveState();
                    ma.ScrollDurationMs = dur;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                }
            };
            mouseAdvancedPanel.Children.Add(scrollDurationLabel);
            mouseAdvancedPanel.Children.Add(scrollDurationTextBox);

            var scrollIntervalLabel = new TextBlock
            {
                Text = "Intervalle (ms):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showScrollContinuous ? Visibility.Visible : Visibility.Collapsed
            };
            var scrollIntervalTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ScrollIntervalMs > 0 ? ma.ScrollIntervalMs.ToString() : "50",
                Width = 50,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = showScrollContinuous ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Intervalle entre chaque tick de scroll en ms"
            };
            scrollIntervalTextBox.LostFocus += (s, e) =>
            {
                if (int.TryParse(scrollIntervalTextBox.Text, out int intv) && intv > 0)
                {
                    SaveState();
                    ma.ScrollIntervalMs = intv;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                }
            };
            mouseAdvancedPanel.Children.Add(scrollIntervalLabel);
            mouseAdvancedPanel.Children.Add(scrollIntervalTextBox);

            void UpdateScrollContinuousVisibility()
            {
                bool show = ma.ActionType == Core.Inputs.MouseActionType.WheelContinuous;
                scrollDirectionComboBox.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                scrollDurationLabel.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                scrollDurationTextBox.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                scrollIntervalLabel.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                scrollIntervalTextBox.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            }

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControls(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move)
            bool showMoveControls = ShouldShowMoveControls(ma.ActionType);
            var relativeMoveCheckBox = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            mouseAdvancedPanel.Children.Add(relativeMoveCheckBox);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBox.Items.Add("Instantané");
            moveSpeedComboBox.Items.Add("Rapide");
            moveSpeedComboBox.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBox.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBox.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(moveSpeedComboBox);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBox = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBox.Items.Add("Linéaire");
            moveEasingComboBox.Items.Add("Accélération");
            moveEasingComboBox.Items.Add("Décélération");
            moveEasingComboBox.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBox.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBox.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(moveEasingComboBox);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBox = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed
            };
            mouseAdvancedPanel.Children.Add(bezierCheckBox);

            // Label et TextBox pour le point de contrôle X (uniquement pour Move avec Bézier)
            var controlXLabel = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            mouseAdvancedPanel.Children.Add(controlXLabel);

            var controlXTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBox.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBox.Text, out int controlX))
                {
                    controlXTextBox.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(controlXTextBox);

            // Label et TextBox pour le point de contrôle Y (uniquement pour Move avec Bézier)
            var controlYLabel = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            mouseAdvancedPanel.Children.Add(controlYLabel);

            var controlYTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBox.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBox.Text, out int controlY))
                {
                    controlYTextBox.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(controlYTextBox);

            // Bouton pour sélectionner le point de contrôle à l'écran (uniquement pour Move avec Bézier)
            var selectControlPointButton = new Button
            {
                Content = LucideIcons.CreateIconWithText(LucideIcons.Crosshair, " Ctrl", 12),
                MinWidth = 70,
                Height = 24,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = (showMoveControls && ma.UseBezierPath) ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButton.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBox.Text = ma.ControlX.ToString();
                    controlYTextBox.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            mouseAdvancedPanel.Children.Add(selectControlPointButton);

            // Ajouter les handlers après la déclaration de toutes les variables
            bezierCheckBox.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                // Mettre à jour la visibilité des contrôles Bézier
                bool showBezierControls = showMoveControls && ma.UseBezierPath;
                controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBox.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                // Mettre à jour la visibilité des contrôles Bézier
                bool showBezierControls = showMoveControls && ma.UseBezierPath;
                controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0 && _currentMacro != null)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        12 => Core.Inputs.MouseActionType.WheelContinuous,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Initialiser le delta avec des valeurs par défaut selon le type d'action
                    if (ma.ActionType == Core.Inputs.MouseActionType.WheelUp)
                    {
                        // Initialiser à 120 seulement si le delta est 0 (nouvelle action ou pas encore configuré)
                        if (ma.Delta == 0)
                        {
                            ma.Delta = 120;
                            deltaTextBox.Text = "120";
                        }
                    }
                    else if (ma.ActionType == Core.Inputs.MouseActionType.WheelDown)
                    {
                        // Initialiser à -120 seulement si le delta est 0 (nouvelle action ou pas encore configuré)
                        if (ma.Delta == 0)
                        {
                            ma.Delta = -120;
                            deltaTextBox.Text = "-120";
                        }
                    }
                    else if (ma.ActionType == Core.Inputs.MouseActionType.Wheel)
                    {
                        // Pour Wheel, garder la valeur actuelle ou 0 par défaut
                        deltaTextBox.Text = ma.Delta.ToString();
                    }
                    
                    // Mettre à jour la visibilité des contrôles selon le type d'action
                    bool showCoords = ShouldShowCoordinates(ma.ActionType);
                    xLabel.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    xTextBox.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    yLabel.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    yTextBox.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    selectPointButton.Visibility = showCoords ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showDelta = ShouldShowDelta(ma.ActionType);
                    deltaLabel.Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed;
                    deltaTextBox.Visibility = showDelta ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showMoveControls = ShouldShowMoveControls(ma.ActionType);
                    relativeMoveCheckBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBox.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bool showBezierControls = showMoveControls && ma.UseBezierPath;
                    controlXLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabel.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBox.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButton.Visibility = showBezierControls ? Visibility.Visible : Visibility.Collapsed;
                    
                    UpdateHoldDurationVisibility();
                    UpdateScrollContinuousVisibility();
                    UpdateConditionalZoneVisibility();
                    UpdatePreviewButtonVisibility();
                    
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            return editPanel;
        }

        /// <summary>
        /// Sélectionne un point à l'écran (capture seulement les coordonnées)
        /// </summary>
        private void SelectPointOnScreen(Core.Inputs.MouseAction ma, TextBox xTextBox, TextBox yTextBox)
        {
            try
            {
                // Utiliser PointSelectorWindow qui capture seulement les coordonnées
                var pointSelector = new PointSelectorWindow
                {
                    Owner = Application.Current.MainWindow
                };
                
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.X = pointSelector.SelectedX;
                    ma.Y = pointSelector.SelectedY;
                    
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                    }
                    
                    // Mettre à jour les TextBox
                    xTextBox.Text = ma.X.ToString();
                    yTextBox.Text = ma.Y.ToString();
                    
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Erreur lors de la sélection de point: {ex.Message}");
                MessageBox.Show(
                    $"Erreur lors de la sélection de point : {ex.Message}",
                    "Erreur",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }
        }

        /// <summary>
        /// Affiche un indicateur visuel temporaire à la position X/Y spécifiée (snap visuel)
        /// </summary>
        private void ShowPositionPreview(int x, int y)
        {
            try
            {
                var previewWindow = new Window
                {
                    Width = 30,
                    Height = 30,
                    Left = x - 15,
                    Top = y - 15,
                    WindowStyle = WindowStyle.None,
                    AllowsTransparency = true,
                    Background = System.Windows.Media.Brushes.Transparent,
                    Topmost = true,
                    ShowInTaskbar = false,
                    IsHitTestVisible = false
                };

                var ellipse = new System.Windows.Shapes.Ellipse
                {
                    Width = 28,
                    Height = 28,
                    Stroke = new SolidColorBrush(GetThemeColor("AccentPrimaryColor")),
                    StrokeThickness = 3,
                    Fill = new SolidColorBrush(Color.FromArgb(80, GetThemeColor("AccentPrimaryColor").R, GetThemeColor("AccentPrimaryColor").G, GetThemeColor("AccentPrimaryColor").B))
                };

                var crossH = new System.Windows.Shapes.Line
                {
                    X1 = 0, Y1 = 14, X2 = 28, Y2 = 14,
                    Stroke = new SolidColorBrush(GetThemeColor("AccentPrimaryColor")),
                    StrokeThickness = 2
                };
                var crossV = new System.Windows.Shapes.Line
                {
                    X1 = 14, Y1 = 0, X2 = 14, Y2 = 28,
                    Stroke = new SolidColorBrush(GetThemeColor("AccentPrimaryColor")),
                    StrokeThickness = 2
                };

                var canvas = new Canvas { Width = 30, Height = 30 };
                canvas.Children.Add(ellipse);
                canvas.Children.Add(crossH);
                canvas.Children.Add(crossV);
                previewWindow.Content = canvas;

                previewWindow.Show();

                // Fermer automatiquement après 2 secondes avec animation de fade
                var timer = new System.Windows.Threading.DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(1500)
                };
                timer.Tick += (s, e) =>
                {
                    timer.Stop();
                    var fadeOut = new System.Windows.Media.Animation.DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(500));
                    fadeOut.Completed += (s2, e2) => previewWindow.Close();
                    previewWindow.BeginAnimation(Window.OpacityProperty, fadeOut);
                };
                timer.Start();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Erreur lors de l'aperçu position: {ex.Message}");
            }
        }

        /// <summary>
        /// Édition inline d'une MouseAction au niveau principal (désactivé, maintenant on utilise CreateMouseActionControls)
        /// </summary>
        private void EditMouseAction(Core.Inputs.MouseAction ma, int index, TextBlock titleText)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[index] is not Core.Inputs.MouseAction mouseAction)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            // Panel horizontal pour ComboBox (type de clic)
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 140,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                SelectedIndex = (int)mouseAction.ActionType
            };

            // Ordre doit correspondre à l'enum MouseActionType (sans les "Relâcher")
            actionTypeComboBox.Items.Add("Clic gauche");      // 0: LeftClick
            actionTypeComboBox.Items.Add("Clic droit");       // 1: RightClick
            actionTypeComboBox.Items.Add("Clic milieu");      // 2: MiddleClick
            actionTypeComboBox.Items.Add("Maintenir gauche");  // 3: LeftDown
            actionTypeComboBox.Items.Add("Maintenir droit");   // 5: RightDown (sauter 4: LeftUp)
            actionTypeComboBox.Items.Add("Maintenir milieu");  // 7: MiddleDown (sauter 6: RightUp)
            actionTypeComboBox.Items.Add("Déplacer");         // 9: Move (sauter 8: MiddleUp)
            actionTypeComboBox.Items.Add("Molette haut");      // 10: WheelUp
            actionTypeComboBox.Items.Add("Molette bas");       // 11: WheelDown
            actionTypeComboBox.Items.Add("Molette");          // 12: Wheel

            editPanel.Children.Add(actionTypeComboBox);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    mouseAction.ActionType = (Core.Inputs.MouseActionType)actionTypeComboBox.SelectedIndex;
                    _currentMacro.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            // Fermeture du ComboBox : revenir au titre
            actionTypeComboBox.DropDownClosed += (s, e) =>
            {
                if (parentPanel.Children.Contains(editPanel))
                {
                    int idx = parentPanel.Children.IndexOf(editPanel);
                    if (idx >= 0)
                    {
                        parentPanel.Children.RemoveAt(idx);
                        parentPanel.Children.Insert(idx, titleText);
                    }
                }
            };

            // Échap : revenir au titre
            actionTypeComboBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    if (parentPanel.Children.Contains(editPanel))
                    {
                        int idx = parentPanel.Children.IndexOf(editPanel);
                        if (idx >= 0)
                        {
                            parentPanel.Children.RemoveAt(idx);
                            parentPanel.Children.Insert(idx, titleText);
                        }
                    }
                }
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                actionTypeComboBox.Focus();
            }));
        }

        /// <summary>
        /// Édition inline d'une MouseAction imbriquée dans un RepeatAction
        /// </summary>
        private void EditNestedMouseAction(NestedActionInfo info, TextBlock titleText)
        {
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex))
                return;

            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            if (repeatAction.Actions[nestedIndex] is not Core.Inputs.MouseAction ma)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            // Panel horizontal pour ComboBox (type de clic) + TextBox (position optionnelle)
            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            // ComboBox pour le type d'action
            var actionTypeComboBox = new ComboBox
            {
                MinWidth = 120,
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            // Ordre des items dans le ComboBox (sans les "Relâcher")
            actionTypeComboBox.Items.Add("Clic gauche");      // index 0
            actionTypeComboBox.Items.Add("Clic droit");       // index 1
            actionTypeComboBox.Items.Add("Clic milieu");      // index 2
            actionTypeComboBox.Items.Add("Double-clic gauche");  // index 3
            actionTypeComboBox.Items.Add("Double-clic droit");   // index 4
            actionTypeComboBox.Items.Add("Maintenir gauche");  // index 5
            actionTypeComboBox.Items.Add("Maintenir droit");   // index 6
            actionTypeComboBox.Items.Add("Maintenir milieu");  // index 7
            actionTypeComboBox.Items.Add("Déplacer");         // index 8
            actionTypeComboBox.Items.Add("Molette haut");      // index 9
            actionTypeComboBox.Items.Add("Molette bas");       // index 10
            actionTypeComboBox.Items.Add("Molette");          // index 11

            // Mapper l'ActionType actuel vers l'index du ComboBox
            int currentIndex = ma.ActionType switch
            {
                Core.Inputs.MouseActionType.LeftClick => 0,
                Core.Inputs.MouseActionType.RightClick => 1,
                Core.Inputs.MouseActionType.MiddleClick => 2,
                Core.Inputs.MouseActionType.DoubleLeftClick => 3,
                Core.Inputs.MouseActionType.DoubleRightClick => 4,
                Core.Inputs.MouseActionType.LeftDown => 5,
                Core.Inputs.MouseActionType.RightDown => 6,
                Core.Inputs.MouseActionType.MiddleDown => 7,
                Core.Inputs.MouseActionType.Move => 8,
                Core.Inputs.MouseActionType.WheelUp => 9,
                Core.Inputs.MouseActionType.WheelDown => 10,
                Core.Inputs.MouseActionType.Wheel => 11,
                _ => 0 // Par défaut, LeftClick si c'est un type "Relâcher" non supporté
            };
            actionTypeComboBox.SelectedIndex = currentIndex;

            editPanel.Children.Add(actionTypeComboBox);

            // Label et TextBox pour X
            var xLabel = new TextBlock
            {
                Text = "X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0)
            };
            editPanel.Children.Add(xLabel);

            var xTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.X >= 0 ? ma.X.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0)
            };
            xTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(xTextBox.Text, out int x))
                {
                    SaveState();
                    ma.X = x;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            xTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(xTextBox.Text, out int x))
                {
                    xTextBox.Text = ma.X >= 0 ? ma.X.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(xTextBox);

            // Label et TextBox pour Y
            var yLabel = new TextBlock
            {
                Text = "Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0)
            };
            editPanel.Children.Add(yLabel);

            var yTextBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.Y >= 0 ? ma.Y.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            yTextBox.TextChanged += (s, e) =>
            {
                if (int.TryParse(yTextBox.Text, out int y))
                {
                    SaveState();
                    ma.Y = y;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            yTextBox.LostFocus += (s, e) =>
            {
                if (!int.TryParse(yTextBox.Text, out int y))
                {
                    yTextBox.Text = ma.Y >= 0 ? ma.Y.ToString() : "-1";
                }
                else
                {
                    // Mettre à jour l'affichage seulement quand on quitte le champ
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(yTextBox);

            // Bouton pour sélectionner un point à l'écran (comme la pipette)
            var selectPointButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Crosshair, 12),
                MinWidth = 32,
                Width = 32,
                Height = 24,
                Padding = new Thickness(4, 0, 4, 0),
                Margin = new Thickness(0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner un point à l'écran (comme la pipette)",
                Cursor = Cursors.Hand
            };
            if (Application.Current.TryFindResource("TimelineClicButton") is Style nestedClicStyle)
                selectPointButton.Style = nestedClicStyle;

            selectPointButton.Click += (s, e) =>
            {
                SelectPointOnScreen(ma, xTextBox, yTextBox);
            };

            editPanel.Children.Add(selectPointButton);

            // Durée de maintien (optionnel) pour Maintenir gauche/droit/milieu
            bool IsMaintenirNested(Core.Inputs.MouseActionType t) =>
                t == Core.Inputs.MouseActionType.LeftDown || t == Core.Inputs.MouseActionType.RightDown || t == Core.Inputs.MouseActionType.MiddleDown;
            bool showHoldDurationNested = IsMaintenirNested(ma.ActionType);
            var holdDurationLabelNested = new TextBlock
            {
                Text = "Durée (optionnel):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 4, 0),
                Visibility = showHoldDurationNested ? Visibility.Visible : Visibility.Collapsed
            };
            var holdDurationTextBoxNested = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "",
                Width = 60,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showHoldDurationNested ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Durée en ms (laisser vide = illimité)"
            };
            holdDurationTextBoxNested.LostFocus += (s, e) =>
            {
                var text = holdDurationTextBoxNested.Text.Trim();
                int ms = 0;
                if (!string.IsNullOrEmpty(text) && (!int.TryParse(text, out ms) || ms < 0))
                {
                    holdDurationTextBoxNested.Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "";
                    return;
                }
                if (ma.HoldDurationMs != ms)
                {
                    SaveState();
                    ma.HoldDurationMs = ms;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(holdDurationLabelNested);
            editPanel.Children.Add(holdDurationTextBoxNested);

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControlsNested(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move)
            bool showMoveControlsNested = ShouldShowMoveControlsNested(ma.ActionType);
            var relativeMoveCheckBoxNested = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBoxNested.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBoxNested.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(relativeMoveCheckBoxNested);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBoxNested = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBoxNested.Items.Add("Instantané");
            moveSpeedComboBoxNested.Items.Add("Rapide");
            moveSpeedComboBoxNested.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBoxNested.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBoxNested.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBoxNested.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBoxNested.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveSpeedComboBoxNested);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBoxNested = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBoxNested.Items.Add("Linéaire");
            moveEasingComboBoxNested.Items.Add("Accélération");
            moveEasingComboBoxNested.Items.Add("Décélération");
            moveEasingComboBoxNested.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBoxNested.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBoxNested.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBoxNested.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBoxNested.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveEasingComboBoxNested);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBoxNested = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            
            // Contrôles pour le point de contrôle Bézier
            bool showBezierControlsNested = showMoveControlsNested && ma.UseBezierPath;
            var controlXLabelNested = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlXLabelNested);

            var controlXTextBoxNested = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBoxNested.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBoxNested.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBoxNested.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBoxNested.Text, out int controlX))
                {
                    controlXTextBoxNested.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlXTextBoxNested);

            var controlYLabelNested = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlYLabelNested);

            var controlYTextBoxNested = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBoxNested.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBoxNested.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBoxNested.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBoxNested.Text, out int controlY))
                {
                    controlYTextBoxNested.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlYTextBoxNested);

            var selectControlPointButtonNested = new Button
            {
                Content = LucideIcons.CreateIconWithText(LucideIcons.Crosshair, " Ctrl", 12),
                MinWidth = 70,
                Height = 24,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = showBezierControlsNested ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButtonNested.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBoxNested.Text = ma.ControlX.ToString();
                    controlYTextBoxNested.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(selectControlPointButtonNested);

            bezierCheckBoxNested.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezier = showMoveControlsNested && ma.UseBezierPath;
                controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBoxNested.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezier = showMoveControlsNested && ma.UseBezierPath;
                controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            editPanel.Children.Add(bezierCheckBoxNested);

            // Gestion du changement de type d'action
            actionTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (actionTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = actionTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        12 => Core.Inputs.MouseActionType.WheelContinuous,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Mettre à jour la visibilité des contrôles selon le type d'action
                    bool showHold = IsMaintenirNested(ma.ActionType);
                    holdDurationLabelNested.Visibility = showHold ? Visibility.Visible : Visibility.Collapsed;
                    holdDurationTextBoxNested.Visibility = showHold ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showMoveControls = ShouldShowMoveControlsNested(ma.ActionType);
                    relativeMoveCheckBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBoxNested.Visibility = showMoveControls ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showBezier = showMoveControls && ma.UseBezierPath;
                    controlXLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabelNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBoxNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButtonNested.Visibility = showBezier ? Visibility.Visible : Visibility.Collapsed;
                    
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };

            actionTypeComboBox.DropDownClosed += (s, e) =>
            {
                RefreshBlocks();
            };

            int idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                actionTypeComboBox.Focus();
            }));
        }

        /// <summary>
        /// Crée les contrôles inline pour une action RepeatAction (style mockup : mode trigger, chip × N, key/click)
        /// </summary>
        private StackPanel CreateRepeatActionControls(RepeatAction ra, int index, Panel parentPanel)
        {
            // Vert mockup (block-repeat) : #39D97A = 57, 217, 122
            var green = Color.FromRgb(57, 217, 122);
            var loopBrush = new SolidColorBrush(green);
            var loopBorder = new SolidColorBrush(Color.FromArgb(0x66, 57, 217, 122));
            var loopBg = new SolidColorBrush(Color.FromArgb(0x1A, 57, 217, 122));
            var gap = new Thickness(10, 0, 0, 0);

            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Mode selector : chip style + flèche et option sélectionnée en vert (ComboBoxRepeatGreen)
            var modeComboBox = new ComboBox
            {
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                MinWidth = 130,
                Margin = new Thickness(0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (Application.Current.TryFindResource("ComboBoxRepeatGreen") is Style repeatCbStyle)
                modeComboBox.Style = repeatCbStyle;
            if (Application.Current.TryFindResource("ComboBoxItemRepeatGreen") is Style repeatItemStyle)
                modeComboBox.ItemContainerStyle = repeatItemStyle;
            modeComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
            modeComboBox.Items.Add(new ComboBoxItem { Content = "1 fois", Tag = RepeatMode.Once });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "× N fois", Tag = RepeatMode.RepeatCount });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "jusqu'à arrêt", Tag = RepeatMode.UntilStopped });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "tant que touche", Tag = RepeatMode.WhileKeyPressed });
            modeComboBox.Items.Add(new ComboBoxItem { Content = "tant que clic", Tag = RepeatMode.WhileClickPressed });
            for (int i = 0; i < modeComboBox.Items.Count; i++)
            {
                if (modeComboBox.Items[i] is ComboBoxItem item && item.Tag is RepeatMode mode && mode == ra.RepeatMode)
                {
                    modeComboBox.SelectedIndex = i;
                    break;
                }
            }
            var modeChipWrap = new Border
            {
                Child = modeComboBox,
                Background = loopBg,
                BorderBrush = loopBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(3, 2, 7, 2),
                Margin = gap,
                VerticalAlignment = VerticalAlignment.Center
            };
            editPanel.Children.Add(modeChipWrap);

            // Chip × N (affichage) + panneau édition inline (× [input]) — visible uniquement en mode "× N fois"
            var chipPanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = gap };
            var chipText = new TextBlock
            {
                Text = "× " + ra.RepeatCount,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = loopBrush,
                VerticalAlignment = VerticalAlignment.Center
            };
            chipText.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            var repeatChip = new Border
            {
                Child = chipText,
                Background = loopBg,
                BorderBrush = loopBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(3, 2, 6, 2),
                Cursor = Cursors.IBeam,
                Visibility = ra.RepeatMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed
            };
            var repeatChipInput = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var chipTimes = new TextBlock { Text = "×", FontSize = 11, Foreground = GetThemeBrush("TextMutedBrush"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) };
            chipTimes.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            var repeatCountTextBox = new TextBox
            {
                Text = ra.RepeatCount.ToString(),
                Width = 36,
                MinWidth = 28,
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = loopBrush,
                CaretBrush = loopBrush,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(2, 0, 2, 0),
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center
            };
            repeatCountTextBox.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
            repeatCountTextBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);
            void ConfirmRepeatCount()
            {
                if (int.TryParse(repeatCountTextBox.Text, out int count) && count > 0 && count <= 9999)
                {
                    SaveState();
                    ra.RepeatCount = count;
                    chipText.Text = "× " + count;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                    repeatCountTextBox.Text = ra.RepeatCount.ToString();
                repeatChipInput.Visibility = Visibility.Collapsed;
                repeatChip.Visibility = ra.RepeatMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed;
            }
            repeatCountTextBox.LostFocus += (s, e) => ConfirmRepeatCount();
            repeatCountTextBox.PreviewKeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter) { ConfirmRepeatCount(); Keyboard.ClearFocus(); e.Handled = true; }
                else if (e.Key == Key.Escape) { repeatCountTextBox.Text = ra.RepeatCount.ToString(); repeatChipInput.Visibility = Visibility.Collapsed; repeatChip.Visibility = ra.RepeatMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed; Keyboard.ClearFocus(); e.Handled = true; }
            };
            repeatChipInput.Children.Add(chipTimes);
            repeatChipInput.Children.Add(repeatCountTextBox);
            repeatChip.MouseLeftButtonDown += (s, e) =>
            {
                e.Handled = true;
                repeatChip.Visibility = Visibility.Collapsed;
                repeatChipInput.Visibility = Visibility.Visible;
                repeatCountTextBox.Focus();
                repeatCountTextBox.SelectAll();
            };
            chipPanel.Children.Add(repeatChip);
            chipPanel.Children.Add(repeatChipInput);
            editPanel.Children.Add(chipPanel);

            // Touche à surveiller (hint "cliquer + appuyer" comme mockup)
            var keyWrap = new Border
            {
                Background = loopBg,
                BorderBrush = loopBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(3, 2, 8, 2),
                MinWidth = 110,
                Margin = gap,
                Visibility = ra.RepeatMode == RepeatMode.WhileKeyPressed ? Visibility.Visible : Visibility.Collapsed,
                Cursor = Cursors.Hand
            };
            var keyHint = new TextBlock { FontSize = 10, FontStyle = FontStyles.Italic, VerticalAlignment = VerticalAlignment.Center };
            keyHint.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            var keyVal = new TextBlock { FontSize = 12, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center };
            keyVal.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            keyHint.Foreground = new SolidColorBrush(Color.FromArgb(0x66, 57, 217, 122));
            keyVal.Foreground = loopBrush;
            keyHint.Text = "cliquer + appuyer";
            keyVal.Text = ra.KeyCodeToMonitor == 0 ? "" : GetKeyName(ra.KeyCodeToMonitor);
            keyVal.Visibility = ra.KeyCodeToMonitor == 0 ? Visibility.Collapsed : Visibility.Visible;
            keyHint.Visibility = ra.KeyCodeToMonitor == 0 ? Visibility.Visible : Visibility.Collapsed;
            var keyStack = new StackPanel { Orientation = Orientation.Horizontal };
            keyStack.Children.Add(keyHint);
            keyStack.Children.Add(keyVal);
            keyWrap.Child = keyStack;
            bool keyCaptureMode = false;
            KeyboardHook? tempKeyHook = null;
            keyWrap.MouseLeftButtonDown += (s, e) =>
            {
                if (!keyCaptureMode)
                {
                    e.Handled = true;
                    keyCaptureMode = true;
                    keyHint.Text = "appuyer sur une touche...";
                    keyWrap.BorderBrush = loopBrush;
                    keyWrap.Background = new SolidColorBrush(Color.FromArgb(0x24, 57, 217, 122));
                    tempKeyHook = new KeyboardHook();
                    tempKeyHook.KeyDown += (sender, args) =>
                    {
                        SaveState();
                        ra.KeyCodeToMonitor = (ushort)args.VirtualKeyCode;
                        keyVal.Text = GetKeyName(ra.KeyCodeToMonitor);
                        keyVal.Visibility = Visibility.Visible;
                        keyHint.Visibility = Visibility.Collapsed;
                        keyHint.Text = "cliquer + appuyer";
                        keyWrap.BorderBrush = loopBorder;
                        keyWrap.Background = loopBg;
                        keyCaptureMode = false;
                        tempKeyHook?.Uninstall();
                        tempKeyHook = null;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    };
                    tempKeyHook.Install();
                }
            };
            editPanel.Children.Add(keyWrap);

            // Sélecteur type de clic : même chip + flèche et option sélectionnée en vert
            var clickTypeComboBox = new ComboBox
            {
                MinWidth = 100,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0),
                SelectedIndex = ra.ClickTypeToMonitor
            };
            if (Application.Current.TryFindResource("ComboBoxRepeatGreen") is Style repeatClickCbStyle)
                clickTypeComboBox.Style = repeatClickCbStyle;
            if (Application.Current.TryFindResource("ComboBoxItemRepeatGreen") is Style repeatClickItemStyle)
                clickTypeComboBox.ItemContainerStyle = repeatClickItemStyle;
            clickTypeComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
            clickTypeComboBox.Items.Add("Clic gauche");
            clickTypeComboBox.Items.Add("Clic droit");
            clickTypeComboBox.Items.Add("Clic milieu");
            var clickChipWrap = new Border
            {
                Child = clickTypeComboBox,
                Background = loopBg,
                BorderBrush = loopBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(3, 2, 7, 2),
                Margin = gap,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = ra.RepeatMode == RepeatMode.WhileClickPressed ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(clickChipWrap);

            // Mise à jour de la visibilité selon le mode sélectionné
            modeComboBox.SelectionChanged += (s, e) =>
            {
                if (modeComboBox.SelectedItem is ComboBoxItem selectedItem && selectedItem.Tag is RepeatMode selectedMode)
                {
                    chipPanel.Visibility = selectedMode == RepeatMode.RepeatCount ? Visibility.Visible : Visibility.Collapsed;
                    if (selectedMode != RepeatMode.RepeatCount)
                    {
                        repeatChipInput.Visibility = Visibility.Collapsed;
                        repeatChip.Visibility = Visibility.Collapsed;
                    }
                    else
                    {
                        repeatChip.Visibility = Visibility.Visible;
                        chipText.Text = "× " + ra.RepeatCount;
                    }
                    keyWrap.Visibility = selectedMode == RepeatMode.WhileKeyPressed ? Visibility.Visible : Visibility.Collapsed;
                    clickChipWrap.Visibility = selectedMode == RepeatMode.WhileClickPressed ? Visibility.Visible : Visibility.Collapsed;

                    SaveState();
                    ra.RepeatMode = selectedMode;
                    if (selectedMode == RepeatMode.Once) ra.RepeatCount = 1;
                    else if (selectedMode == RepeatMode.UntilStopped) ra.RepeatCount = 0;

                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            modeComboBox.DropDownClosed += (s, e) => RefreshBlocks();

            // Sauvegarder automatiquement le type de clic lors du changement
            clickTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (clickTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    ra.ClickTypeToMonitor = clickTypeComboBox.SelectedIndex;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            
            clickTypeComboBox.DropDownClosed += (s, e) => RefreshBlocks();

            return editPanel;
        }

        private void EditRepeatAction(RepeatAction ra, int index, TextBlock titleText)
        {
            // Cette méthode n'est plus utilisée, les contrôles sont créés directement dans CreateActionCard
            // Gardée pour compatibilité mais ne devrait pas être appelée
        }

        /// <summary>
        /// Ordre et libellés des types de condition (mockup Si)
        /// </summary>
        private static (ConditionType type, string label)[] GetConditionTypeDisplayList()
        {
            return new[]
            {
                (ConditionType.Boolean, "Boolean"),
                (ConditionType.ActiveApplication, "Application active"),
                (ConditionType.KeyboardKey, "Touche clavier"),
                (ConditionType.ProcessRunning, "Processus ouvert"),
                (ConditionType.PixelColor, "Couleur pixel"),
                (ConditionType.MousePosition, "Position souris"),
                (ConditionType.MouseClick, "Clic souris"),
                (ConditionType.ImageOnScreen, "Image à l'écran"),
                (ConditionType.TextOnScreen, "Texte à l'écran"),
                (ConditionType.Variable, "Variable"),
                (ConditionType.TimeDate, "Temps / Date")
            };
        }

        private static string GetConditionTypeLabel(ConditionType type)
        {
            foreach (var (t, label) in GetConditionTypeDisplayList())
                if (t == type) return label;
            return type.ToString();
        }

        /// <summary>Processus en cours avec fenêtre visible pour le picker Application active / Processus ouvert (avec icônes).</summary>
        private static List<ProcessInfo> GetRunningProcessesWithIcons()
        {
            try
            {
                return ProcessMonitor.GetRunningProcesses();
            }
            catch { return new List<ProcessInfo>(); }
        }

        /// <summary>
        /// Crée les contrôles inline pour une action IfAction (style mockup: block-if, cond-select, cond-config, ET/OU, ＋ ET/OU)
        /// </summary>
        private StackPanel CreateIfActionControls(IfAction ifAction, int index, Panel parentPanel)
        {
            var red = Color.FromRgb(0xE8, 0x40, 0x40);
            var redBrush = new SolidColorBrush(red);
            var redBorder = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40));
            var redBg = new SolidColorBrush(Color.FromArgb(0x1A, 0xE8, 0x40, 0x40));
            var amber = Color.FromRgb(0xE8, 0xA0, 0x20);
            var amberBrush = new SolidColorBrush(amber);
            var amberBorder = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0xA0, 0x20));
            var amberBg = new SolidColorBrush(Color.FromArgb(0x12, 0xE8, 0xA0, 0x20));
            var purple = Color.FromRgb(0xA7, 0x8B, 0xFA);
            var purpleBrush = new SolidColorBrush(purple);
            var purpleBorder = new SolidColorBrush(Color.FromArgb(0x66, 0xA7, 0x8B, 0xFA));
            var purpleBg = new SolidColorBrush(Color.FromArgb(0x12, 0xA7, 0x8B, 0xFA));
            var textMuted = GetThemeBrush("TextMutedBrush") ?? new SolidColorBrush(Color.FromRgb(0x4A, 0x5A, 0x4A));
            var line2 = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26));
            const double conditionBorderThickness = 1;

            bool useGroups = ifAction.ConditionGroups != null && ifAction.ConditionGroups.Count > 0;
            if (useGroups)
                return CreateConditionGroupsUI(ifAction, index, parentPanel, redBrush, redBorder, redBg);

            if (ifAction.Conditions == null || ifAction.Conditions.Count == 0)
            {
                ifAction.Conditions = new List<ConditionItem>();
                ifAction.Conditions.Add(new ConditionItem
                {
                    ConditionType = ifAction.ConditionType,
                    Condition = ifAction.Condition,
                    ActiveApplicationConfig = ifAction.ActiveApplicationConfig,
                    KeyboardKeyConfig = ifAction.KeyboardKeyConfig,
                    ProcessRunningConfig = ifAction.ProcessRunningConfig,
                    PixelColorConfig = ifAction.PixelColorConfig,
                    MousePositionConfig = ifAction.MousePositionConfig,
                    TimeDateConfig = ifAction.TimeDateConfig,
                    ImageOnScreenConfig = ifAction.ImageOnScreenConfig,
                    TextOnScreenConfig = ifAction.TextOnScreenConfig
                });
            }
            if (ifAction.Operators == null)
                ifAction.Operators = new List<LogicalOperator>();
            while (ifAction.Operators.Count < ifAction.Conditions.Count - 1)
                ifAction.Operators.Add(LogicalOperator.AND);

            var mainPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            // block-title Si (centré verticalement)
            var blockTitle = new TextBlock
            {
                Text = "Si",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = redBrush,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, -2, 10, 0)
            };
            blockTitle.SetResourceReference(TextBlock.FontFamilyProperty, "FontPrimary");
            mainPanel.Children.Add(blockTitle);

            // Liste des types pour le ComboBox (ordre mockup)
            var typeList = GetConditionTypeDisplayList();

            for (int i = 0; i < ifAction.Conditions.Count; i++)
            {
                var condition = ifAction.Conditions[i];
                var conditionIndex = i;

                // cond-logical ET/OU (entre conditions, avant la 2e, 3e...)
                if (i > 0)
                {
                    var opIndex = i - 1;
                    var isAnd = opIndex < ifAction.Operators.Count && ifAction.Operators[opIndex] == LogicalOperator.AND;
                    var condLogical = new Border
                    {
                        Child = new TextBlock
                        {
                            Text = isAnd ? "ET" : "OU",
                            FontSize = 9,
                            FontWeight = FontWeights.ExtraBold,
                            Foreground = isAnd ? amberBrush : purpleBrush,
                            VerticalAlignment = VerticalAlignment.Center
                        },
                        Background = isAnd ? amberBg : purpleBg,
                        BorderBrush = isAnd ? amberBorder : purpleBorder,
                        BorderThickness = new Thickness(1),
                        Padding = new Thickness(3, 3, 6, 3),
                        MinHeight = 23,
                    VerticalAlignment = VerticalAlignment.Center,
                        Cursor = Cursors.Hand,
                        Margin = new Thickness(6, 0, 0, 0),
                        ToolTip = "Basculer ET / OU"
                    };
                    condLogical.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                    condLogical.MouseLeftButtonDown += (s, e) =>
                    {
                        SaveState();
                        if (opIndex < ifAction.Operators.Count)
                            ifAction.Operators[opIndex] = ifAction.Operators[opIndex] == LogicalOperator.AND ? LogicalOperator.OR : LogicalOperator.AND;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                        e.Handled = true;
                    };
                    mainPanel.Children.Add(condLogical);
                }

                // cond-select-trigger : ComboBox type de condition (sélection et flèche en rouge)
                var condCombo = new ComboBox
                {
                    MinWidth = 110,
                    FontSize = 11,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    VerticalContentAlignment = VerticalAlignment.Center,
                    BorderThickness = new Thickness(0),
                    Background = Brushes.Transparent,
                    Padding = new Thickness(0, 0, 0, 0)
                };
                if (Application.Current.TryFindResource("ComboBoxSiRed") is Style siRedStyle)
                    condCombo.Style = siRedStyle;
                if (Application.Current.TryFindResource("ComboBoxItemSiRed") is Style siRedItemStyle)
                    condCombo.ItemContainerStyle = siRedItemStyle;
                condCombo.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
                foreach (var (t, label) in typeList)
                    condCombo.Items.Add(new ComboBoxItem { Content = label, Tag = t });
                var typeIdx = Array.FindIndex(typeList, x => x.type == condition.ConditionType);
                condCombo.SelectedIndex = typeIdx >= 0 ? typeIdx : 0;
                var condSelectWrap = new Border
                {
                    Background = redBg,
                    BorderBrush = redBorder,
                    BorderThickness = new Thickness(conditionBorderThickness),
                    Padding = new Thickness(3, 2, 6, 2),
                    Margin = new Thickness(0, 0, 4, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    CornerRadius = new CornerRadius(0),
                    Child = condCombo
                };
                condCombo.SelectionChanged += (s, e) =>
                {
                    if (condCombo.SelectedItem is ComboBoxItem item && item.Tag is ConditionType t)
                    {
                        SaveState();
                        condition.ConditionType = t;
                        condition.ActiveApplicationConfig = null;
                        condition.KeyboardKeyConfig = null;
                        condition.ProcessRunningConfig = null;
                        condition.PixelColorConfig = null;
                        condition.MousePositionConfig = null;
                        condition.TimeDateConfig = null;
                        condition.ImageOnScreenConfig = null;
                        condition.TextOnScreenConfig = null;
                        condition.VariableName = null;
                        condition.VariableOperator = null;
                        condition.VariableValue = null;
                        condition.MouseClickConfig = t == ConditionType.MouseClick ? new MouseClickCondition { ClickType = 3 } : null;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                };
                mainPanel.Children.Add(condSelectWrap);

                // cond-config : pour Boolean = bascule Vrai/Faux ; sinon aperçu + gear
                var condConfig = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    VerticalAlignment = VerticalAlignment.Center,
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    Margin = new Thickness(0, 0, 4, 0)
                };
                TextBlock? previewText = null;
                Action<FrameworkElement>? openPixelPop = null;
                Action<FrameworkElement>? openColorPop = null;
                Action<FrameworkElement>? openImagePop = null;
                Action<FrameworkElement>? openTextPop = null;
                if (condition.ConditionType == ConditionType.Boolean)
                {
                    // Un seul bouton bascule Vrai/Faux (même style que ET/OU, même hauteur que ComboBox)
                    var boolLabel = new TextBlock
                    {
                        Text = condition.Condition ? "Vrai" : "Faux",
                        FontSize = 11,
                        FontWeight = FontWeights.SemiBold,
                        Foreground = redBrush,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    boolLabel.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                    var boolToggle = new Border
                    {
                        Child = boolLabel,
                        Background = redBg,
                        BorderBrush = redBorder,
                        BorderThickness = new Thickness(1),
                        Padding = new Thickness(3, 3, 6, 3),
                        MinHeight = 23,
                        VerticalAlignment = VerticalAlignment.Center,
                        Cursor = Cursors.Hand,
                        Margin = new Thickness(0, 0, 0, 0),
                        ToolTip = "Basculer Vrai / Faux"
                    };
                    boolToggle.MouseLeftButtonDown += (s, e) =>
                    {
                        SaveState();
                        condition.Condition = !condition.Condition;
                        boolLabel.Text = condition.Condition ? "Vrai" : "Faux";
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                        e.Handled = true;
                    };
                    condConfig.Children.Add(boolToggle);
                }
                else if (condition.ConditionType == ConditionType.ActiveApplication || condition.ConditionType == ConditionType.ProcessRunning)
                {
                    // Chips inline (style mockup) + bouton ＋ ouvrant le picker
                    var processNamesList = condition.ConditionType == ConditionType.ActiveApplication
                        ? (condition.ActiveApplicationConfig ??= new ActiveApplicationCondition { ProcessNames = new List<string>() }).ProcessNames
                        : (condition.ProcessRunningConfig ??= new ProcessRunningCondition { ProcessNames = new List<string>() }).ProcessNames;
                    if (processNamesList == null) processNamesList = new List<string>();

                    var chipsPanel = new WrapPanel
                    {
                        Orientation = Orientation.Horizontal,
                    VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 0, 2, 0)
                    };

                    const int maxVisibleChips = 3;

                    Border? moreChipSingleton = null;
                    Popup? morePopupSingleton = null;
                    bool IsDescendantOf(DependencyObject ancestor, DependencyObject node)
                    {
                        while (node != null) { if (node == ancestor) return true; node = VisualTreeHelper.GetParent(node); }
                        return false;
                    }

                    void RefreshChipsPanel()
                    {
                        chipsPanel.Children.Clear();
                        var list = processNamesList.ToList();
                        var visibleCount = Math.Min(maxVisibleChips, list.Count);
                        for (int i = 0; i < visibleCount; i++)
                        {
                            var name = list[i];
                            var chipStack = new StackPanel { Orientation = Orientation.Horizontal };
                            var iconSource = ProcessMonitor.GetIconForProcessName(name);
                            if (iconSource != null)
                            {
                                chipStack.Children.Add(new Border
                                {
                                    Width = 14,
                                    Height = 14,
                                    Margin = new Thickness(0, 0, 4, 0),
                                    Child = new Image { Source = iconSource, Width = 14, Height = 14, Stretch = Stretch.Uniform }
                                });
                            }
                            chipStack.Children.Add(new TextBlock { Text = name, FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = redBrush, VerticalAlignment = VerticalAlignment.Center });
                            var closeTb = new TextBlock { Text = "✕", FontSize = 9, Foreground = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40)), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
                            var closeBtn = new Border
                            {
                                Child = closeTb,
                                Background = Brushes.Transparent,
                                Cursor = Cursors.Hand,
                    Margin = new Thickness(4, 0, 0, 0),
                                Padding = new Thickness(2, 0, 0, 0)
                            };
                            closeBtn.MouseEnter += (s, e) => closeTb.Foreground = redBrush;
                            closeBtn.MouseLeave += (s, e) => closeTb.Foreground = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40));
                            chipStack.Children.Add(closeBtn);
                            var chip = new Border
                            {
                                Background = redBg,
                                BorderBrush = redBorder,
                                BorderThickness = new Thickness(1),
                                Padding = new Thickness(2, 2, 2, 2),
                                Margin = new Thickness(0, 0, 3, 0),
                                VerticalAlignment = VerticalAlignment.Center,
                                Child = chipStack
                            };
                            chip.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                            var nameCapture = name;
                            chipStack.Children[chipStack.Children.Count - 1].MouseLeftButtonDown += (s, e) =>
                            {
                                processNamesList.RemoveAll(n => string.Equals(n, nameCapture, StringComparison.OrdinalIgnoreCase));
                                RefreshChipsPanel();
                                SaveState();
                                _currentMacro!.ModifiedAt = DateTime.Now;
                                MacroChanged?.Invoke(this, EventArgs.Empty);
                                e.Handled = true;
                            };
                            chipsPanel.Children.Add(chip);
                        }
                        if (list.Count > maxVisibleChips)
                        {
                            if (moreChipSingleton == null)
                            {
                                var moreChip = new Border
                                {
                                    Background = redBg,
                                    BorderBrush = redBorder,
                                    BorderThickness = new Thickness(1),
                                    Padding = new Thickness(2, 2, 2, 2),
                                    Margin = new Thickness(0, 0, 3, 0),
                                    VerticalAlignment = VerticalAlignment.Center,
                                    MinHeight = 20,
                                    Child = new TextBlock { Text = "...", FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = redBrush, VerticalAlignment = VerticalAlignment.Center }
                                };
                                moreChip.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                var morePopup = new Popup { PlacementTarget = moreChip, Placement = PlacementMode.Bottom, StaysOpen = true };
                                void CloseMorePopup()
                                {
                                    morePopup.IsOpen = false;
                                    if (Application.Current.MainWindow != null)
                                        Application.Current.MainWindow.PreviewMouseDown -= OnMorePopupPreviewMouseDown;
                                }
                                void OnMorePopupPreviewMouseDown(object s, MouseButtonEventArgs ev)
                                {
                                    var clicked = ev.OriginalSource as DependencyObject;
                                    if (clicked == null) return;
                                    if (IsDescendantOf(morePopup.Child as DependencyObject, clicked) || IsDescendantOf(moreChip, clicked)) return;
                                    CloseMorePopup();
                                }
                                void OpenMorePopup()
                                {
                                    var restList = processNamesList.Skip(maxVisibleChips).ToList();
                                    if (restList.Count == 0) { CloseMorePopup(); return; }
                                    var panel = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(0, 2, 0, 0) };
                                    foreach (var name in restList)
                                    {
                                        var chipStack = new StackPanel { Orientation = Orientation.Horizontal };
                                        var iconSource = ProcessMonitor.GetIconForProcessName(name);
                                        if (iconSource != null)
                                            chipStack.Children.Add(new Border { Width = 14, Height = 14, Margin = new Thickness(0, 0, 4, 0), Child = new Image { Source = iconSource, Width = 14, Height = 14, Stretch = Stretch.Uniform } });
                                        chipStack.Children.Add(new TextBlock { Text = name, FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = redBrush, VerticalAlignment = VerticalAlignment.Center });
                                        var popupCloseTb = new TextBlock { Text = "✕", FontSize = 9, Foreground = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40)), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
                                        var popupCloseBtn = new Border
                                        {
                                            Child = popupCloseTb,
                                            Background = Brushes.Transparent,
                                            Cursor = Cursors.Hand,
                                            Margin = new Thickness(4, 0, 0, 0),
                                            Padding = new Thickness(2, 0, 0, 0)
                                        };
                                        popupCloseBtn.MouseEnter += (s, e) => popupCloseTb.Foreground = redBrush;
                                        popupCloseBtn.MouseLeave += (s, e) => popupCloseTb.Foreground = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40));
                                        chipStack.Children.Add(popupCloseBtn);
                                        var popupChip = new Border { Background = Brushes.Transparent, Padding = new Thickness(2, 2, 2, 2), Margin = new Thickness(0, 0, 0, 2), Child = chipStack };
                                        popupChip.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                        var nameCapture = name;
                                        chipStack.Children[chipStack.Children.Count - 1].MouseLeftButtonDown += (s, e) =>
                                        {
                                            processNamesList.RemoveAll(n => string.Equals(n, nameCapture, StringComparison.OrdinalIgnoreCase));
                                            RefreshChipsPanel();
                        SaveState();
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                                            OpenMorePopup();
                                            e.Handled = true;
                                        };
                                        panel.Children.Add(popupChip);
                                    }
                                    var popupBorder = new Border { Child = panel, Background = redBg, BorderBrush = redBorder, BorderThickness = new Thickness(1), Padding = new Thickness(4) };
                                    popupBorder.MouseLeave += (s, e) => CloseMorePopup();
                                    morePopup.Child = popupBorder;
                                    morePopup.IsOpen = true;
                                }
                                moreChip.MouseEnter += (s, e) =>
                                {
                                    OpenMorePopup();
                                    if (morePopup.IsOpen)
                                        Application.Current.MainWindow?.AddHandler(UIElement.PreviewMouseDownEvent, (MouseButtonEventHandler)OnMorePopupPreviewMouseDown, true);
                                };
                                moreChipSingleton = moreChip;
                                morePopupSingleton = morePopup;
                            }
                            chipsPanel.Children.Add(moreChipSingleton);
                        }
                    }

                    void AddChip(string name)
                    {
                        if (string.IsNullOrWhiteSpace(name) || processNamesList!.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase))) return;
                        processNamesList.Add(name);
                        RefreshChipsPanel();
                    }

                    RefreshChipsPanel();

                    var chipAddBtn = new Grid
                    {
                        Width = 23,
                        MinHeight = 23,
                        Height = 23,
                        Background = Brushes.Transparent,
                    Cursor = Cursors.Hand,
                        VerticalAlignment = VerticalAlignment.Center,
                        ToolTip = "Ajouter une application / un processus"
                    };
                    chipAddBtn.Children.Add(new Rectangle
                    {
                        Stroke = redBorder,
                        StrokeThickness = conditionBorderThickness,
                        StrokeDashArray = new DoubleCollection(new[] { 6.0, 3.0 }),
                        Fill = Brushes.Transparent,
                        HorizontalAlignment = HorizontalAlignment.Stretch,
                        VerticalAlignment = VerticalAlignment.Stretch,
                        RadiusX = 0,
                        RadiusY = 0
                    });
                    chipAddBtn.Children.Add(new TextBlock
                    {
                        Text = "＋",
                        FontSize = 11,
                        Foreground = redBrush,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    });
                    chipAddBtn.MouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        var processes = GetRunningProcessesWithIcons();
                        var borderLight = TryFindResource("BorderLightBrush") as Brush ?? new SolidColorBrush(Color.FromRgb(0x33, 0x33, 0x33));
                        var textMutedPicker = new SolidColorBrush(Color.FromArgb(0x99, 0x99, 0x99, 0x99));

                        const int searchCursorLeft = 2;
                        const int searchPlaceholderLeft = 6;
                        var searchBox = new TextBox
                        {
                            FontSize = 11,
                            Padding = new Thickness(searchCursorLeft, 4, 6, 4),
                            BorderThickness = new Thickness(0, 0, 0, 0),
                            Background = Brushes.Transparent,
                            CaretBrush = redBrush
                        };
                        searchBox.SetResourceReference(TextBox.ForegroundProperty, "TextPrimaryBrush");
                        searchBox.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                        var searchPlaceholder = new TextBlock { Text = "Rechercher…", FontSize = 11, Foreground = textMutedPicker, IsHitTestVisible = false, Margin = new Thickness(searchPlaceholderLeft, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
                        searchPlaceholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        var searchWrap = new Grid();
                        searchWrap.Children.Add(searchBox);
                        searchWrap.Children.Add(searchPlaceholder);
                        searchBox.TextChanged += (_, __) => searchPlaceholder.Visibility = string.IsNullOrEmpty(searchBox.Text) ? Visibility.Visible : Visibility.Collapsed;
                        var searchRow = new Border { BorderBrush = borderLight, BorderThickness = new Thickness(0, 0, 1, 1), Child = searchWrap };

                        var listBox = new ListBox
                        {
                            MaxHeight = 180,
                            BorderThickness = new Thickness(0, 0, 0, 0),
                            Background = Brushes.Transparent,
                            HorizontalContentAlignment = HorizontalAlignment.Stretch
                        };
                        if (TryFindResource("ListBoxPickerBorderScrollStyle") is Style pickerListStyle)
                            listBox.Style = pickerListStyle;
                        if (TryFindResource("ListBoxItemPickerStyle") is Style pickerItemStyle)
                            listBox.ItemContainerStyle = pickerItemStyle;
                        listBox.SetResourceReference(ListBox.ForegroundProperty, "TextSecondaryBrush");
                        listBox.SetResourceReference(ListBox.FontFamilyProperty, "FontMono");
                        const int manualCursorLeft = 2;
                        const int manualPlaceholderLeft = 6;
                        var manualBox = new TextBox
                        {
                            FontSize = 10,
                            Padding = new Thickness(manualCursorLeft, 4, 8, 4),
                            BorderThickness = new Thickness(1),
                            BorderBrush = borderLight,
                            CaretBrush = redBrush
                        };
                        manualBox.SetResourceReference(TextBox.ForegroundProperty, "TextPrimaryBrush");
                        manualBox.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                        var manualPlaceholder = new TextBlock { Text = "Nom du processus…", FontSize = 10, Foreground = textMutedPicker, IsHitTestVisible = false, Margin = new Thickness(manualPlaceholderLeft, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
                        manualPlaceholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        var manualWrap = new Grid();
                        manualWrap.Children.Add(manualBox);
                        manualWrap.Children.Add(manualPlaceholder);
                        manualBox.TextChanged += (_, __) => manualPlaceholder.Visibility = string.IsNullOrEmpty(manualBox.Text) ? Visibility.Visible : Visibility.Collapsed;

                        var footerGrid = new Grid();
                        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        footerGrid.Children.Add(manualWrap);
                        Grid.SetColumn(manualWrap, 0);
                        var addManualBtn = new Button { Content = "⊕", FontSize = 13, Padding = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, BorderBrush = borderLight, BorderThickness = new Thickness(1, 1, 1, 1), Background = Brushes.Transparent };
                        footerGrid.Children.Add(addManualBtn);
                        Grid.SetColumn(addManualBtn, 1);
                        addManualBtn.SetResourceReference(Button.ForegroundProperty, "TextSecondaryBrush");
                        addManualBtn.MouseEnter += (_, __) => { addManualBtn.BorderBrush = redBrush; addManualBtn.Foreground = redBrush; };
                        addManualBtn.MouseLeave += (_, __) => { addManualBtn.BorderBrush = borderLight; addManualBtn.SetValue(Button.ForegroundProperty, TryFindResource("TextSecondaryBrush")); };
                        var footer = new Border { BorderBrush = borderLight, BorderThickness = new Thickness(0, 1, 1, 0), Padding = new Thickness(10, 6, 10, 6), Child = footerGrid };

                        var popupContent = new StackPanel
                        {
                            Width = 240,
                            Background = TryFindResource("BackgroundSecondaryBrush") as Brush ?? new SolidColorBrush(Color.FromRgb(0x0D, 0x0F, 0x0D))
                        };
                        popupContent.Children.Add(searchRow);
                        popupContent.Children.Add(listBox);
                        popupContent.Children.Add(footer);

                        var selectedSet = new HashSet<string>(processNamesList, StringComparer.OrdinalIgnoreCase);
                        var listItems = new List<(string name, Border row)>();

                        void RefreshList()
                        {
                            var q = searchBox.Text.Trim().ToLowerInvariant();
                            listBox.Items.Clear();
                            listItems.Clear();
                            foreach (var process in processes.Where(p => string.IsNullOrEmpty(q) || p.ProcessName.ToLowerInvariant().Contains(q)))
                            {
                                var name = process.ProcessName;
                                var pid = process.ProcessId;
                                var iconSource = process.Icon;
                                var rowGrid = new Grid();
                                rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                                rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                                rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                                rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                                var iconBlock = new Border
                                {
                                    Width = 16,
                                    Height = 16,
                                    Margin = new Thickness(0, 0, 8, 0),
                                    Child = iconSource != null
                                        ? new Image { Source = iconSource, Width = 16, Height = 16, Stretch = Stretch.Uniform }
                                        : null
                                };
                                Grid.SetColumn(iconBlock, 0);
                                rowGrid.Children.Add(iconBlock);
                                var nameTb = new TextBlock { Text = name, FontSize = 10, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
                                nameTb.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                var nameWrap = new Border { Child = nameTb, Margin = new Thickness(0, 0, 8, 0), HorizontalAlignment = HorizontalAlignment.Stretch };
                                Grid.SetColumn(nameWrap, 1);
                                rowGrid.Children.Add(nameWrap);
                                var pidTb = new TextBlock { Text = pid.ToString(), FontSize = 9, Foreground = textMutedPicker, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right };
                                pidTb.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                Grid.SetColumn(pidTb, 2);
                                rowGrid.Children.Add(pidTb);
                                var checkTb = new TextBlock { Text = "✓", FontSize = 9, Foreground = redBrush, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 0, 0) };
                                checkTb.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                Grid.SetColumn(checkTb, 3);
                                rowGrid.Children.Add(checkTb);
                                var isSelected = selectedSet.Contains(name);
                                checkTb.Visibility = isSelected ? Visibility.Visible : Visibility.Collapsed;
                                var row = new Border
                                {
                                    Padding = new Thickness(10, 6, 10, 6),
                                    Child = rowGrid,
                                    Background = isSelected ? redBg : Brushes.Transparent,
                                    Cursor = Cursors.Hand,
                                    HorizontalAlignment = HorizontalAlignment.Stretch
                                };
                                row.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                                row.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
                                if (isSelected) nameTb.Foreground = redBrush;
                                row.MouseLeftButtonDown += (s2, e2) =>
                                {
                                    if (selectedSet.Contains(name))
                                    {
                                        selectedSet.Remove(name);
                                        processNamesList.RemoveAll(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase));
                                        RefreshChipsPanel();
                                        row.Background = Brushes.Transparent;
                                        nameTb.SetValue(TextBlock.ForegroundProperty, TryFindResource("TextSecondaryBrush"));
                                        checkTb.Visibility = Visibility.Collapsed;
                            }
                            else
                            {
                                        selectedSet.Add(name);
                                        AddChip(name);
                                        row.Background = redBg;
                                        nameTb.Foreground = redBrush;
                                        checkTb.Visibility = Visibility.Visible;
                                    }
                                    SaveState();
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                                    e2.Handled = true;
                                };
                                listBox.Items.Add(row);
                                listItems.Add((name, row));
                            }
                        }

                        searchBox.TextChanged += (s2, e2) => RefreshList();
                        RefreshList();

                        addManualBtn.Click += (s2, e2) =>
                        {
                            var val = manualBox.Text.Trim();
                            if (string.IsNullOrEmpty(val)) return;
                            if (!processNamesList.Any(n => string.Equals(n, val, StringComparison.OrdinalIgnoreCase)))
                            {
                                processNamesList.Add(val);
                                AddChip(val);
                                selectedSet.Add(val);
                                manualBox.Clear();
                                SaveState();
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                            }
                        };
                        manualBox.KeyDown += (s2, e2) => { if (e2.Key == Key.Enter) { addManualBtn.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); e2.Handled = true; } };

                        var popup = new Popup
                        {
                            PlacementTarget = chipAddBtn,
                            Placement = PlacementMode.Bottom,
                            StaysOpen = true,
                            Child = new Border
                            {
                                Child = popupContent,
                                BorderBrush = TryFindResource("BorderLightBrush") as Brush,
                                BorderThickness = new Thickness(1, 1, 0, 1)
                            }
                        };
                        void ClosePicker()
                        {
                            popup.IsOpen = false;
                            if (Application.Current.MainWindow != null)
                                Application.Current.MainWindow.PreviewMouseDown -= OnPreviewMouseDown;
                        }
                        void OnPreviewMouseDown(object s, MouseButtonEventArgs e)
                        {
                            var clicked = e.OriginalSource as DependencyObject;
                            if (clicked == null) return;
                            if (IsDescendantOf(popup.Child as DependencyObject, clicked) || IsDescendantOf(chipAddBtn, clicked))
                                return;
                            ClosePicker();
                        }
                        bool IsDescendantOf(DependencyObject ancestor, DependencyObject node)
                        {
                            while (node != null) { if (node == ancestor) return true; node = VisualTreeHelper.GetParent(node); }
                            return false;
                        }
                        Application.Current.MainWindow?.AddHandler(UIElement.PreviewMouseDownEvent, (MouseButtonEventHandler)OnPreviewMouseDown, true);
                        Dispatcher.BeginInvoke((Action)(() => popup.IsOpen = true), System.Windows.Threading.DispatcherPriority.Loaded);
                    };
                    condConfig.Children.Add(chipsPanel);
                    condConfig.Children.Add(chipAddBtn);
                }
                else if (condition.ConditionType == ConditionType.KeyboardKey)
                {
                    condition.KeyboardKeyConfig ??= new KeyboardKeyCondition();
                    string GetKeyConditionDisplay(KeyboardKeyCondition c)
                    {
                        if (c == null || c.VirtualKeyCode == 0) return "Touche…";
                        var parts = new List<string>();
                        if (c.RequireCtrl) parts.Add("Ctrl");
                        if (c.RequireAlt) parts.Add("Alt");
                        if (c.RequireShift) parts.Add("Shift");
                        parts.Add(GetKeyName(c.VirtualKeyCode));
                        return string.Join(" + ", parts);
                    }
                    var keyVal = new TextBlock
                    {
                        Text = GetKeyConditionDisplay(condition.KeyboardKeyConfig),
                        FontSize = 11,
                        FontWeight = FontWeights.Bold,
                        Foreground = redBrush,
                        VerticalAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = HorizontalAlignment.Left
                    };
                    keyVal.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                    var keyCapture = new TextBox
                    {
                        Background = Brushes.Transparent,
                        BorderThickness = new Thickness(0),
                        Padding = new Thickness(0),
                        MinHeight = 0,
                        VerticalAlignment = VerticalAlignment.Stretch,
                        HorizontalAlignment = HorizontalAlignment.Stretch,
                        VerticalContentAlignment = VerticalAlignment.Center,
                        IsReadOnly = true,
                        Focusable = true,
                        Cursor = Cursors.IBeam
                    };
                    keyCapture.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                    var fieldBorderBrush = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40));
                    var fieldBgBrush = new SolidColorBrush(Color.FromArgb(0x14, 0xE8, 0x40, 0x40));
                    var fieldPulseBorderBrush = new SolidColorBrush(Color.FromArgb(0x80, 0xE8, 0x40, 0x40));
                    var pulseBorderBrush = new SolidColorBrush(Color.FromArgb(0x80, 0xE8, 0x40, 0x40));
                    var pulseBgBrush = new SolidColorBrush(Color.FromArgb(0x14, 0xE8, 0x40, 0x40));
                    var keyField = new Border
                    {
                        BorderThickness = new Thickness(1),
                        BorderBrush = fieldBorderBrush,
                        Background = fieldBgBrush,
                        Padding = new Thickness(3, 2, 6, 4),
                        MinWidth = 120,
                        CornerRadius = new CornerRadius(0),
                        VerticalAlignment = VerticalAlignment.Center,
                        Cursor = Cursors.Hand,
                        ToolTip = "Cliquer puis appuyer sur une touche"
                    };
                    var keyFieldGrid = new Grid();
                    keyFieldGrid.Children.Add(keyVal);
                    keyFieldGrid.Children.Add(keyCapture);
                    keyField.Child = keyFieldGrid;
                    var pulseEase = new QuadraticEase { EasingMode = EasingMode.EaseInOut };
                    void StopPulse()
                    {
                        pulseBorderBrush.BeginAnimation(SolidColorBrush.ColorProperty, null);
                        pulseBgBrush.BeginAnimation(SolidColorBrush.ColorProperty, null);
                        keyField.BorderBrush = condition.KeyboardKeyConfig!.VirtualKeyCode != 0 ? fieldPulseBorderBrush : fieldBorderBrush;
                        keyField.Background = fieldBgBrush;
                    }
                    void StartPulse()
                    {
                        keyVal.Visibility = Visibility.Collapsed;
                        pulseBorderBrush.BeginAnimation(SolidColorBrush.ColorProperty, null);
                        pulseBgBrush.BeginAnimation(SolidColorBrush.ColorProperty, null);
                        keyField.BorderBrush = pulseBorderBrush;
                        keyField.Background = pulseBgBrush;
                        pulseBorderBrush.Color = Color.FromArgb(0x80, 0xE8, 0x40, 0x40);
                        pulseBgBrush.Color = Color.FromArgb(0x14, 0xE8, 0x40, 0x40);
                        var borderAnim = new ColorAnimation(
                            Color.FromRgb(0xE8, 0x40, 0x40),
                            new Duration(TimeSpan.FromSeconds(0.45)))
                        {
                            AutoReverse = true,
                            RepeatBehavior = RepeatBehavior.Forever,
                            EasingFunction = pulseEase
                        };
                        var bgAnim = new ColorAnimation(
                            Color.FromArgb(0x2E, 0xE8, 0x40, 0x40),
                            new Duration(TimeSpan.FromSeconds(0.45)))
                        {
                            AutoReverse = true,
                            RepeatBehavior = RepeatBehavior.Forever,
                            EasingFunction = pulseEase
                        };
                        pulseBorderBrush.BeginAnimation(SolidColorBrush.ColorProperty, borderAnim);
                        pulseBgBrush.BeginAnimation(SolidColorBrush.ColorProperty, bgAnim);
                    }
                    keyCapture.MouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        keyCapture.Focus();
                        StartPulse();
                    };
                    keyCapture.GotFocus += (s, e) => StartPulse();
                    keyCapture.LostFocus += (s, e) =>
                    {
                        StopPulse();
                        keyVal.Visibility = Visibility.Visible;
                        keyVal.Text = GetKeyConditionDisplay(condition.KeyboardKeyConfig!);
                    };
                    keyCapture.PreviewKeyDown += (s, e) =>
                    {
                        e.Handled = true;
                        if (e.Key == Key.LeftCtrl || e.Key == Key.RightCtrl || e.Key == Key.LeftShift || e.Key == Key.RightShift ||
                            e.Key == Key.LeftAlt || e.Key == Key.RightAlt || e.Key == Key.LWin || e.Key == Key.RWin ||
                            e.Key == Key.Tab || e.Key == Key.CapsLock)
                            return;
                        try
                        {
                            int vk = KeyInterop.VirtualKeyFromKey(e.Key);
                            if (vk <= 0) return;
                            condition.KeyboardKeyConfig!.VirtualKeyCode = (ushort)vk;
                            condition.KeyboardKeyConfig.RequireCtrl = (e.KeyboardDevice.Modifiers & System.Windows.Input.ModifierKeys.Control) != 0;
                            condition.KeyboardKeyConfig.RequireAlt = (e.KeyboardDevice.Modifiers & System.Windows.Input.ModifierKeys.Alt) != 0;
                            condition.KeyboardKeyConfig.RequireShift = (e.KeyboardDevice.Modifiers & System.Windows.Input.ModifierKeys.Shift) != 0;
                            keyVal.Text = GetKeyConditionDisplay(condition.KeyboardKeyConfig);
                            keyVal.Visibility = Visibility.Visible;
                            StopPulse();
                            SaveState();
                            _currentMacro!.ModifiedAt = DateTime.Now;
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                            Keyboard.ClearFocus();
                        }
                        catch { }
                    };
                    var keyWrap = new Border
                    {
                        VerticalAlignment = VerticalAlignment.Center,
                        Child = keyField
                    };
                    condConfig.Children.Add(keyWrap);
                }
                else if (condition.ConditionType == ConditionType.PixelColor)
                {
                    condition.PixelColorConfig ??= new PixelColorCondition { X = 0, Y = 0, ExpectedColor = "#e84040" };
                    var pc = condition.PixelColorConfig;
                    static System.Windows.Media.Color ParseHexColor(string hex)
                    {
                        hex = (hex ?? "").TrimStart('#');
                        if (hex.Length != 6) return System.Windows.Media.Color.FromRgb(0xE8, 0x40, 0x40);
                        int r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
                        int g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
                        int b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
                        return System.Windows.Media.Color.FromRgb((byte)r, (byte)g, (byte)b);
                    }
                    var pixelRedBorder = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x4D, 0xE8, 0x40, 0x40));
                    var pixelRedBg = new SolidColorBrush(System.Windows.Media.Color.FromArgb(0x0F, 0xE8, 0x40, 0x40));
                    const int conditionRowHeight = 23; // même hauteur que le ComboBox Si (condSelectWrap + bool toggle MinHeight)
                    var swatchBrush = new SolidColorBrush(ParseHexColor(pc.ExpectedColor));
                    var swatch = new Border
                    {
                        Width = conditionRowHeight,
                        Height = conditionRowHeight,
                        Background = swatchBrush,
                        Cursor = Cursors.Hand,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 0, 5, 0)
                    };
                    condConfig.Children.Add(swatch);
                    var xBox = new TextBox
                    {
                        Text = pc.X.ToString(),
                        Width = 44,
                        MaxLength = 5,
                        MinHeight = conditionRowHeight,
                        Height = conditionRowHeight,
                        FontSize = 11,
                        FontWeight = FontWeights.SemiBold,
                        Foreground = redBrush,
                        CaretBrush = redBrush,
                        Background = pixelRedBg,
                        BorderBrush = pixelRedBorder,
                        BorderThickness = new Thickness(1),
                        Padding = new Thickness(4, 2, 4, 2),
                        VerticalAlignment = VerticalAlignment.Center,
                        VerticalContentAlignment = VerticalAlignment.Center,
                        HorizontalContentAlignment = HorizontalAlignment.Left,
                        TextAlignment = TextAlignment.Left,
                        Margin = new Thickness(0, 0, 5, 0)
                    };
                    xBox.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                    xBox.SetResourceReference(FrameworkElement.StyleProperty, "TextBoxConditionCoord");
                    xBox.PreviewTextInput += (s, e) => { foreach (char c in e.Text ?? "") { if (!char.IsDigit(c)) { e.Handled = true; return; } } };
                    xBox.TextChanged += (s, e) =>
                    {
                        var digits = new string((xBox.Text ?? "").Where(char.IsDigit).ToArray());
                        if (digits.Length > 5) digits = digits.Substring(0, 5);
                        if (xBox.Text != digits) xBox.Text = digits;
                    };
                    xBox.LostFocus += (s, e) =>
                    {
                        if (int.TryParse(xBox.Text, out var x) && x >= 0) { pc.X = x; SaveState(); _currentMacro!.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                        else xBox.Text = pc.X.ToString();
                    };
                    condConfig.Children.Add(xBox);
                    var yBox = new TextBox
                    {
                        Text = pc.Y.ToString(),
                        Width = 44,
                        MaxLength = 5,
                        MinHeight = conditionRowHeight,
                        Height = conditionRowHeight,
                        FontSize = 11,
                        FontWeight = FontWeights.SemiBold,
                        Foreground = redBrush,
                        CaretBrush = redBrush,
                        Background = pixelRedBg,
                        BorderBrush = pixelRedBorder,
                        BorderThickness = new Thickness(1),
                        Padding = new Thickness(4, 2, 4, 2),
                        VerticalAlignment = VerticalAlignment.Center,
                        VerticalContentAlignment = VerticalAlignment.Center,
                        HorizontalContentAlignment = HorizontalAlignment.Left,
                        TextAlignment = TextAlignment.Left,
                        Margin = new Thickness(0, 0, 5, 0)
                    };
                    yBox.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                    yBox.SetResourceReference(FrameworkElement.StyleProperty, "TextBoxConditionCoord");
                    yBox.PreviewTextInput += (s, e) => { foreach (char c in e.Text ?? "") { if (!char.IsDigit(c)) { e.Handled = true; return; } } };
                    yBox.TextChanged += (s, e) =>
                    {
                        var digits = new string((yBox.Text ?? "").Where(char.IsDigit).ToArray());
                        if (digits.Length > 5) digits = digits.Substring(0, 5);
                        if (yBox.Text != digits) yBox.Text = digits;
                    };
                    yBox.LostFocus += (s, e) =>
                    {
                        if (int.TryParse(yBox.Text, out var y) && y >= 0) { pc.Y = y; SaveState(); _currentMacro!.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                        else yBox.Text = pc.Y.ToString();
                    };
                    condConfig.Children.Add(yBox);
                    var pointPickerIcon = LucideIcons.CreateIcon(LucideIcons.Mouse, 12);
                    pointPickerIcon.Foreground = redBrush;
                    var pointPickerBtn = new Border
                    {
                        Padding = new Thickness(5, 2, 5, 2),
                        Cursor = Cursors.Hand,
                        VerticalAlignment = VerticalAlignment.Center,
                        Background = Brushes.Transparent,
                        Child = pointPickerIcon,
                        ToolTip = "Sélectionner un point à l'écran"
                    };
                    pointPickerBtn.MouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        try
                        {
                            var win = Window.GetWindow(this);
                            var pointSelector = new PointPickerOverlayWindow { Owner = win };
                            if (pointSelector.ShowDialog() == true)
                            {
                                pc.X = pointSelector.SelectedX;
                                pc.Y = pointSelector.SelectedY;
                                xBox.Text = pc.X.ToString();
                                yBox.Text = pc.Y.ToString();
                SaveState();
                                _currentMacro!.ModifiedAt = DateTime.Now;
                                MacroChanged?.Invoke(this, EventArgs.Empty);
                            }
                        }
                        catch { }
                    };
                    condConfig.Children.Add(pointPickerBtn);

                    openPixelPop = (placementTarget) =>
                    {
                        var screenPt = placementTarget.PointToScreen(new Point(0, 0));
                        var contentY = screenPt.Y + placementTarget.RenderSize.Height + 6;
                        var pop = new PixelColorPopoverWindow(pc, screenPt.X, contentY, () =>
                        {
                            swatchBrush.Color = ParseHexColor(pc.ExpectedColor);
                        });
                        try { pop.Owner = Window.GetWindow(this); } catch { }
                        if (pop.ShowDialog() == true)
                        {
                            xBox.Text = pc.X.ToString();
                            yBox.Text = pc.Y.ToString();
                            swatchBrush.Color = ParseHexColor(pc.ExpectedColor);
                            SaveState();
                            _currentMacro!.ModifiedAt = DateTime.Now;
                            MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                    };
                    openColorPop = (placementTarget) =>
                    {
                        var screenPt = placementTarget.PointToScreen(new Point(0, 0));
                        var contentY = screenPt.Y + placementTarget.RenderSize.Height + 6;
                        var colorPop = new ColorPopoverWindow(pc.ExpectedColor, screenPt.X, contentY, (hex) =>
                        {
                            var h = (hex ?? "").Trim();
                            if (!h.StartsWith("#")) h = "#" + h;
                            pc.ExpectedColor = h;
                            swatchBrush.Color = ParseHexColor(h);
                        });
                        try { colorPop.Owner = Window.GetWindow(this); } catch { }
                        if (colorPop.ShowDialog() == true && !string.IsNullOrEmpty(colorPop.SelectedColorHex))
                        {
                            var hex = colorPop.SelectedColorHex.Trim();
                            if (!hex.StartsWith("#")) hex = "#" + hex;
                            pc.ExpectedColor = hex;
                            swatchBrush.Color = ParseHexColor(hex);
                            SaveState();
                _currentMacro!.ModifiedAt = DateTime.Now;
                MacroChanged?.Invoke(this, EventArgs.Empty);
                        }
                    };
                    swatch.MouseLeftButtonDown += (s, e) => { e.Handled = true; openColorPop?.Invoke(swatch); };
                    }
                    else
                    {
                    // Condition Clic souris : deux ComboBox inline (type + état) à droite, pas dans le dialogue
                    if (condition.ConditionType == ConditionType.MouseClick)
                    {
                        condition.MouseClickConfig ??= new MouseClickCondition();
                        var clickTypeCombo = new ComboBox
                        {
                            MinWidth = 88,
                            FontSize = 11,
                            FontWeight = FontWeights.SemiBold,
                            VerticalAlignment = VerticalAlignment.Center,
                            VerticalContentAlignment = VerticalAlignment.Center,
                            BorderThickness = new Thickness(0),
                            Background = Brushes.Transparent,
                            Padding = new Thickness(0),
                            Margin = new Thickness(0)
                        };
                        if (Application.Current.TryFindResource("ComboBoxSiRed") is Style siRedStyleClick)
                            clickTypeCombo.Style = siRedStyleClick;
                        if (Application.Current.TryFindResource("ComboBoxItemSiRed") is Style siRedItemStyleClick)
                            clickTypeCombo.ItemContainerStyle = siRedItemStyleClick;
                        clickTypeCombo.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
                        clickTypeCombo.Foreground = redBrush;
                        clickTypeCombo.Items.Add("Gauche");
                        clickTypeCombo.Items.Add("Droit");
                        clickTypeCombo.Items.Add("Milieu");
                        clickTypeCombo.Items.Add("Molette haut");
                        clickTypeCombo.Items.Add("Molette bas");

                        // Bordure rouge autour du ComboBox (comme les autres champs de condition)
                        var clickTypeWrap = new Border
                        {
                            CornerRadius = new CornerRadius(0),
                            BorderBrush = redBorder,
                            BorderThickness = new Thickness(1),
                            Background = redBg,
                            Padding = new Thickness(3, 2, 6, 2),
                            Margin = new Thickness(0, 0, 4, 0),
                VerticalAlignment = VerticalAlignment.Center,
                            Child = clickTypeCombo
                        };

                        int ct = Math.Max(0, Math.Min(condition.MouseClickConfig.ClickType, 7));
                        int clickTypeIdx = ct switch { 0 => 0, 1 => 1, 2 => 2, 3 => 0, 4 => 1, 5 => 2, 6 => 3, 7 => 4, _ => 0 };
                        int clickStateIdx = (ct >= 3 && ct <= 5) ? 1 : 0;
                        bool wheel = (clickTypeIdx == 3 || clickTypeIdx == 4);
                        clickTypeCombo.SelectedIndex = clickTypeIdx;

                        // Bascule Maintenu / Pressé (orange / violet comme ET/OU). Masquée pour les molettes.
                        var clickStateText = new TextBlock
                        {
                            Text = clickStateIdx == 0 ? "MNTN" : "PRS",
                            FontSize = 9,
                            FontWeight = FontWeights.ExtraBold,
                            Foreground = clickStateIdx == 0 ? amberBrush : purpleBrush,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            TextAlignment = TextAlignment.Center
                        };
                        clickStateText.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        var clickStateToggle = new Border
                        {
                            Child = clickStateText,
                            Background = clickStateIdx == 0 ? amberBg : purpleBg,
                            BorderBrush = clickStateIdx == 0 ? amberBorder : purpleBorder,
                            BorderThickness = new Thickness(1),
                            Padding = new Thickness(4, 3, 6, 3),
                            MinHeight = 23,
                            VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                            Margin = new Thickness(0, 0, 4, 0),
                            Visibility = wheel ? Visibility.Collapsed : Visibility.Visible,
                            ToolTip = "Basculer Maintenu / Pressé"
                        };

                        void ApplyClickTypeFromUi()
                        {
                            int t = clickTypeCombo.SelectedIndex;
                            bool w = (t == 3 || t == 4);
                            clickStateToggle.Visibility = w ? Visibility.Collapsed : Visibility.Visible;
                            int st = clickStateIdx;
                            condition.MouseClickConfig!.ClickType = (t, st) switch
                            {
                                (0, 0) => 0, (0, 1) => 3,
                                (1, 0) => 1, (1, 1) => 4,
                                (2, 0) => 2, (2, 1) => 5,
                                (3, _) => 6,
                                (4, _) => 7,
                                _ => 0
                            };
                        }

                        clickTypeCombo.SelectionChanged += (s, e) =>
                        {
                            if (clickTypeCombo.SelectedIndex < 0) return;
                            // sur molette, repasser à Maintenant (par cohérence si on revient sur clic)
                            if (clickTypeCombo.SelectedIndex == 3 || clickTypeCombo.SelectedIndex == 4)
                                clickStateIdx = 0;
                            ApplyClickTypeFromUi();
                            SaveState(); if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                        };

                        clickStateToggle.MouseLeftButtonDown += (s, e) =>
                        {
                            e.Handled = true;
                            clickStateIdx = clickStateIdx == 0 ? 1 : 0;
                            clickStateText.Text = clickStateIdx == 0 ? "MNTN" : "PRS";
                            clickStateText.Foreground = clickStateIdx == 0 ? amberBrush : purpleBrush;
                            clickStateToggle.Background = clickStateIdx == 0 ? amberBg : purpleBg;
                            clickStateToggle.BorderBrush = clickStateIdx == 0 ? amberBorder : purpleBorder;
                            ApplyClickTypeFromUi();
                            SaveState(); if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                        };
                        condConfig.Children.Add(clickTypeWrap);
                        condConfig.Children.Add(clickStateToggle);
                    }
                    else if (condition.ConditionType == ConditionType.Variable)
                    {
                        condition.VariableOperator ??= "==";
                        var noVal = condition.VariableOperator == "empty" || condition.VariableOperator == "not_empty";
                        var grayBorder = GetThemeBrush("BorderLightBrush") ?? new SolidColorBrush(Color.FromRgb(0x5A, 0x5D, 0x5A));
                        const int condVarRowHeight = 20; // hauteur des 3 éléments (un peu moins que le ComboBox conditions)

                        static double CondVarWidth(int length, double minWidth, double fontSize, FontWeight weight)
                        {
                            // Équivalent JS, mais basé sur la largeur réelle (monospace WPF)
                            var monoObj = Application.Current.TryFindResource("FontMono");
                            var fontFamily = monoObj is FontFamily ff ? ff : new FontFamily("Consolas");
                            var typeface = new Typeface(fontFamily, FontStyles.Normal, weight, FontStretches.Normal);
                            var text = length <= 0 ? "" : new string('M', length); // monospace => même largeur par caractère
                            var ft = new FormattedText(
                                text,
                                System.Globalization.CultureInfo.CurrentCulture,
                                FlowDirection.LeftToRight,
                                typeface,
                                fontSize,
                                Brushes.Transparent,
                                1.0);
                            var w = ft.Width + 16.0; // padding/offset comme le mockup JS
                            return Math.Max(minWidth, w);
                        }

                        var condVarNameInitial = (condition.VariableName ?? "").Trim();
                        var condVarName = new TextBox
                        {
                            Text = string.IsNullOrEmpty(condVarNameInitial) ? "" : "$" + condVarNameInitial,
                            FontSize = 11,
                            FontWeight = FontWeights.Bold,
                            Foreground = purpleBrush,
                            CaretBrush = purpleBrush,
                            Padding = new Thickness(2, 2, 10, 2),
                            Cursor = Cursors.IBeam,
                            Width = CondVarWidth(condVarNameInitial.Length, 70, 11, FontWeights.Bold),
                            MinWidth = 60,
                            MaxWidth = 220,
                            // +1 pour le "$" affiché automatiquement
                            MaxLength = 19,
                            MinHeight = condVarRowHeight,
                            VerticalAlignment = VerticalAlignment.Center,
                            VerticalContentAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Left,
                            BorderThickness = new Thickness(0),
                            Background = Brushes.Transparent,
                            Margin = new Thickness(0),
                            ToolTip = "Nom de la variable"
                        };
                        condVarName.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                        if (Application.Current.TryFindResource("TextBoxCondVarNoScroll") is Style condVarNameStyle)
                            condVarName.Style = condVarNameStyle;
                        // Même "méthode TextBox" que les coordonnées pixel : pas de scrolling interne
                        condVarName.SetResourceReference(FrameworkElement.StyleProperty, "TextBoxConditionCoordNoGap");
                        condVarName.BorderThickness = new Thickness(0);
                        condVarName.BorderBrush = Brushes.Transparent;
                        condVarName.Background = Brushes.Transparent;
                        condVarName.TextAlignment = TextAlignment.Left;
                        var namePlaceholder = new TextBlock
                        {
                            Text = "$variable",
                            FontSize = 11,
                            FontWeight = FontWeights.Bold,
                            FontStyle = FontStyles.Italic,
                            Foreground = new SolidColorBrush(Color.FromArgb(0x59, 0xA7, 0x8B, 0xFA)),
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(5, 0, 7, 0),
                            IsHitTestVisible = false
                        };
                        namePlaceholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        namePlaceholder.Visibility = string.IsNullOrEmpty(condition.VariableName) ? Visibility.Visible : Visibility.Collapsed;
                        bool condVarNameUpdating = false;
                        condVarName.TextChanged += (s, e) =>
                        {
                            if (condVarNameUpdating) return;
                            condVarNameUpdating = true;

                            var t = (condVarName.Text ?? "").Trim();
                            if (string.IsNullOrEmpty(t))
                            {
                                condition.VariableName = "";
                                condVarName.Text = "";
                            }
                            else if (t == "$")
                            {
                                // Permet à l'utilisateur de garder le '$' pour démarrer la saisie
                                condition.VariableName = "";
                                condVarName.Text = "$";
                                condVarName.CaretIndex = condVarName.Text.Length;
                            }
                            else
                            {
                                if (t.StartsWith("$", StringComparison.Ordinal))
                                    t = t.Substring(1).Trim();
                                condition.VariableName = t;
                                condVarName.Text = "$" + t;
                                condVarName.CaretIndex = condVarName.Text.Length;
                            }

                            // Ne pas masquer le '$' tapé par l'utilisateur avec le placeholder.
                            namePlaceholder.Visibility = string.IsNullOrEmpty(t) ? Visibility.Visible : Visibility.Collapsed;
                            SaveState(); if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            condVarNameUpdating = false;
                        };
                        var nameGrid = new Grid();
                        nameGrid.Children.Add(condVarName);
                        nameGrid.Children.Add(namePlaceholder);
                        var nameWrap = new Border
                        {
                            CornerRadius = new CornerRadius(0),
                            BorderThickness = new Thickness(1),
                            BorderBrush = new SolidColorBrush(Color.FromArgb(0x66, 0xA7, 0x8B, 0xFA)),
                            Background = new SolidColorBrush(Color.FromArgb(0x14, 0xA7, 0x8B, 0xFA)),
                            Padding = new Thickness(0),
                            Margin = new Thickness(0, 0, 4, 0),
                            MinHeight = condVarRowHeight,
                            VerticalAlignment = VerticalAlignment.Center,
                            Width = CondVarWidth(condVarNameInitial.Length, 70, 11, FontWeights.Bold),
                            Cursor = Cursors.IBeam,
                            HorizontalAlignment = HorizontalAlignment.Left,
                            Child = nameGrid
                        };
                        condVarName.AcceptsReturn = false;
                        condVarName.TextWrapping = TextWrapping.NoWrap;
                        // Redimensionnement dynamique (équivalent oninput JS)
                        condVarName.TextChanged += (_, __) =>
                        {
                            var len = (condition.VariableName ?? "").Trim().Length;
                            var w = CondVarWidth(len, 70, 11, FontWeights.Bold);
                            condVarName.Width = w;
                            nameWrap.Width = w;
                        };

                        var condVarOp = new ComboBox
                        {
                            FontSize = 12,
                            FontWeight = FontWeights.ExtraBold,
                            MinWidth = 40,
                            MinHeight = condVarRowHeight,
                VerticalAlignment = VerticalAlignment.Center,
                            VerticalContentAlignment = VerticalAlignment.Center,
                            HorizontalContentAlignment = HorizontalAlignment.Center,
                            Padding = new Thickness(4, 2, 4, 2),
                            BorderThickness = new Thickness(0),
                            Background = GetThemeBrush("BackgroundTertiaryBrush") ?? new SolidColorBrush(Color.FromRgb(0x11, 0x13, 0x11)),
                            Foreground = GetThemeBrush("TextPrimaryBrush") ?? new SolidColorBrush(Colors.White),
                            Margin = new Thickness(0)
                        };
                        if (Application.Current.TryFindResource("ComboBoxCondVarOp") is Style condVarOpStyle)
                            condVarOp.Style = condVarOpStyle;
                        condVarOp.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
                        condVarOp.Items.Add(new ComboBoxItem { Content = "==", Tag = "==", ToolTip = "exactement égal" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "!=", Tag = "!=", ToolTip = "différent" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = ">", Tag = ">", ToolTip = "strictement supérieur" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "≥", Tag = ">=", ToolTip = "supérieur ou égal" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "<", Tag = "<", ToolTip = "strictement inférieur" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "≤", Tag = "<=", ToolTip = "inférieur ou égal" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "∈", Tag = "contains", ToolTip = "contient" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "vide", Tag = "empty", ToolTip = "variable vide" });
                        condVarOp.Items.Add(new ComboBoxItem { Content = "!vide", Tag = "not_empty", ToolTip = "variable non vide" });
                        string SelectVarOpByValue(string? val)
                        {
                            if (string.IsNullOrEmpty(val)) val = "==";
                            for (int k = 0; k < condVarOp.Items.Count; k++)
                            {
                                if (condVarOp.Items[k] is ComboBoxItem cbi && (cbi.Tag as string) == val)
                                    return val;
                            }
                            return "==";
                        }
                        condition.VariableOperator = SelectVarOpByValue(condition.VariableOperator);
                        for (int k = 0; k < condVarOp.Items.Count; k++)
                        {
                            if (condVarOp.Items[k] is ComboBoxItem cbi && (cbi.Tag as string) == condition.VariableOperator)
                            { condVarOp.SelectedIndex = k; break; }
                        }
                        if (condVarOp.SelectedIndex < 0) condVarOp.SelectedIndex = 0;
                        var opWrap = new Border
                        {
                            CornerRadius = new CornerRadius(0),
                            BorderThickness = new Thickness(1),
                            BorderBrush = grayBorder,
                            Background = condVarOp.Background,
                            Padding = new Thickness(0),
                            Margin = new Thickness(0, 0, 4, 0),
                            MinHeight = condVarRowHeight,
                            VerticalAlignment = VerticalAlignment.Center,
                            Child = condVarOp
                        };
                        condVarOp.Background = Brushes.Transparent;

                        var condVarVal = new TextBox
                        {
                            Text = noVal ? "" : (condition.VariableValue ?? ""),
                            FontSize = 11,
                            FontWeight = FontWeights.SemiBold,
                            Foreground = redBrush,
                            CaretBrush = redBrush,
                            Padding = new Thickness(2, 2, 10, 2),
                            Cursor = Cursors.IBeam,
                            Width = double.NaN,
                            MinWidth = CondVarWidth((condition.VariableValue ?? "").Trim().Length, 60, 11, FontWeights.SemiBold),
                            MaxWidth = double.PositiveInfinity,
                            MaxLength = 18,
                            MinHeight = condVarRowHeight,
                            HorizontalAlignment = HorizontalAlignment.Stretch,
                            VerticalAlignment = VerticalAlignment.Center,
                            VerticalContentAlignment = VerticalAlignment.Center,
                            BorderThickness = new Thickness(0),
                            Background = Brushes.Transparent,
                            Margin = new Thickness(0),
                            IsEnabled = !noVal,
                            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                            ToolTip = noVal ? "—" : "Valeur à comparer"
                        };
                        condVarVal.AcceptsReturn = false;
                        condVarVal.TextWrapping = TextWrapping.NoWrap;
                        condVarVal.SetResourceReference(TextBox.FontFamilyProperty, "FontMono");
                        if (Application.Current.TryFindResource("TextBoxCondVarNoScroll") is Style condVarValStyle)
                            condVarVal.Style = condVarValStyle;
                        // Même "méthode TextBox" que les coordonnées pixel : pas de scrolling interne
                        condVarVal.SetResourceReference(FrameworkElement.StyleProperty, "TextBoxConditionCoordNoGap");
                        condVarVal.BorderThickness = new Thickness(0);
                        condVarVal.BorderBrush = Brushes.Transparent;
                        condVarVal.Background = Brushes.Transparent;
                        condVarVal.TextAlignment = TextAlignment.Left;
                        var valPlaceholder = new TextBlock
                        {
                            Text = "valeur",
                            FontSize = 11,
                            FontWeight = FontWeights.SemiBold,
                            FontStyle = FontStyles.Italic,
                            Foreground = new SolidColorBrush(Color.FromArgb(0x4D, 0xE8, 0x40, 0x40)),
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(5, 0, 7, 0),
                            IsHitTestVisible = false
                        };
                        valPlaceholder.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        valPlaceholder.Visibility = (noVal || string.IsNullOrEmpty(condVarVal.Text)) ? Visibility.Visible : Visibility.Collapsed;
                        var valGrid = new Grid();
                        valGrid.Children.Add(condVarVal);
                        valGrid.Children.Add(valPlaceholder);
                        var valWrap = new Border
                        {
                            CornerRadius = new CornerRadius(0),
                            BorderThickness = new Thickness(1),
                            BorderBrush = new SolidColorBrush(Color.FromArgb(0x4D, 0xE8, 0x40, 0x40)),
                            Background = new SolidColorBrush(Color.FromArgb(0x0F, 0xE8, 0x40, 0x40)),
                            Padding = new Thickness(0),
                            Margin = new Thickness(0),
                            MinHeight = condVarRowHeight,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Stretch,
                            Width = double.NaN,
                            MinWidth = CondVarWidth((condition.VariableValue ?? "").Trim().Length, 60, 11, FontWeights.SemiBold),
                            Cursor = Cursors.IBeam,
                            Child = valGrid
                        };

                        void UpdateVarConfigUi()
                        {
                            noVal = condition.VariableOperator == "empty" || condition.VariableOperator == "not_empty";
                            condVarVal.IsEnabled = !noVal;
                            condVarVal.Text = noVal ? "" : (condition.VariableValue ?? "");
                            condVarVal.ToolTip = noVal ? "—" : "Valeur à comparer";
                            valPlaceholder.Visibility = (noVal || string.IsNullOrEmpty(condVarVal.Text)) ? Visibility.Visible : Visibility.Collapsed;
                        }

                        condVarOp.SelectionChanged += (s, e) =>
                        {
                            if (condVarOp.SelectedItem is ComboBoxItem cbi && cbi.Tag is string tag)
                            {
                                condition.VariableOperator = tag;
                                if (tag == "empty" || tag == "not_empty")
                                    condition.VariableValue = "";
                                UpdateVarConfigUi();
                                SaveState(); if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            }
                        };

                        condVarVal.TextChanged += (s, e) =>
                        {
                            if (!noVal)
                                condition.VariableValue = condVarVal.Text?.Trim() ?? "";
                            valPlaceholder.Visibility = string.IsNullOrEmpty(condVarVal.Text) ? Visibility.Visible : Visibility.Collapsed;
                            var len = condVarVal.Text?.Trim().Length ?? 0;
                            var newW = CondVarWidth(len, 60, 11, FontWeights.SemiBold);
                            condVarVal.MinWidth = newW;
                            valWrap.MinWidth = newW;
                            SaveState(); if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                        };

                        var varRow = new Grid
                        {
                VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Stretch
                        };
                        varRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        varRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                        varRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                        Grid.SetColumn(nameWrap, 0);
                        Grid.SetColumn(opWrap, 1);
                        Grid.SetColumn(valWrap, 2);
                        varRow.Children.Add(nameWrap);
                        varRow.Children.Add(opWrap);
                        varRow.Children.Add(valWrap);

                        condConfig.Children.Add(varRow);
                    }
                    else if (condition.ConditionType == ConditionType.ImageOnScreen)
                    {
                        condition.ImageOnScreenConfig ??= new ImageOnScreenCondition { ImagePath = "", Sensitivity = 80 };
                        var io = condition.ImageOnScreenConfig;

                        var iconBrush = GetThemeBrush("TextPrimaryBrush") ?? new SolidColorBrush(Colors.White);

                        // Icons (font lucide) : Zone = \ue509, Image = \ue0f6
                        var thumbIcon = new TextBlock
                        {
                            Text = "\ue0f6",
                            FontSize = 18,
                            FontFamily = (FontFamily)FindResource("FontLucide"),
                            Foreground = new SolidColorBrush((iconBrush as SolidColorBrush)?.Color ?? Colors.White) { Opacity = 0.9 },
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center
                        };

                        var thumbImage = new System.Windows.Controls.Image
                        {
                            Stretch = System.Windows.Media.Stretch.UniformToFill,
                            Visibility = Visibility.Collapsed,
                            SnapsToDevicePixels = true
                        };
                        RenderOptions.SetBitmapScalingMode(thumbImage, BitmapScalingMode.HighQuality);
                        Popup? imagePreviewPopup = null;

                        var thumbBorder = new Border
                        {
                            Width = 28,
                            Height = 28,
                            BorderBrush = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            Background = Brushes.Transparent,
                Cursor = Cursors.Hand,
                            ToolTip = "Cliquer pour agrandir l'image",
                            Child = new Grid
                            {
                                Children =
                                {
                                    thumbImage,
                                    thumbIcon
                                }
                            }
                        };

                        thumbBorder.MouseLeftButtonDown += (s, e) =>
                        {
                            e.Handled = true;
                            if (imagePreviewPopup != null && imagePreviewPopup.IsOpen)
                            {
                                imagePreviewPopup.IsOpen = false;
                                imagePreviewPopup = null;
                                return;
                            }
                            var path = (io.ImagePath ?? "").Trim();
                            if (string.IsNullOrEmpty(path) || !System.IO.File.Exists(path)) return;
                            try
                            {
                                var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                                bitmap.BeginInit();
                                bitmap.UriSource = new Uri(path, UriKind.Absolute);
                                bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                                bitmap.EndInit();
                                var screenPt = thumbBorder.PointToScreen(new Point(0, 0));
                                double thumbBottom = screenPt.Y + thumbBorder.ActualHeight;
                                double screenH = SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight;
                                double spaceBelow = screenH - thumbBottom;
                                double spaceAbove = screenPt.Y - SystemParameters.VirtualScreenTop;
                                var popup = new Popup
                                {
                                    PlacementTarget = thumbBorder,
                                    Placement = spaceBelow >= 280 || spaceBelow >= spaceAbove ? PlacementMode.Bottom : PlacementMode.Top,
                                    VerticalOffset = 4,
                                    StaysOpen = true,
                                    Child = new Border
                                    {
                                        Background = new SolidColorBrush(Color.FromRgb(0x1A, 0x1A, 0x1A)),
                                        BorderBrush = GetThemeBrush("BorderLightBrush") ?? new SolidColorBrush(Color.FromRgb(0x44, 0x44, 0x44)),
                                        BorderThickness = new Thickness(1),
                                        Padding = new Thickness(0),
                                        Child = new System.Windows.Controls.Image
                                        {
                                            Source = bitmap,
                                            Stretch = System.Windows.Media.Stretch.Uniform,
                                            MaxWidth = 520,
                                            MaxHeight = 380,
                                            SnapsToDevicePixels = true
                                        }
                                    }
                                };
                                if (popup.Child is Border border && border.Child is System.Windows.Controls.Image previewImg)
                                    RenderOptions.SetBitmapScalingMode(previewImg, BitmapScalingMode.HighQuality);
                                bool IsDescendantOfImage(DependencyObject? ancestor, DependencyObject? node)
                                {
                                    while (node != null) { if (node == ancestor) return true; node = VisualTreeHelper.GetParent(node); }
                                    return false;
                                }
                                void CloseImagePreviewPopup()
                                {
                                    popup.IsOpen = false;
                                    imagePreviewPopup = null;
                                    if (Application.Current.MainWindow != null)
                                        Application.Current.MainWindow.PreviewMouseDown -= OnImagePreviewPreviewMouseDown;
                                }
                                void OnImagePreviewPreviewMouseDown(object _s, MouseButtonEventArgs ev)
                                {
                                    var clicked = ev.OriginalSource as DependencyObject;
                                    if (clicked == null) return;
                                    if (IsDescendantOfImage(popup.Child as DependencyObject, clicked) || IsDescendantOfImage(thumbBorder, clicked)) return;
                                    CloseImagePreviewPopup();
                                }
                                popup.Closed += (_, _) =>
                                {
                                    if (ReferenceEquals(imagePreviewPopup, popup))
                                        imagePreviewPopup = null;
                                    if (Application.Current.MainWindow != null)
                                        Application.Current.MainWindow.PreviewMouseDown -= OnImagePreviewPreviewMouseDown;
                                };
                                imagePreviewPopup = popup;
                                popup.IsOpen = true;
                                Application.Current.MainWindow?.AddHandler(UIElement.PreviewMouseDownEvent, (MouseButtonEventHandler)OnImagePreviewPreviewMouseDown, true);
                            }
                            catch { }
                        };

                        void RefreshThumb()
                        {
                            var path = (io.ImagePath ?? "").Trim();
                            if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                            {
                                try
                                {
                                    var bitmap = new System.Windows.Media.Imaging.BitmapImage();
                                    bitmap.BeginInit();
                                    bitmap.UriSource = new Uri(path, UriKind.Absolute);
                                    bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                                    bitmap.EndInit();
                                    thumbImage.Source = bitmap;
                                    thumbImage.Visibility = Visibility.Visible;
                                    thumbIcon.Visibility = Visibility.Collapsed;
                                }
                                catch
                                {
                                    thumbImage.Source = null;
                                    thumbImage.Visibility = Visibility.Collapsed;
                                    thumbIcon.Visibility = Visibility.Visible;
                                }
                            }
                            else
                            {
                                thumbImage.Source = null;
                                thumbImage.Visibility = Visibility.Collapsed;
                                thumbIcon.Visibility = Visibility.Visible;
                            }
                        }

                        RefreshThumb();

                        openImagePop = (placementTarget) =>
                        {
                            var screenPt = placementTarget.PointToScreen(new Point(0, 0));
                            var contentX = screenPt.X;
                            var contentY = screenPt.Y + placementTarget.RenderSize.Height + 6;

                            var vsl = SystemParameters.VirtualScreenLeft;
                            var vsw = SystemParameters.VirtualScreenWidth;
                            // Popover width ~= 260, keep small margin to avoid clipping
                            if (contentX + 260 > vsl + vsw - 8)
                                contentX = (vsl + vsw - 268);

                            var pop = new ImageOnScreenPopoverWindow(io, contentX, contentY);
                            try { pop.Owner = Window.GetWindow(this); } catch { }

                            if (pop.ShowDialog() == true)
                            {
                                RefreshThumb();
                                SaveState();
                                if (_currentMacro != null)
                                {
                                    _currentMacro.ModifiedAt = DateTime.Now;
                MacroChanged?.Invoke(this, EventArgs.Empty);
                                }
                            }
                        };

                        condConfig.Children.Add(thumbBorder);
                    }
                    else if (condition.ConditionType == ConditionType.TextOnScreen)
                    {
                        condition.TextOnScreenConfig ??= new TextOnScreenCondition { Text = "" };
                        var tos = condition.TextOnScreenConfig;

                        // Couleurs proches du snippet web
                        var unsetColor = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0x40, 0x40)); // rgba(...,0.4)
                        var unsetBorder = new SolidColorBrush(Color.FromArgb(0x33, 0xE8, 0x40, 0x40)); // rgba(...,0.2)
                        var setBg = new SolidColorBrush(Color.FromArgb(0x0F, 0xE8, 0x40, 0x40)); // rgba(...,0.06)
                        var setBorder = new SolidColorBrush(Color.FromArgb(0x59, 0xE8, 0x40, 0x40)); // rgba(...,0.35)

                        var thumbText = new TextBlock
                        {
                            Text = "non configuré",
                            FontSize = 10,
                            FontWeight = FontWeights.SemiBold,
                            FontFamily = (FontFamily)FindResource("FontMono"),
                            Foreground = unsetColor,
                            FontStyle = FontStyles.Italic,
                            TextTrimming = TextTrimming.CharacterEllipsis,
                            TextWrapping = TextWrapping.NoWrap,
                            MaxWidth = 120,
                            Margin = new Thickness(4, 0, 4, 0),
                            HorizontalAlignment = HorizontalAlignment.Left,
                            VerticalAlignment = VerticalAlignment.Center
                        };

                        var dashRect = new Rectangle
                        {
                            Stroke = unsetBorder,
                            StrokeThickness = 1,
                            StrokeDashArray = new DoubleCollection(new[] { 6.0, 3.0 }),
                            Fill = Brushes.Transparent,
                            RadiusX = 0,
                            RadiusY = 0,
                            HorizontalAlignment = HorizontalAlignment.Stretch,
                            VerticalAlignment = VerticalAlignment.Stretch
                        };

                        var thumbGrid = new Grid();
                        thumbGrid.Children.Add(dashRect);
                        thumbGrid.Children.Add(thumbText);

                        var thumbBorder = new Border
                        {
                            Padding = new Thickness(2, 0, 2, 0),
                            MinHeight = 23, // même hauteur visuelle que les contrôles type ComboBox
                            BorderThickness = new Thickness(0),
                            Background = Brushes.Transparent,
                            Cursor = Cursors.Arrow,
                            Child = thumbGrid,
                VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Left,
                            ToolTip = "Configurer la condition (Texte à l'écran)"
                        };

                        void RefreshThumb()
                        {
                            var t = (tos.Text ?? "").Trim();
                            var isSet = !string.IsNullOrEmpty(t);
                            const int inlineTextMaxChars = 16;
                            var oneLine = (t ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();

                            thumbText.Text = isSet
                                ? (oneLine.Length > inlineTextMaxChars ? oneLine.Substring(0, inlineTextMaxChars) + "…" : oneLine)
                                : "non configuré";
                            thumbText.FontStyle = isSet ? FontStyles.Normal : FontStyles.Italic;
                            thumbText.Foreground = isSet ? redBrush : unsetColor;
                            thumbBorder.Background = isSet ? setBg : Brushes.Transparent;
                            // Affiche toujours le texte complet au survol quand la condition est configurée.
                            thumbBorder.ToolTip = isSet ? t : "Configurer la condition (Texte à l'écran)";

                            dashRect.Stroke = isSet ? setBorder : unsetBorder;
                            dashRect.StrokeDashArray = isSet
                                ? null
                                : new DoubleCollection(new[] { 6.0, 3.0 });
                        }

                        openTextPop = (placementTarget) =>
                        {
                            var screenPt = placementTarget.PointToScreen(new Point(0, 0));
                            var contentX = screenPt.X;
                            var contentYBase = screenPt.Y;
                            var thumbBottom = screenPt.Y + placementTarget.RenderSize.Height;

                            var vsl = SystemParameters.VirtualScreenLeft;
                            var vsw = SystemParameters.VirtualScreenWidth;
                            var screenH = SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight;

                            if (contentX + 280 > vsl + vsw - 8)
                                contentX = vsl + vsw - 288;

                            const double popH = 340;
                            var spaceBelow = screenH - thumbBottom;
                            var spaceAbove = contentYBase - SystemParameters.VirtualScreenTop;
                            var contentY = (spaceBelow >= popH || spaceBelow >= spaceAbove) ? (thumbBottom + 6) : (contentYBase - popH - 6);

                            var pop = new TextOnScreenPopoverWindow(tos, contentX, contentY);
                            try { pop.Owner = Window.GetWindow(this); } catch { }

                            if (pop.ShowDialog() == true)
                            {
                                RefreshThumb();
                                SaveState();
                                if (_currentMacro != null)
                                {
                                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                                }
                            }
                        };

                        RefreshThumb();
                        condConfig.Children.Add(thumbBorder);
                    }
                    else
                    {
                        previewText = new TextBlock
                        {
                            Text = GetConditionPreviewText(condition),
                            FontSize = 11,
                            FontWeight = FontWeights.SemiBold,
                            Foreground = redBrush,
                VerticalAlignment = VerticalAlignment.Center,
                            MaxWidth = 160,
                            TextTrimming = TextTrimming.CharacterEllipsis,
                            Margin = new Thickness(0, 0, 4, 0)
                        };
                        previewText.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        condConfig.Children.Add(previewText);

                        // Interaction spéciale pour Position souris
                        if (condition.ConditionType == ConditionType.MousePosition)
                    {
                        // 1) Clic sur les coordonnées = aperçu de la zone (si définie) ou ouverture du sélecteur
                        previewText.Cursor = Cursors.Hand;
                        previewText.ToolTip = "Cliquer pour visualiser / définir la zone";

                        previewText.MouseEnter += (s, e) =>
                        {
                            previewText.Foreground = GetThemeBrush("ErrorBrush");
                            previewText.TextDecorations = TextDecorations.Underline;
                        };
                        previewText.MouseLeave += (s, e) =>
                        {
                            previewText.Foreground = redBrush;
                            previewText.TextDecorations = null;
                        };

                        previewText.MouseLeftButtonDown += (s, e) =>
                        {
                            e.Handled = true;

                            if (condition.MousePositionConfig == null ||
                                (condition.MousePositionConfig.X1 == condition.MousePositionConfig.X2 &&
                                 condition.MousePositionConfig.Y1 == condition.MousePositionConfig.Y2))
                            {
                                // Pas encore de zone → même comportement que bouton Zone
                                var zoneSelector = new ZoneSelectorWindow();
                                if (zoneSelector.ShowDialog() == true)
                {
                    SaveState();
                                    condition.MousePositionConfig ??= new MousePositionCondition();
                                    condition.MousePositionConfig.X1 = zoneSelector.X1;
                                    condition.MousePositionConfig.Y1 = zoneSelector.Y1;
                                    condition.MousePositionConfig.X2 = zoneSelector.X2;
                                    condition.MousePositionConfig.Y2 = zoneSelector.Y2;
                                    previewText.Text = GetConditionPreviewText(condition);
                                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                                }
                            }
                            else
                            {
                                // Zone déjà définie → aperçu visuel
                                var cfg = condition.MousePositionConfig;
                                var preview = new ZonePreviewWindow(cfg!.X1, cfg.Y1, cfg.X2, cfg.Y2)
                                {
                                    Owner = Window.GetWindow(this)
                                };
                                preview.ShowDialog();
                            }
                        };

                        // 2) Bouton Zone à droite des coordonnées pour (re)définir la zone
                        var zoneText = new TextBlock
                        {
                            // Icône Lucide carré pointillé + pointeur
                            Text = "\ue509",
                            FontSize = 14,
                            FontFamily = (FontFamily)FindResource("FontLucide"),
                            Foreground = GetThemeBrush("TextSecondaryBrush"),
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(0, -1, 0, 0)
                        };

                        var zoneBtnBorder = new Border
                        {
                            Padding = new Thickness(4, 1, 4, 1),
                            Margin = new Thickness(0, 0, 4, 0),
                            Background = Brushes.Transparent,
                            BorderThickness = new Thickness(0),
                            CornerRadius = new CornerRadius(0),
                Cursor = Cursors.Hand,
                            VerticalAlignment = VerticalAlignment.Center,
                            Child = zoneText,
                            ToolTip = "Sélectionner la zone"
                        };

                        zoneBtnBorder.MouseEnter += (s, e) =>
                        {
                            var red = GetThemeBrush("ErrorBrush");
                            zoneText.Foreground = red;
                        };

                        zoneBtnBorder.MouseLeave += (s, e) =>
                        {
                            zoneText.Foreground = GetThemeBrush("TextSecondaryBrush");
                        };

                        zoneBtnBorder.MouseLeftButtonDown += (s, e) =>
                        {
                            e.Handled = true;
                            var zoneSelector = new ZoneSelectorWindow();
                            if (zoneSelector.ShowDialog() == true)
            {
                SaveState();
                                condition.MousePositionConfig ??= new MousePositionCondition();
                                condition.MousePositionConfig.X1 = zoneSelector.X1;
                                condition.MousePositionConfig.Y1 = zoneSelector.Y1;
                                condition.MousePositionConfig.X2 = zoneSelector.X2;
                                condition.MousePositionConfig.Y2 = zoneSelector.Y2;
                                previewText.Text = GetConditionPreviewText(condition);
                                if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                            }
                        };

                        condConfig.Children.Add(zoneBtnBorder);
                        }
                    }
                }
                Border configBtn;
                if (condition.ConditionType == ConditionType.ImageOnScreen || condition.ConditionType == ConditionType.TextOnScreen)
                {
                    var borderNormal = GetThemeBrush("BorderLightBrush") ?? new SolidColorBrush(Color.FromRgb(0x5A, 0x5D, 0x5A));
                    var borderHover = GetThemeBrush("ErrorBrush") ?? new SolidColorBrush(Color.FromRgb(0xE8, 0x40, 0x40));
                    var fgNormal = textMuted;
                    var fgHover = borderHover;

                    var icon = new TextBlock
                    {
                        Text = condition.ConditionType == ConditionType.TextOnScreen ? LucideIcons.TextSearch : "\ue172", // TextSearch / SquarePen
                        FontSize = 12,
                        FontFamily = (FontFamily)FindResource("FontLucide"),
                        Foreground = fgNormal,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    var cfgText = new TextBlock
                    {
                        Text = "Config",
                        FontSize = 9,
                        FontWeight = FontWeights.SemiBold,
                        Foreground = fgNormal,
                        Margin = new Thickness(6, 0, 0, 0),
                        VerticalAlignment = VerticalAlignment.Center
                    };

                    var stack = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
                    stack.Children.Add(icon);
                    stack.Children.Add(cfgText);

                    configBtn = new Border
                    {
                        Height = 22,
                        Background = Brushes.Transparent,
                        BorderBrush = borderNormal,
                        BorderThickness = new Thickness(1),
                        CornerRadius = new CornerRadius(0),
                        Cursor = Cursors.Hand,
                        Padding = new Thickness(6, 0, 6, 0),
                        Child = stack,
                        ToolTip = "Configurer la condition"
                    };

                    configBtn.MouseEnter += (s, e) =>
                    {
                        configBtn.BorderBrush = borderHover;
                        icon.Foreground = fgHover;
                        cfgText.Foreground = fgHover;
                    };
                    configBtn.MouseLeave += (s, e) =>
                    {
                        configBtn.BorderBrush = borderNormal;
                        icon.Foreground = fgNormal;
                        cfgText.Foreground = fgNormal;
                    };
                }
                else
                {
                    configBtn = new Border
                    {
                        Width = 22,
                        Height = 22,
                        Background = Brushes.Transparent,
                        Cursor = Cursors.Hand,
                        Child = new TextBlock { Text = "⚙", FontSize = 10, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = textMuted },
                        ToolTip = "Configurer la condition"
                    };
                }
                configBtn.MouseLeftButtonDown += (s, e) =>
                {
                    e.Handled = true;
                    if (condition.ConditionType == ConditionType.PixelColor && openPixelPop != null)
                    {
                        openPixelPop(configBtn);
                        return;
                    }
                    if (condition.ConditionType == ConditionType.ImageOnScreen && openImagePop != null)
                    {
                        openImagePop(configBtn);
                        return;
                    }
                    if (condition.ConditionType == ConditionType.TextOnScreen && openTextPop != null)
                    {
                        openTextPop(configBtn);
                        return;
                    }
                    var temp = new IfAction { Conditions = new List<ConditionItem> { condition }, Operators = new List<LogicalOperator>() };
                    var dialog = new ConditionConfigDialog(temp);
                dialog.Owner = Window.GetWindow(this);
                    if (dialog.ShowDialog() == true && dialog.Result?.Conditions?.Count > 0 == true)
                {
                    SaveState();
                        var rc = dialog.Result.Conditions[0];
                        condition.ConditionType = rc.ConditionType;
                        condition.Condition = rc.Condition;
                        condition.ActiveApplicationConfig = rc.ActiveApplicationConfig;
                        condition.KeyboardKeyConfig = rc.KeyboardKeyConfig;
                        condition.ProcessRunningConfig = rc.ProcessRunningConfig;
                        condition.PixelColorConfig = rc.PixelColorConfig;
                        condition.MousePositionConfig = rc.MousePositionConfig;
                        condition.TimeDateConfig = rc.TimeDateConfig;
                        condition.ImageOnScreenConfig = rc.ImageOnScreenConfig;
                        condition.TextOnScreenConfig = rc.TextOnScreenConfig;
                        condition.MouseClickConfig = rc.MouseClickConfig != null ? new MouseClickCondition { ClickType = rc.MouseClickConfig.ClickType } : null;
                        condition.VariableName = rc.VariableName;
                        condition.VariableOperator = rc.VariableOperator;
                        condition.VariableValue = rc.VariableValue;
                        if (previewText != null)
                            previewText.Text = GetConditionPreviewText(condition);
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
                condConfig.Children.Add(configBtn);
                mainPanel.Children.Add(condConfig);

                // cond-remove ✕ (si pas la seule condition)
                if (ifAction.Conditions.Count > 1)
                {
                    var condRemove = new TextBlock
                    {
                        Text = "✕",
                        FontSize = 10,
                        Foreground = textMuted,
                VerticalAlignment = VerticalAlignment.Center,
                Cursor = Cursors.Hand,
                        Margin = new Thickness(2, 0, 0, 0),
                        ToolTip = "Supprimer cette condition"
            };
                    condRemove.MouseLeftButtonDown += (s, e) =>
            {
                SaveState();
                        if (ifAction.Conditions.Count <= 1) return;
                        ifAction.Conditions.RemoveAt(conditionIndex);
                        if (conditionIndex > 0 && conditionIndex <= ifAction.Operators.Count)
                            ifAction.Operators.RemoveAt(conditionIndex - 1);
                        else if (conditionIndex == 0 && ifAction.Operators.Count > 0)
                            ifAction.Operators.RemoveAt(0);
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
                        e.Handled = true;
                    };
                    mainPanel.Children.Add(condRemove);
                }
            }

            // cond-add-group : ＋ ET / ＋ OU
            var condAddAnd = new Border
            {
                Child = new TextBlock { Text = "＋ ET", FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = textMuted, VerticalAlignment = VerticalAlignment.Center },
                BorderBrush = line2,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(6, 3, 6, 3),
                Margin = new Thickness(8, 0, 2, 0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                Background = Brushes.Transparent,
                ToolTip = "Ajouter une condition (ET)"
            };
            condAddAnd.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            condAddAnd.MouseLeftButtonDown += (s, e) =>
                {
                    SaveState();
                ifAction.Conditions.Add(new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true });
                ifAction.Operators.Add(LogicalOperator.AND);
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                e.Handled = true;
            };
            mainPanel.Children.Add(condAddAnd);
            var condAddOr = new Border
            {
                Child = new TextBlock { Text = "＋ OU", FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = textMuted, VerticalAlignment = VerticalAlignment.Center },
                BorderBrush = line2,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(6, 3, 6, 3),
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                Background = Brushes.Transparent,
                ToolTip = "Ajouter une condition (OU)"
            };
            condAddOr.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            condAddOr.MouseLeftButtonDown += (s, e) =>
            {
                SaveState();
                ifAction.Conditions.Add(new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true });
                ifAction.Operators.Add(LogicalOperator.OR);
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
                e.Handled = true;
            };
            mainPanel.Children.Add(condAddOr);

            // block-spacer + block-count (nombre d'actions dans le bloc Then)
            var spacer = new Border { Width = 16, Background = Brushes.Transparent };
            mainPanel.Children.Add(spacer);
            var thenCount = ifAction.ThenActions?.Count ?? 0;
            var blockCount = new TextBlock
            {
                Text = $"{thenCount} action{(thenCount != 1 ? "s" : "")}",
                FontSize = 11,
                Foreground = textMuted,
                VerticalAlignment = VerticalAlignment.Center
            };
            blockCount.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
            mainPanel.Children.Add(blockCount);

            return mainPanel;
        }

        /// <summary>
        /// Crée l'interface pour gérer les groupes de conditions visuellement (compacte, horizontale)
        /// Format: (A ET B) OU (C ET D)
        /// </summary>
        private StackPanel CreateConditionGroupsUI(IfAction ifAction, int index, Panel parentPanel, SolidColorBrush? siBrush = null, SolidColorBrush? siBorder = null, SolidColorBrush? siBg = null)
        {
            var redBrush = siBrush ?? GetThemeBrush("TextPrimaryBrush") as SolidColorBrush ?? new SolidColorBrush(Colors.White);
            var redBorder = siBorder ?? new SolidColorBrush(GetThemeColor("InfoColor"));
            var redBg = siBg ?? new SolidColorBrush(Color.FromArgb(25, 0x34, 0xC8, 0xB8));

            var mainPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            // Label "Si" (style carte rouge)
            var ifLabel = new TextBlock
            {
                Text = "Si",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 6, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = redBrush
            };
            mainPanel.Children.Add(ifLabel);

            // Afficher chaque groupe
            for (int gi = 0; gi < ifAction.ConditionGroups.Count; gi++)
            {
                var group = ifAction.ConditionGroups[gi];
                var groupIndex = gi;

                // Séparateur "OU" entre les groupes
                if (gi > 0)
                {
                    var orLabel = new TextBlock
                    {
                        Text = "OU",
                        FontSize = 11,
                        FontWeight = FontWeights.Bold,
                        Foreground = redBrush,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(6, 0, 6, 0)
                    };
                    mainPanel.Children.Add(orLabel);
                }

                // Bordure du groupe (style Si rouge)
                var groupBorder = new Border
                {
                    BorderBrush = redBorder,
                    BorderThickness = new Thickness(2),
                    CornerRadius = new CornerRadius(0),
                    Padding = new Thickness(4, 2, 4, 2),
                    Background = redBg,
                    VerticalAlignment = VerticalAlignment.Center
                };

                var groupContent = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };

                // Afficher les conditions du groupe
                if (group.Conditions != null)
                {
                    for (int ci = 0; ci < group.Conditions.Count; ci++)
                    {
                        var condition = group.Conditions[ci];
                        var conditionIndex = ci;

                        // Séparateur "ET" entre les conditions
                        if (ci > 0)
                        {
                            var andLabel = new TextBlock
                            {
                                Text = "ET",
                                FontSize = 10,
                                FontWeight = FontWeights.Bold,
                                Foreground = redBrush,
                                VerticalAlignment = VerticalAlignment.Center,
                                Margin = new Thickness(4, 0, 4, 0)
                            };
                            groupContent.Children.Add(andLabel);
                        }

                        // ComboBox compacte pour le type de condition (style Si rouge)
                        var conditionTypeComboBox = new ComboBox
                        {
                            Width = 90,
                            FontSize = 10,
                            Height = 22,
                            VerticalAlignment = VerticalAlignment.Center,
                            Padding = new Thickness(2, 0, 2, 0)
                        };
                        if (Application.Current.TryFindResource("ComboBoxSiRed") is Style groupSiCbStyle)
                            conditionTypeComboBox.Style = groupSiCbStyle;
                        if (Application.Current.TryFindResource("ComboBoxItemSiRed") is Style groupSiItemStyle)
                            conditionTypeComboBox.ItemContainerStyle = groupSiItemStyle;
                        conditionTypeComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
                        conditionTypeComboBox.Items.Add("Booléen");
                        conditionTypeComboBox.Items.Add("App");
                        conditionTypeComboBox.Items.Add("Touche");
                        conditionTypeComboBox.Items.Add("Processus");
                        conditionTypeComboBox.Items.Add("Pixel");
                        conditionTypeComboBox.Items.Add("Souris");
                        conditionTypeComboBox.Items.Add("Temps");
                        conditionTypeComboBox.Items.Add("Image");
                        conditionTypeComboBox.Items.Add("Texte");
                        conditionTypeComboBox.Items.Add("Variable");
                        conditionTypeComboBox.Items.Add("Clic");
                        conditionTypeComboBox.SelectedIndex = (int)condition.ConditionType;

                        conditionTypeComboBox.SelectionChanged += (s, e) =>
                        {
                            if (conditionTypeComboBox.SelectedIndex >= 0)
                            {
                                SaveState();
                                condition.ConditionType = (ConditionType)conditionTypeComboBox.SelectedIndex;
                                condition.MouseClickConfig = condition.ConditionType == ConditionType.MouseClick ? new MouseClickCondition { ClickType = 3 } : null;
                                _currentMacro!.ModifiedAt = DateTime.Now;
                                RefreshBlocks();
                                MacroChanged?.Invoke(this, EventArgs.Empty);
                            }
                        };
                        groupContent.Children.Add(conditionTypeComboBox);

                        // Sous-combo type de clic (style Si rouge)
                        var groupClickTypeComboBox = new ComboBox
                        {
                            Width = 62,
                            FontSize = 10,
                            Height = 22,
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(2, 0, 0, 0),
                            Padding = new Thickness(2, 0, 2, 0),
                            Visibility = condition.ConditionType == ConditionType.MouseClick ? Visibility.Visible : Visibility.Collapsed
                        };
                        // Bascule Maintenu/Pressé (orange/violet) — masquée pour molette
                        var groupAmberBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20));
                        var groupAmberBorder = new SolidColorBrush(Color.FromArgb(0x66, 0xE8, 0xA0, 0x20));
                        var groupAmberBg = new SolidColorBrush(Color.FromArgb(0x12, 0xE8, 0xA0, 0x20));
                        var groupPurpleBrush = new SolidColorBrush(Color.FromRgb(0xA7, 0x8B, 0xFA));
                        var groupPurpleBorder = new SolidColorBrush(Color.FromArgb(0x66, 0xA7, 0x8B, 0xFA));
                        var groupPurpleBg = new SolidColorBrush(Color.FromArgb(0x12, 0xA7, 0x8B, 0xFA));
                        var groupClickStateText = new TextBlock
                        {
                            Text = "MNTN",
                            FontSize = 9,
                            FontWeight = FontWeights.ExtraBold,
                            Foreground = groupAmberBrush,
                            VerticalAlignment = VerticalAlignment.Center,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            TextAlignment = TextAlignment.Center
                        };
                        groupClickStateText.SetResourceReference(TextBlock.FontFamilyProperty, "FontMono");
                        var groupClickStateToggle = new Border
                        {
                            Child = groupClickStateText,
                            Background = groupAmberBg,
                            BorderBrush = groupAmberBorder,
                            BorderThickness = new Thickness(1),
                            Padding = new Thickness(3, 3, 6, 3),
                            MinHeight = 23,
                            VerticalAlignment = VerticalAlignment.Center,
                            Cursor = Cursors.Hand,
                            Margin = new Thickness(2, 0, 0, 0),
                            Visibility = condition.ConditionType == ConditionType.MouseClick ? Visibility.Visible : Visibility.Collapsed,
                            ToolTip = "Basculer Maintenu / Pressé"
                        };
                        if (Application.Current.TryFindResource("ComboBoxSiRed") is Style groupClickCbStyle)
                            groupClickTypeComboBox.Style = groupClickCbStyle;
                        if (Application.Current.TryFindResource("ComboBoxItemSiRed") is Style groupClickItemStyle)
                            groupClickTypeComboBox.ItemContainerStyle = groupClickItemStyle;
                        groupClickTypeComboBox.SetResourceReference(ComboBox.FontFamilyProperty, "FontMono");
                        groupClickTypeComboBox.Items.Add("Gauche");
                        groupClickTypeComboBox.Items.Add("Droit");
                        groupClickTypeComboBox.Items.Add("Milieu");
                        groupClickTypeComboBox.Items.Add("Molette ↑");
                        groupClickTypeComboBox.Items.Add("Molette ↓");

                        var groupClickTypeWrap = new Border
                        {
                            CornerRadius = new CornerRadius(0),
                            BorderBrush = redBorder,
                            BorderThickness = new Thickness(1),
                            Background = redBg,
                            Padding = new Thickness(3, 2, 6, 2),
                            Margin = new Thickness(2, 0, 0, 0),
                            VerticalAlignment = VerticalAlignment.Center,
                            Child = groupClickTypeComboBox
                        };
                        if (condition.MouseClickConfig != null)
                        {
                            int ct = Math.Max(0, Math.Min(condition.MouseClickConfig.ClickType, 7));
                            int typeIdx = ct switch { 0 => 0, 1 => 1, 2 => 2, 3 => 0, 4 => 1, 5 => 2, 6 => 3, 7 => 4, _ => 0 };
                            int stateIdx = (ct >= 3 && ct <= 5) ? 1 : 0;
                            bool wheel = (typeIdx == 3 || typeIdx == 4);
                            groupClickTypeComboBox.SelectedIndex = typeIdx;
                            groupClickStateText.Text = stateIdx == 0 ? "MNTN" : "PRS";
                            groupClickStateText.Foreground = stateIdx == 0 ? groupAmberBrush : groupPurpleBrush;
                            groupClickStateToggle.Background = stateIdx == 0 ? groupAmberBg : groupPurpleBg;
                            groupClickStateToggle.BorderBrush = stateIdx == 0 ? groupAmberBorder : groupPurpleBorder;
                            groupClickStateToggle.Visibility = wheel ? Visibility.Collapsed : Visibility.Visible;
                        }
                        else
                        {
                            groupClickTypeComboBox.SelectedIndex = 0;
                        }
                        groupClickTypeComboBox.SelectionChanged += (s, e) =>
                        {
                            if (groupClickTypeComboBox.SelectedIndex < 0 || condition.MouseClickConfig == null) return;
                            int t = groupClickTypeComboBox.SelectedIndex;
                            bool wheel = (t == 3 || t == 4);
                            groupClickStateToggle.Visibility = wheel ? Visibility.Collapsed : Visibility.Visible;
                            // Pour molette on force Maintenant (0) pour état interne
                            var st = (groupClickStateText.Text == "PRS") ? 1 : 0;
                            if (wheel) st = 0;
                            condition.MouseClickConfig.ClickType = (t, st) switch { (0, 0) => 0, (0, 1) => 3, (1, 0) => 1, (1, 1) => 4, (2, 0) => 2, (2, 1) => 5, (3, _) => 6, (4, _) => 7, _ => 0 };
                            SaveState(); _currentMacro!.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty);
                        };
                        groupClickStateToggle.MouseLeftButtonDown += (s, e) =>
                        {
                            e.Handled = true;
                            if (condition.MouseClickConfig == null) return;
                            // Toggle seulement si pas molette
                            int t = groupClickTypeComboBox.SelectedIndex;
                            if (t == 3 || t == 4) return;
                            bool pressed = groupClickStateText.Text == "PRS";
                            pressed = !pressed;
                            groupClickStateText.Text = pressed ? "PRS" : "MNTN";
                            groupClickStateText.Foreground = pressed ? groupPurpleBrush : groupAmberBrush;
                            groupClickStateToggle.Background = pressed ? groupPurpleBg : groupAmberBg;
                            groupClickStateToggle.BorderBrush = pressed ? groupPurpleBorder : groupAmberBorder;
                            int st = pressed ? 1 : 0;
                            condition.MouseClickConfig.ClickType = (t, st) switch { (0, 0) => 0, (0, 1) => 3, (1, 0) => 1, (1, 1) => 4, (2, 0) => 2, (2, 1) => 5, (3, _) => 6, (4, _) => 7, _ => 0 };
                            SaveState(); _currentMacro!.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty);
                        };
                        groupContent.Children.Add(groupClickTypeWrap);
                        groupContent.Children.Add(groupClickStateToggle);

                        // Bouton configurer (petit)
                        var configButton = new Button
                        {
                            Content = LucideIcons.CreateIcon(LucideIcons.Settings, 9),
                            Width = 20,
                            Height = 20,
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(2, 0, 0, 0),
                            Cursor = Cursors.Hand,
                            Padding = new Thickness(0)
                        };
                        if (Application.Current.TryFindResource("TimelineIfIconButton") is Style groupIfIconStyle)
                            configButton.Style = groupIfIconStyle;
                        configButton.Click += (s, e) =>
                        {
                            var tempIfAction = new IfAction
                            {
                                Conditions = new List<ConditionItem> { condition },
                                Operators = new List<LogicalOperator>()
                            };
                            var dialog = new ConditionConfigDialog(tempIfAction);
                            dialog.Owner = Window.GetWindow(this);
                            if (dialog.ShowDialog() == true && dialog.Result != null && dialog.Result.Conditions.Count > 0)
                            {
                                SaveState();
                                var resultCondition = dialog.Result.Conditions[0];
                                condition.ConditionType = resultCondition.ConditionType;
                                condition.Condition = resultCondition.Condition;
                                condition.ActiveApplicationConfig = resultCondition.ActiveApplicationConfig;
                                condition.KeyboardKeyConfig = resultCondition.KeyboardKeyConfig;
                                condition.ProcessRunningConfig = resultCondition.ProcessRunningConfig;
                                condition.PixelColorConfig = resultCondition.PixelColorConfig;
                                condition.MousePositionConfig = resultCondition.MousePositionConfig;
                                condition.TimeDateConfig = resultCondition.TimeDateConfig;
                                condition.ImageOnScreenConfig = resultCondition.ImageOnScreenConfig;
                                condition.TextOnScreenConfig = resultCondition.TextOnScreenConfig;
                                condition.MouseClickConfig = resultCondition.MouseClickConfig != null ? new MouseClickCondition { ClickType = resultCondition.MouseClickConfig.ClickType } : null;
                                condition.VariableName = resultCondition.VariableName;
                                condition.VariableOperator = resultCondition.VariableOperator;
                                condition.VariableValue = resultCondition.VariableValue;
                                _currentMacro!.ModifiedAt = DateTime.Now;
                                RefreshBlocks();
                                MacroChanged?.Invoke(this, EventArgs.Empty);
                            }
                        };
                        groupContent.Children.Add(configButton);

                        // Bouton supprimer condition (seulement si plus d'une condition)
                        if (group.Conditions.Count > 1)
                        {
                            var removeConditionButton = new Button
                            {
                                Content = LucideIcons.CreateIcon(LucideIcons.Close, 8),
                                Width = 16,
                                Height = 16,
                                VerticalAlignment = VerticalAlignment.Center,
                                Margin = new Thickness(1, 0, 0, 0),
                                Cursor = Cursors.Hand,
                                ToolTip = "Supprimer",
                                Padding = new Thickness(0)
                            };
                            if (Application.Current.TryFindResource("TimelineIfIconButton") is Style groupIfIconStyle2)
                                removeConditionButton.Style = groupIfIconStyle2;
                            removeConditionButton.Click += (s, e) =>
                            {
                                SaveState();
                                if (conditionIndex >= 0 && conditionIndex < group.Conditions.Count)
                                {
                                    group.Conditions.RemoveAt(conditionIndex);
                                }
                                _currentMacro!.ModifiedAt = DateTime.Now;
                                RefreshBlocks();
                                MacroChanged?.Invoke(this, EventArgs.Empty);
                            };
                            groupContent.Children.Add(removeConditionButton);
                        }
                    }
                }

                // Bouton ajouter condition (ET) dans ce groupe
                var addConditionButton = new Button
                {
                    Content = LucideIcons.CreateIcon(LucideIcons.Plus, 10),
                    Width = 18,
                    Height = 18,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(3, 0, 0, 0),
                    Cursor = Cursors.Hand,
                    Padding = new Thickness(0)
                };
                if (Application.Current.TryFindResource("TimelineIfIconButton") is Style addCondBtnStyle)
                    addConditionButton.Style = addCondBtnStyle;
                addConditionButton.Click += (s, e) =>
                {
                    SaveState();
                    if (group.Conditions == null)
                        group.Conditions = new List<ConditionItem>();
                    
                    group.Conditions.Add(new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true });
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                };
                groupContent.Children.Add(addConditionButton);

                // Bouton supprimer le groupe (seulement si plus d'un groupe)
                if (ifAction.ConditionGroups.Count > 1)
                {
                    var removeGroupButton = new Button
                    {
                        Content = LucideIcons.CreateIcon(LucideIcons.Trash, 9),
                        Width = 18,
                        Height = 18,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(2, 0, 0, 0),
                        Cursor = Cursors.Hand,
                        ToolTip = "Supprimer groupe",
                        Padding = new Thickness(0)
                    };
                    if (Application.Current.TryFindResource("TimelineIfIconButton") is Style groupRemoveIconStyle)
                        removeGroupButton.Style = groupRemoveIconStyle;
                    removeGroupButton.Click += (s, e) =>
                    {
                        SaveState();
                        if (groupIndex >= 0 && groupIndex < ifAction.ConditionGroups.Count)
                        {
                            ifAction.ConditionGroups.RemoveAt(groupIndex);
                        }
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    };
                    groupContent.Children.Add(removeGroupButton);
                }

                groupBorder.Child = groupContent;
                mainPanel.Children.Add(groupBorder);
            }

            // Bouton pour ajouter un nouveau groupe (OU)
            var addGroupButton = new Button
            {
                Content = "+OU",
                MinWidth = 40,
                Height = 22,
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(6, 0, 0, 0),
                Cursor = Cursors.Hand,
                ToolTip = "Ajouter groupe (OU)",
                Padding = new Thickness(4, 0, 4, 0)
            };
            if (Application.Current.TryFindResource("TimelineIfButton") is Style addGrpBtnStyle)
                addGroupButton.Style = addGrpBtnStyle;
            addGroupButton.Click += (s, e) =>
            {
                SaveState();
                if (ifAction.ConditionGroups == null)
                    ifAction.ConditionGroups = new List<ConditionGroup>();
                
                var newGroup = new ConditionGroup
                {
                    Name = $"Groupe {ifAction.ConditionGroups.Count + 1}",
                    Conditions = new List<ConditionItem> { new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true } }
                };
                ifAction.ConditionGroups.Add(newGroup);
                
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };
            mainPanel.Children.Add(addGroupButton);

            // Bouton pour revenir au mode simple
            var simpleModeButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Undo, 11),
                Width = 22,
                Height = 22,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(6, 0, 0, 0),
                Cursor = Cursors.Hand,
                ToolTip = "Revenir au mode simple",
                Padding = new Thickness(0)
            };
            if (Application.Current.TryFindResource("TimelineIfIconButton") is Style simpleModeBtnStyle)
                simpleModeButton.Style = simpleModeBtnStyle;
            simpleModeButton.Click += (s, e) =>
            {
                SaveState();
                // Convertir les groupes en conditions plates
                if (ifAction.ConditionGroups != null && ifAction.ConditionGroups.Count > 0)
                {
                    var allConditions = new List<ConditionItem>();
                    foreach (var g in ifAction.ConditionGroups)
                    {
                        if (g.Conditions != null)
                            allConditions.AddRange(g.Conditions);
                    }
                    ifAction.Conditions = allConditions.Count > 0 ? allConditions : new List<ConditionItem> { new ConditionItem { ConditionType = ConditionType.Boolean, Condition = true } };
                    
                    // Recréer les opérateurs (tous AND par défaut)
                    ifAction.Operators = new List<LogicalOperator>();
                    for (int i = 0; i < ifAction.Conditions.Count - 1; i++)
                        ifAction.Operators.Add(LogicalOperator.AND);
                }
                
                // Vider les groupes
                ifAction.ConditionGroups = new List<ConditionGroup>();
                
                _currentMacro!.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            };
            mainPanel.Children.Add(simpleModeButton);

            return mainPanel;
        }

        /// <summary>
        /// Initialise la configuration d'une condition selon son type
        /// </summary>
        private void InitializeConditionConfig(IfAction ifAction)
        {
            switch (ifAction.ConditionType)
            {
                case ConditionType.Boolean:
                    // Déjà initialisé
                    break;
                case ConditionType.ActiveApplication:
                    ifAction.ActiveApplicationConfig ??= new ActiveApplicationCondition { ProcessName = "" };
                    break;
                case ConditionType.KeyboardKey:
                    ifAction.KeyboardKeyConfig ??= new KeyboardKeyCondition { VirtualKeyCode = 0 };
                    break;
                case ConditionType.ProcessRunning:
                    ifAction.ProcessRunningConfig ??= new ProcessRunningCondition { ProcessName = "" };
                    break;
                case ConditionType.PixelColor:
                    ifAction.PixelColorConfig ??= new PixelColorCondition { X = 0, Y = 0, ExpectedColor = "#000000" };
                    break;
                case ConditionType.MousePosition:
                    ifAction.MousePositionConfig ??= new MousePositionCondition { X1 = 0, Y1 = 0, X2 = 100, Y2 = 100 };
                    break;
                case ConditionType.TimeDate:
                    ifAction.TimeDateConfig ??= new TimeDateCondition { ComparisonType = "Hour", Operator = TimeComparisonOperator.Equals, Value = 0 };
                    break;
                case ConditionType.ImageOnScreen:
                    ifAction.ImageOnScreenConfig ??= new ImageOnScreenCondition { ImagePath = "", Sensitivity = 80 };
                    break;
                case ConditionType.TextOnScreen:
                    ifAction.TextOnScreenConfig ??= new TextOnScreenCondition { Text = "" };
                    break;
                case ConditionType.MouseClick:
                    if (ifAction.Conditions == null || ifAction.Conditions.Count == 0)
                        ifAction.Conditions = new List<ConditionItem> { new ConditionItem { ConditionType = ConditionType.MouseClick, MouseClickConfig = new MouseClickCondition { ClickType = 3 } } };
                    else if (ifAction.Conditions[0].MouseClickConfig == null)
                        ifAction.Conditions[0].MouseClickConfig = new MouseClickCondition { ClickType = 3 };
                    break;
            }
        }

        /// <summary>
        /// Crée le panel de configuration selon le type de condition
        /// </summary>
        private Panel CreateConditionConfigPanel(IfAction ifAction, int index)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Ajouter un bouton "Configurer..." pour toutes les conditions (même les simples)
            var configButton = new Button
            {
                Content = LucideIcons.CreateIcon(LucideIcons.Settings, 12),
                MinWidth = 32,
                Width = 32,
                Height = 28,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                Cursor = Cursors.Hand
            };
            if (Application.Current.TryFindResource("TimelineIfButton") is Style groupsIfBtnStyle)
                configButton.Style = groupsIfBtnStyle;
            configButton.Click += (s, e) =>
            {
                var dialog = new ConditionConfigDialog(ifAction);
                dialog.Owner = Window.GetWindow(this);
                if (dialog.ShowDialog() == true && dialog.Result != null)
                {
                    SaveState();
                    // Copier la configuration depuis le dialogue
                    var result = dialog.Result;
                    ifAction.Conditions = result.Conditions != null ? new List<ConditionItem>(result.Conditions) : new List<ConditionItem>();
                    ifAction.Operators = result.Operators != null ? new List<LogicalOperator>(result.Operators) : new List<LogicalOperator>();
                    
                    // Copier aussi les anciennes propriétés pour compatibilité
                    ifAction.ConditionType = result.ConditionType;
                    ifAction.Condition = result.Condition;
                    ifAction.ActiveApplicationConfig = result.ActiveApplicationConfig;
                    ifAction.KeyboardKeyConfig = result.KeyboardKeyConfig;
                    ifAction.ProcessRunningConfig = result.ProcessRunningConfig;
                    ifAction.PixelColorConfig = result.PixelColorConfig;
                    ifAction.MousePositionConfig = result.MousePositionConfig;
                    ifAction.TimeDateConfig = result.TimeDateConfig;
                    ifAction.ImageOnScreenConfig = result.ImageOnScreenConfig;
                    ifAction.TextOnScreenConfig = result.TextOnScreenConfig;
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };
            panel.Children.Add(configButton);

            // Afficher un aperçu rapide selon le type
            var previewText = GetConditionPreview(ifAction);
            if (!string.IsNullOrEmpty(previewText))
            {
                var previewLabel = new TextBlock
                {
                    Text = previewText,
                    FontSize = 11,
                    FontStyle = FontStyles.Italic,
                    Foreground = GetThemeBrush("TextSecondaryBrush"),
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(8, 0, 0, 0),
                    MaxWidth = 300,
                    TextTrimming = TextTrimming.CharacterEllipsis
                };
                panel.Children.Add(previewLabel);
            }

            return panel;
        }

        /// <summary>
        /// Obtient un aperçu textuel de la condition
        /// </summary>
        private string GetConditionPreview(IfAction ifAction)
        {
            // Mode groupes
            if (ifAction.ConditionGroups != null && ifAction.ConditionGroups.Count > 0)
            {
                var groupPreviews = new List<string>();
                foreach (var group in ifAction.ConditionGroups)
                {
                    if (group?.Conditions == null || group.Conditions.Count == 0) continue;
                    var parts = group.Conditions.Select(c => GetConditionPreviewText(c)).Where(s => !string.IsNullOrEmpty(s)).ToList();
                    if (parts.Count > 0)
                        groupPreviews.Add(parts.Count == 1 ? parts[0] : "(" + string.Join(" ET ", parts) + ")");
                }
                return string.Join(" OU ", groupPreviews);
            }

            // Si plusieurs conditions (mode plat)
            if (ifAction.Conditions != null && ifAction.Conditions.Count > 1)
            {
                var previews = new List<string>();
                for (int i = 0; i < ifAction.Conditions.Count; i++)
                {
                    var condition = ifAction.Conditions[i];
                    var preview = GetConditionPreviewText(condition);
                    if (!string.IsNullOrEmpty(preview))
                        previews.Add(preview);
                    
                    if (i < ifAction.Conditions.Count - 1 && i < ifAction.Operators.Count)
                    {
                        var op = ifAction.Operators[i] == LogicalOperator.AND ? "ET" : "OU";
                        previews.Add(op);
                    }
                }
                return string.Join(" ", previews);
            }
            
            if (ifAction.Conditions != null && ifAction.Conditions.Count == 1)
            {
                return GetConditionPreviewText(ifAction.Conditions[0]);
            }
            
            // Ancien format (compatibilité)
            return ifAction.ConditionType switch
            {
                ConditionType.Boolean => ifAction.Condition ? "Vrai" : "Faux",
                ConditionType.ActiveApplication => ifAction.ActiveApplicationConfig != null && !string.IsNullOrEmpty(ifAction.ActiveApplicationConfig.ProcessName)
                    ? $"App: {ifAction.ActiveApplicationConfig.ProcessName}"
                    : "App: (non configuré)",
                ConditionType.KeyboardKey => ifAction.KeyboardKeyConfig != null && ifAction.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Touche: {GetKeyName(ifAction.KeyboardKeyConfig.VirtualKeyCode)}"
                    : "Touche: (non configuré)",
                ConditionType.ProcessRunning => ifAction.ProcessRunningConfig != null && !string.IsNullOrEmpty(ifAction.ProcessRunningConfig.ProcessName)
                    ? $"Processus: {ifAction.ProcessRunningConfig.ProcessName}"
                    : "Processus: (non configuré)",
                ConditionType.PixelColor => ifAction.PixelColorConfig != null
                    ? $"Pixel ({ifAction.PixelColorConfig.X},{ifAction.PixelColorConfig.Y}) = {ifAction.PixelColorConfig.ExpectedColor}"
                    : "Pixel: (non configuré)",
                ConditionType.MousePosition => ifAction.MousePositionConfig != null
                    ? $"{ifAction.MousePositionConfig.X1},{ifAction.MousePositionConfig.Y1} → {ifAction.MousePositionConfig.X2},{ifAction.MousePositionConfig.Y2}"
                    : "(non configuré)",
                ConditionType.TimeDate => ifAction.TimeDateConfig != null
                    ? $"{ifAction.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(ifAction.TimeDateConfig.Operator)} {ifAction.TimeDateConfig.Value}"
                    : "Temps: (non configuré)",
                ConditionType.ImageOnScreen => ifAction.ImageOnScreenConfig != null && !string.IsNullOrEmpty(ifAction.ImageOnScreenConfig.ImagePath)
                    ? $"Image: {System.IO.Path.GetFileName(ifAction.ImageOnScreenConfig.ImagePath)}"
                    : "Image: (non configuré)",
                ConditionType.TextOnScreen => ifAction.TextOnScreenConfig != null && !string.IsNullOrEmpty(ifAction.TextOnScreenConfig.Text)
                    ? $"Texte: \"{ifAction.TextOnScreenConfig.Text.Substring(0, Math.Min(20, ifAction.TextOnScreenConfig.Text.Length))}\"..."
                    : "Texte: (non configuré)",
                ConditionType.MouseClick => ifAction.Conditions?.FirstOrDefault()?.MouseClickConfig != null
                    ? $"Clic: {GetMouseClickLabel(ifAction.Conditions!.First().MouseClickConfig!.ClickType)}"
                    : "Clic: (non configuré)",
                _ => ""
            };
        }

        /// <summary>
        /// Aperçu textuel d'une branche Else If (Conditions + Operators).
        /// </summary>
        private string GetConditionPreviewForBranch(ElseIfBranch branch)
        {
            if (branch == null) return "";
            if (branch.Conditions == null || branch.Conditions.Count == 0) return "(vide)";
            if (branch.Conditions.Count == 1) return GetConditionPreviewText(branch.Conditions[0]);
            var previews = new List<string>();
            for (int i = 0; i < branch.Conditions.Count; i++)
            {
                var p = GetConditionPreviewText(branch.Conditions[i]);
                if (!string.IsNullOrEmpty(p)) previews.Add(p);
                if (i < branch.Conditions.Count - 1 && branch.Operators != null && i < branch.Operators.Count)
                    previews.Add(branch.Operators[i] == LogicalOperator.AND ? "ET" : "OU");
            }
            return string.Join(" ", previews);
        }

        private static List<IInputAction>? GetIfActionsList(IfAction ifAction, bool isThen, int elseIfBranchIndex)
        {
            if (isThen) return ifAction.ThenActions;
            if (elseIfBranchIndex < 0) return ifAction.ElseActions;
            if (ifAction.ElseIfBranches == null || elseIfBranchIndex >= ifAction.ElseIfBranches.Count) return null;
            return ifAction.ElseIfBranches[elseIfBranchIndex].Actions;
        }

        private string GetConditionPreviewText(ConditionItem condition)
        {
            if (condition == null)
                return "";

            return condition.ConditionType switch
            {
                ConditionType.Boolean => condition.Condition ? "Vrai" : "Faux",
                ConditionType.ActiveApplication => condition.ActiveApplicationConfig != null && condition.ActiveApplicationConfig.ProcessNames != null && condition.ActiveApplicationConfig.ProcessNames.Count > 0
                    ? $"App: {string.Join(", ", condition.ActiveApplicationConfig.ProcessNames.Take(2))}"
                    : "App: (non configuré)",
                ConditionType.KeyboardKey => condition.KeyboardKeyConfig != null && condition.KeyboardKeyConfig.VirtualKeyCode != 0
                    ? $"Touche: {GetKeyName(condition.KeyboardKeyConfig.VirtualKeyCode)}"
                    : "Touche: (non configuré)",
                ConditionType.ProcessRunning => condition.ProcessRunningConfig != null && condition.ProcessRunningConfig.ProcessNames != null && condition.ProcessRunningConfig.ProcessNames.Count > 0
                    ? $"Processus: {string.Join(", ", condition.ProcessRunningConfig.ProcessNames.Take(2))}"
                    : "Processus: (non configuré)",
                ConditionType.PixelColor => condition.PixelColorConfig != null
                    ? $"Pixel ({condition.PixelColorConfig.X},{condition.PixelColorConfig.Y}) = {condition.PixelColorConfig.ExpectedColor}"
                    : "Pixel: (non configuré)",
                ConditionType.MousePosition => condition.MousePositionConfig != null
                    ? $"{condition.MousePositionConfig.X1},{condition.MousePositionConfig.Y1} → {condition.MousePositionConfig.X2},{condition.MousePositionConfig.Y2}"
                    : "(non configuré)",
                ConditionType.TimeDate => condition.TimeDateConfig != null
                    ? $"{condition.TimeDateConfig.ComparisonType} {GetTimeOperatorSymbol(condition.TimeDateConfig.Operator)} {condition.TimeDateConfig.Value}"
                    : "Temps: (non configuré)",
                ConditionType.ImageOnScreen => condition.ImageOnScreenConfig != null && !string.IsNullOrEmpty(condition.ImageOnScreenConfig.ImagePath)
                    ? $"Image: {System.IO.Path.GetFileName(condition.ImageOnScreenConfig.ImagePath)}"
                    : "Image: (non configuré)",
                ConditionType.TextOnScreen => condition.TextOnScreenConfig != null && !string.IsNullOrEmpty(condition.TextOnScreenConfig.Text)
                    ? $"Texte: \"{condition.TextOnScreenConfig.Text.Substring(0, Math.Min(20, condition.TextOnScreenConfig.Text.Length))}\"..."
                    : "Texte: (non configuré)",
                ConditionType.MouseClick => condition.MouseClickConfig != null
                    ? $"Clic: {GetMouseClickLabel(condition.MouseClickConfig.ClickType)}"
                    : "Clic: (non configuré)",
                ConditionType.Variable => !string.IsNullOrEmpty(condition.VariableName)
                    ? (condition.VariableOperator == "empty" || condition.VariableOperator == "not_empty"
                        ? $"${condition.VariableName} {condition.VariableOperator}"
                        : $"${condition.VariableName} {condition.VariableOperator} \"{condition.VariableValue}\"")
                    : "Variable: (non configuré)",
                _ => ""
            };
        }

        /// <summary>
        /// Branche If (Alors / Sinon Si / Sinon) : même chrome que la carte <see cref="IfAction"/> (fond teinté 5 %,
        /// bordure ext. 35 % accent, hauteur 48px, barre gauche 3px) — seule la couleur d’accent change (pas le rouge Si).
        /// </summary>
        private Border CreateIfBranchSectionChrome(Color accentColor, string branchTitle, Thickness outerMargin, out StackPanel bodyPanel)
        {
            // Mêmes formules que CreateActionCard pour IfAction (l.597–601)
            var brushCard = new SolidColorBrush(Color.FromArgb(13, accentColor.R, accentColor.G, accentColor.B));
            var brushBorder = new SolidColorBrush(Color.FromArgb(0x59, accentColor.R, accentColor.G, accentColor.B));
            var accentBrush = new SolidColorBrush(accentColor);

            var outer = new Border
            {
                Background = brushCard,
                BorderBrush = brushBorder,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(0),
                Margin = outerMargin,
                CornerRadius = new CornerRadius(0),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                MinWidth = 400
            };

            var root = new StackPanel { Orientation = Orientation.Vertical };

            // Rangée d’en-tête identique à la carte Si : pas de zone type 72px, premier segment = barre 3px + padding 10,12,14,12
            var headerRow = new Grid { MinHeight = 48, MaxHeight = 48 };
            var segBorder = new Border
            {
                BorderThickness = new Thickness(3, 0, 0, 0),
                BorderBrush = accentBrush,
                Padding = new Thickness(10, 12, 14, 12),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            var titleBlock = new TextBlock
            {
                Text = branchTitle,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = accentBrush,
                VerticalAlignment = VerticalAlignment.Center
            };
            titleBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontPrimary");
            segBorder.Child = titleBlock;
            headerRow.Children.Add(segBorder);
            root.Children.Add(headerRow);

            // Corps imbriqué sous la même boîte teintée (comme prolongement du bloc Si visuellement)
            bodyPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(10, 0, 10, 8)
            };
            root.Children.Add(bodyPanel);

            outer.Child = root;
            return outer;
        }

        /// <summary>
        /// Crée un conteneur pour une IfAction avec ses actions imbriquées (Then et Else)
        /// </summary>
        private FrameworkElement CreateIfActionContainer(IfAction ifAction, int index)
        {
            // Marge basse modérée : l’espace sous le bloc Sinon est surtout porté par elseActionsWrap (voir fin de méthode).
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Ajouter la carte principale de l'action IfAction
            var actionContainer = CreateActionCardWithButtons(ifAction, index);
            container.Children.Add(actionContainer);

            // Branche « alors » : actions imbriquées puis chips d’ajout (sous les actions)
            var thenBranchWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(22, 0, 0, 4) };
            if (ifAction.ThenActions != null && ifAction.ThenActions.Count > 0)
            {
                var thenContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4)
                };
                for (int i = 0; i < ifAction.ThenActions.Count; i++)
                {
                    var nestedAction = ifAction.ThenActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, index, i, true);
                    thenContainer.Children.Add(nestedCard);
                }
                thenBranchWrap.Children.Add(thenContainer);
            }
            var addThenActionsPanel = CreateAddIfActionsPanel(ifAction, index, true, -1);
            addThenActionsPanel.Margin = new Thickness(50, -4, 0, 0);
            thenBranchWrap.Children.Add(addThenActionsPanel);
            container.Children.Add(thenBranchWrap);

            // Sections Sinon Si — même principe
            var elseIfColor = Color.FromRgb(0xE8, 0xA0, 0x20);
            if (ifAction.ElseIfBranches != null)
            {
                for (int bi = 0; bi < ifAction.ElseIfBranches.Count; bi++)
                {
                    var branch = ifAction.ElseIfBranches[bi];
                    var elseIfBranchWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(22, 0, 0, 4) };
                    var elseIfSectionBorder = CreateIfBranchSectionChrome(elseIfColor, "SINON SI", new Thickness(0, 0, 0, 0), out var elseIfSection);
                    if (branch.Actions != null && branch.Actions.Count > 0)
                    {
                        var elseIfContainer = new StackPanel
                        {
                            Orientation = Orientation.Vertical,
                            Margin = new Thickness(0, 0, 0, 4)
                        };
                        for (int i = 0; i < branch.Actions.Count; i++)
                        {
                            var nestedCard = CreateNestedIfActionCard(branch.Actions[i], index, i, false, bi);
                            elseIfContainer.Children.Add(nestedCard);
                        }
                        elseIfSection.Children.Add(elseIfContainer);
                    }
                    elseIfBranchWrap.Children.Add(elseIfSectionBorder);
                    elseIfBranchWrap.Children.Add(CreateAddIfActionsPanel(ifAction, index, false, bi));
                    container.Children.Add(elseIfBranchWrap);
                }
            }

            // Section Sinon
            var elseColor = Color.FromRgb(0xA7, 0x8B, 0xFA);
            // Entête SINON aligné comme le parent SI ; espace au-dessus (SI non imbriqué dans Répéter uniquement).
            var elseHeaderWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(44, 4, 0, 4) };
            var elseSectionBorder = CreateIfBranchSectionChrome(elseColor, "SINON", new Thickness(0, 0, 0, 4), out var elseSection);
            // Le cadre SINON ne contient plus d'actions : retirer le body vide pour éviter une hauteur en trop.
            elseSection.Visibility = Visibility.Collapsed;

            elseHeaderWrap.Children.Add(elseSectionBorder);
            container.Children.Add(elseHeaderWrap);

            // Actions SINON : même décalage gauche que la branche SI ; peu de marge sous le bloc (Si non imbriqué).
            var elseActionsWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(22, 0, 0, 0) };
            if (ifAction.ElseActions != null && ifAction.ElseActions.Count > 0)
            {
                var elseContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4)
                };

                for (int i = 0; i < ifAction.ElseActions.Count; i++)
                {
                    var nestedAction = ifAction.ElseActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, index, i, false); // false = Else
                    elseContainer.Children.Add(nestedCard);
                }
                elseActionsWrap.Children.Add(elseContainer);
            }
            var addElseActionsPanel = CreateAddIfActionsPanel(ifAction, index, false, -1);
            addElseActionsPanel.Margin = new Thickness(50, -4, 0, 0);
            elseActionsWrap.Children.Add(addElseActionsPanel);
            container.Children.Add(elseActionsWrap);

            return container;
        }

        /// <summary>
        /// Crée un conteneur pour une RepeatAction avec ses actions imbriquées
        /// </summary>
        private FrameworkElement CreateRepeatActionContainer(RepeatAction ra, int index)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Ajouter la carte principale de l'action RepeatAction
            var actionContainer = CreateActionCardWithButtons(ra, index);
            container.Children.Add(actionContainer);

            // block-body : trait vertical gauche (margin 22 + border 2) pour relier les steps imbriqués
            var line2Brush = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26));
            var nestedSectionBorder = new Border
            {
                Background = Brushes.Transparent,
                BorderBrush = line2Brush,
                BorderThickness = new Thickness(2, 0, 0, 0),
                Margin = new Thickness(22, 0, 0, 4),
                Padding = new Thickness(0),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            var nestedSection = new StackPanel { Orientation = Orientation.Vertical };

            if (ra.Actions != null && ra.Actions.Count > 0)
            {
                var nestedContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4)
                };

                for (int i = 0; i < ra.Actions.Count; i++)
                {
                    var nestedAction = ra.Actions[i];
                    var nestedCard = CreateNestedActionCard(nestedAction, index, i, indentLevel: 1);
                    nestedContainer.Children.Add(nestedCard);
                }
                nestedSection.Children.Add(nestedContainer);
            }

            var addActionsPanel = CreateAddActionsPanel(ra, index);
            nestedSection.Children.Add(addActionsPanel);
            
            nestedSectionBorder.Child = nestedSection;
            container.Children.Add(nestedSectionBorder);

            return container;
        }

        /// <summary>
        /// Crée une carte pour une action imbriquée dans un RepeatAction (niveau racine ou Repeat dans Then/Else d'un If).
        /// indentLevel: 1 = step-indent (16px), 2 = step-indent-2 (32px).
        /// </summary>
        private FrameworkElement CreateNestedActionCard(IInputAction action, int parentIndex, int nestedIndex, int ifActionIndex = -1, bool isThen = false, int nestedRepeatIndex = -1, int indentLevel = 1)
        {
            // Si c'est un IfAction imbriqué, créer le conteneur puis l'imbriquer visuellement (↳ + marge) comme les autres actions
            if (action is IfAction nestedIfAction)
            {
                var level = (parentIndex >= 0 && _currentMacro != null && parentIndex < _currentMacro.Actions.Count && _currentMacro.Actions[parentIndex] is RepeatAction) ? 2 : 1;
                var ifContainer = CreateNestedIfActionContainer(nestedIfAction, parentIndex, nestedIndex, level);
                // Même décalage que les autres actions imbriquées (16 px), pour aligner la carte Si avec Clic, Délai, etc.
                var ifStepIndentPx = 16;
                var wrapper = new Grid
                {
                    VerticalAlignment = VerticalAlignment.Stretch,
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    Margin = new Thickness(ifStepIndentPx, 0, 0, 2),
                    MinWidth = 400
                };
                wrapper.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
                wrapper.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var ifArrowText = new TextBlock
                {
                    Text = "↳",
                    FontSize = 11,
                    Foreground = GetThemeBrush("TextMutedBrush") ?? new SolidColorBrush(Color.FromRgb(0x6A, 0x7A, 0x6A)),
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(0, 14, 8, 0),
                    Opacity = 0.5
                };
                ifArrowText.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
                Grid.SetColumn(ifArrowText, 0);
                wrapper.Children.Add(ifArrowText);
                ifContainer.HorizontalAlignment = HorizontalAlignment.Stretch;
                Grid.SetColumn(ifContainer, 1);
                wrapper.Children.Add(ifContainer);
                return wrapper;
            }

            var info = ifActionIndex >= 0
                ? new NestedActionInfo { ParentIndex = -1, NestedIndex = nestedIndex, IfActionIndex = ifActionIndex, IsThen = isThen, NestedRepeatIndex = nestedRepeatIndex }
                : new NestedActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex };

            // Créer la carte visuelle avec CreateActionCard (croix = supprimer cette action imbriquée uniquement)
            var card = CreateActionCard(action, parentIndex, info, null);
            
            // Trouver le TextBlock titleBlock et ajouter les handlers d'édition appropriés
            var titleBlock = FindTitleBlockInCard(card);
            if (titleBlock != null)
            {
                // Ajouter les handlers appropriés selon le type d'action
                // Note: Les handlers d'origine sont toujours attachés mais ne seront pas appelés
                // car nous utilisons e.Handled = true dans nos handlers
                if (action is KeyboardAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedKeyboardAction(info, titleBlock);
                    };
                }
                else if (action is DelayAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedDelayAction(info, titleBlock);
                    };
                }
                else if (action is Core.Inputs.MouseAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedMouseAction(info, titleBlock);
                    };
                }
                else if (action is TextAction)
                {
                    // Pour TextAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var indexForControls = info.IfActionIndex >= 0 ? info.IfActionIndex : info.ParentIndex;
                        var textControlsPanel = CreateTextActionControls((TextAction)action, indexForControls, textPanel);
                        textPanel.Children.Insert(0, textControlsPanel);
                    }
                }
                else if (action is VariableAction vaNested)
                {
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var indexForControls = info.IfActionIndex >= 0 ? info.IfActionIndex : info.ParentIndex;
                        var variableControlsPanel = CreateVariableActionControls(vaNested, indexForControls, textPanel);
                        textPanel.Children.Insert(0, variableControlsPanel);
                    }
                }
            }

            // step-indent : colonne ↳ (34px) + carte, padding-left 16px (niveau 1) ou 32px (niveau 2)
            var stepIndentPx = indentLevel == 2 ? 32 : 16;
            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(stepIndentPx, 0, 0, 2),
                MinWidth = 400
            };

            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var arrowText = new TextBlock
            {
                Text = "↳",
                FontSize = 11,
                Foreground = GetThemeBrush("TextMutedBrush") ?? new SolidColorBrush(Color.FromRgb(0x6A, 0x7A, 0x6A)),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Opacity = 0.5
            };
            arrowText.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
            Grid.SetColumn(arrowText, 0);
            container.Children.Add(arrowText);

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 1);
            container.Children.Add(card);

            return container;
        }

        /// <summary>
        /// Trouve le TextBlock titre dans une carte d'action
        /// </summary>
        private TextBlock? FindTitleBlockInCard(DependencyObject card)
        {
            if (card == null) return null;

            // Parcourir l'arbre visuel pour trouver le TextBlock qui est dans un StackPanel
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(card); i++)
            {
                var child = VisualTreeHelper.GetChild(card, i);
                
                if (child is TextBlock textBlock && textBlock.Cursor == Cursors.Hand)
                {
                    // C'est probablement le titleBlock
                    return textBlock;
                }
                
                // Récursion
                var found = FindTitleBlockInCard(child);
                if (found != null)
                    return found;
            }
            
            return null;
        }

        /// <summary>
        /// Crée un conteneur avec les boutons monter/descendre pour les actions imbriquées
        /// </summary>
        private FrameworkElement CreateNestedMoveButtonsContainer(IInputAction action, NestedActionInfo info)
        {
            // Conteneur séparé pour les boutons monter/descendre
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(1.5),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(2, 2, 2, 2),
                Margin = new Thickness(10, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 48,
                MaxHeight = 48,
                Visibility = Visibility.Visible
            };
            
            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            
            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            bool canMoveUp = false;
            bool canMoveDown = false;
            if (TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex) && repeatAction!.Actions != null)
            {
                canMoveUp = nestedIndex > 0;
                canMoveDown = nestedIndex < repeatAction.Actions.Count - 1;
            }

            // Bouton monter (▲)
            var moveUpBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0))
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)),
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0),
                Tag = info
            };
            
            var moveUpBtnText = new TextBlock
            {
                Text = "▲",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveUp
                    ? GetThemeBrush("TextMutedBrush")
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 36,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveUpBtnBorder.Child = moveUpBtnText;
            moveUpBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveUp)
                {
                    MoveNestedActionUp(info);
                    e.Handled = true;
                }
            };
            moveUpBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextSecondaryBrush");
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush");
                }
            };
            moveUpBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextMutedBrush");
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush");
                }
            };

            // Bouton descendre (▼)
            var moveDownBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0))
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)),
                BorderThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(0),
                Tag = info
            };
            
            var moveDownBtnText = new TextBlock
            {
                Text = "▼",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveDown
                    ? GetThemeBrush("TextMutedBrush")
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 1,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveDownBtnBorder.Child = moveDownBtnText;
            moveDownBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveDown)
                {
                    MoveNestedActionDown(info);
                    e.Handled = true;
                }
            };
            moveDownBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextSecondaryBrush");
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush");
                }
            };
            moveDownBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextMutedBrush");
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0));
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush");
                }
            };

            moveButtonsPanel.Children.Add(moveUpBtnBorder);
            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            
            centeringGrid.Children.Add(moveButtonsPanel);
            moveButtonsContainer.Child = centeringGrid;
            
            return moveButtonsContainer;
        }

        /// <summary>
        /// Crée un panel avec des boutons pour ajouter des actions dans un RepeatAction (niveau racine ou imbriqué dans If).
        /// </summary>
        private FrameworkElement CreateAddActionsPanel(RepeatAction ra, int repeatActionIndex, int ifActionIndex = -1, bool isThen = false, int nestedRepeatIndex = -1)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(50, -4, 0, 8) // Compense la marge basse du dernier bloc d'action
            };

            // Chips v2 : bg transparent, border line2, hover amber
            Func<string, string, IInputAction, Border> createAddButton = (icon, text, actionInstance) =>
            {
                var tag = new RepeatActionInfo
                {
                    RepeatActionIndex = ifActionIndex >= 0 ? -1 : repeatActionIndex,
                    ActionType = actionInstance.Type.ToString(),
                    IfActionIndex = ifActionIndex,
                    IsThen = isThen,
                    NestedRepeatIndex = nestedRepeatIndex
                };
                var button = new Border
                {
                    Background = Brushes.Transparent,
                    CornerRadius = new CornerRadius(0),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 4, 0),
                    Cursor = Cursors.Hand,
                    BorderThickness = new Thickness(1),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26)),
                    Tag = tag
                };
                button.MouseLeftButtonDown += AddActionToRepeat_Click;

                var iconBlock = new TextBlock { Text = icon, FontSize = 10 };
                iconBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
                var textBlock = new TextBlock { Text = " " + text, FontSize = 10, FontWeight = FontWeights.SemiBold };
                textBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
                var brush = new SolidColorBrush(Color.FromRgb(0x4A, 0x5A, 0x4A));
                iconBlock.Foreground = brush;
                textBlock.Foreground = brush;
                var sp = new StackPanel { Orientation = Orientation.Horizontal };
                sp.Children.Add(iconBlock);
                sp.Children.Add(textBlock);
                button.Child = sp;

                button.MouseEnter += (s, e) =>
                {
                    button.BorderBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20));
                    var hoverBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20));
                    iconBlock.Foreground = hoverBrush;
                    textBlock.Foreground = hoverBrush;
                };
                button.MouseLeave += (s, e) =>
                {
                    button.BorderBrush = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26));
                    iconBlock.Foreground = brush;
                    textBlock.Foreground = brush;
                };

                return button;
            };

            panel.Children.Add(createAddButton(LucideIcons.Keyboard, "Touche", new KeyboardAction()));
            panel.Children.Add(createAddButton(LucideIcons.Mouse, "Clic", new Core.Inputs.MouseAction()));
            panel.Children.Add(createAddButton(LucideIcons.FileText, "Texte", new TextAction()));
            panel.Children.Add(createAddButton(LucideIcons.Braces, "Variable", new VariableAction()));
            panel.Children.Add(createAddButton(LucideIcons.Timer, "Délai", new DelayAction()));
            panel.Children.Add(createAddButton(LucideIcons.HelpCircle, "Si", new IfAction()));

            return panel;
        }

        /// <summary>
        /// Ajoute une action dans un RepeatAction
        /// </summary>
        private void AddActionToRepeat_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not RepeatActionInfo info) return;

            RepeatAction? repeatAction = null;
            if (info.IfActionIndex >= 0)
            {
                // Repeat imbriqué dans le Then/Else d'un If
                if (info.IfActionIndex >= _currentMacro.Actions.Count) return;
                if (_currentMacro.Actions[info.IfActionIndex] is not IfAction ifAction) return;
                var list = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
                if (list == null || info.NestedRepeatIndex < 0 || info.NestedRepeatIndex >= list.Count) return;
                repeatAction = list[info.NestedRepeatIndex] as RepeatAction;
            }
            else
            {
                // Repeat au niveau racine
                var repeatActionIndex = info.RepeatActionIndex;
                if (repeatActionIndex < 0 || repeatActionIndex >= _currentMacro.Actions.Count) return;
                repeatAction = _currentMacro.Actions[repeatActionIndex] as RepeatAction;
            }

            if (repeatAction == null) return;

            SaveState();

            IInputAction? newAction = info.ActionType switch
            {
                "Keyboard" => new KeyboardAction
                {
                    VirtualKeyCode = 0,
                    ActionType = KeyboardActionType.Press
                },
                "Mouse" => new Core.Inputs.MouseAction
                {
                    ActionType = Core.Inputs.MouseActionType.LeftClick,
                    X = -1,
                    Y = -1
                },
                "Text" => new TextAction
                {
                    Text = "",
                    TypingSpeed = 50,
                    UseNaturalTyping = false
                },
                "Variable" => new VariableAction
                {
                    VariableName = "var",
                    VariableType = VariableType.Number,
                    Operation = VariableOperation.Set,
                    Value = "0"
                },
                "Delay" => new DelayAction
                {
                    Duration = 100
                },
                "Condition" => new IfAction
                {
                    Condition = true,
                    ThenActions = new List<IInputAction>(),
                    ElseActions = new List<IInputAction>()
                },
                _ => null
            };

            if (newAction != null)
            {
                if (repeatAction.Actions == null)
                {
                    repeatAction.Actions = new List<IInputAction>();
                }
                repeatAction.Actions.Add(newAction);
                _currentMacro.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }

            e.Handled = true;
        }

        /// <summary>
        /// Déplace une action imbriquée vers le haut dans un RepeatAction
        /// </summary>
        private void MoveNestedActionUp(NestedActionInfo info)
        {
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex))
                return;

            if (repeatAction!.Actions == null || nestedIndex <= 0 || nestedIndex >= repeatAction.Actions.Count)
                return;

            SaveState();

            var action = repeatAction.Actions[nestedIndex];
            repeatAction.Actions.RemoveAt(nestedIndex);
            repeatAction.Actions.Insert(nestedIndex - 1, action);
            _currentMacro!.ModifiedAt = DateTime.Now;

            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Déplace une action imbriquée vers le bas dans un RepeatAction
        /// </summary>
        private void MoveNestedActionDown(NestedActionInfo info)
        {
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex))
                return;

            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count - 1)
                return;

            SaveState();

            var action = repeatAction.Actions[nestedIndex];
            repeatAction.Actions.RemoveAt(nestedIndex);
            repeatAction.Actions.Insert(nestedIndex + 1, action);
            _currentMacro!.ModifiedAt = DateTime.Now;

            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Résout le RepeatAction et l'index à partir de NestedActionInfo (Repeat au niveau racine ou Repeat dans Then/Else d'un If).
        /// </summary>
        private bool TryGetRepeatAndIndexFromNestedInfo(NestedActionInfo info, out RepeatAction? repeatAction, out int nestedIndex)
        {
            nestedIndex = info.NestedIndex;
            repeatAction = null;
            if (_currentMacro == null) return false;

            if (info.IfActionIndex >= 0)
            {
                if (info.IfActionIndex >= _currentMacro.Actions.Count) return false;
                if (_currentMacro.Actions[info.IfActionIndex] is not IfAction ifAction) return false;
                var list = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
                if (list == null || info.NestedRepeatIndex < 0 || info.NestedRepeatIndex >= list.Count) return false;
                if (list[info.NestedRepeatIndex] is not RepeatAction rep) return false;
                repeatAction = rep;
                return true;
            }
            if (info.ParentIndex < 0 || info.ParentIndex >= _currentMacro.Actions.Count) return false;
            if (_currentMacro.Actions[info.ParentIndex] is not RepeatAction repRoot) return false;
            repeatAction = repRoot;
            return true;
        }

        /// <summary>
        /// Supprime une action imbriquée d'un RepeatAction
        /// </summary>
        private void DeleteNestedAction_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not NestedActionInfo info) return;

            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex)) return;
            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count) return;

            SaveState();

            repeatAction.Actions.RemoveAt(nestedIndex);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);

            e.Handled = true;
        }

        /// <summary>
        /// Crée une carte pour une action imbriquée dans un IfAction (Then, Else If ou Else). elseIfBranchIndex &lt; 0 = Then ou Else.
        /// </summary>
        private FrameworkElement CreateNestedIfActionCard(IInputAction action, int parentIndex, int nestedIndex, bool isThen, int elseIfBranchIndex = -1, int indentLevel = 1)
        {
            // Si c'est un RepeatAction imbriqué, créer un conteneur récursif au lieu d'une simple carte
            if (action is RepeatAction nestedRepeatAction)
            {
                return CreateNestedRepeatActionContainer(nestedRepeatAction, parentIndex, nestedIndex, isThen);
            }

            // Si c'est un IfAction imbriqué (Si dans Then/Else), afficher le bloc complet avec ↳ devant
            if (action is IfAction nestedIfAction)
            {
                var ifContainer = CreateNestedIfActionContainer(nestedIfAction, parentIndex, nestedIndex, indentLevel);
                var stepPx = indentLevel == 2 ? 32 : 16;
                var wrap = new Grid
                {
                    VerticalAlignment = VerticalAlignment.Stretch,
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    Margin = new Thickness(stepPx, 0, 0, 2),
                    MinWidth = 400
                };
                wrap.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
                wrap.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var arrow = new TextBlock
                {
                    Text = "↳",
                    FontSize = 11,
                    Foreground = GetThemeBrush("TextMutedBrush") ?? new SolidColorBrush(Color.FromRgb(0x6A, 0x7A, 0x6A)),
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(0, 14, 8, 0),
                    Opacity = 0.5
                };
                arrow.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
                Grid.SetColumn(arrow, 0);
                wrap.Children.Add(arrow);
                ifContainer.HorizontalAlignment = HorizontalAlignment.Stretch;
                Grid.SetColumn(ifContainer, 1);
                wrap.Children.Add(ifContainer);
                return wrap;
            }

            var card = CreateActionCard(action, parentIndex, null, new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen, ElseIfBranchIndex = elseIfBranchIndex });
            
            var titleBlock = FindTitleBlockInCard(card);
            if (titleBlock != null)
            {
                if (action is KeyboardAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfKeyboardAction(parentIndex, nestedIndex, isThen, elseIfBranchIndex, titleBlock);
                    };
                }
                else if (action is DelayAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfDelayAction(parentIndex, nestedIndex, isThen, elseIfBranchIndex, titleBlock);
                    };
                }
                else if (action is Core.Inputs.MouseAction)
                {
                    titleBlock.Cursor = Cursors.Hand;
                    titleBlock.PreviewMouseLeftButtonDown += (s, e) =>
                    {
                        e.Handled = true;
                        EditNestedIfMouseAction(parentIndex, nestedIndex, isThen, elseIfBranchIndex, titleBlock);
                    };
                }
                else if (action is TextAction)
                {
                    // Pour TextAction, afficher directement les contrôles inline au lieu du titre (toujours visibles)
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var textControlsPanel = CreateTextActionControls((TextAction)action, parentIndex, textPanel);
                        textPanel.Children.Insert(0, textControlsPanel);
                    }
                }
                else if (action is VariableAction vaIfNested)
                {
                    var textPanel = titleBlock.Parent as Panel;
                    if (textPanel != null)
                    {
                        textPanel.Children.Remove(titleBlock);
                        var variableControlsPanel = CreateVariableActionControls(vaIfNested, parentIndex, textPanel);
                        textPanel.Children.Insert(0, variableControlsPanel);
                    }
                }
            }

            // step-indent : colonne ↳ (34px) + carte, padding-left 16px ou 32px
            var stepIndentPx = indentLevel == 2 ? 32 : 16;
            var container = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(stepIndentPx, 0, 0, 2),
                MinWidth = 400
            };

            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
            container.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var arrowTextIf = new TextBlock
            {
                Text = "↳",
                FontSize = 11,
                Foreground = GetThemeBrush("TextMutedBrush") ?? new SolidColorBrush(Color.FromRgb(0x6A, 0x7A, 0x6A)),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Opacity = 0.5
            };
            arrowTextIf.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
            Grid.SetColumn(arrowTextIf, 0);
            container.Children.Add(arrowTextIf);

            card.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(card, 1);
            container.Children.Add(card);

            return container;
        }

        /// <summary>
        /// Crée un panel avec des boutons pour ajouter des actions dans un IfAction (Then ou Else)
        /// </summary>
        private FrameworkElement CreateAddIfActionsPanel(IfAction ifAction, int ifActionIndex, bool isThen, int elseIfBranchIndex = -1, int repeatActionIndex = -1, int nestedIfIndex = -1)
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, -4, 0, 8)
            };

            // Chips v2 : bg transparent, border line2, hover amber
            Func<string, string, IInputAction, Border> createAddButton = (icon, text, actionInstance) =>
            {
                var button = new Border
                {
                    Background = Brushes.Transparent,
                    CornerRadius = new CornerRadius(0),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 4, 0),
                    Cursor = Cursors.Hand,
                    BorderThickness = new Thickness(1),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26)),
                    Tag = new IfActionInfo
                    {
                        IfActionIndex = ifActionIndex,
                        ActionType = actionInstance.Type.ToString(),
                        IsThen = isThen,
                        ElseIfBranchIndex = elseIfBranchIndex,
                        RepeatActionIndex = repeatActionIndex,
                        NestedIfIndex = nestedIfIndex
                    }
                };
                button.MouseLeftButtonDown += AddActionToIf_Click;

                var iconBlock = new TextBlock { Text = icon, FontSize = 10 };
                iconBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontLucide");
                var textBlock = new TextBlock { Text = " " + text, FontSize = 10, FontWeight = FontWeights.SemiBold };
                textBlock.SetResourceReference(TextBlock.FontFamilyProperty, "FontDisplay");
                var brush = new SolidColorBrush(Color.FromRgb(0x4A, 0x5A, 0x4A));
                iconBlock.Foreground = brush;
                textBlock.Foreground = brush;
                var sp = new StackPanel { Orientation = Orientation.Horizontal };
                sp.Children.Add(iconBlock);
                sp.Children.Add(textBlock);
                button.Child = sp;

                button.MouseEnter += (s, e) =>
                {
                    button.BorderBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20));
                    var hoverBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0xA0, 0x20));
                    iconBlock.Foreground = hoverBrush;
                    textBlock.Foreground = hoverBrush;
                };
                button.MouseLeave += (s, e) =>
                {
                    button.BorderBrush = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26));
                    iconBlock.Foreground = brush;
                    textBlock.Foreground = brush;
                };

                return button;
            };

            panel.Children.Add(createAddButton(LucideIcons.Keyboard, "Touche", new KeyboardAction()));
            panel.Children.Add(createAddButton(LucideIcons.Mouse, "Clic", new Core.Inputs.MouseAction()));
            panel.Children.Add(createAddButton(LucideIcons.FileText, "Texte", new TextAction()));
            panel.Children.Add(createAddButton(LucideIcons.Braces, "Variable", new VariableAction()));
            panel.Children.Add(createAddButton(LucideIcons.Timer, "Délai", new DelayAction()));
            panel.Children.Add(createAddButton(LucideIcons.Repeat2, "Répéter", new RepeatAction()));

            return panel;
        }

        /// <summary>
        /// Crée un conteneur de boutons pour déplacer une action imbriquée dans un IfAction
        /// </summary>
        private FrameworkElement CreateNestedIfMoveButtonsContainer(IInputAction action, int parentIndex, int nestedIndex, bool isThen, int elseIfBranchIndex = -1)
        {
            var moveButtonsContainer = new Border
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(1.5),
                BorderBrush = GetThemeBrush("BorderLightBrush"),
                CornerRadius = new CornerRadius(2),
                Padding = new Thickness(1, 1, 1, 1),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Right,
                MinHeight = 34,
                MaxHeight = 34,
                Visibility = Visibility.Visible
            };

            var centeringGrid = new Grid
            {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            var moveButtonsPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Visible
            };

            bool canMoveUp = false;
            bool canMoveDown = false;

            if (_currentMacro != null && parentIndex >= 0 && parentIndex < _currentMacro.Actions.Count)
            {
                if (_currentMacro.Actions[parentIndex] is IfAction ifAction)
                {
                    var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
                    if (actionsList != null)
                    {
                        canMoveUp = nestedIndex > 0;
                        canMoveDown = nestedIndex < actionsList.Count - 1;
                    }
                }
            }

            // Bouton monter (▲)
            var moveUpBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveUp
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveUp ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 0, 0, 1), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
            };
            
            var moveUpBtnText = new TextBlock
            {
                Text = "▲",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveUp
                    ? GetThemeBrush("TextMutedBrush") // Flèche en gris foncé
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)), // Gris pour désactivé
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 36,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveUpBtnBorder.Child = moveUpBtnText;
            moveUpBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveUp)
                {
                    MoveNestedIfActionUp(parentIndex, nestedIndex, isThen);
                    e.Handled = true;
                }
            };
            moveUpBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextSecondaryBrush"); // Flèche en gris plus foncé au survol
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush"); // Bordure du conteneur plus foncée au survol
                }
            };
            moveUpBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveUp)
                {
                    moveUpBtnText.Foreground = GetThemeBrush("TextMutedBrush"); // Flèche en gris foncé
                    moveUpBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush"); // Bordure du conteneur normale
                }
            };

            // Bouton descendre (▼)
            var moveDownBtnBorder = new Border
            {
                Width = 30,
                Height = 30,
                Background = canMoveDown
                    ? new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)) // Fond gris très clair
                    : new SolidColorBrush(Color.FromArgb(2, 150, 150, 150)), // Fond très clair pour désactivé
                BorderThickness = new Thickness(0), // Pas de bordure individuelle, bordure commune sur le conteneur
                CornerRadius = new CornerRadius(0),
                Cursor = canMoveDown ? Cursors.Hand : Cursors.Arrow,
                Margin = new Thickness(0, 1, 0, 0), // Marge réduite pour rapprocher les flèches
                Padding = new Thickness(0), // Pas de padding pour maximiser l'espace pour la flèche
                Tag = new NestedIfActionInfo { ParentIndex = parentIndex, NestedIndex = nestedIndex, IsThen = isThen }
            };
            
            var moveDownBtnText = new TextBlock
            {
                Text = "▼",
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = canMoveDown
                    ? GetThemeBrush("TextMutedBrush") // Flèche en gris foncé
                    : new SolidColorBrush(Color.FromArgb(100, 100, 100, 100)), // Gris pour désactivé
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                LineHeight = 1,
                LineStackingStrategy = LineStackingStrategy.BlockLineHeight
            };
            
            moveDownBtnBorder.Child = moveDownBtnText;
            moveDownBtnBorder.MouseLeftButtonDown += (s, e) => 
            {
                if (canMoveDown)
                {
                    MoveNestedIfActionDown(parentIndex, nestedIndex, isThen);
                    e.Handled = true;
                }
            };
            moveDownBtnBorder.MouseEnter += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextSecondaryBrush"); // Flèche en gris plus foncé au survol
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(15, 0, 0, 0)); // Fond gris très clair au survol
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderMediumBrush"); // Bordure du conteneur plus foncée au survol
                }
            };
            moveDownBtnBorder.MouseLeave += (s, e) => 
            {
                if (canMoveDown)
                {
                    moveDownBtnText.Foreground = GetThemeBrush("TextMutedBrush"); // Flèche en gris foncé
                    moveDownBtnBorder.Background = new SolidColorBrush(Color.FromArgb(5, 0, 0, 0)); // Fond gris très clair
                    moveButtonsContainer.BorderBrush = GetThemeBrush("BorderLightBrush"); // Bordure du conteneur normale
                }
            };

            moveButtonsPanel.Children.Add(moveUpBtnBorder);
            moveButtonsPanel.Children.Add(moveDownBtnBorder);
            centeringGrid.Children.Add(moveButtonsPanel);
            moveButtonsContainer.Child = centeringGrid;

            return moveButtonsContainer;
        }

        /// <summary>
        /// Ajoute une action dans un IfAction (Then ou Else)
        /// </summary>
        private void AddActionToIf_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not IfActionInfo info) return;

            IfAction? ifAction = null;
            if (info.RepeatActionIndex >= 0 && info.NestedIfIndex >= 0)
            {
                // SI imbriqué dans un Répéter (cas qui bloquait l'ajout via chips)
                if (info.RepeatActionIndex >= _currentMacro.Actions.Count) return;
                if (_currentMacro.Actions[info.RepeatActionIndex] is not RepeatAction repeatAction) return;
                if (repeatAction.Actions == null || info.NestedIfIndex >= repeatAction.Actions.Count) return;
                ifAction = repeatAction.Actions[info.NestedIfIndex] as IfAction;
            }
            else
            {
                // SI au niveau racine
            var ifActionIndex = info.IfActionIndex;
            if (ifActionIndex < 0 || ifActionIndex >= _currentMacro.Actions.Count) return;
                ifAction = _currentMacro.Actions[ifActionIndex] as IfAction;
            }
            if (ifAction == null) return;

            SaveState();

            IInputAction? newAction = info.ActionType switch
            {
                "Keyboard" => new KeyboardAction { VirtualKeyCode = 0, ActionType = KeyboardActionType.Press },
                "Mouse" => new Core.Inputs.MouseAction { ActionType = Core.Inputs.MouseActionType.LeftClick, X = -1, Y = -1 },
                "Text" => new TextAction { Text = "", TypingSpeed = 50, UseNaturalTyping = false },
                "Variable" => new VariableAction { VariableName = "var", VariableType = VariableType.Number, Operation = VariableOperation.Set, Value = "0" },
                "Delay" => new DelayAction { Duration = 100 },
                "Repeat" => new RepeatAction
                {
                    RepeatCount = 1,
                    DelayBetweenRepeats = 0,
                    RepeatMode = RepeatMode.Once,
                    Actions = new List<IInputAction>()
                },
                _ => null
            };

            if (newAction != null)
            {
                var actionsList = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
                if (actionsList == null)
                {
                    actionsList = new List<IInputAction>();
                    if (info.IsThen)
                        ifAction.ThenActions = actionsList;
                    else
                        ifAction.ElseActions = actionsList;
                }
                actionsList.Add(newAction);
                _currentMacro.ModifiedAt = DateTime.Now;
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }

            e.Handled = true;
        }

        /// <summary>
        /// Déplace une action imbriquée vers le haut dans un IfAction
        /// </summary>
        private void MoveNestedIfActionUp(int parentIndex, int nestedIndex, bool isThen)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex <= 0 || nestedIndex >= actionsList.Count) return;

            SaveState();
            var action = actionsList[nestedIndex];
            actionsList.RemoveAt(nestedIndex);
            actionsList.Insert(nestedIndex - 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Déplace une action imbriquée vers le bas dans un IfAction
        /// </summary>
        private void MoveNestedIfActionDown(int parentIndex, int nestedIndex, bool isThen)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count - 1) return;

            SaveState();
            var action = actionsList[nestedIndex];
            actionsList.RemoveAt(nestedIndex);
            actionsList.Insert(nestedIndex + 1, action);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Supprime une action imbriquée d'un IfAction
        /// </summary>
        private void DeleteNestedIfAction_Click(object sender, MouseButtonEventArgs e)
        {
            if (_currentMacro == null) return;

            var button = sender as Border;
            if (button?.Tag is not NestedIfActionInfo info) return;

            var parentIndex = info.ParentIndex;
            var nestedIndex = info.NestedIndex;

            if (parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction) return;

            var actionsList = info.IsThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count) return;

            SaveState();
            actionsList.RemoveAt(nestedIndex);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);

            e.Handled = true;
        }

        // Méthodes d'édition inline pour les actions imbriquées dans IfAction
        private void EditNestedIfKeyboardAction(int parentIndex, int nestedIndex, bool isThen, int elseIfBranchIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not KeyboardAction ka)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;
            var editPanel = CreateKeyboardActionControls(ka, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditNestedIfDelayAction(int parentIndex, int nestedIndex, bool isThen, int elseIfBranchIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;
            var editPanel = CreateDelayActionControls(da, parentIndex, parentPanel);
            editPanel.Margin = originalMargin;

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);
        }

        private void EditNestedIfDelayActionOld(int parentIndex, int nestedIndex, bool isThen, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not DelayAction da)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            var textBox = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = da.Duration.ToString(),
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                Foreground = titleText.Foreground,
                Background = GetThemeBrush("BackgroundTertiaryBrush"),
                BorderBrush = new SolidColorBrush(GetThemeColor("InfoColor")),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(4),
                Margin = originalMargin,
                Width = 100,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Left
            };

            textBox.PreviewTextInput += (s, e) => e.Handled = !char.IsDigit(e.Text, 0);

            textBox.KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    e.Handled = true;
                    if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                    {
                        SaveState();
                        da.Duration = duration;
                        _currentMacro!.ModifiedAt = DateTime.Now;
                        RefreshBlocks();
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    Keyboard.ClearFocus();
                }
                else if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    textBox.Text = da.Duration.ToString();
                    Keyboard.ClearFocus();
                }
            };

            textBox.LostFocus += (s, e) =>
            {
                if (int.TryParse(textBox.Text, out int duration) && duration >= 0)
                {
                    SaveState();
                    da.Duration = duration;
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                else
                {
                    textBox.Text = da.Duration.ToString();
                }
            };

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, textBox);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                textBox.Focus();
                textBox.SelectAll();
            }));
        }

        private void EditNestedIfMouseAction(int parentIndex, int nestedIndex, bool isThen, int elseIfBranchIndex, TextBlock titleText)
        {
            if (_currentMacro == null || parentIndex < 0 || parentIndex >= _currentMacro.Actions.Count)
                return;

            if (_currentMacro.Actions[parentIndex] is not IfAction ifAction)
                return;

            var actionsList = isThen ? ifAction.ThenActions : ifAction.ElseActions;
            if (actionsList == null || nestedIndex < 0 || nestedIndex >= actionsList.Count)
                return;

            if (actionsList[nestedIndex] is not Core.Inputs.MouseAction ma)
                return;

            var parentPanel = titleText.Parent as Panel;
            if (parentPanel == null)
                return;

            var originalMargin = titleText.Margin;

            var editPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = originalMargin
            };

            var clickTypeComboBox = new ComboBox
            {
                MinWidth = 140,
                FontSize = titleText.FontSize,
                FontWeight = titleText.FontWeight,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Ordre des items dans le ComboBox (sans les "Relâcher")
            clickTypeComboBox.Items.Add("Clic gauche");      // index 0
            clickTypeComboBox.Items.Add("Clic droit");       // index 1
            clickTypeComboBox.Items.Add("Clic milieu");      // index 2
            clickTypeComboBox.Items.Add("Double-clic gauche");  // index 3
            clickTypeComboBox.Items.Add("Double-clic droit");   // index 4
            clickTypeComboBox.Items.Add("Maintenir gauche");  // index 5
            clickTypeComboBox.Items.Add("Maintenir droit");   // index 6
            clickTypeComboBox.Items.Add("Maintenir milieu");  // index 7
            clickTypeComboBox.Items.Add("Déplacer");         // index 8
            clickTypeComboBox.Items.Add("Molette haut");      // index 9
            clickTypeComboBox.Items.Add("Molette bas");       // index 10
            clickTypeComboBox.Items.Add("Molette");          // index 11

            // Mapper l'ActionType actuel vers l'index du ComboBox
            int currentIndex = ma.ActionType switch
            {
                Core.Inputs.MouseActionType.LeftClick => 0,
                Core.Inputs.MouseActionType.RightClick => 1,
                Core.Inputs.MouseActionType.MiddleClick => 2,
                Core.Inputs.MouseActionType.DoubleLeftClick => 3,
                Core.Inputs.MouseActionType.DoubleRightClick => 4,
                Core.Inputs.MouseActionType.LeftDown => 5,
                Core.Inputs.MouseActionType.RightDown => 6,
                Core.Inputs.MouseActionType.MiddleDown => 7,
                Core.Inputs.MouseActionType.Move => 8,
                Core.Inputs.MouseActionType.WheelUp => 9,
                Core.Inputs.MouseActionType.WheelDown => 10,
                Core.Inputs.MouseActionType.Wheel => 11,
                _ => 0 // Par défaut, LeftClick si c'est un type "Relâcher" non supporté
            };
            clickTypeComboBox.SelectedIndex = currentIndex;

            // Fonction pour déterminer si les contrôles de déplacement doivent être affichés (uniquement pour Move)
            bool ShouldShowMoveControlsIf(Core.Inputs.MouseActionType actionType)
            {
                return actionType == Core.Inputs.MouseActionType.Move;
            }

            // CheckBox pour le mode relatif (uniquement pour Move) - déclaré avant SelectionChanged
            bool showMoveControlsIf = ShouldShowMoveControlsIf(ma.ActionType);
            var relativeMoveCheckBoxIf = new CheckBox
            {
                Content = "Relatif",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Déplacer de X/Y pixels par rapport à la position actuelle",
                IsChecked = ma.IsRelativeMove,
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            relativeMoveCheckBoxIf.Checked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            relativeMoveCheckBoxIf.Unchecked += (s, e) =>
            {
                SaveState();
                ma.IsRelativeMove = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                RefreshBlocks();
            };
            editPanel.Children.Add(relativeMoveCheckBoxIf);

            // Durée de maintien (optionnel) pour Maintenir gauche/droit/milieu
            bool IsMaintenirIf(Core.Inputs.MouseActionType t) =>
                t == Core.Inputs.MouseActionType.LeftDown || t == Core.Inputs.MouseActionType.RightDown || t == Core.Inputs.MouseActionType.MiddleDown;
            bool showHoldDurationIf = IsMaintenirIf(ma.ActionType);
            var holdDurationLabelIf = new TextBlock
            {
                Text = "Durée (optionnel):",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(185, 182, 194)), // #B9B6C2
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 4, 0),
                Visibility = showHoldDurationIf ? Visibility.Visible : Visibility.Collapsed
            };
            var holdDurationTextBoxIf = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "",
                Width = 60,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showHoldDurationIf ? Visibility.Visible : Visibility.Collapsed,
                ToolTip = "Durée en ms (laisser vide = illimité)"
            };
            holdDurationTextBoxIf.LostFocus += (s, e) =>
            {
                var text = holdDurationTextBoxIf.Text.Trim();
                int ms = 0;
                if (!string.IsNullOrEmpty(text) && (!int.TryParse(text, out ms) || ms < 0))
                {
                    holdDurationTextBoxIf.Text = ma.HoldDurationMs > 0 ? ma.HoldDurationMs.ToString() : "";
                    return;
                }
                if (ma.HoldDurationMs != ms)
                {
                    SaveState();
                    ma.HoldDurationMs = ms;
                    if (_currentMacro != null) { _currentMacro.ModifiedAt = DateTime.Now; MacroChanged?.Invoke(this, EventArgs.Empty); }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(holdDurationLabelIf);
            editPanel.Children.Add(holdDurationTextBoxIf);

            // ComboBox pour la vitesse de déplacement (uniquement pour Move)
            var moveSpeedComboBoxIf = new ComboBox
            {
                MinWidth = 100,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Vitesse du déplacement",
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            moveSpeedComboBoxIf.Items.Add("Instantané");
            moveSpeedComboBoxIf.Items.Add("Rapide");
            moveSpeedComboBoxIf.Items.Add("Graduel");
            
            // Mapper la vitesse actuelle vers l'index
            moveSpeedComboBoxIf.SelectedIndex = ma.MoveSpeed switch
            {
                Core.Inputs.MoveSpeed.Instant => 0,
                Core.Inputs.MoveSpeed.Fast => 1,
                Core.Inputs.MoveSpeed.Gradual => 2,
                _ => 0
            };
            
            moveSpeedComboBoxIf.SelectionChanged += (s, e) =>
            {
                if (moveSpeedComboBoxIf.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveSpeed = moveSpeedComboBoxIf.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveSpeed.Instant,
                        1 => Core.Inputs.MoveSpeed.Fast,
                        2 => Core.Inputs.MoveSpeed.Gradual,
                        _ => Core.Inputs.MoveSpeed.Instant
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveSpeedComboBoxIf);

            // ComboBox pour le type d'easing (uniquement pour Move)
            var moveEasingComboBoxIf = new ComboBox
            {
                MinWidth = 120,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0),
                ToolTip = "Courbe d'accélération/décélération",
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            moveEasingComboBoxIf.Items.Add("Linéaire");
            moveEasingComboBoxIf.Items.Add("Accélération");
            moveEasingComboBoxIf.Items.Add("Décélération");
            moveEasingComboBoxIf.Items.Add("Ease-in-out");
            
            // Mapper l'easing actuel vers l'index
            moveEasingComboBoxIf.SelectedIndex = ma.MoveEasing switch
            {
                Core.Inputs.MoveEasing.Linear => 0,
                Core.Inputs.MoveEasing.EaseIn => 1,
                Core.Inputs.MoveEasing.EaseOut => 2,
                Core.Inputs.MoveEasing.EaseInOut => 3,
                _ => 0
            };
            
            moveEasingComboBoxIf.SelectionChanged += (s, e) =>
            {
                if (moveEasingComboBoxIf.SelectedIndex >= 0)
                {
                    SaveState();
                    ma.MoveEasing = moveEasingComboBoxIf.SelectedIndex switch
                    {
                        0 => Core.Inputs.MoveEasing.Linear,
                        1 => Core.Inputs.MoveEasing.EaseIn,
                        2 => Core.Inputs.MoveEasing.EaseOut,
                        3 => Core.Inputs.MoveEasing.EaseInOut,
                        _ => Core.Inputs.MoveEasing.Linear
                    };
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(moveEasingComboBoxIf);

            // CheckBox pour activer le mode Bézier (uniquement pour Move)
            var bezierCheckBoxIf = new CheckBox
            {
                Content = "Bézier",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                ToolTip = "Utiliser une trajectoire courbe (Bézier) avec un point de contrôle",
                IsChecked = ma.UseBezierPath,
                Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(bezierCheckBoxIf);

            // Contrôles pour le point de contrôle Bézier
            bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
            var controlXLabelIf = new TextBlock
            {
                Text = "Ctrl X:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlXLabelIf);

            var controlXTextBoxIf = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            controlXTextBoxIf.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlXTextBoxIf.Text, out int controlX))
                {
                    SaveState();
                    ma.ControlX = controlX;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlXTextBoxIf.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlXTextBoxIf.Text, out int controlX))
                {
                    controlXTextBoxIf.Text = ma.ControlX >= 0 ? ma.ControlX.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlXTextBoxIf);

            var controlYLabelIf = new TextBlock
            {
                Text = "Ctrl Y:",
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 4, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            editPanel.Children.Add(controlYLabelIf);

            var controlYTextBoxIf = new TextBox
            {
                Style = GetActionTextBoxStyle(),
                Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1",
                Width = 60,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            controlYTextBoxIf.TextChanged += (s, e) =>
            {
                if (int.TryParse(controlYTextBoxIf.Text, out int controlY))
                {
                    SaveState();
                    ma.ControlY = controlY;
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                }
            };
            controlYTextBoxIf.LostFocus += (s, e) =>
            {
                if (!int.TryParse(controlYTextBoxIf.Text, out int controlY))
                {
                    controlYTextBoxIf.Text = ma.ControlY >= 0 ? ma.ControlY.ToString() : "-1";
                }
                else
                {
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(controlYTextBoxIf);

            var selectControlPointButtonIf = new Button
            {
                Content = LucideIcons.CreateIconWithText(LucideIcons.Crosshair, " Ctrl", 12),
                MinWidth = 70,
                Height = 24,
                Padding = new Thickness(6, 0, 6, 0),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
                ToolTip = "Sélectionner le point de contrôle à l'écran",
                Cursor = Cursors.Hand,
                Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed
            };
            selectControlPointButtonIf.Click += (s, e) =>
            {
                var pointSelector = new PointSelectorWindow();
                if (pointSelector.ShowDialog() == true)
                {
                    SaveState();
                    ma.ControlX = pointSelector.SelectedX;
                    ma.ControlY = pointSelector.SelectedY;
                    controlXTextBoxIf.Text = ma.ControlX.ToString();
                    controlYTextBoxIf.Text = ma.ControlY.ToString();
                    if (_currentMacro != null)
                    {
                        _currentMacro.ModifiedAt = DateTime.Now;
                        MacroChanged?.Invoke(this, EventArgs.Empty);
                    }
                    RefreshBlocks();
                }
            };
            editPanel.Children.Add(selectControlPointButtonIf);

            // Ajouter les handlers après la déclaration de toutes les variables
            bezierCheckBoxIf.Checked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = true;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };
            bezierCheckBoxIf.Unchecked += (s, e) =>
            {
                SaveState();
                ma.UseBezierPath = false;
                if (_currentMacro != null)
                {
                    _currentMacro.ModifiedAt = DateTime.Now;
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
                bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                RefreshBlocks();
            };

            // Ajouter le SelectionChanged après la déclaration de toutes les variables
            clickTypeComboBox.SelectionChanged += (s, e) =>
            {
                if (clickTypeComboBox.SelectedIndex >= 0)
                {
                    SaveState();
                    // Mapper l'index du ComboBox vers l'enum MouseActionType
                    ma.ActionType = clickTypeComboBox.SelectedIndex switch
                    {
                        0 => Core.Inputs.MouseActionType.LeftClick,
                        1 => Core.Inputs.MouseActionType.RightClick,
                        2 => Core.Inputs.MouseActionType.MiddleClick,
                        3 => Core.Inputs.MouseActionType.DoubleLeftClick,
                        4 => Core.Inputs.MouseActionType.DoubleRightClick,
                        5 => Core.Inputs.MouseActionType.LeftDown,
                        6 => Core.Inputs.MouseActionType.RightDown,
                        7 => Core.Inputs.MouseActionType.MiddleDown,
                        8 => Core.Inputs.MouseActionType.Move,
                        9 => Core.Inputs.MouseActionType.WheelUp,
                        10 => Core.Inputs.MouseActionType.WheelDown,
                        11 => Core.Inputs.MouseActionType.Wheel,
                        12 => Core.Inputs.MouseActionType.WheelContinuous,
                        _ => Core.Inputs.MouseActionType.LeftClick
                    };
                    
                    // Mettre à jour la visibilité des contrôles
                    bool showHoldIf = IsMaintenirIf(ma.ActionType);
                    holdDurationLabelIf.Visibility = showHoldIf ? Visibility.Visible : Visibility.Collapsed;
                    holdDurationTextBoxIf.Visibility = showHoldIf ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showMoveControlsIf = ma.ActionType == Core.Inputs.MouseActionType.Move;
                    relativeMoveCheckBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    moveSpeedComboBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    moveEasingComboBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    bezierCheckBoxIf.Visibility = showMoveControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    
                    bool showBezierControlsIf = showMoveControlsIf && ma.UseBezierPath;
                    controlXLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlXTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlYLabelIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    controlYTextBoxIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    selectControlPointButtonIf.Visibility = showBezierControlsIf ? Visibility.Visible : Visibility.Collapsed;
                    
                    _currentMacro!.ModifiedAt = DateTime.Now;
                    RefreshBlocks();
                    MacroChanged?.Invoke(this, EventArgs.Empty);
                }
            };

            editPanel.Children.Add(clickTypeComboBox);

            var idx = parentPanel.Children.IndexOf(titleText);
            if (idx < 0)
                return;

            parentPanel.Children.RemoveAt(idx);
            parentPanel.Children.Insert(idx, editPanel);

            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
            {
                clickTypeComboBox.Focus();
            }));
        }

        /// <summary>
        /// Crée un conteneur récursif pour un IfAction imbriqué dans un RepeatAction
        /// </summary>
        private FrameworkElement CreateNestedIfActionContainer(IfAction ifAction, int repeatActionIndex, int nestedIndex, int indentLevel = 1)
        {
            // Marge basse modérée : moins d’air sous le bloc SINON (voir elseBranchWrap + chips).
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 6)
            };

            // Créer une carte simple pour l'IfAction (sans boutons monter/descendre car c'est imbriqué)
            var card = CreateActionCard(ifAction, repeatActionIndex);
            container.Children.Add(card);

            // If dans Repeat : actions « alors » puis ajout sous les actions
            // Peu de marge sous la branche « alors » pour rapprocher le bloc SINON.
            var thenBranchWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(-10, 0, 0, 12) };
            if (ifAction.ThenActions != null && ifAction.ThenActions.Count > 0)
            {
                var thenContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 4, 0, 4)
                };
                for (int i = 0; i < ifAction.ThenActions.Count; i++)
                {
                    var nestedAction = ifAction.ThenActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, repeatActionIndex, nestedIndex, true, -1, 1);
                    thenContainer.Children.Add(nestedCard);
                }
                thenBranchWrap.Children.Add(thenContainer);
            }
            var addThenNestedPanel = CreateAddIfActionsPanel(ifAction, repeatActionIndex, true, -1, repeatActionIndex, nestedIndex);
            addThenNestedPanel.Margin = new Thickness(50, -4, 0, 2);
            thenBranchWrap.Children.Add(addThenNestedPanel);
            container.Children.Add(thenBranchWrap);

            // Section Sinon — If dans Repeat
            var elseColor = Color.FromRgb(0xA7, 0x8B, 0xFA);
            // Dans Repeat, SINON doit s'aligner comme le titre de la carte SI.
            // Margin top négatif : moins d’espace au-dessus du bandeau SINON (après les chips « alors »).
            var elseBranchWrap = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(-8, -6, 0, 0) };
            // Marge gauche sur le chrome seul : bandeau SINON un peu à droite, actions imbriquées et chips inchangés.
            var elseSectionBorder = CreateIfBranchSectionChrome(elseColor, "SINON", new Thickness(8, 0, 0, 4), out var elseSection);
            // Même logique en imbriqué : pas de body vide dans le cadre SINON.
            elseSection.Visibility = Visibility.Collapsed;

            elseBranchWrap.Children.Add(elseSectionBorder);
            if (ifAction.ElseActions != null && ifAction.ElseActions.Count > 0)
            {
                var elseContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(-2, 4, 0, 4)
                };

                for (int i = 0; i < ifAction.ElseActions.Count; i++)
                {
                    var nestedAction = ifAction.ElseActions[i];
                    var nestedCard = CreateNestedIfActionCard(nestedAction, repeatActionIndex, nestedIndex, false, -1, 1);
                    elseContainer.Children.Add(nestedCard);
                }
                elseBranchWrap.Children.Add(elseContainer);
            }
            var addElseNestedPanel = CreateAddIfActionsPanel(ifAction, repeatActionIndex, false, -1, repeatActionIndex, nestedIndex);
            addElseNestedPanel.Margin = new Thickness(48, -4, 0, 0);
            elseBranchWrap.Children.Add(addElseNestedPanel);
            container.Children.Add(elseBranchWrap);

            return container;
        }

        /// <summary>
        /// Crée un conteneur récursif pour un RepeatAction imbriqué dans un IfAction
        /// </summary>
        private FrameworkElement CreateNestedRepeatActionContainer(RepeatAction repeatAction, int ifActionIndex, int nestedIndex, bool isThen)
        {
            var container = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // Créer une carte pour le RepeatAction avec NestedIfActionInfo pour que la croix supprime uniquement ce Repeat (pas tout le If)
            var card = CreateActionCard(repeatAction, ifActionIndex, null, new NestedIfActionInfo { ParentIndex = ifActionIndex, NestedIndex = nestedIndex, IsThen = isThen, ElseIfBranchIndex = -1 });
            container.Children.Add(card);

            // block-body : trait vertical gauche (margin 22 + border 2)
            var line2BrushRepeat = new SolidColorBrush(Color.FromRgb(0x26, 0x2D, 0x26));
            var nestedSectionBorder = new Border
            {
                Background = Brushes.Transparent,
                BorderBrush = line2BrushRepeat,
                BorderThickness = new Thickness(2, 0, 0, 0),
                Margin = new Thickness(22, 0, 0, 4),
                Padding = new Thickness(0),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            var nestedSection = new StackPanel { Orientation = Orientation.Vertical };

            if (repeatAction.Actions != null && repeatAction.Actions.Count > 0)
            {
                var nestedContainer = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Margin = new Thickness(0, 0, 0, 4)
                };

                for (int i = 0; i < repeatAction.Actions.Count; i++)
                {
                    var nestedAction = repeatAction.Actions[i];
                    var nestedCard = CreateNestedActionCard(nestedAction, -1, i, ifActionIndex, isThen, nestedIndex, indentLevel: 1);
                    nestedContainer.Children.Add(nestedCard);
                }
                nestedSection.Children.Add(nestedContainer);
            }

            var addActionsPanel = CreateAddActionsPanel(repeatAction, -1, ifActionIndex, isThen, nestedIndex);
            nestedSection.Children.Add(addActionsPanel);
            
            nestedSectionBorder.Child = nestedSection;
            container.Children.Add(nestedSectionBorder);

            return container;
        }

        /// <summary>
        /// Informations sur une action imbriquée (pour passer le contexte aux event handlers).
        /// Si IfActionIndex >= 0 : l'action est dans un Repeat lui-même dans le Then/Else d'un If.
        /// Sinon : l'action est dans un Repeat au niveau racine (ParentIndex = index du Repeat).
        /// </summary>
        private class NestedActionInfo
        {
            public int ParentIndex { get; set; }
            public int NestedIndex { get; set; }
            /// <summary>Index de l'IfAction parent quand le Repeat est dans Then/Else ; -1 si Repeat au niveau racine.</summary>
            public int IfActionIndex { get; set; } = -1;
            public bool IsThen { get; set; }
            /// <summary>Index du Repeat dans ThenActions ou ElseActions.</summary>
            public int NestedRepeatIndex { get; set; } = -1;
        }

        /// <summary>
        /// Informations sur une action imbriquée dans un IfAction
        /// IsThen=true -> ThenActions ; IsThen=false et ElseIfBranchIndex&lt;0 -> ElseActions ; IsThen=false et ElseIfBranchIndex>=0 -> ElseIfBranches[ElseIfBranchIndex].Actions
        /// </summary>
        private class NestedIfActionInfo
        {
            public int ParentIndex { get; set; }
            public int NestedIndex { get; set; }
            public bool IsThen { get; set; }
            /// <summary>-1 = Else, >= 0 = index de la branche Else If</summary>
            public int ElseIfBranchIndex { get; set; } = -1;
        }

        /// <summary>
        /// Informations sur un RepeatAction (pour passer le contexte aux event handlers)
        /// Si IfActionIndex >= 0 : Repeat est dans le Then/Else d'un If (référence par IfActionIndex + IsThen + NestedRepeatIndex).
        /// Sinon : Repeat est au niveau racine (RepeatActionIndex dans _currentMacro.Actions).
        /// </summary>
        private class RepeatActionInfo
        {
            public int RepeatActionIndex { get; set; }
            public string ActionType { get; set; } = "";
            /// <summary>Index de l'IfAction parent quand Repeat est dans Then/Else ; -1 si Repeat au niveau racine.</summary>
            public int IfActionIndex { get; set; } = -1;
            public bool IsThen { get; set; }
            /// <summary>Index du Repeat dans ThenActions ou ElseActions.</summary>
            public int NestedRepeatIndex { get; set; }
        }

        /// <summary>
        /// Informations sur un IfAction (pour passer le contexte aux event handlers)
        /// ElseIfBranchIndex &lt; 0 = Then ou Else, >= 0 = branche Else If
        /// </summary>
        private class IfActionInfo
        {
            public int IfActionIndex { get; set; }
            public string ActionType { get; set; } = "";
            public bool IsThen { get; set; }
            public int ElseIfBranchIndex { get; set; } = -1;
            public int RepeatActionIndex { get; set; } = -1;
            public int NestedIfIndex { get; set; } = -1;
        }

        #endregion

        #region Undo/Redo

        private void TrimUndoStackIfNeeded()
        {
            if (_undoStack.Count <= 50) return;
            var temp = new Stack<List<IInputAction>>();
            for (var i = 0; i < 50; i++)
                temp.Push(_undoStack.Pop());
            _undoStack = temp;
        }

        private void SaveState()
        {
            if (_currentMacro == null || _isUndoRedo) return;

            var state = _currentMacro.Actions.Select(a => a.Clone()).ToList();
            _undoStack.Push(state);
            TrimUndoStackIfNeeded();
            _redoStack.Clear();
            UpdateUndoRedoButtons();
        }

        private void Undo()
        {
            if (_currentMacro == null || _undoStack.Count == 0) return;

            var actions = _currentMacro.Actions;
            var currentState = new List<IInputAction>(actions.Count);
            foreach (var a in actions)
                currentState.Add(a.Clone());
            _redoStack.Push(currentState);

            var previousState = _undoStack.Pop();
            _isUndoRedo = true;
            
            actions.Clear();
            actions.Capacity = Math.Max(actions.Capacity, previousState.Count);
            foreach (var a in previousState)
                actions.Add(a.Clone());
            _currentMacro.ModifiedAt = DateTime.Now;
            
            _isUndoRedo = false;
            UpdateUndoRedoButtons();
            // ApplicationIdle : laisse traiter les entrées clavier/souris avant le gros RefreshBlocks.
            // MacroActionsChangedOnlyEventArgs : MainWindow évite hooks + Items.Refresh + FlattenActions immédiat.
            Dispatcher.BeginInvoke(new Action(() =>
            {
                RefreshBlocks(() => MacroChanged?.Invoke(this, MacroActionsChangedOnlyEventArgs.Instance));
            }), System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }

        private void Redo()
        {
            if (_currentMacro == null || _redoStack.Count == 0) return;

            var actions = _currentMacro.Actions;
            var currentState = new List<IInputAction>(actions.Count);
            foreach (var a in actions)
                currentState.Add(a.Clone());
            _undoStack.Push(currentState);

            var nextState = _redoStack.Pop();
            _isUndoRedo = true;
            
            actions.Clear();
            actions.Capacity = Math.Max(actions.Capacity, nextState.Count);
            foreach (var a in nextState)
                actions.Add(a.Clone());
            _currentMacro.ModifiedAt = DateTime.Now;
            
            _isUndoRedo = false;
            UpdateUndoRedoButtons();
            Dispatcher.BeginInvoke(new Action(() =>
            {
                RefreshBlocks(() => MacroChanged?.Invoke(this, MacroActionsChangedOnlyEventArgs.Instance));
            }), System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }

        private void UpdateUndoRedoButtons()
        {
            if (UndoButton != null)
            {
                UndoButton.IsEnabled = _currentMacro != null && _undoStack.Count > 0;
            }
            
            if (RedoButton != null)
            {
                RedoButton.IsEnabled = _currentMacro != null && _redoStack.Count > 0;
            }
        }

        private void UndoButton_Click(object sender, RoutedEventArgs e)
        {
            Undo();
        }

        private void RedoButton_Click(object sender, RoutedEventArgs e)
        {
            Redo();
        }

        /// <summary>
        /// Annule la dernière modification (appelable depuis l'extérieur, ex. raccourci fenêtre).
        /// </summary>
        public void PerformUndo()
        {
            Undo();
            Dispatcher.BeginInvoke(new Action(() => PlayUndoRedoIconRotation(UndoButton, -360)),
                System.Windows.Threading.DispatcherPriority.Input);
        }

        /// <summary>
        /// Refait la dernière modification annulée (appelable depuis l'extérieur).
        /// </summary>
        public void PerformRedo()
        {
            Redo();
            Dispatcher.BeginInvoke(new Action(() => PlayUndoRedoIconRotation(RedoButton, 360)),
                System.Windows.Threading.DispatcherPriority.Input);
        }

        #endregion

        #region Presets

        private void PresetsButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new PresetsDialog(_presetStorage);
            dialog.PresetSelected += (s, preset) =>
            {
                InsertPreset(preset);
            };
            dialog.Owner = Window.GetWindow(this);
            dialog.ShowDialog();
        }

        private async System.Threading.Tasks.Task SaveActionAsPreset(IInputAction action, int index)
        {
            try
            {
                // Demander un nom pour le preset
                var dialog = new SavePresetDialog(action);
                dialog.Owner = Window.GetWindow(this);
                
                if (dialog.ShowDialog() == true && dialog.PresetName != null)
                {
                    var preset = new ActionPreset
                    {
                        Id = Guid.NewGuid().ToString(),
                        Name = dialog.PresetName,
                        Description = dialog.PresetDescription ?? "",
                        Category = dialog.PresetCategory ?? "Général",
                        Actions = new List<IInputAction> { action.Clone() },
                        CreatedAt = DateTime.Now,
                        ModifiedAt = DateTime.Now
                    };

                    await _presetStorage.AddPresetAsync(preset);
                    
                    MessageBox.Show($"Preset '{preset.Name}' sauvegardé avec succès !", 
                        "Preset sauvegardé", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors de la sauvegarde du preset:\n{ex.Message}",
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void DuplicateAction(int index)
        {
            if (_currentMacro == null || index < 0 || index >= _currentMacro.Actions.Count) return;

            SaveState();

            var actionToDuplicate = _currentMacro.Actions[index];
            var duplicatedAction = actionToDuplicate.Clone();
            
            // Insérer juste après l'action originale
            _currentMacro.Actions.Insert(index + 1, duplicatedAction);
            _currentMacro.ModifiedAt = DateTime.Now;
            
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Duplique uniquement l'action imbriquée dans un Repeat (pas tout le bloc Repeat).
        /// </summary>
        private void DuplicateNestedActionInRepeat(NestedActionInfo info)
        {
            if (_currentMacro == null) return;
            if (!TryGetRepeatAndIndexFromNestedInfo(info, out var repeatAction, out var nestedIndex)) return;
            if (repeatAction!.Actions == null || nestedIndex < 0 || nestedIndex >= repeatAction.Actions.Count) return;

            SaveState();

            var actionToDuplicate = repeatAction.Actions[nestedIndex];
            var duplicatedAction = actionToDuplicate.Clone();
            if (duplicatedAction == null) return;

            repeatAction.Actions.Insert(nestedIndex + 1, duplicatedAction);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Duplique uniquement l'action imbriquée dans un If (Then, Else ou Else If), pas tout le bloc If.
        /// </summary>
        private void DuplicateNestedActionInIf(NestedIfActionInfo info)
        {
            if (_currentMacro == null || info.ParentIndex < 0 || info.ParentIndex >= _currentMacro.Actions.Count) return;
            if (_currentMacro.Actions[info.ParentIndex] is not IfAction ifAction) return;

            var list = GetIfActionsList(ifAction, info.IsThen, info.ElseIfBranchIndex);
            if (list == null)
            {
                list = new List<IInputAction>();
                if (info.IsThen)
                    ifAction.ThenActions = list;
                else if (info.ElseIfBranchIndex < 0)
                    ifAction.ElseActions = list;
                else if (ifAction.ElseIfBranches != null && info.ElseIfBranchIndex < ifAction.ElseIfBranches.Count)
                    ifAction.ElseIfBranches[info.ElseIfBranchIndex].Actions = list;
                else
                    return;
            }
            if (info.NestedIndex < 0 || info.NestedIndex >= list.Count) return;

            SaveState();

            var actionToDuplicate = list[info.NestedIndex];
            var duplicatedAction = actionToDuplicate.Clone();
            if (duplicatedAction == null) return;

            list.Insert(info.NestedIndex + 1, duplicatedAction);
            _currentMacro.ModifiedAt = DateTime.Now;
            RefreshBlocks();
            MacroChanged?.Invoke(this, EventArgs.Empty);
        }

        private void InsertPreset(ActionPreset preset)
        {
            try
            {
                if (_currentMacro == null || preset?.Actions == null || preset.Actions.Count == 0) return;

                SaveState();

                // Insérer toutes les actions du preset à la fin
                foreach (var action in preset.Actions)
                {
                    if (action != null)
                    {
                        var clonedAction = action.Clone();
                        if (clonedAction != null)
                        {
                            _currentMacro.Actions.Add(clonedAction);
                        }
                    }
                }
                
                _currentMacro.ModifiedAt = DateTime.Now;
                
                RefreshBlocks();
                MacroChanged?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Erreur lors de l'insertion du preset:\n{ex.Message}",
                    "Erreur", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        #endregion
    }

    /// <summary>
    /// Dialogue simple pour capturer une touche (pour TimelineEditor)
    /// </summary>
    public class TimelineKeyCaptureDialog : Window
    {
        public int CapturedKey { get; private set; }
        private TextBlock _instructionText;

        public TimelineKeyCaptureDialog()
        {
            Title = "Capturer une touche";
            Width = 300;
            Height = 150;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ResizeMode = ResizeMode.NoResize;
            Background = (SolidColorBrush)Application.Current.Resources["BackgroundPrimaryBrush"];

            var grid = new Grid { Margin = new Thickness(20) };
            
            _instructionText = new TextBlock
            {
                Text = "Appuyez sur une touche...",
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                FontSize = 16,
                Style = (Style)Application.Current.Resources["TextBody"]
            };
            grid.Children.Add(_instructionText);

            Content = grid;
            KeyDown += Dialog_KeyDown;
        }

        private void Dialog_KeyDown(object sender, KeyEventArgs e)
        {
            CapturedKey = KeyInterop.VirtualKeyFromKey(e.Key);
            _instructionText.Text = $"Touche: {e.Key}";
            DialogResult = true;
            Close();
        }
    }

    /// <summary>
    /// Helper pour parcourir l'arbre visuel
    /// </summary>
    public static class VisualTreeHelperExtensions
    {
        public static IEnumerable<DependencyObject> GetDescendants(DependencyObject element)
        {
            for (int i = 0; i < System.Windows.Media.VisualTreeHelper.GetChildrenCount(element); i++)
            {
                var child = System.Windows.Media.VisualTreeHelper.GetChild(element, i);
                yield return child;
                foreach (var descendant in GetDescendants(child))
                {
                    yield return descendant;
                }
            }
        }
    }
}

# M3.2 — Clicker parity (Blur)

Référence produit : [Blur AutoClicker](https://github.com/Blur009/Blur-AutoClicker) (README Simple + Advanced).  
Parité de **comportement** uniquement — pas de copie de code GPL-3.0.

## Matrice

| Feature Blur | Caster |
|--------------|-------------|
| Indicateur ON | Pastille dans `ClickerPanel` |
| L/R/M | OK |
| Clavier + casse | `inputKind=keyboard` + `key` + `keyShift` |
| Hold / Toggle | OK |
| Hotkeys custom | Réglages (existant) |
| Duty cycle | Advanced |
| Plage CPS min–max | Advanced (`cpsMin`/`cpsMax`) |
| Stop coins | 4 coins |
| Stop bords | 4 bords + marge |
| Limites clics / durée | Advanced |
| Double clic | Advanced |
| Position / pick | Advanced |
| Unités /s /min /h /j | `rateUnit` |
| Cap ~500 CPS | Soft cap moteur |

## Checklist

1. Souris L/R/M et clavier + Shift (Hold/Toggle).
2. Taux fixe ou plage min–max ; unités s/min/h/j.
3. Stop 4 coins + 4 bords.
4. Duty, double, limites, pick (régression).
5. Indicateur ON dans le panel.
6. `cargo test` ; smoke `tauri dev`.

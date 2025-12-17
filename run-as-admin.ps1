# Script pour lancer MacroEngine avec privilèges administrateur
$exePath = Join-Path $PSScriptRoot "bin\Debug\net8.0-windows\MacroEngine.exe"

if (Test-Path $exePath) {
    Write-Host "Lancement de MacroEngine avec privilèges administrateur..." -ForegroundColor Green
    Start-Process -FilePath $exePath -Verb RunAs -WorkingDirectory $PSScriptRoot
} else {
    Write-Host "Erreur: L'exécutable n'existe pas. Veuillez d'abord compiler le projet avec 'dotnet build'." -ForegroundColor Red
    Write-Host "Chemin attendu: $exePath" -ForegroundColor Yellow
}

# NEITZEL - Vigia automatico: publica no GitHub quando algo muda no sistema
# Deixe este script rodando (janela pode ficar minimizada). Feche para parar.
$ErrorActionPreference = 'Continue'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$log = Join-Path $PSScriptRoot 'auto-publicar.log'

function Log($msg) {
  $linha = ("[{0}] {1}" -f (Get-Date -Format 'dd/MM HH:mm:ss'), $msg)
  Write-Host $linha
  Add-Content -Path $log -Value $linha
}

function Ignorar([string]$caminho) {
  if (-not $caminho) { return $true }
  if ($caminho -match '\\data\\') { return $true }
  if ($caminho -match '\.bak_') { return $true }
  if ($caminho -match '~\$|\.tmp$|\.log$') { return $true }
  return $false
}

function Publicar([string]$motivo) {
  git pull origin master --rebase --autostash 2>&1 | Out-Null
  git add -A
  $staged = git diff --cached --name-only
  if (-not $staged) { return }
  Log ("Publicando {0} arquivo(s) ({1})..." -f $staged.Count, $motivo)
  git commit -m ("Auto-atualizacao - " + (Get-Date -Format 'dd/MM/yyyy HH:mm')) | Out-Null
  git push origin master | Out-Null
  if ($LASTEXITCODE -eq 0) { Log "PUBLICADO com sucesso." }
  else { Log "Falha no push (sem internet?). Sera tentado na proxima mudanca." }
}

Log "== Vigia NEITZEL iniciado. Qualquer edicao sera publicada automaticamente. =="

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $repo
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents = $true

# Debounce: espera a edicao estabilizar antes de publicar
$timer = New-Object System.Timers.Timer 45000
$timer.AutoReset = $false
Register-ObjectEvent $timer Elapsed -Action {
  Publicar 'mudancas detectadas'
} | Out-Null

$action = {
  $ev = $Event.SourceEventArgs
  if (-not (Ignorar $ev.FullPath)) { $timer.Stop(); $timer.Start() }
}
Register-ObjectEvent $fsw Changed -Action $action | Out-Null
Register-ObjectEvent $fsw Created -Action $action | Out-Null
Register-ObjectEvent $fsw Renamed -Action $action | Out-Null
Register-ObjectEvent $fsw Deleted -Action $action | Out-Null

Write-Host "Aguardando edicoes... (Ctrl+C para encerrar)"
while ($true) { Start-Sleep -Seconds 3600 }

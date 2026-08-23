# NEITZEL - Publicar alteracoes no GitHub (uso manual ou pelo .bat)
$ErrorActionPreference = 'Continue'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo

Write-Host "== NEITZEL: publicando no GitHub ==" -ForegroundColor Cyan

# 1. Atualiza-se primeiro para evitar conflitos
git pull origin master --rebase --autostash 2>&1 | Out-Null

# 2. Adiciona tudo (data/ e backups ficam fora via .gitignore)
git add -A

# 3. Ha algo a publicar?
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "Nada novo para publicar - GitHub ja esta atualizado." -ForegroundColor Yellow
  exit 0
}
Write-Host ("Arquivos alterados: {0}" -f $staged.Count)

# 4. Commit + push
$msg = "Atualizacao do sistema - " + (Get-Date -Format 'dd/MM/yyyy HH:mm')
git commit -m $msg | Out-Null
Write-Host "Enviando..." -ForegroundColor Cyan
git push origin master
if ($LASTEXITCODE -eq 0) {
  Write-Host "PUBLICADO! Veja em https://github.com/neitzelcomercial-cell/neitzel-ecomim" -ForegroundColor Green
} else {
  Write-Host "Falha ao enviar (sem internet?). Rode novamente mais tarde." -ForegroundColor Red
  exit 1
}

@echo off
title NEITZEL - Abrir Portal do Cliente
cd /d "%~dp0"

rem 1) Inicia o servidor se ainda nao estiver rodando
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2 -UseBasicParsing | Out-Null } catch { Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden }"

rem 2) Espera o servidor subir
timeout /t 3 /nobreak >nul

rem 3) Localiza o Chrome (ou usa o navegador padrao)
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-window "http://localhost:8080/agendamento"
) else (
  start "" "http://localhost:8080/agendamento"
)
exit

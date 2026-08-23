@echo off
title NEITZEL - Auto-Publicar (deixe aberto)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\auto-publicar.ps1"
pause

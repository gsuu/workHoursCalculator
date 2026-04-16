@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-preloaded-monthly.ps1" %*

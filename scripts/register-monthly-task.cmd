@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-monthly-task.ps1" %*

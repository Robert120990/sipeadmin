@echo off
REM ============================================================
REM Sincronizador Automático Diario DGEHM - OFICINA SIPE
REM ============================================================
cd /d "%~dp0..\backend"
node sync-dgehm-direct.js

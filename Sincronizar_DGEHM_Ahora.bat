@echo off
title Sincronizador de Precios de Competencia DGEHM
color 0A
echo ======================================================================
echo           SIPE ADMIN - SINCRONIZADOR DE PRECIOS DGEHM
echo ======================================================================
echo.
echo Conectando al portal oficial DGEHM y actualizando base de datos...
echo.
cd /d "C:\Proyectos IA\OFICINA SIPE\backend"
node sync-dgehm-direct.js
echo.
echo ======================================================================
echo Proceso finalizado. Puedes cerrar esta ventana o presionar una tecla.
echo ======================================================================
pause

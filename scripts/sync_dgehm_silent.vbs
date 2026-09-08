' ============================================================
' Ejecutor Silencioso para Tarea Programada Windows
' Ejecuta el batch sin mostrar ventana de consola
' ============================================================
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "C:\Proyectos IA\OFICINA SIPE\scripts\sync_dgehm_daily.bat" & chr(34), 0, True
Set WshShell = Nothing

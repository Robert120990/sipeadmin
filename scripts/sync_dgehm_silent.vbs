' ============================================================
' Ejecutor Silencioso para Tarea Programada Windows
' Ejecuta el batch sin mostrar ventana de consola
' ============================================================
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & scriptDir & "\sync_dgehm_daily.bat" & chr(34), 0, True
Set WshShell = Nothing
Set fso = Nothing

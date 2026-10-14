@echo off
setlocal
cd /d "%~dp0"
"backend\.venv\Scripts\python.exe" "scripts\local_service.py" status
exit /b %errorlevel%

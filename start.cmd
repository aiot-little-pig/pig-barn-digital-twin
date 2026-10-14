@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" (
  echo Python environment missing. Follow RUNBOOK.md first.
  exit /b 1
)
"backend\.venv\Scripts\python.exe" "scripts\local_service.py" run %*
exit /b %errorlevel%

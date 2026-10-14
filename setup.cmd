@echo off
setlocal
cd /d "%~dp0"
py -3.12 --version >nul 2>&1
if errorlevel 1 (
  echo Python 3.12 is required. Install Python and reopen the terminal.
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==22)process.exit(1)" >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 is required to build the GitHub source checkout.
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" (
  py -3.12 -m venv backend\.venv
  if errorlevel 1 exit /b 1
)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
if errorlevel 1 exit /b 1
call npm.cmd ci
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
echo Setup complete. Run .\start.cmd

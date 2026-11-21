@echo off
REM URBAN VISION AI - start the React dev server on http://127.0.0.1:5173
cd /d "%~dp0frontend"
if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install
)
call npm run dev
pause

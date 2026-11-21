@echo off
REM URBAN VISION AI - start the FastAPI backend on http://127.0.0.1:8000
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Backend virtual environment not found.
  echo Run: python -m venv .venv ^&^& .venv\Scripts\activate ^&^& pip install -r requirements.txt
  pause
  exit /b 1
)
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause

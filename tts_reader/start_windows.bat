@echo off
rem Double-click to start TTS Reader. The first run installs packages and downloads the voice model.
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv || (echo Python 3.9+ is required: https://www.python.org/downloads/ & pause & exit /b 1)
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt || (pause & exit /b 1)
)
.venv\Scripts\python app.py %*
pause
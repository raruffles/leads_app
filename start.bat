@echo off
title ANTIGRAVITY - B2B Lead Harvester
echo ========================================================
echo    ANTIGRAVITY - B2B Lead Harvester & Web Sales Engine
echo ========================================================
echo.
echo [No Computador] Acesse: http://localhost:8000
echo [No Celular]    Acesse: http://192.168.1.68:8000
echo.
echo (Certifique-se de que o celular esta no mesmo Wi-Fi!)
echo ========================================================
echo.

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
) else (
    uv run uvicorn app:app --host 0.0.0.0 --port 8000 --reload
)

pause

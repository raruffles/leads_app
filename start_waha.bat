@echo off
title WAHA - WhatsApp HTTP API Server
echo ========================================================
echo       INICIANDO SERVIDOR WAHA (devlikeapro/waha)
echo ========================================================
echo.
echo Verificando Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] O Docker Desktop ainda nao esta respondendo.
    echo Certifique-se de que o aplicativo Docker Desktop esta aberto na barra de tarefas.
    echo.
    echo Tentando abrir Docker Desktop automaticamente...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Aguarde 15 segundos enquanto a engine carrega...
    timeout /t 15 /nobreak >nul
)

echo.
echo Subindo container do WAHA com persistencia de sessao...
docker compose up -d
if %errorlevel% neq 0 (
    echo Tentando via comando direto docker run...
    docker run -d --name waha -p 3000:3000/tcp -v "%~dp0waha-sessions:/app/.sessions" --restart unless-stopped devlikeapro/waha
)

echo.
echo ========================================================
echo WAHA ativo! Acesse o CRM no navegador:
echo   http://localhost:8000
echo.
echo O CRM se comunicara via PROXY com o WAHA na porta 3000.
echo ========================================================
echo.
pause

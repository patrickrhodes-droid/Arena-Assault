@echo off
title Node Server - Port 3001

:: Navigate to the script's directory (ensures node finds server.js)
cd /d "%~dp0"

:: 1. Start the Node server in a new window
echo Launching server.js...
start "Node Server" cmd /c "node server.js"

:: 2. Wait 3 seconds for the port to bind
echo Waiting for server to initialize...
timeout /t 3 /nobreak > nul

:: 3. Open the browser to your specific port
echo Opening http://localhost:3001...
start "" "http://localhost:3001"

exit
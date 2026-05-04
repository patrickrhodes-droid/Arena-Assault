@echo off
title Map Editor Server - Port 3002

:: Navigate to the script's directory (ensures npm finds package.json)
cd /d "%~dp0"

:: 1. Start the map editor server in a new window
echo Launching map-editor-server.js...
start "Map Editor Server" cmd /c "npm run editor"

:: 2. Wait 3 seconds for the port to bind
echo Waiting for server to initialize...
timeout /t 3 /nobreak > nul

:: 3. Open the browser to your specific port
echo Opening http://localhost:3002...
start "" "http://localhost:3002"

exit

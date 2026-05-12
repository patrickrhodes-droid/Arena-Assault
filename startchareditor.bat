@echo off
title Character & Gun Editor - Port 3002

:: Navigate to the script's directory (ensures npm finds package.json)
cd /d "%~dp0"

:: 1. Start the editor server in a new window (shared with map editor)
echo Launching editor server...
start "Editor Server" cmd /c "npm run editor"

:: 2. Wait 3 seconds for the port to bind
echo Waiting for server to initialize...
timeout /t 3 /nobreak > nul

:: 3. Open the character editor in the browser
echo Opening http://localhost:3002/editor/character.html...
start "" "http://localhost:3002/editor/character.html"

exit

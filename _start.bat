@echo off
rem Ashwing VIP - start the booking server locally (Windows)
taskkill /F /IM node.exe >nul 2>&1
cd /d "%~dp0"
start "Ashwing VIP Server" cmd /k "node server.js"

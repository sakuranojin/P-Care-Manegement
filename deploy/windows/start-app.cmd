@echo off
rem Runs the P-CARE-MANAGEMENT Node server (started at boot by the scheduled task).
cd /d "%~dp0..\.."
set NODE_ENV=production
set PORT=3000
set PUBLIC_URL=https://p-care-management.103-179-45-80.sslip.io
:loop
if not exist data mkdir data
"C:\Program Files\nodejs\node.exe" dist\api\server\src\index.js >> data\server.log 2>&1
rem Restart automatically if the process exits.
timeout /t 5 /nobreak > nul
goto loop

@echo off
rem VerifyLens demo for Windows: double-click to build the sample report and open the concept demo.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies once...
  call npm install
)
node src\cli.ts demo --open
if errorlevel 1 (
  echo.
  echo Demo failed. Node.js 22.18 or newer is required.
  pause
  exit /b 1
)

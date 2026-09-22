@echo off
cd /d "C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app"
echo === Login endpoint test ===
echo Started: %TIME%
node test-login.mjs
echo Exit code: %ERRORLEVEL%
echo.
echo === Results file ===
type "C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app\test-login-results.json" 2>nul || echo NO RESULTS FILE
echo.
echo === Server log tail ===
powershell -NoProfile -Command "Get-Content 'C:\Users\ADMIN\AppData\Local\Temp\yto-web-server.log' -Tail 20 -ErrorAction SilentlyContinue"

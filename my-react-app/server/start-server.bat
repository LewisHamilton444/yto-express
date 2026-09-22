@echo off
cd /d "C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app\server"
echo Starting YTO Web Backend Server...
echo.
echo Server log: %TEMP%\yto-web-server.log
echo.

node Server.js

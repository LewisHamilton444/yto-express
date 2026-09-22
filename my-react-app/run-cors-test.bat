@echo off
echo ============================================================
echo  CORS preflight test (OPTIONS request)
echo  Target: https://yto-express-backend.onrender.com/api/accounts/login
echo ============================================================
echo.

curl.exe -sS -m 20 -X OPTIONS ^
  -H "Origin: https://yto-express.onrender.com" ^
  -H "Access-Control-Request-Method: POST" ^
  -H "Access-Control-Request-Headers: Content-Type, Authorization" ^
  -H "Accept: application/json" ^
  -i ^
  https://yto-express-backend.onrender.com/api/accounts/login

echo.
echo Exit code: %ERRORLEVEL%

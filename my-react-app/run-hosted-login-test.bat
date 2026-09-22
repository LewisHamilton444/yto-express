@echo off
cd /d "C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app"
echo.
echo ============================================================
echo  Hosted backend login test
echo  Target: https://yto-express-backend.onrender.com/api/accounts/login
echo  Account: staff@ytoexpress.com
echo ============================================================
echo.

curl.exe -sS -m 40 -X POST https://yto-express-backend.onrender.com/api/accounts/login ^
  -H "Content-Type: application/json" ^
  -H "Origin: http://localhost:5173" ^
  -d "{\"email\":\"staff@ytoexpress.com\",\"password\":\"e7bnbvcjQm8p\"}" ^
  -o "%TEMP%\login-hosted-response.txt" ^
  -w "http_code=%{http_code}\ntime_total=%{time_total}s\ntime_connect=%{time_connect}s\ntime_starttransfer=%{time_starttransfer}s\nsize_output=%{size_output} bytes\n"

echo.
echo Exit code: %ERRORLEVEL%
echo.
echo ---------- Response headers + body ----------
type "%TEMP%\login-hosted-response.txt"
echo.
echo ---------- end ----------

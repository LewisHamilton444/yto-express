@echo off
echo ============================================================
echo  Serve YTO Web App against hosted backend
echo  Frontend: http://localhost:5173
echo  API root: https://yto-express-backend.onrender.com
echo  (Ctrl+C to stop)
echo ============================================================
cd /d "C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app"
set VITE_API_URL=https://yto-express-backend.onrender.com
node node_modules\vite\bin\vite.js dev --port 5173 --host

# Siikkoo-Mandoo Students Association · MWU Digital Portal (v7.3)

## What's New in v7.3
- **Port Binding Fix**: Fixed Render port scan timeout issue by ensuring `app.listen` immediately binds to `process.env.PORT || 3000` before background DB connection pool initialization finishes.
- **Vibrant Purple-Pink Polka-Dot Portal Theme & 3D Hub**: All v7.2 features preserved (Election ON/OFF toggle, Close Election, Full Leadership Info, Required Block/Room registration, ID download options).

## Deployment (Render)
1. Upload all files to your GitHub repository (`main` branch).
2. Connect to Render (Node 20 Web Service).
3. Ensure `DATABASE_URL` is set in Render Environment Variables.
4. Build Command: `npm install` | Start Command: `npm start`.

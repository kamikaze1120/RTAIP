# RTAIP Frontend Deployment Artifacts

This document captures the frontend deployment configuration and operational notes. Use it as the single source of truth for the UI deployment. Do not include backend changes here.

- Environment Variables (Frontend)
  - REACT_APP_API_URL: https://rtaip-production.up.railway.app
  - REACT_APP_SUPABASE_URL: https://YOUR_PROJECT.supabase.co
  - REACT_APP_SUPABASE_ANON_KEY: YOUR_SUPABASE_ANON_KEY
  - REACT_APP_ALERT_EMAIL: alerts@example.com (optional)
  - Notes:
    - These variables are read at build-time by Create React App.
    - Set these in Vercel Project Settings under “Environment Variables” for Production.
    - Do not commit secrets or real keys to the repository; use the provided .env.example as a template.

- Vercel Project Settings (Frontend)
  - Root Directory: frontend
  - Framework Preset: Create React App
  - Install Command: npm install
  - Build Command: npm run build
  - Output Directory: build

- Validation Checklist (UI)
  - After each deploy, open the Vercel deployment URL and verify:
    - Footer shows API: https://rtaip-production.up.railway.app
    - “Backend: Online” indicator turns green.
    - Events and anomalies populate; Map and Replay work.
    - Network requests (DevTools) succeed for /health, /events, /anomalies.

- Operational Notes
  - Environment changes require a redeploy to take effect.
  - For preview branches, ensure the API base is correct; otherwise the health badge may show Offline.
  - Keep .env out of source control; use .env.example.
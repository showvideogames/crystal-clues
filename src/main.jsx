import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthCallback from './account/AuthCallback.jsx'

// /auth/callback is the only page that turns a sign-in code into a session.
// Everything else is the game. No router: Vercel serves index.html for every
// path (vercel.json), and this switch picks the page.
const isAuthCallback = window.location.pathname.replace(/\/+$/, '') === '/auth/callback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAuthCallback ? <AuthCallback /> : <App />}
  </StrictMode>,
)

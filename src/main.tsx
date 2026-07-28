import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import { applyAppearance, readStoredAppearance, watchSystemMode } from './lib/appearance'
import './styles/theme.css'

// Before the first paint, not in an effect. The settings row hasn't loaded
// yet — the mirror in localStorage is what stands in for it, and the real
// values overwrite these attributes a few hundred milliseconds later without
// anything moving, because they almost always agree.
applyAppearance(readStoredAppearance())
watchSystemMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

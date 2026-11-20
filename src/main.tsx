import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-naskh-arabic'
import './index.css'
import { applyTheme } from './theme'
import './pwa/install'
import { recoverOnce } from './pwa/recover'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppProvider, useApp } from './app/AppContext'
import { ToastProvider } from './components/Toast'
import { TooltipProvider } from './components/ui/tooltip'
import { SyncProvider, useSync } from './sync/SyncProvider'
import { SignIn } from './pages/SignIn'
import { DeviceOwner } from './pages/DeviceOwner'

function Gate() {
  const { configured, loading, session, device } = useSync()
  if (configured && loading) return null
  if (configured && !session) return <SignIn />
  // Signed in, but whose data is on this phone is not known yet, or it is another account's.
  if (configured && device.state === 'checking') return null
  if (configured && device.state === 'foreign') return <DeviceOwner projects={device.projects} pending={device.pending} />
  return <App />
}

function Providers() {
  // Toast labels and direction follow the current language.
  const { t, lang } = useApp()
  return (
    <ToastProvider dismissLabel={t('common.close')} rtl={lang === 'ur'}>
      <TooltipProvider>
        <SyncProvider>
          <Gate />
        </SyncProvider>
      </TooltipProvider>
    </ToastProvider>
  )
}

applyTheme()

// A screen file that no longer exists (new version published): reload the current version once.
window.addEventListener('vite:preloadError', (e) => {
  if (recoverOnce()) e.preventDefault()
})

// Register the service worker from the very first visit (also on the sign-in screen), so the app is
// installable and works offline right away. Updates are offered later by the shell.
if (import.meta.env.PROD) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Providers />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)

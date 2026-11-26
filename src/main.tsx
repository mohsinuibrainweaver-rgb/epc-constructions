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
import { ToastProvider, useToast } from './components/Toast'
import { TooltipProvider } from './components/ui/tooltip'
import { SyncProvider, useSync } from './sync/SyncProvider'
import { SignIn } from './pages/SignIn'
import { onAccessRevoked } from './sync/engine'
import { useEffect } from 'react'

function AccessRevokedNotice() {
  const { t } = useApp()
  const toast = useToast()
  useEffect(
    () => onAccessRevoked(({ projectName }) => toast.show({
      kind: 'warning',
      message: t('access.removed', { project: projectName }),
      duration: 10_000,
    })),
    [t, toast],
  )
  return null
}

function Gate() {
  const { configured, loading, session, device } = useSync()
  if (configured && loading) return null
  if (configured && !session) return <SignIn />
  // Signed in, but the local account cache is still being checked/prepared.
  if (configured && device.state === 'checking') return null
  return <App />
}

function Providers() {
  // Toast labels and direction follow the current language.
  const { t, lang } = useApp()
  return (
    <ToastProvider dismissLabel={t('common.close')} rtl={lang === 'ur'}>
      <TooltipProvider>
        <SyncProvider>
          <AccessRevokedNotice />
          <Gate />
        </SyncProvider>
      </TooltipProvider>
    </ToastProvider>
  )
}

applyTheme()

// A screen file that no longer exists (new version published): reload the current version 
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

import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './shell/Shell'
import { Welcome } from './pages/Welcome'
import { Home } from './pages/Home'
import { useApp } from './app/AppContext'
import { Button } from './components/ui/button'
import { isChunkError, recoverOnce, reloadFresh } from './pwa/recover'

// Screens other than Home load on demand, which keeps the first load small on a phone.
const ProjectForm = lazy(() => import('./pages/ProjectForm').then((m) => ({ default: m.ProjectForm })))
const JoinProject = lazy(() => import('./pages/JoinProject').then((m) => ({ default: m.JoinProject })))
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })))
const Phases = lazy(() => import('./pages/Phases').then((m) => ({ default: m.Phases })))
const PhaseDetail = lazy(() => import('./pages/Phases').then((m) => ({ default: m.PhaseDetail })))
const Vendors = lazy(() => import('./pages/Vendors').then((m) => ({ default: m.Vendors })))
const VendorDetail = lazy(() => import('./pages/Vendors').then((m) => ({ default: m.VendorDetail })))
const Ledger = lazy(() => import('./pages/Ledger').then((m) => ({ default: m.Ledger })))
const AddPayment = lazy(() => import('./pages/AddPayment').then((m) => ({ default: m.AddPayment })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Compare = lazy(() => import('./pages/Compare').then((m) => ({ default: m.Compare })))
const Forecast = lazy(() => import('./pages/Forecast').then((m) => ({ default: m.Forecast })))
const Plans = lazy(() => import('./pages/Plans').then((m) => ({ default: m.Plans })))
const Settlement = lazy(() => import('./pages/Settlement').then((m) => ({ default: m.Settlement })))
const Files = lazy(() => import('./pages/Files').then((m) => ({ default: m.Files })))
const Contracts = lazy(() => import('./pages/Contracts').then((m) => ({ default: m.Contracts })))
const ContractDetail = lazy(() => import('./pages/Contracts').then((m) => ({ default: m.ContractDetail })))
const Statements = lazy(() => import('./pages/Statements').then((m) => ({ default: m.Statements })))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsPages').then((m) => ({ default: m.SettingsLayout })))
const SettingsIndex = lazy(() => import('./pages/settings/SettingsPages').then((m) => ({ default: m.SettingsIndex })))
const SettingsSectionPage = lazy(() => import('./pages/settings/SettingsPages').then((m) => ({ default: m.SettingsSectionPage })))
const More = lazy(() => import('./pages/Misc').then((m) => ({ default: m.More })))
const NotFound = lazy(() => import('./pages/Misc').then((m) => ({ default: m.NotFound })))

function Loading() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
      <div aria-hidden="true" className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}

function ErrorScreen({ error }: { error: Error }) {
  const { t } = useApp()
  return (
    <main className="grid min-h-[calc(100dvh-2*var(--page-gap))] place-items-center px-4">
      <div role="alert" className="grid max-w-md gap-4 text-center">
        <h1 className="text-2xl font-semibold">{t('err.generic')}</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button className="mx-auto" onClick={() => void reloadFresh()}>
          {t('pwa.reload')}
        </Button>
      </div>
    </main>
  )
}

/** Catches a screen that failed to load (usually right after a new version was published) and recovers. */
class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (isChunkError(error)) recoverOnce()
  }
  render() {
    return this.state.error ? <ErrorScreen error={this.state.error} /> : this.props.children
  }
}

export default function App() {
  return (
    <Boundary>
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/projects/new" element={<ProjectForm />} />
        <Route path="/join" element={<JoinProject />} />
        <Route path="/projects/:id/edit" element={<ProjectForm />} />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="projects" element={<Projects />} />
          <Route path="phases" element={<Phases />} />
          <Route path="phases/:id" element={<PhaseDetail />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="vendors/:id" element={<VendorDetail />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="add" element={<AddPayment />} />
          <Route path="payments/:id" element={<AddPayment />} />
          <Route path="reports" element={<Reports />} />
          <Route path="compare" element={<Compare />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="plans" element={<Plans />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="contracts/:id" element={<ContractDetail />} />
          <Route path="statements" element={<Statements />} />
          <Route path="materials" element={<Navigate to="/reports" replace />} />
          <Route path="files" element={<Files />} />
          <Route path="more" element={<More />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsIndex />} />
            <Route path=":section" element={<SettingsSectionPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
    </Boundary>
  )
}

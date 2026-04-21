import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar, NAV } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { CmdK } from './components/CmdK'
import { TweaksPanel, TweaksButton } from './components/TweaksPanel'
import { useT } from './i18n'

// Route-level code-split. DirectionD is the landing page and carries
// Leaflet + CartoDB tile deps — lazy-loading drops initial JS to
// the shell + sidebar + topbar until the user actually navigates.
const DirectionD = lazy(() => import('./variants/DirectionD'))
const Quejas = lazy(() => import('./pages/Quejas'))
const QuejasDashboard = lazy(() => import('./pages/QuejasDashboard'))
const QuejaDetail = lazy(() => import('./pages/QuejaDetail'))
const Cargos = lazy(() => import('./pages/Cargos'))
const Presupuesto = lazy(() => import('./pages/Presupuesto'))
const Plenos = lazy(() => import('./pages/Plenos'))
const Datos = lazy(() => import('./pages/Datos'))
const Promesas = lazy(() => import('./pages/Promesas'))
const Departamentos = lazy(() => import('./pages/Departamentos'))
const DepartamentoDetalle = lazy(() => import('./pages/DepartamentoDetalle'))
const Metodologia = lazy(() => import('./pages/Metodologia'))
const AvisoLegal = lazy(() => import('./pages/AvisoLegal'))
const Cambios = lazy(() => import('./pages/Cambios'))

const DEFAULT_TWEAKS = { dark: false, density: 'comfortable' }

function loadTweaks() {
  try {
    const raw = localStorage.getItem('cp:tweaks')
    if (raw) return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_TWEAKS
}

function Loading() {
  const t = useT()
  return (
    <div style={{ padding: '40px 24px', color: 'var(--ink50)', fontSize: 13 }}>
      {t('common.loading')}
    </div>
  )
}

function InnerShell({ onOpenCmdK }) {
  const location = useLocation()
  const t = useT()
  const active = NAV.find((n) => location.pathname.startsWith(n.to))
  const crumb = active ? t(active.labelKey) : 'CivicPulse'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="cp-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumb={crumb} onOpenCmdK={onOpenCmdK} onOpenSidebar={() => setSidebarOpen(true)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/cargos" element={<Cargos />} />
              <Route path="/presupuesto" element={<Presupuesto />} />
              <Route path="/plenos" element={<Plenos />} />
              <Route path="/datos" element={<Datos />} />
              <Route path="/promesas" element={<Promesas />} />
              <Route path="/departamentos" element={<Departamentos />} />
              <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
              <Route path="/quejas" element={<Quejas />} />
              <Route path="/quejas/dashboard" element={<QuejasDashboard />} />
              <Route path="/quejas/:id" element={<QuejaDetail />} />
              <Route path="/cambios" element={<Cambios />} />
              <Route path="/metodologia" element={<Metodologia />} />
              <Route path="/aviso-legal" element={<AvisoLegal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [tweaks, setTweaks] = useState(loadTweaks)
  const [cmdK, setCmdK] = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const location = useLocation()

  const onLanding = location.pathname === '/'

  useEffect(() => {
    const darkActive = tweaks.dark && !onLanding
    document.documentElement.classList.toggle('dark', darkActive)
    return () => document.documentElement.classList.remove('dark')
  }, [tweaks.dark, onLanding])

  useEffect(() => {
    const size = !onLanding
      ? tweaks.density === 'compact'
        ? '13.5px'
        : tweaks.density === 'spacious'
          ? '15px'
          : '14px'
      : '14px'
    document.documentElement.style.fontSize = size
  }, [tweaks.density, onLanding])

  useEffect(() => {
    try {
      localStorage.setItem('cp:tweaks', JSON.stringify(tweaks))
    } catch {
      // ignore
    }
  }, [tweaks])

  const updateTweaks = (patch) => setTweaks((prev) => ({ ...prev, ...patch }))

  if (onLanding) {
    return (
      <Suspense fallback={<Loading />}>
        <DirectionD />
      </Suspense>
    )
  }

  return (
    <>
      <InnerShell onOpenCmdK={() => setCmdK(true)} />
      {!tweaksOpen && <TweaksButton onOpen={() => setTweaksOpen(true)} />}
      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        state={tweaks}
        onChange={updateTweaks}
      />
      <CmdK open={cmdK} onOpen={() => setCmdK(true)} onClose={() => setCmdK(false)} />
    </>
  )
}

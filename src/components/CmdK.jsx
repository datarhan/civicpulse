import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ic } from './Icons'
import { Pill } from './Primitives'
import { NAV } from './Sidebar'
import { useOfficials } from '../hooks/useOfficials'
import { usePromises } from '../hooks/usePromises'
import { useQuejas, CATEGORY_LABEL, STATE_LABEL } from '../hooks/useQuejas'
import { usePlenoFindings } from '../hooks/usePlenoFindings'

/**
 * El buscador rápido, partido en dos a propósito.
 *
 * `CmdK` es la cáscara: escucha el atajo y se acuerda de quién lo abrió. Los
 * cuatro hooks de datos viven en `PanelCmdK`, que sólo se monta abierto.
 *
 * Antes estaban los cuatro en el cuerpo de `CmdK`, y los hooks corren aunque el
 * componente devuelva null: con el panel cerrado ya se habían descargado
 * officials, promises, quejas y `pleno-findings.json` —274 KB—. Mientras el
 * buscador sólo vivía dentro del shell eso era una factura repartida entre
 * páginas; montarlo también en la portada la habría puesto en la PRIMERA
 * pantalla del sitio, que es exactamente lo que no se quería.
 */
export function CmdK({ open, onClose, onOpen }) {
  const abridor = useRef(null)
  const abiertoAntes = useRef(false)

  // Se apunta EN EL RENDER, no en un efecto. El input del panel lleva autoFocus,
  // así que cuando un efecto de esta cáscara corre el foco ya se lo ha llevado
  // él: el efecto guardaba el propio input y al cerrar lo devolvía a un nodo
  // desmontado, o sea al body. En el render del paso de cerrado a abierto el
  // foco todavía está donde estaba.
  if (open && !abiertoAntes.current) abridor.current = document.activeElement
  abiertoAntes.current = open

  useEffect(() => {
    const onK = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) onClose()
        else onOpen()
      }
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onK)
    return () => window.removeEventListener('keydown', onK)
  }, [open, onClose, onOpen])

  // Al cerrar, el foco vuelve a quien lo abrió. Si ese nodo ya no está en la
  // página —una navegación cerró el panel—, no se toca nada: el navegador deja
  // el foco donde la nueva vista lo ponga.
  useEffect(() => {
    if (open) return
    const previo = abridor.current
    if (previo instanceof HTMLElement && document.contains(previo)) previo.focus()
  }, [open])

  if (!open) return null
  return <PanelCmdK onClose={onClose} />
}

function PanelCmdK({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const trapRef = useRef(null)
  const { data: officials } = useOfficials()
  const { data: promises } = usePromises()
  const { data: quejas } = useQuejas()
  const { data: findings } = usePlenoFindings()

  // The index only changes when a snapshot loads — not on every keystroke.
  const all = useMemo(
    () => [
      ...NAV.map((n) => ({ kind: 'Página', label: n.label, to: n.to, icon: n.icon })),
      ...(officials?.officials ?? []).map((o) => ({
        kind: o.role === 'alcalde' ? 'Alcalde' : 'Concejal·a',
        label: o.name,
        sub: (o.party || '') + (o.portfolios?.length ? ' · ' + o.portfolios[0] : ''),
        to: '/cargos',
        icon: Ic.people,
      })),
      // Who left during the mandate is still findable — as history, labelled
      // as such, and landing on their own record rather than the grid.
      ...(officials?.formerOfficials ?? []).map((o) => ({
        kind: 'Excargo',
        label: o.name,
        sub: `${o.party || ''} · hasta ${o.until}`,
        to: `/cargos/${o.slug}`,
        icon: Ic.people,
      })),
      ...(promises?.items ?? []).slice(0, 10).map((p) => ({
        kind: 'Promesa',
        label: p.title,
        sub: p.party,
        to: '/promesas',
        icon: Ic.check,
      })),
      ...(quejas?.items ?? []).slice(0, 40).map((qu) => ({
        kind: 'Queja',
        label: `${qu.service_request_id} · ${(qu.description || '').slice(0, 80)}`,
        sub:
          (CATEGORY_LABEL[qu.service_code] || qu.service_code) +
          ' · ' +
          (STATE_LABEL[qu.status] || qu.status) +
          (qu.concejalia_area ? ' · ' + qu.concejalia_area : ''),
        to: `/quejas/${qu.service_request_id.toLowerCase()}`,
        icon: Ic.warn,
      })),
      ...(findings?.items ?? []).map((f) => ({
        kind: 'Hallazgo',
        label: f.title,
        sub:
          (f.severity ? f.severity + ' · ' : '') +
          f.plenoDate +
          (f.quotes?.[0]?.speakerGroup ? ' · ' + f.quotes[0].speakerGroup : '') +
          ' · ' +
          (f.quotes?.[0]?.text?.slice(0, 80) ?? ''),
        to: `/hallazgos#${f.id}`,
        icon: Ic.warn,
      })),
      { kind: 'Datos', label: 'Dashboard de quejas', to: '/quejas/dashboard', icon: Ic.chart },
      { kind: 'Datos', label: 'Ver catálogo de datos abiertos', to: '/datos', icon: Ic.chart },
      { kind: 'Datos', label: 'Metodología del tracker', to: '/metodologia', icon: Ic.chart },
    ],
    [officials, promises, quejas, findings],
  )
  const filtered = useMemo(
    () =>
      q
        ? all.filter((x) => (x.label + ' ' + (x.sub || '')).toLowerCase().includes(q.toLowerCase()))
        : all,
    [all, q],
  )

  const go = (to) => {
    if (to) navigate(to)
    onClose()
  }

  // Keep Tab/Shift+Tab cycling inside the dialog — screen-reader and
  // keyboard users must not land on the page behind the backdrop.
  const onTrapKeyDown = (e) => {
    if (e.key !== 'Tab' || !trapRef.current) return
    const focusables = trapRef.current.querySelectorAll('input, button')
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,15,25,.40)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'grid',
        placeItems: 'start center',
        paddingTop: '12vh',
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscador rápido"
        className="cp-spring-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onTrapKeyDown}
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--paper)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          boxShadow: '0 24px 64px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border2)',
          }}
        >
          <Ic.search width={16} height={16} style={{ color: 'var(--ink50)' }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Saltar a…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: 'var(--fs-body)',
              fontFamily: 'inherit',
            }}
          />
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            esc
          </span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 6px 10px' }}>
          {filtered.slice(0, 12).map((x, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(x.to)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 10px',
                borderRadius: 'var(--r-input)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <x.icon width={16} height={16} style={{ color: 'var(--ink50)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--fs-aux)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {x.label}
                </div>
                {x.sub && (
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>{x.sub}</div>
                )}
              </div>
              <Pill tone="ghost" size="xs">
                {x.kind}
              </Pill>
            </button>
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--ink50)',
                fontSize: 'var(--fs-aux)',
              }}
            >
              Sin resultados para "{q}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExtLink } from './Primitives'
import { useSpainTicker, signArrow } from '../hooks/useSpainTicker'
import { usePress, timeAgo as pressTimeAgo } from '../hooks/usePress'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePromises, isPromiseFrozen } from '../hooks/usePromises'
import { readableInk } from '../lib/contrast'
import { rotuloPlazosVencidos } from '../lib/plazos-vencidos'
import { useT } from '../i18n'

/* ============================================================
   Bloomberg-style auto-scrolling data ticker.
   Overlays the top-center of the map with a semi-transparent
   dark strip that streams Spain-wide government data points
   affecting local citizens (electricity, fuel, Euribor, IPC,
   BCE rate, AEMET warnings, DGT traffic) interleaved with
   scraped press headlines.
   ============================================================ */

const SANS = "'Outfit', system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, monospace"
// La banda del ticker es TRANSLÚCIDA —rgba(14,20,34,.82)— sobre un mapa que se
// mueve, así que su contraste no es determinable: lo que pase por debajo cambia
// el resultado. Medido contra el peor caso (la banda sobre el papel cálido del
// aterrizaje), tres de estos seis suspendían el suelo de 4,5:
//
//   INK_DIM  a α.62 daba 4,50 sobre papel y 4,48 sobre el mapa — es decir, caía
//            a un lado o a otro según lo que hubiera detrás. Sube a α.70 (5,26)
//            para tener margen sobre cualquier fondo, no para aprobar por poco.
//   CRIT     #F87171 daba 3,93. Pasa a #FCA5A5 (5,73).
//   CIVIC    #60A5FA daba 4,28 — y además no es de la paleta: es uno de los
//            acentos que se retiraron de og.svg por eso mismo, y el mismo azul
//            que llevaba el anillo de foco antes de §11. Pasa a la familia
//            petróleo. El petróleo de tema oscuro (#4FB3BD) se queda en 4,41,
//            así que se usa el claro de esa familia: #7ED4DC (6,39).
const INK = '#E2E8F0'
const INK_DIM = 'rgba(226,232,240,.70)'
const OK = '#4ADE80'
const WARN = '#FBBF24'
const CRIT = '#FCA5A5'
const CIVIC = '#7ED4DC'

const AEMET_COLORS = {
  amarillo: '#F5B544',
  naranja: '#F97316',
  rojo: '#DC2626',
}

function toneColor(tone) {
  if (tone === 'ok') return OK
  if (tone === 'warn') return WARN
  if (tone === 'crit') return CRIT
  if (tone === 'civic') return CIVIC
  return INK_DIM
}

// Citizen-benefit tone: rising price / rate / warning → bad for citizens.
function signedTone(delta, inverse = false) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return 'neutral'
  const rising = delta > 0
  if (inverse) return rising ? 'ok' : 'warn'
  return rising ? (Math.abs(delta) > 3 ? 'crit' : 'warn') : 'ok'
}

function Chip({ icon, label, value, delta, deltaTone, extra, onClick, accent, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="cp-ticker-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        height: 22,
        background: 'transparent',
        border: 'none',
        color: INK,
        fontFamily: SANS,
        cursor: 'pointer',
        fontSize: 'var(--fs-meta)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {icon && (
        <span style={{ fontSize: 'var(--fs-aux)', lineHeight: 1 }} aria-hidden="true">
          {icon}
        </span>
      )}
      {label && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: INK_DIM,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      )}
      <span
        style={{
          fontFamily: MONO,
          fontSize: 'var(--fs-meta)',
          fontWeight: 700,
          letterSpacing: '-.01em',
          // Un acento es un color AJENO —los niveles de aviso de AEMET— y no se
          // puede retocar sin falsear el aviso. Pero como color de TEXTO sobre
          // esta banda oscura el naranja daba 3,86:1. Se conserva el color y se
          // cambia lo que va encima, que es justo para lo que existe
          // `readableInk` en src/lib/contrast.js: nació con las chapas de
          // Metrovalencia, que es el mismo problema — una marca que no es
          // nuestra y que no se puede recolorear.
          ...(accent
            ? {
                background: accent,
                color: readableInk(accent),
                padding: '1px 6px',
                borderRadius: 'var(--r-input)',
              }
            : { color: INK }),
        }}
      >
        {value}
      </span>
      {delta && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            fontWeight: 700,
            color: toneColor(deltaTone),
          }}
        >
          {delta}
        </span>
      )}
      {extra && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: INK_DIM,
          }}
        >
          {extra}
        </span>
      )}
    </button>
  )
}

function Divider() {
  return (
    <span
      style={{
        width: 1,
        height: 14,
        background: 'rgba(255,255,255,.16)',
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  )
}

function Sparkline24({ values, width = 180, height = 36, color = CIVIC }) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (nums.length < 2) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = width / (nums.length - 1)
  const d = nums
    .map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / span) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" opacity="0.9" />
    </svg>
  )
}

/**
 * Build the flat list of ticker items from the ticker snapshot + press
 * headlines. Returns null when the snapshot isn't useful yet.
 */
function useTickerItems() {
  const t = useT()
  const { data } = useSpainTicker()
  const { data: press } = usePress()
  const { data: agendas } = usePlenoAgendas()
  const { data: promises } = usePromises()
  const frozen = isPromiseFrozen(promises)
  const plazosVencidos = frozen ? 0 : (agendas?.stats?.plazosVencidosCount ?? 0)
  return useMemo(() => {
    if (!data?.sources) return []
    const s = data.sources
    const items = []

    // Municipal accountability chip — always first when there are overdue
    // commitments. Suppressed during LOREG freeze (handled above).
    if (plazosVencidos > 0) {
      items.push({
        key: 'dept-vencidos',
        icon: '⚠',
        label: 'Riba-roja',
        value: `${plazosVencidos}`,
        extra: rotuloPlazosVencidos(plazosVencidos, t),
        accent: WARN,
        navTo: '/departamentos',
        ariaLabel: t('liveTicker.plazosVencidos.aria').replace('{n}', String(plazosVencidos)),
      })
    }

    if (s.luz?.ok && typeof s.luz.currentValue === 'number') {
      const delta = s.luz.deltaVsYesterdayPct
      items.push({
        key: 'luz',
        icon: '⚡',
        label: 'Luz PVPC',
        value: `${s.luz.currentValue.toFixed(3)} €/kWh`,
        delta:
          typeof delta === 'number' ? `${signArrow(delta)} ${Math.abs(delta).toFixed(1)}%` : null,
        deltaTone: signedTone(delta),
        source: s.luz,
        ariaLabel: `Precio de la luz ${s.luz.currentValue.toFixed(3)} euros por kilovatio hora`,
      })
    }

    if (s.gasolina?.ok) {
      if (typeof s.gasolina.gasolina95 === 'number') {
        items.push({
          key: 'g95',
          icon: '⛽',
          label: 'Gasolina 95',
          value: `${s.gasolina.gasolina95.toFixed(3)} €/L`,
          source: s.gasolina,
          extra: s.gasolina.stationCount ? `${s.gasolina.stationCount} est.` : null,
          ariaLabel: `Gasolina 95 promedio ${s.gasolina.gasolina95.toFixed(3)} euros por litro`,
        })
      }
      if (typeof s.gasolina.diesel === 'number') {
        items.push({
          key: 'diesel',
          icon: '⛽',
          label: 'Diésel A',
          value: `${s.gasolina.diesel.toFixed(3)} €/L`,
          source: s.gasolina,
          ariaLabel: `Diésel A promedio ${s.gasolina.diesel.toFixed(3)} euros por litro`,
        })
      }
    }

    if (s.euribor12m?.ok && typeof s.euribor12m.value === 'number') {
      const history = s.euribor12m.history || []
      const prev = history.length > 1 ? history[history.length - 2].value : null
      const delta = prev != null ? s.euribor12m.value - prev : null
      items.push({
        key: 'euribor',
        icon: '📈',
        label: 'Euribor 12m',
        value: `${s.euribor12m.value.toFixed(3)}%`,
        delta: delta != null ? `${signArrow(delta)} ${Math.abs(delta * 100).toFixed(0)}bps` : null,
        deltaTone: signedTone(delta),
        source: s.euribor12m,
        ariaLabel: `Euribor 12 meses ${s.euribor12m.value.toFixed(3)} por ciento`,
      })
    }

    if (s.ipc?.ok && typeof s.ipc.yoyChange === 'number') {
      items.push({
        key: 'ipc',
        icon: '🧾',
        label: 'IPC España',
        value: `${s.ipc.yoyChange.toFixed(1)}%`,
        extra: s.ipc.period,
        source: s.ipc,
        deltaTone: signedTone(s.ipc.yoyChange),
        ariaLabel: `IPC interanual España ${s.ipc.yoyChange.toFixed(1)} por ciento`,
      })
    }

    if (s.bceMRO?.ok && typeof s.bceMRO.value === 'number') {
      items.push({
        key: 'bce',
        icon: '🏛️',
        label: 'BCE MRO',
        value: `${s.bceMRO.value.toFixed(2)}%`,
        source: s.bceMRO,
        ariaLabel: `Tipo principal del BCE ${s.bceMRO.value.toFixed(2)} por ciento`,
      })
    }

    if (s.aemet?.ok && s.aemet.active) {
      items.push({
        key: 'aemet',
        icon: '⚠',
        label: 'AEMET Valencia',
        value: (s.aemet.highestLevel || '').toUpperCase(),
        accent: AEMET_COLORS[s.aemet.highestLevel] || WARN,
        source: s.aemet,
        ariaLabel: `Alerta meteorológica AEMET nivel ${s.aemet.highestLevel}`,
      })
    }

    if (s.dgt?.ok && s.dgt.incidents.length > 0) {
      const roads = Array.from(new Set(s.dgt.incidents.slice(0, 6).map((i) => i.road))).join(' · ')
      items.push({
        key: 'dgt',
        icon: '🚧',
        label: 'DGT tráfico',
        value: `${s.dgt.incidents.length} incid.`,
        extra: roads,
        source: s.dgt,
        ariaLabel: `${s.dgt.incidents.length} incidencias de tráfico en la zona`,
      })
    }

    // Interleave press headlines every 3rd position so the ticker feels like
    // a news channel; cap at 5 headlines so the loop stays short.
    const presses = (press?.items || []).slice(0, 5).map((p) => ({
      key: `press-${p.id}`,
      press: p,
    }))
    const woven = []
    let pi = 0
    items.forEach((it, idx) => {
      woven.push(it)
      if ((idx + 1) % 3 === 0 && pi < presses.length) {
        woven.push(presses[pi])
        pi++
      }
    })
    while (pi < presses.length) {
      woven.push(presses[pi])
      pi++
    }
    return woven
  }, [data, press, plazosVencidos, t])
}

function PressChip({ p, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cp-ticker-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        height: 22,
        background: 'transparent',
        border: 'none',
        color: INK,
        fontFamily: SANS,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      aria-label={`Noticia de ${p.source}: ${p.title}`}
    >
      <span style={{ fontSize: 'var(--fs-aux)' }} aria-hidden="true">
        📰
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 'var(--fs-micro)',
          // Era el mismo #F87171 escrito a mano, fuera de la constante y por
          // tanto fuera del arreglo: seguía a 3,91:1 sobre la banda.
          color: CRIT,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {p.source}
      </span>
      <span style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, color: INK }}>
        {p.title.length > 80 ? p.title.slice(0, 80) + '…' : p.title}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: INK_DIM }}>
        {pressTimeAgo(p.date)}
      </span>
    </button>
  )
}

function DetailPanel({ item, onClose }) {
  if (!item) return null
  const isPress = !!item.press
  const title = isPress ? item.press.source : item.label
  const subtitle = isPress ? item.press.title : item.value
  const sourceObj = item.source || {}
  const url = isPress ? item.press.link : sourceObj.sourceUrl
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        minWidth: 280,
        maxWidth: 360,
        background: 'rgba(14,20,34,.96)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.28)',
        borderRadius: 'var(--r-card)',
        boxShadow: '0 12px 32px rgba(0,0,0,.45)',
        padding: '14px 16px 12px',
        fontFamily: SANS,
        color: INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: INK_DIM,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {title}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            width: 22,
            height: 22,
            borderRadius: 'var(--r-input)',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            color: INK_DIM,
            cursor: 'pointer',
            fontSize: 'var(--fs-body)',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: 'var(--fs-body)',
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 10,
          color: INK,
          fontFamily: isPress ? "'Fraunces', Georgia, serif" : SANS,
        }}
      >
        {subtitle}
      </div>

      {!isPress && item.key === 'luz' && sourceObj.hourlyCurve && (
        <div
          style={{
            padding: '6px 0 4px',
            marginBottom: 8,
            borderBottom: '1px dashed rgba(255,255,255,.12)',
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 'var(--fs-micro)',
              color: INK_DIM,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Curva 24h · €/kWh
          </div>
          <Sparkline24 values={sourceObj.hourlyCurve} color={WARN} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: MONO,
              fontSize: 'var(--fs-micro)',
              color: INK_DIM,
              marginTop: 2,
            }}
          >
            <span>min {sourceObj.dayMin?.toFixed(3)}</span>
            <span>max {sourceObj.dayMax?.toFixed(3)}</span>
          </div>
        </div>
      )}

      {!isPress && item.key === 'dgt' && Array.isArray(sourceObj.incidents) && (
        <div
          style={{
            padding: '6px 0',
            marginBottom: 6,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {sourceObj.incidents.slice(0, 6).map((i, idx) => (
            <div
              key={idx}
              style={{
                padding: '4px 0',
                borderTop: idx === 0 ? 'none' : '1px dashed rgba(255,255,255,.1)',
                fontSize: 'var(--fs-micro)',
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  color: WARN,
                  marginRight: 6,
                }}
              >
                {i.road}
              </span>
              <span>{i.description}</span>
            </div>
          ))}
          {sourceObj.incidents.length > 6 && (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 'var(--fs-micro)',
                color: INK_DIM,
                marginTop: 4,
              }}
            >
              +{sourceObj.incidents.length - 6} más
            </div>
          )}
        </div>
      )}

      {!isPress &&
        item.key === 'ipc' &&
        Array.isArray(sourceObj.history) &&
        sourceObj.history.length > 1 && (
          <div
            style={{
              padding: '6px 0 4px',
              marginBottom: 6,
              borderBottom: '1px dashed rgba(255,255,255,.12)',
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 'var(--fs-micro)',
                color: INK_DIM,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              IPC últimos 12 meses · %
            </div>
            <Sparkline24 values={sourceObj.history.map((h) => h.value)} color={CIVIC} width={240} />
          </div>
        )}

      {url && (
        <ExtLink
          href={url}
          style={{
            display: 'inline-block',
            fontSize: 'var(--fs-micro)',
            color: CIVIC,
            textDecoration: 'none',
            fontFamily: MONO,
            letterSpacing: '.04em',
          }}
        >
          Fuente oficial →
        </ExtLink>
      )}
    </div>
  )
}

export default function LiveTicker() {
  const items = useTickerItems()
  const [expanded, setExpanded] = useState(null)
  const containerRef = useRef(null)
  const navigate = useNavigate()

  const handleChipClick = (it) => {
    if (it.navTo) {
      navigate(it.navTo)
    } else {
      setExpanded(it)
    }
  }

  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => e.key === 'Escape' && setExpanded(null)
    const onClick = (e) => {
      if (!e.target.closest('[data-live-ticker]')) setExpanded(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [expanded])

  if (!items || items.length === 0) return null

  // Double the list for seamless marquee loop.
  const loop = [...items, ...items]

  return (
    <div
      ref={containerRef}
      data-live-ticker
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 401,
        width: 'min(920px, calc(100% - 340px))',
        minWidth: 360,
        height: 36,
        fontFamily: SANS,
      }}
      aria-label="Datos nacionales en directo"
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 36,
          background: 'rgba(14,20,34,.82)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(96,165,250,.22)',
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
          boxShadow: '0 8px 22px rgba(0,0,0,.28)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px 0 14px',
            borderRight: '1px solid rgba(255,255,255,.16)',
            height: '100%',
            flexShrink: 0,
            background: 'linear-gradient(90deg, rgba(220,38,38,.3), transparent)',
          }}
          aria-hidden="true"
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#DC2626',
              animation: 'ribaPulse 1.4s infinite',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 'var(--fs-micro)',
              fontWeight: 800,
              color: '#FCA5A5',
              letterSpacing: '.14em',
            }}
          >
            DIRECTO
          </span>
        </span>
        {/* Clip the marquee to the area RIGHT of the DIRECTO pill. Without
            this wrapper the scrolling chips translate left into the pill's
            (semi-transparent) box and render over the "DIRECTO" label. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            className="cp-ticker-track"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              animation: 'cp-ticker-scroll 90s linear infinite',
              willChange: 'transform',
            }}
            aria-live="off"
          >
            {loop.map((it, idx) => {
              const isPress = !!it.press
              return (
                <span
                  key={`${it.key}-${idx}`}
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  {idx > 0 && <Divider />}
                  {isPress ? (
                    <PressChip p={it.press} onClick={() => setExpanded(it)} />
                  ) : (
                    <Chip
                      icon={it.icon}
                      label={it.label}
                      value={it.value}
                      delta={it.delta}
                      deltaTone={it.deltaTone}
                      extra={it.extra}
                      accent={it.accent}
                      ariaLabel={it.ariaLabel}
                      onClick={() => handleChipClick(it)}
                    />
                  )}
                </span>
              )
            })}
          </div>
        </div>
      </div>
      {expanded && <DetailPanel item={expanded} onClose={() => setExpanded(null)} />}
    </div>
  )
}

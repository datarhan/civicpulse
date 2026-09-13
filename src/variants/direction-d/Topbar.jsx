import { Ic } from '../../components/Icons'
import { PALETTE, SANS, MONO, fmtClock } from './tokens'
import { useT } from '../../i18n'
import { useAbrirBuscador } from '../../lib/buscador'
import { Vivo } from './Vivo'
function Header({ now }) {
  const t = useT()
  const abrirBuscador = useAbrirBuscador()
  return (
    // Fixed 54px row on desktop; below the breakpoint it wraps and grows
    // instead (see `.d-topbar` in DirectionD). Squeezed at 375 it used to force
    // the brand block into a three-line column AND push 476px of live chips
    // past the viewport — invisible while the shell was position:fixed and
    // clipping them, a document-wide horizontal scroll once it wasn't.
    <header
      className="d-topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        background: PALETTE.paper,
        borderBottom: '1px solid ' + PALETTE.hair,
        flexShrink: 0,
        fontFamily: SANS,
      }}
    >
      <div className="d-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="5" fill={PALETTE.civic} />
          <path
            d="M5 13 Q 7 13, 8 11 T 11 8 Q 12 7, 13 10 T 16 14 Q 17 15, 19 13"
            fill="none"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ fontWeight: 700, letterSpacing: '-.01em', fontSize: 'var(--fs-body)' }}>
          CivicPulse
        </div>
        <span style={{ color: PALETTE.ink40, fontSize: 'var(--fs-aux)' }}>·</span>
        {/* Dropped below 560px: the region is the least load-bearing crumb on a
            site about one municipality, and it is what makes the brand block
            too wide to fit beside the town name. */}
        <span
          className="d-region"
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: PALETTE.ink50,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
          }}
        >
          Comunitat Valenciana
        </span>
        <span className="d-region" style={{ color: PALETTE.ink40 }}>
          ›
        </span>
        <span style={{ fontSize: 'var(--fs-aux)', fontWeight: 600 }}>Riba-roja de Túria</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: 'white',
            background: PALETTE.accent,
            padding: '2px 6px',
            borderRadius: 'var(--r-input)',
            fontWeight: 700,
            letterSpacing: '.08em',
            marginLeft: 4,
          }}
        >
          MVP
        </span>
      </div>

      <Vivo />
      <div style={{ flex: 1 }} />

      {/* El buscador de la portada estaba pintado y muerto: sin `onClick`, y con
          `CmdK` sin montar en la rama de `/`, ni el botón ni el atajo abrían
          nada. Quien abre viene por contexto, porque `<DirectionD />` tiene que
          seguir sin atributos (route-graph-portada). Mismas clases y mismas
          cadenas que el buscador del shell: `cp-topbar-search` además lo deja
          fuera del papel al imprimir. */}
      <button
        type="button"
        className="cp-topbar-search"
        onClick={abrirBuscador}
        aria-label={t('topbar.search.aria')}
        aria-keyshortcuts="Meta+K Control+K"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 'var(--r-input)',
          background: PALETTE.bg,
          color: PALETTE.ink50,
          fontSize: 'var(--fs-meta)',
          minWidth: 260,
          border: '1px solid ' + PALETTE.hair,
          cursor: 'pointer',
          fontFamily: SANS,
        }}
      >
        <Ic.search width={14} height={14} />
        <span className="cp-topbar-search-hint" style={{ flex: 1, textAlign: 'left' }}>
          {t('topbar.search')}
        </span>
        <span
          className="mono cp-topbar-search-kbd"
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            padding: '2px 5px',
            background: PALETTE.paper,
            border: '1px solid ' + PALETTE.hair,
            borderRadius: 'var(--r-input)',
          }}
        >
          ⌘K
        </span>
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 1.2,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-body)',
            fontWeight: 700,
            color: PALETTE.ink,
          }}
        >
          {fmtClock(now)}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 'var(--fs-micro)',
            color: PALETTE.ink50,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          ed. mañana
        </span>
      </div>

      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,' + PALETTE.civic + ',' + PALETTE.accent2 + ')',
          color: 'white',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
        }}
      >
        MP
      </div>
    </header>
  )
}

export { Header }

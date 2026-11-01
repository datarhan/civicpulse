import { Ic } from '../../components/Icons'
import { PALETTE, SANS, MONO, fmtClock } from './tokens'
import { useLocale } from '../../i18n'
import { useAbrirBuscador } from '../../lib/buscador'
import { Vivo } from './Vivo'
function Header({ now }) {
  const { t, locale } = useLocale()
  const abrirBuscador = useAbrirBuscador()
  return (
    // Fixed 54px row on desktop; below the breakpoint it becomes a grid of
    // fixed rows instead (see `.d-topbar` in DirectionD), so `display` lives in
    // that stylesheet and not here, where it would outrank the media query.
    // Squeezed at 375 it used to force the brand block into a three-line column
    // AND push 476px of live chips past the viewport — invisible while the shell
    // was position:fixed and clipping them, a document-wide horizontal scroll
    // once it wasn't.
    <header
      className="d-topbar"
      style={{
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
        {/* Aquí iba una pastilla «MVP», jerga de empresa emergente en el rojo de
            acento junto al nombre del pueblo, y al final de la barra un círculo
            «MP» que parecía el menú de una cuenta que no existe (auditoría de las
            dos lecturas, 25-10-2026). */}
      </div>

      <Vivo />
      <div className="d-hueco" style={{ flex: 1 }} />

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
        // El nombre accesible sale del texto que se ve (WCAG 2.5.3), sin
        // `aria-label`: quien dicta por voz dice lo que lee en pantalla, y axe
        // cuenta el «⌘K» pintado como parte de eso aunque vaya `aria-hidden`.
        // Una etiqueta escrita aparte tendría que repetirlo, y un lector de
        // pantalla le leería el atajo a quien no tiene esa tecla. Por eso la
        // pista no se quita por debajo de 720px: `index.css` la recorta, o el
        // botón se quedaría sin nombre en el móvil.
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
          aria-hidden="true"
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
        className="d-reloj"
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
          {fmtClock(now, locale)}
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
          {t('landing.topbar.edicion')}
        </span>
      </div>
    </header>
  )
}

export { Header }

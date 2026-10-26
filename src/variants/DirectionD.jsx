import StylizedMap from '../components/LiveCity/StylizedMap'
import LiveTicker from '../components/LiveTicker'
import {
  RIBA_ROJA_CENTER,
  PALETTE,
  SANS,
  MAPA_COMPACTO,
  MAPA_PLEGADO_ALTO,
  MAPA_SIN_LEYENDA_ALTO,
  STACK_BREAKPOINT,
  useClock,
} from './direction-d/tokens'
import { Header } from './direction-d/Topbar'
import { BarraSecciones } from './direction-d/BarraSecciones'
import { EventTicker } from './direction-d/MapOverlays'
import { EditorialColumn } from './direction-d/EditorialColumn'
import { KpiStrip } from './direction-d/KpiStrip'
import { useT } from '../i18n'

/*
 * `STACK_BREAKPOINT` —el ancho por debajo del cual los dos paneles se apilan—
 * vive en `tokens` porque lo necesitan también las hojas `*.css.js` de la
 * portada, y de aquí no podrían importarlo sin cerrar un ciclo. Aquí sólo se usa
 * en la consulta de medios de más abajo: no se reexporta, porque nadie lo
 * importaba de este módulo.
 */

export default function DirectionD() {
  const now = useClock(60000)
  const t = useT()

  return (
    <div
      className="d-shell"
      style={{
        background: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily: SANS,
      }}
    >
      {/*
        Layout lives here rather than in inline styles because it has to change
        at a breakpoint, and inline styles can't hold a media query — they also
        outrank any class, so the responsive properties have to be absent from
        the JSX for the rules below to apply at all.

        Colours are interpolated from PALETTE so there is exactly one source of
        truth; a hard-coded copy in index.css would drift the first time a token
        moved. (tests/e2e/landing-responsive.spec.ts pins the behaviour.)

        WHY the breakpoint exists: on desktop this is a fixed, full-viewport app
        shell — map and editorial column side by side, each scrolling
        internally. That model has no small-screen story. The column was a hard
        `width: 420 / flex-shrink: 0` at every size, so the map was squeezed to
        292px at 768, 124px at 600, and 0px at 430 — where 46px of the column
        was also clipped, and 101px at 375, with no horizontal scroll to reach
        it. The mobile e2e passed throughout because it asserts "no horizontal
        scroll", which is precisely what the clipping produced.
      */}
      <style>{`
        @keyframes ribaPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        .d-root .leaflet-container { background: #0B0F19; }
        .d-root .leaflet-control-zoom { display: none; }
        .d-root .leaflet-tooltip {
          background: rgba(14,20,34,.9);
          color: white;
          border: 1px solid rgba(96,165,250,.25);
          box-shadow: 0 4px 10px rgba(0,0,0,.4);
        }
        .d-root .leaflet-tooltip-top::before { border-top-color: rgba(14,20,34,.9); }

        /*
          height:100vh in NORMAL FLOW, not position:fixed. Visually identical —
          it is the only thing on the page, so a fixed inset:0 box and a
          full-height flow box occupy the same rectangle — but the fixed version
          left <body> at height 0, and axe's color-contrast rule refuses to
          resolve a background stack through that. The result: the landing
          reported "no contrast violations" while evaluating ZERO nodes, for
          every route audit this project has run. Comparable pages get hundreds
          of checks. a11y.spec.ts now fails if that count collapses again.
        */
        .d-shell { height: 100vh; display: flex; flex-direction: column; }
        /*
          Por encima de la barra de secciones (2), que va a su vez por encima
          del mapa: lo que cuelga de esta cabecera tiene que caer sobre la barra
          y no por debajo. Y ahora cuelga de verdad: el detalle del tiempo, el
          aire y el metro se pinta. Quien lo recortaba era el overflow-x de su
          propia tira, y el panel ya no cuelga de ella — el porqué y el cambio
          de ancla en estrecho están en vivo.css.js.
        */
        .d-topbar { display: flex; height: 54px; position: relative; z-index: 3; }
        .d-brand { min-width: 0; }
        .d-root { flex: 1; display: flex; min-height: 0; }
        .d-kpi { height: 76px; }
        .d-kpi-cell { flex: 1; min-width: 0; }
        .d-main { flex: 1; display: flex; min-width: 0; min-height: 0; }
        /* Clips the absolutely-positioned overlays (ticker marquee, event
           strip) to the pane. Without it the marquee — two chip lists
           back to back, deliberately wider than the screen — escapes and drags
           the document sideways once the shell is no longer a clipping box.

           isolation: el mapa se apila en su propio contexto. Leaflet pinta sus
           esquinas de control a z-index 1000 y sus capas entre 200 y 700;
           aisladas aquí, esas cifras sólo compiten entre ellas, y la barra de
           secciones y la cabecera les pasan por encima con un 2 y un 3 en vez
           de pujar por encima de mil — que es lo que dejaría debajo a
           cualquier diálogo que un día se monte en esta página. */
        .d-mappane {
          flex: 1; position: relative; min-width: 0; overflow: hidden;
          isolation: isolate;
          /* Contenedor con nombre para que la pila se pliegue según lo que mide
             EL MAPA, no la ventana: ver MAPA_PLEGADO_ALTO en tokens.jsx. Su alto
             viene siempre de fuera —el flex de la fila, o el vh de los anchos
             estrechos—, así que la contención de tamaño no lo cambia. */
          container-type: size;
          container-name: mapa;
        }
        .d-editorial {
          width: 420px; flex-shrink: 0; overflow-y: auto;
          padding: 24px 26px;
          border-left: 1px solid ${PALETTE.hair};
        }

        @media (max-width: ${STACK_BREAKPOINT - 1}px) {
          /* The page scrolls as one document instead of two panes scrolling
             inside a viewport too small to hold them.

             The shell sets NO overflow, here or in the base rule, and that is
             load-bearing: any value other than visible makes it a scroll
             container, and axe's color-contrast rule then evaluates ZERO nodes
             inside it — the blind spot this work exists to close. Clipping only
             the x-axis is not an escape hatch either; per CSS Overflow §3 a
             visible axis paired with a clipped one computes to auto. Overflow
             is contained at its own sources instead: the map pane clips the
             ticker, and the live strip, the section bar and the KPI strip each
             scroll themselves — the first of those from vivo.css.js, which is
             where that rule lives now. (Sin comillas invertidas aquí dentro:
             esto vive en la plantilla que sostiene estas reglas, y una las
             cierra. La guarda de tests/css-en-literal.test.js sólo descubre las
             hojas *.css.js, así que a este bloque sólo lo cubre la build.) */
          .d-shell { height: auto; min-height: 100vh; }
          /* La cabecera estrecha es una REJILLA de filas fijas, y no una fila
             flexible que salta de línea, porque el ancho del chip «Hoy» cambia
             después del primer pintado: llega el tiempo («Hoy · L9 7 min» pasa a
             «🌤 Hoy · 26° · L9 7 min», de 164 a 245 px) y el metro cambia de
             texto con la hora («ahora», «7 min», «419 min (mañana)», 317 px).
             Saltando de línea, el reparto en filas salía de lo que cupiera: a
             375 el reloj caía a una tercera fila al llegar el tiempo y la
             cabecera pasaba de 70 a 116 px, con el mapa y todo lo de debajo
             bajando 46 px un instante después de pintar; entre 430 y 1023 se
             movía 8, 9 o 46 px según llegara el tiempo y según el texto del
             metro. Hasta el 26-10-2026 lo tapaba el círculo «MP», que caía
             siempre a la tercera fila.

             En la rejilla el número de filas no depende del contenido: el chip
             tiene su columna, y si un texto no cabe se desliza dentro de la
             tira (vivo.css.js) en vez de empujar a nadie de fila. Ni alto
             mínimo ni tope de ancho: con un alto reservado las piezas seguían
             cambiando de fila DENTRO de la cabecera, y con el chip topado a 375
             su texto más largo perdía el final, que es justo «(mañana)», la
             palabra que dice que el tren es el primero del día siguiente.
             (cabecera-portada.spec.ts lo mide.) */
          .d-topbar {
            height: auto; min-height: 54px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto;
            grid-template-areas: 'marca marca marca' 'vivo buscar reloj';
            padding: 8px 14px; row-gap: 8px; column-gap: 12px;
          }
          .d-brand { flex-wrap: wrap; grid-area: marca; }
          .d-topbar > .cp-vivo { grid-area: vivo; }
          .d-topbar > .cp-topbar-search { grid-area: buscar; }
          .d-reloj { grid-area: reloj; }
          /* El hueco que empuja el buscador a la derecha en la fila de escritorio;
             aquí lo hace la columna flexible. */
          .d-hueco { display: none; }
          .d-root { flex-direction: column; min-height: 0; }
          .d-main { flex-direction: column; }
          /* Enough map to be a map, not so much that it buries the column. */
          .d-mappane { flex: none; height: 52vh; min-height: 300px; }
          .d-editorial {
            width: auto; overflow-y: visible;
            padding: 20px 18px;
            border-left: none; border-top: 1px solid ${PALETTE.hair};
          }
          .d-kpi { height: auto; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .d-kpi-cell { flex: 0 0 auto; min-width: 150px; }
        }

        /* La pila de controles del mapa. Sus reglas que cambian con el ancho viven
           aquí y no en el style de cada componente, que no admite media queries y
           gana a cualquier clase. En ancho de escritorio no cambia nada: la fila de
           chips salta de línea y el botón de plegar no existe. */
        .cp-capas-chips { flex-wrap: wrap; }
        /* 232 partía la cabecera de la tarjeta del dinero (título y los dos filtros)
           en tres líneas. */
        .cp-dinero { width: 268px; }
        .cp-cobertura { margin-top: 6px; padding-top: 6px; border-top: 1px solid #E6E1D4; }
        .cp-pila-plegar { display: none; }
        /* La clave de Metrovalencia, tarjeta de la pila (NetworkLegend.jsx). Su
           display va aquí y no en su style, que ganaría a las reglas de abajo. */
        .cp-leyenda-red { display: flex; }

        /* En la hoja y no en el style de MapAttribution: el compacto la cambia. */
        .cp-atribucion { letter-spacing: .08em; }

        @media (max-width: ${MAPA_COMPACTO}px) {
          .d-mappane { height: 44vh; min-height: 260px; }
          .d-region { display: none; }
          /* Aquí el chip no cabe junto al buscador y el reloj ni con el texto de
             cada día (245 + 36 + 75 px más los huecos, en los 335 que quedan a
             375 px): en esa columna se deslizaría casi siempre. Va solo en su
             fila, y el buscador y el reloj juntos en la tercera: 116 px, llegue
             o no el tiempo (ver .d-topbar arriba). */
          .d-topbar {
            grid-template-areas: 'marca marca marca' 'vivo vivo vivo' '. buscar reloj';
          }
        }

        /* El pliegue de la pila, por el ALTO del mapa y no por el ancho de la
           ventana. A 375 px sigue plegándose, porque ese mapa mide menos de 400; lo
           nuevo es que también se pliega entre el móvil y el escritorio, donde un
           mapa de 468 a 593 px dejaba las cuatro estaciones debajo de la pila. */
        @container mapa (max-height: ${MAPA_PLEGADO_ALTO}px) {
          /* A 375 px la pila medía más de 300 px sobre un mapa de 277 a 357 y tapaba
             las cuatro estaciones de Riba-roja. Plegada deja los chips en una sola
             fila que se desplaza, con el borde difuminado para que se note que
             sigue, y la línea de cobertura del dinero con su botón de detalle.
             La cobertura es la declaración de honestidad de la capa: sólo se pliega
             la tarjeta que la lleva, y ella nunca. */
          .cp-capas-titulo { display: none; }
          /* Desplegada, la tarjeta del dinero tiene que caber entera entre la pila
             de chips y la cinta «DIRECTO» (el tope de la pila está en
             StylizedMap.jsx). Con los 268 px de escritorio la nota de cobertura
             iba en seis líneas, la tarjeta medía 253 px y la pila se pasaba 32 de
             lo que cabe a 375×812: toma el ancho de la pila. Y su título se va,
             como el de las capas: repetía el chip «Contratos situados», encendido
             justo debajo. */
          .cp-dinero { width: auto; max-width: 360px; }
          .cp-dinero-titulo { display: none; }
          .cp-capas-chips {
            flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain;
            scrollbar-width: none;
            mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
            -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
          }
          .cp-pila-plegar { display: inline-flex; }
          .cp-mapa-pila[data-plegada='true'] .cp-dinero:has(.cp-cobertura) .cp-plegable {
            display: none;
          }
          .cp-mapa-pila[data-plegada='true'] .cp-cobertura {
            margin-top: 0; padding-top: 0; border-top: 0;
          }
          /* Plegada, la clave de Metrovalencia se va con lo demás que se pliega: es
             una tarjeta de la pila desde el 18-10-2026, y a estos altos la pila
             plegada sólo deja chips y cobertura. Al desplegar, vuelve. */
          .cp-mapa-pila[data-plegada='true'] .cp-leyenda-red { display: none; }
          /* Con una ficha abierta, la pila se aparta. Todo el mapa —también el
             panel de las fichas— apila a z-400, igual que la pila, que va después
             en el DOM y gana el empate; y a 375×629 una ficha mide unos 400 px en
             un mapa de 277, así que el auto-pan no la saca de debajo. El
             17-10-2026 la ficha del Passeig del Molinet llevaba cuatro enlaces de
             barrio y el último caía bajo la cobertura plegada: el toque en el
             punto de el Molinet no llegaba a su ficha. La cobertura no se pierde:
             vuelve al cerrar la ficha (barrios-mobile.spec.ts). */
          .cp-mapa[data-ficha='true'] .cp-mapa-pila { visibility: hidden; }
          /* La atribución en una sola línea: con el espaciado de escritorio, a 375 px
             iba en dos y se comía el doble de pie de mapa (y de ficha). */
          .cp-atribucion { letter-spacing: 0; }
        }

        @container mapa (max-height: ${MAPA_SIN_LEYENDA_ALTO}px) {
          .cp-leyenda-red { display: none; }
        }
      `}</style>

      <Header now={now} />

      {/* La navegación de la portada: cinco grupos con nombre bajo la cabecera,
          en el sitio que ocupaba el carril de glifos a la izquierda del mapa. */}
      <BarraSecciones />

      <div className="d-root">
        {/*
          The landing route bypasses InnerShell, which is where the app's only
          <main> lived — so the homepage had no main landmark at all, and the
          skip link had nothing to target. Content outside any landmark was
          also what tripped axe's `region` rule (5 nodes).
        */}
        <main id="contenido" tabIndex={-1} className="d-main" aria-label={t('a11y.mainLabel')}>
          <div className="d-mappane">
            <StylizedMap center={RIBA_ROJA_CENTER} />
            <LiveTicker />
            <EventTicker />
          </div>

          <EditorialColumn now={now} />
        </main>
      </div>

      <KpiStrip />
    </div>
  )
}

import { Ic } from './Icons'
import { safeHref } from '../lib/formatters'

const TONES = {
  neutral: { bg: 'var(--soft)', fg: 'var(--ink)' },
  civic: { bg: 'var(--civic-soft)', fg: 'var(--civic-ink)' },
  ok: { bg: 'var(--ok-soft)', fg: 'var(--ok-ink)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
  crit: { bg: 'var(--crit-soft)', fg: 'var(--crit-ink)' },
  intel: { bg: 'var(--intel-soft)', fg: 'var(--intel-ink)' },
  ghost: { bg: 'transparent', fg: 'var(--ink50)', border: '1px solid var(--border)' },
}

/**
 * Los tonos que Pill sabe pintar, exportados para que un mapa de estados pueda
 * comprobarse contra ellos en vez de repetirlos. Restar un tono a mano es cómo
 * `STATUS_TONE` acabó mandando 413 filas al `ghost` por defecto sin que nada
 * enrojeciera.
 */
export const TONE_NAMES = Object.keys(TONES)

export function Pill({ tone = 'neutral', children, size = 'sm', style = {} }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'xs' ? '2px 6px' : '3px 8px',
        borderRadius: 'var(--r-pill)',
        background: t.bg,
        color: t.fg,
        fontSize: 'var(--fs-aux)',
        fontWeight: 600,
        letterSpacing: '.02em',
        lineHeight: 1,
        border: t.border || 'none',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function Delta({ v, size = 11 }) {
  if (v === 0) {
    return (
      <span className="mono" style={{ color: 'var(--ink50)', fontSize: size }}>
        —
      </span>
    )
  }
  const up = v > 0
  return (
    <span
      className="mono"
      style={{
        color: up ? 'var(--ok)' : 'var(--crit)',
        fontSize: size,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {up ? <Ic.up width={8} height={8} /> : <Ic.down width={8} height={8} />}
      {up ? '+' : ''}
      {v.toFixed(1)}
    </span>
  )
}

/**
 * The generic panel. Anything it does not name — `id`, `role`, `aria-*`,
 * `className` — is forwarded to the underlying `<div>`.
 *
 * That passthrough is load-bearing, not a convenience. Nine call sites pass an
 * `id`: one per finding on `/hallazgos` and eight section anchors on
 * `/metodologia`. While the signature destructured a fixed list, React never
 * saw those ids, so `/hallazgos#f-…` — the href in the card's own «enlace
 * permanente», in Cmd+K, and in the ClaimReview JSON-LD that Google's Fact
 * Check Tools indexes — resolved to no element and dropped the reader at the
 * top of the page. A dropped prop warns about nothing, which is why it lasted.
 *
 * `{...rest}` goes FIRST so a caller cannot accidentally clobber the hover
 * handlers or the token-driven style below; those stay the component's own.
 *
 * La apariencia vive en `.cp-card` (index.css) y no aquí. Dos razones, las dos
 * del brandbook y las dos medidas:
 *
 *   §06 pide «borde ink10, radio 12, padding 20». Estaba a 18 y con
 *   `--border2`, que en claro es el mismo gris pero en oscuro no sigue la
 *   escala de tinta.
 *
 *   §16 pide paridad puntero/foco, y cita ESTE componente: la tarjeta
 *   reaccionaba mutando `style.borderColor` dentro de `onMouseEnter`, de modo
 *   que quien navega con teclado no recibía el paso. Un estilo inline no puede
 *   llevar `:hover` ni `:focus-within`; una clase sí.
 *
 * `style` sigue ganando a la clase —es un atributo inline— así que las llamadas
 * que ya pasan su propio `padding` o `background` no cambian de aspecto.
 */
export function Card({ children, style = {}, pad = true, hover = false, className = '', ...rest }) {
  const clases = ['cp-card', pad ? '' : 'cp-card-flush', hover ? 'cp-card-hover' : '', className]
  return (
    <div {...rest} className={clases.filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}

/**
 * El nombre de una formación política, con su color.
 *
 * Existe porque este sitio había escrito la misma decisión cinco veces y la
 * había escrito mal cuatro: el color de partido iba de COLOR DE TEXTO. Como
 * texto los siete suspenden AA en modo oscuro —de 1,93:1 a 3,71:1— y eso es lo
 * que se publicaba en /departamentos, /declaraciones y /hallazgos.
 *
 * Van de RELLENO con el blanco encima. Lo dicen las dos fuentes a la vez: §02c
 * del brandbook («en oscuro se mantienen idénticos, con el blanco a 700
 * encima») y el propio docstring de `src/lib/party-colors.js`, que explica que
 * los valores están oscurecidos precisamente para que el blanco a ≥9 px bold
 * cumpla. Un color ajeno no se reinterpreta por tema; lo que se elige es qué
 * poner encima.
 *
 * Sin `tone` —una formación que no reconocemos— no se inventa una pastilla: se
 * escribe en tinta neutra, que es lo que un sentinela merece.
 *
 * @param {object} p
 * @param {string} p.children  el nombre de la formación
 * @param {string} [p.tone]    su color, si lo hay
 * @param {object} [p.style]
 */
export function PartyTag({ children, tone, style = {} }) {
  if (!tone) {
    return (
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink50)', ...style }}>
        {children}
      </span>
    )
  }
  return (
    <span
      className="mono"
      style={{
        background: tone,
        color: '#fff',
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 'var(--r-input)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/**
 * La cita literal. Brandbook §03b.
 *
 * El titular del brandbook dice que la cita es lo único que este medio vende, y
 * hasta ahora se componía con una cursiva que la tipografía no tiene: index.html
 * carga `Outfit:wght@400;500;600;700`, sin eje `ital`, y treinta y cuatro sitios
 * del producto pedían `fontStyle: 'italic'`. El navegador responde inclinando la
 * romana por transformación geométrica —contraformas deformadas, terminales
 * rotas, peso aparente menor—. En un párrafo decorativo es un descuido; sobre la
 * declaración literal de un cargo público es la pieza peor compuesta del sitio.
 *
 * La regla: la cita no se inclina, se marca. Filete de petróleo, comillas
 * latinas, peso 500 y un cuerpo por encima del resumen editorial que la
 * introduce — que es lo que la separa de él. Medida máxima de 68 caracteres: el
 * brandbook fijaba anchos de página y nunca la medida, así que a 14 px dentro de
 * un contenedor de 1400 la línea llegaba a 200 caracteres.
 *
 * `attribution` distingue tres casos, y la diferencia es editorial, no cosmética
 * (§08: «si no se sabe quién habló: sin atribuir, nunca un grupo de relleno»):
 *
 *   attribution="PSOE"   habla un bloc identificado
 *   attribution={null}   es habla, y NO se sabe de quién → imprime «sin atribuir»
 *   sin la prop          no es habla (extracto de un documento) → no se atribuye
 *
 * `marks` va DENTRO del blockquote y `source` fuera, y la diferencia no es de
 * maquetación. Un `mark` CALIFICA ese literal —«no consta en la transcripción
 * revisada», «acusación no contrastada»— y 75 de los 177 literales de
 * /hallazgos sostienen acusaciones públicas que la puerta editorial retiene.
 * Sacar esa marca del blockquote deja la cita leyéndose como si nadie la
 * hubiera puesto en duda. `source` sólo dice de dónde viene, y eso sí es pie.
 * Lo defiende tests/components/finding-quote-contrast.test.jsx, que lo cazó
 * cuando este componente lo movió al pie.
 *
 * @param {object} p
 * @param {string} p.text         el verbatim, sin comillas: las pone el componente
 * @param {string|null} [p.attribution]
 * @param {string} [p.tone]       color del bloc, si lo hay
 * @param {React.ReactNode} [p.marks]  calificaciones DE ESTE literal
 * @param {React.ReactNode} [p.source] procedencia: sesión, minuto
 * @param {'card'|'page'} [p.size]
 * @param {object} [p.style]
 */
export function Quote({ text, attribution, tone, marks, source, size = 'card', style = {} }) {
  const esHabla = attribution !== undefined
  const etiqueta = attribution ?? 'sin atribuir'
  // Pasos de la escala, no números. Esto decía `17 : 14`: el 17 no era ningún
  // paso y, por ser píxeles absolutos, era además el único tamaño de la página
  // que no se movía con el control de densidad. Lo escribí yo mismo un rato
  // antes de construir la escala, que es justo cómo se acumulan los veintiocho.
  const cuerpo = size === 'page' ? 'var(--fs-head)' : 'var(--fs-body)'
  return (
    <figure
      style={{
        margin: '8px 0 0',
        padding: '2px 0 2px 12px',
        borderLeft: '3px solid var(--civic)',
        maxWidth: '68ch',
        ...style,
      }}
    >
      <blockquote
        style={{
          margin: 0,
          fontSize: cuerpo,
          // Sin fontStyle. Es el punto entero de este componente.
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.5,
        }}
      >
        «{text}»{marks}
      </blockquote>
      {(esHabla || source) && (
        <figcaption
          className="mono"
          style={{
            marginTop: 4,
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {esHabla && (
            // La misma pastilla que el resto del sitio, definida una vez arriba.
            <PartyTag tone={tone}>{etiqueta}</PartyTag>
          )}
          {source && <span>{source}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * Lo que propone una máquina y todavía no ha firmado nadie. Brandbook §06b.
 *
 * Es el componente con más carga legal del producto y no estaba en la
 * biblioteca. La arquitectura de dos ficheros —publicado y sugerido— no protege
 * de nada si en pantalla una inferencia de máquina se parece a un estado
 * curado, así que las tres reglas van aquí dentro y no en la llamada:
 *
 * 1. **Caja discontinua**, en morado intel. En este sitio un contorno
 *    discontinuo significa siempre lo mismo: esto no es una afirmación
 *    publicada en firme. Lo comparten la fecha que no consta, el estado que no
 *    consta y la votación retirada. (El brandbook lo llama «la única línea
 *    discontinua del sistema»; eso no es cierto aquí — hay dieciséis filetes
 *    discontinuos que sólo separan filas. La regla verdadera y comprobable es
 *    sobre la CAJA, no sobre la línea.)
 * 2. **Nunca sustituye la pastilla de estado** ni ocupa su sitio. Por eso este
 *    componente no acepta ni pinta un veredicto: sólo lo que la máquina
 *    propone, dicho como propuesta.
 * 3. **Sin porcentaje no se publica.** Si no llega una confianza utilizable,
 *    devuelve `null` en vez de dibujar una propuesta sin declarar cuánto se fía
 *    de sí misma. Preferir no enseñar nada a enseñarlo sin la cifra es la parte
 *    que hace de esto una regla y no una decoración.
 *
 * @param {object} p
 * @param {number} p.confidence  0–1. Fuera de rango o ausente ⇒ no se publica.
 * @param {string} [p.decidedBy] a quién corresponde decidir
 * @param {React.ReactNode} p.children
 */
export function MachineProposal({ confidence, decidedBy = 'un curador humano', children }) {
  const usable = typeof confidence === 'number' && Number.isFinite(confidence)
  const pct = usable ? Math.round(confidence * 100) : null
  if (pct === null || pct <= 0 || pct > 100) return null
  return (
    <div
      data-machine-proposal
      style={{
        marginTop: 12,
        padding: 12,
        background: 'var(--intel-soft)',
        border: '1px dashed var(--intel)',
        borderRadius: 'var(--r-card)',
        fontSize: 'var(--fs-meta)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--intel-ink)',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        Propuesta automática · pendiente de revisión humana · confianza {pct}%
      </div>
      <div style={{ color: 'var(--ink70)', lineHeight: 1.5 }}>{children}</div>
      <div style={{ marginTop: 6, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        No está publicada: sólo {decidedBy} puede aplicarla.
      </div>
    </div>
  )
}

/**
 * Una de las tres bandas de una ficha de evidencia. Brandbook §08.
 *
 * «Hoy la cita, el cotejo, la ausencia de rastro y la réplica comparten tamaño,
 * peso y color. El lector no distingue lo que alguien dijo de lo que está
 * comprobado — que es lo único que este medio vende.» Las bandas van numeradas
 * y siempre en el mismo orden: 1 lo que se dijo · 2 contra qué se cotejó ·
 * 3 derecho de réplica.
 *
 * La banda se dibuja aunque no tenga contenido, y ahí está el detalle que
 * importa: una ficha sin documentos cotejados tiene que DECIRLO, porque si la
 * banda desaparece el lector no puede distinguir «se cotejó y no salió nada» de
 * «no se cotejó». El texto de ese vacío lo pone la llamada, no este componente,
 * y describe el REGISTRO —qué se publica— nunca el mundo: el esquema de
 * `pleno-findings.json` no separa esos dos casos, así que afirmar «sin rastro»
 * desde un array vacío sería fabricar un veredicto con un dato que no existe.
 *
 * @param {object} p
 * @param {number} p.n
 * @param {string} p.title
 * @param {React.ReactNode} p.children
 */
export function EvidenceBand({ n, title, children }) {
  return (
    <section style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--ink50)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 17,
            height: 17,
            borderRadius: '50%',
            background: 'var(--civic)',
            color: 'var(--civic-on)',
            fontSize: 'var(--fs-micro)',
          }}
        >
          {n}
        </span>
        {title}
      </div>
      {children}
    </section>
  )
}

/**
 * El encabezado de un bloque. Es el esqueleto de casi todas las páginas: 187
 * llamadas repartidas por 36 ficheros.
 *
 * Hacía dos cosas mal y las dos se midieron sobre el sitio compuesto, no sobre
 * el código —ninguna de las dos puertas de tipografía de esta casa podía
 * verlas, porque las dos leen ficheros—:
 *
 *   1. Pintaba el título a `--fs-body`. El mismo cuerpo que el párrafo de
 *      debajo. §03 tiene un escalón llamado «head · encabezado de bloque» y en
 *      /eficiencia y /gestion aparecía UNA vez por página, las dos en un <h3>
 *      metido dentro de un <h2> a 14 px. Jerarquía invertida.
 *   2. Pintaba un `<div>`. Veinticinco de las treinta y siete rutas públicas
 *      no tenían ni un solo <h2>: para un lector de pantalla esas páginas no
 *      tienen secciones, sólo un título y un muro.
 *
 * `as` existe porque un nivel semántico no se puede repartir a ciegas: una
 * sección dentro de otra pide `h3`, y saltar de h1 a h3 es un defecto distinto
 * del que se está arreglando. `npm run censo` mide los saltos por ruta.
 *
 * El escalón por defecto es «card · 20 px · titular de ficha» porque ése es el
 * uso dominante y medido: la inmensa mayoría de las 187 llamadas van pegadas
 * dentro de un `<Card>`, y §06 describe esa tarjeta pieza a pieza — «eyebrow
 * mono · título 20 · cuerpo 14». `size="head"` baja a los 16 px del bloque que
 * ya vive dentro de una sección con título propio.
 *
 * @param {object} p
 * @param {import('react').ReactNode} [p.eyebrow]  antetítulo en mono
 * @param {import('react').ReactNode} p.title
 * @param {import('react').ReactNode} [p.right]    lo que va al otro extremo
 * @param {'h2'|'h3'|'h4'} [p.as]                  nivel semántico
 * @param {'head'|'card'} [p.size]
 */
export function SectionHead({ eyebrow, title, right, as: Nivel = 'h2', size = 'card', id }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              fontWeight: 700,
              letterSpacing: '.1em',
            }}
          >
            {eyebrow}
          </div>
        )}
        <Nivel
          id={id}
          data-section-head=""
          className={`cp-sec-head${size === 'card' ? ' cp-sec-head-xl' : ''}`}
          style={{ marginTop: eyebrow ? 3 : 0 }}
        >
          {title}
        </Nivel>
      </div>
      {right}
    </div>
  )
}

export function Button({ variant = 'ghost', children, ...rest }) {
  const base = {
    padding: '7px 12px',
    borderRadius: 'var(--r-input)',
    fontSize: 'var(--fs-aux)',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'background .15s, opacity .15s',
  }
  const solid = { ...base, background: 'var(--ink)', color: 'var(--paper)' }
  const ghost = {
    ...base,
    background: 'var(--paper)',
    color: 'var(--ink)',
    border: '1px solid var(--border)',
  }
  return (
    <button style={variant === 'solid' ? solid : ghost} {...rest}>
      {children}
    </button>
  )
}

export function LinkArrow({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        fontSize: 'var(--fs-meta)',
        color: 'var(--civic)',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/**
 * External hyperlink with an XSS-safe href. Renders an
 * `<a target="_blank" rel="noreferrer">` ONLY when the URL is http(s);
 * otherwise falls back to a plain `<span>` with the same children/props — so a
 * `javascript:`/`data:` URL from scraped data can never become a live href.
 *
 * Use for scraped/external URLs (press links, source URLs, PDFs, permalinks).
 * Do NOT use for internal routes (`#anchors`, `/paths`), `mailto:`/`tel:`, or
 * download/blob URLs — those are not http(s) and would render as plain text.
 */
export function ExtLink({ href, children, ...rest }) {
  const safe = safeHref(href)
  if (!safe) return <span {...rest}>{children}</span>
  return (
    <a href={safe} target="_blank" rel="noreferrer" {...rest}>
      {children}
    </a>
  )
}

export function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

/**
 * WhatsApp share deeplink. Spain-native distribution channel — most
 * Riba-roja civic conversation happens in vecinos WhatsApp groups, not
 * Telegram or email. Renders a tiny "wa" pill that opens wa.me with a
 * pre-filled message + canonical link.
 *
 * `text` is the human message ("Queja pendiente · bache en calle Major").
 * `url`  is the canonical page to share; if omitted, defaults to the
 *        current URL at click time.
 */
export function ShareWA({ text, url, size = 10.5 }) {
  const onClick = (e) => {
    e.stopPropagation()
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
    const body = encodeURIComponent(`${text}${targetUrl ? `\n${targetUrl}` : ''}`)
    const href = `https://wa.me/?text=${body}`
    if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer')
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Compartir en WhatsApp"
      title="Compartir en WhatsApp"
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 'var(--r-pill)',
        background: '#DCFCE7',
        color: '#15803D',
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '.04em',
        cursor: 'pointer',
        border: '1px solid #BBF7D0',
      }}
    >
      <span aria-hidden="true">↗</span>
      WA
    </button>
  )
}

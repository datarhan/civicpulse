import Emblema, { cifrasDelEmblema } from './Emblema'
import { CorrectionNotice } from './CorrectionNote'
import { IndicePieza } from './Pieza'
import { fmtDateHuman } from '../../lib/formatters'

const SERIF = "'Fraunces', Georgia, serif"

/** El estilo de un párrafo de entradilla: cuerpo, tinta plena, a la medida. */
export const ENTRADILLA = { color: 'var(--ink)', margin: '26px 0 0' }

/**
 * La cabecera de una pieza, una sola para las seis.
 *
 * Cada pieza se escribía la suya a mano, y se habían separado en dos estilos:
 * antetítulo en mayúsculas o no, titular de 34px fijos o adaptable, subtítulo
 * en `--ink50` o `--ink70`, línea de fecha en dos de seis, tarjetas sueltas o
 * en franja, la entradilla en serifa de titular en una y en cuerpo en otra.
 * Ahora la presentación vive aquí y cada pieza pone sólo lo suyo:
 *
 * - `borrador`: el aviso que lleva mientras no se publica (cada pieza dice por
 *   qué no lo está: réplica pendiente, revisión…). Publicada, no se pinta.
 * - `kpis`: sus tarjetas; por defecto `data.kpis` (la DANA las calcula).
 * - `nota`: un aviso propio tras el de correcciones (la ampliación de coste
 *   efectivo).
 * - `entradilla`: texto (de la instantánea) o nodos (la DANA la escribe en la
 *   página). Va al cuerpo y a la medida: es el primer párrafo, no un segundo
 *   subtítulo.
 *
 * Qué tarjetas se ven lo decide la instantánea, no la página:
 *
 * - La que la figura escribe tal cual se esconde donde la figura se ve
 *   (`cifrasDelEmblema`, `cp-kpi-en-figura`), y sustituye a la figura donde no.
 * - La que el texto ya da con su contexto se quita (`meta.kpisEnTexto`): cada
 *   entrada dice su cifra (`n`) y la frase del subtítulo o la entradilla que la
 *   da (`en`), y tests/reportaje-cabecera.test.js comprueba que esa frase está
 *   ahí. Es una decisión editorial con su prueba, no un parecido de cadenas:
 *   «0» casa dentro de «6,09», y «≥5» no casa con «al menos cinco».
 *
 * Fuera de un `.cp-pieza > *` directo la medida de lectura no se aplica, así
 * que esto devuelve un fragmento: sus párrafos son hijos de la pieza.
 *
 * @param {{
 *   slug: string,
 *   data: any,
 *   borrador?: { titulo: string, texto?: string },
 *   kpis?: Array<{ n: string, l: string, tone?: string }>,
 *   nota?: import('react').ReactNode,
 *   entradilla?: import('react').ReactNode,
 * }} props
 */
export default function CabeceraPieza({ slug, data, borrador, kpis, nota, entradilla }) {
  const m = data.meta
  const enFigura = new Set(cifrasDelEmblema(slug, data))
  const enTexto = new Set((m.kpisEnTexto ?? []).map((/** @type {{ n: string }} */ k) => k.n))
  const tarjetas = (kpis ?? data.kpis ?? []).filter(
    (/** @type {{ n: string }} */ k) => !enTexto.has(k.n),
  )
  // Si todas las que quedan las escribe la figura, la franja entera es sólo
  // del móvil: con `display: grid` en línea, la regla que la esconde perdía.
  const soloMovil = tarjetas.length > 0 && tarjetas.every((k) => enFigura.has(k.n))
  const lede = entradilla ?? data.entradilla

  return (
    <>
      {m.estado !== 'publicado' && (
        <div
          style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            color: 'var(--warn-ink)',
            borderRadius: 'var(--r-card)',
            padding: '10px 14px',
            fontSize: 'var(--fs-meta)',
            marginBottom: 22,
          }}
        >
          <strong>{borrador?.titulo ?? 'Borrador · no publicado.'}</strong>
          {borrador?.texto ? ` ${borrador.texto}` : null}
        </div>
      )}

      <div
        className="mono cp-texto"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {m.seccion}
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--type-display)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.08,
          margin: '6px 0 12px',
        }}
      >
        {m.titulo}
      </h1>
      <p
        style={{
          fontSize: 'var(--fs-head)',
          color: 'var(--ink70)',
          lineHeight: 1.5,
          margin: '0 0 8px',
        }}
      >
        {m.subtitulo}
      </p>
      <Fechas publicadoEl={m.publicadoEl} fechaDatos={m.fechaDatos} />

      <Emblema slug={slug} data={data} style={{ margin: '22px 0 26px' }} />

      {/* Tras la figura; en el móvil, sin figura, el hueco lo pone su margen. */}
      <CorrectionNotice correcciones={m.correcciones} style={{ marginTop: 22 }} />
      {nota}

      {tarjetas.length > 0 && (
        <div className={soloMovil ? 'cp-kpi-en-figura' : undefined}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 1,
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              overflow: 'hidden',
              margin: '22px 0 0',
            }}
          >
            {tarjetas.map((k) => (
              <div
                key={k.n}
                className={!soloMovil && enFigura.has(k.n) ? 'cp-kpi-en-figura' : undefined}
                style={{ background: 'var(--paper)', padding: '16px 14px' }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-card)',
                    fontWeight: 500,
                    color: k.tone || 'var(--ink)',
                    lineHeight: 1,
                  }}
                >
                  {k.n}
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-aux)',
                    color: 'var(--ink50)',
                    marginTop: 7,
                    lineHeight: 1.35,
                  }}
                >
                  {k.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Texto: un párrafo. Nodos: los párrafos que la pieza escribe, con
          `ENTRADILLA` de estilo (lo exporta este fichero). */}
      {typeof lede === 'string' ? <p style={ENTRADILLA}>{lede}</p> : lede}

      <IndicePieza />
    </>
  )
}

/**
 * «Publicado el … · cifras congeladas a …», con lo que la pieza tenga. Una
 * pieza sin fecha de publicación en su instantánea dice sólo la de sus cifras;
 * sin ninguna, no se pinta. `fmtDateHuman` deja pasar una fecha ya escrita.
 *
 * @param {{ publicadoEl?: string, fechaDatos?: string }} props
 */
function Fechas({ publicadoEl, fechaDatos }) {
  const partes = [
    publicadoEl && `Publicado el ${fmtDateHuman(publicadoEl)}`,
    fechaDatos && `${publicadoEl ? 'cifras' : 'Cifras'} congeladas a ${fmtDateHuman(fechaDatos)}`,
  ].filter(Boolean)
  if (!partes.length) return null
  return (
    <div className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
      {partes.join(' · ')}
    </div>
  )
}

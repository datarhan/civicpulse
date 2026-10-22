import { Card, SectionHead } from '../Primitives'
import { CompetenciaDelegada } from './CompetenciaDelegada'
import { usePromises, STATUS_LABEL } from '../../hooks/usePromises'
import { useRevelado } from '../../hooks/useRevelado'
import { direccion, filasCuestaConsigue } from '../../scraper/cuesta-consigue'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale, useT } from '../../i18n'

/*
 * «Cuesta · Consigue · Responde»: para cada servicio con un resultado
 * publicado, lo que cuesta, lo que se consigue y quién responde, en los mismos
 * años y contra el mismo grupo de municipios.
 *
 * Es la capa 2 del diseño (docs/superpowers/specs/2026-10-22-lectura-vecinal-
 * eficiencia-design.md §3): hechos derivados y palabras de DIRECCIÓN, nunca de
 * valor. Quien lee pone el juicio; el único sitio de la página donde un juicio
 * puede ir firmado es la opinión del editor, y no es éste.
 *
 * Tres reglas que heredan las de la ficha:
 *
 * - Coste y resultado van al lado, nunca divididos (`Resultado.jsx`). La frase
 *   no-causal del resultado va en el cuerpo, no en letra pequeña.
 * - El nombre de quien tiene la competencia va al FINAL de su columna, con la
 *   salvedad que lo desarma en la misma tarjeta (`CompetenciaDelegada`), y
 *   sólo para el periodo en que la tiene: antes del decreto de este mandato no
 *   se nombra a nadie, porque no hemos incorporado el del anterior. Durante la
 *   ventana LOREG la capa de nombres no llega (`porClave` vacío).
 * - El mandato se sombrea en la figura: una subida se lee contra quién
 *   gobernaba ese año, no contra quien gobierna hoy.
 */

const pct = (n) => Math.abs(Math.round(n)).toLocaleString('es-ES')

/** Año con fracción de una fecha ISO: «2023-06-17» → 2023,46. */
function anioFraccion(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const a = d.getUTCFullYear()
  const ini = Date.UTC(a, 0, 1)
  return a + (d.getTime() - ini) / (Date.UTC(a + 1, 0, 1) - ini)
}

/**
 * Dos series indexadas (base = 100) en una figura pequeña: la nuestra en
 * petróleo, la del grupo en gris discontinuo, el mandato actual sombreado. Las
 * líneas se trazan al verlas (`cp-traza`); las etiquetas no se mueven.
 */
function FiguraIndice({
  nuestra,
  grupo,
  mandatoDesde,
  etiqueta,
  rotuloNuestra,
  rotuloGrupo,
  rotuloMandato,
  rotuloBase,
}) {
  const { ref, marcas } = useRevelado({ umbral: 0.3 })
  const series = [nuestra, grupo].filter(Boolean)
  const anios = series.flatMap((s) => s.puntos.map((p) => p.anio))
  const valores = series.flatMap((s) => s.puntos.map((p) => p.indice)).concat(100)
  const x0 = Math.min(...anios)
  const x1 = Math.max(...anios)
  // Un tramo mínimo de 20 puntos de índice. Sin él, la escala se ajustaba al
  // mínimo y al máximo de la serie y un nitrato que va de 42 a 46 mg/L (±5 %)
  // llenaba la figura de arriba abajo: la forma decía «se dispara» y la cifra
  // de al lado, «−2 %». Lo que se mueve menos que eso se ve casi plano, que es
  // lo que es.
  const TRAMO_MIN = 20
  const yLo = Math.min(...valores)
  const yHi = Math.max(...valores)
  const holgura = Math.max(0, TRAMO_MIN - (yHi - yLo)) / 2
  const yMin = yLo - holgura
  const yMax = yHi + holgura
  const pad = (yMax - yMin) * 0.12 || 10
  const W = 300
  const H = 120
  const izq = 8
  const der = 64
  const x = (a) => izq + ((a - x0) / Math.max(1, x1 - x0)) * (W - izq - der)
  const y = (v) => 8 + (1 - (v - (yMin - pad)) / (yMax + pad - (yMin - pad))) * (H - 24)
  const camino = (s) =>
    s.puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.anio)},${y(p.indice)}`).join(' ')
  const xm = mandatoDesde != null && mandatoDesde > x0 && mandatoDesde < x1 ? x(mandatoDesde) : null
  const fin = (s) => s.puntos[s.puntos.length - 1]
  const cambio = (s) => `${s.cambio >= 0 ? '+' : '−'}${pct(s.cambio)} %`
  // Las dos etiquetas finales no se pisan: si caen a menos de 12 px, la del
  // grupo se aparta hacia el lado en que ya estaba.
  let yN = nuestra ? y(fin(nuestra).indice) : 0
  let yG = grupo ? y(fin(grupo).indice) : 0
  if (nuestra && grupo && Math.abs(yN - yG) < 12) {
    if (yN <= yG) yG = yN + 12
    else yG = yN - 12
  }
  return (
    <figure ref={ref} {...marcas} style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={etiqueta}>
        {xm != null && (
          <>
            <rect x={xm} y={4} width={W - der - xm} height={H - 20} fill="var(--soft)" />
          </>
        )}
        <line x1={izq} x2={W - der} y1={y(100)} y2={y(100)} stroke="var(--border)" />
        {grupo && (
          // Sin `cp-traza`: su `stroke-dasharray: 1` le quitaría el discontinuo,
          // que es lo que distingue la línea del grupo sin depender del color.
          <path
            d={camino(grupo)}
            fill="none"
            stroke="var(--ink50)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}
        {nuestra && (
          <path
            d={camino(nuestra)}
            pathLength={1}
            className="cp-traza"
            fill="none"
            stroke="var(--civic)"
            strokeWidth="2.5"
            style={{ '--i': 2 }}
          />
        )}
        {nuestra && (
          <text x={W - der + 6} y={yN + 3} fontSize="10" fontWeight="600" fill="var(--civic-ink)">
            {cambio(nuestra)}
          </text>
        )}
        {grupo && (
          <text x={W - der + 6} y={yG + 3} fontSize="10" fill="var(--ink70)">
            {cambio(grupo)}
          </text>
        )}
        <text x={izq} y={H - 2} fontSize="9" fill="var(--ink50)">
          {x0}
        </text>
        <text x={W - der} y={H - 2} fontSize="9" fill="var(--ink50)" textAnchor="end">
          {x1}
        </text>
      </svg>
      <figcaption className="cp-ccr-leyenda">
        <span>{rotuloBase}</span>
        <span>
          <span
            className="cp-ccr-muestra"
            aria-hidden="true"
            style={{ background: 'var(--civic)' }}
          />
          {rotuloNuestra}
        </span>
        {grupo && (
          <span>
            <span className="cp-ccr-muestra cp-ccr-muestra-discontinua" aria-hidden="true" />
            {rotuloGrupo}
          </span>
        )}
        {/* El rótulo del mandato va aquí y no dentro de la banda: la banda es
            estrecha (medio año a un año y medio) y su texto pisaba la etiqueta
            final de las series. */}
        {xm != null && (
          <span>
            <span className="cp-ccr-muestra cp-ccr-muestra-banda" aria-hidden="true" />
            {rotuloMandato}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function Cuesta({ coste, t, mandatoDesde }) {
  if (!coste) return <p className="cp-ccr-nota">{t('eficiencia.ccr.coste.sinSerie')}</p>
  const { nuestro, grupo } = coste
  const dir = direccion(nuestro.cambio)
  const frase = {
    sube: rellena(t('eficiencia.ccr.coste.sube'), { base: nuestro.base, pct: pct(nuestro.cambio) }),
    baja: rellena(t('eficiencia.ccr.coste.baja'), { base: nuestro.base, pct: pct(nuestro.cambio) }),
    igual: rellena(t('eficiencia.ccr.coste.igual'), { base: nuestro.base }),
  }[dir]
  const dirG = grupo ? direccion(grupo.cambio) : null
  const fraseGrupo = grupo
    ? {
        sube: rellena(t('eficiencia.ccr.grupo.sube'), { pct: pct(grupo.cambio) }),
        baja: rellena(t('eficiencia.ccr.grupo.baja'), { pct: pct(grupo.cambio) }),
        igual: t('eficiencia.ccr.grupo.igual'),
      }[dirG]
    : ''
  return (
    <>
      <FiguraIndice
        nuestra={nuestro}
        grupo={grupo}
        mandatoDesde={mandatoDesde}
        etiqueta={`${frase} ${fraseGrupo}`}
        rotuloNuestra={t('eficiencia.ccr.rotulo.nuestro')}
        rotuloGrupo={t('eficiencia.ccr.rotulo.grupo')}
        rotuloMandato={t('eficiencia.ccr.rotulo.mandato')}
        rotuloBase={rellena(t('eficiencia.ccr.rotulo.base'), { base: nuestro.base })}
      />
      <p className="cp-ccr-frase" data-ccr="coste">
        {frase} {fraseGrupo}
      </p>
      <p className="cp-ccr-nota">{t('eficiencia.ccr.coste.precio')}</p>
      {coste.congelado && (
        <p className="cp-ccr-salvedad">
          {coste.congeladoDesde
            ? rellena(t('eficiencia.ccr.coste.congelado'), { desde: coste.congeladoDesde })
            : t('eficiencia.ccr.coste.congeladoSinAnio')}
        </p>
      )}
    </>
  )
}

function Consigue({ resultado, t, mandatoDesde }) {
  if (!resultado) return <p className="cp-ccr-nota">{t('eficiencia.ccr.resultado.sin')}</p>
  const r = resultado
  const valor = `${r.valor.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${r.unidad}`
  const dir = r.nuestro ? direccion(r.nuestro.cambio) : null
  const frase = r.nuestro
    ? {
        sube: rellena(t('eficiencia.ccr.resultado.sube'), {
          base: r.nuestro.base,
          pct: pct(r.nuestro.cambio),
        }),
        baja: rellena(t('eficiencia.ccr.resultado.baja'), {
          base: r.nuestro.base,
          pct: pct(r.nuestro.cambio),
        }),
        igual: rellena(t('eficiencia.ccr.resultado.igual'), { base: r.nuestro.base }),
      }[dir]
    : rellena(t('eficiencia.ccr.resultado.unAnio'), { periodo: r.periodo })
  return (
    <>
      <div>
        <span className="mono cp-ccr-cifra">{valor}</span>
        <span className="cp-ccr-nota"> · {r.etiqueta}</span>
      </div>
      {r.nuestro && (
        <FiguraIndice
          nuestra={r.nuestro}
          grupo={null}
          mandatoDesde={mandatoDesde}
          etiqueta={frase}
          rotuloNuestra={t('eficiencia.ccr.rotulo.nuestro')}
          rotuloGrupo=""
          rotuloMandato={t('eficiencia.ccr.rotulo.mandato')}
          rotuloBase={rellena(t('eficiencia.ccr.rotulo.base'), { base: r.nuestro.base })}
        />
      )}
      <p className="cp-ccr-frase" data-ccr="resultado">
        {frase}{' '}
        {r.percentil != null && r.nPares != null
          ? rellena(t('eficiencia.ccr.resultado.pares'), { p: r.percentil, n: r.nPares })
          : ''}
      </p>
      {/* «Del grupo sólo tenemos el último año» sólo es verdad si HAY grupo: el
          agua no tiene comparables, y decirle lo contrario al lector era falso. */}
      {r.nuestro && (
        <p className="cp-ccr-nota">
          {r.nPares != null
            ? t('eficiencia.ccr.resultado.sinSerieGrupo')
            : t('eficiencia.ccr.resultado.sinPares')}
        </p>
      )}
      {/* La frase no-causal, en el cuerpo: sin ella, un coste que sube al lado
          de un resultado que sube se lee como causa. */}
      {r.comoSeLee && <p className="cp-ccr-salvedad">{r.comoSeLee}</p>}
    </>
  )
}

function Responde({ asignacion, fuente, frozen, promesas, desde, t }) {
  const { locale } = useLocale()
  return (
    <>
      <div className="cp-ccr-subrotulo">{t('eficiencia.ccr.responde.competencia')}</div>
      {asignacion ? (
        <CompetenciaDelegada asignacion={asignacion} conFoto fuente={fuente} />
      ) : frozen ? (
        <p className="cp-ccr-nota">{t('eficiencia.ccr.responde.loreg')}</p>
      ) : (
        <p className="cp-ccr-nota">{t('eficiencia.ccr.responde.sinAsignar')}</p>
      )}
      {desde && (
        <p className="cp-ccr-nota">
          {rellena(t('eficiencia.ccr.responde.antes'), { desde: fmtDateLong(desde, locale) })}
        </p>
      )}
      <div className="cp-ccr-subrotulo">{t('eficiencia.ccr.responde.promesas')}</div>
      {promesas.length === 0 ? (
        <p className="cp-ccr-nota" data-ccr="sin-promesa">
          {t('eficiencia.ccr.responde.sinPromesa')}
        </p>
      ) : (
        <ul className="cp-ccr-promesas">
          {promesas.map((p) => (
            <li key={p.id}>
              <a href="/promesas">{p.title}</a>
              <span className="cp-ccr-nota">
                {' '}
                · {p.party} · {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * @param {{ data: any, competencias: any, porClave: Map<string, any>, nombresOn: boolean }} props
 */
export function CuestaConsigueResponde({ data, competencias, porClave, nombresOn }) {
  const t = useT()
  const { data: promesasData } = usePromises()
  const filas = filasCuestaConsigue(data ?? {})
  if (filas.length === 0) return null
  const etiquetas = new Map((data?.indicadores ?? []).map((i) => [i.id, i.etiqueta]))
  const mandatoDesde = competencias?.mandato?.desde
    ? anioFraccion(competencias.mandato.desde)
    : null
  const porIdPromesa = new Map((promesasData?.items ?? []).map((p) => [p.id, p]))

  const conResultado = filas.filter((f) => f.resultado)
  const sinResultado = filas.filter((f) => !f.resultado)
  const fila = (f) => (
    <article key={f.servicioId} className="cp-ccr-fila" data-ccr-servicio={f.servicioId}>
      <h3 className="cp-ccr-servicio">
        <a href={`/eficiencia/${f.servicioId}`}>{etiquetas.get(f.servicioId)}</a>
      </h3>
      <div className="cp-ccr-columnas">
        <section>
          <div className="cp-ccr-col">{t('eficiencia.ccr.col.cuesta')}</div>
          <Cuesta coste={f.coste} t={t} mandatoDesde={mandatoDesde} />
        </section>
        <section>
          <div className="cp-ccr-col">{t('eficiencia.ccr.col.consigue')}</div>
          <Consigue resultado={f.resultado} t={t} mandatoDesde={mandatoDesde} />
        </section>
        <section>
          <div className="cp-ccr-col">{t('eficiencia.ccr.col.responde')}</div>
          <Responde
            asignacion={porClave.get(f.servicioId)}
            fuente={competencias?.fuente}
            frozen={!nombresOn}
            promesas={f.promesas.map((id) => porIdPromesa.get(id)).filter(Boolean)}
            desde={competencias?.mandato?.desde}
            t={t}
          />
        </section>
      </div>
    </article>
  )

  return (
    <Card id="sec-cuesta" style={{ marginTop: 34 }} data-ccr-bloque="">
      <SectionHead eyebrow={t('eficiencia.ccr.eyebrow')} title={t('eficiencia.ccr.titulo')} />
      <p className="cp-ccr-intro">{t('eficiencia.ccr.intro')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {conResultado.map(fila)}
      </div>
      {/* Los servicios sin resultado publicado, plegados y no omitidos: su coste
          y quién responde de ellos siguen siendo lo que un vecino busca. */}
      {sinResultado.length > 0 && (
        <details className="cp-ccr-resto" data-ccr-resto="">
          <summary>{rellena(t('eficiencia.ccr.resto'), { n: sinResultado.length })}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
            {sinResultado.map(fila)}
          </div>
        </details>
      )}
    </Card>
  )
}

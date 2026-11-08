import { Link } from 'react-router-dom'
import {
  Card,
  ExtLink,
  Marcado,
  MarcadoConHuecos,
  Pill,
  SectionHead,
  ShareWA,
} from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useQuejas, useEtiquetasDeQueja, STATE_TONE } from '../hooks/useQuejas'
import { useGeo } from '../hooks/useGeo'
import { useCtbg } from '../hooks/useCtbg'
import { useSindicatura } from '../hooks/useSindicatura'
import { useBop, formatBopDate } from '../hooks/useBop'
import { useConsellCv } from '../hooks/useConsellCv'
import { useSindic, SINDIC_SENTIDO_LABEL, SINDIC_SENTIDO_TONE } from '../hooks/useSindic'
import { useSindicExpedientes } from '../hooks/useSindicExpedientes'
import QuejasHeatmap from '../components/QuejasHeatmap'
import QuejasSpendOverlap from '../components/Quejas/QuejasSpendOverlap'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fmtDateShort, nombreDeBarrio, porcentajeLegible, rellena } from '../lib/formatters'
import { medibilidad, registroUtilizable } from '../lib/reloj-lpacap'
import { contarConsideraciones } from '../lib/sindic-consideraciones'
import { rotuloDe, useLocale, useT } from '../i18n'
import { conHuecos } from '../lib/huecos'
import { EnBreveQuejas } from '../components/Quejas/EnBreveQuejas'
import { QuienMasVigila, QueEsLaInstitucion } from '../components/Quejas/QuienMasVigila'
import { DatosTecnicos } from '../components/Quejas/DatosTecnicos'
import DivisorLecturas from '../components/DivisorLecturas'
import { IndiceExperta } from '../components/IndiceSecciones'
import { SeccionExperta } from '../components/Lecturas'

const TELEGRAM_BOT_URL = 'https://t.me/munigraph_bot'

/** La negrita de una cifra en un párrafo atenuado: en tinta plena. */
const TINTA = { color: 'var(--ink)' }

/**
 * Escalado externo al Síndic de Greuges CV.
 *
 * Hasta 2026-08-24 esta tarjeta decía, con 0 filas en el registro curado, que
 * «aún no hay resoluciones del Síndic registradas contra el Ayuntamiento», y
 * enlazaba a /resolucions, que da 404. El registro del propio Síndic decía otra
 * cosa: 38 expedientes desde 2013. La página que existe para publicar el
 * escalado del vecino llevaba meses publicando un todo-claro.
 *
 * Ahora se pintan las dos cosas por separado, y las dos derivadas del snapshot
 * en vez de escritas a mano: lo que el Síndic REGISTRA (índice transcrito) y lo
 * que nosotros hemos FIRMADO (ficha leída del PDF, con su resumen verbatim).
 * Que la segunda cifra sea 0 es una respuesta honesta; que lo fuera la primera
 * no lo era.
 */
const MAX_EXPEDIENTES = 8

function ExpedienteRow({ e, ficha }) {
  const { t, locale } = useLocale()
  return (
    <div style={{ padding: '9px 0', borderTop: '1px dotted var(--border2)' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}
      >
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', fontWeight: 700 }}
        >
          {rellena(t('quejas.sindic.expediente'), { n: e.expediente })}
        </span>
        {/* La materia es la del registro del Síndic: dato, en su idioma. */}
        <Pill tone="ghost" size="xs">
          {e.materia}
        </Pill>
        {ficha && (
          <Pill tone={SINDIC_SENTIDO_TONE[ficha.sentido] || 'warn'} size="xs">
            {rotuloDe(
              t,
              `quejas.sindic.sentido.${ficha.sentido}`,
              SINDIC_SENTIDO_LABEL[ficha.sentido] || ficha.sentido,
            )}
          </Pill>
        )}
        {e.resoluciones.length === 0 && (
          <Pill tone="intel" size="xs">
            {t('quejas.sindic.sinResolucion')}
          </Pill>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, lineHeight: 1.4 }}>{e.asunto}</div>
      {e.resoluciones.length > 0 && (
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {e.resoluciones.map((r) => (
            <div key={r.urlPdf} style={{ fontSize: 'var(--fs-micro)' }}>
              <ExtLink href={r.urlPdf} style={{ color: 'var(--civic)' }}>
                {r.tipo}
              </ExtLink>
              <span className="mono" style={{ color: 'var(--ink50)', marginLeft: 8 }}>
                {fmtDateShort(r.fecha, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* La ficha firmada: el texto es VERBATIM de la resolución, así que se
          marca como cita y no se recorta. Va plegada porque son párrafos
          jurídicos largos y la fila de arriba ya dice de qué van. */}
      {ficha && (
        <details style={{ marginTop: 6 }}>
          <summary
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', cursor: 'pointer' }}
          >
            {t('quejas.sindic.literal')}
          </summary>
          <blockquote
            style={{
              margin: '6px 0 0',
              paddingLeft: 10,
              borderLeft: '2px solid var(--border2)',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.5,
            }}
          >
            {ficha.resumen}
          </blockquote>
        </details>
      )}
    </div>
  )
}

function SindicCard() {
  const { t, locale } = useLocale()
  const { data } = useSindicExpedientes()
  const fichas = useSindic().data?.items ?? []
  if (!data) return null

  const contra = data.contraAyuntamiento || []
  const vecinos = data.vecinosOtrasAdministraciones || []
  const s = data.stats || {}
  const cob = data.cobertura || {}
  // Por PDF, y uniendo lo que el buscador lista con lo que nuestras fichas citan:
  // el bloque `stats` del índice sólo sabe lo que el buscador lista HOY, y el
  // 18-09-2026 dejó de listar una resolución que tenemos firmada y cotejada
  // contra su PDF. Ver lib/sindic-consideraciones.
  const cons = contarConsideraciones(contra, fichas)
  const consideraciones = cons.total
  const noListadas = cons.fueraDelIndice
  const porExpediente = new Map(fichas.map((f) => [f.expediente, f]))

  return (
    <Card style={{ marginTop: 14, scrollMarginTop: 24 }} id="sindic">
      <SectionHead
        eyebrow={t('quejas.sindic.eyebrow')}
        title={t('quejas.sindic.titulo')}
        as="h3"
        size="head"
      />
      <QueEsLaInstitucion clave="sindicDeGreuges" />

      <div
        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}
      >
        <Marcado
          estilo={TINTA}
          texto={rellena(t('quejas.sindic.registra'), {
            expedientes: rellena(
              t(
                contra.length === 1 ? 'quejas.sindic.expedientes.uno' : 'quejas.sindic.expedientes',
              ),
              { n: contra.length },
            ),
            periodo:
              cob.contraAyuntamientoDesde && cob.contraAyuntamientoHasta
                ? rellena(t('quejas.sindic.periodo'), {
                    desde: cob.contraAyuntamientoDesde,
                    hasta: cob.contraAyuntamientoHasta,
                  })
                : '',
            conResolucion: s.conResolucionPublicada,
            consideraciones: consideraciones
              ? rellena(t('quejas.sindic.consideraciones'), { n: consideraciones })
              : '',
          })}
        />
      </div>

      {/* Investigada NO es lo mismo que señalada, y la distinción está medida:
          de las resoluciones de consideraciones, una va dirigida a la
          Conselleria —el ayuntamiento sólo informó como parte—, y por eso hay
          una ficha menos que resoluciones. Publicar «expedientes CONTRA el
          Ayuntamiento», como decía esta tarjeta el 24-08-2026, afirmaba más de
          lo que el registro sostiene. */}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          lineHeight: 1.5,
          marginTop: 8,
          paddingLeft: 10,
          borderLeft: '2px solid var(--border2)',
        }}
      >
        {t('quejas.sindic.investigada')}{' '}
        {fichas.length > 0 ? (
          <>
            <Marcado
              estilo={TINTA}
              texto={rellena(t('quejas.sindic.fichas'), { n: fichas.length })}
            />
            {noListadas.length > 0 && (
              <>
                {' '}
                {noListadas.length === 1
                  ? rellena(t('quejas.sindic.noListadas.una'), {
                      lista: noListadas[0].expediente,
                    })
                  : rellena(t('quejas.sindic.noListadas.varias'), {
                      n: noListadas.length,
                      lista: noListadas.map((f) => f.expediente).join(', '),
                    })}
              </>
            )}
          </>
        ) : (
          t('quejas.sindic.sinFichas')
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        {contra.slice(0, MAX_EXPEDIENTES).map((e) => (
          <ExpedienteRow key={e.expediente} e={e} ficha={porExpediente.get(e.expediente)} />
        ))}
        {contra.length > MAX_EXPEDIENTES && (
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              paddingTop: 8,
              borderTop: '1px dotted var(--border2)',
            }}
          >
            {conHuecos(rellena(t('quejas.sindic.mas'), { n: contra.length - MAX_EXPEDIENTES }), {
              '{buscador}': (
                <ExtLink href={data.source?.buscador} style={{ color: 'var(--civic)' }}>
                  {t('quejas.sindic.mas.buscador')}
                </ExtLink>
              ),
              '{fichero}': (
                <a
                  href="/data/sindic-expedientes.json"
                  style={{ color: 'var(--civic)', textDecoration: 'underline' }}
                >
                  sindic-expedientes.json
                </a>
              ),
            })}
          </div>
        )}
      </div>

      {vecinos.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border2)' }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginBottom: 6,
            }}
          >
            {t('quejas.sindic.vecinos.eyebrow')}
          </div>
          <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.5 }}>
            <Marcado
              estilo={TINTA}
              texto={rellena(t('quejas.sindic.vecinos.texto'), {
                n: vecinos.length,
                desde: cob.vecinosDesde
                  ? rellena(t('quejas.sindic.vecinos.desde'), { anio: cob.vecinosDesde })
                  : t('quejas.sindic.vecinos.ultimos'),
              })}
            />
          </div>
        </div>
      )}

      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 12 }}
      >
        {conHuecos(
          rellena(t('quejas.sindic.pie'), { fecha: fmtDateShort(data.generatedAt, locale) }),
          {
            '{enlace}': (
              <ExtLink href={data.source?.buscador} style={{ color: 'var(--civic)' }}>
                elsindic.com/actuaciones
              </ExtLink>
            ),
          },
        )}
      </div>
    </Card>
  )
}

function Findings({ f, year }) {
  const t = useT()
  const groups = []
  const idx = new Map()
  for (const d of f.deficiencies || []) {
    if (!idx.has(d.category)) {
      idx.set(d.category, groups.length)
      groups.push([d.category, []])
    }
    groups[idx.get(d.category)][1].push(d)
  }
  const liStyle = {
    fontSize: 'var(--fs-meta)',
    color: 'var(--ink70)',
    lineHeight: 1.45,
    marginBottom: 3,
  }
  const headStyle = {
    fontSize: 'var(--fs-micro)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  }
  return (
    <details style={{ marginTop: 6 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          fontWeight: 600,
        }}
      >
        {rellena(t('quejas.sindicatura.hallazgos'), {
          d: f.deficienciesCount,
          r: f.recommendationsCount,
          anios: year === 2020 ? '2017-2019' : year,
        })}
      </summary>
      <div style={{ marginTop: 6, borderLeft: '2px solid var(--border2)', paddingLeft: 10 }}>
        {/* La categoría y el texto de cada deficiencia son del informe firmado: dato. */}
        {groups.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ ...headStyle, color: 'var(--ink50)' }}>{cat}</div>
            <ul style={{ margin: '3px 0 0', paddingLeft: 18 }}>
              {items.map((d) => (
                <li key={d.n} style={liStyle}>
                  {d.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(f.recommendations || []).length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...headStyle, color: 'var(--civic)' }}>
              {t('quejas.sindicatura.recomendaciones')}
            </div>
            <ol style={{ margin: '3px 0 0', paddingLeft: 18 }}>
              {f.recommendations.map((rec) => (
                <li key={rec.n} style={liStyle}>
                  {rec.text}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 6 }}
        >
          {t('quejas.sindicatura.extraido')}
        </div>
      </div>
    </details>
  )
}

function Art218({ a }) {
  const t = useT()
  const Flag = ({ ok, notable, children }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink70)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: ok ? 'var(--ok)' : notable ? 'var(--warn)' : 'var(--ink50)',
        }}
      />
      {children}
    </span>
  )
  return (
    <div
      style={{
        margin: '4px 0 8px',
        padding: '9px 11px',
        background: 'var(--soft)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          color: 'var(--ink50)',
          marginBottom: 6,
        }}
      >
        {rellena(t('quejas.sindicatura.art218.titulo'), { ejercicio: a.ejercicio })}{' '}
        <span style={{ fontWeight: 400, textTransform: 'none' }}>
          {t('quejas.sindicatura.art218.nota')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Flag ok={a.enPlazo} notable={!a.enPlazo}>
          {a.enPlazo
            ? t('quejas.sindicatura.art218.enPlazo')
            : t('quejas.sindicatura.art218.fueraDePlazo')}
        </Flag>
        <Flag ok={!a.acr} notable={a.acr}>
          {a.acr ? t('quejas.sindicatura.art218.acr') : t('quejas.sindicatura.art218.sinAcr')}
        </Flag>
        <Flag ok={!a.ofp} notable={a.ofp}>
          {a.ofp ? t('quejas.sindicatura.art218.ofp') : t('quejas.sindicatura.art218.sinOfp')}
        </Flag>
        <Flag ok={!a.ai} notable={a.ai}>
          {a.ai ? t('quejas.sindicatura.art218.ai') : t('quejas.sindicatura.art218.sinAi')}
        </Flag>
      </div>
      <div style={{ marginTop: 6, fontSize: 'var(--fs-micro)' }}>
        <ExtLink href={a.sourceUrl} style={{ color: 'var(--civic)' }}>
          {rellena(t('quejas.sindicatura.art218.informe'), { ejercicio: a.ejercicio })}
        </ExtLink>
      </div>
    </div>
  )
}

function SindicaturaCard() {
  const { t, locale } = useLocale()
  const { data } = useSindicatura()
  if (!data) return null
  const dedicated = data.dedicated || []
  const sectoral = data.sectoral || []
  const a218 = data.art218
  const st = data.stats || {}
  const Report = ({ r, dedicatedRow }) => (
    <div key={r.id} style={{ padding: '9px 0', borderTop: '1px dotted var(--border2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', fontWeight: 700 }}
        >
          {r.year}
        </span>
        <Pill tone={dedicatedRow ? 'intel' : 'ghost'} size="xs">
          {dedicatedRow ? t('quejas.sindicatura.especifica') : t('quejas.sindicatura.sectorial')}
        </Pill>
      </div>
      {/* El título del informe es el que publica la Sindicatura: dato. */}
      <div
        style={{ fontSize: 'var(--fs-aux)', fontWeight: dedicatedRow ? 600 : 500, lineHeight: 1.4 }}
      >
        {r.title}
      </div>
      <div style={{ marginTop: 5, fontSize: 'var(--fs-micro)' }}>
        <ExtLink href={r.url} style={{ color: 'var(--civic)' }}>
          {t('quejas.sindicatura.pdf')}
        </ExtLink>
      </div>
      {r.findings && <Findings f={r.findings} year={r.year} />}
    </div>
  )
  return (
    <Card style={{ marginTop: 14, scrollMarginTop: 24 }} id="sindicatura">
      <SectionHead
        eyebrow={t('quejas.sindicatura.eyebrow')}
        title={t('quejas.sindicatura.titulo')}
        as="h3"
        size="head"
      />
      <QueEsLaInstitucion clave="sindicaturaDeComptes" />
      {dedicated.length === 0 && sectoral.length === 0 ? (
        <div
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
            marginTop: 8,
          }}
        >
          {conHuecos(t('quejas.sindicatura.vacio'), {
            '{enlace}': (
              <a
                href="https://www.sindicom.gva.es/informes"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)' }}
              >
                {t('quejas.sindicatura.vacio.enlace')}
              </a>
            ),
          })}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {/* Qué es la Sindicatura lo dice ya la línea del glosario de arriba;
              aquí había otra frase que lo repetía con otras palabras. */}
          {a218 && <Art218 a={a218} />}
          {dedicated.map((r) => (
            <Report key={r.id} r={r} dedicatedRow />
          ))}
          {sectoral.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 'var(--fs-meta)',
                  color: 'var(--civic)',
                  fontWeight: 600,
                }}
              >
                {rellena(t('quejas.sindicatura.barridos'), {
                  n: st.sectoralRelevant ?? sectoral.length,
                })}
              </summary>
              <div style={{ marginTop: 4 }}>
                {sectoral.map((r) => (
                  <Report key={r.id} r={r} dedicatedRow={false} />
                ))}
                {/* The snapshot caps the list; the count above is the full
                    total. Saying "28" and listing 15 without a word reads as a
                    rendering bug or a silent omission. */}
                {st.sectoralRelevant > sectoral.length && (
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 6 }}
                  >
                    {rellena(t('quejas.sindicatura.mostrando'), {
                      n: sectoral.length,
                      total: st.sectoralRelevant,
                    })}
                  </div>
                )}
              </div>
            </details>
          )}
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 8 }}
          >
            {conHuecos(
              rellena(t('quejas.sindicatura.pie'), {
                n: st.dedicated ?? dedicated.length,
                menciones: st.sectoralTotal ?? 0,
                fecha: fmtDateShort(data.generatedAt, locale),
              }),
              {
                '{enlace}': (
                  <a
                    href="https://www.sindicom.gva.es"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--civic)' }}
                  >
                    sindicom.gva.es
                  </a>
                ),
              },
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function ConsellCvCard() {
  const { t, locale } = useLocale()
  const { data } = useConsellCv()
  if (!data) return null
  const { stats, matched } = data
  const when = fmtDateShort(data.generatedAt, locale)
  // «Desestimatoria» CONTAINS «estimatoria», so testing the shorter pattern
  // first matched both and made the branch below it unreachable: a REJECTED
  // appeal would render in the colour that means the council was found wrong.
  // The negative case is tested first because it is the longer word — the same
  // longest-match-wins rule canonicalizeDepartment uses, for the same reason.
  const sentidoColor = (s) => {
    if (/desestimat/i.test(s)) return 'var(--ok)'
    if (/estimat/i.test(s)) return 'var(--warn)'
    return 'var(--ink50)'
  }
  return (
    <Card style={{ marginTop: 14, scrollMarginTop: 24 }} id="consell-transparencia">
      <SectionHead
        eyebrow={t('quejas.consell.eyebrow')}
        title={t('quejas.consell.titulo')}
        as="h3"
        size="head"
      />
      <QueEsLaInstitucion clave="consellDeTransparencia" />
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {t('quejas.vigilan.registro')}
          </div>
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-head)', fontWeight: 700, marginTop: 2 }}
          >
            {stats.totalEntries.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {rellena(t('quejas.consell.resoluciones'), { n: stats.years.length })}
          </div>
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {t('quejas.consell.contra')}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-head)',
              fontWeight: 800,
              marginTop: 2,
              // Variantes -ink: a 18 px, aunque vaya en 800, WCAG sigue
              // considerándolo texto pequeño —su umbral de negrita es 18,66 px—
              // y --ok daba 3,3:1 sobre blanco. La regla del repo dice «tonos
              // base sólo en ≥18px/bold»; esta cifra cae justo en ese hueco.
              color: stats.matchedEntries > 0 ? 'var(--crit-ink)' : 'var(--ok-ink)',
            }}
          >
            {stats.matchedEntries}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {stats.matchedEntries === 0
              ? t('quejas.consell.sinReclamaciones')
              : rellena(t('quejas.vigilan.sentidos'), {
                  n: Object.keys(stats.bySentido).length,
                })}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {conHuecos(rellena(t('quejas.vigilan.comprobado'), { fecha: when }), {
            '{enlace}': (
              <ExtLink
                href={data.source?.portal || 'https://conselltransparencia.gva.es'}
                style={{ color: 'var(--civic)' }}
              >
                conselltransparencia.gva.es
              </ExtLink>
            ),
          })}
        </div>
      </div>
      {/* Motivo, sentido y materia son del registro del Consell: dato. */}
      {matched && matched.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matched.slice(0, 10).map((m, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px dotted var(--border2)' }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', fontWeight: 700 }}
              >
                {rellena(t('quejas.consell.fila'), {
                  numero: m.numero,
                  expediente: m.expediente,
                  fecha: m.fecha,
                })}
              </div>
              <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, marginTop: 2 }}>
                {m.motivo || '—'}
              </div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
              >
                <span style={{ color: sentidoColor(m.sentido), fontWeight: 600 }}>{m.sentido}</span>
                {m.materia && <> · {m.materia}</>}
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.matchedEntries === 0 && (
        <div
          style={{
            marginTop: 12,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.55,
          }}
        >
          {t('quejas.consell.cero')}
        </div>
      )}
    </Card>
  )
}

function CtbgCard() {
  const { t, locale } = useLocale()
  const { data } = useCtbg()
  if (!data) return null
  const { stats, matched } = data
  const when = fmtDateShort(data.generatedAt, locale)
  return (
    <Card style={{ marginTop: 14, scrollMarginTop: 24 }} id="ctbg">
      <SectionHead
        eyebrow={t('quejas.ctbg.eyebrow')}
        title={t('quejas.ctbg.titulo')}
        as="h3"
        size="head"
      />
      <QueEsLaInstitucion clave="ctbg" />
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {t('quejas.vigilan.registro')}
          </div>
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-head)', fontWeight: 700, marginTop: 2 }}
          >
            {stats.totalEntries.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {rellena(t('quejas.ctbg.resoluciones'), { n: stats.years.length })}
          </div>
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {t('quejas.ctbg.mencionan')}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-head)',
              fontWeight: 800,
              marginTop: 2,
              // Variantes -ink: a 18 px, aunque vaya en 800, WCAG sigue
              // considerándolo texto pequeño —su umbral de negrita es 18,66 px—
              // y --ok daba 3,3:1 sobre blanco. La regla del repo dice «tonos
              // base sólo en ≥18px/bold»; esta cifra cae justo en ese hueco.
              color: stats.matchedEntries > 0 ? 'var(--crit-ink)' : 'var(--ok-ink)',
            }}
          >
            {stats.matchedEntries}
          </div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {stats.matchedEntries === 0
              ? t('quejas.ctbg.sinResoluciones')
              : rellena(t('quejas.vigilan.sentidos'), {
                  n: Object.keys(stats.bySentido).length,
                })}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {conHuecos(rellena(t('quejas.vigilan.comprobado'), { fecha: when }), {
            '{enlace}': (
              <ExtLink href={data.source?.url} style={{ color: 'var(--civic)' }}>
                {t('quejas.ctbg.xlsx')}
              </ExtLink>
            ),
          })}
        </div>
      </div>
      {/* Resolución, mes, asunto, sentido y organismo son del registro del CTBG: dato. */}
      {matched && matched.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matched.slice(0, 5).map((m, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px dotted var(--border2)' }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', fontWeight: 700 }}
              >
                {m.resolucion} · {m.mesResolucion} {m.sheetYear}
              </div>
              <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 500, marginTop: 2 }}>
                {m.asunto}
              </div>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
              >
                {m.sentido} · {m.organismo}
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.matchedEntries === 0 && (
        <div
          style={{
            marginTop: 12,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.55,
          }}
        >
          <Marcado texto={t('quejas.ctbg.cero')} />
        </div>
      )}
    </Card>
  )
}

/**
 * «El plazo legal corre desde el registro…», con su enlace a la metodología. La
 * pintan el estado vacío y el panel con quejas: en una sola clave, para que las
 * dos digan lo mismo.
 */
function PlazoDesdeRegistro({ style }) {
  const t = useT()
  return (
    <p style={style}>
      {conHuecos(t('quejas.plazo.desdeRegistro'), {
        '{enlace}': (
          <a href="/metodologia#camino-de-una-queja" style={{ color: 'var(--civic)' }}>
            {t('quejas.plazo.metodologia')}
          </a>
        ),
      })}
    </p>
  )
}

function EmptyState() {
  const t = useT()
  // Las órdenes del bot (`/queja`, `/apoyar`) son las que el bot entiende: no se traducen.
  const orden = (texto) => <code>{texto}</code>
  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Pill tone="civic" size="xs">
            {t('quejas.empty.pill')}
          </Pill>
          <Pill tone="ghost" size="xs">
            Telegram · SQLite · Open311
          </Pill>
        </div>
        <SectionHead eyebrow={t('quejas.empty.eyebrow')} title={t('quejas.empty.title')} />
        <div
          style={{
            fontSize: 'var(--fs-body)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
            marginTop: 8,
          }}
        >
          <p>
            {conHuecos(t('quejas.empty.canal'), {
              '{bot}': (
                <a
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--civic)' }}
                >
                  @munigraph_bot
                </a>
              ),
            })}
          </p>
          <p>
            <Marcado texto={t('quejas.empty.publica')} />
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow={t('quejas.como.eyebrow')} title={t('quejas.como.titulo')} />
        <ol
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            marginTop: 8,
            lineHeight: 1.6,
            paddingLeft: 20,
          }}
        >
          <li>
            <MarcadoConHuecos
              texto={t('quejas.como.presenta')}
              huecos={{ '{orden}': orden('/queja') }}
            />
          </li>
          <li>
            <Marcado texto={t('quejas.como.revisa')} />
          </li>
          <li>
            <MarcadoConHuecos
              texto={t('quejas.como.apoyan')}
              huecos={{ '{orden}': orden('/apoyar Q-XXXX') }}
            />
          </li>
          <li>
            <Marcado texto={t('quejas.como.lote')} />
          </li>
          <li>
            <Marcado texto={t('quejas.como.plazo')} />
          </li>
          <li>
            <Marcado texto={t('quejas.como.silencio')} />
          </li>
        </ol>
        {/* La línea que faltaba: el panel publica plazos y silencios y ninguna
            página decía desde cuándo cuentan. El camino entero, y sus límites,
            vive en el contrato publicado; aquí sólo se enlaza. */}
        <PlazoDesdeRegistro
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            marginTop: 8,
            lineHeight: 1.6,
          }}
        />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow={t('quejas.contrato.eyebrow')} title={t('quejas.contrato.titulo')} />
        <div
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          <ul style={{ paddingLeft: 20 }}>
            <li>
              <Marcado texto={t('quejas.contrato.publicamos')} />
            </li>
            <li>{t('quejas.contrato.noPublicamos')}</li>
            <li>{t('quejas.contrato.plazos')}</li>
            <li>
              {conHuecos(t('quejas.contrato.ver'), {
                '{metodologia}': (
                  <a href="/metodologia#grupo-quejas" style={{ color: 'var(--civic)' }}>
                    {t('quejas.contrato.metodologia')}
                  </a>
                ),
                '{aviso}': (
                  <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                    {t('quejas.contrato.aviso')}
                  </a>
                ),
              })}
            </li>
          </ul>
        </div>
      </Card>
    </>
  )
}

function StatCard({ label, value, tone = 'neutral', sub }) {
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'civic'
            ? 'var(--civic)'
            : 'var(--ink)'
  return (
    <Card>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 800,
          color,
          marginTop: 4,
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </Card>
  )
}

function DashboardView({ data }) {
  const t = useT()
  const etiqueta = useEtiquetasDeQueja()
  // El nombre del barrio, el de OSM: el slug capitalizado perdía acentos y
  // cedillas (`nombreDeBarrio`). El mapa de esta página ya pide geo.json.
  const barrios = useGeo().data?.neighborhoods
  const items = data.items || []
  const stats = data.stats || { total: 0, byState: {}, byNeighborhood: {}, byCategory: {} }

  const resueltas = stats.byState.resuelta || 0
  const silencios = (stats.byState.silencio_negativo || 0) + (stats.byState.escalada_sindic || 0)
  const pendientes =
    (stats.byState.capturada || 0) +
    (stats.byState.apoyada_verificada || 0) +
    (stats.byState.registrada || 0) +
    (stats.byState.notificada_10d || 0) +
    (stats.byState.en_tramite || 0)

  // Resueltas y silencios son respuestas del ayuntamiento, y sólo puede darlas
  // —o callar— desde que la queja entra en su registro. La regla vive en
  // lib/reloj-lpacap y la usan /cargos, los barrios y /departamentos. Aquí había
  // una copia que contaba `registered_at` sin mirar si el listado estaba entero,
  // y las resueltas se dividían entre TODAS las quejas: «0% del total» antes de
  // que el ayuntamiento hubiera recibido ninguna.
  const reloj = medibilidad(data, () => true)
  const registradas = items.filter((q) => registroUtilizable(q.registered_at)).length
  const sobreRegistradas = rellena(
    t(registradas === 1 ? 'quejas.cifras.sobreRegistradas.una' : 'quejas.cifras.sobreRegistradas'),
    { n: registradas },
  )
  const motivo = reloj.medible ? null : t(`quejas.reloj.${reloj.motivo}.corto`)

  const sortedCats = Object.entries(stats.byCategory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const sortedNeigh = Object.entries(stats.byNeighborhood || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return (
    <>
      <QuejasHeatmap />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <StatCard
          label={t('quejas.cifras.total')}
          value={stats.total}
          sub={t('quejas.cifras.total.sub')}
        />
        <StatCard
          label={t('quejas.cifras.resueltas')}
          value={reloj.medible ? resueltas : '—'}
          tone={reloj.medible ? 'ok' : 'ghost'}
          sub={
            reloj.medible
              ? `${porcentajeLegible(resueltas, registradas)}% · ${sobreRegistradas}`
              : motivo
          }
        />
        <StatCard
          label={t('quejas.cifras.pendientes')}
          value={pendientes}
          tone="civic"
          sub={t('quejas.cifras.pendientes.sub')}
        />
        <StatCard
          label={t('quejas.cifras.silencios')}
          value={reloj.medible ? silencios : '—'}
          tone={reloj.medible ? 'warn' : 'ghost'}
          sub={
            reloj.medible
              ? rellena(t('quejas.cifras.silencios.sub'), { sobre: sobreRegistradas })
              : motivo
          }
        />
      </div>
      {/* Lo que explica el «—» de ahí arriba, dicho donde se lee: el plazo no
          corre desde que la queja se publica, sino desde que entra en el
          registro del ayuntamiento. La primera versión de esta línea vivía
          sólo en el estado vacío, que con una queja publicada no se pinta: el
          navegador lo enseñó y la suite no. El camino entero vive en el
          contrato publicado; aquí sólo se enlaza. */}
      <PlazoDesdeRegistro
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          lineHeight: 1.6,
          margin: '-6px 0 18px',
        }}
      />

      <QuejasSpendOverlap />

      {/* El `min(…, 100%)` es para la columna que queda sola: sin él conservaba
          sus 280 px en una caja de 272 (320 px de pantalla). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Card>
          <SectionHead
            eyebrow={t('quejas.categorias.eyebrow')}
            title={t('quejas.categorias.titulo')}
          />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedCats.length === 0 && (
              <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>—</div>
            )}
            {sortedCats.map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 'var(--fs-aux)' }}>
                  {etiqueta.categoria(cat)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-meta)',
                    color: 'var(--ink50)',
                    minWidth: 24,
                    textAlign: 'right',
                  }}
                >
                  {n}
                </span>
                <div
                  style={{
                    width: 80,
                    height: 6,
                    background: 'var(--border2)',
                    borderRadius: 'var(--r-pill)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (n / Math.max(...sortedCats.map((c) => c[1]))) * 100)}%`,
                      height: '100%',
                      background: 'var(--civic)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHead eyebrow={t('quejas.barrios.eyebrow')} title={t('quejas.barrios.titulo')} />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedNeigh.length === 0 && (
              <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>—</div>
            )}
            {sortedNeigh.map(([slug, n]) => (
              <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 'var(--fs-aux)' }}>
                  {nombreDeBarrio(slug, barrios)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-meta)',
                    color: 'var(--ink50)',
                    minWidth: 24,
                    textAlign: 'right',
                  }}
                >
                  {n}
                </span>
                <div
                  style={{
                    width: 80,
                    height: 6,
                    background: 'var(--border2)',
                    borderRadius: 'var(--r-pill)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (n / Math.max(...sortedNeigh.map((c) => c[1]))) * 100)}%`,
                      height: '100%',
                      background: 'var(--ok)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHead eyebrow={t('quejas.recientes.eyebrow')} title={t('quejas.recientes.titulo')} />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
              {t('quejas.recientes.vacio')}
            </div>
          )}
          {items.slice(0, 30).map((it) => (
            <Link
              key={it.service_request_id}
              to={`/quejas/${it.service_request_id.toLowerCase()}`}
              // La rejilla vive en `index.css` (`.cp-queja-fila`): necesita un
              // punto de ruptura para partirse en el móvil, y una @media no cabe
              // en el prop `style`.
              className="cp-queja-fila"
              style={{
                padding: '10px 0',
                borderBottom: '1px dotted var(--border2)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                {it.service_request_id}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--fs-aux)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.description}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                >
                  {etiqueta.categoria(it.service_code)}
                  {it.address_string ? ` · ${nombreDeBarrio(it.address_string, barrios)}` : ''}
                  {it.concejalia_area ? ` · ${it.concejalia_area}` : ''}
                </div>
              </div>
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', textAlign: 'right' }}
              >
                👍 {it.apoyos}
              </span>
              <ShareWA
                text={`${rellena(t('quejas.compartir'), {
                  id: it.service_request_id,
                  categoria: etiqueta.categoria(it.service_code),
                })}\n${it.description.slice(0, 140)}`}
                url={`https://civicpulse.es/quejas/${it.service_request_id.toLowerCase()}`}
              />
              <Pill tone={STATE_TONE[it.status] || 'ghost'} size="xs">
                {etiqueta.estado(it.status)}
              </Pill>
            </Link>
          ))}
        </div>
      </Card>
    </>
  )
}

function BopCard() {
  const { t, locale } = useLocale()
  const { data } = useBop()
  if (!data) return null
  const anuncios = (data.anuncios || []).slice(0, 6)
  const covered = data.stats?.daysCovered ?? null
  const requested = data.stats?.daysRequested ?? null
  const when = fmtDateShort(data.generatedAt, locale)
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead eyebrow={t('quejas.bop.eyebrow')} title={t('quejas.seccion.bop')} />
      {anuncios.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          {/* The window we ASKED for and the window we actually read are not the
              same number — 21 of 30 bulletins loaded on the current snapshot —
              and saying "in the last 30 days" implies we looked at all 30. */}
          {covered != null && requested != null && covered < requested
            ? rellena(t('quejas.bop.vacio.parcial'), { leidos: covered, pedidos: requested })
            : t('quejas.bop.vacio')}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {anuncios.map((a, i) => (
            <div
              key={a.id}
              style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
            >
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 2 }}
              >
                {formatBopDate(a.date, locale)} · Reg. {a.regNumber}
              </div>
              {/* El título del anuncio es el del boletín: dato. */}
              <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, lineHeight: 1.35 }}>
                <ExtLink href={a.pdfUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {a.title}
                </ExtLink>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {conHuecos(rellena(t('quejas.bop.pie'), { n: data.stats?.total ?? 0, fecha: when }), {
          '{enlace}': (
            <ExtLink href={data.source?.home} style={{ color: 'var(--civic)' }}>
              {t('quejas.bop.oficial')}
            </ExtLink>
          ),
        })}
      </div>
    </Card>
  )
}

export default function Quejas() {
  const t = useT()
  useDocumentTitle(t('quejas.title'))
  const { loading, error, data } = useQuejas()

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('quejas.eyebrow')}
        </div>
        <h1
          style={{
            fontSize: 'var(--fs-page)',
            fontWeight: 700,
            letterSpacing: '-.015em',
            margin: '2px 0 0',
          }}
        >
          {t('quejas.title')}
        </h1>
        <div
          style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 4, maxWidth: 620 }}
        >
          {/* Decía «Feed agregado y anónimo — base legal LPACAP + Ley 19/2013.
              Dashboard analítico →», escrito aquí y en castellano también con la
              interfaz en valencià. El enlace lleva el nombre de la página a la
              que va. */}
          {conHuecos(t('quejas.intro'), {
            '{bot}': (
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)' }}
              >
                @munigraph_bot
              </a>
            ),
            '{panel}': (
              <Link
                to="/quejas/dashboard"
                style={{
                  color: 'var(--civic)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                {t('quejas.intro.panel')}
              </Link>
            ),
          })}
        </div>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label={t('nav.quejas')} />
        </div>
      </div>

      {/* Las dos lecturas (auditoría de las dos lecturas, §18): arriba, cómo
          quejarse, el plazo dibujado y qué pasa si no contestan; debajo del
          divisor, todo lo que esta página ya tenía. */}
      <EnBreveQuejas bot={TELEGRAM_BOT_URL} />
      <DivisorLecturas />
      <IndiceExperta />

      {/* Las tres secciones de abajo son las que pliega «Ver: lo esencial»
          (components/Lecturas.jsx). Los datos técnicos ya van plegados en su
          propio <details>. */}
      <SeccionExperta
        id="quejas-canal"
        titulo={t('quejas.seccion.publicadas')}
        style={{ scrollMarginTop: 24 }}
      >
        {loading && (
          <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
            {t('quejas.cargando')}
          </div>
        )}
        {error && (
          <Card>
            <div style={{ color: 'var(--warn-ink)', fontSize: 'var(--fs-aux)' }}>
              {/* La ruta del fichero va en su hueco: escrita en la cadena valenciana,
                  «quejas» dejaría de contar como palabra castellana en todo el sitio. */}
              {rellena(t('quejas.error'), { fichero: '/data/quejas.json' })}
            </div>
          </Card>
        )}
        {!loading && !error && data && (data.stats?.total ?? 0) === 0 && <EmptyState />}
        {!loading && !error && data && (data.stats?.total ?? 0) > 0 && (
          <DashboardView data={data} />
        )}
      </SeccionExperta>
      {/* Primero a quién puede acudir un vecino —el Síndic con cualquier queja,
          el Consell con una petición de información—; luego el órgano estatal,
          que dice adónde no ir, y la Sindicatura, que audita las cuentas. */}
      <SeccionExperta id="quejas-vigilancia" titulo={t('quejas.vigilan.titulo')}>
        <QuienMasVigila>
          <SindicCard />
          <ConsellCvCard />
          <CtbgCard />
          <SindicaturaCard />
        </QuienMasVigila>
      </SeccionExperta>
      <SeccionExperta id="quejas-bop" titulo={t('quejas.seccion.bop')}>
        <BopCard />
      </SeccionExperta>
      {data && <DatosTecnicos data={data} />}
    </div>
  )
}

import { Link, useParams } from 'react-router-dom'
import { Card, ExtLink, Pill, SectionHead, ShareWA } from '../components/Primitives'
import { useQuejas, useQuejaResponses, STATE_TONE } from '../hooks/useQuejas'
import { useGeo } from '../hooks/useGeo'
import {
  useQuejaContractRelations,
  useQuejaRelationApprovals,
  relationsForQueja,
} from '../hooks/useQuejaContractRelations'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import {
  entero,
  fmtDateHuman,
  fmtDateLong,
  nombreDeBarrio,
  rellena,
  truncateAtWord,
} from '../lib/formatters'
import { conHuecos } from '../lib/huecos'
import { rotuloDe, useLocale } from '../i18n'
import { CLAVE_RELACION } from '../scraper/relation-labels'
import {
  diaDeLaSede,
  instanteUtc,
  plazoDeResolucion,
  relojDelPlazo,
  ZONA_DE_LA_SEDE,
} from '../scraper/queja-router'
import { DEPARTMENT_LABEL } from '../scraper/departments'
import { caminoDeLaQueja } from '../scraper/camino-de-la-queja'

const SINDIC_PORTAL = 'https://www.elsindic.com/es/presenta-una-queja'

/**
 * Fecha y hora de la sede, no las del reloj de quien lee: una respuesta aplicada
 * a las 23:45 UTC es de la 00:45 del día siguiente en Riba-roja, y en UTC o en
 * Nueva York salía con el día anterior.
 */
function fmt(iso, idioma) {
  const instante = instanteUtc(iso ?? '')
  if (Number.isNaN(instante)) return '—'
  return new Date(instante).toLocaleString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    timeZone: ZONA_DE_LA_SEDE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * El día de la sede en que cae una marca del bot, en letra.
 *
 * `fmtDateLong` hacía `new Date(marca)`, que lee la forma de SQLite —hora UTC sin
 * zona— en hora LOCAL, y pintaba el día del reloj de quien lee: con el reloj en
 * Madrid, la ficha fechaba el 20 de septiembre una queja enviada a la 00:30 del
 * 21. El día sale de `diaDeLaSede`, y `fmtDateHuman` lo escribe sin volver a
 * pasarlo por ningún reloj: una fecha sin hora la lee como medianoche local.
 */
function fmtDate(iso, idioma) {
  return fmtDateHuman(diaDeLaSede(iso), idioma) || '—'
}

/**
 * El plazo máximo de resolución, leído del enrutador y no copiado de él.
 *
 * Esto eran dos números a mano —30 y 90— que repetían los de `profileFor`, y
 * además los daban por días cuando la norma los fija en MESES: art. 21.3
 * LPACAP «tres meses», art. 20 de la Ley 19/2013 «un mes». El art. 30.4 manda
 * contar los meses de fecha a fecha, así que tres meses duran 90 o 91 días
 * según cuándo empiecen y el contador se desviaba por ahí.
 *
 * Devuelve las dos cosas porque la ficha necesita las dos: el plazo se PUBLICA
 * en meses, que es lo que dice la ley, y se CUENTA en los días que de verdad
 * tiene esa queja.
 *
 * Y se cuenta con la cuenta del enrutador, en días del calendario de la sede
 * hasta el final del último. Aquí se restaban tandas de 24 horas desde la marca
 * leída en hora local: registrada a las 00:30 del 31 de enero en Madrid, el 30
 * de abril —su último día— decía que quedaba uno, y el 1 de mayo, ya vencido,
 * que quedaban cero.
 *
 * `reloj` es el de `relojDelPlazo`: el último día ya prorrogado si caía en
 * inhábil (art. 30.5), o `sin-calendario` si acaba en un año cuyo calendario de
 * inhábiles no está, y entonces no hay cuenta que pintar.
 */
function plazoFor(category, registeredAt) {
  const limite = plazoDeResolucion(category)
  return { limite, reloj: relojDelPlazo(limite, registeredAt) }
}

/** «3 meses» / «1 mes», con el catálogo poniendo las palabras. */
function plazoHumano(t, limite) {
  return limite.amount === 1
    ? t('quejas.detalle.reloj.mes')
    : rellena(t('quejas.detalle.reloj.meses'), { n: limite.amount })
}

/**
 * Un paso del camino de la queja (`caminoDeLaQueja`). Lo hecho lleva su fecha
 * —«—» cuando no se sabe— y el punto lleno de su tono; lo que toca, «Ahora» y un
 * anillo; lo que falta, «Pendiente», el punto hueco y el texto en gris. Las
 * frases de lo que falta van en letra de texto: el detalle en mono es para los
 * datos de lo ocurrido (un asiento, un artículo).
 */
function PasoItem({ paso, label, tone = 'neutral', detail, idioma, t }) {
  const hecho = paso.estado === 'hecho'
  const ahora = paso.estado === 'ahora'
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'civic'
            ? 'var(--civic)'
            : 'var(--ink50)'
  return (
    <div
      data-paso={paso.clave}
      data-estado={paso.estado}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 12px 1fr',
        gap: 12,
        alignItems: 'flex-start',
        padding: '10px 0',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: ahora ? 'var(--civic)' : 'var(--ink50)',
          fontWeight: ahora ? 700 : 400,
        }}
      >
        {hecho
          ? fmtDate(paso.fecha, idioma)
          : ahora
            ? t('quejas.detalle.camino.ahora')
            : t('quejas.detalle.camino.pendiente')}
      </div>
      <div style={{ position: 'relative', height: '100%' }}>
        <div
          style={{
            boxSizing: 'border-box',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hecho ? color : ahora ? 'var(--civic)' : 'transparent',
            border: hecho || ahora ? 'none' : '1.5px solid var(--ink50)',
            boxShadow: ahora ? '0 0 0 3px var(--civic-soft)' : 'none',
            position: 'absolute',
            top: 6,
            left: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 16,
            bottom: -10,
            left: 3.5,
            width: 1,
            background: 'var(--border2)',
          }}
        />
      </div>
      <div>
        <div
          style={{
            fontSize: 'var(--fs-aux)',
            fontWeight: ahora ? 600 : 500,
            color: hecho || ahora ? 'var(--ink)' : 'var(--ink50)',
          }}
        >
          {label}
        </div>
        {detail && (
          <div
            className={hecho ? 'mono' : undefined}
            style={{
              fontSize: hecho ? 'var(--fs-micro)' : 'var(--fs-meta)',
              color: 'var(--ink50)',
              marginTop: 2,
              lineHeight: 1.45,
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

function CorrelationsCard({ quejaId }) {
  const { locale, t } = useLocale()
  const { data } = useQuejaContractRelations()
  const { data: approvals } = useQuejaRelationApprovals()
  const barrios = useGeo().data?.neighborhoods
  const items = relationsForQueja(data, quejaId, approvals?.approvals)
  if (items.length === 0) return null
  return (
    <Card style={{ marginTop: 14, borderLeft: '3px solid var(--intel)' }}>
      <SectionHead
        eyebrow={t('quejas.detalle.relacion.eyebrow')}
        title={t('quejas.detalle.relacion.titulo')}
      />
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 6,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        {conHuecos(t('quejas.detalle.relacion.nota'), {
          '{zona}': <strong>{t('quejas.detalle.relacion.zona')}</strong>,
          '{materia}': <strong>{t('quejas.detalle.relacion.materia')}</strong>,
          '{no}': <strong>{t('quejas.detalle.relacion.no')}</strong>,
        })}
      </div>
      {items.map((l, i) => {
        const place = l.signals?.place?.slug
        const dept = l.signals?.department?.slug
        // El motor guarda slugs: el lugar se escribe como en el resto de la ficha, y la
        // materia con el nombre del departamento —o de la categoría, cuando el motor cae
        // al código de la queja— en el idioma de la interfaz.
        const materia = dept
          ? (DEPARTMENT_LABEL[dept]?.[locale] ?? rotuloDe(t, `quejas.categoria.${dept}`, dept))
          : null
        return (
          <div
            key={i}
            style={{
              padding: '10px 0',
              borderTop: i === 0 ? 'none' : '1px dashed var(--border2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 4,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  padding: '1px 6px',
                  borderRadius: 'var(--r-input)',
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  fontWeight: 700,
                  background: 'var(--ok-soft)',
                  color: 'var(--ok-ink)',
                }}
                title={t('quejas.detalle.relacion.pastilla')}
              >
                {rotuloDe(
                  t,
                  `contrato.relacion.${CLAVE_RELACION[l.relationLabel]}`,
                  l.relationLabel,
                )}
              </span>
            </div>
            {/* Qué contrato es: su título, cuándo se adjudicó y por cuánto. Antes la
                tarjeta sólo decía la clase de relación y «Ver contrato», y tres
                tarjetas de la misma queja eran indistinguibles. Un enlace de un
                fichero anterior, sin estos campos, se pinta como antes. */}
            {l.tenderTitle && (
              <div
                title={l.tenderTitle}
                style={{
                  fontSize: 'var(--fs-aux)',
                  fontWeight: 600,
                  lineHeight: 1.4,
                  marginBottom: 2,
                }}
              >
                {truncateAtWord(l.tenderTitle, 140)}
              </div>
            )}
            {(l.tenderAwardDate || 'tenderAmount' in l) && (
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
              >
                {l.tenderAwardDate &&
                  rellena(t('quejas.detalle.relacion.adjudicado'), {
                    fecha: fmtDateLong(l.tenderAwardDate, locale),
                  })}
                {l.tenderAwardDate && 'tenderAmount' in l && ' · '}
                {/* La cifra no se separa de su «€»: a 375 px «89.980» quedaba al
                    final de una línea y «€ sin IVA» al principio de la otra. */}
                {'tenderAmount' in l && (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {typeof l.tenderAmount === 'number'
                      ? rellena(t('quejas.detalle.relacion.importe'), {
                          importe: entero(Math.round(l.tenderAmount)),
                        })
                      : t('quejas.detalle.relacion.importeNoPublicado')}
                  </span>
                )}
              </div>
            )}
            <div
              style={{
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                marginBottom: 4,
                lineHeight: 1.4,
              }}
            >
              {place && (
                <>
                  {t('quejas.detalle.relacion.zona')}
                  {': '}
                  <strong>{nombreDeBarrio(place, barrios)}</strong>
                </>
              )}
              {place && materia && ' · '}
              {materia && (
                <>
                  {t('quejas.detalle.relacion.materia')}
                  {': '}
                  <strong>{materia}</strong>
                </>
              )}
            </div>
            <ExtLink
              href={l.tenderPermalink}
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--civic)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {t('quejas.detalle.relacion.verContrato')}
            </ExtLink>
          </div>
        )
      })}
    </Card>
  )
}

export default function QuejaDetail() {
  const { locale, t } = useLocale()
  const { id: rawId } = useParams()
  const { loading, data } = useQuejas()
  const { data: responses } = useQuejaResponses()
  const { data: officials } = useOfficials()
  // El barrio con su nombre de OSM, como en /quejas (`nombreDeBarrio`).
  const barrios = useGeo().data?.neighborhoods

  const id = (rawId || '').toUpperCase()
  const queja = (data?.items || []).find((q) => q.service_request_id === id)
  useDocumentTitle(queja ? `${id} · ${queja.description?.slice(0, 60)}` : id)
  const qResponses = (responses?.items || []).filter((r) => r.queja_id === id)
  const concejal = officials?.officials?.find((o) => o.slug === queja?.concejal_slug)

  if (loading) {
    return (
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}
      >
        <div style={{ color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (!queja) {
    return (
      <div
        className="cp-page"
        data-no-resuelta
        style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}
      >
        <Card>
          <SectionHead
            as="h1"
            eyebrow={t('quejas.detalle.noEncontrada.eyebrow')}
            title={rellena(t('quejas.detalle.noEncontrada.titulo'), { id })}
          />
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink70)', marginTop: 8 }}>
            {t('quejas.detalle.noEncontrada.texto')}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/quejas" style={{ color: 'var(--civic)' }}>
              {t('quejas.detalle.noEncontrada.volver')}
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const category = queja.service_code
  const categoria = rotuloDe(t, `quejas.categoria.${category}`, category)
  const estado = rotuloDe(t, `quejas.estado.${queja.status}`, queja.status)
  const plazo = plazoFor(category, queja.registered_at)
  const { reloj } = plazo
  // Sin calendario del año no hay cuenta de días: ni restantes ni excedidos.
  const diasRestantes = reloj.cuenta === 'calculada' ? reloj.quedan : null
  const hayReloj = reloj.cuenta === 'calculada' || reloj.cuenta === 'sin-calendario'

  // El camino entero (auditoría de las dos lecturas, §19): lo hecho, lo que toca
  // y lo que falta, del estado que publica el bot. Las fechas sólo donde se saben
  // (`caminoDeLaQueja` dice por qué). Con un estado que no conoce, sólo el envío:
  // no se dibuja un camino que no se sabe dónde está.
  const camino = caminoDeLaQueja(queja) ?? {
    pasos: [{ clave: 'enviada', estado: 'hecho', fecha: queja.requested_datetime }],
  }
  const plazoEnLetra = plazoHumano(t, plazo.limite)
  /** Qué dice cada paso, según en qué estado esté. */
  const textoDelPaso = (paso) => {
    const hecho = paso.estado === 'hecho'
    const ahora = paso.estado === 'ahora'
    switch (paso.clave) {
      case 'enviada':
        return {
          label: t('quejas.detalle.hito.capturada'),
          detail: rellena(t('quejas.detalle.hito.capturada.detalle'), {
            barrio: nombreDeBarrio(queja.address_string, barrios) || '—',
          }),
        }
      case 'apoyos':
        return hecho
          ? {
              label: t('quejas.detalle.hito.verificada'),
              tone: 'civic',
              detail: rellena(t('quejas.detalle.hito.verificada.detalle'), { n: queja.apoyos }),
            }
          : {
              // Sin la cifra, el rótulo del estado: no se pinta «lleva 0 de 10».
              label:
                camino.apoyos == null
                  ? t('quejas.estado.capturada')
                  : rellena(t('quejas.detalle.camino.apoyos.ahora'), {
                      n: camino.apoyos,
                      umbral: camino.umbral,
                    }),
              detail: rellena(t('quejas.detalle.camino.apoyos.detalle'), {
                umbral: camino.umbral,
              }),
            }
      case 'registro':
        return hecho
          ? {
              label: t('quejas.detalle.hito.registrada'),
              tone: 'civic',
              detail: rellena(t('quejas.detalle.hito.registrada.detalle'), {
                asiento: queja.registro_entry_number || '—',
                plazo: plazoEnLetra,
              }),
            }
          : {
              label: ahora
                ? t('quejas.detalle.camino.registro.ahora')
                : t('quejas.detalle.camino.registro'),
              detail: t('quejas.detalle.camino.registro.detalle'),
            }
      case 'respuesta':
        return {
          label: t('quejas.detalle.camino.respuesta'),
          detail:
            camino.acuseDias != null
              ? rellena(t('quejas.detalle.camino.respuesta.detalle'), {
                  acuse: camino.acuseDias,
                  plazo: plazoEnLetra,
                })
              : rellena(t('quejas.detalle.camino.respuesta.detalle.transparencia'), {
                  plazo: plazoEnLetra,
                }),
        }
      case 'resuelta':
        return { label: t('quejas.detalle.hito.resuelta'), tone: 'ok' }
      case 'silencio':
        return {
          label: t('quejas.detalle.hito.silencio'),
          tone: 'warn',
          detail: t('quejas.detalle.hito.silencio.detalle'),
        }
      case 'escalado':
        if (hecho)
          return {
            label: t('quejas.detalle.hito.sindic'),
            tone: 'crit',
            detail: t('quejas.detalle.hito.sindic.detalle'),
          }
        return camino.escalado === 'consell'
          ? {
              label: ahora
                ? t('quejas.detalle.camino.consell.ahora')
                : t('quejas.detalle.camino.consell'),
            }
          : {
              label: ahora
                ? t('quejas.detalle.camino.sindic.ahora')
                : t('quejas.detalle.camino.sindic'),
              detail: t('quejas.detalle.camino.sindic.detalle'),
            }
      case 'cerrada':
        return { label: t('quejas.detalle.camino.cerrada') }
    }
  }

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <Link to="/quejas" style={{ fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
          {t('quejas.detalle.volver')}
        </Link>
      </div>

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              {rellena(t('quejas.detalle.eyebrow'), { id: queja.service_request_id })}
            </div>
            <h1
              style={{
                fontSize: 'var(--fs-card)',
                fontWeight: 700,
                letterSpacing: '-.01em',
                margin: '4px 0 0',
              }}
            >
              {queja.description.split('\n')[0].slice(0, 120)}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ShareWA
              text={`${rellena(t('quejas.detalle.compartir'), {
                id: queja.service_request_id,
                categoria,
                estado,
              })}\n${queja.description.split('\n')[0].slice(0, 140)}`}
            />
            <Pill tone={STATE_TONE[queja.status] || 'ghost'} size="xs">
              {estado}
            </Pill>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
          }}
        >
          <span>📂 {categoria}</span>
          {queja.address_string && <span>📍 {nombreDeBarrio(queja.address_string, barrios)}</span>}
          {queja.concejalia_area && <span>🏛 {queja.concejalia_area}</span>}
          <span>👍 {rellena(t('quejas.detalle.apoyos'), { n: queja.apoyos })}</span>
        </div>

        {concejal && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderTop: '1px solid var(--border2)',
            }}
          >
            {concejal.photoUrl && (
              <img
                src={concejal.photoUrl}
                alt={concejal.name}
                width={38}
                height={38}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--r-input)',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {t('quejas.detalle.responsable')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600 }}>{concejal.name}</div>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  background: partyColor(concejal.party),
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 'var(--r-pill)',
                }}
              >
                {concejal.party}
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow={t('quejas.detalle.texto.eyebrow')}
          title={t('quejas.detalle.texto.titulo')}
        />
        <div
          style={{
            fontSize: 'var(--fs-body)',
            lineHeight: 1.55,
            color: 'var(--ink70)',
            marginTop: 8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {queja.description}
        </div>
      </Card>

      {queja.photo && (
        <Card style={{ marginTop: 14 }}>
          <SectionHead
            eyebrow={t('quejas.detalle.foto.eyebrow')}
            title={t('quejas.detalle.foto.titulo')}
          />
          <figure style={{ margin: '10px 0 0' }}>
            <img
              src={queja.photo}
              alt={t('quejas.detalle.foto.alt')}
              loading="lazy"
              style={{
                width: '100%',
                maxHeight: 460,
                objectFit: 'contain',
                borderRadius: 'var(--r-card)',
                border: '1px solid var(--border)',
                background: 'var(--soft)',
              }}
            />
            <figcaption
              style={{
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink50)',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {conHuecos(t('quejas.detalle.foto.pie'), {
                '{olvidar}': <code>/olvidar {queja.service_request_id}</code>,
                '{aviso}': (
                  // Subrayado como los enlaces de `p a[href]` en index.css, que no
                  // alcanza a un <figcaption>: sólo el color lo distinguía del pie
                  // (WCAG 1.4.1, `link-in-text-block`).
                  <Link
                    to="/aviso-legal"
                    style={{
                      color: 'var(--civic)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                  >
                    {t('quejas.detalle.foto.avisoLegal')}
                  </Link>
                ),
              })}
            </figcaption>
          </figure>
        </Card>
      )}

      {/* «¿Qué puedes hacer?» era lo último de la página y es lo que un vecino
          viene a buscar: va justo debajo de la queja (auditoría de las dos
          lecturas, §19). */}
      <Card style={{ marginTop: 14 }} data-acciones="">
        <SectionHead
          eyebrow={t('quejas.detalle.acciones.eyebrow')}
          title={t('quejas.detalle.acciones.titulo')}
        />
        <ul
          style={{
            paddingLeft: 20,
            marginTop: 8,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.6,
          }}
        >
          <li>
            <strong>{t('quejas.detalle.acciones.apoyar')}</strong>{' '}
            {conHuecos(t('quejas.detalle.acciones.apoyar.texto'), {
              '{comando}': <code>/apoyar {queja.service_request_id}</code>,
            })}
          </li>
          {(queja.status === 'silencio_negativo' || queja.status === 'escalada_sindic') && (
            <li>
              <strong>{t('quejas.detalle.acciones.sindic')}</strong>{' '}
              <a
                href={SINDIC_PORTAL}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--civic)' }}
              >
                elsindic.com →
              </a>
            </li>
          )}
          <li>
            <strong>{t('quejas.detalle.acciones.responder')}</strong>{' '}
            {conHuecos(t('quejas.detalle.acciones.responder.texto'), {
              '{aviso}': (
                <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                  /aviso-legal
                </a>
              ),
            })}
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }} data-camino="">
        <SectionHead
          eyebrow={t('quejas.detalle.historial.eyebrow')}
          title={t('quejas.detalle.historial.titulo')}
        />
        <div style={{ marginTop: 10 }}>
          {camino.pasos.map((paso) => (
            <PasoItem key={paso.clave} paso={paso} {...textoDelPaso(paso)} idioma={locale} t={t} />
          ))}
        </div>
      </Card>

      {qResponses.length > 0 && (
        <Card style={{ marginTop: 14, borderLeft: '3px solid var(--civic)' }}>
          <SectionHead
            eyebrow={t('quejas.detalle.replica.eyebrow')}
            title={t('quejas.detalle.replica.titulo')}
          />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {qResponses.map((r) => (
              <div
                key={r.id}
                style={{ paddingBottom: 10, borderBottom: '1px dotted var(--border2)' }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.role} · {r.firmante} · {fmt(r.appliedAt, locale)}
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-body)',
                    marginTop: 6,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {r.text}
                </div>
                {r.source_url && (
                  <div style={{ marginTop: 6, fontSize: 'var(--fs-meta)' }}>
                    <ExtLink href={r.source_url} style={{ color: 'var(--civic)' }}>
                      {t('quejas.detalle.replica.fuente')}
                    </ExtLink>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {hayReloj && queja.status !== 'resuelta' && (
        <Card style={{ marginTop: 14 }}>
          <SectionHead
            eyebrow={t('quejas.detalle.reloj.eyebrow')}
            title={t('quejas.detalle.reloj.titulo')}
          />
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
                {t('quejas.detalle.reloj.registrada')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 2 }}>
                {fmtDate(queja.registered_at, locale)}
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
                {t('quejas.detalle.reloj.plazoMaximo')}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 2 }}>
                {plazoHumano(t, plazo.limite)}
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
                {t('quejas.detalle.reloj.ultimoDia')}
              </div>
              {/* El último día, ya prorrogado si caía en inhábil (art. 30.5). Sin el
                  calendario de su año no se sabe cuál es: se da el nominal y la regla. */}
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 2 }}>
                {reloj.cuenta === 'calculada'
                  ? fmtDateHuman(reloj.ultimoDia, locale)
                  : rellena(t('quejas.detalle.reloj.oPrimerHabil'), {
                      dia: fmtDateHuman(reloj.nominal, locale),
                    })}
              </div>
              {reloj.cuenta === 'calculada' && reloj.ultimoDia !== reloj.nominal && (
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                >
                  {rellena(t('quejas.detalle.reloj.prorrogado'), {
                    dia: fmtDateHuman(reloj.nominal, locale),
                  })}
                </div>
              )}
            </div>
            {diasRestantes != null && (
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
                  {diasRestantes >= 0
                    ? t('quejas.detalle.reloj.restantes')
                    : t('quejas.detalle.reloj.excedidos')}
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-body)',
                    fontWeight: 700,
                    marginTop: 2,
                    color:
                      diasRestantes < 0
                        ? 'var(--crit)'
                        : diasRestantes < 15
                          ? 'var(--warn)'
                          : 'var(--ok)',
                  }}
                >
                  {diasRestantes >= 0 ? diasRestantes : Math.abs(diasRestantes)}
                </div>
              </div>
            )}
            {queja.registro_entry_number && (
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
                  {t('quejas.detalle.reloj.asiento')}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 'var(--fs-aux)', fontWeight: 600, marginTop: 2 }}
                >
                  {queja.registro_entry_number}
                </div>
              </div>
            )}
          </div>
          {reloj.cuenta === 'sin-calendario' && (
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                lineHeight: 1.5,
              }}
            >
              {rellena(t('quejas.detalle.reloj.sinCalendario'), { anio: reloj.anio })}
            </p>
          )}
        </Card>
      )}

      {/* Las posibles actuaciones relacionadas, al final: son contexto, sin
          causalidad, y el camino de la queja y lo que se puede hacer van antes. */}
      <CorrelationsCard quejaId={id} />
    </div>
  )
}

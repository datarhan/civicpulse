import { useMemo } from 'react'
import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { ExtLink } from '../Primitives'
import {
  usePlenoVideos,
  usePlenoVideosRegmeet,
  indexVideosByPleno,
} from '../../hooks/usePlenoVideos'
import { ultimoPlenoEnBreve } from '../../scraper/en-breve-plenos'
import { hoyEnRibarroja } from '../../scraper/en-breve-portada'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { rotuloDe, useLocale } from '../../i18n'

/*
 * «El último pleno»: la primera capa de /plenos (auditoría de las dos
 * lecturas, §9). Lo deriva `scraper/en-breve-plenos`; aquí se eligen las
 * frases, que son plantillas del catálogo.
 *
 * La sesión es la misma que la de la portada (`ultimoPleno` sobre las filas de
 * `summarizeSessions`), y las frases de las votaciones son las suyas: las dos
 * capas no pueden contar dos cosas distintas del mismo pleno.
 *
 * «Para decidir» rotula lo que se llevó a votar, no lo que se aprobó: el
 * resultado de cada punto sólo consta en las votaciones que hemos transcrito.
 */

function lista(partes, locale) {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(partes)
}

/** Los puntos de una parte, con su etiqueta llana; el título entero en `title`. */
function Puntos({ rotulo, puntos, urgente }) {
  if (puntos.length === 0) return null
  return (
    <div className="cp-plenos-puntos">
      <h4 className="cp-plenos-puntos-rotulo">{rotulo}</h4>
      <ol>
        {puntos.map((p) => (
          <li key={p.numero}>
            <span className="mono cp-plenos-puntos-numero">{p.numero}.</span>
            {/* La marca de urgencia va fuera del texto recortado: dentro, un
                título largo la escondía detrás de los puntos suspensivos. */}
            <span>
              <span className="cp-plenos-puntos-texto" title={p.titulo}>
                {p.texto}
              </span>
              {p.urgente && <span className="cp-plenos-puntos-urgente">{urgente}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * @param {{
 *   filas: object[],
 *   agendas: { plenos?: object[] } | null,
 *   votos: { items?: object[] } | null,
 *   plenos: object | null,
 *   cobertura: { sesiones: number, total: number },
 * }} props
 */
export function EnBrevePlenos({ filas, agendas, votos, plenos, cobertura }) {
  const { t, locale } = useLocale()
  const { data: videosData } = usePlenoVideos()
  const { data: videosRegmeet, loading: videosRegmeetLoading } = usePlenoVideosRegmeet()

  // Sin las votaciones no se pinta: un `votos` que aún no ha llegado diría
  // «todavía no hemos transcrito ninguna», que puede ser falso. Igual que la
  // portada.
  const r = useMemo(
    () =>
      agendas && votos
        ? ultimoPlenoEnBreve({
            sesiones: filas,
            agendas: agendas.plenos ?? [],
            votos: votos.items ?? [],
            hoy: hoyEnRibarroja(),
          })
        : null,
    [filas, agendas, votos],
  )
  // Como en la página de la sesión: hasta que llega la instantánea de regmeet,
  // no se elige vídeo.
  const video = useMemo(
    () =>
      r && !videosRegmeetLoading
        ? indexVideosByPleno(videosData, plenos, videosRegmeet).get(r.id)
        : undefined,
    [r, videosData, plenos, videosRegmeet, videosRegmeetLoading],
  )
  if (!r) return null

  const tipo = r.tipo ? rotuloDe(t, `pleno.tipo.${r.tipo}`, null) : null
  const sesion = `/plenos/${r.id}`
  const o = r.ordenDelDia

  const partes = o
    ? [
        o.decidir.length > 0 && rellena(t('plenos.enBreve.parte.decidir'), { n: o.decidir.length }),
        o.informes.length > 0 &&
          rellena(
            t(
              o.informes.length === 1
                ? 'plenos.enBreve.parte.informes.uno'
                : 'plenos.enBreve.parte.informes',
            ),
            { n: o.informes.length },
          ),
        o.otros.length > 0 && rellena(t('plenos.enBreve.parte.otros'), { n: o.otros.length }),
        o.ruegos && t('plenos.enBreve.parte.ruegos'),
      ].filter(Boolean)
    : []

  const v = r.votos
  const desenlace = v
    ? [
        v.aprobadas > 0 &&
          rellena(
            t(
              v.aprobadas === 1
                ? 'plenos.enBreve.votos.aprobada'
                : 'plenos.enBreve.votos.aprobadas',
            ),
            { n: v.aprobadas },
          ),
        v.rechazadas > 0 &&
          rellena(
            t(
              v.rechazadas === 1
                ? 'plenos.enBreve.votos.rechazada'
                : 'plenos.enBreve.votos.rechazadas',
            ),
            { n: v.rechazadas },
          ),
        v.otras > 0 &&
          rellena(t(v.otras === 1 ? 'plenos.enBreve.votos.otra' : 'plenos.enBreve.votos.otras'), {
            n: v.otras,
          }),
      ].filter(Boolean)
    : []

  return (
    <div className="cp-plenos-en-breve">
      <EnBreve
        titulo={t('plenos.enBreve.titulo')}
        intro={t('plenos.enBreve.intro')}
        saltarA="#sesiones"
        saltarTexto={t('plenos.enBreve.saltar')}
      >
        <TarjetaEnBreve
          id="orden-del-dia"
          pregunta={t('plenos.enBreve.orden.pregunta')}
          cifra={fmtDateLong(r.fecha, locale)}
          cifraNota={
            tipo
              ? rellena(t('plenos.enBreve.tipo'), { tipo: tipo.toLocaleLowerCase(locale) })
              : undefined
          }
          frases={[
            o
              ? rellena(
                  t(
                    o.total === 1 ? 'plenos.enBreve.orden.total.uno' : 'plenos.enBreve.orden.total',
                  ),
                  { n: o.total, partes: lista(partes, locale) },
                )
              : t('landing.enBreve.pleno.sinPuntos'),
          ]}
          detalle={
            o && (
              <>
                <Puntos
                  rotulo={t('plenos.enBreve.orden.decidir')}
                  puntos={o.decidir}
                  urgente={t('plenos.enBreve.urgente')}
                />
                <Puntos
                  rotulo={t('plenos.enBreve.orden.informes')}
                  puntos={o.informes}
                  urgente={t('plenos.enBreve.urgente')}
                />
                <Puntos
                  rotulo={t('plenos.enBreve.orden.otros')}
                  puntos={o.otros}
                  urgente={t('plenos.enBreve.urgente')}
                />
              </>
            )
          }
          ancla={sesion}
          anclaTexto={t('plenos.enBreve.orden.ver')}
        />
        <TarjetaEnBreve
          id="votaciones"
          pregunta={t('plenos.enBreve.votos.pregunta')}
          cifra={v ? String(v.transcritas) : undefined}
          cifraNota={
            v
              ? t(
                  v.transcritas === 1
                    ? 'plenos.enBreve.votos.transcrita'
                    : 'plenos.enBreve.votos.transcritas',
                )
              : undefined
          }
          frases={
            v
              ? [
                  v.transcritas === 1
                    ? t('landing.enBreve.pleno.votos.una')
                    : rellena(t('landing.enBreve.pleno.votos'), { n: v.transcritas }),
                  rellena(t('plenos.enBreve.votos.desenlace'), {
                    lista: lista(desenlace, locale),
                  }),
                ]
              : [t('landing.enBreve.pleno.sinVotos')]
          }
          nota={
            v
              ? t('landing.enBreve.pleno.aviso')
              : rellena(t('plenos.enBreve.votos.cobertura'), {
                  n: cobertura.sesiones,
                  total: cobertura.total,
                })
          }
          detalle={
            video && (
              <ExtLink href={video.url} title={video.title} className="cp-plenos-en-breve-video">
                {t('plenos.enBreve.video')} ↗
              </ExtLink>
            )
          }
          salvedad={
            v && v.repartoDeTranscripcion > 0
              ? rellena(
                  t(
                    v.repartoDeTranscripcion === v.transcritas
                      ? 'plenos.enBreve.votos.reparto.todas'
                      : 'plenos.enBreve.votos.reparto',
                  ),
                  { n: v.repartoDeTranscripcion },
                )
              : undefined
          }
          ancla={sesion}
          anclaTexto={t('plenos.enBreve.votos.ver')}
        />
      </EnBreve>
    </div>
  )
}

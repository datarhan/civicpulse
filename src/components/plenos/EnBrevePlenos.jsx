import { useMemo } from 'react'
import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { TarjetaOrdenDelDia, lista } from './OrdenDelDiaEnBreve'
import { ExtLink } from '../Primitives'
import {
  usePlenoVideos,
  usePlenoVideosRegmeet,
  indexVideosByPleno,
} from '../../hooks/usePlenoVideos'
import { ultimoPlenoEnBreve, vocabularioDelOrdenDelDia } from '../../scraper/en-breve-plenos'
import { rutaDeSesion } from '../../scraper/ruta-de-sesion'
import { REGIMEN_DE_SESIONES, proximoPleno } from '../../scraper/proximo-pleno'
import { hoyEnRibarroja } from '../../scraper/en-breve-portada'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { estiloEnBrevePlenos } from './plenos.css.js'
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

/**
 * «¿Cuándo es el próximo?» Con la sesión en el índice, su fecha y su enlace.
 * Sin ella, que no la tenemos, la regla que el Pleno aprobó para el mandato
 * —enlazada al acta, en la pestaña de su transcripción— y cuántos ordinarios
 * cayeron en lunes y en el primer lunes del mes.
 */
function TarjetaProximo({ prox, sesiones }) {
  const { t, locale } = useLocale()
  const c = prox.convocado
  if (c) {
    const sesion = sesiones.find((s) => s.id === c.id)
    const tipo = c.tipo ? rotuloDe(t, `pleno.tipo.${c.tipo}`, null) : null
    return (
      <TarjetaEnBreve
        id="proximo"
        pregunta={t('plenos.enBreve.proximo.pregunta')}
        cifra={fmtDateLong(c.fecha, locale)}
        cifraNota={
          tipo
            ? rellena(t('plenos.enBreve.tipo'), { tipo: tipo.toLocaleLowerCase(locale) })
            : undefined
        }
        frases={[t('plenos.enBreve.proximo.convocado')]}
        ancla={sesion ? rutaDeSesion(sesion, sesiones) : `/plenos/${c.id}`}
        anclaTexto={t('plenos.enBreve.proximo.verSesion')}
      />
    )
  }
  const acuerdo = sesiones.find((s) => s.id === REGIMEN_DE_SESIONES.plenoId)
  return (
    <TarjetaEnBreve
      id="proximo"
      pregunta={t('plenos.enBreve.proximo.pregunta')}
      frases={[t('plenos.enBreve.proximo.sinFecha'), t('plenos.enBreve.proximo.regla')]}
      nota={
        prox.ordinarios > 0
          ? rellena(
              t(
                prox.enLunes === prox.ordinarios
                  ? 'plenos.enBreve.proximo.cuenta.todos'
                  : 'plenos.enBreve.proximo.cuenta',
              ),
              { n: prox.ordinarios, lunes: prox.enLunes, primer: prox.primerLunes },
            )
          : undefined
      }
      ancla={acuerdo ? `${rutaDeSesion(acuerdo, sesiones)}#pestana-transcripcion` : undefined}
      anclaTexto={rellena(t('plenos.enBreve.proximo.verAcuerdo'), {
        fecha: fmtDateLong(REGIMEN_DE_SESIONES.fecha, locale),
      })}
    />
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
  // «¿Cuándo es el próximo?»: la sesión desde hoy si el índice ya la tiene; si
  // no, la regla del acta de 2023 y lo que cuentan las fechas, nunca una fecha
  // deducida (`scraper/proximo-pleno`).
  const prox = useMemo(
    () => (plenos ? proximoPleno({ sesiones: plenos.items ?? [], hoy: hoyEnRibarroja() }) : null),
    [plenos],
  )
  if (!r) return null

  const tipo = r.tipo ? rotuloDe(t, `pleno.tipo.${r.tipo}`, null) : null
  const fila = filas.find((f) => f.id === r.id)
  const sesion = fila ? rutaDeSesion(fila, filas) : `/plenos/${r.id}`
  const o = r.ordenDelDia
  // Las palabras de la sede que salen en los títulos, con su definición: el
  // glosario las manda aquí, a un orden del día de verdad.
  const vocabulario = vocabularioDelOrdenDelDia(
    (agendas.plenos ?? []).find((a) => a.id === r.id)?.agenda ?? [],
  )

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
    <div className="cp-plenos-en-breve" id="ultimo-pleno">
      <style>{estiloEnBrevePlenos}</style>
      <EnBreve
        titulo={t('plenos.enBreve.titulo')}
        intro={t('plenos.enBreve.intro')}
        saltarA="#sesiones"
        saltarTexto={t('plenos.enBreve.saltar')}
      >
        <TarjetaOrdenDelDia
          id="orden-del-dia"
          pregunta={t('plenos.enBreve.orden.pregunta')}
          ordenDelDia={o}
          vocabulario={vocabulario}
          cifra={fmtDateLong(r.fecha, locale)}
          cifraNota={
            tipo
              ? rellena(t('plenos.enBreve.tipo'), { tipo: tipo.toLocaleLowerCase(locale) })
              : undefined
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
        {prox && <TarjetaProximo prox={prox} sesiones={plenos?.items ?? []} />}
      </EnBreve>
    </div>
  )
}

import { useMemo } from 'react'
import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { TarjetaOrdenDelDia } from './OrdenDelDiaEnBreve'
import {
  ordenDelDiaEnBreve,
  vocabularioDelOrdenDelDia,
  votosDeLaSesion,
  votosEnBreve,
} from '../../scraper/en-breve-plenos'
import { rellena } from '../../lib/formatters'
import { estiloEnBrevePlenos } from './plenos.css.js'
import { rotuloDe, useT } from '../../i18n'

/*
 * El «Resumen» de /plenos/:id en palabras llanas (auditoría de las dos
 * lecturas, §10). Contestaba «¿cuánto hemos procesado?» con cuatro fichas y una
 * línea de recuentos; un vecino pregunta de qué se habló y qué se votó. Esto va
 * encima, y las cifras de siempre debajo del divisor.
 *
 * - **El orden del día, con la tarjeta de /plenos** (`TarjetaOrdenDelDia`): las
 *   mismas partes, las mismas palabras y la misma regla —«para decidir» es lo
 *   que se llevó a votar, no lo que se aprobó—.
 * - **Las votaciones, sólo las transcritas.** Cada una con su etiqueta llana y
 *   su resultado; quién votó qué está en la pestaña de Votaciones, con sus
 *   fuentes, y la salvedad del reparto va en esta tarjeta, como en /plenos.
 * - **Nada se pinta hasta que llegan las dos instantáneas.** Un orden del día
 *   o unas votaciones que aún no han llegado dirían «aún no recogido» o «no
 *   hemos transcrito», que pueden ser falsos.
 *
 * Los enlaces abren la pestaña por su ancla (`#pestana-<clave>`), que
 * `PlenoDetalle` escucha.
 */

/**
 * @param {{
 *   agenda: { agenda?: object[] } | undefined,
 *   votos: object[],
 * }} props
 */
export function ResumenSesion({ agenda, votos }) {
  const t = useT()
  const puntos = agenda?.agenda
  const o = useMemo(
    () => (puntos && puntos.length > 0 ? ordenDelDiaEnBreve(puntos) : null),
    [puntos],
  )
  const vocabulario = useMemo(() => vocabularioDelOrdenDelDia(puntos ?? []), [puntos])
  const v = useMemo(() => votosEnBreve(votos), [votos])
  const filas = useMemo(() => votosDeLaSesion(votos), [votos])

  return (
    <div className="cp-plenos-en-breve">
      <style>{estiloEnBrevePlenos}</style>
      <EnBreve
        titulo={t('plenoDetail.resumen.titulo')}
        intro={t('plenoDetail.resumen.intro')}
        saltarA="#pleno-cifras"
        saltarTexto={t('plenoDetail.resumen.saltar')}
      >
        <TarjetaOrdenDelDia
          id="orden-del-dia"
          pregunta={t('plenoDetail.resumen.orden.pregunta')}
          ordenDelDia={o}
          vocabulario={vocabulario}
          ancla={o ? '#pestana-agenda' : undefined}
          anclaTexto={t('plenoDetail.resumen.orden.ver')}
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
          frases={[
            v
              ? v.transcritas === 1
                ? t('plenoDetail.resumen.votos.una')
                : rellena(t('plenoDetail.resumen.votos'), { n: v.transcritas })
              : t('plenoDetail.empty.votes'),
          ]}
          nota={v ? t('landing.enBreve.pleno.aviso') : undefined}
          detalle={
            filas.length > 0 && (
              <ol className="cp-plenos-votos">
                {filas.map((f) => (
                  <li key={f.numero}>
                    <span className="mono cp-plenos-puntos-numero">{f.numero}.</span>
                    <span>
                      <span className="cp-plenos-puntos-texto" title={f.titulo}>
                        {f.texto}
                      </span>
                      <span className="cp-plenos-votos-desenlace">
                        {rotuloDe(t, `pleno.desenlace.${f.outcome}`, f.outcome)}
                        {f.retirado && ` · ${t('plenoDetail.resumen.votos.retirado')}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
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
          ancla={v ? '#pestana-votos' : undefined}
          anclaTexto={t('plenoDetail.resumen.votos.ver')}
        />
      </EnBreve>
    </div>
  )
}

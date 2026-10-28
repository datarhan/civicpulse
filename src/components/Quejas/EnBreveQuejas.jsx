import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { ExtLink } from '../Primitives'
import { useSindic } from '../../hooks/useSindic'
import { useSindicExpedientes } from '../../hooks/useSindicExpedientes'
import { caminoDeUnaQueja, sindicEnBreve } from '../../scraper/en-breve-quejas'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale } from '../../i18n'

/*
 * La lectura vecinal de /quejas (auditoría de las dos lecturas, §18): tres
 * preguntas, el camino de una queja. Las cifras salen de
 * `scraper/en-breve-quejas` —el bot, el enrutador de quejas, el índice del
 * Síndic y las fichas que hemos firmado—; aquí sólo se eligen las frases.
 *
 * El plazo se dibuja: es la razón del canal, y la página lo decía en una frase
 * sin decir cuánto ni qué pasa al final.
 */

const estilo = `
.cp-camino-queja {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
  container: camino-queja / inline-size;
}
.cp-camino-queja li {
  position: relative;
  padding-left: 22px;
  font-size: var(--fs-aux);
  line-height: 1.4;
  color: var(--ink70);
}
.cp-camino-queja li::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 0.35em;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--civic);
}
.cp-camino-queja li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 8px;
  top: calc(0.35em + 11px);
  bottom: -12px;
  width: 1px;
  background: var(--border2);
}
.cp-camino-queja li:last-child::before { background: var(--warn); }
.cp-camino-queja strong { display: block; color: var(--ink); font-weight: 600; }
`

/** El plazo, dibujado: registro → acuse → respuesta → si no, el Síndic. */
function CaminoDeLaQueja({ c }) {
  const { t } = useLocale()
  const pasos = [
    [t('quejas.enBreve.plazo.paso.registro'), t('quejas.enBreve.plazo.paso.registro.cuando')],
    [
      t('quejas.enBreve.plazo.paso.acuse'),
      rellena(t('quejas.enBreve.plazo.paso.acuse.cuando'), { n: c.acuseDias }),
    ],
    [
      t('quejas.enBreve.plazo.paso.respuesta'),
      rellena(t('quejas.enBreve.plazo.paso.respuesta.cuando'), { n: c.meses }),
    ],
    [t('quejas.enBreve.plazo.paso.sindic'), t('quejas.enBreve.plazo.paso.sindic.cuando')],
  ]
  return (
    <ol className="cp-camino-queja" aria-label={t('quejas.enBreve.plazo.figura')}>
      {pasos.map(([que, cuando]) => (
        <li key={que}>
          <strong>{que}</strong>
          {cuando}
        </li>
      ))}
    </ol>
  )
}

/** @param {{ bot: string }} props  la dirección del bot en Telegram */
export function EnBreveQuejas({ bot }) {
  const { t, locale } = useLocale()
  const { data: indice } = useSindicExpedientes()
  const fichas = useSindic().data?.items
  const c = caminoDeUnaQueja()
  // Sin las fichas no se pinta la tercera: contaría cero recomendaciones mientras
  // llegan, y las hay.
  const s = indice && fichas ? sindicEnBreve({ indice, fichas }) : null

  return (
    <EnBreve
      titulo={t('quejas.enBreve.titulo')}
      intro={t('quejas.enBreve.intro')}
      saltarA="#quejas-canal"
      saltarTexto={t('quejas.enBreve.saltar')}
    >
      <style>{estilo}</style>
      <TarjetaEnBreve
        id="como"
        pregunta={t('quejas.enBreve.como.pregunta')}
        frases={[rellena(t('quejas.enBreve.como.frase'), { apoyos: c.apoyos })]}
        detalle={
          <ExtLink href={bot} className="cp-en-breve-ancla">
            {t('quejas.enBreve.como.bot')} ↗
          </ExtLink>
        }
        ancla="/metodologia#camino-de-una-queja"
        anclaTexto={t('quejas.enBreve.como.ver')}
      />
      <TarjetaEnBreve
        id="plazo"
        pregunta={t('quejas.enBreve.plazo.pregunta')}
        figura={<CaminoDeLaQueja c={c} />}
        frases={[rellena(t('quejas.enBreve.plazo.frase'), { meses: c.meses, dias: c.acuseDias })]}
        nota={rellena(
          t(
            c.mesesTransparencia === 1
              ? 'quejas.enBreve.plazo.transparencia.uno'
              : 'quejas.enBreve.plazo.transparencia',
          ),
          { n: c.mesesTransparencia },
        )}
        ancla="/metodologia#camino-de-una-queja"
        anclaTexto={t('quejas.enBreve.plazo.ver')}
      />
      {s && (
        <TarjetaEnBreve
          id="sindic"
          pregunta={t('quejas.enBreve.sindic.pregunta')}
          cifra={String(s.expedientes)}
          cifraNota={
            s.desde
              ? rellena(t('quejas.enBreve.sindic.cifraNota'), { desde: s.desde })
              : t('quejas.enBreve.sindic.cifraNota.sinFecha')
          }
          frases={[
            t('quejas.enBreve.sindic.frase'),
            s.recomendaciones > 0
              ? rellena(
                  t(
                    s.porFaltaDeRespuesta > 0
                      ? 'quejas.enBreve.sindic.recomendaciones'
                      : 'quejas.enBreve.sindic.recomendaciones.sinFalta',
                  ),
                  { n: s.recomendaciones, falta: s.porFaltaDeRespuesta },
                )
              : null,
          ]}
          nota={
            s.ultima
              ? rellena(t('quejas.enBreve.sindic.ultima'), {
                  fecha: fmtDateLong(s.ultima.fecha, locale),
                  titulo: s.ultima.titulo,
                })
              : undefined
          }
          ancla="#sindic"
          anclaTexto={t('quejas.enBreve.sindic.ver')}
        />
      )}
    </EnBreve>
  )
}

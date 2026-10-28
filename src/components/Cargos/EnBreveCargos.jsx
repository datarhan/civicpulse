import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import BuscadorDeTemas from './BuscadorDeTemas'
import { useDedicaciones } from '../../hooks/useDedicaciones'
import { useTemasCargos } from '../../hooks/useTemasCargos'
import { useNombresVisibles } from '../../hooks/useCompetencias'
import { quienFiscaliza, sueldosEnBreve } from '../../scraper/en-breve-cargos'
import { entero, fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale } from '../../i18n'

/*
 * La lectura vecinal de /cargos (auditoría de las dos lecturas, §3): quién
 * gobierna lo dice ya la entradilla; aquí, a quién se pregunta por un asunto,
 * cuánto cobran y quién vigila al gobierno. Las cifras salen de
 * `scraper/en-breve-cargos` —el acuerdo de retribuciones y la lista de
 * cargos—, y el buscador, del vocabulario curado (`BuscadorDeTemas`); aquí
 * sólo se eligen las frases, y cada tarjeta enlaza a la sección que lo
 * demuestra.
 *
 * Una tarjeta sin datos que la sostengan no se pinta: `sueldosEnBreve` devuelve
 * null si las cuentas no suman los escaños, y la página de abajo sigue
 * diciéndolo todo.
 */
export default function EnBreveCargos({ lista }) {
  const { t, locale } = useLocale()
  const { data: dedic } = useDedicaciones()
  const { data: vocabulario } = useTemasCargos()
  const nombresVisibles = useNombresVisibles()
  const sueldos = sueldosEnBreve(dedic, lista.count)
  const fiscalizan = quienFiscaliza(lista.officials)
  if (!sueldos && !fiscalizan && !vocabulario) return null
  const y = new Intl.ListFormat(locale === 'ca' ? 'ca' : 'es', { type: 'conjunction' })

  const notaSueldos = sueldos && [
    sueldos.fecha &&
      rellena(t('cargos.enBreve.sueldos.nota'), {
        anio: sueldos.fecha.slice(0, 4),
        fecha: fmtDateLong(sueldos.fecha, locale),
      }),
    sueldos.antiguedadDelMaximo != null &&
      rellena(t('cargos.enBreve.sueldos.antiguedad'), {
        antiguedad: entero(Math.round(sueldos.antiguedadDelMaximo)),
      }),
  ]

  const partidos =
    fiscalizan &&
    (fiscalizan.partidos.length === 1
      ? rellena(t('cargos.enBreve.fiscalizan.partido'), {
          partido: fiscalizan.partidos[0].partido,
        })
      : rellena(t('cargos.enBreve.fiscalizan.partidos'), {
          n: fiscalizan.partidos.length,
          lista: y.format(fiscalizan.partidos.map((p) => `${p.partido} (${p.escanos})`)),
        }))

  return (
    <EnBreve
      titulo={t('cargos.enBreve.titulo')}
      intro={t('cargos.enBreve.intro')}
      saltarA="#todos-los-datos"
      saltarTexto={t('cargos.enBreve.saltar')}
    >
      {vocabulario && (
        <TarjetaEnBreve
          id="buscador"
          pregunta={t('cargos.enBreve.buscador.pregunta')}
          frases={[t('cargos.enBreve.buscador.frase')]}
          detalle={
            <BuscadorDeTemas
              vocabulario={vocabulario}
              lista={lista}
              nombresVisibles={nombresVisibles}
            />
          }
          ancla="#quien-dirige"
          anclaTexto={t('cargos.enBreve.buscador.ancla')}
        />
      )}
      {sueldos && (
        <TarjetaEnBreve
          id="sueldos"
          pregunta={t('cargos.enBreve.sueldos.pregunta')}
          cifra={rellena(t('cargos.enBreve.sueldos.cifra'), {
            n: sueldos.conSueldo,
            total: lista.count,
          })}
          cifraNota={t('cargos.enBreve.sueldos.cifraNota')}
          frases={[
            rellena(t('cargos.enBreve.sueldos.frase'), {
              minimo: entero(Math.round(sueldos.minimo)),
              maximo: entero(Math.round(sueldos.maximo)),
              sin: sueldos.sinSueldo,
            }),
          ]}
          nota={notaSueldos.filter(Boolean).join(' ') || undefined}
          ancla="#retribuciones"
          anclaTexto={t('cargos.enBreve.sueldos.ancla')}
        />
      )}
      {fiscalizan && (
        <TarjetaEnBreve
          id="fiscalizan"
          pregunta={t('cargos.enBreve.fiscalizan.pregunta')}
          cifra={rellena(t('cargos.enBreve.fiscalizan.cifra'), {
            n: fiscalizan.n,
            total: lista.count,
          })}
          cifraNota={t('cargos.enBreve.fiscalizan.cifraNota')}
          frases={[t('cargos.enBreve.fiscalizan.frase'), partidos]}
          ancla="#quien-fiscaliza"
          anclaTexto={t('cargos.enBreve.fiscalizan.ancla')}
        />
      )}
    </EnBreve>
  )
}

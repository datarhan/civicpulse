import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * «¿Qué se ha contratado en mi barrio?», la pregunta con la que llega un
 * vecino de l'Oliveral o de La Reva — y la que esta página menos puede
 * contestar, porque la mayor parte del dinero municipal va a contratos para
 * todo el término que no nombran ningún sitio. Por eso el bloque empieza por
 * el límite («de cada 100 €, sólo N…») y sólo después deja elegir.
 *
 * Elegir no responde aquí: lleva al mapa de contratación de más abajo con la
 * zona abierta (`?barrio=<slug>#mapa-gasto`, que lee `GastoDashboard`), donde
 * están los contratos con su enlace a la Plataforma. Un selector y un botón,
 * no un `onChange` que navega: con el teclado, recorrer las opciones de un
 * <select> no debe sacar al lector de donde está (WCAG 3.2.2).
 *
 * «Mi barrio no aparece» tiene respuesta propia y honesta: ningún contrato lo
 * nombra, y un punto mal puesto sería peor que ninguno (el resolvedor de
 * lugares subcasa a propósito, `src/scraper/place-resolver.ts`).
 */

const OTRO = '__otro'

/** «Urbanització La Reva» se busca por «La Reva»: es como lo dice un vecino. */
const claveDeOrden = (nombre) => nombre.replace(/^Urbanitzaci[óo]n?\s+/i, '')

/**
 * @param {{
 *   cobertura: { deCada100: number, menosDeUno: boolean },
 *   zonas: { slug: string, name: string, contractCount?: number }[],
 *   figura?: import('react').ReactNode,
 *   ruta?: string,
 * }} props
 *
 * `ruta` es la página del mapa: vacía en /presupuesto, que es donde está; la
 * portada pasa `/presupuesto`, porque allí un `?barrio=…#mapa-gasto` relativo
 * se quedaba en la propia portada.
 */
export default function BarrioPicker({ cobertura, zonas, figura, ruta = '' }) {
  const t = useT()
  const navigate = useNavigate()
  const id = useId()
  const [eleccion, setEleccion] = useState('')
  const [otro, setOtro] = useState(false)

  const ordenadas = [...zonas].sort((a, b) =>
    claveDeOrden(a.name).localeCompare(claveDeOrden(b.name), 'ca'),
  )

  function ver(e) {
    e.preventDefault()
    if (eleccion === OTRO) {
      setOtro(true)
      return
    }
    setOtro(false)
    if (eleccion) navigate(`${ruta}?barrio=${encodeURIComponent(eleccion)}#mapa-gasto`)
  }

  return (
    <div className="cp-en-breve-barrio" data-en-breve="barrio">
      {figura}
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <h3 className="cp-en-breve-barrio-titulo">{t('presupuesto.enBreve.barrio.titulo')}</h3>
        <p className="cp-en-breve-barrio-frase">
          {cobertura.menosDeUno
            ? t('presupuesto.enBreve.barrio.menosDeUno')
            : rellena(t('presupuesto.enBreve.barrio.frase'), { n: cobertura.deCada100 })}
        </p>
        <form className="cp-en-breve-barrio-form" onSubmit={ver}>
          <label htmlFor={`${id}-sel`} className="cp-en-breve-barrio-label">
            {t('presupuesto.enBreve.barrio.elige')}
          </label>
          <select
            id={`${id}-sel`}
            value={eleccion}
            onChange={(e) => {
              setEleccion(e.target.value)
              if (e.target.value !== OTRO) setOtro(false)
            }}
          >
            <option value="" disabled>
              {t('presupuesto.enBreve.barrio.placeholder')}
            </option>
            {ordenadas.map((z) => (
              <option key={z.slug} value={z.slug}>
                {z.contractCount === 1
                  ? rellena(t('presupuesto.enBreve.barrio.opcion.uno'), { nombre: z.name })
                  : rellena(t('presupuesto.enBreve.barrio.opcion'), {
                      nombre: z.name,
                      n: z.contractCount ?? 0,
                    })}
              </option>
            ))}
            <option value={OTRO}>{t('presupuesto.enBreve.barrio.otro')}</option>
          </select>
          <button type="submit" className="cp-en-breve-barrio-boton" disabled={!eleccion}>
            {t('presupuesto.enBreve.barrio.ver')}
          </button>
        </form>
        {otro && (
          <div className="cp-en-breve-barrio-otro" aria-live="polite" data-barrio-otro="">
            <p style={{ margin: 0, fontWeight: 600 }}>
              {t('presupuesto.enBreve.barrio.otro.titulo')}
            </p>
            <p style={{ margin: '4px 0 0' }}>{t('presupuesto.enBreve.barrio.otro.frase')}</p>
            <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              <Link to="/quejas">{t('presupuesto.enBreve.barrio.otro.queja')}</Link>
              <a href={`${ruta}#mapa-gasto`}>{t('presupuesto.enBreve.barrio.otro.todos')}</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

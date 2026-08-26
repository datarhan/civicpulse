import { Fragment } from 'react'
import { Pill } from '../Primitives'
import { useT } from '../../i18n'
import { GLOSA_TIER } from '../../scraper/indicador-lectura'

/**
 * El tono de cada escalón, en un solo sitio.
 *
 * Vivía dentro de `ServicioCard`, así que la leyenda que explica las chapas
 * habría tenido que copiarlo — y una copia de un mapa de tonos es exactamente
 * la clase de duplicado que aquí acaba pintando la leyenda de un color y la
 * chapa de otro sin que nadie lo note.
 */
export const TIER_TONE = { input: 'ghost', carga: 'neutral', output: 'ok', outcome: 'intel' }

/** El orden en que se leen: de lo que entra a lo que se consigue. */
export const ORDEN_TIER = ['input', 'carga', 'output', 'outcome']

/**
 * Qué significan las chapas de escalón, listando SÓLO las que están en juego.
 *
 * Escribir las cuatro cuando el panel usa tres sería inventarle al lector una
 * categoría que no va a encontrar. `outcome` pasó años oculto aquí porque
 * CESEL no publica ni un indicador de resultado; desde que el panel trae
 * resultados de otras fuentes oficiales (criminalidad, del Ministerio del
 * Interior), la chapa vuelve a la leyenda cuando hay al menos uno.
 */
export function LeyendaEscalones({ indicadores = [], conResultados = false }) {
  const t = useT()
  const presentes = ORDEN_TIER.filter((tier) =>
    tier === 'outcome'
      ? conResultados
      : indicadores.some((i) => i.valor !== null && i.tier === tier),
  )
  if (presentes.length === 0) return null

  // Uno por línea, y las glosas alineadas.
  //
  // Iban en una fila que envolvía, así que las cuatro parejas se encadenaban
  // —«precio divide un gasto entre otro gasto, no mide rendimiento carga de
  // trabajo el divisor es…»— y el corte de línea caía donde tocara: la chapa de
  // un escalón acababa pegada a la glosa del anterior. Son pares término /
  // definición, así que van en <dl> y en dos columnas: las chapas en la
  // primera, las glosas empezando todas en la misma x. Es la misma forma que
  // `ComoSeLee` usa para estos mismos escalones con el texto largo.
  return (
    <dl
      style={{
        margin: '10px 0 0',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'baseline',
        gap: '6px 10px',
      }}
    >
      {presentes.map((tier) => (
        <Fragment key={tier}>
          <dt style={{ margin: 0 }}>
            <Pill tone={TIER_TONE[tier] ?? 'neutral'} size="xs">
              {t(`eficiencia.tier.${tier}`)}
            </Pill>
          </dt>
          <dd style={{ margin: 0 }}>{GLOSA_TIER[tier]}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

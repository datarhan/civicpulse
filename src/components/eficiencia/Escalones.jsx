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

  return (
    <p
      style={{
        margin: '10px 0 0',
        fontSize: 'var(--fs-meta)',
        color: 'var(--ink50)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px 8px',
      }}
    >
      {presentes.map((tier) => (
        <span key={tier} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Pill tone={TIER_TONE[tier] ?? 'neutral'} size="xs">
            {t(`eficiencia.tier.${tier}`)}
          </Pill>
          {GLOSA_TIER[tier]}
        </span>
      ))}
    </p>
  )
}

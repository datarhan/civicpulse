// @ts-check
import { useMemo } from 'react'
import { useT } from '../../../i18n'
import { useGeo } from '../../../hooks/useGeo'
import { useQuejas } from '../../../hooks/useQuejas'
import { computePerNeighborhood, healthFromCounts } from '../../../lib/neighborhood-aggregate'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 'var(--r-input)',
  padding: '7px 9px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  width: 200,
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
}

// The four health levels from lib/neighborhood-aggregate healthFromCounts, in
// severity order. Swatch colours match the Circle fills exactly.
// `level` es el que devuelve `healthFromCounts`, no una etiqueta nueva: así la
// leyenda y la capa no pueden discrepar sobre qué color es cuál.
const LEVELS = [
  { level: 'crit', color: '#DC2626', labelKey: 'map.quejas.crit' },
  { level: 'warn', color: '#D97706', labelKey: 'map.quejas.warn' },
  { level: 'ok', color: '#16A34A', labelKey: 'map.quejas.ok' },
  { level: 'civic', color: '#60A5FA', labelKey: 'map.quejas.civic' },
]

/**
 * Legend for the quejas heat layer.
 *
 * Solía pintar la escala ENTERA, con este argumento escrito aquí: así un vecino
 * puede descifrar cualquier color que vea en el mapa. El argumento es bueno y el
 * resultado era falso — medido el 5-09-2026, la capa pinta UN barrio con UNA
 * queja, en el nivel `civic`. Los otros tres niveles no aparecen ni pueden
 * aparecer, y «radio ∝ nº de quejas» no codifica nada cuando sólo hay un
 * círculo: una leyenda de cuatro niveles sobre un punto promete una lectura de
 * severidad que no existe.
 *
 * Se DERIVA de lo que la capa pinta, con el mismo `computePerNeighborhood` y el
 * mismo `healthFromCounts` que usa `QuejasLayer`, así que no pueden discrepar. Y
 * el argumento original se conserva entero: todo color que esté en el mapa está
 * en la leyenda, porque la leyenda sale de los colores del mapa. Lo que
 * desaparece es la promesa de los que no están.
 *
 * Con la escala incompleta se dice que lo está, y cuántas quejas la sostienen.
 * Es la regla del mapa aplicada a su leyenda: una capa que enseña una fracción
 * de su dominio lo dice.
 */
export function QuejasLegend() {
  const t = useT()
  const { data: geo } = useGeo()
  const { data: quejas } = useQuejas()
  const pintados = useMemo(
    () => computePerNeighborhood(quejas?.items ?? [], geo?.neighborhoods),
    [quejas, geo?.neighborhoods],
  )
  const nivelesPintados = useMemo(() => {
    const s = new Set(
      pintados.map((n) => healthFromCounts(n.total, n.resueltas, n.silencios).level),
    )
    return LEVELS.filter((l) => s.has(l.level))
  }, [pintados])
  const totalQuejas = pintados.reduce((n, x) => n + x.total, 0)
  // Sin nada pintado la capa devuelve null y esto no llega a verse; aun así, no
  // se inventa una escala sobre cero.
  const niveles = nivelesPintados.length > 0 ? nivelesPintados : LEVELS
  const escalaParcial = nivelesPintados.length > 0 && nivelesPintados.length < LEVELS.length
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{t('map.quejas.title')}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {niveles.map(({ color, labelKey }) => (
          <div
            key={labelKey}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-micro)' }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: color,
                border: '1px solid #0B0F19',
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: 'rgba(11,15,25,.75)' }}>{t(labelKey)}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 'var(--fs-micro)',
          color: 'rgba(11,15,25,.62)',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {/* Cuántas quejas sostienen la escala. Derivado, no escrito. */}
        {t('map.quejas.cobertura')
          .replace('{q}', String(totalQuejas))
          .replace('{b}', String(pintados.length))}
        {/* El radio sólo codifica algo cuando hay más de un círculo que comparar. */}
        {pintados.length > 1 ? ` · ${t('map.quejas.radius')}` : ''}
        {escalaParcial ? ` · ${t('map.quejas.escalaParcial')}` : ''}
      </div>
    </div>
  )
}

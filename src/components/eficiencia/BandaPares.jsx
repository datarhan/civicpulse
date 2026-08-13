import { useT } from '../../i18n'

/**
 * Dónde queda el municipio entre sus pares, como banda intercuartílica con
 * marcador propio — nunca como «puesto 31 de 47».
 *
 * Un ranking es una tabla de clasificación con otro nombre, y este panel se
 * diseñó explícitamente para no publicar una. La banda dice lo que se puede
 * decir con honestidad (aquí está el grueso de los municipios comparables, y
 * aquí estás tú) sin sugerir que la diferencia entre el puesto 30 y el 31 sea
 * un hecho.
 *
 * El desglose de municipios se publica igualmente: son cifras oficiales, y
 * esconder CONTRA QUIÉN se compara rompería el contrato de mostrar el trabajo.
 * Va sin ordenar por valor, para que se lea como tabla de referencia.
 *
 * Accesibilidad: la posición NO puede quedar codificada sólo por color ni sólo
 * por geometría — el valor y el percentil van como texto en el DOM, que es lo
 * que un lector de pantalla y la pasada axe encuentran.
 */
export function BandaPares({ indicador, formatea }) {
  const t = useT()
  const p = indicador.pares
  if (!p || indicador.valor === null) return null

  const valores = p.miembros.map((m) => m.valor)
  const min = Math.min(...valores, indicador.valor)
  const max = Math.max(...valores, indicador.valor)
  const span = max - min || 1
  const pos = (v) => `${((v - min) / span) * 100}%`

  return (
    <div style={{ marginTop: 12 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        {t('eficiencia.pares.titulo')} · n={p.n}
      </div>

      <div
        style={{
          position: 'relative',
          height: 26,
          marginTop: 8,
          borderRadius: 'var(--r-input)',
          background: 'var(--bg2, rgba(127,127,127,.12))',
        }}
        role="img"
        aria-label={`${formatea(indicador.valor)}; mediana de ${p.n} municipios comparables ${formatea(p.mediana)}; percentil ${p.percentil}`}
      >
        {/* p25–p75: el grueso del grupo */}
        <div
          style={{
            position: 'absolute',
            left: pos(p.p25),
            width: `calc(${pos(p.p75)} - ${pos(p.p25)})`,
            top: 0,
            bottom: 0,
            background: 'var(--civic)',
            opacity: 0.18,
            borderRadius: 'var(--r-input)',
          }}
        />
        {/* mediana */}
        <div
          style={{
            position: 'absolute',
            left: pos(p.mediana),
            top: 2,
            bottom: 2,
            width: 2,
            background: 'var(--ink50, rgba(127,127,127,.6))',
          }}
        />
        {/* el municipio */}
        <div
          style={{
            position: 'absolute',
            left: pos(indicador.valor),
            top: -2,
            bottom: -2,
            width: 3,
            background: 'var(--civic)',
            borderRadius: 'var(--r-input)',
          }}
        />
      </div>

      <div
        className="mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 5,
        }}
      >
        <span>p25 {formatea(p.p25)}</span>
        <span>
          mediana {formatea(p.mediana)} · Riba-roja {formatea(indicador.valor)} (percentil{' '}
          {p.percentil})
        </span>
        <span>p75 {formatea(p.p75)}</span>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
          {t('eficiencia.pares.ver')}
        </summary>
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '8px 0' }}>
          {t('eficiencia.pares.nota')}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--fs-meta)', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink50)' }}>
                <th style={{ padding: '4px 10px 4px 0' }}>{t('eficiencia.pares.municipio')}</th>
                <th style={{ padding: '4px 10px 4px 0' }}>{t('eficiencia.pares.poblacion')}</th>
                <th style={{ padding: '4px 0' }}>{t('eficiencia.pares.valor')}</th>
              </tr>
            </thead>
            <tbody>
              {p.miembros.map((m) => (
                <tr key={m.ine}>
                  <td style={{ padding: '3px 10px 3px 0' }}>{m.nombre}</td>
                  <td className="mono" style={{ padding: '3px 10px 3px 0', color: 'var(--ink50)' }}>
                    {m.poblacion ? m.poblacion.toLocaleString('es-ES') : '—'}
                  </td>
                  <td className="mono" style={{ padding: '3px 0' }}>
                    {formatea(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

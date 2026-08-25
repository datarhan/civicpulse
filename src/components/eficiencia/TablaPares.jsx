import { useT } from '../../i18n'

/**
 * Contra quién se compara, municipio a municipio.
 *
 * Sobrevive intacta a `BandaPares`, de donde sale: la geometría de aquel
 * componente mentía —escalaba la tira a los valores, no al percentil— pero
 * esta tabla no. Publicar el desglose es parte del contrato de mostrar el
 * trabajo: son cifras oficiales, y esconder contra quién se compara dejaría el
 * percentil sin nada detrás.
 *
 * Va sin ordenar por valor, a propósito, para que se lea como tabla de
 * referencia y no como una clasificación con otro nombre.
 */
export function TablaPares({ pares, formatea }) {
  const t = useT()
  if (!pares?.miembros?.length) return null

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-meta)', color: 'var(--civic)' }}>
        {t('eficiencia.pares.ver')}
      </summary>
      <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '8px 0' }}>
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
            {pares.miembros.map((m) => (
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
  )
}

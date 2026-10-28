import { useLocale } from '../../i18n'
import { fmtDateLong, rellena } from '../../lib/formatters'

/**
 * La fecha de la copia, la fuente y el formato del canal, al pie de /quejas.
 *
 * Vivían al final del feed como «Snapshot: … · Fuente: CivicPulse bot ·
 * Telegram capture · Formato: Open311 GeoReport v2 (extended)»: una línea para
 * quien reutiliza los datos, en medio de lo que lee un vecino (auditoría de las
 * dos lecturas, §18). Aquí siguen, plegadas, con el fichero entero al lado. El
 * nombre de la fuente y el formato son los del fichero, tal cual; el que falta
 * no se pinta, en vez de dejar «Fuente: » con nada detrás.
 */
export function DatosTecnicos({ data }) {
  const { t, locale } = useLocale()
  const partes = [
    data.generatedAt &&
      rellena(t('quejas.datosTecnicos.copia'), { fecha: fmtDateLong(data.generatedAt, locale) }),
    data.source?.platform &&
      rellena(t('quejas.datosTecnicos.fuente'), { fuente: data.source.platform }),
    data.source?.spec && rellena(t('quejas.datosTecnicos.formato'), { formato: data.source.spec }),
  ].filter(Boolean)
  return (
    <details
      data-datos-tecnicos=""
      style={{ marginTop: 28, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ink70)' }}>
        {t('quejas.datosTecnicos.rotulo')}
      </summary>
      <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
        {partes.map((p) => `${p} · `).join('')}
        {t('quejas.datosTecnicos.fichero')}{' '}
        <a href="/data/quejas.json" style={{ color: 'var(--civic)' }}>
          quejas.json
        </a>
      </p>
    </details>
  )
}

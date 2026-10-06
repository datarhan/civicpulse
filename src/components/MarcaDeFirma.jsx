import { useT } from '../i18n'
import { tramoDeFirma } from '../lib/atribucion-firmada'

/**
 * «firmado» junto al grupo de una declaración cuando ese grupo lo firmó una
 * persona (tras escuchar la sesión o, si no, diciéndolo en su motivo), con el
 * tramo en el título. Sin
 * firma, nada: el grupo lo puso el mapa de voces y no hay más que decir.
 *
 * Lo pintan /declaraciones y el registro de /plenos/:id, cada uno con su estilo
 * de rótulo; la regla de cuándo y qué es una sola.
 */
export function MarcaDeFirma({ claim, style }) {
  const t = useT()
  const tramo = tramoDeFirma(claim)
  if (!tramo) return null
  return (
    <span title={t('ledger.firmadoTitulo').replace('{tramo}', tramo)} style={style}>
      {t('ledger.firmado')}
    </span>
  )
}

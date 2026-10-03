import { useTenders } from '../hooks/useTenders'
import { necesitaPuente, puenteDeImporte, textoDelPuente } from '../scraper/importe-de-contrato'

/**
 * La línea que cuadra la cifra de una fila CONTRATO con la cifra citada,
 * cuando son dos importes distintos del mismo expediente
 * (src/scraper/importe-de-contrato.ts).
 *
 * Se monta en dos pasos para que el `tenders.json` —1,4 MB— sólo se pida
 * donde hay dos cifras que cuadrar: sin ellas, `necesitaPuente` corta antes
 * de llegar al hook. Lo lee del snapshot servido y compartido por la sesión,
 * como `RefList` en las fichas de hallazgos, así que un puente no se queda
 * rancio: si el expediente cambia, la línea cambia o desaparece con él.
 */
export function PuenteDeImporte({ cifra, evidencia }) {
  if (!necesitaPuente(cifra, evidencia)) return null
  return <PuenteConContratos cifra={cifra} evidencia={evidencia} />
}

function PuenteConContratos({ cifra, evidencia }) {
  const { data } = useTenders()
  const puente = puenteDeImporte(cifra, evidencia, data)
  if (!puente) return null
  return (
    <div
      data-puente-importe=""
      style={{
        fontSize: 'var(--fs-meta)',
        color: 'var(--ink70)',
        lineHeight: 1.5,
        padding: '0 0 4px',
        maxWidth: '68ch',
      }}
    >
      {textoDelPuente(puente)}
    </div>
  )
}

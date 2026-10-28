import { useLocale } from '../../i18n'
import { eurosExactos, rellena } from '../../lib/formatters'
import { infoLote } from '../../lib/tender-lotes'

// El presupuesto base va al CÉNTIMO (`eurosExactos`) y nunca en compacto:
// existe para que el lector lo case con lo que va a leer en PLACSP —«53.409,63
// Euros»—, y un «53 mil €» no se casa con nada.

/**
 * La línea que dice por qué el enlace de esta fila enseña otra cifra.
 *
 * El enlace de un lote NO lleva al lote: lleva a la ficha del expediente
 * entero, que titula el presupuesto base de todos los lotes juntos. El
 * 16-09-2026 la portada publicaba «UE casco 5 · 6.900 €» y «UE vella 6 ·
 * 20.251 €» con el MISMO enlace, el del expediente 106/2025, cuya única cifra
 * visible es 53.409,63 €; el 18-10 /presupuesto publicaba «Accesorios ·
 * 46.020 €» enlazando al 23/2020, cuya cifra es 187.000,00 €. Todas eran
 * ciertas y ninguna decía de qué era. Vive aquí, y no en cada listado, para que
 * el siguiente que pinte contratos no tenga que volver a descubrirlo.
 *
 * `grupos` tiene que salir de TODOS los contratos, no de los filtrados: con la
 * búsqueda puesta en el nombre de un lote, ese lote se queda sin hermanas en la
 * lista y el aviso desaparecería justo cuando el lector lo está mirando.
 *
 * El total de lotes sale del `numberOfBatches` de la licitación homónima —la
 * fuente declarándolo—, nunca de cuántas filas tengamos: un denominador que no
 * se puede ver no se escribe (`infoLote`).
 *
 * @param {{contract: any, grupos: Map<string, any[]>, tenders?: any[], color: string, style?: object}} props
 */
export default function NotaDeLote({ contract, grupos, tenders, color, style }) {
  const { t } = useLocale()
  const lote = infoLote(contract, grupos, tenders)
  if (!lote) return null
  const exp = lote.expediente ? ` (${lote.expediente})` : ''
  // Cada rama nombra SU clave junto a los huecos que rellena, en vez de elegir
  // una clave en una variable: así lo ve el guard de
  // `tests/i18n-catalogue.test.ts`, que lee el objeto pegado al literal para
  // comprobar que ningún `{hueco}` llega al lector. Con la clave en una
  // variable el guard no puede leerlo y se pone rojo, que es justo lo que tiene
  // que hacer un guard que no puede mirar.
  const texto =
    lote.numero && lote.total && lote.presupuestoBase
      ? rellena(t('landing.contratos.lote.conBase'), {
          n: lote.numero,
          total: lote.total,
          exp,
          base: eurosExactos(lote.presupuestoBase),
        })
      : lote.numero && lote.total
        ? rellena(t('landing.contratos.lote.deTotal'), {
            n: lote.numero,
            total: lote.total,
            exp,
          })
        : lote.numero
          ? rellena(t('landing.contratos.lote.simple'), { n: lote.numero, exp })
          : rellena(t('landing.contratos.lote.sinNumero'), { exp })
  return (
    <div
      className="cp-lote-nota"
      style={{ fontSize: 'var(--fs-micro)', color, lineHeight: 1.35, ...style }}
    >
      {texto}
    </div>
  )
}

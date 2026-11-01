import { useId, useState } from 'react'
import { useT } from '../../i18n'
import { rellena } from '../../lib/formatters'
import { DefinicionGlosario, FraseConTerminos } from '../Termino'

/*
 * Cuántas correcciones lleva una pieza publicada: en su ficha de la portada
 * (`ReportajeBlockD`) y en la de /reportajes. Se dice fuera de la pieza porque
 * quien no la abre también tiene que saber que el registro se enmendó.
 *
 * Fue un rótulo rojo en mayúsculas, «9 CORRECCIONES PUBLICADAS», y un vecino lo
 * leía como «esta pieza se equivocó nueve veces» (auditoría «dos lecturas»,
 * 25-10-2026). Unas correcciones arreglan errores y otras precisan una frase o
 * añaden lo que faltaba; el número es el registro que llevamos. Así que va en
 * tono neutro, como frase, y «correcciones publicadas» abre su entrada del
 * glosario (el botón abarca las dos palabras: «publicada», suelta, se lee igual
 * en valencià).
 *
 * Devuelve la etiqueta y, debajo, la definición abierta: en la ficha de
 * /reportajes las dos caen en una fila flexible (`.cp-rj-pie`), y la definición
 * ocupa la fila entera (`.cp-correcciones-def`).
 */
export default function ChipCorrecciones({ n }) {
  const t = useT()
  const [abierto, setAbierto] = useState(null)
  const idPanel = `${useId()}-def`
  if (!n) return null
  const frase = rellena(t(n === 1 ? 'reportajes.correcciones.una' : 'reportajes.correcciones'), {
    n,
  })
  return (
    <>
      <span className="cp-correcciones" data-correcciones="">
        <FraseConTerminos frase={frase} abierto={abierto} onAbrir={setAbierto} idPanel={idPanel} />
      </span>
      {abierto && (
        <DefinicionGlosario
          clave={abierto}
          id={idPanel}
          onCerrar={() => setAbierto(null)}
          className="cp-correcciones-def"
        />
      )}
    </>
  )
}

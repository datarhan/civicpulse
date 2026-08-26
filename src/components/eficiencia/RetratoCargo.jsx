/**
 * El retrato de un cargo, con su ausencia contemplada.
 *
 * Existe por dos motivos y ninguno es estético.
 *
 * El primero: `src/` pinta ya cinco retratos de cargo —`/cargos`,
 * `/cargos/:slug`, `/departamentos/:slug`, `/quejas/:id` y la columna editorial
 * de la portada— con cuatro radios distintos y dos convenios de `alt`, y sólo
 * UNO de los cinco tiene respaldo cuando no hay foto. Añadir un sexto en línea
 * habría sido empeorar eso.
 *
 * El segundo, que es el que manda: **la ausencia es una promesa publicada**.
 * `/aviso-legal` dice que un cargo puede pedir «la eliminación de su fotografía
 * concreta manteniendo el resto del registro (nombre, concejalía)». Así que la
 * rama sin foto no es un caso de borde: es el sitio donde esa promesa se
 * cumple, y tiene que dejar la tarjeta correcta y no un hueco ni un icono roto.
 * Hoy las veintiuna fichas del padrón traen foto, o sea que los datos NO
 * ejercitan esta rama — por eso se prueba a mano poniendo `fotoRetirada` en una
 * fila, y por eso las iniciales están aquí y no en un `onError`.
 *
 * `alt=""` a propósito: el nombre va al lado y es un enlace. Un `alt` con el
 * nombre haría que un lector de pantalla lo dijera dos veces seguidas. Es el
 * mismo criterio que `/departamentos/:slug`.
 *
 * Y NO va envuelto en su propio `<a href="/cargos/…">`: el nombre de al lado ya
 * es ese enlace, y un segundo ancla al mismo destino duplicaría el recuento de
 * `loreg-freeze.spec.ts`, que cuenta enlaces a `/cargos/` para saber cuántos
 * cargos nombra una página. Dejaría de significar «uno por cargo nombrado».
 */
export function RetratoCargo({ foto, nombre, tamano = 52 }) {
  const caja = {
    width: tamano,
    height: tamano,
    borderRadius: '50%',
    flexShrink: 0,
  }

  if (foto) {
    return (
      <img
        src={foto}
        alt=""
        width={tamano}
        height={tamano}
        style={{ ...caja, objectFit: 'cover', border: '1px solid var(--border)' }}
      />
    )
  }

  // Las iniciales, que es el respaldo de `OfficialCard` en /cargos — el único
  // de los cinco sitios que hoy tiene uno de verdad.
  const iniciales = (nombre ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase()

  return (
    <div
      aria-hidden="true"
      style={{
        ...caja,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--soft)',
        color: 'var(--ink50)',
        fontSize: 'var(--fs-head)',
        fontWeight: 700,
        border: '1px solid var(--border)',
      }}
    >
      {iniciales}
    </div>
  )
}
